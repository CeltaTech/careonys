-- El trabajo sin persona anota en la factura el comprobante que emitió el software de facturación.
--
-- Ya podía escribir la factura de su Prestadora, pero el disparador que recalcula el estado de la
-- factura en cada cambio corre con el rol de quien escribe, y ese rol no podía ejecutar las
-- funciones que suman lo cobrado y lo corregido ni leer esas dos tablas. Se le da exactamente eso:
-- las cuatro funciones, que corren con los permisos de quien llama, y las columnas que leen, sólo
-- de su Prestadora.

GRANT EXECUTE ON FUNCTION public.resumen_cobros_de_factura(uuid),
                          public.correcciones_de_factura(uuid),
                          public.monto_a_cobrar_de_factura(numeric, numeric, uuid),
                          public.estado_de_factura(numeric, numeric, date)
  TO trabajo_sin_persona;

GRANT SELECT (prestadora_id, factura_id, monto, fecha_cobro, origen, estado)
  ON public.cobros_cliente TO trabajo_sin_persona;
CREATE POLICY trabajo_sin_persona_suma_lo_cobrado ON public.cobros_cliente
  FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

GRANT SELECT (prestadora_id, factura_id, sentido, monto)
  ON public.correcciones_factura_cliente TO trabajo_sin_persona;
CREATE POLICY trabajo_sin_persona_suma_lo_corregido ON public.correcciones_factura_cliente
  FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

NOTIFY pgrst, 'reload schema';
