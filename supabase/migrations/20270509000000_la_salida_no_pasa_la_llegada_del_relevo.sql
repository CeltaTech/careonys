-- La hora de salida que se pone desde el Panel —al cerrar un turno de guardia con un motivo o al
-- registrar la autorización de una salida— tiene un tercer límite, además de no ser anterior a la
-- llegada del turno ni posterior al momento en que se registra: no puede ser posterior a la llegada
-- ya registrada del Asistente que tomó el turno siguiente del mismo Paciente. Se valida en el único
-- camino del cierre, así vale igual para las dos formas.

BEGIN;

-- La llegada registrada del turno de guardia siguiente que comparte algún Paciente con éste: la
-- primera posterior a su propia llegada. Corre con los permisos de su dueño porque quien coordina
-- puede no ver el turno siguiente; sólo mira la Prestadora de la sesión y sólo devuelve una hora.
CREATE OR REPLACE FUNCTION interno.llegada_del_turno_siguiente(p_turno_guardia uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $$
  WITH este AS (
    SELECT g.id, g.prestadora_id, g.checkin_at
      FROM turnos_guardia g
     WHERE g.id = p_turno_guardia
       AND g.prestadora_id = interno.prestadora_actual()
  ),
  sus_pacientes AS (
    SELECT tp.paciente_id
      FROM turno_guardia_pacientes tp
      JOIN este ON tp.turno_guardia_id = este.id AND tp.prestadora_id = este.prestadora_id
    UNION
    SELECT g.paciente_id
      FROM turnos_guardia g
      JOIN este ON g.id = este.id
     WHERE g.paciente_id IS NOT NULL
  ),
  otros AS (
    SELECT tp.turno_guardia_id AS id
      FROM turno_guardia_pacientes tp
      JOIN este ON tp.prestadora_id = este.prestadora_id
     WHERE tp.paciente_id IN (SELECT paciente_id FROM sus_pacientes)
    UNION
    SELECT g.id
      FROM turnos_guardia g
      JOIN este ON g.prestadora_id = este.prestadora_id
     WHERE g.paciente_id IN (SELECT paciente_id FROM sus_pacientes)
  )
  SELECT min(g.checkin_at)
    FROM turnos_guardia g
    JOIN este ON g.prestadora_id = este.prestadora_id
   WHERE g.id IN (SELECT id FROM otros)
     AND g.id <> este.id
     AND g.checkin_at IS NOT NULL
     AND (este.checkin_at IS NULL OR g.checkin_at > este.checkin_at);
$$;

ALTER FUNCTION interno.llegada_del_turno_siguiente(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION interno.llegada_del_turno_siguiente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.llegada_del_turno_siguiente(uuid) TO authenticated, trabajo_sin_persona, service_role;

COMMENT ON FUNCTION interno.llegada_del_turno_siguiente(uuid) IS 'Llegada registrada del primer turno de guardia posterior que comparte un Paciente con éste, en la Prestadora de la sesión. Límite de la hora de salida que se pone desde el Panel.';

CREATE OR REPLACE FUNCTION interno.cerrar_el_turno_guardia(
  p_turno_guardia uuid,
  p_hora timestamp with time zone,
  p_reporte_atrasado boolean,
  p_motivo uuid,
  p_detalle text,
  p_cerrada_por uuid,
  p_lat double precision,
  p_lng double precision,
  p_motivo_del_sistema boolean
)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
  v_persona boolean := current_user = 'authenticated';
  v_quien uuid;
  v_turno turnos_guardia%ROWTYPE;
  v_motivo motivos_cierre_turno_guardia%ROWTYPE;
  v_detalle text := NULLIF(btrim(COALESCE(p_detalle, '')), '');
  v_texto text;
  v_hora timestamp with time zone;
  v_atrasado boolean := COALESCE(p_reporte_atrasado, false);
  v_estado text;
  v_relevo timestamp with time zone;
BEGIN
  IF v_prestadora IS NULL THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;

  -- Quién cierra. Una persona con sesión cierra desde el Panel, siempre con motivo, y queda
  -- anotada ella. El backend, con el trabajo de la Prestadora, cierra lo que hizo el Asistente
  -- —sin motivo— o lo que autorizó alguien del Panel, en nombre de esa persona.
  IF v_persona THEN
    v_quien := interno.usuario_de_la_sesion();
    IF v_quien IS NULL
       OR NOT interno.es_personal_de_la_prestadora()
       OR NOT (interno.es_superadmin()
               OR interno.es_admin_prestadora()
               OR interno.coordinador_ve_el_turno_guardia(p_turno_guardia)) THEN
      RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
    END IF;
    IF p_motivo IS NULL THEN
      RAISE EXCEPTION 'falta_el_motivo' USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_motivo IS NOT NULL THEN
    IF NOT interno.es_del_panel_de_la_prestadora(p_cerrada_por) THEN
      RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
    END IF;
    v_quien := p_cerrada_por;
  END IF;

  SELECT * INTO v_turno
    FROM turnos_guardia
   WHERE id = p_turno_guardia
     AND prestadora_id = v_prestadora
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_encontrado' USING ERRCODE = 'P0001';
  END IF;
  IF v_turno.estado IS DISTINCT FROM 'activa' OR v_turno.checkout_at IS NOT NULL THEN
    RAISE EXCEPTION 'turno_guardia_ya_cerrado' USING ERRCODE = 'P0001';
  END IF;

  IF p_motivo IS NOT NULL THEN
    SELECT * INTO v_motivo
      FROM motivos_cierre_turno_guardia
     WHERE id = p_motivo
       AND prestadora_id = v_prestadora
       AND activo;
    IF NOT FOUND
       OR (v_motivo.lo_escribe_el_sistema AND NOT COALESCE(p_motivo_del_sistema, false)) THEN
      RAISE EXCEPTION 'motivo_de_salida_inexistente' USING ERRCODE = 'P0001';
    END IF;
    IF v_motivo.pide_detalle AND v_detalle IS NULL THEN
      RAISE EXCEPTION 'motivo_de_salida_pide_detalle' USING ERRCODE = 'P0001';
    END IF;
    v_texto := COALESCE(v_motivo.nombre, v_motivo.clave)
               || CASE WHEN v_detalle IS NULL THEN '' ELSE ' — ' || v_detalle END;
  END IF;

  -- La hora de salida: obligatoria, no en el futuro y no antes de la llegada. Un minuto de
  -- tolerancia en cada punta, porque el Panel la elige sin segundos.
  IF p_hora IS NULL THEN
    RAISE EXCEPTION 'hora_de_salida_obligatoria' USING ERRCODE = 'P0001';
  END IF;
  IF p_hora > now() + interval '1 minute' THEN
    RAISE EXCEPTION 'hora_de_salida_futura' USING ERRCODE = 'P0001';
  END IF;
  v_hora := LEAST(p_hora, now());
  IF v_turno.checkin_at IS NOT NULL AND v_hora < v_turno.checkin_at THEN
    IF v_hora >= date_trunc('minute', v_turno.checkin_at) THEN
      v_hora := v_turno.checkin_at;
    ELSE
      RAISE EXCEPTION 'hora_de_salida_anterior_a_la_llegada' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Quien cierra desde el Panel, o autoriza la salida, tampoco puede poner una hora posterior a la
  -- llegada ya registrada del Asistente que tomó el turno siguiente del mismo Paciente.
  IF p_motivo IS NOT NULL THEN
    v_relevo := interno.llegada_del_turno_siguiente(p_turno_guardia);
    IF v_relevo IS NOT NULL AND v_hora > v_relevo THEN
      RAISE EXCEPTION 'hora_de_salida_posterior_al_relevo' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- El Reporte pendiente lo decide el backend. Lo que la base no acepta es un cierre que diga que
  -- están todos cuando a algún Paciente todavía le queda el suyo.
  IF NOT v_atrasado AND interno.el_reporte_esta_atrasado(p_turno_guardia) THEN
    RAISE EXCEPTION 'reporte_no_coincide' USING ERRCODE = 'P0001';
  END IF;

  v_estado := CASE WHEN v_atrasado THEN 'salida_sin_reporte' ELSE 'completada' END;

  PERFORM set_config('careonys.cierre_por_la_funcion', 'si', true);

  UPDATE turnos_guardia SET
    checkout_at  = v_hora,
    checkout_lat = CASE WHEN v_persona THEN NULL ELSE p_lat END,
    checkout_lng = CASE WHEN v_persona THEN NULL ELSE p_lng END,
    estado       = v_estado,
    salio_sin_reporte = salio_sin_reporte OR v_atrasado,
    factura_espera_el_reporte = CASE WHEN v_atrasado
                                     THEN NOT interno.factura_los_turnos_sin_reporte()
                                     ELSE factura_espera_el_reporte END,
    push_reporte_pendiente_enviado_at = CASE WHEN v_atrasado
                                             THEN now()
                                             ELSE push_reporte_pendiente_enviado_at END,
    cerrada_at        = CASE WHEN p_motivo IS NULL THEN cerrada_at ELSE now() END,
    cerrada_origen    = CASE WHEN p_motivo IS NULL THEN cerrada_origen ELSE 'panel' END,
    cerrada_por       = CASE WHEN p_motivo IS NULL THEN cerrada_por ELSE v_quien END,
    cerrada_motivo    = CASE WHEN p_motivo IS NULL THEN cerrada_motivo ELSE v_texto END,
    cerrada_motivo_id = CASE WHEN p_motivo IS NULL THEN cerrada_motivo_id ELSE p_motivo END
  WHERE id = p_turno_guardia
    AND prestadora_id = v_prestadora;

  PERFORM set_config('careonys.cierre_por_la_funcion', '', true);

  RETURN v_estado;
END;
$$;

ALTER FUNCTION interno.cerrar_el_turno_guardia(uuid, timestamp with time zone, boolean, uuid, text, uuid, double precision, double precision, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION interno.cerrar_el_turno_guardia(uuid, timestamp with time zone, boolean, uuid, text, uuid, double precision, double precision, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.cerrar_el_turno_guardia(uuid, timestamp with time zone, boolean, uuid, text, uuid, double precision, double precision, boolean) TO authenticated, trabajo_sin_persona, service_role;

COMMENT ON FUNCTION interno.cerrar_el_turno_guardia(uuid, timestamp with time zone, boolean, uuid, text, uuid, double precision, double precision, boolean) IS 'Único camino por el que un turno de guardia empezado se cierra: valida quién cierra, el motivo y la hora —no antes de la llegada, no después de este momento ni de la llegada del turno siguiente del mismo Paciente—, y lo deja completado o en Salida sin Reporte con la elección de la Prestadora sobre la factura.';

COMMIT;

NOTIFY pgrst, 'reload schema';
