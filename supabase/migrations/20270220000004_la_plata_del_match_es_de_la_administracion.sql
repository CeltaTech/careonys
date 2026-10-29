-- La plata del Match, cerrada al Coordinador también en la base.
-- ============================================================================
--
-- Las rutas del Panel que muestran y cargan cobros del Match ya son sólo de la administración
-- (backend/src/routes/panelIntermediacion.js, `soloAdministracion`), y leen con el trabajo de la
-- Prestadora. Pero la base le seguía abriendo al Coordinador los cobros, los QR de cobro en
-- efectivo, la carga de un cobro en efectivo y los plazos de cobro. Nadie los usa por ese lado, y
-- un permiso que nadie usa es una puerta: se cierra.

DROP POLICY IF EXISTS prestadora_ve_cobros_intermediacion ON public.cobros_intermediacion;
CREATE POLICY prestadora_ve_cobros_intermediacion ON public.cobros_intermediacion
  FOR SELECT TO public
  USING (
    prestadora_id = interno.prestadora_actual()
    AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin_prestadora')
  );

DROP POLICY IF EXISTS panel_registra_cobro_efectivo_manual ON public.cobros_intermediacion;
CREATE POLICY panel_registra_cobro_efectivo_manual ON public.cobros_intermediacion
  FOR INSERT TO public
  WITH CHECK (
    medio = 'efectivo_manual'
    AND registrado_por = auth.uid()
    AND prestadora_id = interno.prestadora_actual()
    AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin_prestadora')
  );

DROP POLICY IF EXISTS prestadora_ve_qr_cobro ON public.qr_cobro_efectivo;
CREATE POLICY prestadora_ve_qr_cobro ON public.qr_cobro_efectivo
  FOR SELECT TO public
  USING (
    EXISTS (SELECT 1 FROM accesos_intermediacion s
             WHERE s.id = qr_cobro_efectivo.acceso_id
               AND s.prestadora_id = interno.prestadora_actual()
               AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin_prestadora'))
  );

-- Los plazos de cobro los lee y los escribe la administración, con su propia política.
DROP POLICY IF EXISTS coordinador_lee_cobro_intermediacion ON public.configuracion_cobro_intermediacion;

NOTIFY pgrst, 'reload schema';
