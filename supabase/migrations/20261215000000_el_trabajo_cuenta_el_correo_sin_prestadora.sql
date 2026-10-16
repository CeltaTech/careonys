-- El trabajo sin persona cuenta el correo que sale sin Prestadora.
--
-- Cada correo que acepta el despachante se anota en `envios_de_correo`, para que el tope mensual se
-- vea venir. El que sale de una Prestadora ya se anotaba con el trabajo de ella. El que sale sin
-- ninguna se anotaba con la llave maestra. Se le deja al trabajo que todavía no tiene Prestadora
-- agregar exactamente eso: una fila sin Prestadora, y nada más. No puede leerla, ni cambiarla, ni
-- anotar una a nombre de ninguna Prestadora.

CREATE POLICY trabajo_sin_persona_cuenta_el_correo_sin_prestadora ON public.envios_de_correo
  FOR INSERT TO trabajo_sin_persona
  WITH CHECK (prestadora_id IS NULL AND interno.prestadora_actual() IS NULL);

NOTIFY pgrst, 'reload schema';
