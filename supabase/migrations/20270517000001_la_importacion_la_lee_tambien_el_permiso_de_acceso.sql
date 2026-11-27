-- Lo que trae la importación también lo lee quien entra con un permiso de acceso de CeltaTech.
--
-- Las tablas y los depósitos anteriores ya dejan leer con ese permiso, siempre dentro de la
-- Prestadora que el permiso abrió. Esto aplica la misma regla a las tres tablas nuevas y a los
-- dos depósitos nuevos de la importación. La historia anterior del Paciente sigue además bajo
-- las dos reglas de la información de salud.
--
-- Corre entera o no corre.

BEGIN;

ALTER POLICY panel_lee_historia_anterior_del_paciente
  ON public.historia_anterior_del_paciente
  USING (
    prestadora_id = interno.prestadora_actual()
    AND (interno.es_superadmin() OR interno.es_admin_prestadora()
         OR interno.coordinador_ve_al_paciente(paciente_id))
  );

ALTER POLICY panel_lee_antecedentes_del_legajo
  ON public.antecedentes_del_legajo
  USING (
    prestadora_id = interno.prestadora_actual()
    AND (
      interno.es_superadmin()
      OR interno.es_admin_prestadora()
      OR (interno.coordinador_alcanza_asistente(asistente_id)
          AND (clase <> 'columna_sin_lugar' OR interno.tiene_permiso('ver_datos_reservados_asistente')))
    )
  );

ALTER POLICY panel_lee_antecedentes_del_cliente
  ON public.antecedentes_del_cliente
  USING (
    prestadora_id = interno.prestadora_actual()
    AND (interno.es_superadmin() OR interno.es_admin_prestadora()
         OR interno.tiene_permiso('ver_facturacion_cliente'))
  );

ALTER POLICY originales_importacion_los_lee_el_administrador
  ON storage.objects
  USING (
    bucket_id = 'originales-importacion'
    AND (storage.foldername(name))[1] = interno.prestadora_actual()::text
    AND (interno.es_admin_prestadora() OR interno.es_superadmin())
  );

ALTER POLICY historia_anterior_la_lee_quien_atiende
  ON storage.objects
  USING (
    bucket_id = 'historia-anterior-pacientes'
    AND (storage.foldername(name))[1] = interno.prestadora_actual()::text
    AND EXISTS (
      SELECT 1 FROM public.pacientes p
       WHERE p.id::text = (storage.foldername(objects.name))[2]
         AND p.prestadora_id = interno.prestadora_actual()
         AND interno.alcanza_la_informacion_de_salud(p.id)
         AND (interno.es_admin_prestadora() OR interno.es_superadmin()
              OR interno.coordinador_ve_al_paciente(p.id))
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
