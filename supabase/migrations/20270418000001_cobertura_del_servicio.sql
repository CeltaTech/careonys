-- Cobertura del Servicio: período, pausas, suspensiones, cancelaciones y la internación.
-- ==================================================================================
--
-- Qué hace:
--
-- 1. El período del Servicio pasa a ser obligatorio en su primer día. Una regla impide que el
--    último día quede antes del primero, y un disparador impide crear turnos de guardia fuera
--    del período.
-- 2. Nace la lista de interrupciones de la cobertura. Cada pausa (breve, con fecha de vuelta),
--    suspensión (larga o sin fecha) y cancelación guarda el motivo, quién la hizo y su alcance:
--    el Servicio, una Prestación, un turno de guardia recurrente o un solo turno de guardia.
--    El personal la lee sólo en su Prestadora; se escribe sólo por las funciones de abajo.
-- 3. El turno de guardia suma el estado suspendida y la referencia a la interrupción que lo
--    tapa. El turno que nace adentro de una interrupción ya nace pausado o suspendido.
-- 4. Funciones nuevas para el Panel: interrumpir la cobertura, reanudarla, cancelar desde una
--    fecha, editar los días y el horario de un turno de guardia recurrente desde una fecha sin
--    cancelarlo, y cambiar el período del Servicio. Todas resuelven la Prestadora adentro.
-- 5. La internación dice qué pasa con el Servicio: se suspende, se muda al domicilio temporal o
--    sigue en el domicilio habitual. Al cerrarla vuelve sólo lo que ella suspendió y nada del
--    pasado. La baja del Servicio cancela también lo pausado y lo suspendido.
-- 6. Cada cambio de la cobertura vuelve a anotar los turnos de guardia sin cubrir.
--
-- Por qué: el plan pide que el Coordinador maneje la cobertura sin cancelar y volver a crear
-- todo, y que la internación no deje turnos suspendidos para siempre.
--
-- Los datos que estas reglas exigen ya los convirtió la migración anterior.

SET check_function_bodies = false;
DROP FUNCTION public.registrar_hospitalizacion(p_paciente uuid, p_institucion text, p_motivo text, p_fecha_inicio date, p_domicilio jsonb);
ALTER TABLE public.series_turnos_guardia DROP CONSTRAINT series_turnos_guardia_estado_check;
ALTER TABLE public.turnos_guardia DROP CONSTRAINT turnos_guardia_estado_check;
ALTER TABLE public.turnos_guardia DROP CONSTRAINT turnos_guardia_sin_cubrir_estado_check;
DROP INDEX public.motivos_resolucion_nombre_unico;
CREATE OR REPLACE FUNCTION interno.guardias_en_fechas(p_prestadora uuid, p_servicio uuid, p_paciente uuid, p_desde date, p_hasta date)
 RETURNS TABLE(guardia_id uuid, prestacion_id bigint, paciente_id uuid, fecha date, inicio timestamp without time zone, fin timestamp without time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT c.id, p.id, p.paciente_id, d.fecha,
         d.fecha + c.hora_inicio,
         (d.fecha + c.dias_hasta_el_fin::int) + c.hora_fin
    FROM (SELECT p_desde + i AS fecha FROM generate_series(0, p_hasta - p_desde) AS i) d
    JOIN prestaciones p
      ON p.prestadora_id = p_prestadora
     AND p.servicio_id = p_servicio
     AND (p_paciente IS NULL OR p.paciente_id = p_paciente)
     AND p.estado = 'vigente'
     AND p.vigente_desde <= d.fecha
     AND (p.vigente_hasta IS NULL OR d.fecha <= p.vigente_hasta)
    JOIN servicios s
      ON s.id = p_servicio
     AND s.prestadora_id = p_prestadora
     AND s.estado = 'vigente'
     AND s.vigente_desde <= d.fecha
     AND (s.vigente_hasta IS NULL OR d.fecha <= s.vigente_hasta)
    JOIN cronograma_de_guardias c
      ON c.prestacion_id = p.id
     AND (c.fecha = d.fecha OR interno.dia_de_la_semana(d.fecha) = ANY (c.dias_semana))
$function$;
CREATE FUNCTION interno.interrupcion_que_tapa(p_prestadora uuid, p_servicio uuid, p_prestaciones bigint[], p_serie uuid, p_turno_guardia uuid, p_fecha date)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT i.id FROM interrupciones_de_cobertura i
   WHERE i.prestadora_id = p_prestadora AND i.servicio_id = p_servicio
     AND i.tipo IN ('pausa', 'suspension')
     AND i.desde <= p_fecha AND (i.vuelta IS NULL OR p_fecha < i.vuelta)
     AND (i.levantada_desde IS NULL OR p_fecha < i.levantada_desde)
     AND (i.alcance = 'servicio'
          OR (i.alcance = 'prestacion'
              AND EXISTS (SELECT 1 FROM unnest(COALESCE(p_prestaciones, '{}'::bigint[])) AS x(id)
                           WHERE interno.prestacion_desciende_de(x.id, i.prestacion_id)))
          OR (i.alcance = 'turno_guardia_recurrente' AND i.serie_id = p_serie)
          OR (i.alcance = 'turno_guardia' AND i.turno_guardia_id = p_turno_guardia))
   ORDER BY (i.tipo = 'suspension') DESC, i.created_at, i.id
   LIMIT 1
$function$;
GRANT ALL ON FUNCTION interno.interrupcion_que_tapa(uuid, uuid, bigint[], uuid, uuid, date) TO service_role;
CREATE FUNCTION interno.levantar_interrupcion(p_interrupcion uuid, p_desde date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_servicio uuid;
  v_desde    date;
BEGIN
  UPDATE interrupciones_de_cobertura i
     SET levantada_desde = greatest(i.desde, p_desde),
         levantada_at = now(),
         levantada_por = interno.usuario_de_la_sesion()
   WHERE i.id = p_interrupcion
     AND i.prestadora_id = interno.prestadora_actual()
     AND i.tipo IN ('pausa', 'suspension')
     AND i.levantada_at IS NULL
  RETURNING i.servicio_id, i.levantada_desde INTO v_servicio, v_desde;
  IF v_servicio IS NOT NULL THEN
    PERFORM interno.marcar_turnos_interrumpidos(v_servicio, v_desde);
  END IF;
END;
$function$;
GRANT ALL ON FUNCTION interno.levantar_interrupcion(uuid, date) TO service_role;
CREATE FUNCTION interno.levantar_lo_de_la_internacion(p_hospitalizacion uuid, p_desde date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT i.id FROM interrupciones_de_cobertura i
     WHERE i.hospitalizacion_id = p_hospitalizacion
       AND i.prestadora_id = interno.prestadora_actual()
       AND i.levantada_at IS NULL
  LOOP
    PERFORM interno.levantar_interrupcion(v_id, p_desde);
  END LOOP;
END;
$function$;
GRANT ALL ON FUNCTION interno.levantar_lo_de_la_internacion(uuid, date) TO authenticated;
GRANT ALL ON FUNCTION interno.levantar_lo_de_la_internacion(uuid, date) TO service_role;
CREATE FUNCTION interno.marcar_turnos_interrumpidos(p_servicio uuid, p_desde date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_turno uuid;
BEGIN
  FOR v_turno IN
    SELECT t.id FROM turnos_guardia t
     WHERE t.servicio_id = p_servicio
       AND t.prestadora_id = interno.prestadora_actual()
       AND t.fecha >= p_desde
       AND t.checkin_at IS NULL
       AND t.estado IN ('programada', 'pausada', 'suspendida')
  LOOP
    PERFORM interno.reevaluar_turno_guardia(v_turno);
  END LOOP;
END;
$function$;
GRANT ALL ON FUNCTION interno.marcar_turnos_interrumpidos(uuid, date) TO service_role;
CREATE FUNCTION interno.periodo_del_servicio()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.vigente_desde := COALESCE(NEW.vigente_desde,
      (now() AT TIME ZONE interno.zona_horaria_de_la_prestadora(NEW.prestadora_id))::date);
    RETURN NEW;
  END IF;

  IF NEW.vigente_desde IS NOT DISTINCT FROM OLD.vigente_desde
     AND NEW.vigente_hasta IS NOT DISTINCT FROM OLD.vigente_hasta THEN
    RETURN NEW;
  END IF;
  -- La baja y la reactivación ponen y quitan el último día con su propia marca.
  IF COALESCE(current_setting('careonys.cambio_de_estado_del_servicio', true), '') = NEW.id::text THEN
    RETURN NEW;
  END IF;

  IF COALESCE(auth.jwt() ->> 'role', '') = 'authenticated'
     AND NOT (interno.es_admin_prestadora() OR interno.es_superadmin()
              OR interno.tiene_permiso('gestionar_servicios')) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM turnos_guardia t
              WHERE t.servicio_id = NEW.id AND t.asistente_id IS NOT NULL AND t.estado <> 'cancelada'
                AND (t.fecha < NEW.vigente_desde
                     OR (NEW.vigente_hasta IS NOT NULL AND t.fecha > NEW.vigente_hasta))) THEN
    RAISE EXCEPTION 'el_servicio_tiene_turnos_guardia_fuera_del_periodo' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;
GRANT ALL ON FUNCTION interno.periodo_del_servicio() TO service_role;
CREATE FUNCTION interno.prestacion_desciende_de(p_prestacion bigint, p_raiz bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  WITH RECURSIVE cadena(id) AS (
    SELECT p_prestacion
    UNION
    SELECT p.prestacion_anterior_id FROM prestaciones p JOIN cadena c ON p.id = c.id
     WHERE p.prestacion_anterior_id IS NOT NULL
  )
  SELECT EXISTS (SELECT 1 FROM cadena WHERE id = p_raiz)
$function$;
GRANT ALL ON FUNCTION interno.prestacion_desciende_de(bigint, bigint) TO service_role;
CREATE FUNCTION interno.puede_gestionar_la_cobertura(p_servicio uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT EXISTS (SELECT 1 FROM servicios s
                  WHERE s.id = p_servicio AND s.prestadora_id = interno.prestadora_actual())
     AND (interno.es_superadmin() OR interno.es_admin_prestadora()
          OR (interno.es_coordinador() AND interno.coordina_el_servicio(p_servicio)))
$function$;
GRANT ALL ON FUNCTION interno.puede_gestionar_la_cobertura(uuid) TO authenticated;
GRANT ALL ON FUNCTION interno.puede_gestionar_la_cobertura(uuid) TO service_role;
CREATE FUNCTION interno.reevaluar_turno_guardia(p_turno_guardia uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_t            turnos_guardia;
  v_prestaciones bigint[];
  v_int          uuid;
  v_estado       text;
BEGIN
  SELECT t.* INTO v_t FROM turnos_guardia t WHERE t.id = p_turno_guardia;
  IF NOT FOUND OR v_t.servicio_id IS NULL OR v_t.checkin_at IS NOT NULL
     OR v_t.estado NOT IN ('programada', 'pausada', 'suspendida') THEN
    RETURN;
  END IF;

  v_prestaciones := ARRAY(SELECT c.prestacion_id
                            FROM turno_guardia_guardias tg
                            JOIN cronograma_de_guardias c ON c.id = tg.guardia_id
                           WHERE tg.turno_guardia_id = p_turno_guardia);
  v_int := interno.interrupcion_que_tapa(v_t.prestadora_id, v_t.servicio_id, v_prestaciones,
                                         v_t.serie_id, v_t.id, v_t.fecha);

  IF v_int IS NOT NULL THEN
    SELECT CASE i.tipo WHEN 'pausa' THEN 'pausada' ELSE 'suspendida' END INTO v_estado
      FROM interrupciones_de_cobertura i WHERE i.id = v_int;
    IF v_t.estado IS DISTINCT FROM v_estado OR v_t.interrupcion_id IS DISTINCT FROM v_int THEN
      UPDATE turnos_guardia SET estado = v_estado, interrupcion_id = v_int WHERE id = p_turno_guardia;
    END IF;
  ELSIF v_t.interrupcion_id IS NOT NULL THEN
    UPDATE turnos_guardia SET estado = 'programada', interrupcion_id = NULL WHERE id = p_turno_guardia;
  END IF;
END;
$function$;
GRANT ALL ON FUNCTION interno.reevaluar_turno_guardia(uuid) TO authenticated;
GRANT ALL ON FUNCTION interno.reevaluar_turno_guardia(uuid) TO service_role;
GRANT ALL ON FUNCTION interno.reevaluar_turno_guardia(uuid) TO trabajo_sin_persona;
CREATE FUNCTION interno.suspender_por_la_internacion(p_hospitalizacion uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_h        hospitalizaciones_paciente;
  v_desde    date;
  v_servicio uuid;
BEGIN
  SELECT h.* INTO v_h FROM hospitalizaciones_paciente h
   WHERE h.id = p_hospitalizacion
     AND h.prestadora_id = interno.prestadora_actual()
     AND h.forma = 'suspende'
     AND h.fecha_fin IS NULL;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  v_desde := greatest(v_h.fecha_inicio,
                      (now() AT TIME ZONE interno.zona_horaria_de_la_prestadora(v_h.prestadora_id))::date);

  FOR v_servicio IN
    SELECT s.id FROM servicios s
     WHERE s.prestadora_id = v_h.prestadora_id
       AND s.estado = 'vigente'
       AND (s.vigente_hasta IS NULL OR s.vigente_hasta >= v_desde)
       AND EXISTS (SELECT 1 FROM prestaciones p
                    WHERE p.servicio_id = s.id AND p.paciente_id = v_h.paciente_id
                      AND p.estado = 'vigente'
                      AND (p.vigente_hasta IS NULL OR p.vigente_hasta >= v_desde))
  LOOP
    INSERT INTO interrupciones_de_cobertura
      (prestadora_id, tipo, alcance, servicio_id, paciente_id, hospitalizacion_id, desde)
    VALUES (v_h.prestadora_id, 'suspension', 'servicio', v_servicio, v_h.paciente_id, v_h.id, v_desde);
    PERFORM interno.marcar_turnos_interrumpidos(v_servicio, v_desde);
  END LOOP;
END;
$function$;
GRANT ALL ON FUNCTION interno.suspender_por_la_internacion(uuid) TO authenticated;
GRANT ALL ON FUNCTION interno.suspender_por_la_internacion(uuid) TO service_role;
CREATE OR REPLACE FUNCTION interno.turno_guardia_empezado_no_cambia_de_asistente()
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
     AND OLD.estado IN ('programada', 'pausada', 'suspendida', 'cancelada') THEN
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

  RAISE EXCEPTION 'turno_guardia_empezado_no_cambia_de_asistente' USING ERRCODE = '23514';
END;
$function$;
CREATE FUNCTION interno.turno_guardia_nace_interrumpido()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  PERFORM interno.reevaluar_turno_guardia(NEW.turno_guardia_id);
  RETURN NULL;
END;
$function$;
GRANT ALL ON FUNCTION interno.turno_guardia_nace_interrumpido() TO authenticated;
GRANT ALL ON FUNCTION interno.turno_guardia_nace_interrumpido() TO service_role;
GRANT ALL ON FUNCTION interno.turno_guardia_nace_interrumpido() TO trabajo_sin_persona;
CREATE OR REPLACE FUNCTION interno.turnos_guardia_asignados_del_servicio(p_servicio uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT (
    (SELECT count(*) FROM turnos_guardia g
      WHERE g.servicio_id = p_servicio
        AND g.prestadora_id = interno.prestadora_actual()
        AND g.asistente_id IS NOT NULL
        AND g.estado IN ('programada', 'activa'))
    +
    (SELECT count(*) FROM series_turnos_guardia sg
      WHERE sg.servicio_id = p_servicio
        AND sg.prestadora_id = interno.prestadora_actual()
        AND sg.asistente_id IS NOT NULL
        AND sg.estado = 'activa')
  )::integer;
$function$;
CREATE OR REPLACE FUNCTION interno.turnos_guardia_que_traban_la_desactivacion(p_usuario uuid, p_prestadora uuid)
 RETURNS TABLE(tipo text, id uuid, fecha date, hora_inicio time without time zone, hora_fin time without time zone, dias_hasta_el_fin smallint, checkin_at timestamp with time zone, cliente text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT 'turno_guardia'::text, g.id, g.fecha, g.hora_inicio, g.hora_fin, g.dias_hasta_el_fin,
         g.checkin_at, pe.nombre_visible
    FROM asistentes a
    JOIN turnos_guardia g ON g.asistente_id = a.id AND g.prestadora_id = p_prestadora
    LEFT JOIN pacientes p ON p.id = g.paciente_id
    LEFT JOIN personas pe ON pe.id = p.persona_id
   WHERE a.usuario_id = p_usuario
     AND a.prestadora_id = p_prestadora
     AND g.estado NOT IN ('cancelada', 'ausente')
     AND g.checkout_at IS NULL
     AND g.cerrada_at IS NULL
  UNION ALL
  SELECT 'serie'::text, s.id, s.vigente_desde, s.hora_inicio, s.hora_fin, s.dias_hasta_el_fin,
         NULL::timestamptz, pe.nombre_visible
    FROM asistentes a
    JOIN series_turnos_guardia s ON s.asistente_id = a.id AND s.prestadora_id = p_prestadora
    LEFT JOIN pacientes p ON p.id = s.paciente_id
    LEFT JOIN personas pe ON pe.id = p.persona_id
   WHERE a.usuario_id = p_usuario
     AND a.prestadora_id = p_prestadora
     AND s.estado = 'activa'
     AND (s.vigente_hasta IS NULL OR s.vigente_hasta >= current_date - 1)
   ORDER BY 3, 4;
$function$;
CREATE OR REPLACE FUNCTION interno.turnos_sin_cubrir(p_prestadora uuid, p_servicio uuid, p_desde date, p_hasta date)
 RETURNS TABLE(prestacion_id bigint, guardia_id uuid, paciente_id uuid, inicio timestamp without time zone, fin timestamp without time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT o.prestacion_id, o.guardia_id, o.paciente_id, lower(h.hueco), upper(h.hueco)
    FROM interno.guardias_en_fechas(p_prestadora, p_servicio, NULL, p_desde, p_hasta) o
   CROSS JOIN LATERAL (
     -- Una guardia que cae en una pausa o una suspensión del Servicio o de su Prestación no hace
     -- falta cubrirla.
     SELECT 1 AS sigue
      WHERE interno.interrupcion_que_tapa(p_prestadora, p_servicio, ARRAY[o.prestacion_id], NULL, NULL, o.fecha) IS NULL
   ) sin_interrumpir
   CROSS JOIN LATERAL (
     SELECT tsmultirange(tsrange(o.inicio, o.fin))
            - COALESCE(range_agg(c.tramo) FILTER (WHERE c.tramo IS NOT NULL), '{}'::tsmultirange) AS huecos
       FROM (
         -- Los turnos de guardia recurrentes vigentes: activos y con el día adentro de su vigencia.
         SELECT CASE WHEN x.fin > x.ini THEN tsrange(x.ini, x.fin) END AS tramo
           FROM series_turnos_guardia s
           JOIN series_turnos_guardia_pacientes sp ON sp.serie_id = s.id AND sp.paciente_id = o.paciente_id
          CROSS JOIN LATERAL (SELECT o.fecha + i AS dia FROM generate_series(-3, 3) AS i) d
          CROSS JOIN LATERAL (
            SELECT d.dia + s.hora_inicio AS ini,
                   interno.dia_en_que_termina_turno_guardia(d.dia, s.hora_inicio, s.hora_fin, s.dias_hasta_el_fin) + s.hora_fin AS fin
          ) x
          WHERE s.prestadora_id = p_prestadora
            AND s.servicio_id = p_servicio
            AND s.estado = 'activa'
            AND s.vigente_desde <= d.dia
            AND (s.vigente_hasta IS NULL OR d.dia <= s.vigente_hasta)
            AND interno.dia_de_la_semana(d.dia) = ANY (s.dias_semana)
            -- El día que el recurrente ya tiene su turno de guardia lo cuenta ese turno, más abajo;
            -- y el día que el recurrente está interrumpido no cubre.
            AND NOT EXISTS (SELECT 1 FROM turnos_guardia t
                             WHERE t.serie_id = s.id AND t.fecha = d.dia)
            AND interno.interrupcion_que_tapa(p_prestadora, p_servicio, NULL, s.id, NULL, d.dia) IS NULL
         UNION ALL
         -- Los turnos de guardia, sueltos o del recurrente, que no están cancelados, pausados ni
         -- suspendidos.
         SELECT CASE WHEN x.fin > x.ini THEN tsrange(x.ini, x.fin) END
           FROM turnos_guardia t
           JOIN turno_guardia_pacientes tp ON tp.turno_guardia_id = t.id AND tp.paciente_id = o.paciente_id
          CROSS JOIN LATERAL (
            SELECT t.fecha + t.hora_inicio AS ini,
                   interno.dia_en_que_termina_turno_guardia(t.fecha, t.hora_inicio, t.hora_fin, t.dias_hasta_el_fin) + t.hora_fin AS fin
          ) x
          WHERE t.prestadora_id = p_prestadora
            AND t.servicio_id = p_servicio
            AND t.estado NOT IN ('cancelada', 'pausada', 'suspendida')
            AND t.fecha BETWEEN o.fecha - 3 AND o.fecha + 3
       ) c
   ) cuenta
   CROSS JOIN LATERAL unnest(cuenta.huecos) AS h(hueco)
$function$;
CREATE FUNCTION interno.validar_motivo_de_la_interrupcion(p_prestadora uuid, p_tipo text, p_motivo uuid, p_detalle text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_pide boolean;
BEGIN
  SELECT m.pide_detalle INTO v_pide FROM motivos_resolucion m
   WHERE m.id = p_motivo AND m.prestadora_id = p_prestadora
     AND m.tabla = 'interrupciones_de_cobertura' AND m.estado = p_tipo AND m.activo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'motivo_inexistente' USING ERRCODE = 'P0001';
  END IF;
  IF v_pide AND nullif(btrim(coalesce(p_detalle, '')), '') IS NULL THEN
    RAISE EXCEPTION 'resolucion_sin_detalle' USING ERRCODE = 'P0001';
  END IF;
  RETURN nullif(btrim(coalesce(p_detalle, '')), '');
END;
$function$;
GRANT ALL ON FUNCTION interno.validar_motivo_de_la_interrupcion(uuid, text, uuid, text) TO service_role;
CREATE FUNCTION public.cambiar_periodo_del_servicio(p_servicio uuid, p_desde date, p_hasta date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prest uuid := interno.prestadora_actual();
BEGIN
  IF v_prest IS NULL
     OR NOT (interno.es_admin_prestadora() OR interno.es_superadmin()
             OR interno.tiene_permiso('gestionar_servicios')) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM servicios s
                  WHERE s.id = p_servicio AND s.prestadora_id = v_prest AND s.estado = 'vigente') THEN
    RAISE EXCEPTION 'servicio_inexistente' USING ERRCODE = 'P0001';
  END IF;
  IF p_desde IS NULL THEN
    RAISE EXCEPTION 'falta_un_dato' USING ERRCODE = '23502';
  END IF;
  IF p_hasta IS NOT NULL AND p_hasta < p_desde THEN
    RAISE EXCEPTION 'la_vuelta_es_antes_del_comienzo' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM turnos_guardia t
              WHERE t.servicio_id = p_servicio AND t.prestadora_id = v_prest
                AND t.asistente_id IS NOT NULL AND t.estado <> 'cancelada'
                AND (t.fecha < p_desde OR (p_hasta IS NOT NULL AND t.fecha > p_hasta))) THEN
    RAISE EXCEPTION 'el_servicio_tiene_turnos_guardia_fuera_del_periodo' USING ERRCODE = 'P0001';
  END IF;

  UPDATE turnos_guardia t
     SET estado = 'cancelada', cancelacion_origen = 'prestadora', cancelacion_alcance = 'servicio',
         interrupcion_id = NULL
   WHERE t.servicio_id = p_servicio AND t.prestadora_id = v_prest
     AND t.asistente_id IS NULL AND t.checkin_at IS NULL
     AND t.estado IN ('programada', 'pausada', 'suspendida')
     AND (t.fecha < p_desde OR (p_hasta IS NOT NULL AND t.fecha > p_hasta));

  UPDATE series_turnos_guardia s
     SET vigente_desde = greatest(s.vigente_desde, p_desde),
         vigente_hasta = CASE WHEN p_hasta IS NULL THEN s.vigente_hasta
                              ELSE least(COALESCE(s.vigente_hasta, p_hasta), p_hasta) END
   WHERE s.servicio_id = p_servicio AND s.prestadora_id = v_prest AND s.estado = 'activa'
     AND (s.vigente_desde < p_desde OR (p_hasta IS NOT NULL AND (s.vigente_hasta IS NULL OR s.vigente_hasta > p_hasta)))
     AND (p_hasta IS NULL OR greatest(s.vigente_desde, p_desde) <= p_hasta);
  UPDATE series_turnos_guardia s
     SET estado = 'cancelada', cancelacion_origen = 'prestadora', cancelado_at = now()
   WHERE s.servicio_id = p_servicio AND s.prestadora_id = v_prest AND s.estado = 'activa'
     AND ((p_hasta IS NOT NULL AND greatest(s.vigente_desde, p_desde) > p_hasta)
          OR (s.vigente_hasta IS NOT NULL AND s.vigente_hasta < p_desde));

  UPDATE servicios SET vigente_desde = p_desde, vigente_hasta = p_hasta
   WHERE id = p_servicio AND prestadora_id = v_prest;

  PERFORM interno.anotar_turnos_sin_cubrir();
END;
$function$;
GRANT ALL ON FUNCTION public.cambiar_periodo_del_servicio(uuid, date, date) TO authenticated;
GRANT ALL ON FUNCTION public.cambiar_periodo_del_servicio(uuid, date, date) TO service_role;
CREATE FUNCTION public.cancelar_cobertura_desde(p_alcance text, p_prestacion bigint, p_serie uuid, p_desde date, p_motivo uuid, p_detalle text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prest    uuid := interno.prestadora_actual();
  v_hoy      date;
  v_servicio uuid;
  v_paciente uuid;
  v_inicio   date;
  v_detalle  text;
  v_series   uuid[];
  v_turnos   uuid[];
  v_id       uuid;
BEGIN
  IF v_prest IS NULL THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_desde IS NULL THEN
    RAISE EXCEPTION 'falta_un_dato' USING ERRCODE = '23502';
  END IF;
  v_hoy := (now() AT TIME ZONE interno.zona_horaria_de_la_prestadora(v_prest))::date;

  IF p_alcance = 'turno_guardia_recurrente' THEN
    SELECT s.servicio_id, s.vigente_desde INTO v_servicio, v_inicio FROM series_turnos_guardia s
     WHERE s.id = p_serie AND s.prestadora_id = v_prest AND s.estado = 'activa';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'turno_guardia_recurrente_inexistente' USING ERRCODE = 'P0001';
    END IF;
    v_series := ARRAY[p_serie];
    v_turnos := ARRAY(SELECT t.id FROM turnos_guardia t
                       WHERE t.serie_id = p_serie AND t.prestadora_id = v_prest AND t.fecha >= p_desde);
  ELSIF p_alcance = 'prestacion' THEN
    SELECT p.servicio_id, p.paciente_id, p.vigente_desde INTO v_servicio, v_paciente, v_inicio
      FROM prestaciones p
     WHERE p.id = p_prestacion AND p.prestadora_id = v_prest AND p.estado = 'vigente';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'prestacion_inexistente' USING ERRCODE = 'P0001';
    END IF;
    -- Los recurrentes del Servicio que atienden a ese Paciente, y los turnos de guardia de las
    -- guardias de esa Prestación.
    v_series := ARRAY(SELECT s.id FROM series_turnos_guardia s
                       WHERE s.servicio_id = v_servicio AND s.prestadora_id = v_prest AND s.estado = 'activa'
                         AND (s.paciente_id = v_paciente
                              OR EXISTS (SELECT 1 FROM series_turnos_guardia_pacientes sp
                                          WHERE sp.serie_id = s.id AND sp.paciente_id = v_paciente)));
    v_turnos := ARRAY(SELECT DISTINCT tg.turno_guardia_id
                        FROM turno_guardia_guardias tg
                        JOIN cronograma_de_guardias c ON c.id = tg.guardia_id
                        JOIN turnos_guardia t ON t.id = tg.turno_guardia_id
                       WHERE c.prestacion_id = p_prestacion AND t.prestadora_id = v_prest
                         AND t.fecha >= p_desde);
    IF EXISTS (SELECT 1 FROM series_turnos_guardia_pacientes sp
                JOIN series_turnos_guardia s ON s.id = sp.serie_id
               WHERE sp.serie_id = ANY (v_series) AND sp.paciente_id <> v_paciente)
       OR EXISTS (SELECT 1 FROM series_turnos_guardia s
                   WHERE s.id = ANY (v_series) AND s.paciente_id <> v_paciente)
       OR EXISTS (SELECT 1 FROM turno_guardia_pacientes tp
                   WHERE tp.turno_guardia_id = ANY (v_turnos) AND tp.paciente_id <> v_paciente) THEN
      RAISE EXCEPTION 'el_turno_guardia_recurrente_atiende_a_otro_paciente' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;

  IF NOT interno.puede_gestionar_la_cobertura(v_servicio) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_desde < v_hoy THEN
    RAISE EXCEPTION 'la_fecha_ya_paso' USING ERRCODE = 'P0001';
  END IF;
  v_detalle := interno.validar_motivo_de_la_interrupcion(v_prest, 'cancelacion', p_motivo, p_detalle);

  -- Lo asignado no se cancela solo: se le quita primero el Asistente.
  IF EXISTS (SELECT 1 FROM turnos_guardia t
              WHERE t.id = ANY (v_turnos) AND t.asistente_id IS NOT NULL
                AND t.estado NOT IN ('cancelada', 'completada', 'ausente'))
     OR EXISTS (SELECT 1 FROM series_turnos_guardia s
                 WHERE s.id = ANY (v_series) AND s.asistente_id IS NOT NULL
                   AND (s.vigente_hasta IS NULL OR s.vigente_hasta >= p_desde)) THEN
    RAISE EXCEPTION 'quedan_turnos_guardia_asignados' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO interrupciones_de_cobertura
    (prestadora_id, tipo, alcance, servicio_id, prestacion_id, serie_id, desde, motivo_id, detalle)
  VALUES
    (v_prest, 'cancelacion', p_alcance, v_servicio,
     CASE WHEN p_alcance = 'prestacion' THEN p_prestacion END,
     CASE WHEN p_alcance = 'turno_guardia_recurrente' THEN p_serie END,
     p_desde, p_motivo, v_detalle)
  RETURNING id INTO v_id;

  UPDATE turnos_guardia t
     SET estado = 'cancelada', cancelacion_origen = 'prestadora', cancelacion_alcance = p_alcance,
         interrupcion_id = NULL
   WHERE t.id = ANY (v_turnos) AND t.checkin_at IS NULL
     AND t.estado IN ('programada', 'pausada', 'suspendida');

  -- El recurrente rige hasta el día anterior; si no le queda ningún día, se cancela.
  UPDATE series_turnos_guardia s
     SET estado = 'cancelada', cancelacion_origen = 'prestadora', cancelado_at = now()
   WHERE s.id = ANY (v_series) AND p_desde <= s.vigente_desde;
  UPDATE series_turnos_guardia s
     SET vigente_hasta = least(COALESCE(s.vigente_hasta, p_desde - 1), p_desde - 1)
   WHERE s.id = ANY (v_series) AND s.estado = 'activa';

  IF p_alcance = 'prestacion' THEN
    IF p_desde <= v_inicio THEN
      UPDATE prestaciones SET estado = 'de_baja', vigente_hasta = vigente_desde WHERE id = p_prestacion;
    ELSE
      UPDATE prestaciones SET vigente_hasta = least(COALESCE(vigente_hasta, p_desde - 1), p_desde - 1)
       WHERE id = p_prestacion;
    END IF;
  END IF;

  PERFORM interno.anotar_turnos_sin_cubrir();
  RETURN v_id;
END;
$function$;
GRANT ALL ON FUNCTION public.cancelar_cobertura_desde(text, bigint, uuid, date, uuid, text) TO authenticated;
GRANT ALL ON FUNCTION public.cancelar_cobertura_desde(text, bigint, uuid, date, uuid, text) TO service_role;
CREATE OR REPLACE FUNCTION public.cerrar_hospitalizacion(p_hospitalizacion uuid, p_fecha date)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_antes    text := coalesce(current_setting('careonys.lectura_de_salud', true), '');
  v_paciente uuid;
  v_inicio   date;
  v_fin      date;
  v_forma    text;
  v_hoy      date;
BEGIN
  PERFORM set_config('careonys.lectura_de_salud', 'anotada', true);
  UPDATE hospitalizaciones_paciente h
     SET fecha_fin = greatest(p_fecha, h.fecha_inicio)
   WHERE h.id = p_hospitalizacion
     AND h.prestadora_id = interno.prestadora_actual()
     AND h.fecha_fin IS NULL
  RETURNING h.paciente_id, h.fecha_inicio, h.fecha_fin, h.forma INTO v_paciente, v_inicio, v_fin, v_forma;
  PERFORM set_config('careonys.lectura_de_salud', v_antes, true);
  IF v_paciente IS NULL THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  PERFORM interno.anotar_lo_que_se_leyo('hospitalizaciones_paciente', ARRAY[v_paciente], 'cerrar_hospitalizacion');

  IF v_forma = 'muda' THEN
    UPDATE domicilios_temporales_paciente d
       SET fecha_fin = greatest(p_fecha, d.fecha_inicio)
     WHERE d.hospitalizacion_id = p_hospitalizacion
       AND (d.fecha_fin IS NULL OR d.fecha_fin > greatest(p_fecha, d.fecha_inicio));
  ELSIF v_forma = 'suspende' THEN
    -- Vuelve sólo lo que esta internación suspendió, desde el día siguiente al alta y nunca antes
    -- de hoy: lo pasado queda como quedó.
    v_hoy := (now() AT TIME ZONE interno.zona_horaria_de_la_prestadora(interno.prestadora_actual()))::date;
    PERFORM interno.levantar_lo_de_la_internacion(p_hospitalizacion, greatest(v_hoy, v_fin + 1));
  END IF;

  PERFORM interno.anotar_turnos_sin_cubrir();
END;
$function$;
CREATE OR REPLACE FUNCTION public.crear_turno_guardia_recurrente(p_servicio uuid, p_pacientes uuid[], p_dias_semana text[], p_hora_inicio text, p_hora_fin text, p_dias_hasta_el_fin integer, p_modalidad text, p_vigente_desde date, p_vigente_hasta date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prest     uuid := interno.prestadora_actual();
  v_pacientes uuid[];
  v_dias      text[];
  v_hi        time without time zone;
  v_hf        time without time zone;
  v_fin       smallint := COALESCE(p_dias_hasta_el_fin, 0)::smallint;
  v_ahora     timestamp without time zone;
  v_hoy       date;
  v_horizonte integer;
  v_desde     date;
  v_hasta     date;
  v_serie     uuid;
  v_turno     uuid;
  v_fecha     date;
  v_dia       text;
  v_paciente  uuid;
  v_serv_desde date;
  v_serv_hasta date;
  v_vig_desde  date;
  v_vig_hasta  date;
BEGIN
  IF v_prest IS NULL THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;

  -- Sin repetidos y en el orden en que vinieron: el primero es el principal.
  v_pacientes := ARRAY(SELECT u.x FROM unnest(p_pacientes) WITH ORDINALITY AS u(x, n)
                        WHERE u.x IS NOT NULL GROUP BY u.x ORDER BY min(u.n));
  IF cardinality(v_pacientes) = 0 THEN
    RAISE EXCEPTION 'faltan_pacientes' USING ERRCODE = 'P0001';
  END IF;
  v_dias := ARRAY(SELECT DISTINCT d.x FROM unnest(p_dias_semana) AS d(x) WHERE d.x IS NOT NULL);
  IF cardinality(v_dias) = 0 THEN
    RAISE EXCEPTION 'faltan_dias_de_la_semana' USING ERRCODE = 'P0001';
  END IF;
  IF p_hora_inicio IS NULL OR p_hora_fin IS NULL OR p_vigente_desde IS NULL THEN
    RAISE EXCEPTION 'falta_un_dato' USING ERRCODE = '23502';
  END IF;
  v_hi := p_hora_inicio::time;
  v_hf := p_hora_fin::time;

  v_ahora := now() AT TIME ZONE interno.zona_horaria_de_la_prestadora(v_prest);
  v_hoy := v_ahora::date;
  v_horizonte := COALESCE(interno.dias_de_generacion_de_la_prestadora(), 0);

  -- El recurrente no sale del período del Servicio: empieza, como pronto, el día que empieza el
  -- Servicio, y termina, como tarde, el día que termina.
  SELECT s.vigente_desde, s.vigente_hasta INTO v_serv_desde, v_serv_hasta
    FROM servicios s
   WHERE s.id = p_servicio AND s.prestadora_id = v_prest AND s.estado = 'vigente';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'servicio_inexistente' USING ERRCODE = 'P0001';
  END IF;
  v_vig_desde := greatest(p_vigente_desde, v_serv_desde);
  v_vig_hasta := CASE WHEN v_serv_hasta IS NULL THEN p_vigente_hasta
                      WHEN p_vigente_hasta IS NULL THEN v_serv_hasta
                      ELSE least(p_vigente_hasta, v_serv_hasta) END;
  IF v_vig_hasta IS NOT NULL AND v_vig_hasta < v_vig_desde THEN
    RAISE EXCEPTION 'fuera_del_periodo_del_servicio' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO series_turnos_guardia (prestadora_id, servicio_id, paciente_id, dias_semana, hora_inicio, hora_fin,
                                     dias_hasta_el_fin, modalidad, vigente_desde, vigente_hasta)
  VALUES (v_prest, p_servicio, v_pacientes[1], v_dias, v_hi, v_hf, v_fin, p_modalidad, v_vig_desde, v_vig_hasta)
  RETURNING id INTO v_serie;

  INSERT INTO series_turnos_guardia_pacientes (serie_id, paciente_id, prestadora_id)
  SELECT v_serie, x, v_prest FROM unnest(v_pacientes[2:]) AS x
  ON CONFLICT DO NOTHING;

  -- Cada día de la semana elegido tiene que caer adentro del cronograma, para cada Paciente, la
  -- primera vez que le toca. Se mira aunque esa fecha quede más allá del horizonte y todavía no se
  -- genere ningún turno de guardia.
  FOREACH v_dia IN ARRAY v_dias LOOP
    v_fecha := NULL;
    SELECT d::date INTO v_fecha
      FROM generate_series(greatest(v_vig_desde, v_hoy), greatest(v_vig_desde, v_hoy) + 6, interval '1 day') AS d
     WHERE interno.dia_de_la_semana(d::date) = v_dia
     LIMIT 1;
    IF v_fecha IS NULL OR (v_vig_hasta IS NOT NULL AND v_fecha > v_vig_hasta) THEN
      CONTINUE;
    END IF;
    FOREACH v_paciente IN ARRAY v_pacientes LOOP
      IF interno.guardia_que_contiene(v_prest, p_servicio, v_paciente, v_fecha, v_hi, v_hf, v_fin) IS NULL THEN
        RAISE EXCEPTION 'turno_guardia_fuera_del_cronograma' USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
  END LOOP;

  -- Los turnos de guardia: desde hoy si el turno todavía no empezó, si no desde mañana; nunca antes
  -- del día desde el que rige la serie; hasta el horizonte o el último día de la serie.
  v_desde := greatest(v_vig_desde, CASE WHEN v_hi > v_ahora::time THEN v_hoy ELSE v_hoy + 1 END);
  v_hasta := v_hoy + v_horizonte;
  IF v_vig_hasta IS NOT NULL AND v_vig_hasta < v_hasta THEN
    v_hasta := v_vig_hasta;
  END IF;

  IF v_desde <= v_hasta THEN
    FOR v_fecha IN
      SELECT d::date FROM generate_series(v_desde, v_hasta, interval '1 day') AS d
       WHERE interno.dia_de_la_semana(d::date) = ANY (v_dias)
    LOOP
      INSERT INTO turnos_guardia (prestadora_id, serie_id, paciente_id, fecha, hora_inicio, hora_fin,
                                  dias_hasta_el_fin, modalidad)
      VALUES (v_prest, v_serie, v_pacientes[1], v_fecha, v_hi, v_hf, v_fin, p_modalidad)
      RETURNING id INTO v_turno;

      INSERT INTO turno_guardia_pacientes (turno_guardia_id, paciente_id, prestadora_id)
      SELECT v_turno, x, v_prest FROM unnest(v_pacientes[2:]) AS x
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  PERFORM interno.anotar_turnos_sin_cubrir();

  RETURN v_serie;
END;
$function$;
CREATE OR REPLACE FUNCTION public.dar_de_baja_el_servicio(p_servicio uuid, p_motivo text, p_motivo_detalle text, p_comprobaciones uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_servicio servicios%ROWTYPE;
  v_pide_detalle boolean;
  v_comprobaciones text[];
  v_faltan integer;
  v_baja uuid;
BEGIN
  SELECT * INTO v_servicio FROM servicios
   WHERE id = p_servicio AND prestadora_id = interno.prestadora_actual();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'servicio_inexistente';
  END IF;
  IF v_servicio.estado <> 'vigente' THEN
    RAISE EXCEPTION 'el_servicio_ya_esta_de_baja';
  END IF;

  IF interno.turnos_guardia_asignados_del_servicio(p_servicio) > 0 THEN
    RAISE EXCEPTION 'el_servicio_tiene_turnos_guardia_asignados';
  END IF;

  SELECT m.pide_detalle INTO v_pide_detalle
    FROM motivos_cierre_servicio m
   WHERE m.prestadora_id = v_servicio.prestadora_id
     AND m.activo
     AND coalesce(m.clave, m.nombre) = p_motivo
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'motivo_de_cierre_inexistente:%', p_motivo;
  END IF;
  IF v_pide_detalle AND coalesce(btrim(p_motivo_detalle), '') = '' THEN
    RAISE EXCEPTION 'motivo_de_cierre_pide_detalle:%', p_motivo;
  END IF;

  SELECT count(*) INTO v_faltan
    FROM lista_de_comprobacion_baja_servicio l
   WHERE l.prestadora_id = v_servicio.prestadora_id
     AND l.activo
     AND NOT (l.id = ANY (coalesce(p_comprobaciones, '{}')));
  IF v_faltan > 0 THEN
    RAISE EXCEPTION 'faltan_comprobaciones_de_la_baja';
  END IF;

  SELECT coalesce(array_agg(l.nombre ORDER BY l.orden, l.created_at), '{}') INTO v_comprobaciones
    FROM lista_de_comprobacion_baja_servicio l
   WHERE l.prestadora_id = v_servicio.prestadora_id
     AND l.activo
     AND l.id = ANY (coalesce(p_comprobaciones, '{}'));

  INSERT INTO bajas_de_servicio (prestadora_id, servicio_id, motivo, motivo_detalle, comprobaciones, dada_por)
  VALUES (v_servicio.prestadora_id, p_servicio, p_motivo,
          CASE WHEN v_pide_detalle THEN btrim(p_motivo_detalle) END,
          v_comprobaciones, interno.usuario_de_la_sesion())
  RETURNING id INTO v_baja;

  -- La fecha de fin de cada prestación la pone la base al ver la baja.
  UPDATE prestaciones SET estado = 'de_baja'
   WHERE servicio_id = p_servicio AND estado = 'vigente';
  UPDATE series_turnos_guardia
     SET estado = 'cancelada', cancelacion_origen = 'prestadora', cancelado_at = now()
   WHERE servicio_id = p_servicio AND estado = 'activa';
  -- Lo pausado y lo suspendido también se cancela: la baja no deja nada esperando volver.
  UPDATE turnos_guardia
     SET estado = 'cancelada', cancelacion_origen = 'prestadora', cancelacion_alcance = 'servicio',
         interrupcion_id = NULL
   WHERE servicio_id = p_servicio
     AND ((estado = 'programada' AND asistente_id IS NULL) OR estado IN ('pausada', 'suspendida'));

  -- Las pausas y las suspensiones abiertas del Servicio terminan con la baja.
  UPDATE interrupciones_de_cobertura
     SET levantada_desde = greatest(desde, (now() AT TIME ZONE interno.zona_horaria_de_la_prestadora(prestadora_id))::date),
         levantada_at = now(), levantada_por = interno.usuario_de_la_sesion()
   WHERE servicio_id = p_servicio AND tipo IN ('pausa', 'suspension') AND levantada_at IS NULL;

  PERFORM set_config('careonys.cambio_de_estado_del_servicio', p_servicio::text, true);
  UPDATE servicios
     SET estado = 'de_baja',
         vigente_hasta = greatest(vigente_desde,
                                  (now() AT TIME ZONE interno.zona_horaria_de_la_prestadora(prestadora_id))::date)
   WHERE id = p_servicio;
  PERFORM set_config('careonys.cambio_de_estado_del_servicio', '', true);

  PERFORM interno.anotar_deuda_de_la_baja(v_baja);

  PERFORM interno.anotar_turnos_sin_cubrir();

  RETURN v_baja;
END;
$function$;
CREATE FUNCTION public.editar_turno_guardia_recurrente(p_serie uuid, p_desde date, p_dias_semana text[], p_hora_inicio text, p_hora_fin text, p_dias_hasta_el_fin integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prest     uuid := interno.prestadora_actual();
  v_s         series_turnos_guardia;
  v_hoy       date;
  v_desde     date;
  v_pacientes uuid[];
  v_nueva     uuid;
BEGIN
  IF v_prest IS NULL THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  SELECT s.* INTO v_s FROM series_turnos_guardia s
   WHERE s.id = p_serie AND s.prestadora_id = v_prest AND s.estado = 'activa';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'turno_guardia_recurrente_inexistente' USING ERRCODE = 'P0001';
  END IF;
  IF NOT interno.puede_gestionar_la_cobertura(v_s.servicio_id) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_desde IS NULL THEN
    RAISE EXCEPTION 'falta_un_dato' USING ERRCODE = '23502';
  END IF;
  v_hoy := (now() AT TIME ZONE interno.zona_horaria_de_la_prestadora(v_prest))::date;
  IF p_desde < v_hoy THEN
    RAISE EXCEPTION 'la_fecha_ya_paso' USING ERRCODE = 'P0001';
  END IF;
  v_desde := greatest(p_desde, v_s.vigente_desde);
  IF v_s.vigente_hasta IS NOT NULL AND v_desde > v_s.vigente_hasta THEN
    RAISE EXCEPTION 'fuera_del_periodo_del_servicio' USING ERRCODE = 'P0001';
  END IF;

  v_pacientes := ARRAY[v_s.paciente_id]
              || ARRAY(SELECT sp.paciente_id FROM series_turnos_guardia_pacientes sp
                        WHERE sp.serie_id = p_serie AND sp.paciente_id <> v_s.paciente_id
                        ORDER BY sp.paciente_id);

  -- Los turnos de guardia vacantes de ahí en más se rehacen.
  DELETE FROM turnos_guardia t
   WHERE t.serie_id = p_serie AND t.prestadora_id = v_prest AND t.fecha >= v_desde
     AND t.asistente_id IS NULL AND t.checkin_at IS NULL
     AND t.estado IN ('programada', 'pausada', 'suspendida')
     AND NOT EXISTS (SELECT 1 FROM calificaciones_asistente c WHERE c.turno_guardia_id = t.id)
     AND NOT EXISTS (SELECT 1 FROM excepciones_por_documentos e WHERE e.turno_guardia_id = t.id);

  -- El recurrente de hoy rige hasta el día anterior; si no le queda ningún día, se cancela.
  IF v_desde <= v_s.vigente_desde THEN
    UPDATE series_turnos_guardia
       SET estado = 'cancelada', cancelacion_origen = 'prestadora', cancelado_at = now()
     WHERE id = p_serie;
  ELSE
    UPDATE series_turnos_guardia SET vigente_hasta = v_desde - 1 WHERE id = p_serie;
  END IF;

  v_nueva := public.crear_turno_guardia_recurrente(
    v_s.servicio_id, v_pacientes, p_dias_semana, p_hora_inicio, p_hora_fin, p_dias_hasta_el_fin,
    v_s.modalidad, v_desde, v_s.vigente_hasta);

  -- Donde el recurrente de hoy conserva un turno de guardia asignado, el nuevo no pone otro.
  DELETE FROM turnos_guardia n
   WHERE n.serie_id = v_nueva AND n.asistente_id IS NULL
     AND EXISTS (SELECT 1 FROM turnos_guardia v
                  WHERE v.serie_id = p_serie AND v.fecha = n.fecha AND v.estado <> 'cancelada');

  -- Las pausas y las suspensiones abiertas del recurrente pasan al nuevo.
  INSERT INTO interrupciones_de_cobertura
    (prestadora_id, tipo, alcance, servicio_id, serie_id, desde, vuelta, motivo_id, detalle, hecha_por)
  SELECT i.prestadora_id, i.tipo, i.alcance, i.servicio_id, v_nueva, greatest(i.desde, v_desde),
         i.vuelta, i.motivo_id, i.detalle, i.hecha_por
    FROM interrupciones_de_cobertura i
   WHERE i.serie_id = p_serie AND i.prestadora_id = v_prest
     AND i.alcance = 'turno_guardia_recurrente' AND i.tipo IN ('pausa', 'suspension')
     AND i.levantada_at IS NULL
     AND (i.vuelta IS NULL OR i.vuelta > greatest(i.desde, v_desde));

  PERFORM interno.marcar_turnos_interrumpidos(v_s.servicio_id, v_desde);
  PERFORM interno.anotar_turnos_sin_cubrir();
  RETURN v_nueva;
END;
$function$;
GRANT ALL ON FUNCTION public.editar_turno_guardia_recurrente(uuid, date, text[], text, text, integer) TO authenticated;
GRANT ALL ON FUNCTION public.editar_turno_guardia_recurrente(uuid, date, text[], text, text, integer) TO service_role;
CREATE FUNCTION public.interrumpir_cobertura(p_tipo text, p_alcance text, p_servicio uuid, p_prestacion bigint, p_serie uuid, p_turno_guardia uuid, p_desde date, p_vuelta date, p_motivo uuid, p_detalle text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prest   uuid := interno.prestadora_actual();
  v_hoy     date;
  v_desde   date := p_desde;
  v_vuelta  date := p_vuelta;
  v_detalle text;
  v_fecha   date;
  v_id      uuid;
BEGIN
  IF v_prest IS NULL OR NOT interno.puede_gestionar_la_cobertura(p_servicio) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_tipo NOT IN ('pausa', 'suspension')
     OR p_alcance NOT IN ('servicio', 'prestacion', 'turno_guardia_recurrente', 'turno_guardia') THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;
  v_hoy := (now() AT TIME ZONE interno.zona_horaria_de_la_prestadora(v_prest))::date;

  IF NOT EXISTS (SELECT 1 FROM servicios s
                  WHERE s.id = p_servicio AND s.prestadora_id = v_prest AND s.estado = 'vigente'
                    AND (s.vigente_hasta IS NULL OR s.vigente_hasta >= v_hoy)) THEN
    RAISE EXCEPTION 'servicio_inexistente' USING ERRCODE = 'P0001';
  END IF;

  IF p_alcance = 'prestacion' AND NOT EXISTS (
       SELECT 1 FROM prestaciones p
        WHERE p.id = p_prestacion AND p.servicio_id = p_servicio AND p.prestadora_id = v_prest
          AND p.estado = 'vigente') THEN
    RAISE EXCEPTION 'prestacion_inexistente' USING ERRCODE = 'P0001';
  END IF;
  IF p_alcance = 'turno_guardia_recurrente' AND NOT EXISTS (
       SELECT 1 FROM series_turnos_guardia s
        WHERE s.id = p_serie AND s.servicio_id = p_servicio AND s.prestadora_id = v_prest
          AND s.estado = 'activa') THEN
    RAISE EXCEPTION 'turno_guardia_recurrente_inexistente' USING ERRCODE = 'P0001';
  END IF;
  IF p_alcance = 'turno_guardia' THEN
    SELECT t.fecha INTO v_fecha FROM turnos_guardia t
     WHERE t.id = p_turno_guardia AND t.servicio_id = p_servicio AND t.prestadora_id = v_prest
       AND t.checkin_at IS NULL AND t.estado IN ('programada', 'pausada', 'suspendida');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'turno_guardia_inexistente' USING ERRCODE = 'P0001';
    END IF;
    -- Un solo turno de guardia se interrumpe el día que cae.
    v_desde := v_fecha;
    v_vuelta := v_fecha + 1;
  END IF;

  IF v_desde IS NULL OR (p_tipo = 'pausa' AND v_vuelta IS NULL) THEN
    RAISE EXCEPTION 'falta_un_dato' USING ERRCODE = '23502';
  END IF;
  IF v_desde < v_hoy THEN
    RAISE EXCEPTION 'la_fecha_ya_paso' USING ERRCODE = 'P0001';
  END IF;
  IF v_vuelta IS NOT NULL AND v_vuelta <= v_desde THEN
    RAISE EXCEPTION 'la_vuelta_es_antes_del_comienzo' USING ERRCODE = 'P0001';
  END IF;
  v_detalle := interno.validar_motivo_de_la_interrupcion(v_prest, p_tipo, p_motivo, p_detalle);

  INSERT INTO interrupciones_de_cobertura
    (prestadora_id, tipo, alcance, servicio_id, prestacion_id, serie_id, turno_guardia_id,
     desde, vuelta, motivo_id, detalle)
  VALUES
    (v_prest, p_tipo, p_alcance, p_servicio,
     CASE WHEN p_alcance = 'prestacion' THEN p_prestacion END,
     CASE WHEN p_alcance = 'turno_guardia_recurrente' THEN p_serie END,
     CASE WHEN p_alcance = 'turno_guardia' THEN p_turno_guardia END,
     v_desde, v_vuelta, p_motivo, v_detalle)
  RETURNING id INTO v_id;

  PERFORM interno.marcar_turnos_interrumpidos(p_servicio, v_desde);
  PERFORM interno.anotar_turnos_sin_cubrir();
  RETURN v_id;
END;
$function$;
GRANT ALL ON FUNCTION public.interrumpir_cobertura(text, text, uuid, bigint, uuid, uuid, date, date, uuid, text) TO authenticated;
GRANT ALL ON FUNCTION public.interrumpir_cobertura(text, text, uuid, bigint, uuid, uuid, date, date, uuid, text) TO service_role;
CREATE OR REPLACE FUNCTION public.reactivar_el_servicio(p_servicio uuid, p_motivo uuid, p_motivo_detalle text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_servicio servicios%ROWTYPE;
  v_motivo motivos_reactivacion_servicio%ROWTYPE;
  v_reactivacion uuid;
BEGIN
  SELECT * INTO v_servicio FROM servicios
   WHERE id = p_servicio AND prestadora_id = interno.prestadora_actual();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'servicio_inexistente';
  END IF;
  IF v_servicio.estado <> 'de_baja' THEN
    RAISE EXCEPTION 'el_servicio_esta_vigente';
  END IF;

  SELECT * INTO v_motivo FROM motivos_reactivacion_servicio m
   WHERE m.id = p_motivo AND m.prestadora_id = v_servicio.prestadora_id AND m.activo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'motivo_de_reactivacion_inexistente';
  END IF;
  IF v_motivo.pide_detalle AND coalesce(btrim(p_motivo_detalle), '') = '' THEN
    RAISE EXCEPTION 'motivo_de_reactivacion_pide_detalle';
  END IF;

  INSERT INTO reactivaciones_de_servicio (prestadora_id, servicio_id, motivo, motivo_detalle, reactivada_por)
  VALUES (v_servicio.prestadora_id, p_servicio, v_motivo.nombre,
          CASE WHEN v_motivo.pide_detalle THEN btrim(p_motivo_detalle) END,
          interno.usuario_de_la_sesion())
  RETURNING id INTO v_reactivacion;

  PERFORM set_config('careonys.cambio_de_estado_del_servicio', p_servicio::text, true);
  -- Reactivado, el Servicio vuelve a tener duración indeterminada hasta que se le ponga otro fin.
  UPDATE servicios SET estado = 'vigente', vigente_hasta = NULL WHERE id = p_servicio;
  PERFORM set_config('careonys.cambio_de_estado_del_servicio', '', true);

  RETURN v_reactivacion;
END;
$function$;
CREATE FUNCTION public.reanudar_cobertura(p_interrupcion uuid, p_desde date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prest    uuid := interno.prestadora_actual();
  v_servicio uuid;
  v_hoy      date;
BEGIN
  SELECT i.servicio_id INTO v_servicio FROM interrupciones_de_cobertura i
   WHERE i.id = p_interrupcion AND i.prestadora_id = v_prest
     AND i.tipo IN ('pausa', 'suspension') AND i.levantada_at IS NULL;
  IF v_servicio IS NULL OR NOT interno.puede_gestionar_la_cobertura(v_servicio) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  v_hoy := (now() AT TIME ZONE interno.zona_horaria_de_la_prestadora(v_prest))::date;
  IF p_desde IS NOT NULL AND p_desde < v_hoy THEN
    RAISE EXCEPTION 'la_fecha_ya_paso' USING ERRCODE = 'P0001';
  END IF;

  PERFORM interno.levantar_interrupcion(p_interrupcion, COALESCE(p_desde, v_hoy));
  PERFORM interno.anotar_turnos_sin_cubrir();
END;
$function$;
GRANT ALL ON FUNCTION public.reanudar_cobertura(uuid, date) TO authenticated;
GRANT ALL ON FUNCTION public.reanudar_cobertura(uuid, date) TO service_role;
CREATE FUNCTION public.registrar_hospitalizacion(p_paciente uuid, p_institucion text, p_motivo text, p_fecha_inicio date, p_domicilio jsonb, p_forma text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_antes      text := coalesce(current_setting('careonys.lectura_de_salud', true), '');
  v_prestadora uuid;
  v_id         uuid := gen_random_uuid();
  v_d          domicilios_temporales_paciente;
  v_forma      text := coalesce(p_forma, CASE WHEN p_domicilio IS NULL THEN 'suspende' ELSE 'muda' END);
BEGIN
  SELECT p.prestadora_id INTO v_prestadora
    FROM pacientes p
   WHERE p.id = p_paciente
     AND p.prestadora_id = interno.prestadora_actual();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(coalesce(p_institucion, '')), '') IS NULL OR p_fecha_inicio IS NULL
     OR (v_forma = 'muda' AND p_domicilio IS NULL) THEN
    RAISE EXCEPTION 'falta_un_dato' USING ERRCODE = '23502';
  END IF;
  -- Tres formas: el Servicio se suspende, se muda al domicilio temporal, o sigue en el domicilio
  -- habitual porque ahí atiende a otro Paciente.
  IF v_forma NOT IN ('suspende', 'muda', 'sigue') OR (v_forma <> 'muda' AND p_domicilio IS NOT NULL) THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;

  -- El identificador se arma acá y no se lee de vuelta: quien no alcanza la información de salud
  -- del Paciente puede registrar la internación, pero no leerla.
  PERFORM set_config('careonys.lectura_de_salud', 'anotada', true);
  INSERT INTO hospitalizaciones_paciente
    (id, prestadora_id, paciente_id, institucion, motivo, fecha_inicio, registrado_por, forma)
  VALUES
    (v_id, v_prestadora, p_paciente, btrim(p_institucion), nullif(btrim(coalesce(p_motivo, '')), ''),
     p_fecha_inicio, interno.usuario_de_la_sesion(), v_forma);
  PERFORM set_config('careonys.lectura_de_salud', v_antes, true);
  PERFORM interno.anotar_lo_que_se_leyo('hospitalizaciones_paciente', ARRAY[p_paciente], 'registrar_hospitalizacion');

  IF v_forma = 'muda' THEN
    v_d := jsonb_populate_record(NULL::domicilios_temporales_paciente, p_domicilio);
    INSERT INTO domicilios_temporales_paciente
      (prestadora_id, paciente_id, hospitalizacion_id, domicilio, calle, numero, piso, unidad,
       lugar_id, codigo_postal, lat, lng, motivo, fecha_inicio)
    VALUES
      (v_prestadora, p_paciente, v_id, v_d.domicilio, v_d.calle, v_d.numero, v_d.piso, v_d.unidad,
       v_d.lugar_id, v_d.codigo_postal, v_d.lat, v_d.lng, v_d.motivo, p_fecha_inicio);
  ELSIF v_forma = 'suspende' THEN
    -- Se suspende cada Servicio vigente que atiende a este Paciente.
    PERFORM interno.suspender_por_la_internacion(v_id);
  END IF;

  PERFORM interno.anotar_turnos_sin_cubrir();
  RETURN v_id;
END;
$function$;
GRANT ALL ON FUNCTION public.registrar_hospitalizacion(uuid, text, text, date, jsonb, text) TO authenticated;
GRANT ALL ON FUNCTION public.registrar_hospitalizacion(uuid, text, text, date, jsonb, text) TO service_role;
CREATE OR REPLACE FUNCTION public.sembrar_motivos_resolucion(p_prestadora_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into motivos_resolucion
    (prestadora_id, tabla, estado, nombre_es_ar, nombre_en, nombre_pt_br, pide_detalle, orden)
  values
    -- Postulaciones.
    (p_prestadora_id, 'postulaciones', 'en_revision',
     'Pasa a revisión', 'Moves to review', 'Passa para análise', false, 10),
    (p_prestadora_id, 'postulaciones', 'aprobado',
     'Reúne lo que el puesto pide', 'Meets what the role requires', 'Atende ao que a vaga exige', false, 20),
    (p_prestadora_id, 'postulaciones', 'rechazado',
     'No reúne la experiencia pedida', 'Does not have the required experience', 'Não tem a experiência exigida', false, 30),
    (p_prestadora_id, 'postulaciones', 'rechazado',
     'Queda fuera de las zonas cubiertas', 'Outside the areas covered', 'Fora das áreas atendidas', false, 40),
    (p_prestadora_id, 'postulaciones', 'rechazado',
     'No se presentó a la entrevista', 'Did not attend the interview', 'Não compareceu à entrevista', false, 50),
    (p_prestadora_id, 'postulaciones', 'rechazado',
     'Pidió retirar su postulación', 'Asked to withdraw the application', 'Pediu para retirar a candidatura', false, 60),
    (p_prestadora_id, 'postulaciones', 'rechazado',
     'Otro motivo', 'Other reason', 'Outro motivo', true, 99),
    -- Guardias. Por ahora sólo las canceladas: es la decisión que se toma mirando la Guardia y que
    -- hasta hoy no dejaba rastro. La llegada y la salida las escribe el motor cuando pasan, y no
    -- se resuelven con un motivo porque no son una decisión sino un hecho.
    (p_prestadora_id, 'turnos_guardia', 'cancelada',
     'El Cliente la dio de baja', 'The Client cancelled it', 'O Cliente cancelou', false, 10),
    (p_prestadora_id, 'turnos_guardia', 'cancelada',
     'El Paciente quedó internado', 'The Patient was admitted to hospital', 'O Paciente ficou internado', false, 20),
    (p_prestadora_id, 'turnos_guardia', 'cancelada',
     'No se consiguió quién la cubriera', 'Nobody could be found to cover it', 'Não foi possível encontrar quem cobrisse', false, 30),
    (p_prestadora_id, 'turnos_guardia', 'cancelada',
     'Terminó el Servicio', 'The Service ended', 'O Serviço terminou', false, 40),
    (p_prestadora_id, 'turnos_guardia', 'cancelada',
     'Se había cargado por error', 'It had been entered by mistake', 'Tinha sido cadastrado por engano', false, 50),
    (p_prestadora_id, 'turnos_guardia', 'cancelada',
     'Otro motivo', 'Other reason', 'Outro motivo', true, 99),
    -- Por qué un Asistente rechaza el turno que se le asignó.
    (p_prestadora_id, 'asignaciones_de_turno_guardia', 'rechazada',
     'Problema de salud', 'Health problem', 'Problema de saúde', false, 10),
    (p_prestadora_id, 'asignaciones_de_turno_guardia', 'rechazada',
     'Compromiso personal o familiar', 'Personal or family commitment', 'Compromisso pessoal ou familiar', false, 20),
    (p_prestadora_id, 'asignaciones_de_turno_guardia', 'rechazada',
     'Viaje o ausencia', 'Travel or absence', 'Viagem ou ausência', false, 30),
    (p_prestadora_id, 'asignaciones_de_turno_guardia', 'rechazada',
     'Distancia al domicilio', 'Distance to the home', 'Distância até o domicílio', false, 40),
    (p_prestadora_id, 'asignaciones_de_turno_guardia', 'rechazada',
     'Otro', 'Other', 'Outro', true, 99),
    -- Por qué se pausa la cobertura: una interrupción breve, con día de vuelta.
    (p_prestadora_id, 'interrupciones_de_cobertura', 'pausa',
     'Vacaciones o viaje del Paciente', 'Patient holiday or trip', 'Férias ou viagem do Paciente', false, 10),
    (p_prestadora_id, 'interrupciones_de_cobertura', 'pausa',
     'Un familiar se ocupa del Paciente', 'A relative is looking after the Patient', 'Um familiar cuida do Paciente', false, 20),
    (p_prestadora_id, 'interrupciones_de_cobertura', 'pausa',
     'Pedido del Cliente', 'Client request', 'Pedido do Cliente', false, 30),
    (p_prestadora_id, 'interrupciones_de_cobertura', 'pausa',
     'Otro motivo', 'Other reason', 'Outro motivo', true, 99),
    -- Por qué se suspende la cobertura: una interrupción larga o sin día de vuelta.
    (p_prestadora_id, 'interrupciones_de_cobertura', 'suspension',
     'Pedido del Cliente', 'Client request', 'Pedido do Cliente', false, 10),
    (p_prestadora_id, 'interrupciones_de_cobertura', 'suspension',
     'Cambio de planes del Cliente', 'Change of plans by the Client', 'Mudança de planos do Cliente', false, 20),
    (p_prestadora_id, 'interrupciones_de_cobertura', 'suspension',
     'Atraso en los pagos', 'Late payments', 'Atraso nos pagamentos', false, 30),
    (p_prestadora_id, 'interrupciones_de_cobertura', 'suspension',
     'A la espera de una decisión', 'Awaiting a decision', 'Aguardando uma decisão', false, 40),
    (p_prestadora_id, 'interrupciones_de_cobertura', 'suspension',
     'Otro motivo', 'Other reason', 'Outro motivo', true, 99),
    -- Por qué se cancela, desde una fecha, un turno de guardia recurrente o una Prestación.
    (p_prestadora_id, 'interrupciones_de_cobertura', 'cancelacion',
     'El Cliente lo dio de baja', 'The Client cancelled it', 'O Cliente cancelou', false, 10),
    (p_prestadora_id, 'interrupciones_de_cobertura', 'cancelacion',
     'Cambió el cronograma del Paciente', 'The Patient schedule changed', 'O cronograma do Paciente mudou', false, 20),
    (p_prestadora_id, 'interrupciones_de_cobertura', 'cancelacion',
     'Terminó la atención', 'The care ended', 'O atendimento terminou', false, 30),
    (p_prestadora_id, 'interrupciones_de_cobertura', 'cancelacion',
     'Se había cargado por error', 'It had been entered by mistake', 'Tinha sido cadastrado por engano', false, 40),
    (p_prestadora_id, 'interrupciones_de_cobertura', 'cancelacion',
     'Otro motivo', 'Other reason', 'Outro motivo', true, 99)
  on conflict do nothing;
end;
$function$;
ALTER TABLE public.hospitalizaciones_paciente ALTER COLUMN forma SET NOT NULL;
ALTER TABLE public.servicios ALTER COLUMN vigente_desde SET NOT NULL;
COMMENT ON COLUMN public.hospitalizaciones_paciente.forma IS 'Qué pasa con el Servicio mientras dura la internación: suspende (el Servicio se suspende), muda (el Servicio se muda al domicilio temporal en la institución) o sigue (el Servicio sigue en el domicilio habitual).';
ALTER TABLE public.hospitalizaciones_paciente ADD CONSTRAINT hospitalizaciones_paciente_forma_check CHECK (forma = ANY (ARRAY['suspende'::text, 'muda'::text, 'sigue'::text]));
CREATE TABLE public.interrupciones_de_cobertura (id uuid DEFAULT gen_random_uuid() NOT NULL, prestadora_id uuid DEFAULT interno.prestadora_actual() NOT NULL, tipo text NOT NULL, alcance text NOT NULL, servicio_id uuid NOT NULL, prestacion_id bigint, serie_id uuid, turno_guardia_id uuid, paciente_id uuid, hospitalizacion_id uuid, desde date NOT NULL, vuelta date, motivo_id uuid, motivo_tabla text GENERATED ALWAYS AS ('interrupciones_de_cobertura'::text) STORED, detalle text, hecha_por uuid DEFAULT interno.usuario_de_la_sesion(), levantada_desde date, levantada_at timestamp with time zone, levantada_por uuid, created_at timestamp with time zone DEFAULT now() NOT NULL);
COMMENT ON TABLE public.interrupciones_de_cobertura IS 'Las pausas, las suspensiones y las cancelaciones de la cobertura de un Servicio, de una Prestación, de un turno de guardia recurrente o de un solo turno de guardia. Se escriben sólo por las funciones de la cobertura y por la internación.';
COMMENT ON COLUMN public.interrupciones_de_cobertura.hospitalizacion_id IS 'La internación del Paciente que suspendió el Servicio. Al cerrarla se levanta sólo esta suspensión.';
COMMENT ON COLUMN public.interrupciones_de_cobertura.vuelta IS 'El día en que la cobertura vuelve. Obligatoria en la pausa, optativa en la suspensión, vacía en la cancelación.';
COMMENT ON COLUMN public.interrupciones_de_cobertura.levantada_desde IS 'El día desde el que se levantó antes de su vuelta: por la reanudación, el fin de la internación o la baja del Servicio.';
ALTER TABLE public.interrupciones_de_cobertura ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interrupciones_de_cobertura ADD CONSTRAINT interrupciones_de_cobertura_alcance_check CHECK (alcance = 'servicio'::text AND prestacion_id IS NULL AND serie_id IS NULL AND turno_guardia_id IS NULL OR alcance = 'prestacion'::text AND prestacion_id IS NOT NULL AND serie_id IS NULL AND turno_guardia_id IS NULL OR alcance = 'turno_guardia_recurrente'::text AND prestacion_id IS NULL AND serie_id IS NOT NULL AND turno_guardia_id IS NULL OR alcance = 'turno_guardia'::text AND prestacion_id IS NULL AND serie_id IS NULL AND turno_guardia_id IS NOT NULL);
ALTER TABLE public.interrupciones_de_cobertura ADD CONSTRAINT interrupciones_de_cobertura_cancelacion_check CHECK (tipo <> 'cancelacion'::text OR (alcance = ANY (ARRAY['prestacion'::text, 'turno_guardia_recurrente'::text])));
ALTER TABLE public.interrupciones_de_cobertura ADD CONSTRAINT interrupciones_de_cobertura_hecha_por_fkey FOREIGN KEY (hecha_por) REFERENCES public.usuarios(id);
ALTER TABLE public.interrupciones_de_cobertura ADD CONSTRAINT interrupciones_de_cobertura_hospitalizacion_fkey FOREIGN KEY (hospitalizacion_id, paciente_id, prestadora_id) REFERENCES public.hospitalizaciones_paciente(id, paciente_id, prestadora_id);
ALTER TABLE public.interrupciones_de_cobertura ADD CONSTRAINT interrupciones_de_cobertura_internacion_check CHECK (hospitalizacion_id IS NULL OR tipo = 'suspension'::text AND alcance = 'servicio'::text);
ALTER TABLE public.interrupciones_de_cobertura ADD CONSTRAINT interrupciones_de_cobertura_levantada_check CHECK ((levantada_desde IS NULL) = (levantada_at IS NULL) AND (levantada_desde IS NULL OR levantada_desde >= desde));
ALTER TABLE public.interrupciones_de_cobertura ADD CONSTRAINT interrupciones_de_cobertura_levantada_por_fkey FOREIGN KEY (levantada_por) REFERENCES public.usuarios(id);
ALTER TABLE public.interrupciones_de_cobertura ADD CONSTRAINT interrupciones_de_cobertura_motivo_check CHECK (motivo_id IS NOT NULL OR hospitalizacion_id IS NOT NULL);
ALTER TABLE public.interrupciones_de_cobertura ADD CONSTRAINT interrupciones_de_cobertura_motivo_fkey FOREIGN KEY (motivo_id, prestadora_id, motivo_tabla, tipo) REFERENCES public.motivos_resolucion(id, prestadora_id, tabla, estado);
ALTER TABLE public.interrupciones_de_cobertura ADD CONSTRAINT interrupciones_de_cobertura_paciente_check CHECK ((paciente_id IS NULL) = (hospitalizacion_id IS NULL));
ALTER TABLE public.interrupciones_de_cobertura ADD CONSTRAINT interrupciones_de_cobertura_pkey PRIMARY KEY (id);
ALTER TABLE public.interrupciones_de_cobertura ADD CONSTRAINT interrupciones_de_cobertura_prestacion_id_fkey FOREIGN KEY (prestacion_id) REFERENCES public.prestaciones(id);
ALTER TABLE public.interrupciones_de_cobertura ADD CONSTRAINT interrupciones_de_cobertura_prestadora_id_fkey FOREIGN KEY (prestadora_id) REFERENCES public.prestadoras(id) ON DELETE CASCADE;
ALTER TABLE public.interrupciones_de_cobertura ADD CONSTRAINT interrupciones_de_cobertura_serie_id_fkey FOREIGN KEY (serie_id) REFERENCES public.series_turnos_guardia(id);
ALTER TABLE public.interrupciones_de_cobertura ADD CONSTRAINT interrupciones_de_cobertura_servicio_fkey FOREIGN KEY (servicio_id, prestadora_id) REFERENCES public.servicios(id, prestadora_id);
ALTER TABLE public.interrupciones_de_cobertura ADD CONSTRAINT interrupciones_de_cobertura_tipo_check CHECK (tipo = ANY (ARRAY['pausa'::text, 'suspension'::text, 'cancelacion'::text]));
ALTER TABLE public.interrupciones_de_cobertura ADD CONSTRAINT interrupciones_de_cobertura_turno_guardia_id_fkey FOREIGN KEY (turno_guardia_id) REFERENCES public.turnos_guardia(id) ON DELETE CASCADE;
ALTER TABLE public.interrupciones_de_cobertura ADD CONSTRAINT interrupciones_de_cobertura_vuelta_check CHECK (tipo = 'pausa'::text AND vuelta IS NOT NULL OR tipo = 'suspension'::text OR tipo = 'cancelacion'::text AND vuelta IS NULL);
ALTER TABLE public.interrupciones_de_cobertura ADD CONSTRAINT interrupciones_de_cobertura_vuelta_despues_check CHECK (vuelta IS NULL OR vuelta > desde);
GRANT SELECT ON public.interrupciones_de_cobertura TO authenticated;
GRANT ALL ON public.interrupciones_de_cobertura TO service_role;
CREATE INDEX interrupciones_de_cobertura_servicio_idx ON public.interrupciones_de_cobertura (servicio_id, desde);
CREATE INDEX interrupciones_de_cobertura_hospitalizacion_idx ON public.interrupciones_de_cobertura (hospitalizacion_id) WHERE hospitalizacion_id IS NOT NULL;
CREATE POLICY panel_lee_las_interrupciones_de_cobertura ON public.interrupciones_de_cobertura FOR SELECT TO authenticated USING (((prestadora_id = interno.prestadora_actual()) AND interno.puede_gestionar_la_cobertura(servicio_id)));
CREATE UNIQUE INDEX motivos_resolucion_nombre_unico ON public.motivos_resolucion (prestadora_id, tabla, estado, lower(nombre_es_ar));
ALTER TABLE public.series_turnos_guardia ADD CONSTRAINT series_turnos_guardia_estado_check CHECK (estado = ANY (ARRAY['activa'::text, 'cancelada'::text]));
COMMENT ON COLUMN public.servicios.vigente_desde IS 'Primer día del período del Servicio. Si no viene al crearlo, la base pone el día de hoy en la zona horaria de la Prestadora.';
COMMENT ON COLUMN public.servicios.vigente_hasta IS 'Último día del período del Servicio. Vacío es duración indeterminada.';
ALTER TABLE public.servicios ADD CONSTRAINT servicios_periodo_check CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde);
REVOKE INSERT (cliente_id, etiqueta, prestadora_id) ON public.servicios FROM trabajo_sin_persona;
GRANT INSERT (cliente_id, etiqueta, prestadora_id, vigente_desde, vigente_hasta) ON public.servicios TO trabajo_sin_persona;
CREATE TRIGGER periodo_del_servicio BEFORE INSERT OR UPDATE OF vigente_desde, vigente_hasta ON public.servicios FOR EACH ROW EXECUTE FUNCTION interno.periodo_del_servicio();
CREATE TRIGGER turno_guardia_nace_interrumpido AFTER INSERT ON public.turno_guardia_guardias FOR EACH ROW EXECUTE FUNCTION interno.turno_guardia_nace_interrumpido();
ALTER TABLE public.turnos_guardia ADD CONSTRAINT turnos_guardia_cancelacion_alcance_check CHECK (cancelacion_alcance = ANY (ARRAY['servicio'::text, 'prestacion'::text, 'turno_guardia_recurrente'::text, 'turno_guardia'::text]));
ALTER TABLE public.turnos_guardia ADD CONSTRAINT turnos_guardia_estado_check CHECK (estado = ANY (ARRAY['programada'::text, 'activa'::text, 'completada'::text, 'cancelada'::text, 'ausente'::text, 'pausada'::text, 'suspendida'::text]));
ALTER TABLE public.turnos_guardia ADD CONSTRAINT turnos_guardia_sin_cubrir_estado_check CHECK (asistente_id IS NOT NULL OR (estado = ANY (ARRAY['programada'::text, 'cancelada'::text, 'pausada'::text, 'suspendida'::text])));
ALTER TABLE public.turnos_guardia ADD COLUMN interrupcion_id uuid;
ALTER TABLE public.turnos_guardia ADD CONSTRAINT turnos_guardia_interrupcion_check CHECK (interrupcion_id IS NULL OR (estado = ANY (ARRAY['pausada'::text, 'suspendida'::text])));
ALTER TABLE public.turnos_guardia ADD CONSTRAINT turnos_guardia_interrupcion_id_fkey FOREIGN KEY (interrupcion_id) REFERENCES public.interrupciones_de_cobertura(id) ON DELETE SET NULL;

-- Ninguna función nueva queda al alcance de quien no inició sesión.
REVOKE ALL ON FUNCTION "interno"."puede_gestionar_la_cobertura"("p_servicio" "uuid") FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "interno"."prestacion_desciende_de"("p_prestacion" bigint, "p_raiz" bigint) FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "interno"."interrupcion_que_tapa"("p_prestadora" "uuid", "p_servicio" "uuid", "p_prestaciones" bigint[], "p_serie" "uuid", "p_turno_guardia" "uuid", "p_fecha" "date") FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "interno"."reevaluar_turno_guardia"("p_turno_guardia" "uuid") FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "interno"."marcar_turnos_interrumpidos"("p_servicio" "uuid", "p_desde" "date") FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "interno"."levantar_interrupcion"("p_interrupcion" "uuid", "p_desde" "date") FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "interno"."suspender_por_la_internacion"("p_hospitalizacion" "uuid") FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "interno"."levantar_lo_de_la_internacion"("p_hospitalizacion" "uuid", "p_desde" "date") FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "interno"."turno_guardia_nace_interrumpido"() FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "interno"."validar_motivo_de_la_interrupcion"("p_prestadora" "uuid", "p_tipo" "text", "p_motivo" "uuid", "p_detalle" "text") FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "interno"."periodo_del_servicio"() FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."interrumpir_cobertura"("p_tipo" "text", "p_alcance" "text", "p_servicio" "uuid", "p_prestacion" bigint, "p_serie" "uuid", "p_turno_guardia" "uuid", "p_desde" "date", "p_vuelta" "date", "p_motivo" "uuid", "p_detalle" "text") FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."reanudar_cobertura"("p_interrupcion" "uuid", "p_desde" "date") FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."cancelar_cobertura_desde"("p_alcance" "text", "p_prestacion" bigint, "p_serie" "uuid", "p_desde" "date", "p_motivo" "uuid", "p_detalle" "text") FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."editar_turno_guardia_recurrente"("p_serie" "uuid", "p_desde" "date", "p_dias_semana" "text"[], "p_hora_inicio" "text", "p_hora_fin" "text", "p_dias_hasta_el_fin" integer) FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."cambiar_periodo_del_servicio"("p_servicio" "uuid", "p_desde" "date", "p_hasta" "date") FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION public.registrar_hospitalizacion(uuid, text, text, date, jsonb, text) FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';
