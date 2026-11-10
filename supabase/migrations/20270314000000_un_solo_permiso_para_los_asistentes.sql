-- Permisos de Coordinadores: el catálogo queda como lo aprobó el Desarrollador.
--
-- · El alta y la edición de los Asistentes eran dos permisos y son uno solo, que además cubre la
--   baja: «Alta, baja y modificación de Asistentes». De fábrica, sólo la administración.
-- · «Corregir el equipo de un Paciente» pasa a llamarse por lo que es: modificar los Asistentes de
--   un Servicio.
-- · Nace «Editar las condiciones comerciales de los Servicios», de fábrica sólo la administración.
-- · El orden es el de la tabla aprobada, y deja de haber dos acciones con el mismo número.
--
-- Ninguna Prestadora tenía personalizada ninguna de las acciones que salen, así que no hay
-- decisión de nadie que trasladar; igual se trasladan las filas, por si apareciera alguna.

BEGIN;

INSERT INTO catalogo_acciones_permisos (accion, default_solo_admin, orden) VALUES
  ('gestionar_asistentes', true, 101),
  ('modificar_asistentes_del_servicio', false, 111),
  ('editar_condiciones_comerciales_servicio', true, 110);

-- Lo que una Prestadora haya decidido sobre la acción vieja pasa a la nueva. De las dos de
-- Asistentes se conserva la más restrictiva: abrirle a alguien la baja sin que nadie lo decidiera
-- sería dar un permiso que no se dio.
INSERT INTO permisos_prestadora (prestadora_id, accion, alcance, excepciones_permitir, excepciones_denegar, actualizado_por, actualizado_en)
SELECT DISTINCT ON (prestadora_id) prestadora_id, 'gestionar_asistentes', alcance, excepciones_permitir, excepciones_denegar, actualizado_por, actualizado_en
FROM permisos_prestadora
WHERE accion IN ('alta_manual_asistente', 'editar_identidad_asistente')
ORDER BY prestadora_id, (alcance = 'solo_admin') DESC;

UPDATE permisos_prestadora SET accion = 'modificar_asistentes_del_servicio'
WHERE accion = 'corregir_equipo_del_paciente';

DELETE FROM permisos_prestadora
WHERE accion IN ('alta_manual_asistente', 'editar_identidad_asistente');

-- Las políticas que nombraban las acciones viejas, antes de borrarlas del catálogo.
DROP POLICY coordinador_edita_asistentes_de_su_zona ON asistentes;
CREATE POLICY coordinador_edita_asistentes_de_su_zona ON asistentes
  FOR UPDATE TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND interno.coordinador_alcanza_asistente(id)
    AND interno.tiene_permiso('gestionar_asistentes')
  );

DROP POLICY coordinacion_corrige_el_equipo_del_paciente ON equipo_paciente;
CREATE POLICY coordinacion_corrige_el_equipo_del_paciente ON equipo_paciente
  FOR ALL TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND (interno.es_admin_prestadora()
         OR (interno.coordinador_ve_al_paciente(paciente_id) AND interno.tiene_permiso('modificar_asistentes_del_servicio')))
  )
  WITH CHECK (
    prestadora_id = interno.prestadora_actual()
    AND (interno.es_admin_prestadora()
         OR (interno.coordinador_ve_al_paciente(paciente_id) AND interno.tiene_permiso('modificar_asistentes_del_servicio')))
  );

DELETE FROM catalogo_acciones_permisos
WHERE accion IN ('alta_manual_asistente', 'editar_identidad_asistente', 'corregir_equipo_del_paciente');

UPDATE catalogo_acciones_permisos c SET orden = o.orden
FROM (VALUES
  ('gestionar_asistentes', 1),
  ('ver_pagos_asistente', 2),
  ('ver_datos_reservados_asistente', 3),
  ('ver_datos_bancarios_asistente', 4),
  ('asignar_con_documentos_pendientes', 5),
  ('editar_datos_cliente', 6),
  ('configurar_accesos_de_personas_autorizadas', 7),
  ('ver_estado_de_cuenta_cliente', 8),
  ('gestionar_servicios', 9),
  ('editar_condiciones_comerciales_servicio', 10),
  ('modificar_asistentes_del_servicio', 11),
  ('registrar_consentimiento_pagador', 12),
  ('editar_datos_paciente', 13),
  ('validar_informe_obra_social', 14),
  ('ver_personas', 15),
  ('editar_personas', 16),
  ('importar_datos_masivos', 17),
  ('publicar_contenidos', 18),
  ('habilitar_cambio_de_clave', 19)
) AS o(accion, orden)
WHERE c.accion = o.accion;

-- La baja de un Asistente la puede dar ahora un Coordinador con el permiso, pero sólo de un
-- Asistente que esté a su cargo. Leer el Padrón no lo dice —los Coordinadores lo leen entero—, así
-- que el backend le pregunta a la base con la credencial de quien pide. No recibe a nadie más que
-- al Asistente, corre con los permisos de quien llama y contesta falso si es de otra Prestadora.
CREATE FUNCTION public.alcanza_al_asistente_la_sesion(p_asistente uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, interno
AS $$
  SELECT EXISTS (
    SELECT 1 FROM asistentes a
    WHERE a.id = p_asistente
      AND a.prestadora_id = interno.prestadora_actual()
      AND (interno.es_admin_prestadora() OR interno.coordinador_alcanza_asistente(a.id))
  );
$$;

REVOKE ALL ON FUNCTION public.alcanza_al_asistente_la_sesion(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.alcanza_al_asistente_la_sesion(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.alcanza_al_asistente_la_sesion(uuid) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
