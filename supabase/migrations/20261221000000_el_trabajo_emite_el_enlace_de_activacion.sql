-- El trabajo sin persona emite el enlace de activación de una cuenta de su Prestadora.
--
-- Lo hace el backend al dar de alta una cuenta y al reenviar la invitación. La política que ya
-- tiene la tabla acota la fila a las cuentas de esa Prestadora; faltaba sólo poder escribirla.
--
-- Se le dan las tres columnas que se escriben, y nada de borrar.

GRANT INSERT (usuario_id, token, expira_en) ON public.tokens_activacion_cuenta TO trabajo_sin_persona;

NOTIFY pgrst, 'reload schema';
