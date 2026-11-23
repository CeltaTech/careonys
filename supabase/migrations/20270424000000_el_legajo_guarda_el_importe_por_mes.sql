-- El Legajo del Asistente guarda el importe por mes.
--
-- Qué hace: el Legajo ya se podía medir por mes, pero no había dónde guardar cuánto se le paga
-- por mes. Se agrega ese importe en el Legajo, en su historia de valores anteriores y en las
-- propuestas de ajuste por índice, y se lo trata igual que el importe por semana en todo lugar
-- donde la base usa los importes del Legajo:
--   - el paso del valor anterior a la historia cuando cambian los importes;
--   - la consulta del valor del Legajo vigente a una fecha;
--   - el ajuste por índice, que lo ajusta, lo propone y lo aplica;
--   - la revisión de una propuesta de ajuste, que lo compara y lo aplica;
--   - los criterios para sugerir Asistentes, que comparan el valor acordado del Servicio por mes
--     con el importe por mes del Legajo;
--   - la liquidación, que acepta el importe por mes como base.
--
-- Por qué: sin la columna, un Legajo medido por mes quedaba sin importe y no se podía comparar,
-- ajustar ni liquidar.
--
-- La consulta del valor del Legajo cambia lo que devuelve, y eso obliga a borrarla y crearla de
-- nuevo. Se le devuelven los mismos permisos que tenía: la usan las sesiones comunes, el rol de
-- servicio y las tareas sin persona; nadie sin sesión.

-- Los importes por mes.
ALTER TABLE public.remuneraciones_asistente
  ADD COLUMN valor_mes numeric(12,2);
COMMENT ON COLUMN public.remuneraciones_asistente.valor_mes IS
  'Cuánto se le paga al Asistente por mes, cuando el Legajo se mide por mes. Vacío quiere decir que no está cargado.';

ALTER TABLE public.remuneraciones_asistente
  DROP CONSTRAINT remuneraciones_asistente_valores_no_negativos;
ALTER TABLE public.remuneraciones_asistente
  ADD CONSTRAINT remuneraciones_asistente_valores_no_negativos CHECK (
    COALESCE(valor_hora, 0) >= 0
    AND COALESCE(valor_turno_guardia, 0) >= 0
    AND COALESCE(valor_semana, 0) >= 0
    AND COALESCE(valor_mes, 0) >= 0
    AND COALESCE(valor_hora_extra, 0) >= 0);

ALTER TABLE public.remuneraciones_asistente_anteriores
  ADD COLUMN valor_mes numeric(12,2);
COMMENT ON COLUMN public.remuneraciones_asistente_anteriores.valor_mes IS
  'Cuánto se le pagaba al Asistente por mes mientras rigió este valor anterior.';

ALTER TABLE public.propuestas_de_ajuste_del_legajo
  ADD COLUMN valor_mes_actual numeric(12,2),
  ADD COLUMN valor_mes_propuesto numeric(12,2);
COMMENT ON COLUMN public.propuestas_de_ajuste_del_legajo.valor_mes_actual IS
  'El importe por mes del Legajo cuando se armó la propuesta.';
COMMENT ON COLUMN public.propuestas_de_ajuste_del_legajo.valor_mes_propuesto IS
  'El importe por mes ajustado por el índice.';

-- La liquidación puede tomar el importe por mes como base.
ALTER TABLE public.liquidaciones_asistente
  DROP CONSTRAINT liquidaciones_asistente_base_unidad_check;
ALTER TABLE public.liquidaciones_asistente
  ADD CONSTRAINT liquidaciones_asistente_base_unidad_check
  CHECK (base_unidad = ANY (ARRAY['valor_hora'::text, 'valor_turno_guardia'::text, 'valor_semana'::text, 'valor_mes'::text]));

-- El paso del valor anterior a la historia cuenta el importe por mes y lo copia.
CREATE OR REPLACE FUNCTION interno.guardar_el_valor_anterior_del_legajo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF (NEW.valor_hora, NEW.valor_turno_guardia, NEW.valor_semana, NEW.valor_mes, NEW.valor_hora_extra, NEW.moneda, NEW.unidad_medicion)
     IS NOT DISTINCT FROM
     (OLD.valor_hora, OLD.valor_turno_guardia, OLD.valor_semana, OLD.valor_mes, OLD.valor_hora_extra, OLD.moneda, OLD.unidad_medicion) THEN
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
      prestadora_id, asistente_id, valor_hora, valor_turno_guardia, valor_semana, valor_mes, valor_hora_extra,
      moneda, unidad_medicion, rige_desde, rige_hasta, reemplazado_por)
    VALUES (OLD.prestadora_id, OLD.asistente_id, OLD.valor_hora, OLD.valor_turno_guardia, OLD.valor_semana, OLD.valor_mes,
            OLD.valor_hora_extra, OLD.moneda, OLD.unidad_medicion, OLD.rige_desde, NEW.rige_desde,
            interno.usuario_registrado_de_la_sesion());
  END IF;

  RETURN NEW;
END;
$function$;

-- El valor del Legajo vigente a una fecha devuelve también el importe por mes.
DROP FUNCTION public.valor_del_legajo_en(uuid, date);
CREATE FUNCTION public.valor_del_legajo_en(p_asistente uuid, p_fecha date)
 RETURNS TABLE(valor_hora numeric, valor_turno_guardia numeric, valor_semana numeric, valor_mes numeric, valor_hora_extra numeric, moneda text, unidad_medicion text, rige_desde date)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT x.valor_hora, x.valor_turno_guardia, x.valor_semana, x.valor_mes, x.valor_hora_extra,
         x.moneda, x.unidad_medicion, x.rige_desde
    FROM (
      SELECT r.valor_hora, r.valor_turno_guardia, r.valor_semana, r.valor_mes, r.valor_hora_extra,
             r.moneda::text AS moneda, r.unidad_medicion, r.rige_desde
        FROM public.remuneraciones_asistente r
       WHERE r.asistente_id = p_asistente
      UNION ALL
      SELECT h.valor_hora, h.valor_turno_guardia, h.valor_semana, h.valor_mes, h.valor_hora_extra,
             h.moneda::text, h.unidad_medicion, h.rige_desde
        FROM public.remuneraciones_asistente_anteriores h
       WHERE h.asistente_id = p_asistente
    ) x
   ORDER BY (x.rige_desde <= p_fecha) DESC,
            CASE WHEN x.rige_desde <= p_fecha THEN x.rige_desde END DESC NULLS LAST,
            x.rige_desde
   LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.valor_del_legajo_en(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.valor_del_legajo_en(uuid, date) TO authenticated, service_role, trabajo_sin_persona;

-- El ajuste por índice ajusta, propone y aplica el importe por mes.
CREATE OR REPLACE FUNCTION public.ajustar_valores_del_legajo_por_indice()
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
  v_mes        numeric;
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
                 AND r.valor_mes IS NOT DISTINCT FROM pr.valor_mes_actual
                 AND r.valor_hora_extra IS NOT DISTINCT FROM pr.valor_hora_extra_actual))
    RETURNING pr.id
  )
  SELECT count(*) INTO sin_efecto FROM vencidas;

  IF v_indice IS NULL THEN
    RETURN NEXT;
    RETURN;
  END IF;

  FOR v IN
    SELECT r.asistente_id, r.valor_hora, r.valor_turno_guardia, r.valor_semana, r.valor_mes, r.valor_hora_extra,
           r.moneda::text AS moneda, r.unidad_medicion, r.rige_desde
      FROM public.remuneraciones_asistente r
      JOIN public.asistentes a ON a.id = r.asistente_id AND a.prestadora_id = r.prestadora_id
     WHERE r.prestadora_id = v_prest
       AND a.estado <> 'cesado'
       AND r.rige_desde <= v_hoy
       AND greatest(coalesce(r.valor_hora, 0), coalesce(r.valor_turno_guardia, 0),
                    coalesce(r.valor_semana, 0), coalesce(r.valor_mes, 0), coalesce(r.valor_hora_extra, 0)) > 0
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
    v_mes := round(v.valor_mes * v_factor, 2);
    v_extra := round(v.valor_hora_extra * v_factor, 2);
    CONTINUE WHEN (v_hora, v_turno, v_semana, v_mes, v_extra) IS NOT DISTINCT FROM
                  (v.valor_hora, v.valor_turno_guardia, v.valor_semana, v.valor_mes, v.valor_hora_extra);

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
      valor_semana_actual, valor_semana_propuesto, valor_mes_actual, valor_mes_propuesto, valor_hora_extra_actual, valor_hora_extra_propuesto,
      estado)
    VALUES (v_prest, v.asistente_id, v_indice, v_base, v_nuevo, v_factor, v.rige_desde,
            v_rige, v.moneda, v.unidad_medicion,
            v.valor_hora, v_hora, v.valor_turno_guardia, v_turno,
            v.valor_semana, v_semana, v.valor_mes, v_mes, v.valor_hora_extra, v_extra,
            CASE WHEN v_ajuste = 'automatico' THEN 'aplicada' ELSE 'pendiente' END)
    RETURNING id INTO v_propuesta;

    IF v_ajuste = 'automatico' THEN
      UPDATE public.remuneraciones_asistente
         SET valor_hora = v_hora, valor_turno_guardia = v_turno, valor_semana = v_semana, valor_mes = v_mes,
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

-- La revisión de una propuesta compara y aplica el importe por mes.
CREATE OR REPLACE FUNCTION public.revisar_propuesta_de_ajuste_del_legajo(p_propuesta uuid, p_aceptar boolean)
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
     OR (r.valor_hora, r.valor_turno_guardia, r.valor_semana, r.valor_mes, r.valor_hora_extra) IS DISTINCT FROM
        (pr.valor_hora_actual, pr.valor_turno_guardia_actual, pr.valor_semana_actual, pr.valor_mes_actual, pr.valor_hora_extra_actual) THEN
    RAISE EXCEPTION 'ya_reemplazado' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.remuneraciones_asistente
     SET valor_hora = pr.valor_hora_propuesto, valor_turno_guardia = pr.valor_turno_guardia_propuesto,
         valor_semana = pr.valor_semana_propuesto, valor_mes = pr.valor_mes_propuesto,
         valor_hora_extra = pr.valor_hora_extra_propuesto,
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

-- Los criterios para sugerir Asistentes comparan el valor acordado por mes con el del Legajo.
CREATE OR REPLACE FUNCTION public.criterios_de_candidatas(p_servicio uuid, p_asistentes uuid[], p_turno_guardia uuid DEFAULT NULL::uuid, p_meses_de_antecedentes integer DEFAULT NULL::integer)
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
                               WHEN 'mes' THEN lg.valor_mes
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

NOTIFY pgrst, 'reload schema';
