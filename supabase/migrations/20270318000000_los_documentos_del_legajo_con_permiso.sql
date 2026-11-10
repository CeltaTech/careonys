-- Permisos de Coordinadores: los documentos del Legajo del Asistente pasan a tener permiso propio.
--
-- · «Ver los documentos de los Asistentes»: abrir el archivo de cada documento. El estado y el
--   vencimiento de cada uno los sigue leyendo quien coordina, porque de ahí salen los avisos de
--   documentos pendientes al asignar una guardia; lo que se cierra es el archivo.
-- · «Cargar documentos de los Asistentes»: subir uno nuevo. Lo que sube quien coordina entra en
--   revisión, igual que lo que sube el Asistente desde su aplicación: aprobarlo sigue siendo de la
--   administración.
--
-- Los dos nacen reservados a la administración, que es lo que había hasta hoy.

BEGIN;

INSERT INTO catalogo_acciones_permisos (accion, default_solo_admin, orden) VALUES
  ('ver_documentos_asistente', true, 105),
  ('cargar_documentos_asistente', true, 106);

UPDATE catalogo_acciones_permisos c SET orden = o.orden
FROM (VALUES
  ('gestionar_asistentes', 1),
  ('ver_pagos_asistente', 2),
  ('ver_datos_reservados_asistente', 3),
  ('ver_datos_bancarios_asistente', 4),
  ('ver_documentos_asistente', 5),
  ('cargar_documentos_asistente', 6),
  ('asignar_con_documentos_pendientes', 7),
  ('editar_datos_cliente', 8),
  ('configurar_accesos_de_personas_autorizadas', 9),
  ('ver_estado_de_cuenta_cliente', 10),
  ('gestionar_servicios', 11),
  ('editar_condiciones_comerciales_servicio', 12),
  ('modificar_asistentes_del_servicio', 13),
  ('registrar_consentimiento_pagador', 14),
  ('editar_datos_paciente', 15),
  ('validar_informe_obra_social', 16),
  ('ver_personas', 17),
  ('editar_personas', 18),
  ('importar_datos_masivos', 19),
  ('publicar_contenidos', 20),
  ('habilitar_cambio_de_clave', 21)
) AS o(accion, orden)
WHERE c.accion = o.accion;

-- El archivo lo abre quien coordina sólo con el permiso, y sólo de un Asistente a su cargo.
DROP POLICY documentos_del_legajo_los_lee_quien_coordina ON storage.objects;
CREATE POLICY documentos_del_legajo_los_lee_quien_coordina ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documentos-asistente'
    AND (storage.foldername(name))[1] = interno.prestadora_actual()::text
    AND interno.tiene_permiso('ver_documentos_asistente')
    AND EXISTS (
      SELECT 1 FROM asistentes a
      WHERE a.id::text = (storage.foldername(objects.name))[2]
        AND interno.coordinador_alcanza_asistente(a.id)
    )
  );

-- Subir el archivo, en la carpeta de un Asistente a su cargo.
CREATE POLICY documentos_del_legajo_los_sube_quien_coordina ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documentos-asistente'
    AND (storage.foldername(name))[1] = interno.prestadora_actual()::text
    AND interno.es_coordinador()
    AND interno.tiene_permiso('cargar_documentos_asistente')
    AND EXISTS (
      SELECT 1 FROM asistentes a
      WHERE a.id::text = (storage.foldername(objects.name))[2]
        AND interno.coordinador_alcanza_asistente(a.id)
    )
  );

-- Si la fila no llega a guardarse, el archivo suelto se saca. Sólo el que no tiene fila.
CREATE POLICY documentos_del_legajo_quien_coordina_borra_el_suelto ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'documentos-asistente'
    AND (storage.foldername(name))[1] = interno.prestadora_actual()::text
    AND interno.es_coordinador()
    AND interno.tiene_permiso('cargar_documentos_asistente')
    AND EXISTS (
      SELECT 1 FROM asistentes a
      WHERE a.id::text = (storage.foldername(objects.name))[2]
        AND interno.coordinador_alcanza_asistente(a.id)
    )
    AND NOT EXISTS (SELECT 1 FROM documentos_asistente d WHERE d.ruta_archivo = objects.name)
  );

-- La fila del documento: entra en revisión, a nombre de quien la cargó y sin revisar.
CREATE POLICY coordinador_carga_documentos_asistente_de_su_zona ON documentos_asistente
  FOR INSERT TO authenticated
  WITH CHECK (
    prestadora_id = interno.prestadora_actual()
    AND interno.es_coordinador()
    AND interno.tiene_permiso('cargar_documentos_asistente')
    AND interno.coordinador_alcanza_asistente(asistente_id)
    AND estado = 'en_revision'
    AND cargado_por = interno.usuario_de_la_sesion()
    AND revisado_por IS NULL
    AND revisado_at IS NULL
    AND motivo_observacion IS NULL
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
