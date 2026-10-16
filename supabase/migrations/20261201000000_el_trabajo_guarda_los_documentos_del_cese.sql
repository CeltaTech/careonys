-- El trabajo sin persona guarda y abre los documentos de los ceses de su Prestadora.
--
-- El Panel sube el PDF de la liquidación final, del telegrama o de la notificación de fin de
-- período de prueba, anota en el cese que quedó guardado y lo vuelve a abrir con un enlace
-- temporal. Lo hace también quien coordina, y la base deja ver los ceses y su depósito sólo a la
-- administración; la ruta lo hace con la credencial del trabajo de la Prestadora activa.
--
-- Del cese, leer y anotar: no da de alta ni borra ninguno. Del depósito, sólo la carpeta de un cese
-- de esa Prestadora. Y reemplazar el archivo, porque volver a generar un documento del mismo tipo
-- lo pisa: el depósito lo hace escribiendo encima del que había, así que el permiso de cambiar un
-- archivo hace falta además del de subirlo, y la regla lo acota igual a esa carpeta.

GRANT SELECT, UPDATE ON public.ceses TO trabajo_sin_persona;

CREATE POLICY ceses_los_lee_y_anota_el_trabajo
  ON public.ceses
  FOR ALL
  TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual())
  WITH CHECK (prestadora_id = interno.prestadora_actual());

GRANT UPDATE ON storage.objects TO trabajo_sin_persona;

CREATE POLICY documentos_cese_los_alcanza_el_trabajo
  ON storage.objects
  FOR ALL
  TO trabajo_sin_persona
  USING (
    bucket_id = 'documentos-cese'
    AND (storage.foldername(name))[1] = (interno.prestadora_actual())::text
    AND EXISTS (
      SELECT 1 FROM public.ceses c
      WHERE (c.id)::text = (storage.foldername(objects.name))[2]
        AND c.prestadora_id = interno.prestadora_actual()
    )
  )
  WITH CHECK (
    bucket_id = 'documentos-cese'
    AND (storage.foldername(name))[1] = (interno.prestadora_actual())::text
    AND EXISTS (
      SELECT 1 FROM public.ceses c
      WHERE (c.id)::text = (storage.foldername(objects.name))[2]
        AND c.prestadora_id = interno.prestadora_actual()
    )
  );

NOTIFY pgrst, 'reload schema';
