-- La tabla de archivos de Contenidos nació con más permisos de los que pidió su migración: los
-- permisos por defecto del esquema `public` le dan a `authenticated` todo, y el GRANT de la
-- migración anterior sólo sumó. Un archivo se sube, se lee y se borra; nunca se modifica.
BEGIN;

REVOKE UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.contenidos_archivos FROM authenticated;
REVOKE ALL ON public.contenidos_archivos FROM anon;

COMMIT;

NOTIFY pgrst, 'reload schema';
