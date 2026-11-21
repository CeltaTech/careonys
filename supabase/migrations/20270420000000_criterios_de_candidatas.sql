-- Los criterios para sugerir y asignar Asistentes en un Servicio.
--  * Lugar: si el Asistente acepta el lugar de todos los Pacientes (domicilio o domicilio temporal vigente).
--  * Tareas: una tarea o una vía de medicación prohibida para el tipo de Asistente impide asignarlo;
--    una tarea no incluida en su tipo sólo se informa.
--  * Especialidad: cada tarea del catálogo puede pedir una Especialidad.
--  * Antecedentes: calificaciones, faltas sin aviso y llegadas tarde de los últimos meses.
--  * Valor del Legajo: cada valor guarda desde cuándo rige, con los anteriores, y se ajusta por índice
--    como las prestaciones.
--  * Valor acordado por Servicio y por Asistente, aparte del Legajo, con su moneda.
-- A los valores del Legajo que ya existen se les pone como fecha de inicio el día de su última
-- modificación, en el día de la Prestadora.

SET check_function_bodies = false;
CREATE FUNCTION interno.anotar_quien_decidio_el_valor_acordado()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.decidido_por := interno.usuario_registrado_de_la_sesion();
  RETURN NEW;
END;
$function$;
GRANT ALL ON FUNCTION interno.anotar_quien_decidio_el_valor_acordado() TO service_role;
CREATE FUNCTION interno.el_lugar_esta_cubierto(p_prestadora uuid, p_lugar uuid, p_elegido uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT p_elegido = p_lugar
      OR EXISTS (SELECT 1 FROM public.lugares l
                  WHERE l.id = p_lugar
                    AND l.prestadora_id = p_prestadora
                    AND l.parte_de = p_elegido)
      OR EXISTS (SELECT 1
                   FROM public.zona_lugares zp
                   JOIN public.zona_lugares zc
                     ON zc.zona_id = zp.zona_id AND zc.prestadora_id = p_prestadora
                   JOIN public.zonas_cobertura z
                     ON z.id = zp.zona_id AND z.prestadora_id = p_prestadora AND z.activa
                  WHERE zp.lugar_id = p_lugar
                    AND zp.prestadora_id = p_prestadora
                    AND zc.lugar_id = p_elegido);
$function$;
GRANT ALL ON FUNCTION interno.el_lugar_esta_cubierto(uuid, uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION interno.el_lugar_esta_cubierto(uuid, uuid, uuid) TO service_role;
CREATE FUNCTION interno.el_valor_del_legajo_rige_desde_hoy()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.rige_desde IS NULL THEN
    NEW.rige_desde := interno.hoy_de_la_prestadora(NEW.prestadora_id);
  END IF;
  RETURN NEW;
END;
$function$;
GRANT ALL ON FUNCTION interno.el_valor_del_legajo_rige_desde_hoy() TO service_role;
CREATE FUNCTION interno.guardar_el_valor_anterior_del_legajo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF (NEW.valor_hora, NEW.valor_turno_guardia, NEW.valor_semana, NEW.valor_hora_extra, NEW.moneda, NEW.unidad_medicion)
     IS NOT DISTINCT FROM
     (OLD.valor_hora, OLD.valor_turno_guardia, OLD.valor_semana, OLD.valor_hora_extra, OLD.moneda, OLD.unidad_medicion) THEN
    IF NEW.rige_desde IS NULL OR NEW.rige_desde < OLD.rige_desde THEN
      NEW.rige_desde := OLD.rige_desde;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.rige_desde IS NULL OR NEW.rige_desde = OLD.rige_desde THEN
    NEW.rige_desde := greatest(OLD.rige_desde, interno.hoy_de_la_prestadora(NEW.prestadora_id));
  END IF;

  IF NEW.rige_desde < OLD.rige_desde THEN
    RAISE EXCEPTION 'rige_desde_anterior:' USING ERRCODE = '23514';
  END IF;

  IF NEW.rige_desde > OLD.rige_desde THEN
    INSERT INTO public.remuneraciones_asistente_anteriores (
      prestadora_id, asistente_id, valor_hora, valor_turno_guardia, valor_semana, valor_hora_extra,
      moneda, unidad_medicion, rige_desde, rige_hasta, reemplazado_por)
    VALUES (OLD.prestadora_id, OLD.asistente_id, OLD.valor_hora, OLD.valor_turno_guardia, OLD.valor_semana,
            OLD.valor_hora_extra, OLD.moneda, OLD.unidad_medicion, OLD.rige_desde, NEW.rige_desde,
            interno.usuario_registrado_de_la_sesion());
  END IF;

  RETURN NEW;
END;
$function$;
GRANT ALL ON FUNCTION interno.guardar_el_valor_anterior_del_legajo() TO service_role;
CREATE FUNCTION interno.hay_algo_prohibido_para(p_prestadora uuid, p_tipo uuid, p_servicio uuid, p_pacientes uuid[], p_desde date, p_hasta date)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  WITH tareas AS (
    SELECT x.tarea_id FROM interno.tareas_que_le_tocan(p_servicio, p_tipo) AS x(tarea_id)
  ),
  vias AS (
    SELECT DISTINCT i.via_administracion_id
      FROM public.indicaciones_medicacion i
     WHERE i.prestadora_id = p_prestadora
       AND i.paciente_id = ANY (coalesce(p_pacientes, '{}'::uuid[]))
       AND i.estado = 'aceptada'
       AND i.fecha_desde <= coalesce(p_hasta, 'infinity'::date)
       AND (i.fecha_hasta IS NULL OR i.fecha_hasta >= p_desde)
  )
  SELECT EXISTS (SELECT 1 FROM tareas t
                  WHERE t.tarea_id IN (SELECT interno.tareas_prohibidas_al_tipo(p_prestadora, p_tipo)))
      OR EXISTS (SELECT 1
                   FROM vias v
                   JOIN public.vias_que_alcanza_la_prohibicion vp
                     ON vp.via_administracion_id = v.via_administracion_id
                  WHERE vp.prohibicion_id IN (SELECT interno.prohibiciones_del_tipo(p_prestadora, p_tipo))
                    AND (vp.prestadora_id IS NULL OR vp.prestadora_id = p_prestadora));
$function$;
GRANT ALL ON FUNCTION interno.hay_algo_prohibido_para(uuid, uuid, uuid, uuid[], date, date) TO authenticated;
GRANT ALL ON FUNCTION interno.hay_algo_prohibido_para(uuid, uuid, uuid, uuid[], date, date) TO service_role;
CREATE FUNCTION interno.la_asignacion_no_tiene_nada_prohibido()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_prest      uuid := NEW.prestadora_id;
  v_asistente  uuid;
  v_servicio   uuid;
  v_pacientes  uuid[];
  v_desde      date;
  v_hasta      date;
  v_tipo       uuid;
  g            public.turnos_guardia;
  s            public.series_turnos_guardia;
BEGIN
  IF TG_TABLE_NAME = 'asignaciones_de_turno_guardia' THEN
    IF TG_OP <> 'INSERT' THEN
      RETURN NULL;
    END IF;
    v_asistente := NEW.asistente_id;
    IF NEW.turno_guardia_id IS NOT NULL THEN
      SELECT * INTO g FROM public.turnos_guardia WHERE id = NEW.turno_guardia_id;
    ELSIF NEW.serie_id IS NOT NULL THEN
      SELECT * INTO s FROM public.series_turnos_guardia WHERE id = NEW.serie_id;
    ELSE
      RETURN NULL;
    END IF;
  ELSIF TG_TABLE_NAME = 'turnos_guardia' THEN
    IF TG_OP = 'UPDATE' AND OLD.asistente_id IS NOT DISTINCT FROM NEW.asistente_id THEN
      RETURN NULL;
    END IF;
    v_asistente := NEW.asistente_id;
    SELECT * INTO g FROM public.turnos_guardia WHERE id = NEW.id;
  ELSIF TG_TABLE_NAME = 'series_turnos_guardia' THEN
    IF TG_OP = 'UPDATE' AND OLD.asistente_id IS NOT DISTINCT FROM NEW.asistente_id THEN
      RETURN NULL;
    END IF;
    v_asistente := NEW.asistente_id;
    SELECT * INTO s FROM public.series_turnos_guardia WHERE id = NEW.id;
  ELSE
    RETURN NULL;
  END IF;

  IF v_asistente IS NULL THEN
    RETURN NULL;
  END IF;

  IF g.id IS NOT NULL THEN
    IF g.estado = 'cancelada' THEN
      RETURN NULL;
    END IF;
    v_servicio := g.servicio_id;
    v_desde := g.fecha;
    v_hasta := g.fecha + g.dias_hasta_el_fin;
    v_pacientes := ARRAY(SELECT g.paciente_id
                         UNION SELECT interno.pacientes_del_turno_guardia(g.id));
  ELSIF s.id IS NOT NULL THEN
    IF s.estado = 'cancelada' THEN
      RETURN NULL;
    END IF;
    v_servicio := s.servicio_id;
    v_desde := s.vigente_desde;
    v_hasta := s.vigente_hasta;
    v_pacientes := ARRAY(SELECT s.paciente_id
                         UNION SELECT interno.pacientes_de_la_serie(s.id));
  ELSE
    RETURN NULL;
  END IF;

  SELECT a.tipo_asistente_id INTO v_tipo
    FROM public.asistentes a
   WHERE a.id = v_asistente AND a.prestadora_id = v_prest;

  IF interno.hay_algo_prohibido_para(v_prest, v_tipo, v_servicio, v_pacientes, v_desde, v_hasta) THEN
    RAISE EXCEPTION 'tarea_prohibida_bloquea:' USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$function$;
GRANT ALL ON FUNCTION interno.la_asignacion_no_tiene_nada_prohibido() TO service_role;
CREATE FUNCTION interno.la_especialidad_pedida_es_de_la_tarea()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_pais   text;
  v_tarea  public.tareas_tipo_asistente;
  v_tipo   uuid;
BEGIN
  SELECT p.pais INTO v_pais FROM public.prestadoras p WHERE p.id = NEW.prestadora_id;

  SELECT * INTO v_tarea FROM public.tareas_tipo_asistente t WHERE t.id = NEW.tarea_id;
  IF NOT FOUND
     OR (v_tarea.prestadora_id IS NULL AND v_tarea.pais IS DISTINCT FROM v_pais)
     OR (v_tarea.prestadora_id IS NOT NULL AND v_tarea.prestadora_id <> NEW.prestadora_id) THEN
    RAISE EXCEPTION 'tarea_ajena:' USING ERRCODE = '23514';
  END IF;
  IF v_tarea.clase = 'prohibida' THEN
    RAISE EXCEPTION 'tarea_prohibida:' USING ERRCODE = '23514';
  END IF;

  SELECT e.tipo_asistente_id INTO v_tipo
    FROM public.especialidades e
   WHERE e.id = NEW.especialidad_id AND e.prestadora_id = NEW.prestadora_id;
  IF v_tipo IS DISTINCT FROM v_tarea.tipo_asistente_id THEN
    RAISE EXCEPTION 'especialidad_de_otro_tipo:' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;
GRANT ALL ON FUNCTION interno.la_especialidad_pedida_es_de_la_tarea() TO service_role;
CREATE FUNCTION interno.pacientes_del_servicio_en(p_servicio uuid, p_fecha date)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT DISTINCT p.paciente_id
    FROM public.prestaciones p
    JOIN public.servicios s ON s.id = p.servicio_id AND s.prestadora_id = p.prestadora_id
   WHERE p.servicio_id = p_servicio
     AND p.paciente_id IS NOT NULL
     AND p.estado = 'vigente'
     AND p.vigente_desde <= p_fecha
     AND (p.vigente_hasta IS NULL OR p.vigente_hasta >= p_fecha);
$function$;
GRANT ALL ON FUNCTION interno.pacientes_del_servicio_en(uuid, date) TO authenticated;
GRANT ALL ON FUNCTION interno.pacientes_del_servicio_en(uuid, date) TO service_role;
CREATE FUNCTION interno.prohibiciones_del_tipo(p_prestadora uuid, p_tipo uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT p.id
    FROM public.tareas_tipo_asistente p
   WHERE (p_tipo IS NULL OR p.tipo_asistente_id = p_tipo)
     AND p.clase = 'prohibida'
     AND (p.prestadora_id = p_prestadora
          OR (p.prestadora_id IS NULL
              AND p.pais = (SELECT x.pais FROM public.prestadoras x WHERE x.id = p_prestadora)));
$function$;
GRANT ALL ON FUNCTION interno.prohibiciones_del_tipo(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION interno.prohibiciones_del_tipo(uuid, uuid) TO service_role;
CREATE FUNCTION interno.tareas_prohibidas_al_tipo(p_prestadora uuid, p_tipo uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT DISTINCT a.tarea_id
    FROM public.tareas_que_alcanza_la_prohibicion a
   WHERE a.prohibicion_id IN (SELECT interno.prohibiciones_del_tipo(p_prestadora, p_tipo))
     AND (a.prestadora_id IS NULL OR a.prestadora_id = p_prestadora);
$function$;
GRANT ALL ON FUNCTION interno.tareas_prohibidas_al_tipo(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION interno.tareas_prohibidas_al_tipo(uuid, uuid) TO service_role;
CREATE FUNCTION interno.tareas_que_le_tocan(p_servicio uuid, p_tipo uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT DISTINCT t.tarea_id
    FROM public.tareas_del_servicio t
   WHERE t.servicio_id = p_servicio
     AND (p_tipo IS NULL
          OR t.tipo_asistente_id = p_tipo
          OR NOT EXISTS (SELECT 1 FROM public.tareas_del_servicio x
                          WHERE x.servicio_id = p_servicio AND x.tipo_asistente_id = p_tipo));
$function$;
GRANT ALL ON FUNCTION interno.tareas_que_le_tocan(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION interno.tareas_que_le_tocan(uuid, uuid) TO service_role;
CREATE FUNCTION interno.usuario_registrado_de_la_sesion()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT u.id FROM public.usuarios u WHERE u.id = auth.uid();
$function$;
GRANT ALL ON FUNCTION interno.usuario_registrado_de_la_sesion() TO authenticated;
GRANT ALL ON FUNCTION interno.usuario_registrado_de_la_sesion() TO service_role;
GRANT ALL ON FUNCTION interno.usuario_registrado_de_la_sesion() TO trabajo_sin_persona;
CREATE FUNCTION public.ajustar_valores_del_legajo_por_indice()
 RETURNS TABLE(aplicados integer, propuestos integer, sin_efecto integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_prest      uuid := interno.prestadora_actual();
  v_regla      jsonb;
  v_indice     text;
  v_meses      integer;
  v_ajuste     text;
  v_hoy        date;
  v            record;
  v_ancla      date;
  v_rige       date;
  v_base       date;
  v_nuevo      date;
  v_factor     numeric;
  v_hora       numeric;
  v_turno      numeric;
  v_semana     numeric;
  v_extra      numeric;
  v_propuesta  uuid;
BEGIN
  IF v_prest IS NULL OR coalesce(auth.jwt() ->> 'role', '') <> 'trabajo_sin_persona' THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;

  -- Dos corridas a la vez para la misma Prestadora harían el mismo ajuste dos veces.
  PERFORM pg_advisory_xact_lock(hashtextextended('ajuste_del_legajo:' || v_prest::text, 0));

  aplicados := 0;
  propuestos := 0;
  sin_efecto := 0;
  v_hoy := interno.hoy_de_la_prestadora(v_prest);

  SELECT c.regla INTO v_regla FROM public.configuracion_pago_asistentes c
   WHERE c.prestadora_id = v_prest;

  SELECT x.indice, x.meses, x.ajuste INTO v_indice, v_meses, v_ajuste
    FROM interno.condiciones_del_ajuste_por_indice(coalesce(v_regla, '{}'::jsonb), NULL, NULL, NULL) x;

  -- Las pendientes que ya no corresponden: cambió el valor del Legajo o el índice.
  WITH vencidas AS (
    UPDATE public.propuestas_de_ajuste_del_legajo pr
       SET estado = 'sin_efecto'
     WHERE pr.prestadora_id = v_prest
       AND pr.estado = 'pendiente'
       AND (pr.indice IS DISTINCT FROM v_indice
            OR NOT EXISTS (
              SELECT 1 FROM public.remuneraciones_asistente r
               WHERE r.asistente_id = pr.asistente_id
                 AND r.prestadora_id = v_prest
                 AND r.rige_desde = pr.valor_rige_desde
                 AND r.moneda::text = pr.moneda
                 AND r.unidad_medicion = pr.unidad_medicion
                 AND r.valor_hora IS NOT DISTINCT FROM pr.valor_hora_actual
                 AND r.valor_turno_guardia IS NOT DISTINCT FROM pr.valor_turno_guardia_actual
                 AND r.valor_semana IS NOT DISTINCT FROM pr.valor_semana_actual
                 AND r.valor_hora_extra IS NOT DISTINCT FROM pr.valor_hora_extra_actual))
    RETURNING pr.id
  )
  SELECT count(*) INTO sin_efecto FROM vencidas;

  IF v_indice IS NULL THEN
    RETURN NEXT;
    RETURN;
  END IF;

  FOR v IN
    SELECT r.asistente_id, r.valor_hora, r.valor_turno_guardia, r.valor_semana, r.valor_hora_extra,
           r.moneda::text AS moneda, r.unidad_medicion, r.rige_desde
      FROM public.remuneraciones_asistente r
      JOIN public.asistentes a ON a.id = r.asistente_id AND a.prestadora_id = r.prestadora_id
     WHERE r.prestadora_id = v_prest
       AND a.estado <> 'cesado'
       AND r.rige_desde <= v_hoy
       AND greatest(coalesce(r.valor_hora, 0), coalesce(r.valor_turno_guardia, 0),
                    coalesce(r.valor_semana, 0), coalesce(r.valor_hora_extra, 0)) > 0
       AND NOT EXISTS (SELECT 1 FROM public.propuestas_de_ajuste_del_legajo pr
                        WHERE pr.asistente_id = r.asistente_id AND pr.estado = 'pendiente')
     ORDER BY r.asistente_id
  LOOP
    SELECT greatest(date_trunc('month', v.rige_desde)::date, max(pr.rige_desde))
      INTO v_ancla
      FROM public.propuestas_de_ajuste_del_legajo pr
     WHERE pr.asistente_id = v.asistente_id
       AND pr.valor_rige_desde = v.rige_desde
       AND pr.estado = 'rechazada';

    v_rige := (v_ancla + make_interval(months => v_meses))::date;
    CONTINUE WHEN v_hoy < v_rige;

    v_base := (date_trunc('month', v.rige_desde) - interval '1 month')::date;
    v_nuevo := (v_rige - interval '1 month')::date;

    v_factor := interno.valor_del_indice_de_la_prestadora(v_prest, v_indice, v_nuevo)
              / NULLIF(interno.valor_del_indice_de_la_prestadora(v_prest, v_indice, v_base), 0);
    CONTINUE WHEN v_factor IS NULL;

    v_hora := round(v.valor_hora * v_factor, 2);
    v_turno := round(v.valor_turno_guardia * v_factor, 2);
    v_semana := round(v.valor_semana * v_factor, 2);
    v_extra := round(v.valor_hora_extra * v_factor, 2);
    CONTINUE WHEN (v_hora, v_turno, v_semana, v_extra) IS NOT DISTINCT FROM
                  (v.valor_hora, v.valor_turno_guardia, v.valor_semana, v.valor_hora_extra);

    -- Ya hubo un ajuste para ese mes sobre este valor (rechazado, por ejemplo): no se vuelve a proponer.
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.propuestas_de_ajuste_del_legajo pr
                           WHERE pr.asistente_id = v.asistente_id
                             AND pr.valor_rige_desde = v.rige_desde
                             AND pr.rige_desde = v_rige
                             AND pr.estado <> 'sin_efecto');

    INSERT INTO public.propuestas_de_ajuste_del_legajo (
      prestadora_id, asistente_id, indice, periodo_base, periodo_nuevo, factor, valor_rige_desde,
      rige_desde, moneda, unidad_medicion,
      valor_hora_actual, valor_hora_propuesto, valor_turno_guardia_actual, valor_turno_guardia_propuesto,
      valor_semana_actual, valor_semana_propuesto, valor_hora_extra_actual, valor_hora_extra_propuesto,
      estado)
    VALUES (v_prest, v.asistente_id, v_indice, v_base, v_nuevo, v_factor, v.rige_desde,
            v_rige, v.moneda, v.unidad_medicion,
            v.valor_hora, v_hora, v.valor_turno_guardia, v_turno,
            v.valor_semana, v_semana, v.valor_hora_extra, v_extra,
            CASE WHEN v_ajuste = 'automatico' THEN 'aplicada' ELSE 'pendiente' END)
    RETURNING id INTO v_propuesta;

    IF v_ajuste = 'automatico' THEN
      UPDATE public.remuneraciones_asistente
         SET valor_hora = v_hora, valor_turno_guardia = v_turno, valor_semana = v_semana,
             valor_hora_extra = v_extra, rige_desde = v_rige, updated_at = now()
       WHERE asistente_id = v.asistente_id AND prestadora_id = v_prest;

      INSERT INTO public.registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, detalle)
      VALUES (v_prest, NULL, 'ajuste_del_legajo_aplicado', 'propuestas_de_ajuste_del_legajo', v_propuesta,
              jsonb_build_object('asistente_id', v.asistente_id, 'indice', v_indice, 'rige_desde', v_rige));
      aplicados := aplicados + 1;
    ELSE
      propuestos := propuestos + 1;
    END IF;
  END LOOP;

  RETURN NEXT;
END;
$function$;
GRANT ALL ON FUNCTION public.ajustar_valores_del_legajo_por_indice() TO service_role;
GRANT ALL ON FUNCTION public.ajustar_valores_del_legajo_por_indice() TO trabajo_sin_persona;
CREATE OR REPLACE FUNCTION public.coordinadores_sugeridos_para_el_servicio(p_servicio uuid)
 RETURNS TABLE(coordinador_id uuid, nombre text, servicios_vigentes integer, cubre_el_lugar boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  WITH sesion AS (
    SELECT s.prestadora_id, interno.hoy_de_la_prestadora(s.prestadora_id) AS hoy
      FROM public.servicios s
     WHERE s.id = p_servicio
       AND s.prestadora_id = interno.prestadora_actual()
       AND (interno.es_admin_prestadora() OR interno.es_superadmin())
  ),
  pacientes AS (
    SELECT x.paciente_id
      FROM sesion k
     CROSS JOIN LATERAL interno.pacientes_del_servicio_en(p_servicio, k.hoy) AS x(paciente_id)
  ),
  lugares_del_servicio AS (
    SELECT DISTINCT l.id
      FROM sesion k
     CROSS JOIN LATERAL public.domicilios_de_pacientes_en(ARRAY(SELECT x.paciente_id FROM pacientes x), k.hoy) d
      JOIN public.lugares l ON l.id = d.lugar_id AND l.prestadora_id = k.prestadora_id
  ),
  candidatos AS (
    SELECT u.id AS coordinador_id,
           u.nombre,
           (SELECT count(*)::integer
              FROM public.servicios s
             WHERE s.coordinador_id = u.id
               AND s.prestadora_id = k.prestadora_id
               AND s.estado = 'vigente'
               AND (s.vigente_hasta IS NULL OR s.vigente_hasta >= k.hoy)) AS servicios_vigentes,
           CASE
             WHEN NOT EXISTS (SELECT 1 FROM lugares_del_servicio) THEN NULL
             WHEN NOT EXISTS (SELECT 1 FROM public.usuario_lugares ul
                               WHERE ul.usuario_id = u.id AND ul.prestadora_id = k.prestadora_id) THEN NULL
             ELSE EXISTS (
               SELECT 1
                 FROM lugares_del_servicio ls
                 JOIN public.usuario_lugares ul
                   ON ul.usuario_id = u.id AND ul.prestadora_id = k.prestadora_id
                WHERE interno.el_lugar_esta_cubierto(k.prestadora_id, ls.id, ul.lugar_id))
           END AS cubre_el_lugar
      FROM sesion k
      JOIN public.usuarios u ON u.prestadora_id = k.prestadora_id
     WHERE u.rol = 'coordinador'
       AND u.desactivada_en IS NULL
  )
  SELECT c.coordinador_id, c.nombre, c.servicios_vigentes, c.cubre_el_lugar
    FROM candidatos c
   ORDER BY (c.cubre_el_lugar IS TRUE) DESC, c.servicios_vigentes, c.nombre, c.coordinador_id;
$function$;
CREATE FUNCTION public.criterios_de_candidatas(p_servicio uuid, p_asistentes uuid[], p_turno_guardia uuid DEFAULT NULL::uuid, p_meses_de_antecedentes integer DEFAULT NULL::integer)
 RETURNS TABLE(asistente_id uuid, acepta_lugar boolean, tarea_prohibida boolean, tareas_no_incluidas integer, falta_especialidad integer, promedio_estrellas numeric, cantidad_calificaciones integer, faltas_sin_aviso integer, llegadas_tarde integer, encaja_valor boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH sesion AS (
    SELECT s.prestadora_id,
           interno.hoy_de_la_prestadora(s.prestadora_id) AS hoy,
           interno.zona_horaria_de_la_prestadora(s.prestadora_id) AS zona,
           least(greatest(coalesce(p_meses_de_antecedentes, 6), 1), 24) AS meses
      FROM public.servicios s
     WHERE s.id = p_servicio
       AND interno.puede_gestionar_la_cobertura(p_servicio)
  ),
  turno AS (
    SELECT g.id, g.paciente_id, g.fecha, g.fecha + g.dias_hasta_el_fin AS fin
      FROM public.turnos_guardia g
      JOIN sesion k ON k.prestadora_id = g.prestadora_id
     WHERE g.id = p_turno_guardia
       AND g.servicio_id = p_servicio
  ),
  momento AS (
    SELECT k.prestadora_id, k.hoy, k.zona, k.meses,
           coalesce(t.fecha, k.hoy) AS desde,
           CASE WHEN p_turno_guardia IS NULL THEN NULL ELSE t.fin END AS hasta
      FROM sesion k
      LEFT JOIN turno t ON true
     WHERE p_turno_guardia IS NULL OR t.id IS NOT NULL
  ),
  pacientes AS (
    SELECT t.paciente_id FROM turno t
    UNION
    SELECT interno.pacientes_del_turno_guardia(t.id) FROM turno t
    UNION
    SELECT y.paciente_id
      FROM momento m
     CROSS JOIN LATERAL interno.pacientes_del_servicio_en(p_servicio, m.hoy) AS y(paciente_id)
     WHERE p_turno_guardia IS NULL
  ),
  lugares AS (
    SELECT DISTINCT d.paciente_id, d.lugar_id
      FROM momento m
     CROSS JOIN LATERAL public.domicilios_de_pacientes_en(
             ARRAY(SELECT p.paciente_id FROM pacientes p WHERE p.paciente_id IS NOT NULL), m.desde) d
      JOIN public.lugares l ON l.id = d.lugar_id AND l.prestadora_id = m.prestadora_id
  ),
  candidatas AS (
    SELECT a.id, a.tipo_asistente_id AS tipo, a.prestadora_id
      FROM momento m
      JOIN public.asistentes a ON a.prestadora_id = m.prestadora_id
     WHERE a.id = ANY (coalesce(p_asistentes, '{}'::uuid[]))
  )
  SELECT c.id,
         CASE
           WHEN NOT EXISTS (SELECT 1 FROM lugares) THEN NULL
           WHEN NOT EXISTS (SELECT 1 FROM public.asistente_lugares al
                             WHERE al.asistente_id = c.id AND al.prestadora_id = c.prestadora_id) THEN NULL
           ELSE NOT EXISTS (
             SELECT 1
               FROM (SELECT DISTINCT l.paciente_id FROM lugares l) p
              WHERE NOT EXISTS (
                SELECT 1
                  FROM lugares l
                  JOIN public.asistente_lugares al
                    ON al.asistente_id = c.id AND al.prestadora_id = c.prestadora_id
                 WHERE l.paciente_id = p.paciente_id
                   AND interno.el_lugar_esta_cubierto(c.prestadora_id, l.lugar_id, al.lugar_id)))
         END,
         interno.hay_algo_prohibido_para(
           c.prestadora_id, c.tipo, p_servicio,
           ARRAY(SELECT p.paciente_id FROM pacientes p WHERE p.paciente_id IS NOT NULL), m.desde, m.hasta),
         CASE WHEN c.tipo IS NULL THEN NULL ELSE (
           SELECT count(*)::integer
             FROM interno.tareas_que_le_tocan(p_servicio, c.tipo) AS t(tarea_id)
             JOIN public.tareas_tipo_asistente tt ON tt.id = t.tarea_id
            WHERE NOT (tt.tipo_asistente_id = c.tipo AND tt.clase = 'habilitada')
              AND t.tarea_id NOT IN (SELECT interno.tareas_prohibidas_al_tipo(c.prestadora_id, c.tipo)))
         END,
         (SELECT count(*)::integer
            FROM interno.tareas_que_le_tocan(p_servicio, c.tipo) AS t(tarea_id)
            JOIN public.especialidad_que_pide_la_tarea e
              ON e.tarea_id = t.tarea_id AND e.prestadora_id = c.prestadora_id
           WHERE NOT EXISTS (SELECT 1 FROM public.especialidades_asistente ea
                              WHERE ea.asistente_id = c.id
                                AND ea.prestadora_id = c.prestadora_id
                                AND ea.especialidad_id = e.especialidad_id)),
         cal.promedio,
         cal.cantidad,
         ant.faltas,
         ant.tarde,
         CASE
           WHEN ac.valor IS NULL OR lg.moneda IS NULL OR lg.moneda <> ac.moneda::text THEN NULL
           ELSE ac.valor >= (CASE ac.unidad_medicion
                               WHEN 'hora' THEN lg.valor_hora
                               WHEN 'turno_guardia' THEN lg.valor_turno_guardia
                               WHEN 'semana' THEN lg.valor_semana
                             END)
         END
    FROM candidatas c
   CROSS JOIN momento m
    LEFT JOIN LATERAL (
      SELECT round(avg(ca.estrellas)::numeric, 2) AS promedio, count(*)::integer AS cantidad
        FROM public.calificaciones_asistente ca
       WHERE ca.asistente_id = c.id
         AND ca.prestadora_id = c.prestadora_id
         AND ca.created_at >= ((m.hoy - make_interval(months => m.meses))::timestamp AT TIME ZONE m.zona)
    ) cal ON true
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (
               WHERE g.estado = 'ausente'
                 AND g.checkin_at IS NULL
                 AND NOT EXISTS (
                   SELECT 1 FROM public.ausencias au
                    WHERE au.asistente_id = c.id
                      AND au.prestadora_id = c.prestadora_id
                      AND g.fecha BETWEEN au.fecha_inicio AND au.fecha_fin
                      AND au.avisada_en <= ((g.fecha + g.hora_inicio) AT TIME ZONE m.zona)))::integer AS faltas,
             count(*) FILTER (WHERE g.llegada_tarde)::integer AS tarde
        FROM public.turnos_guardia g
       WHERE g.asistente_id = c.id
         AND g.prestadora_id = c.prestadora_id
         AND g.fecha > (m.hoy - make_interval(months => m.meses))::date
         AND g.fecha <= m.hoy
    ) ant ON true
    LEFT JOIN LATERAL (
      SELECT v.valor, v.unidad_medicion, v.moneda
        FROM public.valores_acordados_del_servicio v
       WHERE v.servicio_id = p_servicio
         AND v.asistente_id = c.id
         AND v.prestadora_id = c.prestadora_id
         AND v.rige_desde <= m.desde
       ORDER BY v.rige_desde DESC
       LIMIT 1
    ) ac ON true
    LEFT JOIN LATERAL public.valor_del_legajo_en(c.id, m.desde) lg ON true
   ORDER BY c.id;
$function$;
GRANT ALL ON FUNCTION public.criterios_de_candidatas(uuid, uuid[], uuid, integer) TO authenticated;
GRANT ALL ON FUNCTION public.criterios_de_candidatas(uuid, uuid[], uuid, integer) TO service_role;
CREATE FUNCTION public.revisar_propuesta_de_ajuste_del_legajo(p_propuesta uuid, p_aceptar boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_prest  uuid := interno.prestadora_actual();
  v_quien  uuid := interno.usuario_de_la_sesion();
  pr       public.propuestas_de_ajuste_del_legajo;
  r        public.remuneraciones_asistente;
BEGIN
  IF v_prest IS NULL OR v_quien IS NULL
     OR NOT interno.es_la_administracion_de_la_prestadora(v_prest)
     OR NOT interno.tiene_permiso('ver_pagos_asistente') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_aceptar IS NULL THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO pr FROM public.propuestas_de_ajuste_del_legajo
   WHERE id = p_propuesta AND prestadora_id = v_prest
   FOR UPDATE;
  IF NOT FOUND OR pr.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF NOT p_aceptar THEN
    UPDATE public.propuestas_de_ajuste_del_legajo
       SET estado = 'rechazada', revisada_por = v_quien, revisada_en = now()
     WHERE id = pr.id;

    INSERT INTO public.registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, detalle)
    VALUES (v_prest, v_quien, 'ajuste_del_legajo_rechazado', 'propuestas_de_ajuste_del_legajo', pr.id,
            jsonb_build_object('asistente_id', pr.asistente_id, 'indice', pr.indice, 'rige_desde', pr.rige_desde));
    RETURN;
  END IF;

  SELECT * INTO r FROM public.remuneraciones_asistente
   WHERE asistente_id = pr.asistente_id AND prestadora_id = v_prest
   FOR UPDATE;
  IF NOT FOUND
     OR r.rige_desde <> pr.valor_rige_desde
     OR r.moneda::text <> pr.moneda
     OR r.unidad_medicion <> pr.unidad_medicion
     OR (r.valor_hora, r.valor_turno_guardia, r.valor_semana, r.valor_hora_extra) IS DISTINCT FROM
        (pr.valor_hora_actual, pr.valor_turno_guardia_actual, pr.valor_semana_actual, pr.valor_hora_extra_actual) THEN
    RAISE EXCEPTION 'ya_reemplazado' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.remuneraciones_asistente
     SET valor_hora = pr.valor_hora_propuesto, valor_turno_guardia = pr.valor_turno_guardia_propuesto,
         valor_semana = pr.valor_semana_propuesto, valor_hora_extra = pr.valor_hora_extra_propuesto,
         rige_desde = pr.rige_desde, updated_at = now()
   WHERE asistente_id = pr.asistente_id AND prestadora_id = v_prest;

  UPDATE public.propuestas_de_ajuste_del_legajo
     SET estado = 'aceptada', revisada_por = v_quien, revisada_en = now()
   WHERE id = pr.id;

  INSERT INTO public.registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, detalle)
  VALUES (v_prest, v_quien, 'ajuste_del_legajo_aceptado', 'propuestas_de_ajuste_del_legajo', pr.id,
          jsonb_build_object('asistente_id', pr.asistente_id, 'indice', pr.indice, 'rige_desde', pr.rige_desde));
END;
$function$;
GRANT ALL ON FUNCTION public.revisar_propuesta_de_ajuste_del_legajo(uuid, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.revisar_propuesta_de_ajuste_del_legajo(uuid, boolean) TO service_role;
CREATE FUNCTION public.valor_del_legajo_en(p_asistente uuid, p_fecha date)
 RETURNS TABLE(valor_hora numeric, valor_turno_guardia numeric, valor_semana numeric, valor_hora_extra numeric, moneda text, unidad_medicion text, rige_desde date)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT x.valor_hora, x.valor_turno_guardia, x.valor_semana, x.valor_hora_extra,
         x.moneda, x.unidad_medicion, x.rige_desde
    FROM (
      SELECT r.valor_hora, r.valor_turno_guardia, r.valor_semana, r.valor_hora_extra,
             r.moneda::text AS moneda, r.unidad_medicion, r.rige_desde
        FROM public.remuneraciones_asistente r
       WHERE r.asistente_id = p_asistente
      UNION ALL
      SELECT h.valor_hora, h.valor_turno_guardia, h.valor_semana, h.valor_hora_extra,
             h.moneda::text, h.unidad_medicion, h.rige_desde
        FROM public.remuneraciones_asistente_anteriores h
       WHERE h.asistente_id = p_asistente
    ) x
   ORDER BY (x.rige_desde <= p_fecha) DESC,
            CASE WHEN x.rige_desde <= p_fecha THEN x.rige_desde END DESC NULLS LAST,
            x.rige_desde
   LIMIT 1;
$function$;
GRANT ALL ON FUNCTION public.valor_del_legajo_en(uuid, date) TO authenticated;
GRANT ALL ON FUNCTION public.valor_del_legajo_en(uuid, date) TO service_role;
GRANT ALL ON FUNCTION public.valor_del_legajo_en(uuid, date) TO trabajo_sin_persona;
CREATE CONSTRAINT TRIGGER nada_prohibido_en_la_asignacion AFTER INSERT ON public.asignaciones_de_turno_guardia DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION interno.la_asignacion_no_tiene_nada_prohibido();
CREATE TABLE public.especialidad_que_pide_la_tarea (id uuid DEFAULT gen_random_uuid() NOT NULL, prestadora_id uuid NOT NULL, tarea_id uuid NOT NULL, especialidad_id uuid NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.especialidad_que_pide_la_tarea ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.especialidad_que_pide_la_tarea ADD CONSTRAINT especialidad_que_pide_la_tarea_especialidad_fkey FOREIGN KEY (especialidad_id, prestadora_id) REFERENCES public.especialidades(id, prestadora_id) ON DELETE CASCADE;
ALTER TABLE public.especialidad_que_pide_la_tarea ADD CONSTRAINT especialidad_que_pide_la_tarea_pkey PRIMARY KEY (id);
ALTER TABLE public.especialidad_que_pide_la_tarea ADD CONSTRAINT especialidad_que_pide_la_tarea_prestadora_id_fkey FOREIGN KEY (prestadora_id) REFERENCES public.prestadoras(id) ON DELETE CASCADE;
ALTER TABLE public.especialidad_que_pide_la_tarea ADD CONSTRAINT especialidad_que_pide_la_tarea_tarea_id_fkey FOREIGN KEY (tarea_id) REFERENCES public.tareas_tipo_asistente(id) ON DELETE CASCADE;
ALTER TABLE public.especialidad_que_pide_la_tarea ADD CONSTRAINT especialidad_que_pide_la_tarea_una_por_tarea UNIQUE (prestadora_id, tarea_id);
GRANT DELETE, INSERT, SELECT, UPDATE ON public.especialidad_que_pide_la_tarea TO authenticated;
GRANT ALL ON public.especialidad_que_pide_la_tarea TO service_role;
CREATE INDEX especialidad_que_pide_la_tarea_especialidad ON public.especialidad_que_pide_la_tarea (especialidad_id);
CREATE TRIGGER la_especialidad_pedida_es_de_la_tarea BEFORE INSERT OR UPDATE ON public.especialidad_que_pide_la_tarea FOR EACH ROW EXECUTE FUNCTION interno.la_especialidad_pedida_es_de_la_tarea();
CREATE POLICY la_administracion_gestiona_las_especialidades_de_las_tareas ON public.especialidad_que_pide_la_tarea TO authenticated USING (interno.es_la_administracion_de_la_prestadora(prestadora_id)) WITH CHECK (interno.es_la_administracion_de_la_prestadora(prestadora_id));
CREATE POLICY su_prestadora_lee_las_especialidades_que_piden_las_tareas ON public.especialidad_que_pide_la_tarea FOR SELECT TO authenticated USING (((prestadora_id = interno.prestadora_actual()) AND interno.es_personal_de_la_prestadora()));
CREATE TABLE public.propuestas_de_ajuste_del_legajo (id uuid DEFAULT gen_random_uuid() NOT NULL, prestadora_id uuid NOT NULL, asistente_id uuid NOT NULL, indice text NOT NULL, periodo_base date NOT NULL, periodo_nuevo date NOT NULL, factor numeric NOT NULL, valor_rige_desde date NOT NULL, rige_desde date NOT NULL, moneda text NOT NULL, unidad_medicion text NOT NULL, valor_hora_actual numeric(12,2), valor_hora_propuesto numeric(12,2), valor_turno_guardia_actual numeric(12,2), valor_turno_guardia_propuesto numeric(12,2), valor_semana_actual numeric(12,2), valor_semana_propuesto numeric(12,2), valor_hora_extra_actual numeric(12,2), valor_hora_extra_propuesto numeric(12,2), estado text DEFAULT 'pendiente'::text NOT NULL, revisada_por uuid, revisada_en timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.propuestas_de_ajuste_del_legajo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propuestas_de_ajuste_del_legajo ADD CONSTRAINT propuestas_de_ajuste_del_legajo_asistente_fkey FOREIGN KEY (asistente_id, prestadora_id) REFERENCES public.asistentes(id, prestadora_id) ON DELETE CASCADE;
ALTER TABLE public.propuestas_de_ajuste_del_legajo ADD CONSTRAINT propuestas_de_ajuste_del_legajo_estado_check CHECK (estado = ANY (ARRAY['pendiente'::text, 'aceptada'::text, 'rechazada'::text, 'aplicada'::text, 'sin_efecto'::text]));
ALTER TABLE public.propuestas_de_ajuste_del_legajo ADD CONSTRAINT propuestas_de_ajuste_del_legajo_periodos_en_orden CHECK (periodo_nuevo > periodo_base);
ALTER TABLE public.propuestas_de_ajuste_del_legajo ADD CONSTRAINT propuestas_de_ajuste_del_legajo_pkey PRIMARY KEY (id);
ALTER TABLE public.propuestas_de_ajuste_del_legajo ADD CONSTRAINT propuestas_de_ajuste_del_legajo_prestadora_id_fkey FOREIGN KEY (prestadora_id) REFERENCES public.prestadoras(id);
ALTER TABLE public.propuestas_de_ajuste_del_legajo ADD CONSTRAINT propuestas_de_ajuste_del_legajo_revisada_por_fkey FOREIGN KEY (revisada_por) REFERENCES public.usuarios(id);
ALTER TABLE public.propuestas_de_ajuste_del_legajo ADD CONSTRAINT propuestas_de_ajuste_del_legajo_revision_completa CHECK ((estado = ANY (ARRAY['aceptada'::text, 'rechazada'::text])) = (revisada_en IS NOT NULL));
ALTER TABLE public.propuestas_de_ajuste_del_legajo ADD CONSTRAINT propuestas_de_ajuste_del_legajo_rige_desde_check CHECK (rige_desde = date_trunc('month'::text, rige_desde::timestamp with time zone)::date);
ALTER TABLE public.propuestas_de_ajuste_del_legajo ADD CONSTRAINT propuestas_de_ajuste_del_legajo_rige_despues CHECK (rige_desde > valor_rige_desde);
GRANT SELECT ON public.propuestas_de_ajuste_del_legajo TO authenticated;
GRANT ALL ON public.propuestas_de_ajuste_del_legajo TO service_role;
CREATE INDEX propuestas_de_ajuste_del_legajo_por_prestadora ON public.propuestas_de_ajuste_del_legajo (prestadora_id, estado);
CREATE UNIQUE INDEX propuestas_de_ajuste_del_legajo_una_por_mes ON public.propuestas_de_ajuste_del_legajo (asistente_id, valor_rige_desde, rige_desde) WHERE estado <> 'sin_efecto'::text;
CREATE UNIQUE INDEX propuestas_de_ajuste_del_legajo_una_pendiente ON public.propuestas_de_ajuste_del_legajo (asistente_id) WHERE estado = 'pendiente'::text;
CREATE POLICY la_administracion_lee_las_propuestas_del_legajo ON public.propuestas_de_ajuste_del_legajo FOR SELECT TO authenticated USING (((prestadora_id = interno.prestadora_actual()) AND interno.es_la_administracion_de_la_prestadora(prestadora_id) AND interno.tiene_permiso('ver_pagos_asistente'::text)));
ALTER TABLE public.remuneraciones_asistente ADD COLUMN rige_desde date;
UPDATE public.remuneraciones_asistente r
   SET rige_desde = (r.updated_at AT TIME ZONE interno.zona_horaria_de_la_prestadora(r.prestadora_id))::date;
ALTER TABLE public.remuneraciones_asistente ALTER COLUMN rige_desde SET NOT NULL;
CREATE TRIGGER el_valor_del_legajo_rige_desde_hoy BEFORE INSERT ON public.remuneraciones_asistente FOR EACH ROW EXECUTE FUNCTION interno.el_valor_del_legajo_rige_desde_hoy();
CREATE TRIGGER guardar_el_valor_anterior_del_legajo BEFORE UPDATE ON public.remuneraciones_asistente FOR EACH ROW EXECUTE FUNCTION interno.guardar_el_valor_anterior_del_legajo();
CREATE TABLE public.remuneraciones_asistente_anteriores (id uuid DEFAULT gen_random_uuid() NOT NULL, prestadora_id uuid NOT NULL, asistente_id uuid NOT NULL, valor_hora numeric(12,2), valor_turno_guardia numeric(12,2), valor_semana numeric(12,2), valor_hora_extra numeric(12,2), moneda public.moneda_iso NOT NULL, unidad_medicion text NOT NULL, rige_desde date NOT NULL, rige_hasta date NOT NULL, reemplazado_en timestamp with time zone DEFAULT now() NOT NULL, reemplazado_por uuid);
ALTER TABLE public.remuneraciones_asistente_anteriores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remuneraciones_asistente_anteriores ADD CONSTRAINT remuneraciones_asistente_anteriores_asistente_fkey FOREIGN KEY (asistente_id, prestadora_id) REFERENCES public.asistentes(id, prestadora_id) ON DELETE CASCADE;
ALTER TABLE public.remuneraciones_asistente_anteriores ADD CONSTRAINT remuneraciones_asistente_anteriores_en_orden CHECK (rige_hasta > rige_desde);
ALTER TABLE public.remuneraciones_asistente_anteriores ADD CONSTRAINT remuneraciones_asistente_anteriores_pkey PRIMARY KEY (id);
ALTER TABLE public.remuneraciones_asistente_anteriores ADD CONSTRAINT remuneraciones_asistente_anteriores_reemplazado_por_fkey FOREIGN KEY (reemplazado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;
GRANT SELECT ON public.remuneraciones_asistente_anteriores TO authenticated;
GRANT ALL ON public.remuneraciones_asistente_anteriores TO service_role;
CREATE INDEX remuneraciones_asistente_anteriores_por_fecha ON public.remuneraciones_asistente_anteriores (asistente_id, rige_desde);
CREATE POLICY lee_los_valores_anteriores_quien_tiene_el_permiso ON public.remuneraciones_asistente_anteriores FOR SELECT TO authenticated USING (((prestadora_id = interno.prestadora_actual()) AND interno.tiene_permiso('ver_pagos_asistente'::text)));
CREATE CONSTRAINT TRIGGER nada_prohibido_en_la_serie AFTER INSERT OR UPDATE OF asistente_id ON public.series_turnos_guardia DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION interno.la_asignacion_no_tiene_nada_prohibido();
CREATE CONSTRAINT TRIGGER nada_prohibido_en_el_turno_guardia AFTER INSERT OR UPDATE OF asistente_id ON public.turnos_guardia DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION interno.la_asignacion_no_tiene_nada_prohibido();
CREATE TABLE public.valores_acordados_del_servicio (id uuid DEFAULT gen_random_uuid() NOT NULL, prestadora_id uuid NOT NULL, servicio_id uuid NOT NULL, asistente_id uuid NOT NULL, rige_desde date NOT NULL, unidad_medicion text NOT NULL, valor numeric(12,2) NOT NULL, moneda public.moneda_iso NOT NULL, decidido_por uuid, created_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.valores_acordados_del_servicio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.valores_acordados_del_servicio ADD CONSTRAINT valores_acordados_del_servicio_asistente_fkey FOREIGN KEY (asistente_id, prestadora_id) REFERENCES public.asistentes(id, prestadora_id) ON DELETE CASCADE;
ALTER TABLE public.valores_acordados_del_servicio ADD CONSTRAINT valores_acordados_del_servicio_decidido_por_fkey FOREIGN KEY (decidido_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;
ALTER TABLE public.valores_acordados_del_servicio ADD CONSTRAINT valores_acordados_del_servicio_pkey PRIMARY KEY (id);
ALTER TABLE public.valores_acordados_del_servicio ADD CONSTRAINT valores_acordados_del_servicio_servicio_fkey FOREIGN KEY (servicio_id, prestadora_id) REFERENCES public.servicios(id, prestadora_id) ON DELETE CASCADE;
ALTER TABLE public.valores_acordados_del_servicio ADD CONSTRAINT valores_acordados_del_servicio_unidad_conocida CHECK (unidad_medicion = ANY (ARRAY['hora'::text, 'turno_guardia'::text, 'semana'::text, 'mes'::text]));
ALTER TABLE public.valores_acordados_del_servicio ADD CONSTRAINT valores_acordados_del_servicio_uno_por_fecha UNIQUE (servicio_id, asistente_id, rige_desde);
ALTER TABLE public.valores_acordados_del_servicio ADD CONSTRAINT valores_acordados_del_servicio_valor_positivo CHECK (valor > 0::numeric);
GRANT DELETE, INSERT, SELECT, UPDATE ON public.valores_acordados_del_servicio TO authenticated;
GRANT ALL ON public.valores_acordados_del_servicio TO service_role;
CREATE INDEX valores_acordados_del_servicio_por_asistente ON public.valores_acordados_del_servicio (asistente_id, prestadora_id);
CREATE TRIGGER anotar_quien_decidio_el_valor_acordado BEFORE INSERT OR UPDATE ON public.valores_acordados_del_servicio FOR EACH ROW EXECUTE FUNCTION interno.anotar_quien_decidio_el_valor_acordado();
CREATE TRIGGER trg_auditoria_acceso AFTER INSERT OR DELETE OR UPDATE ON public.valores_acordados_del_servicio FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_de_acceso_mutacion();
CREATE TRIGGER trg_completar_moneda BEFORE INSERT ON public.valores_acordados_del_servicio FOR EACH ROW EXECUTE FUNCTION public.fn_completar_moneda();
CREATE POLICY la_administracion_borra_los_valores_acordados ON public.valores_acordados_del_servicio FOR DELETE TO authenticated USING (((prestadora_id = interno.prestadora_actual()) AND interno.es_la_administracion_de_la_prestadora(prestadora_id) AND interno.tiene_permiso('ver_pagos_asistente'::text)));
CREATE POLICY la_administracion_carga_los_valores_acordados ON public.valores_acordados_del_servicio FOR INSERT TO authenticated WITH CHECK (((prestadora_id = interno.prestadora_actual()) AND interno.es_la_administracion_de_la_prestadora(prestadora_id) AND interno.tiene_permiso('ver_pagos_asistente'::text)));
CREATE POLICY la_administracion_edita_los_valores_acordados ON public.valores_acordados_del_servicio FOR UPDATE TO authenticated USING (((prestadora_id = interno.prestadora_actual()) AND interno.es_la_administracion_de_la_prestadora(prestadora_id) AND interno.tiene_permiso('ver_pagos_asistente'::text))) WITH CHECK (((prestadora_id = interno.prestadora_actual()) AND interno.es_la_administracion_de_la_prestadora(prestadora_id) AND interno.tiene_permiso('ver_pagos_asistente'::text)));
CREATE POLICY lee_los_valores_acordados_quien_tiene_el_permiso ON public.valores_acordados_del_servicio FOR SELECT TO authenticated USING (((prestadora_id = interno.prestadora_actual()) AND interno.tiene_permiso('ver_pagos_asistente'::text)));

-- Ninguna función nueva queda al alcance de quien no inició sesión.
REVOKE ALL ON FUNCTION interno.anotar_quien_decidio_el_valor_acordado() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.el_lugar_esta_cubierto(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.el_valor_del_legajo_rige_desde_hoy() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.guardar_el_valor_anterior_del_legajo() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.hay_algo_prohibido_para(uuid, uuid, uuid, uuid[], date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.la_asignacion_no_tiene_nada_prohibido() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.la_especialidad_pedida_es_de_la_tarea() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.pacientes_del_servicio_en(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.prohibiciones_del_tipo(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.tareas_prohibidas_al_tipo(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.tareas_que_le_tocan(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.usuario_registrado_de_la_sesion() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ajustar_valores_del_legajo_por_indice() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.criterios_de_candidatas(uuid, uuid[], uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revisar_propuesta_de_ajuste_del_legajo(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.valor_del_legajo_en(uuid, date) FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';
