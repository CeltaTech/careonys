-- La base pide el acceso de la persona autorizada en dos tablas que no lo pedían.
-- ============================================================================
--
-- Las calificaciones pedían el acceso para calificar sólo al escribir una nueva: para leerlas y
-- para borrarlas alcanzaba con ser del Cliente, así que una persona autorizada a la que el titular
-- no le dio ese acceso podía borrar lo que el titular calificó.
--
-- Las correcciones de una factura no pedían el acceso al dinero, que sí piden la factura, sus
-- renglones y sus cobros: la corrección dice el importe nuevo y el motivo.

DROP POLICY IF EXISTS cliente_gestiona_sus_calificaciones ON public.calificaciones_asistente;
CREATE POLICY cliente_gestiona_sus_calificaciones ON public.calificaciones_asistente
  FOR ALL
  USING (
    cliente_id = interno.cliente_id_de_usuario(auth.uid())
    AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_califica_al_asistente')
  )
  WITH CHECK (
    cliente_id = interno.cliente_id_de_usuario(auth.uid())
    AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_califica_al_asistente')
  );

DROP POLICY IF EXISTS cliente_ve_sus_correcciones ON public.correcciones_factura_cliente;
CREATE POLICY cliente_ve_sus_correcciones ON public.correcciones_factura_cliente
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.facturas_cliente f
       WHERE f.id = correcciones_factura_cliente.factura_id
         AND f.cliente_id = interno.cliente_id_de_usuario(auth.uid())
    )
    AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_dinero')
  );

NOTIFY pgrst, 'reload schema';
