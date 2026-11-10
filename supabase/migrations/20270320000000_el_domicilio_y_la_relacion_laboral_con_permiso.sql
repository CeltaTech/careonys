-- El domicilio y la relación laboral del Asistente salen de su Legajo y pasan a tener permiso
-- propio, uno cada uno, que reparte cada Prestadora entre quienes coordinan.
--
-- La base filtra filas, no columnas: mientras estos datos estuvieran en la fila del Asistente,
-- todo el que puede leer esa fila los leía, aunque el Panel no los mostrara. Pasan a dos tablas
-- aparte, con el mismo molde que lo que se le paga y los datos confidenciales.
--
-- · «Ver el domicilio de los Asistentes». Con el permiso, quien coordina además lo corrige si
--   tiene el de gestionar Asistentes y el Asistente está a su cargo.
-- · «Ver la relación laboral de los Asistentes». Cambiarla sigue siendo de la administración.
--
-- Los dos nacen reservados a la administración. El Asistente sigue viendo los suyos en su
-- aplicación.

BEGIN;

-- ── El domicilio ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.domicilio_asistente (
  asistente_id uuid PRIMARY KEY,
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras(id),
  domicilio text,
  calle text,
  numero text,
  piso text,
  unidad text,
  lugar_id uuid,
  codigo_postal text,
  lat double precision,
  lng double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (asistente_id, prestadora_id) REFERENCES public.asistentes (id, prestadora_id) ON DELETE CASCADE,
  FOREIGN KEY (lugar_id, prestadora_id) REFERENCES public.lugares (id, prestadora_id)
);
CREATE INDEX domicilio_asistente_prestadora ON public.domicilio_asistente (prestadora_id);
CREATE INDEX domicilio_asistente_lugar ON public.domicilio_asistente (lugar_id);
ALTER TABLE public.domicilio_asistente ENABLE ROW LEVEL SECURITY;

CREATE POLICY lee_domicilio_quien_tiene_el_permiso ON public.domicilio_asistente
  FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND interno.tiene_permiso('ver_domicilio_asistente')
    AND EXISTS (SELECT 1 FROM public.asistentes a WHERE a.id = domicilio_asistente.asistente_id)
  );
CREATE POLICY el_asistente_lee_su_domicilio ON public.domicilio_asistente
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.asistentes a
     WHERE a.id = domicilio_asistente.asistente_id AND a.usuario_id = auth.uid()
  ));
-- Corrige el domicilio la administración, o quien coordina con los dos permisos y al Asistente a
-- su cargo.
CREATE POLICY carga_domicilio_quien_puede ON public.domicilio_asistente
  FOR INSERT TO authenticated
  WITH CHECK (
    prestadora_id = interno.prestadora_actual()
    AND (interno.es_superadmin() OR interno.es_admin_prestadora()
      OR (interno.tiene_permiso('ver_domicilio_asistente')
          AND interno.tiene_permiso('gestionar_asistentes')
          AND interno.coordinador_alcanza_asistente(asistente_id)))
  );
CREATE POLICY edita_domicilio_quien_puede ON public.domicilio_asistente
  FOR UPDATE TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND (interno.es_superadmin() OR interno.es_admin_prestadora()
      OR (interno.tiene_permiso('ver_domicilio_asistente')
          AND interno.tiene_permiso('gestionar_asistentes')
          AND interno.coordinador_alcanza_asistente(asistente_id)))
  )
  WITH CHECK (
    prestadora_id = interno.prestadora_actual()
    AND (interno.es_superadmin() OR interno.es_admin_prestadora()
      OR (interno.tiene_permiso('ver_domicilio_asistente')
          AND interno.tiene_permiso('gestionar_asistentes')
          AND interno.coordinador_alcanza_asistente(asistente_id)))
  );
CREATE POLICY borra_domicilio_solo_la_administracion ON public.domicilio_asistente
  FOR DELETE TO authenticated
  USING (prestadora_id = interno.prestadora_actual() AND (interno.es_superadmin() OR interno.es_admin_prestadora()));
CREATE POLICY trabajo_sin_persona_domicilio_en_esta_prestadora ON public.domicilio_asistente
  TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual())
  WITH CHECK (prestadora_id = interno.prestadora_actual());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.domicilio_asistente TO authenticated, trabajo_sin_persona;
REVOKE ALL ON public.domicilio_asistente FROM anon;

INSERT INTO public.domicilio_asistente (asistente_id, prestadora_id, domicilio, calle, numero, piso, unidad, lugar_id, codigo_postal, lat, lng)
SELECT id, prestadora_id, domicilio, calle, numero, piso, unidad, lugar_id, codigo_postal, lat, lng
  FROM public.asistentes
 WHERE domicilio IS NOT NULL OR calle IS NOT NULL OR numero IS NOT NULL OR piso IS NOT NULL
    OR unidad IS NOT NULL OR lugar_id IS NOT NULL OR codigo_postal IS NOT NULL
    OR lat IS NOT NULL OR lng IS NOT NULL;

-- ── La relación laboral ──────────────────────────────────────────────────────────────────────
CREATE TABLE public.relacion_laboral_asistente (
  asistente_id uuid PRIMARY KEY,
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras(id),
  relacion_laboral_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (asistente_id, prestadora_id) REFERENCES public.asistentes (id, prestadora_id) ON DELETE CASCADE,
  -- Sólo un renglón de la lista de su misma Prestadora. Mientras un Legajo lo use, no se borra:
  -- se apaga.
  FOREIGN KEY (prestadora_id, relacion_laboral_id) REFERENCES public.relaciones_laborales (prestadora_id, id) ON DELETE RESTRICT
);
CREATE INDEX relacion_laboral_asistente_prestadora ON public.relacion_laboral_asistente (prestadora_id);
CREATE INDEX relacion_laboral_asistente_relacion ON public.relacion_laboral_asistente (relacion_laboral_id);
ALTER TABLE public.relacion_laboral_asistente ENABLE ROW LEVEL SECURITY;

CREATE POLICY lee_relacion_laboral_quien_tiene_el_permiso ON public.relacion_laboral_asistente
  FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND interno.tiene_permiso('ver_relacion_laboral_asistente')
    AND EXISTS (SELECT 1 FROM public.asistentes a WHERE a.id = relacion_laboral_asistente.asistente_id)
  );
CREATE POLICY el_asistente_lee_su_relacion_laboral ON public.relacion_laboral_asistente
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.asistentes a
     WHERE a.id = relacion_laboral_asistente.asistente_id AND a.usuario_id = auth.uid()
  ));
CREATE POLICY gestiona_relacion_laboral_solo_la_administracion ON public.relacion_laboral_asistente
  TO authenticated
  USING (prestadora_id = interno.prestadora_actual() AND (interno.es_superadmin() OR interno.es_admin_prestadora()))
  WITH CHECK (prestadora_id = interno.prestadora_actual() AND (interno.es_superadmin() OR interno.es_admin_prestadora()));
CREATE POLICY trabajo_sin_persona_relacion_laboral_en_esta_prestadora ON public.relacion_laboral_asistente
  TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual())
  WITH CHECK (prestadora_id = interno.prestadora_actual());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.relacion_laboral_asistente TO authenticated, trabajo_sin_persona;
REVOKE ALL ON public.relacion_laboral_asistente FROM anon;

INSERT INTO public.relacion_laboral_asistente (asistente_id, prestadora_id, relacion_laboral_id)
SELECT id, prestadora_id, relacion_laboral_id
  FROM public.asistentes
 WHERE relacion_laboral_id IS NOT NULL;

-- ── Los permisos, reservados a la administración de fábrica ──────────────────────────────────
INSERT INTO catalogo_acciones_permisos (accion, default_solo_admin, orden) VALUES
  ('ver_domicilio_asistente', true, 105),
  ('ver_relacion_laboral_asistente', true, 106);

UPDATE catalogo_acciones_permisos c SET orden = o.orden
FROM (VALUES
  ('gestionar_asistentes', 1),
  ('ver_domicilio_asistente', 2),
  ('ver_relacion_laboral_asistente', 3),
  ('ver_pagos_asistente', 4),
  ('ver_datos_reservados_asistente', 5),
  ('ver_datos_bancarios_asistente', 6),
  ('ver_documentos_asistente', 7),
  ('cargar_documentos_asistente', 8),
  ('asignar_con_documentos_pendientes', 9),
  ('editar_datos_cliente', 10),
  ('configurar_accesos_de_personas_autorizadas', 11),
  ('ver_estado_de_cuenta_cliente', 12),
  ('gestionar_servicios', 13),
  ('editar_condiciones_comerciales_servicio', 14),
  ('modificar_asistentes_del_servicio', 15),
  ('registrar_consentimiento_pagador', 16),
  ('editar_datos_paciente', 17),
  ('validar_informe_obra_social', 18),
  ('ver_personas', 19),
  ('editar_personas', 20),
  ('importar_datos_masivos', 21),
  ('publicar_contenidos', 22),
  ('habilitar_cambio_de_clave', 23)
) AS o(accion, orden)
WHERE c.accion = o.accion;

-- ── Lo que leía estas columnas en la fila del Asistente ──────────────────────────────────────
-- Quien coordina sigue sin poder cambiar las horas y la baja. La relación laboral ya no está en
-- la fila, y su tabla sólo la escribe la administración.
CREATE OR REPLACE FUNCTION public.bloquear_edicion_laboral_coordinador()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  rol_actual TEXT;
BEGIN
  SELECT rol INTO rol_actual FROM usuarios WHERE id = interno.usuario_de_la_sesion();

  IF rol_actual = 'coordinador' THEN
    IF NEW.horas_semanales IS DISTINCT FROM OLD.horas_semanales
      OR NEW.fecha_baja IS DISTINCT FROM OLD.fecha_baja
    THEN
      RAISE EXCEPTION 'Coordinador no puede modificar datos laborales internos del Asistente';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- La distancia de cada turno ofrecido se mide desde el domicilio del Asistente que pregunta.
CREATE OR REPLACE FUNCTION public.turnos_asignados_sin_responder()
 RETURNS TABLE(asignacion_id uuid, asignado_at timestamp with time zone, tipo text, guardia_id uuid, serie_id uuid, ausencia_id uuid, fecha date, hora_inicio time without time zone, hora_fin time without time zone, dias_hasta_el_fin smallint, modalidad text, dias_semana text[], desde date, hasta date, cantidad integer, barrios text[], niveles_de_complejidad text[], distancia_m integer, tareas jsonb)
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
$function$
;

-- Para que el Panel traiga cada una como un objeto al leer al Asistente.
ALTER TABLE public.domicilio_asistente ADD CONSTRAINT domicilio_asistente_de_su_prestadora UNIQUE (asistente_id, prestadora_id);
ALTER TABLE public.relacion_laboral_asistente ADD CONSTRAINT relacion_laboral_asistente_de_su_prestadora UNIQUE (asistente_id, prestadora_id);

-- ── Salen de la fila del Asistente ───────────────────────────────────────────────────────────
ALTER TABLE public.asistentes
  DROP COLUMN domicilio,
  DROP COLUMN calle,
  DROP COLUMN numero,
  DROP COLUMN piso,
  DROP COLUMN unidad,
  DROP COLUMN lugar_id,
  DROP COLUMN codigo_postal,
  DROP COLUMN lat,
  DROP COLUMN lng,
  DROP COLUMN relacion_laboral_id;

COMMIT;

NOTIFY pgrst, 'reload schema';
