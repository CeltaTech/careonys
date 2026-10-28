-- La información de salud del Paciente sale de la tabla de pacientes.
--
-- Las patologías, la medicación habitual y el nivel de complejidad son información de salud, y
-- estaban en `pacientes`, que lee cualquiera que tenga que nombrar o ubicar a un Paciente. Pasan a
-- una tabla propia con la misma regla que el resto de la historia clínica: la ve quien atiende,
-- cada cambio queda versionado y una corrección lleva su nota aclaratoria.
--
-- La medicación habitual no se muda: la medicación vigente sale de las indicaciones aceptadas, y
-- esta columna ya no la leía ninguna pantalla. Se borra con lo que tenía.
--
-- Una fila por Paciente. La importación de una planilla también la escribe, y cuando la Prestadora
-- rechaza lo importado y se borran los Pacientes, la fila se va con ellos.

BEGIN;

-- ─── 1. La tabla ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.informacion_de_salud_del_paciente (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  prestadora_id uuid NOT NULL,
  paciente_id uuid NOT NULL UNIQUE,
  patologias text[] DEFAULT '{}'::text[] NOT NULL,
  nivel_complejidad text CHECK (nivel_complejidad IN ('I', 'II', 'III')),
  nota_aclaratoria text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT informacion_de_salud_del_paciente_de_la_misma_prestadora
    FOREIGN KEY (paciente_id, prestadora_id)
    REFERENCES public.pacientes (id, prestadora_id) ON DELETE CASCADE
);

COMMENT ON TABLE public.informacion_de_salud_del_paciente IS 'Patologías y nivel de complejidad de cada Paciente. Información de salud: la ve quien atiende al Paciente, y cada cambio queda en versiones_registro_clinico.';

ALTER TABLE public.informacion_de_salud_del_paciente ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.informacion_de_salud_del_paciente FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.informacion_de_salud_del_paciente TO authenticated, trabajo_sin_persona;

-- ─── 2. Quién la lee y quién la escribe ──────────────────────────────────────────────────────
-- Las mismas personas que con el Paciente, más la regla de la información de salud encima.

CREATE POLICY admin_gestiona_informacion_de_salud
  ON public.informacion_de_salud_del_paciente
  USING (
    (interno.es_superadmin() AND prestadora_id = interno.prestadora_actual())
    OR (prestadora_id = interno.prestadora_actual()
        AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin_prestadora'))
  );

CREATE POLICY coordinador_lee_informacion_de_salud
  ON public.informacion_de_salud_del_paciente FOR SELECT
  USING (
    prestadora_id = interno.prestadora_actual()
    AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol = 'coordinador')
  );

CREATE POLICY coordinador_agrega_informacion_de_salud
  ON public.informacion_de_salud_del_paciente FOR INSERT
  WITH CHECK (
    prestadora_id = interno.prestadora_actual()
    AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol = 'coordinador')
    AND interno.tiene_permiso('editar_datos_paciente')
  );

CREATE POLICY coordinador_edita_informacion_de_salud
  ON public.informacion_de_salud_del_paciente FOR UPDATE
  USING (
    prestadora_id = interno.prestadora_actual()
    AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol = 'coordinador')
    AND interno.tiene_permiso('editar_datos_paciente')
  );

CREATE POLICY asistente_lee_informacion_de_salud_de_sus_pacientes
  ON public.informacion_de_salud_del_paciente FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND paciente_id IN (SELECT interno.pacientes_del_asistente())
  );

CREATE POLICY cliente_lee_informacion_de_salud_de_sus_pacientes
  ON public.informacion_de_salud_del_paciente FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND paciente_id IN (SELECT interno.pacientes_del_cliente())
  );

CREATE POLICY trabajo_sin_persona_de_esta_prestadora
  ON public.informacion_de_salud_del_paciente TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual())
  WITH CHECK (prestadora_id = interno.prestadora_actual());

-- La regla de toda la historia clínica: la ve quien atiende.
CREATE POLICY la_informacion_de_salud_la_ve_quien_atiende
  ON public.informacion_de_salud_del_paciente AS RESTRICTIVE FOR SELECT TO authenticated
  USING (interno.alcanza_la_informacion_de_salud(paciente_id));

-- Un Paciente que espera la conformidad de una importación no existe para nadie más que para la
-- importación, y su información de salud tampoco. La consulta a `pacientes` corre con la
-- protección por fila de quien pregunta, así que la regla es la misma que en esa tabla.
CREATE POLICY oculta_pendientes_de_conformidad
  ON public.informacion_de_salud_del_paciente AS RESTRICTIVE
  USING (EXISTS (SELECT 1 FROM public.pacientes p WHERE p.id = paciente_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.pacientes p WHERE p.id = paciente_id));

-- ─── 3. Versiones y nota aclaratoria ─────────────────────────────────────────────────────────

CREATE TRIGGER trg_la_nota_es_de_una_version
  BEFORE UPDATE ON public.informacion_de_salud_del_paciente
  FOR EACH ROW EXECUTE FUNCTION interno.la_nota_aclaratoria_es_de_una_version();

CREATE TRIGGER trg_versiones_del_registro_clinico
  AFTER INSERT OR UPDATE OR DELETE ON public.informacion_de_salud_del_paciente
  FOR EACH ROW EXECUTE FUNCTION interno.anotar_version_clinica();

-- ─── 4. Lo que había en pacientes ────────────────────────────────────────────────────────────

INSERT INTO public.informacion_de_salud_del_paciente (prestadora_id, paciente_id, patologias, nivel_complejidad)
SELECT p.prestadora_id, p.id, coalesce(p.patologias, '{}'::text[]), p.nivel_complejidad
  FROM public.pacientes p
 WHERE coalesce(cardinality(p.patologias), 0) > 0
    OR p.nivel_complejidad IS NOT NULL;

-- ─── 5. Los turnos ofrecidos leen el nivel de la tabla nueva ─────────────────────────────────
-- Es la excepción que deja ver el nivel a quien todavía no atiende al Paciente: se le ofrece un
-- turno y tiene que saber qué cuidado pide. Sólo cambia la última consulta.

CREATE OR REPLACE FUNCTION public.turnos_asignados_sin_responder()
 RETURNS TABLE(asignacion_id uuid, asignado_at timestamp with time zone, tipo text, guardia_id uuid, serie_id uuid, ausencia_id uuid, fecha date, hora_inicio time without time zone, hora_fin time without time zone, dias_hasta_el_fin smallint, modalidad text, dias_semana text[], desde date, hasta date, cantidad integer, barrios text[], niveles_de_complejidad text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  WITH mias AS (
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
           1 AS cantidad, quienes.ids, g.fecha AS dia_del_domicilio, g.prestadora_id
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
           GREATEST(s.vigente_desde, CURRENT_DATE), s.prestadora_id
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
    SELECT am.id AS asignacion_id, g.id AS guardia_id, g.fecha, g.paciente_id, g.prestadora_id
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
           am.desde, am.prestadora_id
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
             AND i.nivel_complejidad IS NOT NULL)
    FROM todo x
   ORDER BY x.asignado_at DESC
   LIMIT 50
$function$;

-- ─── 6. Fuera de pacientes ───────────────────────────────────────────────────────────────────

ALTER TABLE public.pacientes
  DROP COLUMN patologias,
  DROP COLUMN medicacion_habitual,
  DROP COLUMN nivel_complejidad;

NOTIFY pgrst, 'reload schema';

COMMIT;
