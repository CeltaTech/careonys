-- El logo de la Prestadora lo cambia quien la administra.
--
-- `marca-prestadoras` es el único depósito público: lo que se sube ahí lo puede ver cualquiera
-- que tenga la dirección. Subir, reemplazar y borrar pedían sólo que la ruta empezara por la
-- Prestadora de quien pide, sin mirar el rol y para cualquier rol de la base. Con eso, cualquier
-- persona de la Prestadora —un Cliente o un Asistente incluidos— y también el trabajo sin
-- persona podían dejar un archivo a la vista del público bajo el nombre de su Prestadora.
--
-- Pasan a pedir, además, la administración de esa Prestadora, y sólo con sesión de una persona.
-- La lectura pública queda como está.

DROP POLICY IF EXISTS marca_prestadoras_sube_su_propio_logo ON storage.objects;
CREATE POLICY marca_prestadoras_sube_su_propio_logo ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'marca-prestadoras'
    AND (storage.foldername(name))[1] = interno.current_tenant()::text
    AND (interno.es_admin_prestadora() OR interno.es_superadmin())
  );

DROP POLICY IF EXISTS marca_prestadoras_reemplaza_su_propio_logo ON storage.objects;
CREATE POLICY marca_prestadoras_reemplaza_su_propio_logo ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'marca-prestadoras'
    AND (storage.foldername(name))[1] = interno.current_tenant()::text
    AND (interno.es_admin_prestadora() OR interno.es_superadmin())
  )
  WITH CHECK (
    bucket_id = 'marca-prestadoras'
    AND (storage.foldername(name))[1] = interno.current_tenant()::text
    AND (interno.es_admin_prestadora() OR interno.es_superadmin())
  );

DROP POLICY IF EXISTS marca_prestadoras_borra_su_propio_logo ON storage.objects;
CREATE POLICY marca_prestadoras_borra_su_propio_logo ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'marca-prestadoras'
    AND (storage.foldername(name))[1] = interno.current_tenant()::text
    AND (interno.es_admin_prestadora() OR interno.es_superadmin())
  );

NOTIFY pgrst, 'reload schema';
