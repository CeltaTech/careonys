-- El informe a la obra social guarda al Cliente con la clave nueva.
--
-- El contenido de cada informe es una foto de los datos del Paciente al generarlo, y el código
-- lo vuelve a leer por la clave `cliente_id`. Los informes generados antes del renombre la
-- guardaban con la clave retirada: se pasa a la nueva, sin tocar el valor.
--
-- Los nombres cargados por quien pidió el servicio también pasan a nombrar al Cliente, igual
-- que los de las cuentas.

begin;

update public.informes_obra_social
   set contenido = (contenido - 'cliente_id') || jsonb_build_object('cliente_id', contenido->'cliente_id')
 where contenido ? 'cliente_id';

update public.solicitudes
   set nombre = replace(nombre, 'Cliente', 'Cliente')
 where nombre ~ 'Cliente(?!r)';

commit;

notify pgrst, 'reload schema';
