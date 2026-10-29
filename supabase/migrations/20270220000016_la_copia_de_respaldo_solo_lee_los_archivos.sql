-- La copia de respaldo sólo lee los archivos.
--
-- La copia de los archivos de cada noche entraba con la llave maestra, que alcanza todo: la base,
-- las cuentas y los archivos, para leer, escribir y borrar. Ahora entra con un rol propio que puede
-- hacer una sola cosa: ver qué depósitos hay y leer lo que tienen adentro. No toca ninguna tabla
-- del producto, no escribe y no borra.
--
-- Alcanza a todas las Prestadoras porque su trabajo es copiar todo. La credencial la firma el
-- backend en el momento, vive diez minutos y no se guarda en ningún lado.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'copia_de_respaldo') THEN
    CREATE ROLE copia_de_respaldo NOLOGIN NOINHERIT;
  END IF;
END $$;
-- PostgREST y el almacenamiento entran como `authenticator` y cambian al rol que dice la
-- credencial: `authenticator` tiene que poder asumirlo.
GRANT copia_de_respaldo TO authenticator;

GRANT USAGE ON SCHEMA storage TO copia_de_respaldo;
GRANT SELECT ON storage.buckets, storage.objects TO copia_de_respaldo;

CREATE POLICY copia_de_respaldo_ve_los_depositos ON storage.buckets
  FOR SELECT TO copia_de_respaldo USING (true);
CREATE POLICY copia_de_respaldo_lee_los_archivos ON storage.objects
  FOR SELECT TO copia_de_respaldo USING (true);

NOTIFY pgrst, 'reload schema';
