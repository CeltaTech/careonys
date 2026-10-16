-- El trabajo sin persona lee el consentimiento de la medicación de su Prestadora.
--
-- Cuando el Cliente carga una medicación, el backend pregunta si la Prestadora pide la firma y arma
-- el texto que se acepta. Lo hace con el trabajo de esa Prestadora, que hasta ahora no podía leer
-- ninguna de las dos tablas. Se le dan exactamente las columnas que lee, sólo de su Prestadora.

GRANT SELECT (prestadora_id, pide_firma_del_cliente)
  ON public.configuracion_medicacion TO trabajo_sin_persona;
CREATE POLICY trabajo_sin_persona_lee_si_pide_la_firma ON public.configuracion_medicacion
  FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

GRANT SELECT (prestadora_id, idioma, cuerpo, updated_at)
  ON public.textos_consentimiento_medicacion TO trabajo_sin_persona;
CREATE POLICY trabajo_sin_persona_lee_el_texto_de_la_medicacion ON public.textos_consentimiento_medicacion
  FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

NOTIFY pgrst, 'reload schema';
