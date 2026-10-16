-- La lista de cuentas del Panel deja la llave maestra y se lee con la credencial de quien la pide.
--
-- Hasta acá cada persona veía en `usuarios` su propia fila y nada más, así que la lista la leía el
-- backend con la llave que alcanza todas las Prestadoras y la recortaba a mano. Con esta regla la
-- administración de la Prestadora activa ve las cuentas del Panel de esa Prestadora —la del
-- Administrador y las de coordinación— y la base hace el recorte.
--
-- Las cuentas del soporte técnico de CeltaTech quedan afuera aunque tengan una Prestadora anotada:
-- son de CeltaTech, y la Prestadora no las ve ni sabe que existen.
--
-- `es_la_administracion_de_la_prestadora` ya vive en `interno`, conserva `authenticated` y es la
-- que usan las demás tablas para la misma pregunta.

CREATE POLICY la_administracion_ve_las_cuentas_del_panel_de_su_prestadora
  ON public.usuarios
  FOR SELECT
  TO authenticated
  USING (
    rol IN ('admin_prestadora', 'coordinador')
    AND interno.es_la_administracion_de_la_prestadora(prestadora_id)
  );

NOTIFY pgrst, 'reload schema';
