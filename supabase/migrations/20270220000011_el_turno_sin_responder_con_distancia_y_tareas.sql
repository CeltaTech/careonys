-- El turno asignado y sin responder le dice además al Asistente a qué distancia queda y qué tareas
-- se acordaron en el Servicio para alguien de su tipo. Con eso decide sin saber todavía a quién
-- atiende ni el domicilio exacto, que siguen llegando recién al aceptar.
--
-- La distancia es en metros y en línea recta, desde el punto del Asistente hasta el domicilio del
-- día del turno; con varios Pacientes, el más cercano. Sin uno de los dos puntos, va en blanco.
-- Las tareas van con su clave, su texto y su Prestadora, que es lo que necesita la aplicación para
-- nombrarlas en el idioma de quien lee, como en el resto del catálogo.
--
-- Cambia lo que devuelve, así que se borra y se vuelve a crear, con sus permisos.

DROP FUNCTION public.turnos_asignados_sin_responder();

CREATE FUNCTION public.turnos_asignados_sin_responder()
 RETURNS TABLE(asignacion_id uuid, asignado_at timestamp with time zone, tipo text, guardia_id uuid, serie_id uuid, ausencia_id uuid, fecha date, hora_inicio time without time zone, hora_fin time without time zone, dias_hasta_el_fin smallint, modalidad text, dias_semana text[], desde date, hasta date, cantidad integer, barrios text[], niveles_de_complejidad text[], distancia_m integer, tareas jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  WITH yo AS (
    SELECT a.id, a.lat, a.lng, a.tipo_asistente_id
      FROM asistentes a
     WHERE a.id = interno.asistente_de_la_sesion()
       AND a.prestadora_id = interno.prestadora_actual()
  ),
  mias AS (
    SELECT a.*
      FROM asignaciones_de_turno a
     WHERE a.prestadora_id = interno.prestadora_actual()
       AND a.asistente_id = interno.asistente_de_la_sesion()
       AND a.estado = 'sin_responder'
  ),
  -- Un turno suelto.
  turnos AS (
    SELECT a.id, a.asignado_at, 'turno'::text AS tipo, g.id AS guardia_id, NULL::uuid AS serie_id,
           NULL::uuid AS ausencia_id, g.fecha, g.hora_inicio, g.hora_fin, g.dias_hasta_el_fin,
           g.modalidad, NULL::text[] AS dias_semana, g.fecha AS desde, g.fecha AS hasta,
           1 AS cantidad, quienes.ids, g.fecha AS dia_del_domicilio, g.prestadora_id,
           ARRAY[g.servicio_id] AS servicios
      FROM mias a
      JOIN guardias g
        ON g.id = a.guardia_id
       AND g.prestadora_id = a.prestadora_id
     CROSS JOIN LATERAL (
       SELECT CASE WHEN count(gp.paciente_id) > 0
                   THEN array_agg(gp.paciente_id)
                   ELSE array_remove(ARRAY[g.paciente_id], NULL)
              END AS ids
         FROM guardia_pacientes gp
        WHERE gp.guardia_id = g.id
          AND gp.prestadora_id = g.prestadora_id
     ) quienes
     WHERE g.estado = 'programada'
       AND g.asistente_id IS NULL
  ),
  -- Un turno fijo entero.
  fijos AS (
    SELECT a.id, a.asignado_at, 'serie'::text, NULL::uuid, s.id, NULL::uuid,
           NULL::date, s.hora_inicio, s.hora_fin, s.dias_hasta_el_fin, s.modalidad, s.dias_semana,
           GREATEST(s.vigente_desde, CURRENT_DATE), s.vigente_hasta, NULL::integer,
           array_remove(ARRAY[s.paciente_id], NULL)
             || ARRAY(SELECT sp.paciente_id FROM series_guardias_pacientes sp
                       WHERE sp.serie_id = s.id AND sp.prestadora_id = s.prestadora_id),
           GREATEST(s.vigente_desde, CURRENT_DATE), s.prestadora_id,
           ARRAY[s.servicio_id]
      FROM mias a
      JOIN series_guardias s
        ON s.id = a.serie_id
       AND s.prestadora_id = a.prestadora_id
     WHERE s.estado = 'activa'
       AND s.asistente_id IS NULL
  ),
  -- El reemplazo de un ausente: hasta dónde llega lo decide la misma cuenta que
  -- `hastaDondeCubrir` del backend.
  ausencias_mias AS (
    SELECT a.id, a.asignado_at, a.prestadora_id, au.id AS ausencia_id, au.asistente_id AS titular_id,
           GREATEST(au.fecha_inicio, CURRENT_DATE) AS desde,
           CASE WHEN au.fecha_vuelta_real IS NULL AND au.fecha_fin < CURRENT_DATE
                THEN CURRENT_DATE + 2
                ELSE au.fecha_fin
           END AS hasta
      FROM mias a
      JOIN ausencias au
        ON au.id = a.ausencia_id
       AND au.prestadora_id = a.prestadora_id
  ),
  turnos_del_ausente AS (
    SELECT am.id AS asignacion_id, g.id AS guardia_id, g.fecha, g.paciente_id, g.prestadora_id,
           g.servicio_id
      FROM ausencias_mias am
      JOIN guardias g
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
           (SELECT count(*)::integer FROM turnos_del_ausente t WHERE t.asignacion_id = am.id),
           ARRAY(
             SELECT DISTINCT p.id
               FROM turnos_del_ausente t
               CROSS JOIN LATERAL (
                 SELECT gp.paciente_id AS id FROM guardia_pacientes gp
                  WHERE gp.guardia_id = t.guardia_id AND gp.prestadora_id = t.prestadora_id
                 UNION
                 SELECT t.paciente_id WHERE t.paciente_id IS NOT NULL
               ) p
              WHERE t.asignacion_id = am.id
           ),
           am.desde, am.prestadora_id,
           ARRAY(SELECT DISTINCT t.servicio_id FROM turnos_del_ausente t WHERE t.asignacion_id = am.id)
      FROM ausencias_mias am
  ),
  todo AS (
    SELECT * FROM turnos
    UNION ALL SELECT * FROM fijos
    UNION ALL SELECT * FROM reemplazos
  )
  SELECT x.id,
         x.asignado_at,
         x.tipo,
         x.guardia_id,
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

REVOKE ALL ON FUNCTION public.turnos_asignados_sin_responder() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.turnos_asignados_sin_responder() TO authenticated;

NOTIFY pgrst, 'reload schema';
