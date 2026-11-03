-- El papel que sube el Cliente desde la aplicación entra al depósito con el trabajo de su
-- Prestadora, y recién después la base lo anota como autorización. Si la base no lo anota —ya había
-- una, el texto no existe—, el archivo quedó suelto y el backend lo borra con la misma credencial.
-- Sólo el que todavía no quedó en ninguna autorización: lo cargado no se borra nunca.

GRANT EXECUTE ON FUNCTION interno.es_una_autorizacion_cargada(text) TO trabajo_sin_persona;

CREATE POLICY autorizaciones_monitoreo_el_trabajo_borra_el_papel_sin_cargar
  ON storage.objects FOR DELETE TO trabajo_sin_persona
  USING (
    bucket_id = 'autorizaciones-monitoreo'
    AND (storage.foldername(name))[1] = (interno.prestadora_actual())::text
    AND NOT interno.es_una_autorizacion_cargada(name)
  );

NOTIFY pgrst, 'reload schema';
