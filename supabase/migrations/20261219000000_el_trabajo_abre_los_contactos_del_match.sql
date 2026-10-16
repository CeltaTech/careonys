-- El trabajo sin persona abre el contacto de un Asistente contra el saldo de un acceso del Match.
--
-- Lo hace el backend después de comprobar a qué Cliente le corresponde el acceso. La función toma
-- la fila del acceso, mira si ese contacto ya estaba abierto, lo anota y descuenta uno del saldo;
-- corre con los permisos de quien la llama, así que la protección por fila de cada tabla decide
-- qué alcanza. El acceso ya tiene la política del trabajo acotada a la Prestadora actual; a los
-- contactos abiertos les faltaba, y faltaba el permiso sobre la función y sobre las columnas.
--
-- Se le da sólo lo que se usa, y nada de borrar.

CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.contactos_vistos_intermediacion
  FOR ALL TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual())
  WITH CHECK (prestadora_id = interno.prestadora_actual());

GRANT SELECT (id, prestadora_id, cliente_id, asistente_id, acceso_id, created_at)
  ON public.contactos_vistos_intermediacion TO trabajo_sin_persona;
GRANT INSERT (prestadora_id, cliente_id, asistente_id, acceso_id)
  ON public.contactos_vistos_intermediacion TO trabajo_sin_persona;

GRANT EXECUTE ON FUNCTION public.consumir_contacto_intermediacion(uuid, uuid) TO trabajo_sin_persona;

NOTIFY pgrst, 'reload schema';
