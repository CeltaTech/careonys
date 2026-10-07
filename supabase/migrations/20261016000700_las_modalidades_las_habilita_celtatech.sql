-- Las modalidades de una Prestadora las habilita CeltaTech. La Prestadora no las enciende ni las
-- apaga: el Panel sólo las lee para saber qué secciones mostrar.
--
-- Hasta acá cualquier administrador de la Prestadora podía escribir en esta tabla, por la
-- política de escritura y por los permisos de tabla. Se quitan las dos cosas y queda sólo la
-- lectura. Quien escribe, mientras CeltaTech no tenga su canal, es la llave maestra.

BEGIN;

DROP POLICY IF EXISTS admin_prestadora_gestiona_sus_modalidades ON public.prestadora_modalidades;

REVOKE INSERT, UPDATE, DELETE ON public.prestadora_modalidades FROM authenticated, anon, PUBLIC;

NOTIFY pgrst, 'reload schema';

COMMIT;
