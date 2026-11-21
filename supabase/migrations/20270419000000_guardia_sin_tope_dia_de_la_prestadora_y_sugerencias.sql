-- El turno de guardia sin tope de días, el día de hoy según la Prestadora, dos consultas nuevas
-- para el Panel, la suspensión de una internación que vuelve sólo al cerrar la internación y la
-- duración al mover un turno de guardia a otro Paciente.
--
-- 1. Un turno de guardia dura los días que haga falta: queda sólo que los días sean cero o más y
--    que, terminando el mismo día, la hora de fin sea posterior a la de comienzo. Las funciones que
--    miraban como mucho tres días hacia atrás ahora miran la guardia más larga de la Prestadora.
-- 2. «Hoy» se calcula en la zona horaria de la Prestadora, en una sola función que usan todas las
--    demás. Las fechas que la base anotaba sola al dar de alta un registro también salen de ahí.
-- 3. Los Coordinadores sugeridos para un Servicio, primero los que cubren el lugar y después los
--    que tienen menos Servicios vigentes. Sólo para la administración de la Prestadora.
-- 4. Los Asistentes que ya atendieron a alguno de unos Pacientes: una fila por Asistente, con
--    cuántos turnos de guardia ya empezados tuvo, sin contar los cancelados ni los ausentes, y la
--    fecha del último. Cada turno de guardia cuenta una sola vez.
-- 5. La suspensión que hizo una internación no se reanuda a mano ni se cambia por ningún camino:
--    vuelve al cerrar la internación, o termina con la baja del Servicio.
-- 6. Mover un turno de guardia a otro Paciente acepta también cuántos días dura; sin ese dato,
--    conserva los del turno de guardia original.
SET check_function_bodies = false;
DROP FUNCTION interno.el_acceso_abre_contactos(p_estado text, p_suspension_desde date, p_vigente_hasta date);
DROP FUNCTION public.ausencias_que_tapan(IN p_desde date, IN p_hasta date, IN p_hoy date);
DROP FUNCTION public.domicilio_del_paciente_en(IN p_paciente_id uuid, IN p_fecha date);
DROP FUNCTION public.domicilios_de_pacientes_en(IN p_pacientes uuid[], IN p_fecha date);
DROP FUNCTION public.mover_turno_guardia_a_otro_paciente(p_turno_guardia_id uuid, p_paciente_id uuid, p_fecha date, p_hora_inicio time without time zone, p_hora_fin time without time zone);
DROP FUNCTION public.precios_de_lista_que_rigen(p_fecha date);
DROP FUNCTION public.prestaciones_con_promocion_vencida(IN p_fecha date);
ALTER TABLE public.asistentes ALTER COLUMN fecha_alta DROP DEFAULT;
ALTER TABLE public.cobros_cliente ALTER COLUMN fecha_cobro DROP DEFAULT;
ALTER TABLE public.cobros_intermediacion ALTER COLUMN fecha_cobro DROP DEFAULT;
ALTER TABLE public.correcciones_factura_cliente ALTER COLUMN fecha DROP DEFAULT;
ALTER TABLE public.facturas_cliente ALTER COLUMN fecha_emision DROP DEFAULT;
ALTER TABLE public.hospitalizaciones_paciente ALTER COLUMN fecha_inicio DROP DEFAULT;
ALTER TABLE public.lista_precios ALTER COLUMN vigente_desde DROP DEFAULT;
ALTER TABLE public.prestaciones ALTER COLUMN vigente_desde DROP DEFAULT;
ALTER TABLE public.cronograma_de_guardias DROP CONSTRAINT cronograma_de_guardias_dias_hasta_el_fin_valido;
ALTER TABLE public.series_turnos_guardia DROP CONSTRAINT series_turnos_guardia_dias_hasta_el_fin_valido;
ALTER TABLE public.turnos_guardia DROP CONSTRAINT turnos_guardia_dios_hasta_el_fin_valido;
DROP VIEW public.documentos_pedidos_al_asistente;
DROP FUNCTION interno.gracia_hasta(p_asistente_id uuid, p_tipo_documento_id uuid, p_dia date);
DROP VIEW public.saldos_cliente;
DROP FUNCTION public.estado_de_factura(p_monto_total numeric, p_cobrado numeric, p_fecha_vencimiento date);
CREATE OR REPLACE FUNCTION interno.accesos_fuera_de_lo_normal_de(p_prestadora uuid, p_desde date, p_hasta date)
 RETURNS TABLE(consulta_id uuid, usuario_id uuid, persona text, paciente_id uuid, paciente text, categorias text[], momento timestamp with time zone, origen text, motivos text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  WITH configuracion AS (
    SELECT p.zona_horaria AS zona,
           p.registro_de_accesos_hora_de_inicio AS inicio,
           p.registro_de_accesos_hora_de_fin AS fin,
           p.registro_de_accesos_pacientes_por_dia AS tope,
           make_interval(hours => p.registro_de_accesos_horas_alrededor_del_turno_guardia) AS margen,
           p.registro_de_accesos_horas_alrededor_del_turno_guardia / 24 + 2 AS dias_de_margen
      FROM prestadoras p
     WHERE p.id = p_prestadora
  ),
  -- Las lecturas de personas en el período, con la hora del lugar.
  lecturas AS (
    SELECT c.id, c.usuario_id, c.paciente_id, c.categorias, c.momento, c.origen,
           (c.momento AT TIME ZONE k.zona) AS hora_local,
           k.inicio, k.fin, k.tope, k.margen
      FROM consultas_a_hce c
      CROSS JOIN configuracion k
     WHERE c.prestadora_id = p_prestadora
       AND c.usuario_id IS NOT NULL
       AND c.momento >= (p_desde::timestamp AT TIME ZONE k.zona)
       AND c.momento <  ((p_hasta + 1)::timestamp AT TIME ZONE k.zona)
  ),
  -- Las guardias que rodean el período, con su comienzo y su fin en hora del lugar. El fin sale
  -- de los días que dura cada una, sin tope.
  turnos_guardia_del_periodo AS (
    SELECT g.paciente_id, g.coordinador_id, a.usuario_id AS asistente_usuario_id,
           (g.fecha + g.hora_inicio) AS empieza,
           (interno.dia_en_que_termina_turno_guardia(g.fecha, g.hora_inicio, g.hora_fin, g.dias_hasta_el_fin) + g.hora_fin) AS termina
      FROM turnos_guardia g
      CROSS JOIN configuracion k
      LEFT JOIN asistentes a ON a.id = g.asistente_id AND a.prestadora_id = g.prestadora_id
     WHERE g.prestadora_id = p_prestadora
       AND g.estado <> 'cancelada'
       AND g.fecha + g.dias_hasta_el_fin >= p_desde - k.dias_de_margen AND g.fecha <= p_hasta + k.dias_de_margen
  ),
  -- Las personas que ese día leyeron más Pacientes distintos que el tope.
  volumen AS (
    SELECT l.usuario_id, l.hora_local::date AS dia
      FROM lecturas l
     GROUP BY l.usuario_id, l.hora_local::date
    HAVING count(DISTINCT l.paciente_id) > max(l.tope)
  ),
  marcadas AS (
    SELECT l.*,
           array_remove(ARRAY[
             CASE WHEN NOT (CASE WHEN l.inicio < l.fin
                                 THEN l.hora_local::time >= l.inicio AND l.hora_local::time < l.fin
                                 ELSE l.hora_local::time >= l.inicio OR l.hora_local::time < l.fin END)
                   AND NOT EXISTS (
                     SELECT 1 FROM turnos_guardia_del_periodo g
                      WHERE g.asistente_usuario_id = l.usuario_id
                        AND l.hora_local >= g.empieza AND l.hora_local < g.termina)
                  THEN 'fuera_del_horario' END,
             CASE WHEN NOT EXISTS (
                     SELECT 1 FROM turnos_guardia_del_periodo g
                      WHERE g.paciente_id = l.paciente_id
                        AND (g.asistente_usuario_id = l.usuario_id OR g.coordinador_id = l.usuario_id)
                        AND l.hora_local >= g.empieza - l.margen
                        AND l.hora_local <  g.termina + l.margen)
                   AND NOT EXISTS (
                     SELECT 1 FROM pacientes pa
                       JOIN servicios s ON s.prestadora_id = pa.prestadora_id
                                       AND s.cliente_id = pa.cliente_id
                      WHERE pa.id = l.paciente_id
                        AND pa.prestadora_id = p_prestadora
                        AND s.estado = 'vigente'
                        AND s.coordinador_id = l.usuario_id)
                  THEN 'sin_relacion_con_el_paciente' END,
             CASE WHEN EXISTS (
                     SELECT 1 FROM volumen v
                      WHERE v.usuario_id = l.usuario_id AND v.dia = l.hora_local::date)
                  THEN 'volumen_inusual' END
           ], NULL) AS motivos
      FROM lecturas l
  )
  SELECT m.id, m.usuario_id, u.nombre, m.paciente_id, pe.nombre_visible,
         m.categorias, m.momento, m.origen, m.motivos
    FROM marcadas m
    LEFT JOIN usuarios u ON u.id = m.usuario_id
    LEFT JOIN pacientes pa ON pa.id = m.paciente_id AND pa.prestadora_id = p_prestadora
    LEFT JOIN personas pe ON pe.id = pa.persona_id
   WHERE cardinality(m.motivos) > 0
   ORDER BY m.momento DESC;
$function$;
CREATE OR REPLACE FUNCTION interno.alarmas_a_la_vista_del_coordinador(p_tipo text)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
  v_llegaron uuid[];
  v_abiertas uuid[];
BEGIN
  IF v_prestadora IS NULL OR NOT interno.es_coordinador() THEN
    RETURN '{}';
  END IF;

  SELECT coalesce(array_agg(e.referencia_id), '{}') INTO v_llegaron
    FROM escalones_de_alarma_avisados e
   WHERE e.prestadora_id = v_prestadora
     AND e.tipo = p_tipo
     AND e.escalon = 'todos_los_coordinadores';

  IF p_tipo = 'alerta_temprana_turno_guardia' THEN
    SELECT coalesce(array_agg(x.id), '{}') INTO v_abiertas FROM alertas_tempranas_turno_guardia x
     WHERE x.id = ANY (v_llegaron) AND x.resuelto_at IS NULL;
  ELSIF p_tipo = 'incidente_relevo' THEN
    SELECT coalesce(array_agg(x.id), '{}') INTO v_abiertas FROM incidentes_relevo x
     WHERE x.id = ANY (v_llegaron) AND x.resuelto_at IS NULL;
  ELSIF p_tipo = 'incidente_turno_guardia_sin_cubrir' THEN
    SELECT coalesce(array_agg(x.id), '{}') INTO v_abiertas FROM incidentes_turno_guardia_sin_cubrir x
     WHERE x.id = ANY (v_llegaron) AND x.resuelto_at IS NULL;
  ELSIF p_tipo = 'emergencia_turno_guardia' THEN
    SELECT coalesce(array_agg(x.id), '{}') INTO v_abiertas FROM emergencias_turno_guardia x
     WHERE x.id = ANY (v_llegaron) AND x.atendida_at IS NULL;
  ELSIF p_tipo = 'turno_guardia_sin_cerrar' THEN
    SELECT coalesce(array_agg(x.id), '{}') INTO v_abiertas FROM turnos_guardia x
     WHERE x.id = ANY (v_llegaron) AND x.estado = 'activa';
  ELSE
    v_abiertas := '{}';
  END IF;

  RETURN v_abiertas || interno.alarmas_que_tengo_tomadas(p_tipo);
END;
$function$;
CREATE OR REPLACE FUNCTION interno.anotar_desde_cuando_se_controla_en_el_turno_guardia()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT NEW.control_de_ubicacion_en_el_turno_guardia THEN
    NEW.control_de_ubicacion_en_el_turno_guardia_desde := NULL;
  ELSIF TG_OP = 'INSERT' OR NOT OLD.control_de_ubicacion_en_el_turno_guardia THEN
    NEW.control_de_ubicacion_en_el_turno_guardia_desde := now();
  ELSE
    NEW.control_de_ubicacion_en_el_turno_guardia_desde := OLD.control_de_ubicacion_en_el_turno_guardia_desde;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION interno.anotar_deuda_de_la_baja(p_baja uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_baja bajas_de_servicio%ROWTYPE;
  v_servicio servicios%ROWTYPE;
  v_responsables uuid[];
  v_contratante uuid;
  v_la_lleva_otro boolean;
  v_anotados integer;
BEGIN
  SELECT * INTO v_baja FROM bajas_de_servicio
   WHERE id = p_baja AND prestadora_id = interno.prestadora_actual();
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF EXISTS (SELECT 1 FROM configuracion_notificaciones
              WHERE prestadora_id = v_baja.prestadora_id
                AND evento = 'baja_servicio_con_deuda'
                AND activo = false) THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_servicio FROM servicios WHERE id = v_baja.servicio_id;

  SELECT coalesce(
           (SELECT cc.contratante_persona_id
              FROM condiciones_comerciales_servicio cc
             WHERE cc.servicio_id = v_servicio.id AND cc.prestadora_id = v_baja.prestadora_id),
           (SELECT c.contratante_persona_id
              FROM clientes c
             WHERE c.id = v_servicio.cliente_id AND c.prestadora_id = v_baja.prestadora_id))
    INTO v_contratante;

  v_responsables := ARRAY(SELECT interno.responsables_de_pagos_en(v_servicio.id, interno.hoy_de_la_prestadora(v_baja.prestadora_id)));

  SELECT coalesce((regla ->> 'sigue_la_cobranza')::boolean, true) = false INTO v_la_lleva_otro
    FROM configuracion_facturacion_clientes
   WHERE prestadora_id = v_baja.prestadora_id;

  INSERT INTO avisos_baja_servicio_con_deuda
    (prestadora_id, servicio_id, baja_id, cliente_id, responsables_de_pagos_persona_ids,
     contratante_persona_id, importe, moneda, dias_de_atraso)
  SELECT v_baja.prestadora_id, v_servicio.id, v_baja.id, v_servicio.cliente_id,
         v_responsables, v_contratante,
         d.importe, d.moneda, d.dias_de_atraso
    FROM (
      SELECT e.saldo AS importe, e.moneda, e.dias_de_atraso
        FROM estado_de_cuenta_externo_vigente e
       WHERE coalesce(v_la_lleva_otro, false)
         AND e.prestadora_id = v_baja.prestadora_id
         AND e.cliente_id = v_servicio.cliente_id
      UNION ALL
      SELECT sum(s.saldo), s.moneda,
             coalesce(interno.hoy_de_la_prestadora(v_baja.prestadora_id) - min(s.fecha_vencimiento) FILTER (WHERE s.fecha_vencimiento < interno.hoy_de_la_prestadora(v_baja.prestadora_id)), 0)
        FROM saldos_cliente s
       WHERE NOT coalesce(v_la_lleva_otro, false)
         AND s.prestadora_id = v_baja.prestadora_id
         AND s.cliente_id = v_servicio.cliente_id
         AND s.saldo > 0
       GROUP BY s.moneda
    ) d
   WHERE d.importe > 0
  ON CONFLICT (baja_id, moneda) DO NOTHING;

  GET DIAGNOSTICS v_anotados = ROW_COUNT;
  RETURN v_anotados;
END;
$function$;
CREATE FUNCTION interno.anotar_el_dia_de_hoy()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_columna text := TG_ARGV[0];
  v_fila jsonb := to_jsonb(NEW);
  v_hoy date;
BEGIN
  IF v_fila ->> v_columna IS NOT NULL THEN
    RETURN NEW;
  END IF;
  v_hoy := CASE
             WHEN TG_TABLE_NAME = 'prestadoras' THEN interno.hoy_en_la_zona(v_fila ->> 'zona_horaria')
             ELSE interno.hoy_de_la_prestadora((v_fila ->> 'prestadora_id')::uuid)
           END;
  NEW := jsonb_populate_record(NEW, jsonb_build_object(v_columna, v_hoy));
  RETURN NEW;
END;
$function$;
GRANT ALL ON FUNCTION interno.anotar_el_dia_de_hoy() TO authenticated;
GRANT ALL ON FUNCTION interno.anotar_el_dia_de_hoy() TO service_role;
GRANT ALL ON FUNCTION interno.anotar_el_dia_de_hoy() TO trabajo_sin_persona;
CREATE OR REPLACE FUNCTION interno.anotar_turnos_sin_cubrir()
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
     CROSS JOIN LATERAL interno.turnos_sin_cubrir(v_prest, s.id, v_hoy - interno.dias_de_la_guardia_mas_larga(v_prest, s.id), v_hoy + COALESCE(v_horizonte, 0)) u
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
CREATE OR REPLACE FUNCTION interno.asistente_del_turno_guardia(p_turno_guardia uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT g.asistente_id FROM public.turnos_guardia g
   WHERE g.id = p_turno_guardia AND g.prestadora_id = interno.prestadora_actual();
$function$;
CREATE OR REPLACE FUNCTION interno.asistente_ocupado_entre(p_asistente uuid, p_turno_guardia_excluido uuid, p_desde timestamp without time zone, p_hasta timestamp without time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM turnos_guardia g
     WHERE g.prestadora_id = interno.prestadora_actual()
       AND g.asistente_id = p_asistente
       AND g.id <> p_turno_guardia_excluido
       AND g.estado NOT IN ('cancelada', 'ausente')
       AND (g.fecha + g.hora_inicio) < p_hasta
       AND (interno.dia_en_que_termina_turno_guardia(g.fecha, g.hora_inicio, g.hora_fin, g.dias_hasta_el_fin) + g.hora_fin) > p_desde
  );
$function$;
CREATE OR REPLACE FUNCTION interno.asistentes_que_trabajan_con_el_coordinador()
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
  v_servicios uuid[];
  v_tomadas uuid[];
  v_asistentes uuid[];
BEGIN
  IF v_prestadora IS NULL OR NOT interno.es_coordinador() THEN
    RETURN '{}';
  END IF;

  SELECT coalesce(array_agg(s.id), '{}') INTO v_servicios
    FROM servicios s
   WHERE s.prestadora_id = v_prestadora
     AND s.coordinador_id = ANY (interno.coordinadores_que_represento());

  v_tomadas := interno.turnos_guardia_a_la_vista_por_una_alarma(true);

  SELECT coalesce(array_agg(DISTINCT x.asistente_id), '{}') INTO v_asistentes
    FROM (
      SELECT g.asistente_id
        FROM turnos_guardia g
       WHERE g.prestadora_id = v_prestadora
         AND g.asistente_id IS NOT NULL
         AND (g.servicio_id = ANY (v_servicios)
              OR g.id = ANY (v_tomadas)
              OR (g.servicio_id IS NULL
                  AND interno.coordinador_alcanza_el_turno_guardia_de(NULL, g.paciente_id, g.id)))
      UNION
      SELECT sg.asistente_id
        FROM series_turnos_guardia sg
       WHERE sg.prestadora_id = v_prestadora
         AND sg.asistente_id IS NOT NULL
         AND (sg.servicio_id = ANY (v_servicios)
              OR (sg.servicio_id IS NULL
                  AND interno.coordinador_alcanza_la_serie_de(NULL, sg.paciente_id, sg.id)))
      UNION
      SELECT t.asistente_id
        FROM asignaciones_de_turno_guardia t
        JOIN turnos_guardia g ON g.id = t.turno_guardia_id AND g.prestadora_id = t.prestadora_id
       WHERE t.prestadora_id = v_prestadora
         AND (g.servicio_id = ANY (v_servicios)
              OR g.id = ANY (v_tomadas)
              OR (g.servicio_id IS NULL
                  AND interno.coordinador_alcanza_el_turno_guardia_de(NULL, g.paciente_id, g.id)))
    ) x;

  RETURN v_asistentes;
END;
$function$;
CREATE OR REPLACE FUNCTION interno.atiende_al_paciente(p_paciente uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  WITH yo AS (
    SELECT auth.uid()                       AS uid,
           interno.prestadora_actual()         AS tenant,
           interno.asistente_de_la_sesion() AS asistente
  ),
  pac AS (
    SELECT p.id, p.cliente_id
      FROM pacientes p, yo
     WHERE p.id = p_paciente
       AND p.prestadora_id = yo.tenant
  )
  SELECT EXISTS (
    SELECT 1
      FROM pac, yo
     WHERE yo.uid IS NOT NULL
       AND (
         -- Quien recibe el Servicio.
         pac.cliente_id = interno.cliente_id_de_usuario(yo.uid)

         -- Quien coordina uno de sus Servicios.
         OR interno.coordina_al_paciente(pac.id)

         -- Quien la Prestadora sumó al equipo de uno de sus Servicios.
         OR EXISTS (
           SELECT 1
             FROM equipo_servicio e
             JOIN servicios s ON s.id = e.servicio_id
                             AND s.prestadora_id = e.prestadora_id
                             AND s.cliente_id = pac.cliente_id
                             AND s.estado = 'vigente'
            WHERE e.prestadora_id = yo.tenant
              AND e.situacion = 'sumada'
              AND (e.usuario_id = yo.uid
                   OR (yo.asistente IS NOT NULL AND e.asistente_id = yo.asistente))
         )

         -- Quien lo presta, guardia por guardia.
         OR EXISTS (
           SELECT 1
             FROM turnos_guardia g
             JOIN servicios s ON s.id = g.servicio_id
                             AND s.prestadora_id = g.prestadora_id
                             AND s.estado = 'vigente'
            WHERE g.prestadora_id = yo.tenant
              AND g.estado <> 'cancelada'
              AND yo.asistente IS NOT NULL
              AND g.asistente_id = yo.asistente
              AND (g.paciente_id = pac.id
                   OR EXISTS (SELECT 1 FROM turno_guardia_pacientes gp
                               WHERE gp.turno_guardia_id = g.id AND gp.paciente_id = pac.id))
         )

         -- Quien lo presta por una serie que sigue en pie.
         OR EXISTS (
           SELECT 1
             FROM series_turnos_guardia sg
             JOIN servicios s ON s.id = sg.servicio_id
                             AND s.prestadora_id = sg.prestadora_id
                             AND s.estado = 'vigente'
            WHERE sg.prestadora_id = yo.tenant
              AND sg.estado <> 'cancelada'
              AND yo.asistente IS NOT NULL
              AND sg.asistente_id = yo.asistente
              AND (sg.paciente_id = pac.id
                   OR EXISTS (SELECT 1 FROM series_turnos_guardia_pacientes sp
                               WHERE sp.serie_id = sg.id AND sp.paciente_id = pac.id))
         )

         -- Quien tiene tomada una alarma de una de sus guardias, mientras la tenga.
         OR EXISTS (
           SELECT 1
             FROM turnos_guardia g
            WHERE g.prestadora_id = yo.tenant
              AND g.id = ANY (interno.turnos_guardia_a_la_vista_por_una_alarma(true))
              AND (g.paciente_id = pac.id
                   OR EXISTS (SELECT 1 FROM turno_guardia_pacientes gp
                               WHERE gp.turno_guardia_id = g.id AND gp.paciente_id = pac.id))
         )
       )
  )
$function$;
CREATE OR REPLACE FUNCTION interno.aviso_de_borrado_de_consultas_a_hce_pendiente(p_prestadora uuid)
 RETURNS TABLE(anio integer, se_borra_el date, aviso text, dias integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'interno'
AS $function$
  WITH v AS (
    SELECT c.*, interno.hoy_de_la_prestadora(p_prestadora) AS hoy FROM interno.consultas_a_hce_por_vencer(p_prestadora) c
  ), ya AS (
    SELECT ra.accion
      FROM registro_actividad ra, v
     WHERE ra.prestadora_id = p_prestadora
       AND ra.accion IN ('preaviso_de_borrado', 'notificacion_de_borrado')
       AND ra.detalle ->> 'anio' = v.anio::text
  )
  SELECT v.anio, v.se_borra_el,
         CASE
           WHEN v.hoy >= v.notificacion_el THEN 'notificacion'
           ELSE 'preaviso'
         END,
         v.se_borra_el - v.hoy
    FROM v
   WHERE v.hoy < v.se_borra_el
     AND v.hoy >= v.preaviso_el
     AND NOT EXISTS (SELECT 1 FROM ya WHERE ya.accion = 'notificacion_de_borrado')
     AND (v.hoy >= v.notificacion_el
          OR NOT EXISTS (SELECT 1 FROM ya WHERE ya.accion = 'preaviso_de_borrado'));
$function$;
CREATE OR REPLACE FUNCTION interno.calcular_prorroga_de_gracia()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_gracia date;
BEGIN
  v_gracia := interno.gracia_hasta(NEW.asistente_id, NEW.tipo_documento_id, interno.hoy_de_la_prestadora(NEW.prestadora_id));
  IF v_gracia IS NULL THEN
    RAISE EXCEPTION 'documento_sin_gracia' USING ERRCODE = '23514';
  END IF;
  NEW.hasta := GREATEST(v_gracia, interno.hoy_de_la_prestadora(NEW.prestadora_id)) + NEW.dias;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION interno.cerrar_vigencia_de_la_prestacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  recien_se_da_de_baja boolean;
  la_trae_escrita boolean;
BEGIN
  IF NEW.estado <> 'de_baja' THEN
    RETURN NEW;
  END IF;

  recien_se_da_de_baja := TG_OP = 'INSERT' OR OLD.estado <> 'de_baja';
  la_trae_escrita := CASE
    WHEN TG_OP = 'INSERT' THEN NEW.vigente_hasta IS NOT NULL
    ELSE NEW.vigente_hasta IS DISTINCT FROM OLD.vigente_hasta
  END;

  IF recien_se_da_de_baja AND NOT la_trae_escrita THEN
    -- `GREATEST` cubre la prestacion que se da de baja antes de arrancar: no
    -- puede terminar antes de empezar, y la restriccion de mas arriba lo exige.
    NEW.vigente_hasta := GREATEST(NEW.vigente_desde, interno.hoy_de_la_prestadora(NEW.prestadora_id));
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION interno.condicion_del_pedido(p_tabla text, p_alias text, p_filtros jsonb, p_union text DEFAULT 'AND'::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  e        jsonb;
  v_partes text[] := '{}';
  v_col    text;
  v_op     text;
  v_valor  text;
BEGIN
  IF p_union NOT IN ('AND', 'OR') OR p_alias NOT IN ('t', 'g') THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_filtros IS NULL OR p_filtros = 'null'::jsonb THEN
    RETURN 'true';
  END IF;
  IF jsonb_typeof(p_filtros) <> 'array' THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = '22023';
  END IF;

  FOR e IN SELECT x FROM jsonb_array_elements(p_filtros) x LOOP
    IF jsonb_typeof(e) <> 'object' THEN
      RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = '22023';
    END IF;

    IF e ? 'o' THEN
      v_partes := v_partes || ('(' || interno.condicion_del_pedido(p_tabla, p_alias, e -> 'o', 'OR') || ')');
    ELSIF e ? 'y' THEN
      v_partes := v_partes || ('(' || interno.condicion_del_pedido(p_tabla, p_alias, e -> 'y', 'AND') || ')');
    ELSIF e ? 'turno_guardia' THEN
      -- Una condición sobre la guardia de la fila. La guardia se lee con los permisos de quien
      -- pide, como cualquier otra lectura suya.
      IF p_alias <> 't' THEN
        RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = '22023';
      END IF;
      PERFORM interno.columna_del_pedido(p_tabla, 'turno_guardia_id');
      v_partes := v_partes || format(
        'EXISTS (SELECT 1 FROM public.turnos_guardia g WHERE g.id = t.turno_guardia_id AND %s)',
        interno.condicion_del_pedido('turnos_guardia', 'g', e -> 'turno_guardia', 'AND'));
    ELSE
      v_col := interno.columna_del_pedido(p_tabla, e ->> 'columna');
      v_op := e ->> 'op';
      v_valor := format('(jsonb_populate_record(NULL::public.%I, %L::jsonb)).%I',
                        p_tabla, jsonb_build_object(v_col, e -> 'valor'), v_col);
      v_partes := v_partes || CASE v_op
        WHEN 'eq'       THEN format('%I.%I = %s',  p_alias, v_col, v_valor)
        WHEN 'neq'      THEN format('%I.%I <> %s', p_alias, v_col, v_valor)
        WHEN 'gt'       THEN format('%I.%I > %s',  p_alias, v_col, v_valor)
        WHEN 'gte'      THEN format('%I.%I >= %s', p_alias, v_col, v_valor)
        WHEN 'lt'       THEN format('%I.%I < %s',  p_alias, v_col, v_valor)
        WHEN 'lte'      THEN format('%I.%I <= %s', p_alias, v_col, v_valor)
        WHEN 'is_null'  THEN format('%I.%I IS NULL', p_alias, v_col)
        WHEN 'not_null' THEN format('%I.%I IS NOT NULL', p_alias, v_col)
        WHEN 'in'       THEN format(
          '%I.%I = ANY (ARRAY(SELECT (jsonb_populate_record(NULL::public.%I, jsonb_build_object(%L, x))).%I FROM jsonb_array_elements(%L::jsonb) x))',
          p_alias, v_col, p_tabla, v_col, v_col,
          CASE WHEN jsonb_typeof(e -> 'valor') = 'array' THEN e -> 'valor' END)
      END;
      IF v_partes[cardinality(v_partes)] IS NULL THEN
        RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  IF cardinality(v_partes) = 0 THEN
    RETURN CASE WHEN p_union = 'OR' THEN 'false' ELSE 'true' END;
  END IF;
  RETURN array_to_string(v_partes, ' ' || p_union || ' ');
END;
$function$;
CREATE OR REPLACE FUNCTION interno.consultas_a_hce_por_vencer(p_prestadora uuid)
 RETURNS TABLE(anio integer, desde timestamp with time zone, hasta timestamp with time zone, se_borra_el date, preaviso_el date, notificacion_el date)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'interno'
AS $function$
  WITH regla AS (
    SELECT r.plazo_meses, r.dias_de_preaviso, r.dias_de_notificacion
      FROM reglas_de_conservacion r
      JOIN prestadoras p ON p.id = p_prestadora AND p.pais = r.jurisdiccion
     WHERE r.clase_de_registro = 'consultas_a_hce'
       AND r.al_vencer = 'borrar'
       AND r.tramo = 1
       AND r.vigencia_desde <= interno.hoy_de_la_prestadora(p_prestadora)
       AND (r.vigencia_hasta IS NULL OR r.vigencia_hasta >= interno.hoy_de_la_prestadora(p_prestadora))
     ORDER BY r.vigencia_desde DESC
     LIMIT 1
  ), primero AS (
    SELECT extract(year FROM min(a.momento) AT TIME ZONE 'UTC')::integer AS anio
      FROM consultas_a_hce a
     WHERE a.prestadora_id = p_prestadora
  ), fecha AS (
    SELECT pr.anio,
           (make_date(pr.anio + 1, 1, 1) + make_interval(months => rg.plazo_meses))::date AS se_borra_el,
           rg.dias_de_preaviso, rg.dias_de_notificacion
      FROM primero pr, regla rg
     WHERE pr.anio IS NOT NULL
  )
  SELECT f.anio,
         make_timestamptz(f.anio, 1, 1, 0, 0, 0, 'UTC'),
         make_timestamptz(f.anio + 1, 1, 1, 0, 0, 0, 'UTC'),
         f.se_borra_el,
         f.se_borra_el - f.dias_de_preaviso,
         f.se_borra_el - f.dias_de_notificacion
    FROM fecha f;
$function$;
CREATE OR REPLACE FUNCTION interno.coordinador_alcanza_asistente_de(p_usuario uuid, p_asistente_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM usuarios u
    JOIN usuario_lugares ul ON ul.usuario_id = u.id
    JOIN asistente_lugares al ON al.lugar_id = ul.lugar_id
    WHERE u.id = p_usuario
      AND u.rol = 'coordinador'
      AND al.asistente_id = p_asistente_id
  )
  OR EXISTS (
    SELECT 1
    FROM usuarios u
    JOIN ausencias a ON a.coordinador_que_cubre_id = u.id
                    AND a.prestadora_id = u.prestadora_id
    JOIN usuario_lugares ul ON ul.usuario_id = a.usuario_id
                           AND ul.prestadora_id = a.prestadora_id
    JOIN asistente_lugares al ON al.lugar_id = ul.lugar_id
    WHERE u.id = p_usuario
      AND u.rol = 'coordinador'
      AND a.usuario_id IS NOT NULL
      AND a.fecha_inicio <= interno.hoy_de_la_prestadora(a.prestadora_id)
      AND (a.fecha_vuelta_real IS NULL OR a.fecha_vuelta_real > interno.hoy_de_la_prestadora(a.prestadora_id))
      AND al.asistente_id = p_asistente_id
  );
$function$;
CREATE OR REPLACE FUNCTION interno.coordinador_alcanza_el_turno_guardia_de(p_servicio uuid, p_paciente uuid, p_turno_guardia uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT CASE
    WHEN p_servicio IS NOT NULL THEN interno.coordina_el_servicio(p_servicio)
    ELSE (p_paciente IS NOT NULL AND interno.coordinador_ve_al_paciente(p_paciente))
      OR EXISTS (SELECT 1 FROM turno_guardia_pacientes gp
                  WHERE gp.turno_guardia_id = p_turno_guardia
                    AND interno.coordinador_ve_al_paciente(gp.paciente_id))
  END;
$function$;
CREATE OR REPLACE FUNCTION interno.coordinador_alcanza_la_serie_de(p_servicio uuid, p_paciente uuid, p_serie uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT CASE
    WHEN p_servicio IS NOT NULL THEN interno.coordina_el_servicio(p_servicio)
    ELSE (p_paciente IS NOT NULL AND interno.coordinador_ve_al_paciente(p_paciente))
      OR EXISTS (SELECT 1 FROM series_turnos_guardia_pacientes sp
                  WHERE sp.serie_id = p_serie
                    AND interno.coordinador_ve_al_paciente(sp.paciente_id))
  END;
$function$;
CREATE OR REPLACE FUNCTION interno.coordinador_alcanza_turno_guardia(p_asistente_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT p_asistente_id IS NULL
      OR interno.coordinador_alcanza_asistente(p_asistente_id);
$function$;
CREATE OR REPLACE FUNCTION interno.coordinador_tiene_una_emergencia_abierta()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
BEGIN
  IF v_prestadora IS NULL OR NOT interno.es_coordinador() THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
           SELECT 1 FROM emergencias_turno_guardia e
             JOIN turnos_guardia g ON g.id = e.turno_guardia_id AND g.prestadora_id = e.prestadora_id
            WHERE e.prestadora_id = v_prestadora
              AND e.atendida_at IS NULL
              AND (e.id = ANY (interno.alarmas_a_la_vista_del_coordinador('emergencia_turno_guardia'))
                   OR interno.coordinador_alcanza_el_turno_guardia_de(g.servicio_id, g.paciente_id, g.id)))
      OR EXISTS (
           SELECT 1 FROM incidentes_turno_guardia_sin_cubrir i
             JOIN turnos_guardia g ON g.id = i.turno_guardia_id AND g.prestadora_id = i.prestadora_id
            WHERE i.prestadora_id = v_prestadora
              AND i.resuelto_at IS NULL
              AND (i.id = ANY (interno.alarmas_a_la_vista_del_coordinador('incidente_turno_guardia_sin_cubrir'))
                   OR interno.coordinador_alcanza_el_turno_guardia_de(g.servicio_id, g.paciente_id, g.id)))
      OR EXISTS (
           SELECT 1 FROM alertas_tempranas_turno_guardia a
             JOIN turnos_guardia g ON g.id = a.turno_guardia_id AND g.prestadora_id = a.prestadora_id
            WHERE a.prestadora_id = v_prestadora
              AND a.resuelto_at IS NULL
              AND (a.id = ANY (interno.alarmas_a_la_vista_del_coordinador('alerta_temprana_turno_guardia'))
                   OR interno.coordinador_alcanza_el_turno_guardia_de(g.servicio_id, g.paciente_id, g.id)));
END;
$function$;
CREATE OR REPLACE FUNCTION interno.coordinador_ve_el_turno_guardia(p_turno_guardia uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT p_turno_guardia IS NOT NULL
     AND interno.es_coordinador()
     AND (EXISTS (
            SELECT 1 FROM turnos_guardia g
             WHERE g.id = p_turno_guardia
               AND g.prestadora_id = interno.prestadora_actual()
               AND interno.coordinador_alcanza_el_turno_guardia_de(g.servicio_id, g.paciente_id, g.id)
          )
          OR p_turno_guardia = ANY (interno.turnos_guardia_a_la_vista_por_una_alarma(true)));
$function$;
CREATE OR REPLACE FUNCTION interno.coordinador_ve_la_serie(p_serie uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT p_serie IS NOT NULL
     AND interno.es_coordinador()
     AND EXISTS (
       SELECT 1 FROM series_turnos_guardia sg
        WHERE sg.id = p_serie
          AND sg.prestadora_id = interno.prestadora_actual()
          AND interno.coordinador_alcanza_la_serie_de(sg.servicio_id, sg.paciente_id, sg.id)
     );
$function$;
CREATE OR REPLACE FUNCTION interno.coordinadores_que_represento()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT CASE WHEN auth.uid() IS NULL THEN '{}'::uuid[]
              ELSE ARRAY(
                SELECT auth.uid()
                UNION
                SELECT a.usuario_id
                  FROM ausencias a
                 WHERE a.coordinador_que_cubre_id = auth.uid()
                   AND a.prestadora_id = interno.prestadora_actual()
                   AND a.usuario_id IS NOT NULL
                   AND a.fecha_inicio <= interno.hoy_de_la_prestadora(a.prestadora_id)
                   AND (a.fecha_vuelta_real IS NULL OR a.fecha_vuelta_real > interno.hoy_de_la_prestadora(a.prestadora_id))
              ) END;
$function$;
CREATE OR REPLACE FUNCTION interno.crear_y_cerrar_servicios_lo_hace_quien_puede()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_cambia_estado boolean := TG_OP = 'UPDATE' AND NEW.estado IS DISTINCT FROM OLD.estado;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF (TG_OP = 'INSERT' OR v_cambia_estado)
     AND NOT (interno.es_admin_prestadora()
              OR interno.es_superadmin()
              OR interno.tiene_permiso('gestionar_servicios')) THEN
    RAISE EXCEPTION 'crear_y_cerrar_servicios_lo_hace_quien_puede';
  END IF;

  -- Una persona cambia el estado sólo por las dos funciones, que dejan el registro.
  IF v_cambia_estado
     AND COALESCE(current_setting('careonys.cambio_de_estado_del_servicio', true), '') <> NEW.id::text THEN
    RAISE EXCEPTION 'el_estado_del_servicio_cambia_por_la_baja_o_la_reactivacion';
  END IF;

  IF v_cambia_estado AND NEW.estado = 'de_baja'
     AND interno.turnos_guardia_asignados_del_servicio(NEW.id) > 0 THEN
    RAISE EXCEPTION 'el_servicio_tiene_turnos_guardia_asignados';
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION interno.dia_en_que_termina_turno_guardia(p_fecha date, p_hora_inicio time without time zone, p_hora_fin time without time zone, p_dias_hasta_el_fin smallint DEFAULT NULL::smallint)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
           -- Duración escrita: manda, y es el caso de toda guardia cargada de acá en adelante.
           WHEN p_dias_hasta_el_fin IS NOT NULL THEN p_fecha + p_dias_hasta_el_fin
           WHEN p_hora_fin IS NULL OR p_hora_inicio IS NULL THEN p_fecha
           -- Sin duración escrita se cae en la regla vieja, que sólo sabe de la guardia de noche.
           WHEN p_hora_fin <= p_hora_inicio THEN p_fecha + 1
           ELSE p_fecha
         END;
$function$;
CREATE FUNCTION interno.dias_de_la_guardia_mas_larga(p_prestadora uuid, p_servicio uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT COALESCE(max(c.dias_hasta_el_fin), 0)::integer
    FROM cronograma_de_guardias c
    JOIN prestaciones p ON p.id = c.prestacion_id AND p.prestadora_id = c.prestadora_id
   WHERE p.servicio_id = p_servicio
     AND p.prestadora_id = p_prestadora
$function$;
GRANT ALL ON FUNCTION interno.dias_de_la_guardia_mas_larga(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION interno.dias_de_la_guardia_mas_larga(uuid, uuid) TO service_role;
GRANT ALL ON FUNCTION interno.dias_de_la_guardia_mas_larga(uuid, uuid) TO trabajo_sin_persona;
CREATE OR REPLACE FUNCTION interno.documentos_que_bloquean(p_asistente_id uuid, p_dia date, p_paciente_id uuid DEFAULT NULL::uuid, p_servicio_id uuid DEFAULT NULL::uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prestadora_id uuid;
  v_tipo_id       uuid;
  v_tipo          record;
  v_hasta         date;
  v_vencio        date;
  v_bloquean      text[] := ARRAY[]::text[];
BEGIN
  IF p_asistente_id IS NULL THEN
    RETURN v_bloquean;
  END IF;

  SELECT a.prestadora_id, a.tipo_asistente_id INTO v_prestadora_id, v_tipo_id
    FROM public.asistentes a
   WHERE a.id = p_asistente_id;

  IF COALESCE(auth.jwt() ->> 'role', '') NOT IN ('', 'service_role')
     AND v_prestadora_id IS DISTINCT FROM interno.prestadora_actual() THEN
    RAISE EXCEPTION 'El Asistente no pertenece a la Prestadora de quien pregunta'
      USING ERRCODE = '42501';
  END IF;

  IF v_tipo_id IS NULL THEN
    RETURN v_bloquean;
  END IF;

  FOR v_tipo IN
    SELECT t.id, t.nombre
      FROM public.tipos_documento_asistente t
      JOIN public.tipos_documento_por_tipo_asistente r ON r.tipo_documento_id = t.id
     WHERE t.prestadora_id = v_prestadora_id
       AND t.activo
       AND t.impide_trabajar
       AND r.tipo_asistente_id = v_tipo_id
     ORDER BY t.nombre
  LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.documentos_asistente d
       WHERE d.asistente_id = p_asistente_id
         AND d.tipo_documento_id = v_tipo.id
         AND d.estado = 'aprobado'
         AND (d.fecha_vencimiento IS NULL OR d.fecha_vencimiento >= p_dia));

    v_hasta := interno.gracia_hasta(p_asistente_id, v_tipo.id, p_dia);

    IF v_hasta IS NOT NULL AND v_hasta >= p_dia THEN
      SELECT max(d.fecha_vencimiento) INTO v_vencio
        FROM public.documentos_asistente d
       WHERE d.asistente_id = p_asistente_id
         AND d.tipo_documento_id = v_tipo.id
         AND d.estado = 'aprobado'
         AND d.fecha_vencimiento < p_dia;

      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.turnos_guardia g
         WHERE g.asistente_id = p_asistente_id
           AND g.fecha <= v_vencio
           AND g.estado <> 'cancelada'
           AND (g.paciente_id = p_paciente_id OR g.servicio_id = p_servicio_id))
      OR EXISTS (
        SELECT 1 FROM public.series_turnos_guardia s
         WHERE s.asistente_id = p_asistente_id
           AND s.estado = 'activa'
           AND s.paciente_id = p_paciente_id);
    END IF;

    v_bloquean := v_bloquean || v_tipo.nombre;
  END LOOP;

  RETURN v_bloquean;
END;
$function$;
CREATE FUNCTION interno.el_acceso_abre_contactos(p_prestadora uuid, p_estado text, p_suspension_desde date, p_vigente_hasta date)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT COALESCE(CASE p_estado
    WHEN 'vigente' THEN true
    -- En gracia abre hasta el día anterior a la suspensión. Sin fecha de suspensión no hay
    -- fecha conocida y se niega: falla cerrado.
    WHEN 'en_gracia' THEN p_suspension_desde IS NOT NULL AND p_suspension_desde > interno.hoy_de_la_prestadora(p_prestadora)
    -- Dado de baja, abre hasta el último día del período pagado, ese día incluido.
    WHEN 'cancelada' THEN p_vigente_hasta IS NOT NULL AND p_vigente_hasta >= interno.hoy_de_la_prestadora(p_prestadora)
    ELSE false
  END, false);
$function$;
GRANT ALL ON FUNCTION interno.el_acceso_abre_contactos(uuid, text, date, date) TO service_role;
GRANT ALL ON FUNCTION interno.el_acceso_abre_contactos(uuid, text, date, date) TO trabajo_sin_persona;
CREATE OR REPLACE FUNCTION interno.el_asistente_marca_solo_su_turno_guardia()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_suyas constant text[] := ARRAY[
    'salida_checkin_at', 'salida_lat', 'salida_lng', 'medio_transporte',
    'checkin_at', 'checkin_lat', 'checkin_lng',
    'checkout_at', 'checkout_lat', 'checkout_lng',
    'estado',
    'ubicacion_actual_lat', 'ubicacion_actual_lng', 'ubicacion_actual_at',
    'push_llegada_enviado_at', 'push_reporte_enviado_at'
  ];
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF interno.es_personal_de_la_prestadora() THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - v_suyas) IS DISTINCT FROM (to_jsonb(OLD) - v_suyas) THEN
    RAISE EXCEPTION 'la_persona_cambia_solo_lo_suyo' USING ERRCODE = '42501';
  END IF;

  -- La salida, la llegada y el cierre: se marcan una vez, con todo lo suyo, y no se reescriben.
  IF (NEW.salida_checkin_at, NEW.salida_lat, NEW.salida_lng, NEW.medio_transporte)
       IS DISTINCT FROM (OLD.salida_checkin_at, OLD.salida_lat, OLD.salida_lng, OLD.medio_transporte)
     AND (OLD.salida_checkin_at IS NOT NULL OR NEW.salida_checkin_at IS NULL) THEN
    RAISE EXCEPTION 'la_persona_cambia_solo_lo_suyo' USING ERRCODE = '42501';
  END IF;
  IF (NEW.checkin_at, NEW.checkin_lat, NEW.checkin_lng)
       IS DISTINCT FROM (OLD.checkin_at, OLD.checkin_lat, OLD.checkin_lng)
     AND (OLD.checkin_at IS NOT NULL OR NEW.checkin_at IS NULL OR NEW.estado IS DISTINCT FROM 'activa') THEN
    RAISE EXCEPTION 'la_persona_cambia_solo_lo_suyo' USING ERRCODE = '42501';
  END IF;
  IF (NEW.checkout_at, NEW.checkout_lat, NEW.checkout_lng)
       IS DISTINCT FROM (OLD.checkout_at, OLD.checkout_lat, OLD.checkout_lng)
     AND (OLD.checkout_at IS NOT NULL OR NEW.checkout_at IS NULL OR NEW.estado IS DISTINCT FROM 'completada') THEN
    RAISE EXCEPTION 'la_persona_cambia_solo_lo_suyo' USING ERRCODE = '42501';
  END IF;

  -- El estado: a empezada al llegar, desde una guardia que todavía no empezó y no se canceló; a
  -- terminada al cerrar, desde una empezada. Ningún otro cambio es del Asistente.
  IF NEW.estado IS DISTINCT FROM OLD.estado
     AND NOT (
       (NEW.estado = 'activa' AND OLD.estado IN ('programada', 'ausente', 'pausada')
          AND OLD.checkin_at IS NULL AND NEW.checkin_at IS NOT NULL)
       OR
       (NEW.estado = 'completada' AND OLD.estado = 'activa'
          AND OLD.checkout_at IS NULL AND NEW.checkout_at IS NOT NULL)
     ) THEN
    RAISE EXCEPTION 'la_persona_cambia_solo_lo_suyo' USING ERRCODE = '42501';
  END IF;

  -- Los avisos ya mandados no se desmarcan: desmarcarlos los volvería a mandar.
  IF (OLD.push_llegada_enviado_at IS NOT NULL AND NEW.push_llegada_enviado_at IS DISTINCT FROM OLD.push_llegada_enviado_at)
     OR (OLD.push_reporte_enviado_at IS NOT NULL AND NEW.push_reporte_enviado_at IS DISTINCT FROM OLD.push_reporte_enviado_at) THEN
    RAISE EXCEPTION 'la_persona_cambia_solo_lo_suyo' USING ERRCODE = '42501';
  END IF;

  -- La hora de cada marca es la de la base, no la que mande el teléfono.
  IF NEW.salida_checkin_at IS DISTINCT FROM OLD.salida_checkin_at THEN NEW.salida_checkin_at := now(); END IF;
  IF NEW.checkin_at IS DISTINCT FROM OLD.checkin_at THEN NEW.checkin_at := now(); END IF;
  IF NEW.checkout_at IS DISTINCT FROM OLD.checkout_at THEN NEW.checkout_at := now(); END IF;
  IF NEW.ubicacion_actual_at IS NOT NULL AND NEW.ubicacion_actual_at IS DISTINCT FROM OLD.ubicacion_actual_at THEN
    NEW.ubicacion_actual_at := now();
  END IF;
  IF NEW.push_llegada_enviado_at IS DISTINCT FROM OLD.push_llegada_enviado_at THEN NEW.push_llegada_enviado_at := now(); END IF;
  IF NEW.push_reporte_enviado_at IS DISTINCT FROM OLD.push_reporte_enviado_at THEN NEW.push_reporte_enviado_at := now(); END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION interno.el_relevo_se_resuelve_como_paso()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_asistente_del_turno_guardia uuid;
  v_llego_tarde boolean;
BEGIN
  -- Ya resuelto: queda como quedó.
  IF OLD.resuelto_at IS NOT NULL THEN
    NEW.resuelto_at := OLD.resuelto_at;
    NEW.resuelto_por_tipo := OLD.resuelto_por_tipo;
    NEW.resuelto_por_id := OLD.resuelto_por_id;
    NEW.resuelto_por_usuario := OLD.resuelto_por_usuario;
    RETURN NEW;
  END IF;

  IF NEW.resuelto_at IS NULL THEN
    NEW.resuelto_por_tipo := NULL;
    NEW.resuelto_por_id := NULL;
    NEW.resuelto_por_usuario := NULL;
    RETURN NEW;
  END IF;

  NEW.resuelto_por_usuario := interno.usuario_de_la_sesion();

  IF NEW.resuelto_por_id IS NOT NULL THEN
    SELECT g.asistente_id, g.llegada_tarde INTO v_asistente_del_turno_guardia, v_llego_tarde
      FROM turnos_guardia g
     WHERE g.id = NEW.turno_guardia_entrante_id
       AND g.prestadora_id = NEW.prestadora_id;
    IF v_asistente_del_turno_guardia IS DISTINCT FROM NEW.resuelto_por_id THEN
      RAISE EXCEPTION 'relevo_con_otro_asistente' USING ERRCODE = '23514';
    END IF;

    -- Es el titular sólo si marcó la llegada sobre la guardia ausente: quien la cubre entra sobre
    -- una guardia que la reasignación ya volvió a programada, así que nunca llega tarde por esto.
    IF NEW.resuelto_por_tipo = 'titular' THEN
      IF NOT coalesce(v_llego_tarde, false) THEN
        RAISE EXCEPTION 'relevo_con_otro_asistente' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END IF;

    NEW.resuelto_por_tipo := coalesce(
      (SELECT pe.tipo
         FROM personal_emergencia pe
        WHERE pe.asistente_id = NEW.resuelto_por_id
          AND pe.prestadora_id = NEW.prestadora_id
          AND pe.activo
        ORDER BY (pe.tipo = 'franquero') DESC
        LIMIT 1),
      'suplente');
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION interno.excepcion_por_documentos(p_prestadora_id uuid, p_turno_guardia_id uuid, p_asistente_id uuid, p_bloquean text[], p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF cardinality(p_bloquean) = 0 THEN
    RETURN;
  END IF;

  IF btrim(COALESCE(p_motivo, '')) = '' THEN
    RAISE EXCEPTION 'documentos_bloquean:%:', array_to_string(p_bloquean, ', ')
      USING ERRCODE = '23514';
  END IF;

  IF NOT interno.tiene_permiso('asignar_con_documentos_pendientes') THEN
    RAISE EXCEPTION 'sin_permiso_para_asignar_con_documentos_pendientes' USING ERRCODE = '42501';
  END IF;

  INSERT INTO excepciones_por_documentos (prestadora_id, turno_guardia_id, asistente_id, usuario_id, motivo, documentos)
  VALUES (p_prestadora_id, p_turno_guardia_id, p_asistente_id, interno.usuario_de_la_sesion(), btrim(p_motivo), p_bloquean);
END;
$function$;
CREATE OR REPLACE FUNCTION interno.exigir_documentos_en_asignacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_bloquean text[];
  v_dia      date;
  v_paciente uuid;
  v_servicio uuid;
BEGIN
  IF NOT (TG_OP = 'INSERT'
          OR (NEW.estado = 'aceptada' AND OLD.estado IS DISTINCT FROM 'aceptada')) THEN
    RETURN NEW;
  END IF;

  IF NEW.turno_guardia_id IS NOT NULL THEN
    IF interno.hay_excepcion_por_documentos(NEW.turno_guardia_id, NEW.asistente_id) THEN
      RETURN NEW;
    END IF;

    SELECT interno.dia_en_que_termina_turno_guardia(g.fecha, g.hora_inicio, g.hora_fin, g.dias_hasta_el_fin),
           g.paciente_id, g.servicio_id
      INTO v_dia, v_paciente, v_servicio
      FROM public.turnos_guardia g
     WHERE g.id = NEW.turno_guardia_id;
  ELSIF NEW.serie_id IS NOT NULL THEN
    SELECT GREATEST(s.vigente_desde, interno.hoy_de_la_prestadora(NEW.prestadora_id)), s.paciente_id, s.servicio_id
      INTO v_dia, v_paciente, v_servicio
      FROM public.series_turnos_guardia s
     WHERE s.id = NEW.serie_id;
  END IF;

  v_bloquean := interno.documentos_que_bloquean(NEW.asistente_id, COALESCE(v_dia, interno.hoy_de_la_prestadora(NEW.prestadora_id)), v_paciente, v_servicio);

  IF cardinality(v_bloquean) > 0 THEN
    RAISE EXCEPTION 'documentos_bloquean:%:', array_to_string(v_bloquean, ', ')
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION interno.exigir_documentos_en_turno_guardia()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_bloquean text[];
BEGIN
  IF NEW.asistente_id IS NULL
     OR (TG_OP = 'UPDATE' AND NEW.asistente_id IS NOT DISTINCT FROM OLD.asistente_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND interno.hay_excepcion_por_documentos(NEW.id, NEW.asistente_id) THEN
    RETURN NEW;
  END IF;

  v_bloquean := interno.documentos_que_bloquean(
    NEW.asistente_id,
    interno.dia_en_que_termina_turno_guardia(NEW.fecha, NEW.hora_inicio, NEW.hora_fin, NEW.dias_hasta_el_fin),
    NEW.paciente_id,
    NEW.servicio_id
  );

  IF cardinality(v_bloquean) > 0 THEN
    RAISE EXCEPTION 'documentos_bloquean:%:', array_to_string(v_bloquean, ', ')
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION interno.exigir_final_del_catalogo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_pide_detalle boolean;
BEGIN
  -- Un expediente abierto no tiene final, y eso es lo normal: se abre sin él.
  IF NEW.resuelto_como IS NULL THEN
    RETURN NEW;
  END IF;

  -- Lo ya escrito no se revisa. Los expedientes cerrados antes de que existiera el catálogo
  -- guardan finales que no están en él, y tocarles cualquier otra columna no es motivo para
  -- rechazarlos.
  IF TG_OP = 'UPDATE' AND OLD.resuelto_como IS NOT DISTINCT FROM NEW.resuelto_como THEN
    RETURN NEW;
  END IF;

  SELECT f.pide_detalle INTO v_pide_detalle
  FROM finales_turno_guardia_sin_cubrir f
  WHERE f.prestadora_id = NEW.prestadora_id
    AND f.activo
    AND coalesce(f.clave, f.nombre) = NEW.resuelto_como
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'final_de_turno_guardia_inexistente:%', NEW.resuelto_como;
  END IF;

  IF v_pide_detalle AND coalesce(btrim(NEW.resuelto_detalle), '') = '' THEN
    RAISE EXCEPTION 'final_de_turno_guardia_pide_detalle:%', NEW.resuelto_como;
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION interno.exigir_motivo_de_sustitucion_del_catalogo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_pide_detalle boolean;
BEGIN
  -- Sin causa cargada no hay nada que controlar. Es el caso de las coberturas viejas, que se
  -- anotaron cuando este catálogo no existía y no se reescriben.
  IF NEW.motivo IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT m.pide_detalle INTO v_pide_detalle
  FROM motivos_sustitucion_turno_guardia m
  WHERE m.prestadora_id = NEW.prestadora_id
    AND m.activo
    AND coalesce(m.clave, m.nombre) = NEW.motivo
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'motivo_de_sustitucion_inexistente:%', NEW.motivo;
  END IF;

  IF v_pide_detalle AND coalesce(btrim(NEW.motivo_detalle), '') = '' THEN
    RAISE EXCEPTION 'motivo_de_sustitucion_pide_detalle:%', NEW.motivo;
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION interno.falta_la_firma_del_pagador(p_servicio uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM servicios s
      JOIN prestadoras p ON p.id = s.prestadora_id
     WHERE s.id = p_servicio
       AND p.turnos_guardia_solo_con_firma_del_pagador
  ) AND NOT interno.firma_del_pagador_vigente(p_servicio);
$function$;
CREATE OR REPLACE FUNCTION interno.firma_del_pagador_vigente(p_servicio uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT EXISTS (SELECT 1 FROM interno.responsables_de_pagos_en(p_servicio, interno.hoy_de_la_prestadora((SELECT s.prestadora_id FROM public.servicios s WHERE s.id = p_servicio))))
     AND NOT EXISTS (
       SELECT 1
         FROM interno.responsables_de_pagos_en(p_servicio, interno.hoy_de_la_prestadora((SELECT s.prestadora_id FROM public.servicios s WHERE s.id = p_servicio))) AS r(persona)
        WHERE NOT EXISTS (
          SELECT 1
            FROM servicios s
            JOIN consentimientos_pagador k
              ON k.servicio_id = s.id
             AND k.prestadora_id = s.prestadora_id
           WHERE s.id = p_servicio
             AND k.estado = 'cerrado'
             AND k.pagador_persona_id = r.persona));
$function$;
CREATE OR REPLACE FUNCTION interno.fn_modalidad_en_asignacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_modalidad text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.turno_guardia_id IS NOT NULL THEN
    SELECT g.canal_modalidad INTO v_modalidad
      FROM public.turnos_guardia g
     WHERE g.id = NEW.turno_guardia_id;
  ELSIF NEW.serie_id IS NOT NULL THEN
    SELECT s.canal_modalidad INTO v_modalidad
      FROM public.series_turnos_guardia s
     WHERE s.id = NEW.serie_id;
  END IF;

  IF v_modalidad IS NOT NULL
     AND NOT interno.asistente_trabaja_en_modalidad(NEW.asistente_id, v_modalidad) THEN
    RAISE EXCEPTION 'modalidad_bloquea:%:', v_modalidad
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION interno.guardia_que_contiene(p_prestadora uuid, p_servicio uuid, p_paciente uuid, p_fecha date, p_hora_inicio time without time zone, p_hora_fin time without time zone, p_dias_hasta_el_fin smallint)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT o.guardia_id
    FROM interno.guardias_en_fechas(p_prestadora, p_servicio, p_paciente, p_fecha - interno.dias_de_la_guardia_mas_larga(p_prestadora, p_servicio), p_fecha) o
   WHERE o.inicio <= p_fecha + p_hora_inicio
     AND interno.dia_en_que_termina_turno_guardia(p_fecha, p_hora_inicio, p_hora_fin, p_dias_hasta_el_fin) + p_hora_fin <= o.fin
   ORDER BY o.inicio DESC, o.guardia_id
   LIMIT 1
$function$;
CREATE OR REPLACE FUNCTION interno.hay_excepcion_por_documentos(p_turno_guardia_id uuid, p_asistente_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.excepciones_por_documentos e
      JOIN public.turnos_guardia g ON g.id = e.turno_guardia_id AND g.prestadora_id = e.prestadora_id
     WHERE e.turno_guardia_id = p_turno_guardia_id
       AND e.asistente_id = p_asistente_id);
$function$;
CREATE FUNCTION interno.hoy_de_la_prestadora(p_prestadora uuid)
 RETURNS date
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT interno.hoy_en_la_zona(p.zona_horaria) FROM prestadoras p WHERE p.id = p_prestadora
$function$;
GRANT ALL ON FUNCTION interno.hoy_de_la_prestadora(uuid) TO authenticated;
GRANT ALL ON FUNCTION interno.hoy_de_la_prestadora(uuid) TO service_role;
GRANT ALL ON FUNCTION interno.hoy_de_la_prestadora(uuid) TO trabajo_sin_persona;
CREATE FUNCTION interno.hoy_de_la_sesion()
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT interno.hoy_de_la_prestadora(interno.prestadora_actual())
$function$;
CREATE FUNCTION interno.gracia_hasta(p_asistente_id uuid, p_tipo_documento_id uuid, p_dia date DEFAULT interno.hoy_de_la_sesion())
 RETURNS date
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prestadora_id uuid;
  v_vencio        date;
  v_hasta         date;
BEGIN
  SELECT a.prestadora_id INTO v_prestadora_id
    FROM public.asistentes a
   WHERE a.id = p_asistente_id;

  -- Una persona o el trabajo sin persona sólo preguntan por un Asistente de su Prestadora.
  IF COALESCE(auth.jwt() ->> 'role', '') NOT IN ('', 'service_role')
     AND v_prestadora_id IS DISTINCT FROM interno.prestadora_actual() THEN
    RAISE EXCEPTION 'El Asistente no pertenece a la Prestadora de quien pregunta'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
       SELECT 1 FROM public.documentos_asistente d
        WHERE d.asistente_id = p_asistente_id
          AND d.tipo_documento_id = p_tipo_documento_id
          AND d.estado = 'aprobado'
          AND (d.fecha_vencimiento IS NULL OR d.fecha_vencimiento >= p_dia)) THEN
    RETURN NULL;
  END IF;

  SELECT max(d.fecha_vencimiento) INTO v_vencio
    FROM public.documentos_asistente d
   WHERE d.asistente_id = p_asistente_id
     AND d.tipo_documento_id = p_tipo_documento_id
     AND d.estado = 'aprobado'
     AND d.fecha_vencimiento < p_dia;

  IF v_vencio IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT v_vencio + t.dias_de_gracia INTO v_hasta
    FROM public.tipos_documento_asistente t
   WHERE t.id = p_tipo_documento_id;

  SELECT GREATEST(v_hasta, max(p.hasta)) INTO v_hasta
    FROM public.prorrogas_de_gracia_documento p
   WHERE p.asistente_id = p_asistente_id
     AND p.tipo_documento_id = p_tipo_documento_id
     AND p.hasta > v_vencio;

  RETURN v_hasta;
END;
$function$;
GRANT ALL ON FUNCTION interno.hoy_de_la_sesion() TO authenticated;
GRANT ALL ON FUNCTION interno.hoy_de_la_sesion() TO service_role;
GRANT ALL ON FUNCTION interno.hoy_de_la_sesion() TO trabajo_sin_persona;
CREATE FUNCTION interno.hoy_en_la_zona(p_zona text)
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT (now() AT TIME ZONE p_zona)::date
$function$;
GRANT ALL ON FUNCTION interno.hoy_en_la_zona(text) TO authenticated;
GRANT ALL ON FUNCTION interno.hoy_en_la_zona(text) TO service_role;
GRANT ALL ON FUNCTION interno.hoy_en_la_zona(text) TO trabajo_sin_persona;
CREATE OR REPLACE FUNCTION interno.la_alarma_esta_a_la_vista(p_tipo text, p_referencia uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_tabla text := CASE p_tipo
    WHEN 'alerta_temprana_turno_guardia' THEN 'alertas_tempranas_turno_guardia'
    WHEN 'incidente_relevo' THEN 'incidentes_relevo'
    WHEN 'incidente_turno_guardia_sin_cubrir' THEN 'incidentes_turno_guardia_sin_cubrir'
    WHEN 'emergencia_turno_guardia' THEN 'emergencias_turno_guardia'
    WHEN 'turno_guardia_sin_cerrar' THEN 'turnos_guardia'
  END;
  v_antes text := coalesce(current_setting('careonys.lectura_de_salud', true), '');
  v_la_ve boolean;
BEGIN
  IF v_tabla IS NULL OR p_referencia IS NULL THEN
    RETURN false;
  END IF;
  IF v_tabla = 'emergencias_turno_guardia' THEN
    PERFORM set_config('careonys.lectura_de_salud', 'anotada', true);
  END IF;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1)', v_tabla) INTO v_la_ve USING p_referencia;
  IF v_tabla = 'emergencias_turno_guardia' THEN
    PERFORM set_config('careonys.lectura_de_salud', v_antes, true);
  END IF;
  RETURN coalesce(v_la_ve, false);
END;
$function$;
CREATE OR REPLACE FUNCTION interno.la_alarma_la_resuelve_quien_la_tomo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_tipo text;
  v_resuelve boolean;
  v_actor uuid := interno.usuario_de_la_sesion();
  v_quien uuid;
  v_asistente uuid;
BEGIN
  IF TG_TABLE_NAME = 'alertas_tempranas_turno_guardia' THEN
    v_tipo := 'alerta_temprana_turno_guardia';
    v_resuelve := OLD.resuelto_at IS NULL AND NEW.resuelto_at IS NOT NULL;
  ELSIF TG_TABLE_NAME = 'incidentes_relevo' THEN
    v_tipo := 'incidente_relevo';
    v_resuelve := OLD.resuelto_at IS NULL AND NEW.resuelto_at IS NOT NULL;
  ELSIF TG_TABLE_NAME = 'incidentes_turno_guardia_sin_cubrir' THEN
    v_tipo := 'incidente_turno_guardia_sin_cubrir';
    v_resuelve := OLD.resuelto_at IS NULL AND NEW.resuelto_at IS NOT NULL;
  ELSIF TG_TABLE_NAME = 'emergencias_turno_guardia' THEN
    v_tipo := 'emergencia_turno_guardia';
    v_resuelve := OLD.atendida_at IS NULL AND NEW.atendida_at IS NOT NULL;
    v_actor := coalesce(v_actor, NEW.atendida_por);
  ELSIF TG_TABLE_NAME = 'turnos_guardia' THEN
    v_tipo := 'turno_guardia_sin_cerrar';
    v_resuelve := OLD.estado = 'activa' AND NEW.estado IS DISTINCT FROM 'activa';
  END IF;

  IF NOT coalesce(v_resuelve, false) OR v_actor IS NULL OR NOT interno.es_usuario_del_panel(v_actor) THEN
    RETURN NEW;
  END IF;

  v_quien := interno.quien_tiene_la_alarma(NEW.prestadora_id, v_tipo, NEW.id);
  IF v_quien IS NOT NULL AND v_quien <> v_actor THEN
    RAISE EXCEPTION 'alarma_tomada_por_otra_persona' USING ERRCODE = '42501';
  END IF;

  -- Fuera de su zona, el Coordinador atiende la emergencia sólo si la tomó. Con sesión lo exige
  -- también la política; acá queda para lo que entra sin persona, que la política no mira.
  IF TG_TABLE_NAME = 'emergencias_turno_guardia' AND v_quien IS NULL AND interno.es_coordinador_de(v_actor) THEN
    SELECT g.asistente_id INTO v_asistente FROM turnos_guardia g WHERE g.id = NEW.turno_guardia_id;
    IF NOT interno.coordinador_alcanza_asistente_de(v_actor, v_asistente) THEN
      RAISE EXCEPTION 'alarma_fuera_de_la_zona' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
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
     OR NEW.turno_guardia_id IS DISTINCT FROM OLD.turno_guardia_id
     OR NEW.serie_id IS DISTINCT FROM OLD.serie_id
     OR NEW.ausencia_id IS DISTINCT FROM OLD.ausencia_id
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
CREATE OR REPLACE FUNCTION interno.la_persona_tiene_un_rol_que_el_coordinador_ve(p_persona uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT p_persona IS NOT NULL AND interno.es_coordinador() AND (
       EXISTS (SELECT 1 FROM clientes c
                WHERE c.contratante_persona_id = p_persona
                  AND c.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_al_cliente(c.id))
    OR ((interno.tiene_permiso('editar_condiciones_comerciales_servicio')
         OR interno.tiene_permiso('registrar_consentimiento_pagador'))
        AND (EXISTS (SELECT 1 FROM condiciones_comerciales_servicio cc
                      JOIN servicios s ON s.id = cc.servicio_id AND s.prestadora_id = cc.prestadora_id
                     WHERE cc.contratante_persona_id = p_persona
                       AND cc.prestadora_id = interno.prestadora_actual()
                       AND interno.coordinador_ve_al_cliente(s.cliente_id))
          OR EXISTS (SELECT 1 FROM pagadores_del_servicio ps
                      JOIN servicios s ON s.id = ps.servicio_id AND s.prestadora_id = ps.prestadora_id
                     WHERE ps.pagador_persona_id = p_persona
                       AND ps.prestadora_id = interno.prestadora_actual()
                       AND interno.coordinador_ve_al_cliente(s.cliente_id))))
    OR EXISTS (SELECT 1 FROM apoderados a
                WHERE a.persona_id = p_persona
                  AND a.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_al_cliente(a.cliente_id))
    OR (interno.tiene_permiso('registrar_consentimiento_pagador')
        AND EXISTS (SELECT 1 FROM consentimientos_pagador cp
                    WHERE (cp.pagador_persona_id = p_persona OR cp.firmante_persona_id = p_persona)
                      AND cp.prestadora_id = interno.prestadora_actual()
                      AND interno.coordinador_ve_al_cliente(cp.cliente_id)))
    OR EXISTS (SELECT 1 FROM personas_autorizadas pa
                WHERE pa.persona_id = p_persona
                  AND interno.coordinador_ve_al_cliente(pa.cliente_id))
    OR EXISTS (SELECT 1 FROM pacientes pac
                WHERE (pac.persona_id = p_persona OR pac.obra_social_persona_id = p_persona)
                  AND pac.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_al_paciente(pac.id))
    OR EXISTS (SELECT 1 FROM consentimientos_medicacion cm
                 JOIN indicaciones_medicacion im ON im.id = cm.indicacion_id
                WHERE cm.firmante_persona_id = p_persona
                  AND cm.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_al_paciente(im.paciente_id))
    OR EXISTS (SELECT 1 FROM excepciones_familiar_relevo e
                WHERE e.familiar_persona_id = p_persona
                  AND e.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_el_turno_guardia(e.turno_guardia_id))
  );
$function$;
CREATE FUNCTION interno.la_suspension_de_la_internacion_vuelve_al_cerrarla()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF OLD.hospitalizacion_id IS NULL OR OLD.levantada_at IS NOT NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM public.prestadoras p WHERE p.id = OLD.prestadora_id)
       OR EXISTS (SELECT 1 FROM public.hospitalizaciones_paciente h
                   WHERE h.id = OLD.hospitalizacion_id AND h.fecha_fin IS NOT NULL) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'la_suspension_es_de_una_internacion' USING ERRCODE = 'P0001';
  END IF;

  -- Lo único que se le cambia es levantarla: el resto queda como nació. La columna calculada del
  -- motivo no cuenta: antes de guardarse la fila llega vacía y parecería cambiada.
  IF (to_jsonb(NEW) - 'levantada_desde' - 'levantada_at' - 'levantada_por' - 'motivo_tabla')
     IS DISTINCT FROM (to_jsonb(OLD) - 'levantada_desde' - 'levantada_at' - 'levantada_por' - 'motivo_tabla') THEN
    RAISE EXCEPTION 'la_suspension_es_de_una_internacion' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.levantada_at IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.hospitalizaciones_paciente h
                      WHERE h.id = OLD.hospitalizacion_id AND h.fecha_fin IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM public.bajas_de_servicio b
                      WHERE b.servicio_id = OLD.servicio_id AND b.created_at = now()) THEN
    RAISE EXCEPTION 'la_suspension_es_de_una_internacion' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;
GRANT ALL ON FUNCTION interno.la_suspension_de_la_internacion_vuelve_al_cerrarla() TO service_role;
CREATE OR REPLACE FUNCTION interno.pacientes_de_la_fila(p_tabla text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE p_tabla
    WHEN 'emergencias_turno_guardia' THEN 'ARRAY(SELECT interno.pacientes_del_turno_guardia(t.turno_guardia_id))'
    WHEN 'cargas_sujetas_a_aprobacion' THEN
      'CASE WHEN t.tabla = ''informacion_de_salud_del_paciente'' THEN ARRAY[t.paciente_id] ELSE ''{}''::uuid[] END'
    ELSE 'ARRAY[t.paciente_id]'
  END;
$function$;
CREATE OR REPLACE FUNCTION interno.pacientes_de_la_serie(p_serie_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT paciente_id FROM series_turnos_guardia_pacientes WHERE serie_id = p_serie_id
$function$;
CREATE OR REPLACE FUNCTION interno.pacientes_del_asistente()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT gp.paciente_id
    FROM turno_guardia_pacientes gp
    JOIN turnos_guardia g ON g.id = gp.turno_guardia_id
   WHERE g.asistente_id = interno.asistente_de_la_sesion()
     AND g.prestadora_id = interno.prestadora_actual()
$function$;
CREATE OR REPLACE FUNCTION interno.pacientes_del_turno_guardia(p_turno_guardia_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT paciente_id FROM turno_guardia_pacientes WHERE turno_guardia_id = p_turno_guardia_id
$function$;
CREATE OR REPLACE FUNCTION interno.periodo_del_servicio()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.vigente_desde := COALESCE(NEW.vigente_desde,
      interno.hoy_de_la_prestadora(NEW.prestadora_id));
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
CREATE OR REPLACE FUNCTION interno.personal_ve_la_calificacion(p_asistente uuid, p_turno_guardia uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT interno.es_superadmin()
      OR interno.es_admin_prestadora()
      OR (interno.es_coordinador()
          AND ((p_asistente IS NOT NULL AND interno.coordinador_alcanza_asistente(p_asistente))
               OR (p_turno_guardia IS NOT NULL AND interno.coordinador_ve_el_turno_guardia(p_turno_guardia))));
$function$;
CREATE OR REPLACE FUNCTION interno.sin_coordinador_no_hay_turnos_guardia()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_servicio uuid := interno.servicio_a_revisar_al_programar(
    to_jsonb(NEW), CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END, TG_OP);
BEGIN
  IF v_servicio IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM servicios s
     WHERE s.id = v_servicio
       AND s.prestadora_id = NEW.prestadora_id
       AND s.coordinador_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'servicio_sin_coordinador:%', v_servicio;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION interno.sin_firma_del_pagador_no_hay_turnos_guardia()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_servicio uuid := interno.servicio_a_revisar_al_programar(
    to_jsonb(NEW), CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END, TG_OP);
BEGIN
  IF v_servicio IS NULL THEN
    RETURN NEW;
  END IF;
  IF interno.falta_la_firma_del_pagador(v_servicio) THEN
    RAISE EXCEPTION 'servicio_sin_firma_del_pagador' USING DETAIL = v_servicio::text;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION interno.suspender_por_la_internacion(p_hospitalizacion uuid)
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
                      interno.hoy_de_la_prestadora(v_h.prestadora_id));

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
CREATE OR REPLACE FUNCTION interno.tablas_de_salud()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT ARRAY[
    'alertas', 'cargas_sujetas_a_aprobacion', 'emergencias_turno_guardia', 'hospitalizaciones_paciente',
    'indicaciones_medicacion', 'informacion_de_salud_del_paciente', 'informes_obra_social',
    'rangos_referencia_vitales', 'reportes', 'versiones_registro_clinico'
  ]::text[];
$function$;
CREATE OR REPLACE FUNCTION interno.turno_guardia_empezado_no_cambia_de_paciente()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF OLD.paciente_id IS NOT NULL
     AND NEW.paciente_id IS DISTINCT FROM OLD.paciente_id
     AND COALESCE(OLD.checkin_at, NEW.checkin_at) IS NOT NULL THEN
    RAISE EXCEPTION 'turno_guardia_empezado_no_cambia_de_paciente' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION interno.turno_guardia_empezado_no_pierde_pacientes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_checkin timestamptz;
  v_existe boolean;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.turno_guardia_id = OLD.turno_guardia_id
     AND NEW.paciente_id = OLD.paciente_id THEN
    RETURN NEW;
  END IF;

  SELECT true, g.checkin_at
    INTO v_existe, v_checkin
    FROM turnos_guardia g
   WHERE g.id = OLD.turno_guardia_id;

  IF v_existe IS NULL THEN
    -- La guardia ya no está: es el borrado en cascada de la guardia entera.
    IF pg_trigger_depth() > 1 THEN
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;
    -- Una guardia que no se pudo leer no se da por no empezada.
    RAISE EXCEPTION 'turno_guardia_empezado_no_cambia_de_paciente' USING ERRCODE = '23514';
  END IF;

  IF v_checkin IS NOT NULL THEN
    RAISE EXCEPTION 'turno_guardia_empezado_no_cambia_de_paciente' USING ERRCODE = '23514';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;
CREATE OR REPLACE FUNCTION interno.turnos_guardia_a_la_vista_por_una_alarma(p_solo_las_tomadas boolean)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_tipo text;
  v_turnos_guardia uuid[] := '{}';
  v_referencias uuid[];
BEGIN
  IF NOT interno.es_coordinador() THEN
    RETURN '{}';
  END IF;
  FOREACH v_tipo IN ARRAY ARRAY['alerta_temprana_turno_guardia', 'incidente_relevo', 'turno_guardia_sin_cerrar',
                                'incidente_turno_guardia_sin_cubrir', 'emergencia_turno_guardia'] LOOP
    v_referencias := CASE WHEN p_solo_las_tomadas THEN interno.alarmas_que_tengo_tomadas(v_tipo)
                          ELSE interno.alarmas_a_la_vista_del_coordinador(v_tipo) END;
    IF cardinality(v_referencias) > 0 THEN
      v_turnos_guardia := v_turnos_guardia || ARRAY(SELECT interno.turnos_guardia_de_las_alarmas(v_tipo, v_referencias));
    END IF;
  END LOOP;
  RETURN v_turnos_guardia;
END;
$function$;
CREATE OR REPLACE FUNCTION interno.turnos_guardia_de_las_alarmas(p_tipo text, p_referencias uuid[])
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF p_tipo = 'alerta_temprana_turno_guardia' THEN
    RETURN QUERY SELECT x.turno_guardia_id FROM alertas_tempranas_turno_guardia x WHERE x.id = ANY (p_referencias);
  ELSIF p_tipo = 'incidente_relevo' THEN
    RETURN QUERY SELECT x.turno_guardia_entrante_id FROM incidentes_relevo x
                  WHERE x.id = ANY (p_referencias) AND x.turno_guardia_entrante_id IS NOT NULL
                 UNION
                 SELECT x.turno_guardia_saliente_id FROM incidentes_relevo x
                  WHERE x.id = ANY (p_referencias) AND x.turno_guardia_saliente_id IS NOT NULL;
  ELSIF p_tipo = 'incidente_turno_guardia_sin_cubrir' THEN
    RETURN QUERY SELECT x.turno_guardia_id FROM incidentes_turno_guardia_sin_cubrir x WHERE x.id = ANY (p_referencias);
  ELSIF p_tipo = 'emergencia_turno_guardia' THEN
    RETURN QUERY SELECT x.turno_guardia_id FROM emergencias_turno_guardia x WHERE x.id = ANY (p_referencias);
  ELSIF p_tipo = 'turno_guardia_sin_cerrar' THEN
    RETURN QUERY SELECT unnest(p_referencias);
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION interno.turnos_guardia_del_paciente(p_paciente_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT turno_guardia_id FROM turno_guardia_pacientes WHERE paciente_id = p_paciente_id
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
     AND (s.vigente_hasta IS NULL OR s.vigente_hasta + s.dias_hasta_el_fin >= interno.hoy_de_la_prestadora(p_prestadora))
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
          CROSS JOIN LATERAL (SELECT o.inicio::date - s.dias_hasta_el_fin::integer + i AS dia FROM generate_series(0, (o.fin::date - o.inicio::date) + s.dias_hasta_el_fin::integer) AS i) d
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
            AND t.fecha <= o.fin::date AND t.fecha + t.dias_hasta_el_fin::integer >= o.inicio::date
       ) c
   ) cuenta
   CROSS JOIN LATERAL unnest(cuenta.huecos) AS h(hueco)
$function$;
CREATE OR REPLACE FUNCTION interno.validar_paciente_de_turno_guardia_del_contratante()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  servicio uuid;
BEGIN
  SELECT servicio_id INTO servicio FROM turnos_guardia WHERE id = NEW.turno_guardia_id;
  PERFORM interno.exigir_paciente_y_servicio_del_mismo_contratante(NEW.paciente_id, servicio);
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.aceptar_asignacion(p_asignacion_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
  v_asistente  uuid := interno.asistente_de_la_sesion();
  v_asignacion public.asignaciones_de_turno_guardia;
  v_tomadas    integer;
BEGIN
  IF v_prestadora IS NULL OR v_asistente IS NULL THEN
    RAISE EXCEPTION 'asignacion_no_encontrada';
  END IF;

  SELECT * INTO v_asignacion
    FROM asignaciones_de_turno_guardia
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

  IF v_asignacion.turno_guardia_id IS NOT NULL THEN
    UPDATE turnos_guardia
       SET asistente_id = v_asistente
     WHERE id = v_asignacion.turno_guardia_id
       AND prestadora_id = v_prestadora
       AND estado = 'programada'
       AND asistente_id IS NULL;

    GET DIAGNOSTICS v_tomadas = ROW_COUNT;
    IF v_tomadas = 0 THEN
      RAISE EXCEPTION 'turno_guardia_ya_cubierto';
    END IF;

  ELSIF v_asignacion.serie_id IS NOT NULL THEN
    UPDATE series_turnos_guardia
       SET asistente_id = v_asistente
     WHERE id = v_asignacion.serie_id
       AND prestadora_id = v_prestadora
       AND estado = 'activa'
       AND asistente_id IS NULL;

    GET DIAGNOSTICS v_tomadas = ROW_COUNT;
    IF v_tomadas = 0 THEN
      RAISE EXCEPTION 'turno_guardia_ya_cubierto';
    END IF;

    -- Los turnos que vienen pasan a ser suyos: los que no tienen a nadie y los que seguía haciendo
    -- quien tenía el turno fijo antes. Los que esperan la respuesta de otro por ese día quedan como
    -- están. Ya contestó que sí: no le llega un aviso por cada día.
    UPDATE turnos_guardia g
       SET asistente_id = v_asistente,
           push_asignacion_enviado_at = now()
     WHERE g.serie_id = v_asignacion.serie_id
       AND g.prestadora_id = v_prestadora
       AND g.estado = 'programada'
       AND (g.asistente_id IS NULL OR g.asistente_id = v_asignacion.asistente_anterior_id)
       AND g.fecha >= interno.hoy_de_la_prestadora(v_prestadora)
       AND NOT EXISTS (
         SELECT 1 FROM asignaciones_de_turno_guardia o
          WHERE o.turno_guardia_id = g.id
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

  UPDATE asignaciones_de_turno_guardia
     SET estado = 'aceptada'
   WHERE id = v_asignacion.id;

  RETURN v_asignacion.turno_guardia_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.actualizar_precios_por_indice(p_desde date, p_periodo_base date, p_periodo_nuevo date, p_aplicar boolean)
 RETURNS TABLE(clase text, renglon_id bigint, renglon_nuevo_id bigint, servicio_id uuid, descripcion text, indice text, precio_actual numeric, precio_nuevo numeric, moneda text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_prestadora  uuid := interno.prestadora_actual();
  v_regla       jsonb;
  v_indice_p    text;
  v_factor      numeric;
  v_lista       public.lista_precios;
  v_prestacion  record;
  v_pendientes  jsonb;
  v_elemento    jsonb;
  v_reemplazo   bigint;
BEGIN
  IF v_prestadora IS NULL OR NOT interno.es_la_administracion_de_la_prestadora(v_prestadora) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_desde IS NULL OR p_periodo_base IS NULL OR p_periodo_nuevo IS NULL
     OR p_desde <> date_trunc('month', p_desde)::date
     OR date_trunc('month', p_periodo_nuevo) <= date_trunc('month', p_periodo_base) THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;

  SELECT c.regla INTO v_regla FROM public.configuracion_facturacion_clientes c
   WHERE c.prestadora_id = v_prestadora;
  -- Igual que `condicionDe` de `panel/src/lib/condicionesDelCliente.js`: 'ninguno' es «sin índice».
  v_indice_p := NULLIF(NULLIF(btrim(coalesce(v_regla ->> 'indice_de_actualizacion', '')), ''), 'ninguno');

  -- Las prestaciones se eligen antes de tocar la lista, con su marca de revisión de ese momento:
  -- reemplazar un renglón de la lista marca a revisar las que apuntan a él, y la que se versiona
  -- acá no tiene nada que revisar.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'servicio_id', p.servicio_id, 'tipo_servicio', p.tipo_servicio,
           'precio_final', p.precio_final, 'precio_lista_snapshot', p.precio_lista_snapshot,
           'precio_lista_id', p.precio_lista_id, 'requiere_revision', p.requiere_revision,
           'precio_turno_guardia_adicional', p.precio_turno_guardia_adicional,
           'precio_hora_adicional', p.precio_hora_adicional,
           'moneda', p.moneda, 'indice', x.indice)), '[]'::jsonb)
    INTO v_pendientes
    FROM public.prestaciones p
    LEFT JOIN public.condiciones_comerciales_servicio c ON c.servicio_id = p.servicio_id
    CROSS JOIN LATERAL (SELECT
        CASE WHEN c.indice_de_actualizacion = 'ninguno' THEN NULL
             ELSE coalesce(NULLIF(btrim(coalesce(c.indice_de_actualizacion, '')), ''), v_indice_p) END AS indice) x
   WHERE p.prestadora_id = v_prestadora
     AND p.estado = 'vigente'
     AND p.vigente_hasta IS NULL
     AND p.vigente_desde < p_desde
     AND p.servicio_id IS NOT NULL
     AND x.indice IS NOT NULL;

  -- La lista de precios de la Prestadora.
  IF v_indice_p IS NOT NULL THEN
    v_factor := public.valor_del_indice(v_indice_p, p_periodo_nuevo)
              / NULLIF(public.valor_del_indice(v_indice_p, p_periodo_base), 0);
    FOR v_lista IN
      SELECT * FROM public.lista_precios l
       WHERE l.prestadora_id = v_prestadora AND l.vigente_hasta IS NULL AND l.activo
         AND l.vigente_desde < p_desde
       ORDER BY l.tipo_servicio, l.modalidad, l.id
    LOOP
      clase := 'lista';
      renglon_id := v_lista.id;
      renglon_nuevo_id := NULL;
      servicio_id := NULL;
      descripcion := v_lista.tipo_servicio || ' — ' || v_lista.modalidad;
      indice := v_indice_p;
      precio_actual := v_lista.precio;
      precio_nuevo := round(v_lista.precio * v_factor, 2);
      moneda := v_lista.moneda;
      IF p_aplicar AND precio_nuevo IS NOT NULL THEN
        renglon_nuevo_id := public.reemplazar_precio_de_lista(v_lista.id, precio_nuevo, p_desde);
      END IF;
      RETURN NEXT;
    END LOOP;
  END IF;

  -- Las prestaciones de los Servicios que se actualizan por índice.
  FOR v_elemento IN SELECT * FROM jsonb_array_elements(v_pendientes) LOOP
    v_factor := public.valor_del_indice(v_elemento ->> 'indice', p_periodo_nuevo)
              / NULLIF(public.valor_del_indice(v_elemento ->> 'indice', p_periodo_base), 0);
    clase := 'prestacion';
    renglon_id := (v_elemento ->> 'id')::bigint;
    renglon_nuevo_id := NULL;
    servicio_id := (v_elemento ->> 'servicio_id')::uuid;
    descripcion := v_elemento ->> 'tipo_servicio';
    indice := v_elemento ->> 'indice';
    precio_actual := (v_elemento ->> 'precio_final')::numeric;
    precio_nuevo := round(precio_actual * v_factor, 2);
    moneda := v_elemento ->> 'moneda';

    IF p_aplicar AND precio_nuevo IS NOT NULL AND precio_nuevo <> precio_actual THEN
      -- Si el renglón de la lista del que salió fue reemplazado recién, la nueva apunta al nuevo.
      SELECT l.id INTO v_reemplazo FROM public.lista_precios l
       WHERE l.reemplaza_a = NULLIF(v_elemento ->> 'precio_lista_id', '')::bigint
         AND l.vigente_desde = p_desde
       ORDER BY l.id DESC LIMIT 1;

      renglon_nuevo_id := interno.copiar_renglon('public.prestaciones', renglon_id, jsonb_build_object(
        'precio_final', precio_nuevo,
        'precio_lista_snapshot', CASE WHEN v_elemento ->> 'precio_lista_snapshot' IS NULL THEN NULL
                                      ELSE round((v_elemento ->> 'precio_lista_snapshot')::numeric * v_factor, 2) END,
        'precio_turno_guardia_adicional', CASE WHEN v_elemento ->> 'precio_turno_guardia_adicional' IS NULL THEN NULL
                                         ELSE round((v_elemento ->> 'precio_turno_guardia_adicional')::numeric * v_factor, 2) END,
        'precio_hora_adicional', CASE WHEN v_elemento ->> 'precio_hora_adicional' IS NULL THEN NULL
                                      ELSE round((v_elemento ->> 'precio_hora_adicional')::numeric * v_factor, 2) END,
        'precio_lista_id', coalesce(v_reemplazo, NULLIF(v_elemento ->> 'precio_lista_id', '')::bigint),
        'vigente_desde', p_desde,
        'vigente_hasta', NULL,
        'requiere_revision', false,
        'prestacion_anterior_id', renglon_id
      ));

      UPDATE public.prestaciones
         SET vigente_hasta = p_desde - 1,
             requiere_revision = (v_elemento ->> 'requiere_revision')::boolean
       WHERE id = renglon_id;
    END IF;
    RETURN NEXT;
  END LOOP;
END;
$function$;
CREATE OR REPLACE FUNCTION public.ajustar_precios_por_indice()
 RETURNS TABLE(aplicados integer, propuestos integer, sin_efecto integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_prest      uuid := interno.prestadora_actual();
  v_regla      jsonb;
  v            record;
  v_ancla      date;
  v_rige       date;
  v_base       date;
  v_nuevo      date;
  v_factor     numeric;
  v_precio     numeric;
  v_propuesta  uuid;
  v_nueva      bigint;
BEGIN
  IF v_prest IS NULL OR coalesce(auth.jwt() ->> 'role', '') <> 'trabajo_sin_persona' THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;

  -- Dos corridas a la vez para la misma Prestadora harían el mismo ajuste dos veces.
  PERFORM pg_advisory_xact_lock(hashtextextended('ajuste_por_indice:' || v_prest::text, 0));

  aplicados := 0;
  propuestos := 0;
  sin_efecto := 0;

  SELECT c.regla INTO v_regla FROM public.configuracion_facturacion_clientes c
   WHERE c.prestadora_id = v_prest;

  -- Las pendientes que ya no corresponden: la prestación dejó de ser la vigente, cambió su
  -- precio, o el Servicio cambió de índice o lo sacó.
  WITH vencidas AS (
    UPDATE public.propuestas_de_ajuste_por_indice pr
       SET estado = 'sin_efecto'
      FROM public.prestaciones p
      LEFT JOIN public.condiciones_comerciales_servicio c ON c.servicio_id = p.servicio_id
     WHERE pr.prestadora_id = v_prest
       AND pr.estado = 'pendiente'
       AND p.id = pr.prestacion_id
       AND (p.estado <> 'vigente'
            OR p.vigente_hasta IS NOT NULL
            OR p.precio_final <> pr.precio_actual
            OR (SELECT x.indice FROM interno.condiciones_del_ajuste_por_indice(
                  v_regla, c.indice_de_actualizacion, c.meses_entre_actualizaciones, c.ajuste_por_indice) x)
               IS DISTINCT FROM pr.indice)
    RETURNING pr.id
  )
  SELECT count(*) INTO sin_efecto FROM vencidas;

  FOR v IN
    SELECT p.id, p.servicio_id, p.vigente_desde, p.precio_final, p.precio_lista_snapshot, p.moneda,
           p.precio_turno_guardia_adicional, p.precio_hora_adicional,
           x.indice, x.meses, x.ajuste
      FROM public.prestaciones p
      LEFT JOIN public.condiciones_comerciales_servicio c ON c.servicio_id = p.servicio_id
     CROSS JOIN LATERAL interno.condiciones_del_ajuste_por_indice(
           v_regla, c.indice_de_actualizacion, c.meses_entre_actualizaciones, c.ajuste_por_indice) x
     WHERE p.prestadora_id = v_prest
       AND p.estado = 'vigente'
       AND p.vigente_hasta IS NULL
       AND p.servicio_id IS NOT NULL
       AND p.vigente_desde <= interno.hoy_de_la_prestadora(v_prest)
       AND p.precio_final > 0
       AND x.indice IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.propuestas_de_ajuste_por_indice pr
                        WHERE pr.prestacion_id = p.id AND pr.estado = 'pendiente')
     ORDER BY p.id
  LOOP
    SELECT greatest(date_trunc('month', v.vigente_desde)::date, max(pr.rige_desde))
      INTO v_ancla
      FROM public.propuestas_de_ajuste_por_indice pr
     WHERE pr.prestacion_id = v.id AND pr.estado = 'rechazada';

    v_rige := (v_ancla + make_interval(months => v.meses))::date;
    CONTINUE WHEN interno.hoy_de_la_prestadora(v_prest) < v_rige;

    v_base := (date_trunc('month', v.vigente_desde) - interval '1 month')::date;
    v_nuevo := (v_rige - interval '1 month')::date;

    v_factor := interno.valor_del_indice_de_la_prestadora(v_prest, v.indice, v_nuevo)
              / NULLIF(interno.valor_del_indice_de_la_prestadora(v_prest, v.indice, v_base), 0);
    CONTINUE WHEN v_factor IS NULL;

    v_precio := round(v.precio_final * v_factor, 2);
    CONTINUE WHEN v_precio = v.precio_final;

    -- Ya hubo un ajuste para ese mes (rechazado, por ejemplo): no se vuelve a proponer.
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.propuestas_de_ajuste_por_indice pr
                           WHERE pr.prestacion_id = v.id AND pr.rige_desde = v_rige
                             AND pr.estado <> 'sin_efecto');

    IF v.ajuste = 'automatico' THEN
      v_nueva := interno.copiar_renglon('public.prestaciones', v.id, jsonb_build_object(
        'precio_final', v_precio,
        'precio_lista_snapshot', CASE WHEN v.precio_lista_snapshot IS NULL THEN NULL
                                      ELSE round(v.precio_lista_snapshot * v_factor, 2) END,
        'precio_turno_guardia_adicional', CASE WHEN v.precio_turno_guardia_adicional IS NULL THEN NULL
                                         ELSE round(v.precio_turno_guardia_adicional * v_factor, 2) END,
        'precio_hora_adicional', CASE WHEN v.precio_hora_adicional IS NULL THEN NULL
                                      ELSE round(v.precio_hora_adicional * v_factor, 2) END,
        'vigente_desde', v_rige,
        'vigente_hasta', NULL,
        'requiere_revision', false,
        'prestacion_anterior_id', v.id
      ));

      INSERT INTO public.propuestas_de_ajuste_por_indice (
        prestadora_id, prestacion_id, servicio_id, indice, periodo_base, periodo_nuevo,
        precio_actual, precio_propuesto, moneda, rige_desde, estado, prestacion_nueva_id)
      VALUES (v_prest, v.id, v.servicio_id, v.indice, v_base, v_nuevo,
              v.precio_final, v_precio, v.moneda, v_rige, 'aplicada', v_nueva)
      RETURNING id INTO v_propuesta;

      INSERT INTO public.registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, detalle)
      VALUES (v_prest, NULL, 'ajuste_por_indice_aplicado', 'propuestas_de_ajuste_por_indice', v_propuesta,
              jsonb_build_object('prestacion_id', v.id, 'prestacion_nueva_id', v_nueva,
                                 'servicio_id', v.servicio_id, 'indice', v.indice,
                                 'precio_anterior', v.precio_final, 'precio_nuevo', v_precio,
                                 'moneda', v.moneda, 'rige_desde', v_rige));
      aplicados := aplicados + 1;
    ELSE
      INSERT INTO public.propuestas_de_ajuste_por_indice (
        prestadora_id, prestacion_id, servicio_id, indice, periodo_base, periodo_nuevo,
        precio_actual, precio_propuesto, moneda, rige_desde)
      VALUES (v_prest, v.id, v.servicio_id, v.indice, v_base, v_nuevo,
              v.precio_final, v_precio, v.moneda, v_rige);
      propuestos := propuestos + 1;
    END IF;
  END LOOP;

  RETURN NEXT;
END;
$function$;
CREATE OR REPLACE FUNCTION public.anotar_aviso_de_acceso_de_match(p_acceso_id uuid, p_estado text, p_periodo date, p_monto numeric, p_moneda text, p_numero_del_aviso text, p_fecha_cobro date DEFAULT NULL::date, p_suspende_el date DEFAULT NULL::date, p_vigente_hasta date DEFAULT NULL::date, p_medio text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
  v_acceso public.accesos_intermediacion%ROWTYPE;
  v_renueva_sola boolean;
  v_contactos integer;
  v_hay_uno_posterior boolean;
  v_estado_nuevo text;
  v_campos text[];
BEGIN
  -- Falla cerrado: sin Prestadora del trabajo no se anota nada.
  IF v_prestadora IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'acceso_inexistente');
  END IF;

  IF p_estado IS NULL OR p_estado NOT IN ('pagado', 'gracia', 'suspendido', 'baja') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'aviso_incompleto', 'dato', 'estado');
  END IF;
  IF p_periodo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'aviso_incompleto', 'dato', 'periodo');
  END IF;
  IF p_monto IS NULL OR p_monto < 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'aviso_incompleto', 'dato', 'monto');
  END IF;
  IF p_moneda IS NULL OR p_moneda !~ '^[A-Z]{3}$' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'aviso_incompleto', 'dato', 'moneda');
  END IF;
  IF p_numero_del_aviso IS NULL OR btrim(p_numero_del_aviso) = '' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'aviso_incompleto', 'dato', 'numero_del_aviso');
  END IF;
  IF p_estado = 'gracia' AND p_suspende_el IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'aviso_incompleto', 'dato', 'suspende_el');
  END IF;
  IF p_estado = 'baja' AND p_vigente_hasta IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'aviso_incompleto', 'dato', 'vigente_hasta');
  END IF;

  -- La fila del acceso tomada: dos avisos del mismo acceso que llegan juntos se anotan de a uno.
  -- El filtro por la Prestadora está escrito además de la política de fila: un acceso de otra
  -- Prestadora contesta igual que uno que no existe.
  SELECT * INTO v_acceso
    FROM public.accesos_intermediacion
   WHERE id = p_acceso_id AND prestadora_id = v_prestadora
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'acceso_inexistente');
  END IF;

  SELECT f.renueva_sola, f.contactos_incluidos
    INTO v_renueva_sola, v_contactos
    FROM public.formas_de_cobro_intermediacion f
   WHERE f.id = v_acceso.forma_de_cobro_id AND f.prestadora_id = v_prestadora;

  -- Sólo se da de baja lo que se renueva solo. Lo que no se renueva termina por sí mismo.
  IF p_estado = 'baja' AND v_renueva_sola IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_se_renueva');
  END IF;

  -- Un aviso de un período anterior al último cobro anotado llegó tarde: se anota el cobro, pero
  -- no cambia el estado, que ya lo fijó un aviso más nuevo.
  SELECT EXISTS (
    SELECT 1 FROM public.cobros_intermediacion
     WHERE acceso_id = p_acceso_id AND periodo > p_periodo
  ) INTO v_hay_uno_posterior;

  IF p_estado = 'baja' THEN
    -- La baja no es un cobro, así que no deja fila en los cobros. Repetida es la que encuentra el
    -- acceso ya dado de baja con la misma fecha.
    IF v_acceso.estado = 'cancelada' AND v_acceso.vigente_hasta = p_vigente_hasta THEN
      RETURN jsonb_build_object('ok', true, 'repetido', true,
        'estado', v_acceso.estado, 'saldo_contactos', v_acceso.saldo_contactos);
    END IF;
  ELSE
    -- El cobro se anota con el número del aviso como referencia. El índice único de la
    -- referencia es lo que hace que el mismo aviso mandado dos veces se anote una sola.
    BEGIN
      INSERT INTO public.cobros_intermediacion
        (acceso_id, prestadora_id, medio, monto, moneda, periodo, estado_cobro,
         referencia_externa, fecha_cobro)
      VALUES
        (p_acceso_id, v_prestadora,
         COALESCE(NULLIF(btrim(p_medio), ''), 'otro'),
         round(p_monto, 2), p_moneda, p_periodo,
         CASE WHEN p_estado = 'pagado' THEN 'exitoso' ELSE 'fallido' END,
         btrim(p_numero_del_aviso),
         COALESCE(p_fecha_cobro, interno.hoy_de_la_prestadora(v_prestadora)));
    EXCEPTION WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', true, 'repetido', true,
        'estado', v_acceso.estado, 'saldo_contactos', v_acceso.saldo_contactos);
    END;

    -- El paquete pagado suma sus contactos en la misma operación que anota el cobro. Si algo
    -- falla después, no queda un cobro anotado sin sus contactos ni contactos sin su cobro.
    IF p_estado = 'pagado' AND COALESCE(v_contactos, 0) > 0 THEN
      PERFORM public.sumar_contactos_al_saldo(p_acceso_id, v_contactos);
    END IF;
  END IF;

  v_estado_nuevo := v_acceso.estado;

  IF NOT v_hay_uno_posterior THEN
    IF p_estado = 'pagado' THEN
      -- El pago levanta la gracia, la suspensión y la baja, sin que nadie intervenga.
      UPDATE public.accesos_intermediacion
         SET estado = 'vigente', suspension_desde = NULL, cancelada_en = NULL,
             vigente_hasta = NULL, updated_at = now()
       WHERE id = p_acceso_id;
      v_estado_nuevo := 'vigente';
      v_campos := ARRAY['estado', 'suspension_desde', 'cancelada_en', 'vigente_hasta'];
    ELSIF p_estado = 'gracia' THEN
      UPDATE public.accesos_intermediacion
         SET estado = 'en_gracia', suspension_desde = p_suspende_el, updated_at = now()
       WHERE id = p_acceso_id;
      v_estado_nuevo := 'en_gracia';
      v_campos := ARRAY['estado', 'suspension_desde'];
    ELSIF p_estado = 'suspendido' THEN
      UPDATE public.accesos_intermediacion
         SET estado = 'suspendida',
             suspension_desde = COALESCE(p_suspende_el, v_acceso.suspension_desde, interno.hoy_de_la_prestadora(v_prestadora)),
             updated_at = now()
       WHERE id = p_acceso_id;
      v_estado_nuevo := 'suspendida';
      v_campos := ARRAY['estado', 'suspension_desde'];
    ELSE
      UPDATE public.accesos_intermediacion
         SET estado = 'cancelada', cancelada_en = now(), vigente_hasta = p_vigente_hasta,
             updated_at = now()
       WHERE id = p_acceso_id;
      v_estado_nuevo := 'cancelada';
      v_campos := ARRAY['estado', 'cancelada_en', 'vigente_hasta'];
    END IF;
  END IF;

  IF p_estado = 'pagado' AND COALESCE(v_contactos, 0) > 0 THEN
    v_campos := array_append(COALESCE(v_campos, ARRAY[]::text[]), 'saldo_contactos'::text);
  END IF;

  -- La constancia: quién (el sistema), cuándo, sobre qué acceso y qué cambió. Sin importes.
  INSERT INTO public.registro_actividad
    (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, campos_cambiados, detalle)
  VALUES
    (v_prestadora, NULL, 'aviso_de_acceso_de_match', 'accesos_intermediacion', p_acceso_id,
     v_campos,
     jsonb_build_object('estado_anterior', v_acceso.estado, 'estado_nuevo', v_estado_nuevo));

  RETURN jsonb_build_object('ok', true, 'estado', v_estado_nuevo,
    'saldo_contactos', (SELECT saldo_contactos FROM public.accesos_intermediacion WHERE id = p_acceso_id));
END;
$function$;
CREATE OR REPLACE FUNCTION public.asignar_serie(p_serie_id uuid, p_asistente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
  v_serie      public.series_turnos_guardia;
  v_pendiente  public.asignaciones_de_turno_guardia;
  v_anterior   uuid;
  v_nueva      uuid;
  v_bloquean   text[];
BEGIN
  IF v_prestadora IS NULL THEN
    RAISE EXCEPTION 'serie_no_encontrada';
  END IF;

  SELECT * INTO v_pendiente
    FROM asignaciones_de_turno_guardia
   WHERE serie_id = p_serie_id
     AND prestadora_id = v_prestadora
     AND estado = 'sin_responder'
   FOR UPDATE;

  SELECT * INTO v_serie
    FROM series_turnos_guardia
   WHERE id = p_serie_id
     AND prestadora_id = v_prestadora
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'serie_no_encontrada';
  END IF;

  IF v_serie.estado <> 'activa' THEN
    RAISE EXCEPTION 'serie_no_se_asigna' USING ERRCODE = '23514';
  END IF;

  IF p_asistente_id IS NOT NULL AND v_pendiente.asistente_id = p_asistente_id THEN
    RETURN jsonb_build_object('sin_cambios', true);
  END IF;
  IF p_asistente_id IS NOT NULL AND v_pendiente.id IS NULL AND v_serie.asistente_id = p_asistente_id THEN
    RETURN jsonb_build_object('sin_cambios', true);
  END IF;
  IF p_asistente_id IS NULL AND v_pendiente.id IS NULL AND v_serie.asistente_id IS NULL THEN
    RETURN jsonb_build_object('sin_cambios', true);
  END IF;

  v_anterior := COALESCE(v_serie.asistente_id, v_pendiente.asistente_anterior_id);

  IF p_asistente_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM asistentes a WHERE a.id = p_asistente_id AND a.prestadora_id = v_prestadora) THEN
      RAISE EXCEPTION 'asistente_no_encontrado';
    END IF;

    IF EXISTS (SELECT 1 FROM usuarios u WHERE u.id = interno.usuario_de_la_sesion() AND u.rol = 'coordinador')
       AND NOT interno.coordinador_alcanza_asistente(p_asistente_id) THEN
      RAISE EXCEPTION 'asistente_no_encontrado';
    END IF;

    v_bloquean := interno.documentos_que_bloquean(
      p_asistente_id, GREATEST(v_serie.vigente_desde, interno.hoy_de_la_prestadora(v_prestadora)), v_serie.paciente_id, v_serie.servicio_id);
    IF cardinality(v_bloquean) > 0 THEN
      RAISE EXCEPTION 'documentos_bloquean:%:', array_to_string(v_bloquean, ', ') USING ERRCODE = '23514';
    END IF;

    IF v_serie.canal_modalidad IS NOT NULL
       AND NOT interno.asistente_trabaja_en_modalidad(p_asistente_id, v_serie.canal_modalidad) THEN
      RAISE EXCEPTION 'modalidad_bloquea:%:', v_serie.canal_modalidad USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_pendiente.id IS NOT NULL THEN
    UPDATE asignaciones_de_turno_guardia SET estado = 'retirada' WHERE id = v_pendiente.id;
  END IF;

  IF v_serie.asistente_id IS NOT NULL THEN
    UPDATE series_turnos_guardia SET asistente_id = NULL WHERE id = v_serie.id;
  END IF;

  IF p_asistente_id IS NOT NULL THEN
    INSERT INTO asignaciones_de_turno_guardia (prestadora_id, serie_id, asistente_id, asistente_anterior_id)
    VALUES (v_prestadora, v_serie.id, p_asistente_id, v_anterior)
    RETURNING id INTO v_nueva;
  END IF;

  RETURN jsonb_build_object(
    'sin_cambios', false,
    'asignacion_id', v_nueva,
    'titular_retirado', v_serie.asistente_id,
    'pendiente_retirado', v_pendiente.asistente_id,
    'asistente_anterior_id', v_anterior
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.asignar_turno_guardia(p_turno_guardia_id uuid, p_asistente_id uuid, p_motivo_excepcion text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
  v_turno_guardia    public.turnos_guardia;
  v_pendiente  public.asignaciones_de_turno_guardia;
  v_anterior   uuid;
  v_nueva      uuid;
BEGIN
  IF v_prestadora IS NULL THEN
    RAISE EXCEPTION 'turno_guardia_no_encontrado';
  END IF;

  -- Primero la asignación pendiente y después el turno: es el mismo orden en que los toma
  -- `aceptar_asignacion`, así las dos nunca se esperan una a la otra.
  SELECT * INTO v_pendiente
    FROM asignaciones_de_turno_guardia
   WHERE turno_guardia_id = p_turno_guardia_id
     AND prestadora_id = v_prestadora
     AND estado = 'sin_responder'
   FOR UPDATE;

  SELECT * INTO v_turno_guardia
    FROM turnos_guardia
   WHERE id = p_turno_guardia_id
     AND prestadora_id = v_prestadora
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'turno_guardia_no_encontrado';
  END IF;

  IF v_turno_guardia.estado <> 'programada' THEN
    RAISE EXCEPTION 'turno_guardia_no_se_asigna' USING ERRCODE = '23514';
  END IF;

  -- Lo que ya está como se pide no se toca: ni se retira ni se vuelve a avisar.
  IF p_asistente_id IS NOT NULL AND v_pendiente.asistente_id = p_asistente_id THEN
    RETURN jsonb_build_object('sin_cambios', true);
  END IF;
  IF p_asistente_id IS NULL AND v_pendiente.id IS NULL AND v_turno_guardia.asistente_id IS NULL THEN
    RETURN jsonb_build_object('sin_cambios', true);
  END IF;

  v_anterior := COALESCE(v_turno_guardia.asistente_id, v_pendiente.asistente_anterior_id);

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

    PERFORM interno.excepcion_por_documentos(
      v_prestadora,
      v_turno_guardia.id,
      p_asistente_id,
      interno.documentos_que_bloquean(
        p_asistente_id,
        interno.dia_en_que_termina_turno_guardia(v_turno_guardia.fecha, v_turno_guardia.hora_inicio, v_turno_guardia.hora_fin, v_turno_guardia.dias_hasta_el_fin),
        v_turno_guardia.paciente_id,
        v_turno_guardia.servicio_id
      ),
      p_motivo_excepcion
    );

    IF v_turno_guardia.canal_modalidad IS NOT NULL
       AND NOT interno.asistente_trabaja_en_modalidad(p_asistente_id, v_turno_guardia.canal_modalidad) THEN
      RAISE EXCEPTION 'modalidad_bloquea:%:', v_turno_guardia.canal_modalidad USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_pendiente.id IS NOT NULL THEN
    UPDATE asignaciones_de_turno_guardia SET estado = 'retirada' WHERE id = v_pendiente.id;
  END IF;

  IF v_turno_guardia.asistente_id IS NOT NULL THEN
    UPDATE turnos_guardia SET asistente_id = NULL WHERE id = v_turno_guardia.id;
  END IF;

  IF p_asistente_id IS NOT NULL THEN
    INSERT INTO asignaciones_de_turno_guardia (prestadora_id, turno_guardia_id, asistente_id, asistente_anterior_id)
    VALUES (v_prestadora, v_turno_guardia.id, p_asistente_id, v_anterior)
    RETURNING id INTO v_nueva;
  END IF;

  -- Alguien perdió el turno: la alarma se abre ya. Si había una abierta, sigue la misma.
  IF v_turno_guardia.asistente_id IS NOT NULL OR v_pendiente.id IS NOT NULL THEN
    INSERT INTO incidentes_turno_guardia_sin_cubrir (prestadora_id, turno_guardia_id)
    VALUES (v_prestadora, v_turno_guardia.id)
    ON CONFLICT (turno_guardia_id) WHERE resuelto_at IS NULL DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'sin_cambios', false,
    'asignacion_id', v_nueva,
    'titular_retirado', v_turno_guardia.asistente_id,
    'pendiente_retirado', v_pendiente.asistente_id,
    'asistente_anterior_id', v_anterior
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.asistente_asignado_a_cliente(p_asistente_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM turnos_guardia g
    JOIN pacientes p ON p.id = g.paciente_id
    WHERE g.asistente_id = p_asistente_id
      AND p.cliente_id = cliente_id_de_usuario(auth.uid())
  );
$function$;
CREATE OR REPLACE FUNCTION public.asistentes_asignados_al_paciente(p_paciente uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT DISTINCT g.asistente_id
    FROM turno_guardia_pacientes gp
    JOIN turnos_guardia g ON g.id = gp.turno_guardia_id AND g.prestadora_id = gp.prestadora_id
   WHERE gp.paciente_id = p_paciente
     AND gp.prestadora_id = interno.prestadora_actual()
     AND interno.es_personal_de_la_prestadora()
     AND g.asistente_id IS NOT NULL
     AND g.fecha >= interno.hoy_de_la_prestadora(gp.prestadora_id);
$function$;
CREATE FUNCTION public.asistentes_que_atendieron_a_pacientes(p_pacientes uuid[])
 RETURNS TABLE(asistente_id uuid, cantidad integer, ultima_fecha date)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT g.asistente_id, count(*)::integer, max(g.fecha)
    FROM public.turnos_guardia g
   WHERE g.asistente_id IS NOT NULL
     AND g.estado NOT IN ('cancelada', 'ausente')
     AND (g.paciente_id = ANY (p_pacientes)
          OR EXISTS (SELECT 1
                       FROM public.turno_guardia_pacientes gp
                      WHERE gp.turno_guardia_id = g.id
                        AND gp.prestadora_id = g.prestadora_id
                        AND gp.paciente_id = ANY (p_pacientes)))
     AND (g.fecha + g.hora_inicio) AT TIME ZONE interno.zona_horaria_de_la_prestadora(g.prestadora_id) <= now()
   GROUP BY g.asistente_id;
$function$;
GRANT ALL ON FUNCTION public.asistentes_que_atendieron_a_pacientes(uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.asistentes_que_atendieron_a_pacientes(uuid[]) TO service_role;
CREATE FUNCTION public.ausencias_que_tapan(p_desde date, p_hasta date, p_hoy date DEFAULT interno.hoy_de_la_sesion())
 RETURNS TABLE(asistente_id uuid, fecha_inicio date, fecha_fin date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  WITH efectivas AS (
    SELECT a.asistente_id, a.fecha_inicio,
           CASE WHEN a.fecha_vuelta_real IS NULL AND a.fecha_fin < p_hoy THEN NULL
                ELSE a.fecha_fin END AS fecha_fin
    FROM public.ausencias a
    JOIN public.asistentes s ON s.id = a.asistente_id
    WHERE
      -- El aislamiento, primero y adentro: la licencia y la persona, las dos de esta Prestadora.
      a.prestadora_id = prestadora_actual()
      AND s.prestadora_id = prestadora_actual()
      -- Quién tiene derecho a preguntar: los tres roles de Panel y nadie más.
      AND (
        es_superadmin()
        OR es_admin_prestadora()
        OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol = 'coordinador')
      )
  )
  SELECT e.asistente_id, e.fecha_inicio, e.fecha_fin
  FROM efectivas e
  WHERE e.fecha_inicio <= p_hasta
    AND (e.fecha_fin IS NULL OR e.fecha_fin >= p_desde);
$function$;
CREATE OR REPLACE FUNCTION public.borrar_consultas_a_hce_vencidas()
 RETURNS TABLE(anio integer, renglones bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prest    uuid := interno.prestadora_actual();
  v          record;
  v_hasta    record;
  v_cuantos  bigint;
  v_corte    uuid;
BEGIN
  IF v_prest IS NULL OR COALESCE(auth.jwt() ->> 'role', '') <> 'trabajo_sin_persona' THEN
    RAISE EXCEPTION 'sin_permiso_para_borrar_las_consultas_a_hce' USING ERRCODE = '42501';
  END IF;

  -- El mismo candado que la anotación: mientras se borra, nadie se cuelga de un renglón que se va.
  PERFORM pg_advisory_xact_lock(hashtextextended('consultas_a_hce:' || v_prest::text, 0));

  LOOP
    SELECT * INTO v FROM interno.consultas_a_hce_por_vencer(v_prest);
    EXIT WHEN v.anio IS NULL OR v.se_borra_el > interno.hoy_de_la_prestadora(v_prest);

    SELECT a.numero, a.resumen INTO v_hasta
      FROM consultas_a_hce a
     WHERE a.prestadora_id = v_prest AND a.momento < v.hasta
     ORDER BY a.numero DESC
     LIMIT 1;

    SELECT count(*) INTO v_cuantos
      FROM consultas_a_hce a
     WHERE a.prestadora_id = v_prest AND a.numero <= v_hasta.numero;

    INSERT INTO cortes_de_consultas_a_hce (prestadora_id, anio, hasta_numero, ultimo_resumen, renglones)
    VALUES (v_prest, v.anio, v_hasta.numero, v_hasta.resumen, v_cuantos)
    RETURNING id INTO v_corte;

    DELETE FROM consultas_a_hce a
     WHERE a.prestadora_id = v_prest AND a.numero <= v_hasta.numero;

    INSERT INTO registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, detalle)
    VALUES (v_prest, NULL, 'borrado_por_vencimiento', 'consultas_a_hce', v_corte,
            jsonb_build_object('anio', v.anio, 'renglones', v_cuantos, 'hasta_numero', v_hasta.numero));

    anio := v.anio;
    renglones := v_cuantos;
    RETURN NEXT;
  END LOOP;
END;
$function$;
CREATE OR REPLACE FUNCTION public.cancelar_cobertura_desde(p_alcance text, p_prestacion bigint, p_serie uuid, p_desde date, p_motivo uuid, p_detalle text)
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
  v_hoy := interno.hoy_de_la_prestadora(v_prest);

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
    v_hoy := interno.hoy_de_la_sesion();
    PERFORM interno.levantar_lo_de_la_internacion(p_hospitalizacion, greatest(v_hoy, v_fin + 1));
  END IF;

  PERFORM interno.anotar_turnos_sin_cubrir();
END;
$function$;
CREATE OR REPLACE FUNCTION public.consumir_contacto_intermediacion(p_acceso_id uuid, p_asistente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_acceso public.accesos_intermediacion%ROWTYPE;
  v_ya_estaba boolean;
  v_saldo integer;
BEGIN
  -- Tomada la fila del acceso, el que llegue segundo espera acá. Sin esto, dos pedidos leen el
  -- mismo saldo y los dos descuentan sobre ese número: de dos contactos se cobra uno.
  SELECT * INTO v_acceso
    FROM public.accesos_intermediacion
   WHERE id = p_acceso_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'acceso_inexistente');
  END IF;

  -- Falla cerrado: un acceso suspendido, vencido o dado de baja con el período pagado ya
  -- terminado no abre nada, aunque le haya quedado saldo.
  IF NOT interno.el_acceso_abre_contactos(v_acceso.prestadora_id, v_acceso.estado, v_acceso.suspension_desde, v_acceso.vigente_hasta) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'acceso_no_vigente');
  END IF;

  -- El Asistente tiene que ser de la misma Prestadora que el acceso. Uno de otra, o uno que no
  -- existe, contesta igual: no se distingue cuál de los dos fue.
  IF NOT EXISTS (
    SELECT 1 FROM public.asistentes
     WHERE id = p_asistente_id AND prestadora_id = v_acceso.prestadora_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_encontrado');
  END IF;

  -- Ya abierto antes: se contesta que sí y no se cobra de nuevo. El contacto de un Asistente se
  -- paga una sola vez por Cliente, y mirarlo otra vez no es un contacto nuevo.
  SELECT EXISTS (
    SELECT 1 FROM public.contactos_vistos_intermediacion
     WHERE cliente_id = v_acceso.cliente_id AND asistente_id = p_asistente_id
  ) INTO v_ya_estaba;

  IF v_ya_estaba THEN
    RETURN jsonb_build_object(
      'ok', true, 'ya_estaba', true, 'saldo_contactos', v_acceso.saldo_contactos
    );
  END IF;

  IF v_acceso.saldo_contactos IS NOT NULL AND v_acceso.saldo_contactos <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'saldo_agotado', 'saldo_contactos', 0);
  END IF;

  -- Se anota primero y se descuenta después, en ese orden y no al revés: así el candado de la
  -- tabla es el que decide, y no queda ninguna forma de descontar sin haber anotado. La misma
  -- Cliente con dos paquetes abriendo el mismo Asistente a la vez llega hasta acá por dos filas
  -- de acceso distintas, que el candado de más arriba no cruza; el segundo choca contra éste.
  BEGIN
    INSERT INTO public.contactos_vistos_intermediacion
      (prestadora_id, cliente_id, asistente_id, acceso_id)
    VALUES
      (v_acceso.prestadora_id, v_acceso.cliente_id, p_asistente_id, p_acceso_id);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'ok', true, 'ya_estaba', true, 'saldo_contactos', v_acceso.saldo_contactos
    );
  END;

  -- El que se sostiene por fecha no tiene qué descontar: queda anotado y el saldo sigue vacío.
  IF v_acceso.saldo_contactos IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'ya_estaba', false, 'saldo_contactos', NULL);
  END IF;

  UPDATE public.accesos_intermediacion
     SET saldo_contactos = saldo_contactos - 1,
         updated_at = now()
   WHERE id = p_acceso_id
  RETURNING saldo_contactos INTO v_saldo;

  RETURN jsonb_build_object('ok', true, 'ya_estaba', false, 'saldo_contactos', v_saldo);
END;
$function$;
CREATE FUNCTION public.coordinadores_sugeridos_para_el_servicio(p_servicio uuid)
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
    SELECT DISTINCT p.paciente_id
      FROM public.prestaciones p
      JOIN sesion k ON k.prestadora_id = p.prestadora_id
     WHERE p.servicio_id = p_servicio
       AND p.paciente_id IS NOT NULL
       AND p.estado = 'vigente'
       AND p.vigente_desde <= k.hoy
       AND (p.vigente_hasta IS NULL OR p.vigente_hasta >= k.hoy)
  ),
  lugares_del_servicio AS (
    SELECT DISTINCT l.id, l.parte_de
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
                WHERE ul.lugar_id = ls.id
                   OR ul.lugar_id = ls.parte_de
                   OR EXISTS (
                        SELECT 1
                          FROM public.zona_lugares zp
                          JOIN public.zona_lugares zc
                            ON zc.zona_id = zp.zona_id AND zc.prestadora_id = k.prestadora_id
                          JOIN public.zonas_cobertura z
                            ON z.id = zp.zona_id AND z.prestadora_id = k.prestadora_id AND z.activa
                         WHERE zp.lugar_id = ls.id
                           AND zp.prestadora_id = k.prestadora_id
                           AND zc.lugar_id = ul.lugar_id))
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
GRANT ALL ON FUNCTION public.coordinadores_sugeridos_para_el_servicio(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.coordinadores_sugeridos_para_el_servicio(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.dar_de_alta_la_prestadora(p_referencia text, p_razon_social text, p_identificacion_fiscal text, p_pais text, p_nombre_fantasia text, p_codigo text, p_casilla_envio text, p_email_respuestas text, p_regla_reenvio text, p_admin_nombre text, p_admin_email text, p_admin_telefono text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_pase         jsonb := COALESCE(auth.jwt(), '{}'::jsonb);
  v_pase_crudo   text  := current_setting('request.jwt.claims', true);
  v_id           uuid;
  v_admin        uuid;
  v_email        text  := lower(btrim(COALESCE(p_admin_email, '')));
  v_restriccion  text;
  v_mensaje      text;
BEGIN
  -- Sólo la cuenta automática sin Prestadora. Una cuenta de una Prestadora, aunque sea del
  -- trabajo sin persona, no da de alta otra.
  IF v_pase ->> 'role' IS DISTINCT FROM 'trabajo_sin_persona'
     OR COALESCE(v_pase ->> 'prestadora_id', '') <> ''
     OR v_pase ->> 'trabajo' IS NOT NULL THEN
    RAISE EXCEPTION 'sin_permiso';
  END IF;

  IF NULLIF(btrim(COALESCE(p_referencia, '')), '') IS NULL
     OR NULLIF(btrim(COALESCE(p_razon_social, '')), '') IS NULL
     OR NULLIF(btrim(COALESCE(p_pais, '')), '') IS NULL
     OR NULLIF(btrim(COALESCE(p_nombre_fantasia, '')), '') IS NULL
     OR NULLIF(btrim(COALESCE(p_codigo, '')), '') IS NULL
     OR NULLIF(btrim(COALESCE(p_admin_nombre, '')), '') IS NULL
     OR v_email = '' THEN
    RAISE EXCEPTION 'faltan_datos';
  END IF;

  -- El alta repetida devuelve la misma Prestadora.
  SELECT id INTO v_id FROM prestadoras WHERE referencia_celtatech = p_referencia;
  IF FOUND THEN
    RETURN jsonb_build_object('prestadora_id', v_id, 'creada', false);
  END IF;

  v_id := gen_random_uuid();

  BEGIN
    -- La sesión apunta a la Prestadora nueva, y a ninguna otra, mientras dura esta operación.
    -- Es lo que piden los disparadores que siembran su configuración.
    PERFORM set_config('request.jwt.claims',
                       (v_pase || jsonb_build_object('prestadora_id', v_id))::text, true);

    INSERT INTO prestadoras (id, razon_social, identificacion_fiscal, pais, nombre_fantasia,
                             casilla_envio, regla_reenvio, referencia_celtatech)
    VALUES (v_id, btrim(p_razon_social), NULLIF(btrim(COALESCE(p_identificacion_fiscal, '')), ''),
            upper(btrim(p_pais)), btrim(p_nombre_fantasia), NULLIF(btrim(COALESCE(p_casilla_envio, '')), ''),
            NULLIF(btrim(COALESCE(p_regla_reenvio, '')), ''), p_referencia);

    -- El código y el correo que recibe las respuestas viven en la configuración, que el
    -- disparador de la Prestadora ya sembró.
    UPDATE configuracion_prestadora
       SET dominio = p_codigo,
           email   = NULLIF(lower(btrim(COALESCE(p_email_respuestas, ''))), ''),
           updated_at = now()
     WHERE prestadora_id = v_id;

    -- La cuenta del Administrador. Entra con su correo. La contraseña nace al azar y nadie la
    -- conoce: la que va a usar se la da CeltaTech.
    v_admin := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_admin, 'authenticated', 'authenticated', v_email,
      extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf', 10)),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
      '', '', '', '', '', '', '', ''
    );

    INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (v_admin::text, v_admin,
            jsonb_build_object('sub', v_admin::text, 'email', v_email, 'email_verified', true),
            'email', NULL, now(), now());

    INSERT INTO usuarios (id, rol, nombre, telefono, email, prestadora_id, nombre_de_usuario)
    VALUES (v_admin, 'admin_prestadora', btrim(p_admin_nombre),
            NULLIF(btrim(COALESCE(p_admin_telefono, '')), ''), v_email, v_id, NULL);

    INSERT INTO registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, detalle)
    VALUES (v_id, NULL, 'alta_de_la_prestadora', 'prestadoras', v_id,
            jsonb_build_object('rol_nuevo', 'admin_prestadora'));

    PERFORM set_config('request.jwt.claims', COALESCE(v_pase_crudo, ''), true);

  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_restriccion = CONSTRAINT_NAME;
      PERFORM set_config('request.jwt.claims', COALESCE(v_pase_crudo, ''), true);

      -- Dos altas iguales a la vez: la otra ganó, y se devuelve la suya.
      IF v_restriccion = 'prestadoras_referencia_celtatech_unica' THEN
        SELECT id INTO v_id FROM prestadoras WHERE referencia_celtatech = p_referencia;
        RETURN jsonb_build_object('prestadora_id', v_id, 'creada', false);
      END IF;

      RAISE EXCEPTION '%', CASE
        WHEN v_restriccion IN ('configuracion_prestadora_dominio_key', 'configuracion_prestadora_dominio_unico') THEN 'codigo_en_uso'
        WHEN v_restriccion = 'prestadoras_casilla_envio_unica' THEN 'casilla_en_uso'
        WHEN v_restriccion = 'prestadoras_nombre_fantasia_unico' THEN 'nombre_en_uso'
        WHEN v_restriccion LIKE 'users_%' OR v_restriccion LIKE 'identities_%' THEN 'correo_de_administracion_en_uso'
        ELSE 'dato_en_uso'
      END;

    WHEN raise_exception THEN
      GET STACKED DIAGNOSTICS v_mensaje = MESSAGE_TEXT;
      PERFORM set_config('request.jwt.claims', COALESCE(v_pase_crudo, ''), true);

      RAISE EXCEPTION '%', CASE
        WHEN v_mensaje = 'la_direccion_de_la_prestadora_no_tiene_forma' THEN 'codigo_mal_escrito'
        WHEN v_mensaje LIKE 'No se sabe en qué moneda trabaja%' THEN 'pais_sin_moneda'
        ELSE 'alta_rechazada'
      END;
  END;

  RETURN jsonb_build_object('prestadora_id', v_id, 'creada', true);
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
     SET levantada_desde = greatest(desde, interno.hoy_de_la_prestadora(prestadora_id)),
         levantada_at = now(), levantada_por = interno.usuario_de_la_sesion()
   WHERE servicio_id = p_servicio AND tipo IN ('pausa', 'suspension') AND levantada_at IS NULL;

  PERFORM set_config('careonys.cambio_de_estado_del_servicio', p_servicio::text, true);
  UPDATE servicios
     SET estado = 'de_baja',
         vigente_hasta = greatest(vigente_desde,
                                  interno.hoy_de_la_prestadora(prestadora_id))
   WHERE id = p_servicio;
  PERFORM set_config('careonys.cambio_de_estado_del_servicio', '', true);

  PERFORM interno.anotar_deuda_de_la_baja(v_baja);

  PERFORM interno.anotar_turnos_sin_cubrir();

  RETURN v_baja;
END;
$function$;
CREATE OR REPLACE FUNCTION public.desactivar_la_cuenta(p_usuario uuid, p_motivo text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid;
  v_motivo text := btrim(coalesce(p_motivo, ''), E' \t\r\n');
BEGIN
  IF auth.jwt() ->> 'role' IS DISTINCT FROM 'trabajo_sin_persona' THEN RETURN false; END IF;
  v_prestadora := interno.prestadora_actual();
  IF v_prestadora IS NULL OR p_usuario IS NULL OR v_motivo = '' THEN RETURN false; END IF;

  -- Turnos sin terminar: se reasignan o se cierran antes, y la cuenta queda como estaba.
  IF EXISTS (SELECT 1 FROM interno.turnos_guardia_que_traban_la_desactivacion(p_usuario, v_prestadora)) THEN
    RAISE EXCEPTION 'desactivacion_con_turnos_guardia_por_delante';
  END IF;

  UPDATE usuarios
     SET desactivada_en = now(),
         motivo_de_la_desactivacion = v_motivo
   WHERE id = p_usuario
     AND prestadora_id = v_prestadora
     AND rol IN ('coordinador', 'asistente', 'cliente')
     AND desactivada_en IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;

  -- La cuenta de ingreso queda bloqueada: no entra con la clave, no renueva la sesión y no canjea
  -- ningún enlace. El bloqueo no lo levanta un cambio de clave.
  UPDATE auth.users
     SET banned_until = now() + interval '100 years',
         updated_at = now()
   WHERE id = p_usuario;

  -- Las sesiones abiertas se cierran ahora y no cuando venzan.
  DELETE FROM auth.refresh_tokens WHERE user_id = p_usuario::text;
  DELETE FROM auth.sessions WHERE user_id = p_usuario;

  -- Lo que tenía pendiente para entrar o cambiar la clave deja de servir.
  UPDATE tokens_activacion_cuenta SET usado_en = now()
   WHERE usuario_id = p_usuario AND usado_en IS NULL;
  UPDATE tokens_recuperacion_clave SET usado_en = now()
   WHERE usuario_id = p_usuario AND usado_en IS NULL;
  UPDATE cambios_de_clave_habilitados SET anulado_en = now()
   WHERE usuario_id = p_usuario AND usado_en IS NULL AND anulado_en IS NULL;
  UPDATE codigos_al_telefono SET anulado_en = now()
   WHERE usuario_id = p_usuario AND verificado_en IS NULL AND anulado_en IS NULL;
  UPDATE equipos_conocidos SET revocado_en = now()
   WHERE usuario_id = p_usuario AND revocado_en IS NULL;

  -- La responsabilidad del reclutamiento queda libre, como quedaba al borrar la cuenta.
  UPDATE configuracion_reclutamiento SET responsable_id = NULL
   WHERE responsable_id = p_usuario AND prestadora_id = v_prestadora;

  RETURN true;
END;
$function$;
CREATE FUNCTION public.domicilio_del_paciente_en(p_paciente_id uuid, p_fecha date)
 RETURNS TABLE(paciente_id uuid, domicilio_temporal_id uuid, calle text, numero text, piso text, unidad text, lugar text, lat double precision, lng double precision, es_temporal boolean, motivo text, desde date, hasta date, lugar_id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select * from public.domicilios_de_pacientes_en(array[p_paciente_id], p_fecha);
$function$;
CREATE FUNCTION public.domicilios_de_pacientes_en(p_pacientes uuid[], p_fecha date)
 RETURNS TABLE(paciente_id uuid, domicilio_temporal_id uuid, calle text, numero text, piso text, unidad text, lugar text, lat double precision, lng double precision, es_temporal boolean, motivo text, desde date, hasta date, lugar_id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select
    p.id as paciente_id,
    d.id as domicilio_temporal_id,
    case when d.id is null then f.calle else d.calle end as calle,
    case when d.id is null then f.numero else d.numero end as numero,
    case when d.id is null then f.piso else d.piso end as piso,
    case when d.id is null then f.unidad else d.unidad end as unidad,
    l.nombre as lugar,
    case when d.id is null then f.lat else d.lat end as lat,
    case when d.id is null then f.lng else d.lng end as lng,
    d.id is not null as es_temporal,
    d.motivo,
    d.fecha_inicio as desde,
    d.fecha_fin as hasta,
    case when d.id is null then f.lugar_id else d.lugar_id end as lugar_id
  from public.pacientes p
  join public.personas f on f.id = p.persona_id and f.prestadora_id = p.prestadora_id
  left join lateral (
    select t.id, t.calle, t.numero, t.piso, t.unidad, t.lugar_id, t.lat, t.lng, t.motivo,
           t.fecha_inicio, t.fecha_fin
      from public.domicilios_temporales_paciente t
     where t.paciente_id = p.id
       and t.fecha_inicio <= p_fecha
       and (t.fecha_fin is null or t.fecha_fin >= p_fecha)
     -- La restricción de la tabla garantiza que haya una sola; el orden y el tope son la red por
     -- si alguna vez se afloja.
     order by t.fecha_inicio desc
     limit 1
  ) d on true
  left join public.lugares l
    on l.id = case when d.id is null then f.lugar_id else d.lugar_id end
   and l.prestadora_id = p.prestadora_id
  where p.id = any (p_pacientes);
$function$;
CREATE OR REPLACE FUNCTION public.editar_turno_guardia_recurrente(p_serie uuid, p_desde date, p_dias_semana text[], p_hora_inicio text, p_hora_fin text, p_dias_hasta_el_fin integer)
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
  v_hoy := interno.hoy_de_la_prestadora(v_prest);
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
CREATE FUNCTION public.estado_de_factura(p_prestadora uuid, p_monto_total numeric, p_cobrado numeric, p_fecha_vencimiento date)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    -- Nada por cobrar, nada que reclamar. Vale también para una factura de cero.
    WHEN COALESCE(p_cobrado, 0) >= COALESCE(p_monto_total, 0) THEN 'pagada'
    WHEN p_fecha_vencimiento IS NOT NULL AND p_fecha_vencimiento < interno.hoy_de_la_prestadora(p_prestadora) THEN 'vencida'
    ELSE 'pendiente'
  END;
$function$;
COMMENT ON FUNCTION public.estado_de_factura(uuid,numeric,numeric,date) IS 'Único lugar donde se decide si una factura está pagada, vencida o pendiente. Cobro parcial: sigue pendiente (o vencida), y el cuánto falta lo dice el saldo.';
GRANT ALL ON FUNCTION public.estado_de_factura(uuid, numeric, numeric, date) TO authenticated;
GRANT ALL ON FUNCTION public.estado_de_factura(uuid, numeric, numeric, date) TO service_role;
GRANT ALL ON FUNCTION public.estado_de_factura(uuid, numeric, numeric, date) TO trabajo_sin_persona;
CREATE OR REPLACE FUNCTION public.exigir_paciente_del_turno_guardia()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM turno_guardia_pacientes gp
    WHERE gp.turno_guardia_id = NEW.turno_guardia_id AND gp.paciente_id = NEW.paciente_id
  ) THEN
    RAISE EXCEPTION 'El reporte habla de un Paciente que este turno de guardia no atiende';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fijar_descuento_del_servicio(p_servicio uuid, p_porcentaje numeric)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_prest uuid := interno.prestadora_actual();
BEGIN
  IF v_prest IS NULL THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_servicio IS NULL OR p_porcentaje IS NULL OR p_porcentaje < 0 OR p_porcentaje > 100 THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;

  -- El mismo porcentaje que ya rige, abierto y sin fin: no hay nada que cambiar.
  IF p_porcentaje > 0 AND EXISTS (
    SELECT 1 FROM public.descuentos_del_servicio d
     WHERE d.servicio_id = p_servicio AND d.prestadora_id = v_prest AND d.terminado_en IS NULL
       AND d.clase = 'porcentaje' AND d.valor = p_porcentaje
       AND d.cantidad_de_periodos IS NULL AND d.vigente_hasta IS NULL
  ) AND (
    SELECT count(*) FROM public.descuentos_del_servicio d
     WHERE d.servicio_id = p_servicio AND d.prestadora_id = v_prest AND d.terminado_en IS NULL
  ) = 1 THEN
    RETURN;
  END IF;

  UPDATE public.descuentos_del_servicio
     SET terminado_en = now()
   WHERE servicio_id = p_servicio AND prestadora_id = v_prest AND terminado_en IS NULL;

  IF p_porcentaje > 0 THEN
    INSERT INTO public.descuentos_del_servicio (prestadora_id, servicio_id, clase, valor, vigente_desde)
    VALUES (v_prest, p_servicio, 'porcentaje', p_porcentaje, interno.hoy_de_la_prestadora(v_prest));
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_estado_factura_segun_cobros()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cobrado numeric;
BEGIN
  SELECT cobrado INTO v_cobrado FROM public.resumen_cobros_de_factura(NEW.id);
  NEW.estado := public.estado_de_factura(NEW.prestadora_id,
    public.monto_a_cobrar_de_factura(NEW.monto_total, NEW.monto_facturado, NEW.id),
    v_cobrado,
    NEW.fecha_vencimiento
  );
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_modalidad_del_turno_guardia()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF NEW.asistente_id IS NULL OR NEW.canal_modalidad IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.asistente_id IS NOT DISTINCT FROM OLD.asistente_id
     AND NEW.canal_modalidad IS NOT DISTINCT FROM OLD.canal_modalidad THEN
    RETURN NEW;
  END IF;

  IF NOT interno.asistente_trabaja_en_modalidad(NEW.asistente_id, NEW.canal_modalidad) THEN
    RAISE EXCEPTION 'modalidad_bloquea:%:', NEW.canal_modalidad
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_servicio_de_la_serie()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.servicio_id IS NULL AND NEW.serie_id IS NOT NULL THEN
    SELECT s.servicio_id INTO NEW.servicio_id
      FROM series_turnos_guardia s WHERE s.id = NEW.serie_id;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.informar_accesos_fuera_de_lo_normal_del_dia_anterior()
 RETURNS TABLE(dia date, cantidad integer, anotado boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid;
  v_dia date;
  v_cantidad integer;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'trabajo_sin_persona' THEN
    RAISE EXCEPTION 'El informe diario lo hace el trabajo sin persona' USING ERRCODE = '42501';
  END IF;
  v_prestadora := interno.prestadora_actual();
  IF v_prestadora IS NULL THEN
    RAISE EXCEPTION 'Sin Prestadora para el informe diario' USING ERRCODE = '42501';
  END IF;

  v_dia := interno.hoy_de_la_prestadora(v_prestadora) - 1;

  PERFORM pg_advisory_xact_lock(hashtext('informe_diario_de_accesos_fuera_de_lo_normal'), hashtext(v_prestadora::text));

  SELECT count(*)::integer INTO v_cantidad
    FROM interno.accesos_fuera_de_lo_normal_de(v_prestadora, v_dia, v_dia);

  IF EXISTS (
    SELECT 1 FROM registro_actividad r
     WHERE r.prestadora_id = v_prestadora
       AND r.accion = 'informe_diario_de_accesos_fuera_de_lo_normal'
       AND r.detalle ->> 'desde' = v_dia::text
  ) THEN
    RETURN QUERY SELECT v_dia, v_cantidad, false;
    RETURN;
  END IF;

  INSERT INTO registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, detalle)
  VALUES (v_prestadora, NULL, 'informe_diario_de_accesos_fuera_de_lo_normal', 'consultas_a_hce',
          jsonb_build_object('desde', v_dia::text, 'hasta', v_dia::text, 'cantidad', v_cantidad));

  RETURN QUERY SELECT v_dia, v_cantidad, true;
END;
$function$;
CREATE OR REPLACE FUNCTION public.interrumpir_cobertura(p_tipo text, p_alcance text, p_servicio uuid, p_prestacion bigint, p_serie uuid, p_turno_guardia uuid, p_desde date, p_vuelta date, p_motivo uuid, p_detalle text)
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
  v_hoy := interno.hoy_de_la_prestadora(v_prest);

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
CREATE OR REPLACE FUNCTION public.marcar_prestaciones_a_revisar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.precio IS DISTINCT FROM OLD.precio THEN
    UPDATE prestaciones
    SET requiere_revision = true
    WHERE precio_lista_id = NEW.id
      AND estado = 'vigente'
      AND (vigente_hasta IS NULL OR vigente_hasta >= interno.hoy_de_la_prestadora(NEW.prestadora_id));
  END IF;
  RETURN NEW;
END;
$function$;
CREATE FUNCTION public.mover_turno_guardia_a_otro_paciente(p_turno_guardia_id uuid, p_paciente_id uuid, p_fecha date, p_hora_inicio time without time zone, p_hora_fin time without time zone, p_dias_hasta_el_fin integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
  v_turno_guardia    public.turnos_guardia;
  v_asistente  uuid;
  v_nueva      uuid;
  v_quitar     jsonb;
  v_asignar    jsonb;
BEGIN
  IF v_prestadora IS NULL THEN
    RAISE EXCEPTION 'turno_guardia_no_encontrado';
  END IF;

  SELECT * INTO v_turno_guardia
    FROM turnos_guardia
   WHERE id = p_turno_guardia_id
     AND prestadora_id = v_prestadora;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'turno_guardia_no_encontrado';
  END IF;

  IF v_turno_guardia.estado <> 'programada' THEN
    RAISE EXCEPTION 'turno_guardia_no_se_asigna' USING ERRCODE = '23514';
  END IF;

  -- El que esperaba respuesta manda sobre el que figura: es a quien se le asignó por última vez.
  SELECT asistente_id INTO v_asistente
    FROM asignaciones_de_turno_guardia
   WHERE turno_guardia_id = p_turno_guardia_id
     AND prestadora_id = v_prestadora
     AND estado = 'sin_responder';
  v_asistente := COALESCE(v_asistente, v_turno_guardia.asistente_id);

  IF v_asistente IS NULL THEN
    RAISE EXCEPTION 'turno_guardia_sin_asistente' USING ERRCODE = '23514';
  END IF;

  -- El Paciente de destino tiene que ser de la misma Prestadora. Un identificador de otra no se
  -- distingue de uno que no existe.
  IF NOT EXISTS (SELECT 1 FROM pacientes p WHERE p.id = p_paciente_id AND p.prestadora_id = v_prestadora) THEN
    RAISE EXCEPTION 'paciente_no_encontrado';
  END IF;

  INSERT INTO turnos_guardia (
    prestadora_id, paciente_id, servicio_id, coordinador_id, fecha, hora_inicio, hora_fin,
    dias_hasta_el_fin, modalidad, canal_modalidad
  )
  VALUES (
    v_prestadora, p_paciente_id, v_turno_guardia.servicio_id, v_turno_guardia.coordinador_id,
    COALESCE(p_fecha, v_turno_guardia.fecha),
    COALESCE(p_hora_inicio, v_turno_guardia.hora_inicio),
    COALESCE(p_hora_fin, v_turno_guardia.hora_fin),
    COALESCE(p_dias_hasta_el_fin, v_turno_guardia.dias_hasta_el_fin),
    v_turno_guardia.modalidad, v_turno_guardia.canal_modalidad
  )
  RETURNING id INTO v_nueva;

  -- Primero se lo saca del original —que abre la alarma— y después se le ofrece el nuevo.
  v_quitar  := public.asignar_turno_guardia(p_turno_guardia_id, NULL);
  v_asignar := public.asignar_turno_guardia(v_nueva, v_asistente);

  RETURN jsonb_build_object(
    'turno_guardia_nuevo_id', v_nueva,
    'asistente_id', v_asistente,
    'titular_retirado', v_quitar->'titular_retirado',
    'pendiente_retirado', v_quitar->'pendiente_retirado'
  );
END;
$function$;
GRANT ALL ON FUNCTION public.mover_turno_guardia_a_otro_paciente(uuid, uuid, date, time without time zone, time without time zone, integer) TO authenticated;
GRANT ALL ON FUNCTION public.mover_turno_guardia_a_otro_paciente(uuid, uuid, date, time without time zone, time without time zone, integer) TO service_role;
CREATE FUNCTION public.precios_de_lista_que_rigen(p_fecha date DEFAULT interno.hoy_de_la_sesion())
 RETURNS SETOF public.lista_precios
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT DISTINCT ON (l.tipo_servicio, l.modalidad, l.moneda) l.*
    FROM public.lista_precios l
   WHERE l.prestadora_id = interno.prestadora_actual()
     AND l.activo
     AND l.vigente_desde <= p_fecha
     AND (l.vigente_hasta IS NULL OR l.vigente_hasta >= p_fecha)
   ORDER BY l.tipo_servicio, l.modalidad, l.moneda,
            (l.promocion_de IS NOT NULL) DESC,
            l.vigente_desde DESC,
            l.id DESC
$function$;
CREATE FUNCTION public.prestaciones_con_promocion_vencida(p_fecha date DEFAULT interno.hoy_de_la_sesion())
 RETURNS TABLE(prestacion_id bigint, promocion_id bigint, promocion_hasta date, precio_de_siempre_id bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT p.id, l.id, l.vigente_hasta, l.promocion_de
    FROM public.prestaciones p
    JOIN public.lista_precios l ON l.id = p.precio_lista_id
   WHERE p.prestadora_id = interno.prestadora_actual()
     AND l.promocion_de IS NOT NULL
     AND l.vigente_hasta < p_fecha
     AND p.estado = 'vigente'
     AND (p.vigente_hasta IS NULL OR p.vigente_hasta > l.vigente_hasta)
$function$;
CREATE OR REPLACE FUNCTION public.reanudar_cobertura(p_interrupcion uuid, p_desde date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prest          uuid := interno.prestadora_actual();
  v_servicio       uuid;
  v_hospitalizacion uuid;
  v_hoy            date;
BEGIN
  SELECT i.servicio_id, i.hospitalizacion_id INTO v_servicio, v_hospitalizacion
    FROM interrupciones_de_cobertura i
   WHERE i.id = p_interrupcion AND i.prestadora_id = v_prest
     AND i.tipo IN ('pausa', 'suspension') AND i.levantada_at IS NULL;
  IF v_servicio IS NULL OR NOT interno.puede_gestionar_la_cobertura(v_servicio) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  -- La suspensión de una internación vuelve sólo al cerrar la internación.
  IF v_hospitalizacion IS NOT NULL THEN
    RAISE EXCEPTION 'la_suspension_es_de_una_internacion' USING ERRCODE = 'P0001';
  END IF;
  v_hoy := interno.hoy_de_la_prestadora(v_prest);
  IF p_desde IS NOT NULL AND p_desde < v_hoy THEN
    RAISE EXCEPTION 'la_fecha_ya_paso' USING ERRCODE = 'P0001';
  END IF;

  PERFORM interno.levantar_interrupcion(p_interrupcion, COALESCE(p_desde, v_hoy));
  PERFORM interno.anotar_turnos_sin_cubrir();
END;
$function$;
CREATE OR REPLACE FUNCTION public.reasignar_turno_guardia_por_emergencia(p_turno_guardia_id uuid, p_asistente_id uuid, p_motivo text, p_motivo_excepcion text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid;
  v_usuario    uuid;
  v_motivo     text := btrim(COALESCE(p_motivo, ''));
  v_turno_guardia    record;
  v_tocadas    integer;
BEGIN
  -- La Prestadora y la persona salen de la sesión, nunca del pedido. Sin persona no hay a quién
  -- atribuirle el cambio, y no se hace.
  v_prestadora := interno.prestadora_actual();
  v_usuario := interno.usuario_de_la_sesion();
  IF v_prestadora IS NULL OR v_usuario IS NULL THEN
    RAISE EXCEPTION 'reasignacion_sin_sesion' USING ERRCODE = '42501';
  END IF;

  IF p_turno_guardia_id IS NULL OR p_asistente_id IS NULL OR v_motivo = '' THEN
    RAISE EXCEPTION 'reasignacion_incompleta' USING ERRCODE = '23514';
  END IF;

  -- La lectura pasa por la RLS de quien pide.
  SELECT g.id, g.asistente_id, g.estado, g.checkin_at, g.fecha, g.hora_inicio, g.hora_fin,
         g.dias_hasta_el_fin, g.paciente_id, g.servicio_id
    INTO v_turno_guardia
    FROM public.turnos_guardia g
   WHERE g.id = p_turno_guardia_id
     AND g.prestadora_id = v_prestadora
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reasignacion_sin_turno_guardia' USING ERRCODE = '42501';
  END IF;

  IF v_turno_guardia.estado <> 'ausente' OR v_turno_guardia.checkin_at IS NOT NULL
     OR v_turno_guardia.asistente_id IS NOT DISTINCT FROM p_asistente_id THEN
    RAISE EXCEPTION 'turno_guardia_empezado_no_cambia_de_asistente' USING ERRCODE = '23514';
  END IF;

  IF interno.asistente_ocupado_entre(
       p_asistente_id,
       p_turno_guardia_id,
       v_turno_guardia.fecha + v_turno_guardia.hora_inicio,
       interno.dia_en_que_termina_turno_guardia(v_turno_guardia.fecha, v_turno_guardia.hora_inicio, v_turno_guardia.hora_fin, v_turno_guardia.dias_hasta_el_fin) + v_turno_guardia.hora_fin
     ) THEN
    RAISE EXCEPTION 'asistente_en_otro_turno_guardia' USING ERRCODE = '23514';
  END IF;

  PERFORM interno.excepcion_por_documentos(
    v_prestadora,
    p_turno_guardia_id,
    p_asistente_id,
    interno.documentos_que_bloquean(
      p_asistente_id,
      interno.dia_en_que_termina_turno_guardia(v_turno_guardia.fecha, v_turno_guardia.hora_inicio, v_turno_guardia.hora_fin, v_turno_guardia.dias_hasta_el_fin),
      v_turno_guardia.paciente_id,
      v_turno_guardia.servicio_id
    ),
    p_motivo_excepcion
  );

  PERFORM set_config('careonys.reasignacion_por_emergencia', p_turno_guardia_id::text, true);

  INSERT INTO public.auditoria_reasignaciones_por_emergencia
    (prestadora_id, turno_guardia_id, usuario_id, asistente_anterior_id, asistente_nuevo_id, motivo)
  VALUES
    (v_prestadora, p_turno_guardia_id, v_usuario, v_turno_guardia.asistente_id, p_asistente_id, v_motivo);

  -- Quien la cubre entra ahora: el turno vuelve a esperar su check-in.
  UPDATE public.turnos_guardia
     SET asistente_id = p_asistente_id,
         estado = 'programada'
   WHERE id = p_turno_guardia_id
     AND prestadora_id = v_prestadora;
  GET DIAGNOSTICS v_tocadas = ROW_COUNT;

  PERFORM set_config('careonys.reasignacion_por_emergencia', '', true);

  IF v_tocadas = 0 THEN
    RAISE EXCEPTION 'reasignacion_sin_turno_guardia' USING ERRCODE = '42501';
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public.revisar_propuesta_de_ajuste(p_propuesta uuid, p_precio numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_prest   uuid := interno.prestadora_actual();
  v_quien   uuid := interno.usuario_de_la_sesion();
  pr        public.propuestas_de_ajuste_por_indice;
  p         public.prestaciones;
  v_precio  numeric := round(p_precio, 2);
  v_nueva   bigint;
BEGIN
  IF v_prest IS NULL OR v_quien IS NULL
     OR NOT interno.es_la_administracion_de_la_prestadora(v_prest) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF v_precio IS NULL OR v_precio <= 0 THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO pr FROM public.propuestas_de_ajuste_por_indice
   WHERE id = p_propuesta AND prestadora_id = v_prest
   FOR UPDATE;
  IF NOT FOUND OR pr.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  -- El mismo precio actual: no cambia nada.
  IF v_precio = pr.precio_actual THEN
    UPDATE public.propuestas_de_ajuste_por_indice
       SET estado = 'rechazada', revisada_por = v_quien, revisada_en = now()
     WHERE id = pr.id;

    INSERT INTO public.registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, detalle)
    VALUES (v_prest, v_quien, 'ajuste_por_indice_rechazado', 'propuestas_de_ajuste_por_indice', pr.id,
            jsonb_build_object('prestacion_id', pr.prestacion_id, 'servicio_id', pr.servicio_id,
                               'indice', pr.indice, 'precio_actual', pr.precio_actual,
                               'precio_propuesto', pr.precio_propuesto, 'moneda', pr.moneda,
                               'rige_desde', pr.rige_desde));
    RETURN;
  END IF;

  SELECT * INTO p FROM public.prestaciones
   WHERE id = pr.prestacion_id AND prestadora_id = v_prest
   FOR UPDATE;
  IF NOT FOUND OR p.estado <> 'vigente' OR p.vigente_hasta IS NOT NULL
     OR p.precio_final <> pr.precio_actual THEN
    RAISE EXCEPTION 'ya_reemplazado' USING ERRCODE = 'P0001';
  END IF;

  -- Rige desde el mes que correspondía, aunque ya haya pasado.
  v_nueva := interno.copiar_renglon('public.prestaciones', p.id, jsonb_build_object(
    'precio_final', v_precio,
    'precio_lista_snapshot', CASE WHEN p.precio_lista_snapshot IS NULL THEN NULL
                                  ELSE round(p.precio_lista_snapshot * v_precio / pr.precio_actual, 2) END,
    'precio_turno_guardia_adicional', CASE WHEN p.precio_turno_guardia_adicional IS NULL THEN NULL
                                     ELSE round(p.precio_turno_guardia_adicional * v_precio / pr.precio_actual, 2) END,
    'precio_hora_adicional', CASE WHEN p.precio_hora_adicional IS NULL THEN NULL
                                  ELSE round(p.precio_hora_adicional * v_precio / pr.precio_actual, 2) END,
    'vigente_desde', pr.rige_desde,
    'vigente_hasta', NULL,
    'requiere_revision', false,
    'prestacion_anterior_id', p.id
  ));

  UPDATE public.propuestas_de_ajuste_por_indice
     SET estado = 'aceptada', revisada_por = v_quien, revisada_en = now(), prestacion_nueva_id = v_nueva
   WHERE id = pr.id;

  INSERT INTO public.registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, detalle)
  VALUES (v_prest, v_quien, 'ajuste_por_indice_aceptado', 'propuestas_de_ajuste_por_indice', pr.id,
          jsonb_build_object('prestacion_id', p.id, 'prestacion_nueva_id', v_nueva,
                             'servicio_id', pr.servicio_id, 'indice', pr.indice,
                             'precio_anterior', pr.precio_actual, 'precio_propuesto', pr.precio_propuesto,
                             'precio_nuevo', v_precio, 'moneda', pr.moneda, 'rige_desde', pr.rige_desde));
END;
$function$;
CREATE OR REPLACE FUNCTION public.sembrar_configuracion_prestadora(p_prestadora_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tabla TEXT;
BEGIN
  IF NOT interno.le_corresponde(p_prestadora_id) THEN
    RAISE EXCEPTION 'sembrar_configuracion_prestadora: esa Prestadora no es la de quien llama';
  END IF;

  -- La fila de los datos de contacto, que ya no lleva el nombre: el de la Prestadora vive en
  -- `prestadoras.nombre_fantasia`, y uno solo.
  INSERT INTO configuracion_prestadora (prestadora_id)
  VALUES (p_prestadora_id)
  ON CONFLICT (prestadora_id) DO NOTHING;

  FOR v_tabla IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_constraint pk ON pk.conrelid = c.oid AND pk.contype = 'p'
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = pk.conkey[1]
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname LIKE 'configuracion\_%'
      AND c.relname <> 'configuracion_prestadora'
      AND array_length(pk.conkey, 1) = 1
      AND a.attname = 'prestadora_id'
    ORDER BY c.relname
  LOOP
    BEGIN
      EXECUTE format(
        'INSERT INTO public.%I (prestadora_id) VALUES ($1) ON CONFLICT DO NOTHING',
        v_tabla
      ) USING p_prestadora_id;
    EXCEPTION WHEN not_null_violation THEN
      RAISE EXCEPTION
        'No se puede sembrar la configuración de la Prestadora: la tabla % tiene una columna obligatoria sin valor de arranque. Póngale un DEFAULT a esa columna, o sáquele la forma de una fila por Prestadora.',
        v_tabla;
    END;
  END LOOP;

  -- Los motivos de cierre con los que arranca. De acá en adelante la lista es de ella: los
  -- puede sacar, apagar, y agregar los suyos.
  INSERT INTO motivos_cierre_servicio (prestadora_id, clave, pide_detalle, orden)
  VALUES
    (p_prestadora_id, 'fin_demanda',           false, 10),
    (p_prestadora_id, 'fallecimiento',         false, 20),
    (p_prestadora_id, 'internacion',           false, 30),
    (p_prestadora_id, 'baja_del_cliente',    false, 40),
    (p_prestadora_id, 'corte_de_pago',         false, 50),
    (p_prestadora_id, 'mudanza_fuera_de_zona', false, 60),
    (p_prestadora_id, 'otro',                  true,  99)
  ON CONFLICT DO NOTHING;

  -- Y las causas de sustitución, con el mismo criterio.
  INSERT INTO motivos_sustitucion_turno_guardia (prestadora_id, clave, pide_detalle, orden)
  VALUES
    (p_prestadora_id, 'emergencia', false, 10),
    (p_prestadora_id, 'otro',       true,  99)
  ON CONFLICT DO NOTHING;

  -- Y cómo puede terminar un turno que quedó sin nadie. Los dos primeros los escribe el motor
  -- cuando la base ya lo dice; los demás los elige quien coordina.
  INSERT INTO finales_turno_guardia_sin_cubrir
    (prestadora_id, clave, es_defecto_grave, pide_detalle, lo_escribe_el_sistema, orden)
  VALUES
    (p_prestadora_id, 'llego_un_relevo',               false, false, true,  10),
    (p_prestadora_id, 'ya_no_hacia_falta',             false, false, true,  20),
    (p_prestadora_id, 'lo_cubrio_la_coordinadora',     false, false, false, 30),
    (p_prestadora_id, 'se_extendio_el_turno_guardia',          false, false, false, 40),
    (p_prestadora_id, 'quedo_solo_con_consentimiento', true,  false, false, 50),
    (p_prestadora_id, 'no_fue_nadie',                  true,  false, false, 60),
    (p_prestadora_id, 'se_resolvio_de_otra_manera',    false, true,  false, 99)
  ON CONFLICT DO NOTHING;

  -- Y los motivos con los que se resuelve una postulación o una Guardia. La lista la arma
  -- `sembrar_motivos_resolucion`, que sigue siendo el punto único: acá se la llama, no se la copia.
  PERFORM sembrar_motivos_resolucion(p_prestadora_id);
END;
$function$;
CREATE OR REPLACE FUNCTION public.sincronizar_paciente_principal_de_serie()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.paciente_id IS DISTINCT FROM NEW.paciente_id THEN
    DELETE FROM series_turnos_guardia_pacientes
    WHERE serie_id = NEW.id AND paciente_id = OLD.paciente_id;
  END IF;

  IF NEW.paciente_id IS NOT NULL THEN
    INSERT INTO series_turnos_guardia_pacientes (serie_id, paciente_id, prestadora_id)
    VALUES (NEW.id, NEW.paciente_id, NEW.prestadora_id)
    ON CONFLICT (serie_id, paciente_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.sincronizar_paciente_principal_de_turno_guardia()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.paciente_id IS DISTINCT FROM NEW.paciente_id THEN
    DELETE FROM turno_guardia_pacientes
    WHERE turno_guardia_id = NEW.id AND paciente_id = OLD.paciente_id;
  END IF;

  IF NEW.paciente_id IS NOT NULL THEN
    INSERT INTO turno_guardia_pacientes (turno_guardia_id, paciente_id, prestadora_id)
    VALUES (NEW.id, NEW.paciente_id, NEW.prestadora_id)
    ON CONFLICT (turno_guardia_id, paciente_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.turnos_guardia_asignados_sin_responder()
 RETURNS TABLE(asignacion_id uuid, asignado_at timestamp with time zone, tipo text, turno_guardia_id uuid, serie_id uuid, ausencia_id uuid, fecha date, hora_inicio time without time zone, hora_fin time without time zone, dias_hasta_el_fin smallint, modalidad text, dias_semana text[], desde date, hasta date, cantidad integer, barrios text[], niveles_de_complejidad text[], distancia_m integer, tareas jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  WITH yo AS (
    SELECT a.id, d.lat, d.lng, a.tipo_asistente_id
      FROM asistentes a
      LEFT JOIN domicilio_asistente d ON d.asistente_id = a.id AND d.prestadora_id = a.prestadora_id
     WHERE a.id = interno.asistente_de_la_sesion()
       AND a.prestadora_id = interno.prestadora_actual()
  ),
  mias AS (
    SELECT a.*
      FROM asignaciones_de_turno_guardia a
     WHERE a.prestadora_id = interno.prestadora_actual()
       AND a.asistente_id = interno.asistente_de_la_sesion()
       AND a.estado = 'sin_responder'
  ),
  -- Un turno suelto.
  turnos_guardia_sueltos AS (
    SELECT a.id, a.asignado_at, 'turno_guardia'::text AS tipo, g.id AS turno_guardia_id, NULL::uuid AS serie_id,
           NULL::uuid AS ausencia_id, g.fecha, g.hora_inicio, g.hora_fin, g.dias_hasta_el_fin,
           g.modalidad, NULL::text[] AS dias_semana, g.fecha AS desde, g.fecha AS hasta,
           1 AS cantidad, quienes.ids, g.fecha AS dia_del_domicilio, g.prestadora_id,
           ARRAY[g.servicio_id] AS servicios
      FROM mias a
      JOIN turnos_guardia g
        ON g.id = a.turno_guardia_id
       AND g.prestadora_id = a.prestadora_id
     CROSS JOIN LATERAL (
       SELECT CASE WHEN count(gp.paciente_id) > 0
                   THEN array_agg(gp.paciente_id)
                   ELSE array_remove(ARRAY[g.paciente_id], NULL)
              END AS ids
         FROM turno_guardia_pacientes gp
        WHERE gp.turno_guardia_id = g.id
          AND gp.prestadora_id = g.prestadora_id
     ) quienes
     WHERE g.estado = 'programada'
       AND g.asistente_id IS NULL
  ),
  -- Un turno fijo entero.
  fijos AS (
    SELECT a.id, a.asignado_at, 'serie'::text, NULL::uuid, s.id, NULL::uuid,
           NULL::date, s.hora_inicio, s.hora_fin, s.dias_hasta_el_fin, s.modalidad, s.dias_semana,
           GREATEST(s.vigente_desde, interno.hoy_de_la_prestadora(s.prestadora_id)), s.vigente_hasta, NULL::integer,
           array_remove(ARRAY[s.paciente_id], NULL)
             || ARRAY(SELECT sp.paciente_id FROM series_turnos_guardia_pacientes sp
                       WHERE sp.serie_id = s.id AND sp.prestadora_id = s.prestadora_id),
           GREATEST(s.vigente_desde, interno.hoy_de_la_prestadora(s.prestadora_id)), s.prestadora_id,
           ARRAY[s.servicio_id]
      FROM mias a
      JOIN series_turnos_guardia s
        ON s.id = a.serie_id
       AND s.prestadora_id = a.prestadora_id
     WHERE s.estado = 'activa'
       AND s.asistente_id IS NULL
  ),
  -- El reemplazo de un ausente: hasta dónde llega lo decide la misma cuenta que
  -- `hastaDondeCubrir` del backend.
  ausencias_mias AS (
    SELECT a.id, a.asignado_at, a.prestadora_id, au.id AS ausencia_id, au.asistente_id AS titular_id,
           GREATEST(au.fecha_inicio, interno.hoy_de_la_prestadora(a.prestadora_id)) AS desde,
           CASE WHEN au.fecha_vuelta_real IS NULL AND au.fecha_fin < interno.hoy_de_la_prestadora(a.prestadora_id)
                THEN interno.hoy_de_la_prestadora(a.prestadora_id) + 2
                ELSE au.fecha_fin
           END AS hasta
      FROM mias a
      JOIN ausencias au
        ON au.id = a.ausencia_id
       AND au.prestadora_id = a.prestadora_id
  ),
  turnos_guardia_del_ausente AS (
    SELECT am.id AS asignacion_id, g.id AS turno_guardia_id, g.fecha, g.paciente_id, g.prestadora_id,
           g.servicio_id
      FROM ausencias_mias am
      JOIN turnos_guardia g
        ON g.prestadora_id = am.prestadora_id
       AND g.asistente_id = am.titular_id
       AND g.estado = 'programada'
       AND g.fecha BETWEEN am.desde AND am.hasta
     WHERE EXISTS (
       SELECT 1 FROM coberturas_de_ausencia c
        WHERE c.ausencia_id = am.ausencia_id
          AND c.prestadora_id = am.prestadora_id
          AND c.asistente_sustituto_id = interno.asistente_de_la_sesion()
          AND c.aceptada_at IS NULL
          AND c.objetada_at IS NULL
          AND c.serie_id IS NOT DISTINCT FROM g.serie_id
     )
  ),
  reemplazos AS (
    SELECT am.id, am.asignado_at, 'ausencia'::text, NULL::uuid, NULL::uuid, am.ausencia_id,
           NULL::date, NULL::time, NULL::time, NULL::smallint, NULL::text, NULL::text[],
           am.desde, am.hasta,
           (SELECT count(*)::integer FROM turnos_guardia_del_ausente t WHERE t.asignacion_id = am.id),
           ARRAY(
             SELECT DISTINCT p.id
               FROM turnos_guardia_del_ausente t
               CROSS JOIN LATERAL (
                 SELECT gp.paciente_id AS id FROM turno_guardia_pacientes gp
                  WHERE gp.turno_guardia_id = t.turno_guardia_id AND gp.prestadora_id = t.prestadora_id
                 UNION
                 SELECT t.paciente_id WHERE t.paciente_id IS NOT NULL
               ) p
              WHERE t.asignacion_id = am.id
           ),
           am.desde, am.prestadora_id,
           ARRAY(SELECT DISTINCT t.servicio_id FROM turnos_guardia_del_ausente t WHERE t.asignacion_id = am.id)
      FROM ausencias_mias am
  ),
  todo AS (
    SELECT * FROM turnos_guardia_sueltos
    UNION ALL SELECT * FROM fijos
    UNION ALL SELECT * FROM reemplazos
  )
  SELECT x.id,
         x.asignado_at,
         x.tipo,
         x.turno_guardia_id,
         x.serie_id,
         x.ausencia_id,
         x.fecha,
         x.hora_inicio,
         x.hora_fin,
         x.dias_hasta_el_fin,
         x.modalidad,
         x.dias_semana,
         x.desde,
         x.hasta,
         x.cantidad,
         (SELECT array_agg(DISTINCT d.lugar ORDER BY d.lugar)
            FROM public.domicilios_de_pacientes_en(x.ids, x.dia_del_domicilio) d
           WHERE d.lugar IS NOT NULL),
         (SELECT array_agg(DISTINCT i.nivel_complejidad ORDER BY i.nivel_complejidad)
            FROM public.informacion_de_salud_del_paciente i
           WHERE i.paciente_id = ANY (x.ids)
             AND i.prestadora_id = x.prestadora_id
             AND i.nivel_complejidad IS NOT NULL),
         -- Distancia en línea recta sobre la Tierra (fórmula del semiverseno), en metros.
         (SELECT round(min(
                   2 * 6371000 * asin(sqrt(
                     power(sin(radians(d.lat - yo.lat) / 2), 2)
                     + cos(radians(yo.lat)) * cos(radians(d.lat))
                       * power(sin(radians(d.lng - yo.lng) / 2), 2)
                   ))
                 ))::integer
            FROM public.domicilios_de_pacientes_en(x.ids, x.dia_del_domicilio) d
            CROSS JOIN yo
           WHERE d.lat IS NOT NULL AND d.lng IS NOT NULL
             AND yo.lat IS NOT NULL AND yo.lng IS NOT NULL),
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
                    'id', ta.id, 'prestadora_id', ta.prestadora_id, 'clave', ta.clave,
                    'texto', ta.texto, 'descripcion', ta.descripcion)
                  ORDER BY ta.orden, ta.id)
             FROM (
               SELECT DISTINCT tt.id, tt.prestadora_id, tt.clave, tt.texto, tt.descripcion, tt.orden
                 FROM tareas_del_servicio ts
                 JOIN tareas_tipo_asistente tt ON tt.id = ts.tarea_id
                 CROSS JOIN yo
                WHERE ts.prestadora_id = x.prestadora_id
                  AND ts.servicio_id = ANY (x.servicios)
                  AND ts.tipo_asistente_id = yo.tipo_asistente_id
             ) ta
         ), '[]'::jsonb)
    FROM todo x
   ORDER BY x.asignado_at DESC
   LIMIT 50
$function$;
CREATE OR REPLACE FUNCTION public.turnos_guardia_que_traban_la_desactivacion(p_usuario uuid)
 RETURNS TABLE(tipo text, id uuid, fecha date, hora_inicio time without time zone, hora_fin time without time zone, dias_hasta_el_fin smallint, checkin_at timestamp with time zone, cliente text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid;
BEGIN
  IF auth.jwt() ->> 'role' IS DISTINCT FROM 'trabajo_sin_persona' THEN RETURN; END IF;
  v_prestadora := interno.prestadora_actual();
  IF v_prestadora IS NULL OR p_usuario IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM interno.turnos_guardia_que_traban_la_desactivacion(p_usuario, v_prestadora);
END;
$function$;
CREATE OR REPLACE FUNCTION public.validar_paciente_de_serie_mismo_cliente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cliente_de_la_serie UUID;
  cliente_del_paciente UUID;
BEGIN
  SELECT p.cliente_id INTO cliente_de_la_serie
    FROM series_turnos_guardia s JOIN pacientes p ON p.id = s.paciente_id
   WHERE s.id = NEW.serie_id;

  SELECT cliente_id INTO cliente_del_paciente FROM pacientes WHERE id = NEW.paciente_id;

  IF cliente_de_la_serie IS NULL OR cliente_del_paciente IS NULL
     OR cliente_de_la_serie <> cliente_del_paciente THEN
    RAISE EXCEPTION 'Todos los Pacientes de una serie tienen que ser de el mismo Cliente';
  END IF;

  RETURN NEW;
END;
$function$;
CREATE TRIGGER anotar_el_dia_de_hoy BEFORE INSERT ON public.asistentes FOR EACH ROW EXECUTE FUNCTION interno.anotar_el_dia_de_hoy('fecha_alta');
CREATE TRIGGER anotar_el_dia_de_hoy BEFORE INSERT ON public.cobros_cliente FOR EACH ROW EXECUTE FUNCTION interno.anotar_el_dia_de_hoy('fecha_cobro');
CREATE TRIGGER anotar_el_dia_de_hoy BEFORE INSERT ON public.cobros_intermediacion FOR EACH ROW EXECUTE FUNCTION interno.anotar_el_dia_de_hoy('fecha_cobro');
CREATE TRIGGER anotar_el_dia_de_hoy BEFORE INSERT ON public.correcciones_factura_cliente FOR EACH ROW EXECUTE FUNCTION interno.anotar_el_dia_de_hoy('fecha');
ALTER TABLE public.cronograma_de_guardias ADD CONSTRAINT cronograma_de_guardias_dias_hasta_el_fin_valido CHECK (dias_hasta_el_fin >= 0);
CREATE TRIGGER anotar_el_dia_de_hoy BEFORE INSERT ON public.facturas_cliente FOR EACH ROW EXECUTE FUNCTION interno.anotar_el_dia_de_hoy('fecha_emision');
CREATE TRIGGER anotar_el_dia_de_hoy BEFORE INSERT ON public.hospitalizaciones_paciente FOR EACH ROW EXECUTE FUNCTION interno.anotar_el_dia_de_hoy('fecha_inicio');
CREATE TRIGGER la_suspension_de_la_internacion_vuelve_al_cerrarla BEFORE DELETE OR UPDATE ON public.interrupciones_de_cobertura FOR EACH ROW EXECUTE FUNCTION interno.la_suspension_de_la_internacion_vuelve_al_cerrarla();
CREATE TRIGGER anotar_el_dia_de_hoy BEFORE INSERT ON public.lista_precios FOR EACH ROW EXECUTE FUNCTION interno.anotar_el_dia_de_hoy('vigente_desde');
CREATE TRIGGER anotar_el_dia_de_hoy BEFORE INSERT ON public.prestaciones FOR EACH ROW EXECUTE FUNCTION interno.anotar_el_dia_de_hoy('vigente_desde');
CREATE TRIGGER anotar_el_dia_de_hoy BEFORE INSERT ON public.prestadoras FOR EACH ROW EXECUTE FUNCTION interno.anotar_el_dia_de_hoy('fecha_alta');
ALTER TABLE public.series_turnos_guardia ADD CONSTRAINT series_turnos_guardia_dura_algo CHECK (dias_hasta_el_fin > 0 OR hora_fin > hora_inicio);
ALTER TABLE public.series_turnos_guardia ADD CONSTRAINT series_turnos_guardia_dias_hasta_el_fin_valido CHECK (dias_hasta_el_fin >= 0);
COMMENT ON COLUMN public.turnos_guardia.dias_hasta_el_fin IS 'Cuantos dias despues de fecha termina el turno de guardia: 0 el mismo dia, 1 al siguiente, 2 dos dias despues, y asi sin tope. Con 0 la hora de fin va despues de la de comienzo.';
ALTER TABLE public.turnos_guardia ADD CONSTRAINT turnos_guardia_dura_algo CHECK (dias_hasta_el_fin > 0 OR hora_fin > hora_inicio);
ALTER TABLE public.turnos_guardia ADD CONSTRAINT turnos_guardia_dios_hasta_el_fin_valido CHECK (dias_hasta_el_fin >= 0);
CREATE OR REPLACE VIEW public.documentos_pedidos_al_asistente WITH (security_invoker=true) AS SELECT a.id AS asistente_id,
    a.prestadora_id,
    t.id AS tipo_documento_id,
    t.nombre,
    t.impide_trabajar,
    u.id AS documento_id,
    COALESCE(u.estado, 'falta'::text) AS estado,
    u.fecha_vencimiento,
    u.motivo_observacion,
    interno.gracia_hasta(a.id, t.id, interno.hoy_de_la_prestadora(a.prestadora_id)) AS gracia_hasta
   FROM (((public.asistentes a
     JOIN public.tipos_documento_por_tipo_asistente r ON (((r.tipo_asistente_id = a.tipo_asistente_id) AND (r.prestadora_id = a.prestadora_id))))
     JOIN public.tipos_documento_asistente t ON (((t.id = r.tipo_documento_id) AND t.activo)))
     LEFT JOIN LATERAL ( SELECT d.id,
            d.estado,
            d.fecha_vencimiento,
            d.motivo_observacion
           FROM public.documentos_asistente d
          WHERE ((d.asistente_id = a.id) AND (d.tipo_documento_id = t.id))
          ORDER BY d.created_at DESC
         LIMIT 1) u ON (true))
  WHERE (a.deleted_at IS NULL);
CREATE OR REPLACE VIEW public.saldos_cliente WITH (security_invoker=true) AS SELECT f.id AS factura_id,
    f.prestadora_id,
    f.cliente_id,
    f.periodo,
    f.moneda,
    f.monto_total,
    f.monto_facturado,
    f.comprobante_tipo,
    f.comprobante_numero,
    f.facturado_at,
    co.neto AS correcciones_neto,
    co.correcciones_contadas,
    public.monto_a_cobrar_de_factura(f.monto_total, f.monto_facturado, f.id) AS monto_a_cobrar,
    r.cobrado,
    ((public.monto_a_cobrar_de_factura(f.monto_total, f.monto_facturado, f.id) - r.cobrado))::numeric(12,2) AS saldo,
    public.estado_de_factura(f.prestadora_id, public.monto_a_cobrar_de_factura(f.monto_total, f.monto_facturado, f.id), r.cobrado, f.fecha_vencimiento) AS estado,
    f.estado AS estado_guardado,
    f.fecha_emision,
    f.fecha_vencimiento,
    r.cobros_contados,
    r.ultimo_cobro_fecha,
    r.origenes,
    f.updated_at AS actualizado_en,
    f.servicio_id,
    f.periodo_hasta
   FROM ((public.facturas_cliente f
     CROSS JOIN LATERAL public.resumen_cobros_de_factura(f.id) r(cobrado, cobros_contados, ultimo_cobro_fecha, origenes))
     CROSS JOIN LATERAL public.correcciones_de_factura(f.id) co(neto, correcciones_contadas));

-- Los permisos de lo que se volvió a crear: al borrar una función o una vista para cambiarle la
-- forma se pierden sus permisos, y acá vuelven a quedar como estaban.
REVOKE ALL ON FUNCTION interno.el_acceso_abre_contactos(uuid, text, date, date) FROM PUBLIC, anon;
GRANT ALL ON FUNCTION interno.el_acceso_abre_contactos(uuid, text, date, date) TO service_role, trabajo_sin_persona;
REVOKE ALL ON FUNCTION interno.gracia_hasta(uuid, uuid, date) FROM PUBLIC;
GRANT ALL ON FUNCTION interno.gracia_hasta(uuid, uuid, date) TO service_role, authenticated, trabajo_sin_persona;
REVOKE ALL ON FUNCTION public.ausencias_que_tapan(date, date, date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ausencias_que_tapan(date, date, date) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.domicilio_del_paciente_en(uuid, date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.domicilio_del_paciente_en(uuid, date) TO authenticated, service_role, trabajo_sin_persona;
REVOKE ALL ON FUNCTION public.domicilios_de_pacientes_en(uuid[], date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.domicilios_de_pacientes_en(uuid[], date) TO authenticated, service_role, trabajo_sin_persona;
REVOKE ALL ON FUNCTION public.precios_de_lista_que_rigen(date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.precios_de_lista_que_rigen(date) TO service_role, authenticated, trabajo_sin_persona;
REVOKE ALL ON FUNCTION public.prestaciones_con_promocion_vencida(date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.prestaciones_con_promocion_vencida(date) TO service_role, authenticated;
GRANT ALL ON TABLE public.documentos_pedidos_al_asistente TO service_role;
GRANT SELECT ON TABLE public.documentos_pedidos_al_asistente TO authenticated, trabajo_sin_persona;
GRANT SELECT, MAINTAIN ON TABLE public.saldos_cliente TO authenticated;
GRANT ALL ON TABLE public.saldos_cliente TO service_role;
COMMENT ON VIEW public.documentos_pedidos_al_asistente IS 'Cada documento que se le pide a cada Asistente, con el último cargado. gracia_hasta viene vacía si el documento vale o nunca tuvo uno aprobado.';
COMMENT ON VIEW public.saldos_cliente IS 'El saldo de cada factura de Cliente: lo que se le reclama menos lo cobrado, con el estado calculado, de que origenes salio el dato y cuando se actualizo. Unico punto de verdad de esa resta.';

NOTIFY pgrst, 'reload schema';
