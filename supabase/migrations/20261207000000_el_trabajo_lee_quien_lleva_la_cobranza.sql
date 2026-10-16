-- El trabajo sin persona lee quién lleva la cobranza de su Prestadora.
--
-- Antes de entregar cualquier número calculado, el backend pregunta si el seguimiento de la
-- cobranza lo lleva este sistema u otro software. Lo pregunta en nombre de quien pide —el Cliente
-- desde su aplicación, o quien trabaja en el Panel—, y ninguno de los dos puede leer esa
-- configuración, que es de la administración. Si la leyera con la credencial de quien pide, la
-- base le contestaría «nada configurado» y el backend entregaría justo el número que no había que
-- entregar. Por eso la lee el trabajo de esa Prestadora, y sólo la regla: los secretos de los
-- avisos quedan afuera.

GRANT SELECT (prestadora_id, regla) ON public.configuracion_facturacion_clientes TO trabajo_sin_persona;

CREATE POLICY trabajo_sin_persona_lee_quien_lleva_la_cobranza
  ON public.configuracion_facturacion_clientes
  FOR SELECT
  TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

NOTIFY pgrst, 'reload schema';
