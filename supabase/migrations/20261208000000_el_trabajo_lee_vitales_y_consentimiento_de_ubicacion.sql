-- El trabajo sin persona lee los signos vitales habilitados y el consentimiento de ubicación.
--
-- Las dos preguntas las hace el backend en nombre de quien pide —el Asistente al cargar un turno
-- o al marcar su llegada, el Cliente al leer un reporte— y hasta acá las hacía con la llave
-- maestra. Pasan al trabajo de esa Prestadora, que ve sólo lo de la suya.
--
-- No van con la credencial de la persona porque los rangos generales de la Prestadora —los que
-- no son de ningún Paciente— no los alcanza ni el Asistente ni el Cliente, y con su credencial el
-- semáforo se quedaría sin rangos.

GRANT SELECT (id, prestadora_id, paciente_id, vigente) ON public.autorizaciones_monitoreo_paciente TO trabajo_sin_persona;

CREATE POLICY trabajo_sin_persona_lee_autorizaciones_monitoreo
  ON public.autorizaciones_monitoreo_paciente
  FOR SELECT
  TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

GRANT SELECT (prestadora_id, paciente_id, signo, valor_min, valor_max, unidad) ON public.rangos_referencia_vitales TO trabajo_sin_persona;

CREATE POLICY trabajo_sin_persona_lee_rangos_vitales
  ON public.rangos_referencia_vitales
  FOR SELECT
  TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

-- El consentimiento contesta sólo por los Asistentes de la Prestadora de quien pregunta. La
-- condición de vigencia no cambia.
CREATE OR REPLACE FUNCTION public.consentimiento_seguimiento_vigente(p_asistente_id uuid, p_clave text DEFAULT 'seguimiento_ubicacion'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM consentimientos_asistente c
    JOIN textos_consentimiento tx ON tx.id = c.texto_consentimiento_id
    WHERE c.asistente_id = p_asistente_id
      AND c.clave = p_clave
      AND c.retirado_at IS NULL
      AND c.decision = 'otorgado'
      AND tx.es_borrador = FALSE
      AND tx.vigente_hasta IS NULL
      AND interno.le_corresponde(c.prestadora_id)
  );
$function$;

GRANT EXECUTE ON FUNCTION public.consentimiento_seguimiento_vigente(uuid, text) TO trabajo_sin_persona;

NOTIFY pgrst, 'reload schema';
