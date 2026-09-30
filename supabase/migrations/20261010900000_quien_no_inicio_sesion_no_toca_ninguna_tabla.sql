-- Quien no inició sesión no toca ninguna tabla.
--
-- El rol `anon` es el de cualquiera que tenga la clave pública, que viaja adentro de cada pantalla y
-- no es secreta. Tenía todos los permisos —leer, escribir, borrar, vaciar— sobre casi todas las
-- tablas del esquema publicado, porque así los reparte Supabase por defecto a cada tabla nueva.
--
-- Hasta hoy no se filtraba nada porque todas las tablas tienen protección por fila y ninguna
-- política le deja ver una fila a quien no tiene sesión. Pero entonces lo único que cerraba la
-- puerta era que nadie escribiera una política de más. Mínimo privilegio (`celtatech/CLAUDE.md` §5):
-- el rol que no necesita un permiso no lo tiene.
--
-- Nadie lo necesita: las pantallas consultan la base con la sesión de la persona (`authenticated`),
-- las puertas públicas pasan por el backend con la credencial del trabajo sin persona, y ninguna
-- política nombra a `anon`.
--
-- Y para que no vuelva: las tablas, vistas y secuencias que se creen de acá en adelante tampoco
-- nacen con permisos para `anon`.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

NOTIFY pgrst, 'reload schema';
