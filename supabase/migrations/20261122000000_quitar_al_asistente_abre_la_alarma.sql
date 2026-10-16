-- Quitarle o cambiarle el Asistente a un turno abre la alarma de turno sin cubrir en el momento.
--
-- Hasta acá el incidente lo abría la tarea automática cuando faltaban pocas horas y el turno seguía
-- sin nadie. Pero cuando el Coordinador saca a quien lo tenía —aceptado o esperando respuesta— ya
-- se sabe que el turno tiene un problema, y no se espera a que se acerque: queda abierto desde ese
-- instante hasta que alguien lo acepte. Lo cierra la tarea automática, como a los demás.
--
-- Asignar un turno que no tenía a nadie no abre nada: ahí no se perdió a nadie.
--
-- La función es la misma que la anterior, con el incidente agregado al final. Corre con la sesión
-- de quien asigna, así que el incidente lo deja pasar la misma política con la que el Coordinador
-- lo resuelve desde el Panel: para ese momento el turno ya no tiene Asistente.

CREATE OR REPLACE FUNCTION public.asignar_turno(p_guardia_id uuid, p_asistente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
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

  -- Alguien perdió el turno: la alarma se abre ya. Si había una abierta, sigue la misma.
  IF v_guardia.asistente_id IS NOT NULL OR v_pendiente.id IS NOT NULL THEN
    INSERT INTO incidentes_turno_sin_cubrir (prestadora_id, guardia_id)
    VALUES (v_prestadora, v_guardia.id)
    ON CONFLICT (guardia_id) WHERE resuelto_at IS NULL DO NOTHING;
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

NOTIFY pgrst, 'reload schema';
