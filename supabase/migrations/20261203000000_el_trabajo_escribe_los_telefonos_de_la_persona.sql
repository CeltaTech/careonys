-- El trabajo sin persona carga, corrige y borra los teléfonos de las Fichas de su Prestadora.
--
-- El Panel escribe los teléfonos de una Ficha con el permiso de editar el Directorio de Personas,
-- y la base, para dejar escribir, pide además el de verlo: son dos permisos que cada Prestadora
-- configura por separado. La ruta comprueba el de editar y escribe con la credencial del trabajo
-- de la Prestadora activa. Del teléfono preferido, mira los de las cuentas de esa Prestadora, que
-- el trabajo ya puede leer.
--
-- De la Ficha, el trabajo sólo lee de quién es y de qué Prestadora: es lo único que la ruta mira
-- antes de escribir.

GRANT SELECT (id, prestadora_id) ON public.personas TO trabajo_sin_persona;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telefonos_de_la_persona TO trabajo_sin_persona;

CREATE POLICY telefonos_de_la_persona_los_escribe_el_trabajo
  ON public.telefonos_de_la_persona
  FOR ALL
  TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual())
  WITH CHECK (prestadora_id = interno.prestadora_actual());

NOTIFY pgrst, 'reload schema';
