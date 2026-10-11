-- El botón que activa una cuenta dice «Activar la cuenta», sin posesivo. Sólo la fila común a
-- todas las Prestadoras: la que una Prestadora haya escrito con texto propio es suya y no se toca.

begin;

update public.mensajes_del_sistema
   set i18n = i18n || jsonb_build_object(
         'es-AR', 'Activar la cuenta',
         'en', 'Activate the account',
         'pt-BR', 'Ativar a conta'
       )
 where clave = 'activacion_cuenta.boton'
   and prestadora_id is null;

commit;

NOTIFY pgrst, 'reload schema';
