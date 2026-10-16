-- ============================================================================
-- Asignar un turno desde el Panel deja una asignación pendiente.
--
-- El turno pasa a ser del Asistente recién cuando acepta. Mientras tanto queda sin cubrir, con la
-- asignación esperando respuesta. Asignarlo a otro retira la asignación anterior, y si el turno ya
-- tenía un Asistente que lo había aceptado, lo pierde en el acto. Asignarlo a nadie lo deja sin
-- cubrir. Asignarlo al mismo Asistente que ya lo tiene se lo vuelve a preguntar: es lo que pasa
-- cuando el turno cambia de día o de horario.
--
-- Todo eso lo hace `asignar_turno` en un solo paso, con los permisos de quien llama: las
-- políticas de siempre deciden qué turnos alcanza.
--
-- La asignación guarda quién tenía el turno antes —`asistente_anterior_id`—, para poder avisarle
-- al Cliente, cuando el nuevo acepta, quién deja de ir y quién lo reemplaza.
--
-- Y el Coordinador alcanza una asignación por el Asistente al que se le asignó. Antes la alcanzaba
-- por el Asistente del turno, que ahora queda vacío mientras se espera la respuesta.
-- ============================================================================

ALTER TABLE public.asignaciones_de_turno
  ADD COLUMN asistente_anterior_id uuid REFERENCES public.asistentes(id);

CREATE OR REPLACE FUNCTION interno.la_asignacion_cambia_de_estado()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF interno.usuario_de_la_sesion() IS NOT NULL THEN
      NEW.asignado_por := interno.usuario_de_la_sesion();
    END IF;
    NEW.asignado_at := now();
    NEW.respondida_at := CASE WHEN NEW.estado IN ('aceptada', 'rechazada') THEN now() END;
    NEW.retirada_at := CASE WHEN NEW.estado = 'retirada' THEN now() END;
    NEW.retirada_por := CASE WHEN NEW.estado = 'retirada' THEN interno.usuario_de_la_sesion() END;
    RETURN NEW;
  END IF;

  IF NEW.prestadora_id IS DISTINCT FROM OLD.prestadora_id
     OR NEW.guardia_id IS DISTINCT FROM OLD.guardia_id
     OR NEW.asistente_id IS DISTINCT FROM OLD.asistente_id
     OR NEW.asistente_anterior_id IS DISTINCT FROM OLD.asistente_anterior_id
     OR NEW.asignado_por IS DISTINCT FROM OLD.asignado_por
     OR NEW.asignado_at IS DISTINCT FROM OLD.asignado_at THEN
    RAISE EXCEPTION 'asignacion_no_se_modifica' USING ERRCODE = '23514';
  END IF;

  NEW.respondida_at := OLD.respondida_at;
  NEW.retirada_at := OLD.retirada_at;
  NEW.retirada_por := OLD.retirada_por;

  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
    RETURN NEW;
  END IF;

  IF OLD.estado <> 'sin_responder' THEN
    RAISE EXCEPTION 'asignacion_ya_respondida' USING ERRCODE = '23514';
  END IF;

  IF NEW.estado IN ('aceptada', 'rechazada') THEN
    NEW.respondida_at := now();
  ELSIF NEW.estado = 'retirada' THEN
    NEW.retirada_at := now();
    NEW.retirada_por := interno.usuario_de_la_sesion();
  END IF;

  RETURN NEW;
END;
$function$;

DROP POLICY coordinador_gestiona_asignaciones_de_su_zona ON public.asignaciones_de_turno;

CREATE POLICY coordinador_gestiona_asignaciones_de_su_zona ON public.asignaciones_de_turno
  FOR ALL
  USING (
    prestadora_id = interno.prestadora_actual()
    AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'coordinador')
    AND interno.coordinador_alcanza_asistente(asistente_id)
  )
  WITH CHECK (
    prestadora_id = interno.prestadora_actual()
    AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'coordinador')
    AND interno.coordinador_alcanza_asistente(asistente_id)
  );

CREATE FUNCTION public.asignar_turno(p_guardia_id uuid, p_asistente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
  v_guardia    public.guardias;
  v_pendiente  public.asignaciones_de_turno;
  v_anterior   uuid;
  v_nueva      uuid;
  v_motivo     text;
BEGIN
  IF v_prestadora IS NULL THEN
    RAISE EXCEPTION 'guardia_no_encontrada';
  END IF;

  -- Primero la asignación pendiente y después el turno: es el mismo orden en que los toma
  -- `aceptar_asignacion`, así las dos nunca se esperan una a la otra.
  SELECT * INTO v_pendiente
    FROM asignaciones_de_turno
   WHERE guardia_id = p_guardia_id
     AND prestadora_id = v_prestadora
     AND estado = 'sin_responder'
   FOR UPDATE;

  SELECT * INTO v_guardia
    FROM guardias
   WHERE id = p_guardia_id
     AND prestadora_id = v_prestadora
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'guardia_no_encontrada';
  END IF;

  IF v_guardia.estado <> 'programada' THEN
    RAISE EXCEPTION 'guardia_no_se_asigna' USING ERRCODE = '23514';
  END IF;

  -- Lo que ya está como se pide no se toca: ni se retira ni se vuelve a avisar.
  IF p_asistente_id IS NOT NULL AND v_pendiente.asistente_id = p_asistente_id THEN
    RETURN jsonb_build_object('sin_cambios', true);
  END IF;
  IF p_asistente_id IS NULL AND v_pendiente.id IS NULL AND v_guardia.asistente_id IS NULL THEN
    RETURN jsonb_build_object('sin_cambios', true);
  END IF;

  v_anterior := COALESCE(v_guardia.asistente_id, v_pendiente.asistente_anterior_id);

  -- Las mismas paredes que pone la base cuando el turno pasa a ser de alguien, puestas ahora,
  -- para que el Coordinador se entere al asignar y no el Asistente al aceptar.
  IF p_asistente_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM asistentes a WHERE a.id = p_asistente_id AND a.prestadora_id = v_prestadora) THEN
      RAISE EXCEPTION 'asistente_no_encontrado';
    END IF;

    -- El Coordinador asigna sólo a los Asistentes de su zona. Lo frenaría igual la política de
    -- la asignación, pero con un error que no dice qué pasó.
    IF EXISTS (SELECT 1 FROM usuarios u WHERE u.id = interno.usuario_de_la_sesion() AND u.rol = 'coordinador')
       AND NOT interno.coordinador_alcanza_asistente(p_asistente_id) THEN
      RAISE EXCEPTION 'asistente_no_encontrado';
    END IF;

    v_motivo := interno.motivo_bloqueo_matricula(
      p_asistente_id,
      public.dia_en_que_termina_guardia(v_guardia.fecha, v_guardia.hora_inicio, v_guardia.hora_fin)
    );
    IF v_motivo IS NOT NULL THEN
      RAISE EXCEPTION 'matricula_bloquea:%:', v_motivo USING ERRCODE = '23514';
    END IF;

    IF v_guardia.canal_modalidad IS NOT NULL
       AND NOT interno.asistente_trabaja_en_modalidad(p_asistente_id, v_guardia.canal_modalidad) THEN
      RAISE EXCEPTION 'modalidad_bloquea:%:', v_guardia.canal_modalidad USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_pendiente.id IS NOT NULL THEN
    UPDATE asignaciones_de_turno SET estado = 'retirada' WHERE id = v_pendiente.id;
  END IF;

  IF v_guardia.asistente_id IS NOT NULL THEN
    UPDATE guardias SET asistente_id = NULL WHERE id = v_guardia.id;
  END IF;

  IF p_asistente_id IS NOT NULL THEN
    INSERT INTO asignaciones_de_turno (prestadora_id, guardia_id, asistente_id, asistente_anterior_id)
    VALUES (v_prestadora, v_guardia.id, p_asistente_id, v_anterior)
    RETURNING id INTO v_nueva;
  END IF;

  RETURN jsonb_build_object(
    'sin_cambios', false,
    'asignacion_id', v_nueva,
    'titular_retirado', v_guardia.asistente_id,
    'pendiente_retirado', v_pendiente.asistente_id,
    'asistente_anterior_id', v_anterior
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.asignar_turno(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asignar_turno(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
