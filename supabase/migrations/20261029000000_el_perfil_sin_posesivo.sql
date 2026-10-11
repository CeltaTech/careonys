-- La sección de las aplicaciones se llama «Perfil», sin posesivo. Los borradores del
-- consentimiento de ubicación la nombraban «Mi Perfil». Sólo borradores: un texto que alguien ya
-- firmó no se edita.

begin;

update public.textos_consentimiento
   set puntos_clave = array(
         select replace(punto, 'desde Mi Perfil', 'desde Perfil')
           from unnest(puntos_clave) with ordinality as p(punto, orden)
          order by orden
       ),
       updated_at = now()
 where es_borrador
   and array_to_string(puntos_clave, ' ') like '%desde Mi Perfil%';

commit;

NOTIFY pgrst, 'reload schema';
