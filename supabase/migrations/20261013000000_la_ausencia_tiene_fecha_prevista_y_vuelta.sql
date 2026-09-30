-- La ausencia tiene fecha prevista y fecha de vuelta, y se cubre por turno fijo.
--
-- 1. La fecha prevista (`fecha_fin`) se carga siempre. Cada cambio queda anotado: la fecha que
--    había, la nueva, quién la cambió y cuándo.
-- 2. La vuelta se anota aparte (`fecha_vuelta_real`). Cuando se anota, `fecha_fin` pasa a ser el
--    día anterior.
-- 3. Pasada la fecha prevista sin vuelta anotada, la ausencia se sigue contando abierta y el
--    sistema pregunta hasta que alguien contesta (`pregunta_vuelta_at` / `pregunta_vuelta_veces`).
-- 4. La cobertura se asigna por turno fijo para toda la ausencia (`coberturas_de_ausencia`) y se
--    extiende sola. Quien cubre puede objetarla.
-- 5. Un Coordinador también puede estar ausente (`usuario_id`); lo cubre otro Coordinador
--    (`coordinador_que_cubre_id`), que mientras tanto alcanza también su zona.

-- ── 1 y 2. Las fechas ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.ausencias
  ADD COLUMN fecha_vuelta_real date,
  ADD COLUMN pregunta_vuelta_at timestamptz,
  ADD COLUMN pregunta_vuelta_veces integer NOT NULL DEFAULT 0;

-- Datos de prueba: las cerradas volvieron al día siguiente de su fin; la abierta recibe una fecha
-- prevista ya vencida, para que la pregunta de la vuelta tenga un caso real en la Organización de
-- pruebas.
UPDATE public.ausencias SET fecha_vuelta_real = fecha_fin + 1 WHERE fecha_fin IS NOT NULL;
UPDATE public.ausencias SET fecha_fin = GREATEST(fecha_inicio, DATE '2026-09-16') WHERE fecha_fin IS NULL;

ALTER TABLE public.ausencias
  ALTER COLUMN fecha_fin SET NOT NULL,
  ADD CONSTRAINT ausencias_fin_no_antes_del_inicio CHECK (fecha_fin >= fecha_inicio),
  ADD CONSTRAINT ausencias_vuelta_despues_del_inicio
    CHECK (fecha_vuelta_real IS NULL OR fecha_vuelta_real > fecha_inicio);

-- ── 5. La ausencia de un Coordinador ─────────────────────────────────────────────────────────────

ALTER TABLE public.ausencias
  ALTER COLUMN asistente_id DROP NOT NULL,
  ADD COLUMN usuario_id uuid REFERENCES public.usuarios(id),
  ADD COLUMN coordinador_que_cubre_id uuid REFERENCES public.usuarios(id),
  ADD CONSTRAINT ausencias_de_una_sola_persona CHECK (num_nonnulls(asistente_id, usuario_id) = 1);

CREATE INDEX ausencias_usuario_id_idx ON public.ausencias (usuario_id) WHERE usuario_id IS NOT NULL;
CREATE INDEX ausencias_coordinador_que_cubre_idx ON public.ausencias (coordinador_que_cubre_id)
  WHERE coordinador_que_cubre_id IS NOT NULL;

-- Quien cubre a un Coordinador ausente alcanza también sus lugares, desde el inicio de la ausencia
-- hasta el día anterior a la vuelta anotada. Sin vuelta anotada, sigue alcanzándolos.
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
      AND a.fecha_inicio <= current_date
      AND (a.fecha_vuelta_real IS NULL OR a.fecha_vuelta_real > current_date)
      AND al.asistente_id = p_asistente_id
  );
$function$;

-- ── 1. Cada cambio de la fecha prevista queda anotado ────────────────────────────────────────────

CREATE TABLE public.ausencias_cambios_de_fecha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras(id),
  ausencia_id uuid NOT NULL REFERENCES public.ausencias(id),
  fecha_anterior date NOT NULL,
  fecha_nueva date NOT NULL,
  cambiado_por uuid DEFAULT auth.uid(),
  cambiado_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ausencias_cambios_de_fecha_ausencia_idx ON public.ausencias_cambios_de_fecha (ausencia_id);

ALTER TABLE public.ausencias_cambios_de_fecha ENABLE ROW LEVEL SECURITY;

-- Se ve y se anota lo de una ausencia que quien pregunta ya puede ver. El historial no se corrige
-- ni se borra: no hay política de modificación ni de borrado.
CREATE POLICY quien_ve_la_ausencia_ve_sus_cambios ON public.ausencias_cambios_de_fecha
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.current_tenant()
         AND EXISTS (SELECT 1 FROM public.ausencias a WHERE a.id = ausencia_id));
CREATE POLICY quien_cambia_la_fecha_anota_el_cambio ON public.ausencias_cambios_de_fecha
  FOR INSERT TO authenticated
  WITH CHECK (prestadora_id = interno.current_tenant()
              AND cambiado_por = auth.uid()
              AND EXISTS (SELECT 1 FROM public.ausencias a WHERE a.id = ausencia_id));

REVOKE ALL ON public.ausencias_cambios_de_fecha FROM anon, PUBLIC;
GRANT SELECT, INSERT ON public.ausencias_cambios_de_fecha TO authenticated;

-- Corre con el rol de quien escribe (no es SECURITY DEFINER): la anotación pasa por las mismas
-- políticas que la ausencia. Cambiar la fecha prevista también vuelve a empezar la pregunta.
CREATE OR REPLACE FUNCTION interno.anotar_cambio_de_fecha_de_ausencia()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF NEW.fecha_fin IS DISTINCT FROM OLD.fecha_fin THEN
    INSERT INTO public.ausencias_cambios_de_fecha (prestadora_id, ausencia_id, fecha_anterior, fecha_nueva)
    VALUES (NEW.prestadora_id, NEW.id, OLD.fecha_fin, NEW.fecha_fin);
    NEW.pregunta_vuelta_at := NULL;
    NEW.pregunta_vuelta_veces := 0;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION interno.anotar_cambio_de_fecha_de_ausencia() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.anotar_cambio_de_fecha_de_ausencia() TO authenticated;

CREATE TRIGGER anotar_cambio_de_fecha
  BEFORE UPDATE OF fecha_fin ON public.ausencias
  FOR EACH ROW EXECUTE FUNCTION interno.anotar_cambio_de_fecha_de_ausencia();

-- ── 4. La cobertura por turno fijo ───────────────────────────────────────────────────────────────

CREATE TABLE public.coberturas_de_ausencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras(id),
  ausencia_id uuid NOT NULL REFERENCES public.ausencias(id),
  serie_id uuid NOT NULL REFERENCES public.series_guardias(id),
  asistente_sustituto_id uuid NOT NULL REFERENCES public.asistentes(id),
  motivo text,
  motivo_detalle text,
  costo_adicional numeric,
  moneda text,
  asignada_por uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  objetada_at timestamptz
);
CREATE UNIQUE INDEX coberturas_de_ausencia_una_por_turno
  ON public.coberturas_de_ausencia (ausencia_id, serie_id) WHERE objetada_at IS NULL;
CREATE INDEX coberturas_de_ausencia_sustituto_idx ON public.coberturas_de_ausencia (asistente_sustituto_id);

CREATE TRIGGER trg_completar_moneda
  BEFORE INSERT ON public.coberturas_de_ausencia
  FOR EACH ROW EXECUTE FUNCTION fn_completar_moneda();

ALTER TABLE public.coberturas_de_ausencia ENABLE ROW LEVEL SECURITY;

CREATE POLICY quien_ve_la_ausencia_ve_su_cobertura ON public.coberturas_de_ausencia
  FOR ALL TO authenticated
  USING (prestadora_id = interno.current_tenant()
         AND EXISTS (SELECT 1 FROM public.ausencias a WHERE a.id = ausencia_id))
  WITH CHECK (prestadora_id = interno.current_tenant()
              AND EXISTS (SELECT 1 FROM public.ausencias a WHERE a.id = ausencia_id));
CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.coberturas_de_ausencia
  TO trabajo_sin_persona
  USING (prestadora_id = interno.current_tenant())
  WITH CHECK (prestadora_id = interno.current_tenant());

REVOKE ALL ON public.coberturas_de_ausencia FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.coberturas_de_ausencia TO authenticated;
GRANT SELECT, UPDATE ON public.coberturas_de_ausencia TO trabajo_sin_persona;

-- Cada guardia cubierta dice de qué cobertura por turno salió, para poder devolverla si la
-- ausencia termina antes o si quien cubre objeta.
ALTER TABLE public.guardias_cobertura
  ADD COLUMN cobertura_de_ausencia_id uuid REFERENCES public.coberturas_de_ausencia(id);
CREATE INDEX guardias_cobertura_de_ausencia_idx ON public.guardias_cobertura (cobertura_de_ausencia_id)
  WHERE cobertura_de_ausencia_id IS NOT NULL;

-- La tarea que extiende la cobertura día a día trabaja sobre estas filas.
GRANT SELECT, INSERT, DELETE ON public.guardias_cobertura TO trabajo_sin_persona;
CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.guardias_cobertura
  TO trabajo_sin_persona
  USING (prestadora_id = interno.current_tenant())
  WITH CHECK (prestadora_id = interno.current_tenant());

-- El disparador que valida el motivo lo busca en el catálogo con el rol de quien escribe.
GRANT SELECT ON public.motivos_sustitucion_guardia TO trabajo_sin_persona;
CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.motivos_sustitucion_guardia
  FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.current_tenant());

-- ── 3. Hasta cuándo tapa una ausencia ───────────────────────────────────────────────────────────

-- Mismo criterio que `finEfectivoDeLaAusencia` (panel/src/lib/ausenciaQueTapa.js): pasada la fecha
-- prevista sin vuelta anotada, sigue abierta. `p_hoy` lo manda el Panel, que sabe qué día es donde
-- está quien pregunta.
DROP FUNCTION public.ausencias_que_tapan(date, date);
CREATE FUNCTION public.ausencias_que_tapan(p_desde date, p_hasta date, p_hoy date DEFAULT current_date)
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
      a.prestadora_id = current_tenant()
      AND s.prestadora_id = current_tenant()
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
REVOKE ALL ON FUNCTION public.ausencias_que_tapan(date, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ausencias_que_tapan(date, date, date) TO authenticated;

-- ── Las frases de los avisos nuevos ─────────────────────────────────────────────────────────────

INSERT INTO public.mensajes_del_sistema (clave, admite_texto_propio, i18n) VALUES
  ('vuelta_de_ausencia_sin_confirmar.asunto', true,
   '{"es-AR":"Confirmar la vuelta de {{nombre}}","en":"Confirm {{nombre}}''s return","pt-BR":"Confirmar o retorno de {{nombre}}"}'),
  ('vuelta_de_ausencia_sin_confirmar.cuerpo', true,
   '{"es-AR":"La ausencia de {{nombre}} tenía prevista la vuelta para el {{fecha}} y nadie la anotó. Mientras no se anote la vuelta o una nueva fecha prevista, la ausencia sigue abierta y la cobertura continúa.","en":"{{nombre}}''s absence was expected to end on {{fecha}} and no return has been recorded. Until a return or a new expected date is recorded, the absence stays open and coverage continues.","pt-BR":"A ausência de {{nombre}} tinha retorno previsto para {{fecha}} e ninguém o registrou. Enquanto não se registrar o retorno ou uma nova data prevista, a ausência continua aberta e a cobertura segue."}'),
  ('vuelta_de_coordinador_sin_confirmar.asunto', true,
   '{"es-AR":"Confirmar la vuelta de {{nombre}}","en":"Confirm {{nombre}}''s return","pt-BR":"Confirmar o retorno de {{nombre}}"}'),
  ('vuelta_de_coordinador_sin_confirmar.cuerpo', true,
   '{"es-AR":"La ausencia del Coordinador {{nombre}} tenía prevista la vuelta para el {{fecha}} y nadie la anotó. Mientras no se anote la vuelta o una nueva fecha prevista, la ausencia sigue abierta y quien lo cubre sigue a cargo de su zona.","en":"Coordinator {{nombre}}''s absence was expected to end on {{fecha}} and no return has been recorded. Until a return or a new expected date is recorded, the absence stays open and the covering coordinator remains in charge of the zone.","pt-BR":"A ausência do Coordenador {{nombre}} tinha retorno previsto para {{fecha}} e ninguém o registrou. Enquanto não se registrar o retorno ou uma nova data prevista, a ausência continua aberta e quem o cobre segue responsável pela zona."}'),
  ('cobertura_objetada.asunto', true,
   '{"es-AR":"{{nombre}} no puede cubrir un turno","en":"{{nombre}} cannot cover a shift","pt-BR":"{{nombre}} não pode cobrir um turno"}'),
  ('cobertura_objetada.cuerpo', true,
   '{"es-AR":"{{nombre}} avisó que no puede cubrir el turno fijo que se le asignó durante una ausencia. Esas guardias volvieron a quedar sin cubrir.","en":"{{nombre}} reported being unable to cover the recurring shift assigned during an absence. Those shifts are uncovered again.","pt-BR":"{{nombre}} avisou que não pode cobrir o turno fixo atribuído durante uma ausência. Esses plantões voltaram a ficar sem cobertura."}')
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
