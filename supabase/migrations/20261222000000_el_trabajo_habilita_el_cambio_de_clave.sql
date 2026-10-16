-- El trabajo sin persona anota el cambio de clave habilitado y el teléfono confirmado.
--
-- Lo hace el backend cuando la administración de la Prestadora habilita a una cuenta desde el
-- Panel. La política que ya tienen las dos tablas acota la fila a esa Prestadora, y el disparador
-- que ya tienen comprueba quién habilita a quién; faltaba sólo poder escribirlas.
--
-- Se le dan las columnas que se escriben. Del teléfono confirmado también las de actualizar,
-- porque confirmar dos veces el mismo número renueva la fila en vez de duplicarla. Nada de borrar.

GRANT INSERT (prestadora_id, usuario_id, habilitado_por, expira_en)
  ON public.cambios_de_clave_habilitados TO trabajo_sin_persona;

GRANT INSERT (prestadora_id, usuario_id, confirmado_por, telefono_verificador),
      UPDATE (prestadora_id, usuario_id, confirmado_por, telefono_verificador)
  ON public.telefonos_confirmados_por_la_prestadora TO trabajo_sin_persona;

NOTIFY pgrst, 'reload schema';
