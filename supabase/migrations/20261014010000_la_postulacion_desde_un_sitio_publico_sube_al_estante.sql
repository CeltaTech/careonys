-- La entrada de postulaciones desde un sitio público salió del producto: el sitio no existe y
-- ninguna página la llamaba. Se fue al estante de código útil de CeltaTech
-- (Codigos-utiles/postulacion-desde-un-sitio-publico), con estos dos textos copiados tal como
-- estaban. Sin la entrada, el aviso no lo emite nadie y sus textos quedan sueltos.

begin;

delete from public.mensajes_del_sistema
where clave in ('nueva_postulacion_asistente.asunto', 'nueva_postulacion_asistente.texto');

delete from public.configuracion_notificaciones
where evento = 'nueva_postulacion_asistente';

commit;

notify pgrst, 'reload schema';
