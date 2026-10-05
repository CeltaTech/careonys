-- La entrada de pedidos de servicio desde un sitio público salió del producto: el sitio no existe
-- y ninguna página la llamaba. Se fue al estante de código útil de CeltaTech
-- (Codigos-utiles/aviso-de-pedido-de-servicio), con estos dos textos copiados tal como estaban.
-- Sin la entrada, el aviso no lo emite nadie y sus textos quedan sueltos.

begin;

delete from public.mensajes_del_sistema
where clave in ('nueva_solicitud_servicio.asunto', 'nueva_solicitud_servicio.texto');

delete from public.configuracion_notificaciones
where evento = 'nueva_solicitud_servicio';

commit;

notify pgrst, 'reload schema';
