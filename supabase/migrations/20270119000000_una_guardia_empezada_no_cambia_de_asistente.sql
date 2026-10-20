-- Una guardia empezada no cambia de Asistente, ni de día, ni de horario, salvo una emergencia.
--
-- Una guardia está empezada cuando tiene el check-in, o cuando su estado ya no es uno de los que
-- se dan antes de empezar: programada, pausada o cancelada. Activa, ausente y completada son
-- guardias empezadas. Un estado que no está en esa lista se trata como empezado.
--
-- 1. El disparador `guardia_empezada_no_cambia_de_asistente` rechaza en una guardia empezada todo
--    cambio de `asistente_id`, `fecha`, `hora_inicio` u `hora_fin`.
--
-- 2. La única excepción es la emergencia que ya existe en el producto: el turno empezó, el
--    Asistente no llegó (la guardia está `ausente`) y otro lo cubre. Ese cambio pasa solamente por
--    `public.reasignar_guardia_por_emergencia`, que pide el motivo, cambia sólo el Asistente y
--    deja registro en `auditoria_reasignaciones_por_emergencia`: quién, cuándo, la guardia, el
--    Asistente anterior, el nuevo y el motivo. La función marca la transacción con la guardia que
--    está cambiando, y el disparador deja pasar únicamente esa guardia, en esa transacción.
--
-- La función y el disparador corren con los permisos de quien escribe: no se saltean la RLS. Quien
-- no puede actualizar la guardia tampoco puede cubrirla por emergencia.

BEGIN;

-- 1. El registro --------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.auditoria_reasignaciones_por_emergencia (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id         uuid NOT NULL REFERENCES public.prestadoras(id),
  guardia_id            uuid NOT NULL,
  usuario_id            uuid NOT NULL REFERENCES public.usuarios(id),
  asistente_anterior_id uuid,
  asistente_nuevo_id    uuid NOT NULL,
  motivo                text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auditoria_reasignaciones_por_emergencia_motivo_check
    CHECK (btrim(motivo) <> '' AND char_length(motivo) <= 500)
);

CREATE INDEX IF NOT EXISTS auditoria_reasignaciones_por_emergencia_guardia_idx
  ON public.auditoria_reasignaciones_por_emergencia (prestadora_id, guardia_id);

ALTER TABLE public.auditoria_reasignaciones_por_emergencia ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.auditoria_reasignaciones_por_emergencia FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.auditoria_reasignaciones_por_emergencia TO authenticated;
GRANT SELECT ON public.auditoria_reasignaciones_por_emergencia TO service_role;

-- La leen la administración y la coordinación de la Prestadora.
DROP POLICY IF EXISTS personal_prestadora_lee_reasignaciones_por_emergencia ON public.auditoria_reasignaciones_por_emergencia;
CREATE POLICY personal_prestadora_lee_reasignaciones_por_emergencia
  ON public.auditoria_reasignaciones_por_emergencia
  FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND (
      interno.es_superadmin()
      OR EXISTS (
        SELECT 1 FROM public.usuarios u
         WHERE u.id = interno.usuario_de_la_sesion()
           AND u.rol = ANY (ARRAY['coordinador', 'admin_prestadora'])
      )
    )
  );

-- Se escribe sólo adentro de la función de emergencia: la marca de la transacción la pone ella y
-- nadie más. Una fila escrita por otro camino no pasa. No hay políticas de cambio ni de borrado.
DROP POLICY IF EXISTS se_anota_al_reasignar_por_emergencia ON public.auditoria_reasignaciones_por_emergencia;
CREATE POLICY se_anota_al_reasignar_por_emergencia
  ON public.auditoria_reasignaciones_por_emergencia
  FOR INSERT TO authenticated
  WITH CHECK (
    prestadora_id = interno.prestadora_actual()
    AND usuario_id = interno.usuario_de_la_sesion()
    AND current_setting('careonys.reasignacion_por_emergencia', true) = guardia_id::text
  );

-- 2. El bloqueo ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION interno.guardia_empezada_no_cambia_de_asistente()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF NEW.asistente_id IS NOT DISTINCT FROM OLD.asistente_id
     AND NEW.fecha IS NOT DISTINCT FROM OLD.fecha
     AND NEW.hora_inicio IS NOT DISTINCT FROM OLD.hora_inicio
     AND NEW.hora_fin IS NOT DISTINCT FROM OLD.hora_fin THEN
    RETURN NEW;
  END IF;

  -- Todavía no empezó.
  IF COALESCE(OLD.checkin_at, NEW.checkin_at) IS NULL
     AND OLD.estado IN ('programada', 'pausada', 'cancelada') THEN
    RETURN NEW;
  END IF;

  -- La emergencia: la guardia ausente que está cubriendo la función, y sólo su Asistente.
  IF current_setting('careonys.reasignacion_por_emergencia', true) = OLD.id::text
     AND OLD.estado = 'ausente'
     AND OLD.checkin_at IS NULL
     AND NEW.checkin_at IS NULL
     AND NEW.asistente_id IS NOT NULL
     AND NEW.fecha IS NOT DISTINCT FROM OLD.fecha
     AND NEW.hora_inicio IS NOT DISTINCT FROM OLD.hora_inicio
     AND NEW.hora_fin IS NOT DISTINCT FROM OLD.hora_fin THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'guardia_empezada_no_cambia_de_asistente' USING ERRCODE = '23514';
END;
$function$;

REVOKE ALL ON FUNCTION interno.guardia_empezada_no_cambia_de_asistente() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.guardia_empezada_no_cambia_de_asistente() TO authenticated, service_role, trabajo_sin_persona;

DROP TRIGGER IF EXISTS guardia_empezada_no_cambia_de_asistente ON public.guardias;
CREATE TRIGGER guardia_empezada_no_cambia_de_asistente
  BEFORE UPDATE OF asistente_id, fecha, hora_inicio, hora_fin ON public.guardias
  FOR EACH ROW EXECUTE FUNCTION interno.guardia_empezada_no_cambia_de_asistente();

-- 3. El único camino de emergencia --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reasignar_guardia_por_emergencia(
  p_guardia_id uuid,
  p_asistente_id uuid,
  p_motivo text
)
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
  SELECT g.id, g.asistente_id, g.estado, g.checkin_at
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

REVOKE ALL ON FUNCTION public.reasignar_guardia_por_emergencia(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reasignar_guardia_por_emergencia(uuid, uuid, text) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
