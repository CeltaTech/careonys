-- Los cobros y las ausencias del Panel dejan la llave maestra. Tres cosas que hace el Panel no las
-- puede hacer quien coordina con su propio acceso, y el backend las hace con el trabajo de la
-- Prestadora, acotado a ella por las políticas de abajo:
--
-- * leer qué Clientes quedaron restringidos por la cobranza, que la base le abre sólo a la
--   administración y quien coordina necesita para trabajar;
-- * anotar la corrección de una factura, que `authenticated` no puede dar de alta;
-- * anotar la asignación del sustituto de una ausencia.
--
-- Sólo las columnas que ese camino lee y escribe.

GRANT SELECT (id, prestadora_id, cliente_id, restringida, motivo, origen, created_at)
  ON public.restricciones_de_cobranza TO trabajo_sin_persona;

-- La corrección se devuelve entera a la pantalla que la anotó.
GRANT SELECT (id, prestadora_id, factura_id, sentido, monto, comprobante_tipo, comprobante_numero,
              motivo, fecha, registrada_por, created_at, moneda),
      INSERT (prestadora_id, factura_id, sentido, monto, comprobante_tipo, comprobante_numero, motivo,
              fecha, registrada_por)
  ON public.correcciones_factura_cliente TO trabajo_sin_persona;
CREATE POLICY trabajo_sin_persona_corrige_en_esta_prestadora ON public.correcciones_factura_cliente
  FOR INSERT TO trabajo_sin_persona
  WITH CHECK (prestadora_id = interno.prestadora_actual());

GRANT INSERT (prestadora_id, ausencia_id, asistente_id, asignado_por)
  ON public.asignaciones_de_turno TO trabajo_sin_persona;
CREATE POLICY trabajo_sin_persona_asigna_en_esta_prestadora ON public.asignaciones_de_turno
  FOR INSERT TO trabajo_sin_persona
  WITH CHECK (prestadora_id = interno.prestadora_actual());

NOTIFY pgrst, 'reload schema';
