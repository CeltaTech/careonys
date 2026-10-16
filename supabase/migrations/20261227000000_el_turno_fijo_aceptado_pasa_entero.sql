-- El turno fijo aceptado pasa entero a quien lo aceptó.
--
-- Cuando el turno fijo tenía otro Asistente, ése sigue haciendo los días que vienen hasta que el
-- nuevo acepta. Al aceptar, esos días pasan al nuevo junto con los que no tenían a nadie.

CREATE OR REPLACE FUNCTION public.aceptar_asignacion(p_asignacion_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
  v_asistente  uuid := interno.asistente_de_la_sesion();
  v_asignacion public.asignaciones_de_turno;
  v_tomadas    integer;
BEGIN
  IF v_prestadora IS NULL OR v_asistente IS NULL THEN
    RAISE EXCEPTION 'asignacion_no_encontrada';
  END IF;

  SELECT * INTO v_asignacion
    FROM asignaciones_de_turno
   WHERE id = p_asignacion_id
     AND prestadora_id = v_prestadora
     AND asistente_id = v_asistente
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'asignacion_no_encontrada';
  END IF;

  IF v_asignacion.estado <> 'sin_responder' THEN
    RAISE EXCEPTION 'asignacion_ya_respondida';
  END IF;

  IF v_asignacion.guardia_id IS NOT NULL THEN
    UPDATE guardias
       SET asistente_id = v_asistente
     WHERE id = v_asignacion.guardia_id
       AND prestadora_id = v_prestadora
       AND estado = 'programada'
       AND asistente_id IS NULL;

    GET DIAGNOSTICS v_tomadas = ROW_COUNT;
    IF v_tomadas = 0 THEN
      RAISE EXCEPTION 'guardia_ya_cubierta';
    END IF;

  ELSIF v_asignacion.serie_id IS NOT NULL THEN
    UPDATE series_guardias
       SET asistente_id = v_asistente
     WHERE id = v_asignacion.serie_id
       AND prestadora_id = v_prestadora
       AND estado = 'activa'
       AND asistente_id IS NULL;

    GET DIAGNOSTICS v_tomadas = ROW_COUNT;
    IF v_tomadas = 0 THEN
      RAISE EXCEPTION 'guardia_ya_cubierta';
    END IF;

    -- Los turnos que vienen pasan a ser suyos: los que no tienen a nadie y los que seguía haciendo
    -- quien tenía el turno fijo antes. Los que esperan la respuesta de otro por ese día quedan como
    -- están. Ya contestó que sí: no le llega un aviso por cada día.
    UPDATE guardias g
       SET asistente_id = v_asistente,
           push_asignacion_enviado_at = now()
     WHERE g.serie_id = v_asignacion.serie_id
       AND g.prestadora_id = v_prestadora
       AND g.estado = 'programada'
       AND (g.asistente_id IS NULL OR g.asistente_id = v_asignacion.asistente_anterior_id)
       AND g.fecha >= CURRENT_DATE
       AND NOT EXISTS (
         SELECT 1 FROM asignaciones_de_turno o
          WHERE o.guardia_id = g.id
            AND o.estado = 'sin_responder'
       );

  ELSE
    UPDATE coberturas_de_ausencia
       SET aceptada_at = now()
     WHERE ausencia_id = v_asignacion.ausencia_id
       AND prestadora_id = v_prestadora
       AND asistente_sustituto_id = v_asistente
       AND aceptada_at IS NULL
       AND objetada_at IS NULL;
  END IF;

  UPDATE asignaciones_de_turno
     SET estado = 'aceptada'
   WHERE id = v_asignacion.id;

  RETURN v_asignacion.guardia_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.aceptar_asignacion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aceptar_asignacion(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
