-- El correo que activa la cuenta de un Cliente o de un Asistente dice el Código de Prestadora: es lo
-- primero que pide la pantalla de ingreso de las aplicaciones, y quien entra por primera vez no lo
-- tiene en ningún otro lado. Lo arma `backend/src/i18n/avisos.js`.

insert into public.mensajes_del_sistema (clave, i18n)
values ('activacion_cuenta.codigo_prestadora', '{"es-AR": "Código de Prestadora: {{codigo}}", "en": "Provider Code: {{codigo}}", "pt-BR": "Código da Prestadora: {{codigo}}"}'::jsonb);

NOTIFY pgrst, 'reload schema';
