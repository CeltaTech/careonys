-- EL INCIDENTE DE RELEVO: QUIÉN LO RESOLVIÓ, CON QUIÉN Y SIN MANDAR A NADIE A DOS CASAS
-- =====================================================================================
--
-- Cuatro cosas, y las cuatro las hace cumplir la base, no la pantalla:
--
-- 1. QUIÉN LO RESOLVIÓ QUEDA ESCRITO SOLO. La columna nueva la llena el disparador con la persona
--    de la sesión en el momento en que el incidente pasa a resuelto. Lo que mande el pedido no
--    cuenta. Sin persona —el trabajo automático que lo cierra al terminar el turno— queda vacía,
--    y eso es justamente lo que dice: no lo resolvió nadie.
--
-- 2. EL TIPO DE REEMPLAZO NO SE ELIGE: SALE DE A QUIÉN SE MANDÓ. Quien está anotado como franquero
--    o como personal de emergencia es eso; cualquier otro del Padrón es suplente. Y el Asistente
--    anotado tiene que ser el que hoy tiene el turno, para que el registro no diga una cosa y la
--    guardia otra.
--
-- 3. DOS FORMAS MÁS DE TERMINAR. «paciente_solo»: el Cliente aceptó que el Paciente quedara sin
--    Asistente. «nadie»: el turno terminó y no fue nadie. Ninguna de las dos nombra a un Asistente.
--
-- 4. NADIE VA A DOS CASAS A LA VEZ. Reasignar por emergencia rechaza a quien a esa hora ya tiene
--    otro turno.
--
-- Una vez resuelto, el incidente no se reescribe: quién, cuándo y cómo quedan como quedaron.

-- ---------------------------------------------------------------------------------------------
-- 1 y 3. Columnas y reglas de la tabla
-- ---------------------------------------------------------------------------------------------

ALTER TABLE public.incidentes_relevo
  ADD COLUMN resuelto_por_usuario uuid REFERENCES public.usuarios(id);

ALTER TABLE public.incidentes_relevo DROP CONSTRAINT incidentes_relevo_resuelto_por_tipo_check;
ALTER TABLE public.incidentes_relevo DROP CONSTRAINT incidentes_relevo_resuelto_por_check;

ALTER TABLE public.incidentes_relevo
  ADD CONSTRAINT incidentes_relevo_resuelto_por_tipo_check
  CHECK (resuelto_por_tipo = ANY (ARRAY['suplente', 'franquero', 'emergencia', 'familiar', 'paciente_solo', 'nadie']));

-- Nombra a un Asistente exactamente cuando fue un Asistente.
ALTER TABLE public.incidentes_relevo
  ADD CONSTRAINT incidentes_relevo_resuelto_por_check
  CHECK ((resuelto_por_id IS NOT NULL) = (resuelto_por_tipo IN ('suplente', 'franquero', 'emergencia')));

-- ---------------------------------------------------------------------------------------------
-- 1 y 2. El disparador que firma la resolución
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION interno.el_relevo_se_resuelve_como_paso()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_asistente_del_turno uuid;
BEGIN
  -- Ya resuelto: queda como quedó.
  IF OLD.resuelto_at IS NOT NULL THEN
    NEW.resuelto_at := OLD.resuelto_at;
    NEW.resuelto_por_tipo := OLD.resuelto_por_tipo;
    NEW.resuelto_por_id := OLD.resuelto_por_id;
    NEW.resuelto_por_usuario := OLD.resuelto_por_usuario;
    RETURN NEW;
  END IF;

  IF NEW.resuelto_at IS NULL THEN
    NEW.resuelto_por_tipo := NULL;
    NEW.resuelto_por_id := NULL;
    NEW.resuelto_por_usuario := NULL;
    RETURN NEW;
  END IF;

  NEW.resuelto_por_usuario := interno.usuario_de_la_sesion();

  IF NEW.resuelto_por_id IS NOT NULL THEN
    SELECT g.asistente_id INTO v_asistente_del_turno
      FROM guardias g
     WHERE g.id = NEW.guardia_entrante_id
       AND g.prestadora_id = NEW.prestadora_id;
    IF v_asistente_del_turno IS DISTINCT FROM NEW.resuelto_por_id THEN
      RAISE EXCEPTION 'relevo_con_otro_asistente' USING ERRCODE = '23514';
    END IF;

    NEW.resuelto_por_tipo := coalesce(
      (SELECT pe.tipo
         FROM personal_emergencia pe
        WHERE pe.asistente_id = NEW.resuelto_por_id
          AND pe.prestadora_id = NEW.prestadora_id
          AND pe.activo
        ORDER BY (pe.tipo = 'franquero') DESC
        LIMIT 1),
      'suplente');
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION interno.el_relevo_se_resuelve_como_paso() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.el_relevo_se_resuelve_como_paso() TO authenticated, trabajo_sin_persona;

CREATE TRIGGER el_relevo_se_resuelve_como_paso
  BEFORE UPDATE ON public.incidentes_relevo
  FOR EACH ROW EXECUTE FUNCTION interno.el_relevo_se_resuelve_como_paso();

-- ---------------------------------------------------------------------------------------------
-- 4. Nadie va a dos casas a la vez
-- ---------------------------------------------------------------------------------------------

-- Mira todas las guardias del Asistente en la Prestadora de la sesión, también las que quien
-- pregunta no ve: un Coordinador no ve los turnos de otro Servicio, y justamente ése es el que
-- se pisaría. Contesta sí o no y nada más.
CREATE OR REPLACE FUNCTION interno.asistente_ocupado_entre(
  p_asistente uuid,
  p_guardia_excluida uuid,
  p_desde timestamp,
  p_hasta timestamp
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM guardias g
     WHERE g.prestadora_id = interno.prestadora_actual()
       AND g.asistente_id = p_asistente
       AND g.id <> p_guardia_excluida
       AND g.estado NOT IN ('cancelada', 'ausente')
       AND (g.fecha + g.hora_inicio) < p_hasta
       AND (interno.dia_en_que_termina_guardia(g.fecha, g.hora_inicio, g.hora_fin, g.dias_hasta_el_fin) + g.hora_fin) > p_desde
  );
$function$;

REVOKE ALL ON FUNCTION interno.asistente_ocupado_entre(uuid, uuid, timestamp, timestamp) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.asistente_ocupado_entre(uuid, uuid, timestamp, timestamp) TO authenticated;

CREATE OR REPLACE FUNCTION public.reasignar_guardia_por_emergencia(p_guardia_id uuid, p_asistente_id uuid, p_motivo text, p_motivo_excepcion text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid;
  v_usuario    uuid;
  v_motivo     text := btrim(COALESCE(p_motivo, ''));
  v_guardia    record;
  v_tocadas    integer;
BEGIN
  -- La Prestadora y la persona salen de la sesión, nunca del pedido. Sin persona no hay a quién
  -- atribuirle el cambio, y no se hace.
  v_prestadora := interno.prestadora_actual();
  v_usuario := interno.usuario_de_la_sesion();
  IF v_prestadora IS NULL OR v_usuario IS NULL THEN
    RAISE EXCEPTION 'reasignacion_sin_sesion' USING ERRCODE = '42501';
  END IF;

  IF p_guardia_id IS NULL OR p_asistente_id IS NULL OR v_motivo = '' THEN
    RAISE EXCEPTION 'reasignacion_incompleta' USING ERRCODE = '23514';
  END IF;

  -- La lectura pasa por la RLS de quien pide.
  SELECT g.id, g.asistente_id, g.estado, g.checkin_at, g.fecha, g.hora_inicio, g.hora_fin,
         g.dias_hasta_el_fin, g.paciente_id, g.servicio_id
    INTO v_guardia
    FROM public.guardias g
   WHERE g.id = p_guardia_id
     AND g.prestadora_id = v_prestadora
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reasignacion_sin_guardia' USING ERRCODE = '42501';
  END IF;

  IF v_guardia.estado <> 'ausente' OR v_guardia.checkin_at IS NOT NULL
     OR v_guardia.asistente_id IS NOT DISTINCT FROM p_asistente_id THEN
    RAISE EXCEPTION 'guardia_empezada_no_cambia_de_asistente' USING ERRCODE = '23514';
  END IF;

  IF interno.asistente_ocupado_entre(
       p_asistente_id,
       p_guardia_id,
       v_guardia.fecha + v_guardia.hora_inicio,
       interno.dia_en_que_termina_guardia(v_guardia.fecha, v_guardia.hora_inicio, v_guardia.hora_fin, v_guardia.dias_hasta_el_fin) + v_guardia.hora_fin
     ) THEN
    RAISE EXCEPTION 'asistente_en_otro_turno' USING ERRCODE = '23514';
  END IF;

  PERFORM interno.excepcion_por_documentos(
    v_prestadora,
    p_guardia_id,
    p_asistente_id,
    interno.documentos_que_bloquean(
      p_asistente_id,
      interno.dia_en_que_termina_guardia(v_guardia.fecha, v_guardia.hora_inicio, v_guardia.hora_fin, v_guardia.dias_hasta_el_fin),
      v_guardia.paciente_id,
      v_guardia.servicio_id
    ),
    p_motivo_excepcion
  );

  PERFORM set_config('careonys.reasignacion_por_emergencia', p_guardia_id::text, true);

  INSERT INTO public.auditoria_reasignaciones_por_emergencia
    (prestadora_id, guardia_id, usuario_id, asistente_anterior_id, asistente_nuevo_id, motivo)
  VALUES
    (v_prestadora, p_guardia_id, v_usuario, v_guardia.asistente_id, p_asistente_id, v_motivo);

  -- Quien la cubre entra ahora: el turno vuelve a esperar su check-in.
  UPDATE public.guardias
     SET asistente_id = p_asistente_id,
         estado = 'programada'
   WHERE id = p_guardia_id
     AND prestadora_id = v_prestadora;
  GET DIAGNOSTICS v_tocadas = ROW_COUNT;

  PERFORM set_config('careonys.reasignacion_por_emergencia', '', true);

  IF v_tocadas = 0 THEN
    RAISE EXCEPTION 'reasignacion_sin_guardia' USING ERRCODE = '42501';
  END IF;
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- Qué Servicios coordina quien inició sesión
-- ---------------------------------------------------------------------------------------------

-- El Panel lo pregunta para saber a quién mostrarle «Resolver». Corre con los permisos de quien
-- llama y no recibe a nadie: contesta por la sesión, con la misma regla que usan las políticas,
-- también cuando cubre a otro Coordinador que está ausente.
CREATE OR REPLACE FUNCTION public.servicios_que_coordino()
RETURNS uuid[]
LANGUAGE sql
STABLE
SET search_path TO 'public', 'interno'
AS $function$
  SELECT coalesce(array_agg(s.id), '{}'::uuid[])
    FROM servicios s
   WHERE s.prestadora_id = interno.prestadora_actual()
     AND s.coordinador_id = ANY (interno.coordinadores_que_represento());
$function$;

REVOKE ALL ON FUNCTION public.servicios_que_coordino() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.servicios_que_coordino() TO authenticated;

NOTIFY pgrst, 'reload schema';
