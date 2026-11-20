-- El cronograma de guardias de cada Prestación y la cuenta de los turnos sin cubrir.
-- ==================================================================================
--
-- Qué hace:
--
-- 1. Cada Prestación pasa a tener su cronograma de guardias: qué días de la semana, o qué día
--    suelto, y en qué horario hay que cubrirla. Hasta ahora esos datos vivían como texto adentro
--    de la configuración de la Prestación, que no los usaba nadie; desde acá viven en una tabla
--    propia y la configuración deja de guardarlos.
-- 2. Todo turno de guardia tiene que quedar adentro de una guardia del cronograma de una
--    Prestación vigente ese día, de ese Paciente y de ese Servicio. La base anota a qué guardia
--    pertenece cada turno de guardia, uno por cada Paciente que atiende, y rechaza el que queda
--    afuera. Una guardia que ya tiene turnos de guardia no se borra.
-- 3. Cuando una Prestación se reemplaza —el cambio de precio del Panel o el ajuste por índice—,
--    la base le copia sola el cronograma a la Prestación nueva.
-- 4. La cuenta de turnos sin cubrir: qué partes del cronograma no cubre ningún turno de guardia
--    ni ningún recurrente activo. Se pide por Servicio y período, y la base además la anota para
--    avisarle al Coordinador una sola vez por turno. La cuenta corre en el alta del recurrente,
--    en la baja del Servicio, en la internación del Paciente, en el fin de la internación y en el
--    pasaje diario.
-- 5. El alta del recurrente pasa a una sola función, que crea la serie, sus Pacientes y sus turnos
--    de guardia todo junto o nada, y hace la cuenta.
-- 6. La internación pausa y reactiva las guardias por los Pacientes de cada turno de guardia y de
--    cada serie, y no sólo por el Paciente principal.
-- 7. Las tres frases del aviso «Turno sin cubrir», en los tres idiomas.
--
-- Por qué: sin cronograma, el sistema no sabía qué había que cubrir, y un turno sin Asistente que
-- nadie había creado no lo veía nadie.

BEGIN;

SET check_function_bodies = false;
CREATE FUNCTION interno.anotar_la_guardia_del_turno_guardia(p_turno_guardia uuid, p_paciente uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_turno   turnos_guardia%ROWTYPE;
  v_guardia uuid;
BEGIN
  SELECT * INTO v_turno FROM turnos_guardia WHERE id = p_turno_guardia;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  v_guardia := interno.guardia_que_contiene(v_turno.prestadora_id, v_turno.servicio_id, p_paciente,
                                             v_turno.fecha, v_turno.hora_inicio, v_turno.hora_fin,
                                             v_turno.dias_hasta_el_fin);
  IF v_guardia IS NULL THEN
    RAISE EXCEPTION 'turno_guardia_fuera_del_cronograma' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO turno_guardia_guardias (turno_guardia_id, guardia_id, prestadora_id)
  VALUES (p_turno_guardia, v_guardia, v_turno.prestadora_id)
  ON CONFLICT DO NOTHING;
END;
$function$;
GRANT ALL ON FUNCTION interno.anotar_la_guardia_del_turno_guardia(uuid, uuid) TO service_role;
CREATE FUNCTION interno.anotar_turnos_sin_cubrir()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prest      uuid := interno.prestadora_actual();
  v_ahora      timestamp without time zone;
  v_hoy        date;
  v_horizonte  integer;
  v_pendientes integer;
BEGIN
  IF v_prest IS NULL THEN
    RETURN 0;
  END IF;
  SELECT now() AT TIME ZONE interno.zona_horaria_de_la_prestadora(p.id), p.dias_generacion_series_turno_guardia
    INTO v_ahora, v_horizonte
    FROM prestadoras p
   WHERE p.id = v_prest;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  v_hoy := v_ahora::date;

  WITH actuales AS (
    SELECT s.id AS servicio_id, u.guardia_id, u.paciente_id, u.inicio, u.fin
      FROM servicios s
     CROSS JOIN LATERAL interno.turnos_sin_cubrir(v_prest, s.id, v_hoy - 3, v_hoy + COALESCE(v_horizonte, 0)) u
     WHERE s.prestadora_id = v_prest
       AND s.estado = 'vigente'
       AND u.fin > v_ahora
  ), resueltos AS (
    UPDATE turnos_sin_cubrir_avisados a
       SET resuelto_at = now()
     WHERE a.prestadora_id = v_prest
       AND a.resuelto_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM actuales x
                        WHERE x.guardia_id = a.guardia_id AND x.paciente_id = a.paciente_id
                          AND x.inicio = a.inicio AND x.fin = a.fin)
    RETURNING a.id
  )
  INSERT INTO turnos_sin_cubrir_avisados (prestadora_id, servicio_id, guardia_id, paciente_id, inicio, fin)
  SELECT v_prest, x.servicio_id, x.guardia_id, x.paciente_id, x.inicio, x.fin
    FROM actuales x
  ON CONFLICT DO NOTHING;

  SELECT count(*)::integer INTO v_pendientes
    FROM turnos_sin_cubrir_avisados a
   WHERE a.prestadora_id = v_prest AND a.avisado_at IS NULL AND a.resuelto_at IS NULL;
  RETURN v_pendientes;
END;
$function$;
GRANT ALL ON FUNCTION interno.anotar_turnos_sin_cubrir() TO authenticated;
GRANT ALL ON FUNCTION interno.anotar_turnos_sin_cubrir() TO service_role;
GRANT ALL ON FUNCTION interno.anotar_turnos_sin_cubrir() TO trabajo_sin_persona;
CREATE FUNCTION interno.copiar_el_cronograma_de_la_prestacion_anterior()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_vieja cronograma_de_guardias%ROWTYPE;
  v_nueva uuid;
BEGIN
  FOR v_vieja IN SELECT * FROM cronograma_de_guardias c WHERE c.prestacion_id = NEW.prestacion_anterior_id LOOP
    INSERT INTO cronograma_de_guardias (prestadora_id, prestacion_id, dias_semana, fecha, hora_inicio, hora_fin, dias_hasta_el_fin)
    VALUES (NEW.prestadora_id, NEW.id, v_vieja.dias_semana, v_vieja.fecha, v_vieja.hora_inicio, v_vieja.hora_fin, v_vieja.dias_hasta_el_fin)
    RETURNING id INTO v_nueva;

    UPDATE turno_guardia_guardias b
       SET guardia_id = v_nueva
      FROM turnos_guardia t
     WHERE b.guardia_id = v_vieja.id
       AND t.id = b.turno_guardia_id
       AND t.fecha >= NEW.vigente_desde;
  END LOOP;
  RETURN NULL;
END;
$function$;
GRANT ALL ON FUNCTION interno.copiar_el_cronograma_de_la_prestacion_anterior() TO service_role;
CREATE FUNCTION interno.dia_de_la_semana(p_fecha date)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT (ARRAY['lunes','martes','miercoles','jueves','viernes','sabado','domingo'])[extract(isodow FROM p_fecha)::int]
$function$;
COMMENT ON FUNCTION interno.dia_de_la_semana(date) IS 'El nombre del día de la semana de una fecha, escrito como lo guardan los cronogramas y las series: lunes, martes, miercoles, jueves, viernes, sabado, domingo.';
GRANT ALL ON FUNCTION interno.dia_de_la_semana(date) TO authenticated;
GRANT ALL ON FUNCTION interno.dia_de_la_semana(date) TO service_role;
CREATE FUNCTION interno.dias_de_generacion_de_la_prestadora()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT p.dias_generacion_series_turno_guardia::integer FROM prestadoras p WHERE p.id = interno.prestadora_actual()
$function$;
GRANT ALL ON FUNCTION interno.dias_de_generacion_de_la_prestadora() TO authenticated;
GRANT ALL ON FUNCTION interno.dias_de_generacion_de_la_prestadora() TO service_role;
CREATE FUNCTION interno.guardia_con_turnos_guardia_no_se_borra()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM turno_guardia_guardias b WHERE b.guardia_id = OLD.id) THEN
    RAISE EXCEPTION 'guardia_con_turnos_guardia' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$function$;
GRANT ALL ON FUNCTION interno.guardia_con_turnos_guardia_no_se_borra() TO service_role;
CREATE FUNCTION interno.guardia_del_mismo_servicio()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM turnos_guardia t
      JOIN cronograma_de_guardias c ON c.id = NEW.guardia_id
      JOIN prestaciones p ON p.id = c.prestacion_id
     WHERE t.id = NEW.turno_guardia_id
       AND p.servicio_id = t.servicio_id
       AND p.prestadora_id = t.prestadora_id
       AND c.prestadora_id = t.prestadora_id
       AND NEW.prestadora_id = t.prestadora_id
  ) THEN
    RAISE EXCEPTION 'guardia_de_otro_servicio' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;
GRANT ALL ON FUNCTION interno.guardia_del_mismo_servicio() TO service_role;
CREATE FUNCTION interno.guardia_del_paciente_del_turno_guardia()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    DELETE FROM turno_guardia_guardias b
     USING cronograma_de_guardias c, prestaciones p
     WHERE b.turno_guardia_id = OLD.turno_guardia_id
       AND c.id = b.guardia_id
       AND p.id = c.prestacion_id
       AND p.paciente_id = OLD.paciente_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM interno.anotar_la_guardia_del_turno_guardia(NEW.turno_guardia_id, NEW.paciente_id);
  END IF;
  RETURN NULL;
END;
$function$;
GRANT ALL ON FUNCTION interno.guardia_del_paciente_del_turno_guardia() TO service_role;
CREATE FUNCTION interno.guardia_que_contiene(p_prestadora uuid, p_servicio uuid, p_paciente uuid, p_fecha date, p_hora_inicio time without time zone, p_hora_fin time without time zone, p_dias_hasta_el_fin smallint)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT o.guardia_id
    FROM interno.guardias_en_fechas(p_prestadora, p_servicio, p_paciente, p_fecha - 3, p_fecha) o
   WHERE o.inicio <= p_fecha + p_hora_inicio
     AND interno.dia_en_que_termina_turno_guardia(p_fecha, p_hora_inicio, p_hora_fin, p_dias_hasta_el_fin) + p_hora_fin <= o.fin
   ORDER BY o.inicio DESC, o.guardia_id
   LIMIT 1
$function$;
GRANT ALL ON FUNCTION interno.guardia_que_contiene(uuid, uuid, uuid, date, time without time zone, time without time zone, smallint) TO authenticated;
GRANT ALL ON FUNCTION interno.guardia_que_contiene(uuid, uuid, uuid, date, time without time zone, time without time zone, smallint) TO service_role;
CREATE FUNCTION interno.guardias_en_fechas(p_prestadora uuid, p_servicio uuid, p_paciente uuid, p_desde date, p_hasta date)
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
    JOIN cronograma_de_guardias c
      ON c.prestacion_id = p.id
     AND (c.fecha = d.fecha OR interno.dia_de_la_semana(d.fecha) = ANY (c.dias_semana))
$function$;
GRANT ALL ON FUNCTION interno.guardias_en_fechas(uuid, uuid, uuid, date, date) TO service_role;
CREATE FUNCTION interno.rehacer_las_guardias_del_turno_guardia()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_paciente uuid;
BEGIN
  IF (NEW.fecha, NEW.hora_inicio, NEW.hora_fin, NEW.dias_hasta_el_fin, NEW.servicio_id)
     IS NOT DISTINCT FROM (OLD.fecha, OLD.hora_inicio, OLD.hora_fin, OLD.dias_hasta_el_fin, OLD.servicio_id) THEN
    RETURN NULL;
  END IF;
  DELETE FROM turno_guardia_guardias WHERE turno_guardia_id = NEW.id;
  FOR v_paciente IN SELECT tp.paciente_id FROM turno_guardia_pacientes tp WHERE tp.turno_guardia_id = NEW.id LOOP
    PERFORM interno.anotar_la_guardia_del_turno_guardia(NEW.id, v_paciente);
  END LOOP;
  RETURN NULL;
END;
$function$;
GRANT ALL ON FUNCTION interno.rehacer_las_guardias_del_turno_guardia() TO service_role;
CREATE FUNCTION interno.turnos_sin_cubrir(p_prestadora uuid, p_servicio uuid, p_desde date, p_hasta date)
 RETURNS TABLE(prestacion_id bigint, guardia_id uuid, paciente_id uuid, inicio timestamp without time zone, fin timestamp without time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT o.prestacion_id, o.guardia_id, o.paciente_id, lower(h.hueco), upper(h.hueco)
    FROM interno.guardias_en_fechas(p_prestadora, p_servicio, NULL, p_desde, p_hasta) o
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
         UNION ALL
         -- Los turnos de guardia sueltos que no están cancelados ni pausados.
         SELECT CASE WHEN x.fin > x.ini THEN tsrange(x.ini, x.fin) END
           FROM turnos_guardia t
           JOIN turno_guardia_pacientes tp ON tp.turno_guardia_id = t.id AND tp.paciente_id = o.paciente_id
          CROSS JOIN LATERAL (
            SELECT t.fecha + t.hora_inicio AS ini,
                   interno.dia_en_que_termina_turno_guardia(t.fecha, t.hora_inicio, t.hora_fin, t.dias_hasta_el_fin) + t.hora_fin AS fin
          ) x
          WHERE t.prestadora_id = p_prestadora
            AND t.servicio_id = p_servicio
            AND t.serie_id IS NULL
            AND t.estado NOT IN ('cancelada', 'pausada')
            AND t.fecha BETWEEN o.fecha - 3 AND o.fecha + 3
       ) c
   ) cuenta
   CROSS JOIN LATERAL unnest(cuenta.huecos) AS h(hueco)
$function$;
GRANT ALL ON FUNCTION interno.turnos_sin_cubrir(uuid, uuid, date, date) TO service_role;
CREATE FUNCTION public.anotar_turnos_sin_cubrir_de_la_prestadora()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF interno.prestadora_actual() IS NULL OR COALESCE(auth.jwt() ->> 'role', '') <> 'trabajo_sin_persona' THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  RETURN interno.anotar_turnos_sin_cubrir();
END;
$function$;
COMMENT ON FUNCTION public.anotar_turnos_sin_cubrir_de_la_prestadora() IS 'El pasaje diario: rehace la cuenta de turnos sin cubrir de la Prestadora y devuelve cuántos quedan pendientes de avisar. Sólo la llama el trabajo sin persona.';
GRANT ALL ON FUNCTION public.anotar_turnos_sin_cubrir_de_la_prestadora() TO service_role;
GRANT ALL ON FUNCTION public.anotar_turnos_sin_cubrir_de_la_prestadora() TO trabajo_sin_persona;
CREATE OR REPLACE FUNCTION public.cerrar_hospitalizacion(p_hospitalizacion uuid, p_fecha date)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_antes    text := coalesce(current_setting('careonys.lectura_de_salud', true), '');
  v_paciente uuid;
  v_inicio   date;
BEGIN
  PERFORM set_config('careonys.lectura_de_salud', 'anotada', true);
  UPDATE hospitalizaciones_paciente h
     SET fecha_fin = greatest(p_fecha, h.fecha_inicio)
   WHERE h.id = p_hospitalizacion
     AND h.prestadora_id = interno.prestadora_actual()
     AND h.fecha_fin IS NULL
  RETURNING h.paciente_id, h.fecha_inicio INTO v_paciente, v_inicio;
  PERFORM set_config('careonys.lectura_de_salud', v_antes, true);
  IF v_paciente IS NULL THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  PERFORM interno.anotar_lo_que_se_leyo('hospitalizaciones_paciente', ARRAY[v_paciente], 'cerrar_hospitalizacion');

  IF EXISTS (SELECT 1 FROM domicilios_temporales_paciente d WHERE d.hospitalizacion_id = p_hospitalizacion) THEN
    UPDATE domicilios_temporales_paciente d
       SET fecha_fin = greatest(p_fecha, d.fecha_inicio)
     WHERE d.hospitalizacion_id = p_hospitalizacion
       AND (d.fecha_fin IS NULL OR d.fecha_fin > greatest(p_fecha, d.fecha_inicio));
  ELSE
    -- Vuelve lo que la internación había pausado, buscado por la lista de Pacientes de cada turno
    -- de guardia y de cada serie. Lo que además atiende a otro Paciente que sigue internado sin
    -- domicilio temporal queda pausado: su internación todavía no terminó.
    UPDATE turnos_guardia g SET estado = 'programada'
     WHERE g.estado = 'pausada'
       AND EXISTS (SELECT 1 FROM turno_guardia_pacientes tp
                    WHERE tp.turno_guardia_id = g.id AND tp.paciente_id = v_paciente)
       AND NOT EXISTS (SELECT 1 FROM turno_guardia_pacientes tp
                         JOIN hospitalizaciones_paciente h ON h.paciente_id = tp.paciente_id AND h.fecha_fin IS NULL
                        WHERE tp.turno_guardia_id = g.id AND tp.paciente_id <> v_paciente
                          AND NOT EXISTS (SELECT 1 FROM domicilios_temporales_paciente d WHERE d.hospitalizacion_id = h.id));
    UPDATE series_turnos_guardia s SET estado = 'activa'
     WHERE s.estado = 'pausada'
       AND EXISTS (SELECT 1 FROM series_turnos_guardia_pacientes sp
                    WHERE sp.serie_id = s.id AND sp.paciente_id = v_paciente)
       AND NOT EXISTS (SELECT 1 FROM series_turnos_guardia_pacientes sp
                         JOIN hospitalizaciones_paciente h ON h.paciente_id = sp.paciente_id AND h.fecha_fin IS NULL
                        WHERE sp.serie_id = s.id AND sp.paciente_id <> v_paciente
                          AND NOT EXISTS (SELECT 1 FROM domicilios_temporales_paciente d WHERE d.hospitalizacion_id = h.id));
  END IF;

  PERFORM interno.anotar_turnos_sin_cubrir();
END;
$function$;
CREATE FUNCTION public.crear_turno_guardia_recurrente(p_servicio uuid, p_pacientes uuid[], p_dias_semana text[], p_hora_inicio text, p_hora_fin text, p_dias_hasta_el_fin integer, p_modalidad text, p_vigente_desde date, p_vigente_hasta date DEFAULT NULL::date)
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

  INSERT INTO series_turnos_guardia (prestadora_id, servicio_id, paciente_id, dias_semana, hora_inicio, hora_fin,
                                     dias_hasta_el_fin, modalidad, vigente_desde, vigente_hasta)
  VALUES (v_prest, p_servicio, v_pacientes[1], v_dias, v_hi, v_hf, v_fin, p_modalidad, p_vigente_desde, p_vigente_hasta)
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
      FROM generate_series(greatest(p_vigente_desde, v_hoy), greatest(p_vigente_desde, v_hoy) + 6, interval '1 day') AS d
     WHERE interno.dia_de_la_semana(d::date) = v_dia
     LIMIT 1;
    IF v_fecha IS NULL OR (p_vigente_hasta IS NOT NULL AND v_fecha > p_vigente_hasta) THEN
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
  v_desde := greatest(p_vigente_desde, CASE WHEN v_hi > v_ahora::time THEN v_hoy ELSE v_hoy + 1 END);
  v_hasta := v_hoy + v_horizonte;
  IF p_vigente_hasta IS NOT NULL AND p_vigente_hasta < v_hasta THEN
    v_hasta := p_vigente_hasta;
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
GRANT ALL ON FUNCTION public.crear_turno_guardia_recurrente(uuid, uuid[], text[], text, text, integer, text, date, date) TO authenticated;
GRANT ALL ON FUNCTION public.crear_turno_guardia_recurrente(uuid, uuid[], text[], text, text, integer, text, date, date) TO service_role;
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
  UPDATE turnos_guardia
     SET estado = 'cancelada', cancelacion_origen = 'prestadora', cancelacion_alcance = 'total'
   WHERE servicio_id = p_servicio AND estado = 'programada' AND asistente_id IS NULL;

  PERFORM set_config('careonys.cambio_de_estado_del_servicio', p_servicio::text, true);
  UPDATE servicios SET estado = 'de_baja' WHERE id = p_servicio;
  PERFORM set_config('careonys.cambio_de_estado_del_servicio', '', true);

  PERFORM interno.anotar_deuda_de_la_baja(v_baja);

  PERFORM interno.anotar_turnos_sin_cubrir();

  RETURN v_baja;
END;
$function$;
CREATE OR REPLACE FUNCTION public.registrar_hospitalizacion(p_paciente uuid, p_institucion text, p_motivo text, p_fecha_inicio date, p_domicilio jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_antes      text := coalesce(current_setting('careonys.lectura_de_salud', true), '');
  v_prestadora uuid;
  v_id         uuid := gen_random_uuid();
  v_d          domicilios_temporales_paciente;
BEGIN
  SELECT p.prestadora_id INTO v_prestadora
    FROM pacientes p
   WHERE p.id = p_paciente
     AND p.prestadora_id = interno.prestadora_actual();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(coalesce(p_institucion, '')), '') IS NULL OR p_fecha_inicio IS NULL THEN
    RAISE EXCEPTION 'falta_un_dato' USING ERRCODE = '23502';
  END IF;

  -- El identificador se arma acá y no se lee de vuelta: quien no alcanza la información de salud
  -- del Paciente puede registrar la internación, pero no leerla.
  PERFORM set_config('careonys.lectura_de_salud', 'anotada', true);
  INSERT INTO hospitalizaciones_paciente
    (id, prestadora_id, paciente_id, institucion, motivo, fecha_inicio, registrado_por)
  VALUES
    (v_id, v_prestadora, p_paciente, btrim(p_institucion), nullif(btrim(coalesce(p_motivo, '')), ''),
     p_fecha_inicio, interno.usuario_de_la_sesion());
  PERFORM set_config('careonys.lectura_de_salud', v_antes, true);
  PERFORM interno.anotar_lo_que_se_leyo('hospitalizaciones_paciente', ARRAY[p_paciente], 'registrar_hospitalizacion');

  IF p_domicilio IS NULL THEN
    -- Se pausa todo lo que atiende a este Paciente, buscado por la lista de Pacientes de cada
    -- turno de guardia y de cada serie, y no sólo por el primero de la lista.
    UPDATE turnos_guardia g SET estado = 'pausada'
     WHERE g.estado = 'programada' AND g.fecha >= p_fecha_inicio
       AND EXISTS (SELECT 1 FROM turno_guardia_pacientes tp
                    WHERE tp.turno_guardia_id = g.id AND tp.paciente_id = p_paciente);
    UPDATE series_turnos_guardia s SET estado = 'pausada'
     WHERE s.estado = 'activa'
       AND EXISTS (SELECT 1 FROM series_turnos_guardia_pacientes sp
                    WHERE sp.serie_id = s.id AND sp.paciente_id = p_paciente);
    PERFORM interno.anotar_turnos_sin_cubrir();
  ELSE
    v_d := jsonb_populate_record(NULL::domicilios_temporales_paciente, p_domicilio);
    INSERT INTO domicilios_temporales_paciente
      (prestadora_id, paciente_id, hospitalizacion_id, domicilio, calle, numero, piso, unidad,
       lugar_id, codigo_postal, lat, lng, motivo, fecha_inicio)
    VALUES
      (v_prestadora, p_paciente, v_id, v_d.domicilio, v_d.calle, v_d.numero, v_d.piso, v_d.unidad,
       v_d.lugar_id, v_d.codigo_postal, v_d.lat, v_d.lng, v_d.motivo, p_fecha_inicio);
  END IF;

  RETURN v_id;
END;
$function$;
CREATE FUNCTION public.turnos_sin_cubrir(p_servicio uuid, p_desde date, p_hasta date)
 RETURNS TABLE(prestacion_id bigint, guardia_id uuid, paciente_id uuid, fecha date, hora_inicio time without time zone, hora_fin time without time zone, dias_hasta_el_fin smallint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
#variable_conflict use_column
DECLARE
  v_prest uuid := interno.prestadora_actual();
BEGIN
  IF v_prest IS NULL OR p_servicio IS NULL
     OR NOT EXISTS (SELECT 1 FROM servicios s WHERE s.id = p_servicio AND s.prestadora_id = v_prest)
     OR NOT (interno.es_superadmin() OR interno.es_admin_prestadora() OR interno.coordina_el_servicio(p_servicio)
             OR COALESCE(auth.jwt() ->> 'role', '') = 'trabajo_sin_persona') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde THEN
    RAISE EXCEPTION 'periodo_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_hasta - p_desde > 400 THEN
    RAISE EXCEPTION 'periodo_demasiado_largo' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT u.prestacion_id, u.guardia_id, u.paciente_id,
         u.inicio::date, u.inicio::time, u.fin::time,
         (u.fin::date - u.inicio::date)::smallint
    FROM interno.turnos_sin_cubrir(v_prest, p_servicio, p_desde, p_hasta) u
   ORDER BY u.inicio, u.paciente_id, u.guardia_id;
END;
$function$;
COMMENT ON FUNCTION public.turnos_sin_cubrir(uuid,date,date) IS 'Qué días y horarios del cronograma de guardias de un Servicio no cubre ningún turno de guardia, suelto o recurrente vigente, con su Paciente y su Prestación. Sólo dentro de la Prestadora de quien llama.';
GRANT ALL ON FUNCTION public.turnos_sin_cubrir(uuid, date, date) TO authenticated;
GRANT ALL ON FUNCTION public.turnos_sin_cubrir(uuid, date, date) TO service_role;
GRANT ALL ON FUNCTION public.turnos_sin_cubrir(uuid, date, date) TO trabajo_sin_persona;
CREATE TABLE public.cronograma_de_guardias (id uuid DEFAULT gen_random_uuid() NOT NULL, prestadora_id uuid NOT NULL, prestacion_id bigint NOT NULL, dias_semana text[], fecha date, hora_inicio time without time zone NOT NULL, hora_fin time without time zone NOT NULL, dias_hasta_el_fin smallint DEFAULT 0 NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
COMMENT ON TABLE public.cronograma_de_guardias IS 'El cronograma de guardias de una Prestación: una fila por guardia. Una guardia se repite en los días de la semana marcados, o es de una sola fecha. Todo turno de guardia nace adentro de una guardia de este cronograma.';
COMMENT ON COLUMN public.cronograma_de_guardias.dias_hasta_el_fin IS 'Cuántos días después del día de inicio termina la guardia: 0 el mismo día; 1 al siguiente, como la de 22:00 a 06:00 o la de 24 horas de 08:00 a 08:00.';
ALTER TABLE public.cronograma_de_guardias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cronograma_de_guardias ADD CONSTRAINT cronograma_de_guardias_dias_hasta_el_fin_valido CHECK (dias_hasta_el_fin >= 0 AND dias_hasta_el_fin <= 3);
ALTER TABLE public.cronograma_de_guardias ADD CONSTRAINT cronograma_de_guardias_dias_o_fecha CHECK ((dias_semana IS NULL) <> (fecha IS NULL));
ALTER TABLE public.cronograma_de_guardias ADD CONSTRAINT cronograma_de_guardias_dias_validos CHECK (dias_semana IS NULL OR cardinality(dias_semana) > 0 AND dias_semana <@ ARRAY['lunes'::text, 'martes'::text, 'miercoles'::text, 'jueves'::text, 'viernes'::text, 'sabado'::text, 'domingo'::text]);
ALTER TABLE public.cronograma_de_guardias ADD CONSTRAINT cronograma_de_guardias_dura_algo CHECK (dias_hasta_el_fin > 0 OR hora_fin > hora_inicio);
ALTER TABLE public.cronograma_de_guardias ADD CONSTRAINT cronograma_de_guardias_pkey PRIMARY KEY (id);
ALTER TABLE public.cronograma_de_guardias ADD CONSTRAINT cronograma_de_guardias_prestacion_id_fkey FOREIGN KEY (prestacion_id) REFERENCES public.prestaciones(id) ON DELETE CASCADE;
ALTER TABLE public.cronograma_de_guardias ADD CONSTRAINT cronograma_de_guardias_prestadora_id_fkey FOREIGN KEY (prestadora_id) REFERENCES public.prestadoras(id);
GRANT DELETE, INSERT, SELECT ON public.cronograma_de_guardias TO authenticated;
GRANT ALL ON public.cronograma_de_guardias TO service_role;
GRANT SELECT ON public.cronograma_de_guardias TO trabajo_sin_persona;
CREATE INDEX cronograma_de_guardias_prestacion_idx ON public.cronograma_de_guardias (prestacion_id);
CREATE TRIGGER guardia_con_turnos_guardia_no_se_borra BEFORE DELETE ON public.cronograma_de_guardias FOR EACH ROW EXECUTE FUNCTION interno.guardia_con_turnos_guardia_no_se_borra();
CREATE POLICY el_trabajo_lee_el_cronograma_de_guardias ON public.cronograma_de_guardias FOR SELECT TO trabajo_sin_persona USING ((prestadora_id = interno.prestadora_actual()));
CREATE POLICY panel_gestiona_el_cronograma_de_guardias ON public.cronograma_de_guardias TO authenticated USING (((prestadora_id = interno.prestadora_actual()) AND (EXISTS ( SELECT 1
   FROM public.prestaciones p
  WHERE ((p.id = cronograma_de_guardias.prestacion_id) AND (p.prestadora_id = cronograma_de_guardias.prestadora_id)))))) WITH CHECK (((prestadora_id = interno.prestadora_actual()) AND (EXISTS ( SELECT 1
   FROM public.prestaciones p
  WHERE ((p.id = cronograma_de_guardias.prestacion_id) AND (p.prestadora_id = cronograma_de_guardias.prestadora_id))))));
CREATE TRIGGER copiar_el_cronograma_de_la_prestacion_anterior AFTER INSERT ON public.prestaciones FOR EACH ROW WHEN (new.prestacion_anterior_id IS NOT NULL) EXECUTE FUNCTION interno.copiar_el_cronograma_de_la_prestacion_anterior();
COMMENT ON COLUMN public.series_turnos_guardia.servicio_id IS 'De qué Servicio son los turnos de guardia de esta serie. Es obligatorio: toda serie cuelga de un Servicio, y sus turnos de guardia lo copian de acá.';
CREATE TABLE public.turno_guardia_guardias (turno_guardia_id uuid NOT NULL, guardia_id uuid NOT NULL, prestadora_id uuid NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
COMMENT ON TABLE public.turno_guardia_guardias IS 'A qué guardias del cronograma pertenece cada turno de guardia: una por cada Paciente que atiende, porque cada Prestación es de un solo Paciente. La escribe sólo la base.';
ALTER TABLE public.turno_guardia_guardias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turno_guardia_guardias ADD CONSTRAINT turno_guardia_guardias_guardia_id_fkey FOREIGN KEY (guardia_id) REFERENCES public.cronograma_de_guardias(id);
ALTER TABLE public.turno_guardia_guardias ADD CONSTRAINT turno_guardia_guardias_pkey PRIMARY KEY (turno_guardia_id, guardia_id);
ALTER TABLE public.turno_guardia_guardias ADD CONSTRAINT turno_guardia_guardias_prestadora_id_fkey FOREIGN KEY (prestadora_id) REFERENCES public.prestadoras(id);
ALTER TABLE public.turno_guardia_guardias ADD CONSTRAINT turno_guardia_guardias_turno_guardia_id_fkey FOREIGN KEY (turno_guardia_id) REFERENCES public.turnos_guardia(id) ON DELETE CASCADE;
GRANT SELECT ON public.turno_guardia_guardias TO authenticated;
GRANT ALL ON public.turno_guardia_guardias TO service_role;
GRANT SELECT ON public.turno_guardia_guardias TO trabajo_sin_persona;
CREATE INDEX turno_guardia_guardias_guardia_idx ON public.turno_guardia_guardias (guardia_id);
CREATE TRIGGER guardia_del_mismo_servicio BEFORE INSERT OR UPDATE ON public.turno_guardia_guardias FOR EACH ROW EXECUTE FUNCTION interno.guardia_del_mismo_servicio();
CREATE POLICY el_trabajo_lee_las_guardias_de_los_turnos_guardia ON public.turno_guardia_guardias FOR SELECT TO trabajo_sin_persona USING ((prestadora_id = interno.prestadora_actual()));
CREATE POLICY panel_lee_las_guardias_de_los_turnos_guardia ON public.turno_guardia_guardias FOR SELECT TO authenticated USING (((prestadora_id = interno.prestadora_actual()) AND (interno.es_superadmin() OR interno.es_admin_prestadora() OR interno.coordinador_ve_el_turno_guardia(turno_guardia_id))));
CREATE TRIGGER turno_guardia_dentro_del_cronograma AFTER INSERT OR DELETE OR UPDATE ON public.turno_guardia_pacientes FOR EACH ROW EXECUTE FUNCTION interno.guardia_del_paciente_del_turno_guardia();
CREATE TRIGGER turno_guardia_dentro_del_cronograma AFTER UPDATE OF fecha, hora_inicio, hora_fin, dias_hasta_el_fin, servicio_id ON public.turnos_guardia FOR EACH ROW EXECUTE FUNCTION interno.rehacer_las_guardias_del_turno_guardia();
CREATE TABLE public.turnos_sin_cubrir_avisados (id uuid DEFAULT gen_random_uuid() NOT NULL, prestadora_id uuid NOT NULL, servicio_id uuid NOT NULL, guardia_id uuid NOT NULL, paciente_id uuid NOT NULL, inicio timestamp without time zone NOT NULL, fin timestamp without time zone NOT NULL, detectado_at timestamp with time zone DEFAULT now() NOT NULL, avisado_at timestamp with time zone, resuelto_at timestamp with time zone);
COMMENT ON TABLE public.turnos_sin_cubrir_avisados IS 'Los turnos sin cubrir que la base anotó para avisar. Cada uno se avisa una vez; si se cubre queda resuelto, y si vuelve a quedar sin cubrir se anota de nuevo. Inicio y fin van en la hora de la Prestadora.';
ALTER TABLE public.turnos_sin_cubrir_avisados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turnos_sin_cubrir_avisados ADD CONSTRAINT turnos_sin_cubrir_avisados_dura_algo CHECK (fin > inicio);
ALTER TABLE public.turnos_sin_cubrir_avisados ADD CONSTRAINT turnos_sin_cubrir_avisados_guardia_id_fkey FOREIGN KEY (guardia_id) REFERENCES public.cronograma_de_guardias(id) ON DELETE CASCADE;
ALTER TABLE public.turnos_sin_cubrir_avisados ADD CONSTRAINT turnos_sin_cubrir_avisados_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE;
ALTER TABLE public.turnos_sin_cubrir_avisados ADD CONSTRAINT turnos_sin_cubrir_avisados_pkey PRIMARY KEY (id);
ALTER TABLE public.turnos_sin_cubrir_avisados ADD CONSTRAINT turnos_sin_cubrir_avisados_prestadora_id_fkey FOREIGN KEY (prestadora_id) REFERENCES public.prestadoras(id);
ALTER TABLE public.turnos_sin_cubrir_avisados ADD CONSTRAINT turnos_sin_cubrir_avisados_servicio_id_fkey FOREIGN KEY (servicio_id) REFERENCES public.servicios(id) ON DELETE CASCADE;
GRANT ALL ON public.turnos_sin_cubrir_avisados TO service_role;
GRANT SELECT ON public.turnos_sin_cubrir_avisados TO trabajo_sin_persona;
GRANT UPDATE (avisado_at) ON public.turnos_sin_cubrir_avisados TO trabajo_sin_persona;
CREATE INDEX turnos_sin_cubrir_avisados_pendientes_idx ON public.turnos_sin_cubrir_avisados (prestadora_id) WHERE avisado_at IS NULL AND resuelto_at IS NULL;
CREATE UNIQUE INDEX turnos_sin_cubrir_avisados_uno_abierto ON public.turnos_sin_cubrir_avisados (guardia_id, paciente_id, inicio, fin) WHERE resuelto_at IS NULL;
CREATE POLICY el_trabajo_lee_los_turnos_sin_cubrir ON public.turnos_sin_cubrir_avisados FOR SELECT TO trabajo_sin_persona USING ((prestadora_id = interno.prestadora_actual()));
CREATE POLICY el_trabajo_marca_los_turnos_sin_cubrir_avisados ON public.turnos_sin_cubrir_avisados FOR UPDATE TO trabajo_sin_persona USING ((prestadora_id = interno.prestadora_actual())) WITH CHECK ((prestadora_id = interno.prestadora_actual()));


-- Las funciones nuevas no quedan al alcance de quien no inició sesión.
REVOKE ALL ON FUNCTION interno.anotar_la_guardia_del_turno_guardia(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.anotar_turnos_sin_cubrir() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.copiar_el_cronograma_de_la_prestacion_anterior() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.dia_de_la_semana(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.dias_de_generacion_de_la_prestadora() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.guardia_con_turnos_guardia_no_se_borra() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.guardia_del_mismo_servicio() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.guardia_del_paciente_del_turno_guardia() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.guardia_que_contiene(uuid, uuid, uuid, date, time without time zone, time without time zone, smallint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.guardias_en_fechas(uuid, uuid, uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.rehacer_las_guardias_del_turno_guardia() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.turnos_sin_cubrir(uuid, uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.anotar_turnos_sin_cubrir_de_la_prestadora() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crear_turno_guardia_recurrente(uuid, uuid[], text[], text, text, integer, text, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.turnos_sin_cubrir(uuid, date, date) FROM PUBLIC, anon;

-- La configuración de la Prestación deja de guardar los días y el horario: ahora son el
-- cronograma de guardias.
UPDATE public.prestaciones
   SET configuracion = configuracion - 'dias' - 'horario'
 WHERE configuracion ?| ARRAY['dias', 'horario'];

-- Las frases del aviso «Turno sin cubrir».
INSERT INTO public.mensajes_del_sistema (clave, i18n, admite_texto_propio, activo) VALUES
  ('turno_sin_cubrir.asunto_uno', '{"es-AR": "Turno sin cubrir", "en": "Uncovered shift", "pt-BR": "Turno sem cobertura"}'::jsonb, true, true),
  ('turno_sin_cubrir.asunto', '{"es-AR": "Turnos sin cubrir", "en": "Uncovered shifts", "pt-BR": "Turnos sem cobertura"}'::jsonb, true, true),
  ('turno_sin_cubrir.cuerpo', '{"es-AR": "El turno de la guardia correspondiente a {{pacientes}} del día {{fecha}}, de {{horaInicio}} a {{horaFin}} se halla sin cobertura.", "en": "The shift for {{pacientes}} on {{fecha}}, from {{horaInicio}} to {{horaFin}}, is not covered.", "pt-BR": "O turno do plantão correspondente a {{pacientes}} do dia {{fecha}}, das {{horaInicio}} às {{horaFin}}, está sem cobertura."}'::jsonb, true, true);

COMMIT;

NOTIFY pgrst, 'reload schema';
