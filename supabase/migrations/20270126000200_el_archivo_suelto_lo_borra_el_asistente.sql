-- El archivo suelto de un documento lo puede borrar el Asistente que lo subió.
--
-- El Asistente manda el documento en un solo envío: el backend sube el archivo a la carpeta de su
-- Legajo y después anota la fila. Si la fila no se anota, el archivo queda en el depósito sin
-- nadie que lo mire, y hasta ahora el Asistente no tenía permiso para sacarlo. Esta política se lo
-- da sólo para eso: un archivo de su propia carpeta que ninguna fila nombra. Un archivo que ya
-- tiene su documento no lo puede borrar.
--
-- Y las dos políticas del depósito que todavía decían «papeles» pasan a decir «documentos». Se
-- borran y se crean de nuevo, iguales, porque cambiarles el nombre exige ser dueño de la tabla del
-- depósito, y la tabla es de Supabase.

DROP POLICY papeles_del_legajo_los_gestiona_quien_administra ON storage.objects;
DROP POLICY papeles_del_legajo_los_lee_quien_coordina ON storage.objects;

CREATE POLICY documentos_del_legajo_los_gestiona_quien_administra ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'documentos-asistente'
    AND (storage.foldername(name))[1] = (interno.prestadora_actual())::text
    AND (interno.es_admin_prestadora() OR interno.es_superadmin())
  )
  WITH CHECK (
    bucket_id = 'documentos-asistente'
    AND (storage.foldername(name))[1] = (interno.prestadora_actual())::text
    AND (interno.es_admin_prestadora() OR interno.es_superadmin())
  );

CREATE POLICY documentos_del_legajo_los_lee_quien_coordina ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documentos-asistente'
    AND (storage.foldername(name))[1] = (interno.prestadora_actual())::text
    AND EXISTS (
      SELECT 1 FROM public.asistentes a
      WHERE a.id::text = (storage.foldername(objects.name))[2]
        AND interno.coordinador_alcanza_asistente(a.id)
    )
  );

CREATE POLICY documentos_del_legajo_el_asistente_borra_el_suelto ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'documentos-asistente'
    AND (storage.foldername(name))[1] = (interno.prestadora_actual())::text
    AND (storage.foldername(name))[2] = (interno.asistente_de_la_sesion())::text
    AND NOT EXISTS (
      SELECT 1 FROM public.documentos_asistente d WHERE d.ruta_archivo = objects.name
    )
  );

NOTIFY pgrst, 'reload schema';
