-- Los paquetes de Prestaciones salen del producto.
--
-- Cobrar varias Prestaciones de un Paciente por un precio único es política comercial de cada
-- Prestadora y queda para la siguiente versión: cada Prestación se cobra por separado. El código y
-- el esquema de las dos tablas quedaron en el estante de CeltaTech,
-- `Codigos-utiles/paquetes-de-prestaciones/`. Las dos tablas estaban vacías.
--
-- Con cada tabla se van su protección por fila, sus índices, sus disparadores y la secuencia de su
-- identificador. Las funciones de los disparadores son compartidas con otras tablas y quedan.
-- Primero la de los renglones, que apunta a la de los paquetes.

BEGIN;

DROP TABLE public.paquete_prestacion_items;
DROP TABLE public.paquetes_prestaciones;

NOTIFY pgrst, 'reload schema';

COMMIT;
