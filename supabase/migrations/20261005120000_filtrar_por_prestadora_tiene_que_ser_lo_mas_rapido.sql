-- Filtrar por Prestadora tiene que ser lo más rápido, no lo más lento.
--
-- Toda consulta del producto nombra la Prestadora: es la regla del cajón cerrado. Pero mirar una
-- columna que no está indexada obliga a la base a recorrer la tabla entera, así que la regla que
-- debería acelerar terminaría frenando.
--
-- De las tablas que tienen columna `prestadora_id`, muchas no tienen ningún índice que la
-- encabece. Esta migración les crea uno a todas las que falten, antes de que las consultas empiecen
-- a usarlo.
--
-- No lleva la lista escrita a mano: la lee del catálogo de la base. Una lista escrita envejece en
-- silencio, y las tablas que vengan después quedarían afuera sin que nadie se entere.
--
-- Qué cuenta como cubierta: que exista un índice —propio, de clave única o de clave primaria— cuya
-- PRIMERA columna sea `prestadora_id`. Un índice que la lleva en segundo lugar no sirve para
-- filtrar sólo por ella.

DO $$
DECLARE
  t record;
  nombre_indice text;
BEGIN
  FOR t IN
    SELECT c.oid, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'prestadora_id' AND a.attnum > 0
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_index i
        JOIN pg_attribute ia ON ia.attrelid = c.oid AND ia.attnum = i.indkey[0]
        WHERE i.indrelid = c.oid
          AND ia.attname = 'prestadora_id'
      )
  LOOP
    nombre_indice := 'idx_' || t.relname || '_prestadora_id';
    -- El nombre de un índice no puede pasar de 63 caracteres.
    nombre_indice := left(nombre_indice, 63);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (prestadora_id)',
      nombre_indice,
      t.relname
    );
  END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';
