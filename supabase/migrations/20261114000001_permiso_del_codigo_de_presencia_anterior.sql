-- El disparador que guarda el código de presencia anterior corre con el rol de quien escribe.
-- Recibe el mismo permiso que los demás disparadores de `interno`, para que la tabla se pueda
-- escribir también con la credencial de una persona y con la del trabajo sin persona.
BEGIN;

GRANT EXECUTE ON FUNCTION interno.guardar_codigo_de_presencia_anterior() TO authenticated, trabajo_sin_persona;

COMMIT;

NOTIFY pgrst, 'reload schema';
