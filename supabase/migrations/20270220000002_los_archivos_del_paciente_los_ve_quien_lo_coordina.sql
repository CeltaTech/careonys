-- Las prescripciones y las autorizaciones de monitoreo, recortadas a los Pacientes que cada
-- Coordinador ve.
-- ============================================================================
--
-- Las tablas ya recortan al Coordinador a sus Servicios (20270219000000), pero los archivos de dos
-- depósitos se leían con `es_personal_de_la_prestadora()`, que alcanza a cualquier Coordinador de
-- la Prestadora. Las rutas nombran al Paciente:
--
--   prescripciones-medicacion   <prestadora>/<paciente>/…
--                               <prestadora>/firmas-medicacion/<paciente>/firma-<consentimiento>.…
--   autorizaciones-monitoreo    <prestadora>/<paciente>/autorizacion-….…
--
-- Ahora el Administrador sigue alcanzando todo, y el Coordinador sólo los archivos de un Paciente
-- que ve (`coordinador_ve_al_paciente`). Vale para leer y para subir, reemplazar o borrar el papel
-- firmado, que también alcanzaba a cualquier Coordinador.

-- El Paciente que nombra la ruta de un archivo, si es que nombra uno.
CREATE OR REPLACE FUNCTION interno.paciente_de_la_ruta(p_ruta text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, interno
AS $$
DECLARE
  v_carpetas text[] := string_to_array(p_ruta, '/');
  v_carpeta text;
BEGIN
  v_carpeta := CASE WHEN v_carpetas[2] = 'firmas-medicacion' THEN v_carpetas[3] ELSE v_carpetas[2] END;
  IF v_carpeta ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN v_carpeta::uuid;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION interno.paciente_de_la_ruta(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.paciente_de_la_ruta(text) TO authenticated;

-- Si quien consulta alcanza el archivo de un Paciente: el Administrador todos los de su Prestadora,
-- el Coordinador los de un Paciente que ve. Ante una ruta que no nombra Paciente, no.
CREATE OR REPLACE FUNCTION interno.alcanza_el_archivo_del_paciente(p_ruta text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, interno
AS $$
  SELECT interno.es_superadmin()
      OR interno.es_admin_prestadora()
      OR coalesce(interno.coordinador_ve_al_paciente(interno.paciente_de_la_ruta(p_ruta)), false);
$$;

REVOKE ALL ON FUNCTION interno.alcanza_el_archivo_del_paciente(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.alcanza_el_archivo_del_paciente(text) TO authenticated;

DROP POLICY IF EXISTS prescripciones_las_lee_el_personal ON storage.objects;
CREATE POLICY prescripciones_las_lee_el_personal ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'prescripciones-medicacion'
    AND (storage.foldername(name))[1] = interno.prestadora_actual()::text
    AND interno.alcanza_el_archivo_del_paciente(name)
  );

DROP POLICY IF EXISTS autorizaciones_monitoreo_las_lee_el_personal ON storage.objects;
CREATE POLICY autorizaciones_monitoreo_las_lee_el_personal ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'autorizaciones-monitoreo'
    AND (storage.foldername(name))[1] = interno.prestadora_actual()::text
    AND interno.alcanza_el_archivo_del_paciente(name)
  );

DROP POLICY IF EXISTS prescripciones_el_panel_sube_el_papel_firmado ON storage.objects;
CREATE POLICY prescripciones_el_panel_sube_el_papel_firmado ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'prescripciones-medicacion'
    AND (storage.foldername(name))[1] = interno.prestadora_actual()::text
    AND (storage.foldername(name))[2] = 'firmas-medicacion'
    AND interno.alcanza_el_archivo_del_paciente(name)
  );

DROP POLICY IF EXISTS prescripciones_el_panel_reemplaza_el_papel_sin_firma ON storage.objects;
CREATE POLICY prescripciones_el_panel_reemplaza_el_papel_sin_firma ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'prescripciones-medicacion'
    AND (storage.foldername(name))[1] = interno.prestadora_actual()::text
    AND (storage.foldername(name))[2] = 'firmas-medicacion'
    AND interno.alcanza_el_archivo_del_paciente(name)
    AND NOT interno.es_un_papel_firmado(name)
  )
  WITH CHECK (
    bucket_id = 'prescripciones-medicacion'
    AND (storage.foldername(name))[1] = interno.prestadora_actual()::text
    AND (storage.foldername(name))[2] = 'firmas-medicacion'
    AND interno.alcanza_el_archivo_del_paciente(name)
  );

DROP POLICY IF EXISTS prescripciones_el_panel_borra_el_papel_sin_firma ON storage.objects;
CREATE POLICY prescripciones_el_panel_borra_el_papel_sin_firma ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'prescripciones-medicacion'
    AND (storage.foldername(name))[1] = interno.prestadora_actual()::text
    AND (storage.foldername(name))[2] = 'firmas-medicacion'
    AND interno.alcanza_el_archivo_del_paciente(name)
    AND NOT interno.es_un_papel_firmado(name)
  );

NOTIFY pgrst, 'reload schema';
