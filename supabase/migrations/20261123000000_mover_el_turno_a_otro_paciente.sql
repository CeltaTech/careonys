-- Llevar un turno con Asistente de un Paciente a otro, desde la vista por Paciente.
--
-- El turno original no se cambia de Paciente: queda donde estaba, sin Asistente y con la alarma
-- abierta, porque el Paciente sigue necesitando a alguien. Para el Paciente de destino nace un
-- turno nuevo, asignado al mismo Asistente y esperando que lo acepte: cambió a quién cuida, así
-- que se le vuelve a preguntar.
--
-- Va todo junto o nada. Si el Asistente no puede tomar el turno nuevo —la Matrícula o la
-- modalidad lo frenan—, no queda un turno nuevo sin nadie ni el original vaciado.
--
-- El turno nuevo es sólo del Paciente de destino: si el original cubría a dos, el otro se queda en
-- el original. Lleva el mismo Servicio, modalidad y canal; la serie no, porque la serie es del
-- Paciente que se queda.
--
-- Corre con la sesión de quien mueve: las mismas políticas que le dejan crear un turno desde el
-- Panel deciden acá, y `asignar_turno` pone las demás paredes.

CREATE OR REPLACE FUNCTION public.mover_turno_a_otro_paciente(
  p_guardia_id uuid,
  p_paciente_id uuid,
  p_fecha date,
  p_hora_inicio time,
  p_hora_fin time
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
  v_guardia    public.guardias;
  v_asistente  uuid;
  v_nueva      uuid;
  v_quitar     jsonb;
  v_asignar    jsonb;
BEGIN
  IF v_prestadora IS NULL THEN
    RAISE EXCEPTION 'guardia_no_encontrada';
  END IF;

  SELECT * INTO v_guardia
    FROM guardias
   WHERE id = p_guardia_id
     AND prestadora_id = v_prestadora;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'guardia_no_encontrada';
  END IF;

  IF v_guardia.estado <> 'programada' THEN
    RAISE EXCEPTION 'guardia_no_se_asigna' USING ERRCODE = '23514';
  END IF;

  -- El que esperaba respuesta manda sobre el que figura: es a quien se le asignó por última vez.
  SELECT asistente_id INTO v_asistente
    FROM asignaciones_de_turno
   WHERE guardia_id = p_guardia_id
     AND prestadora_id = v_prestadora
     AND estado = 'sin_responder';
  v_asistente := COALESCE(v_asistente, v_guardia.asistente_id);

  IF v_asistente IS NULL THEN
    RAISE EXCEPTION 'guardia_sin_asistente' USING ERRCODE = '23514';
  END IF;

  INSERT INTO guardias (
    prestadora_id, paciente_id, servicio_id, coordinador_id, fecha, hora_inicio, hora_fin,
    dias_hasta_el_fin, modalidad, canal_modalidad
  )
  VALUES (
    v_prestadora, p_paciente_id, v_guardia.servicio_id, v_guardia.coordinador_id,
    COALESCE(p_fecha, v_guardia.fecha),
    COALESCE(p_hora_inicio, v_guardia.hora_inicio),
    COALESCE(p_hora_fin, v_guardia.hora_fin),
    v_guardia.dias_hasta_el_fin, v_guardia.modalidad, v_guardia.canal_modalidad
  )
  RETURNING id INTO v_nueva;

  -- Primero se lo saca del original —que abre la alarma— y después se le ofrece el nuevo.
  v_quitar  := public.asignar_turno(p_guardia_id, NULL);
  v_asignar := public.asignar_turno(v_nueva, v_asistente);

  RETURN jsonb_build_object(
    'guardia_nueva_id', v_nueva,
    'asistente_id', v_asistente,
    'titular_retirado', v_quitar->'titular_retirado',
    'pendiente_retirado', v_quitar->'pendiente_retirado'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.mover_turno_a_otro_paciente(uuid, uuid, date, time, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mover_turno_a_otro_paciente(uuid, uuid, date, time, time) TO authenticated;

NOTIFY pgrst, 'reload schema';
