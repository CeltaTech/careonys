-- El Administrador de la Prestadora ve la información de salud de sus Pacientes.
--
-- Con la restricción de HCE encendida, la información de salud de un Paciente la leía sólo quien
-- lo atiende: la Familia, el equipo, el Asistente de la guardia y el Coordinador que lo alcanza. El
-- Administrador no era ninguno de ésos, así que con su propia sesión no veía ni podía atender las
-- emergencias de las guardias.
--
-- Decisión del Desarrollador: el Administrador es el jefe de todos, también de los coordinadores,
-- y cuando hace falta asume él la coordinación; en una emergencia no puede quedarse sin la
-- información que decide qué se hace.
--
-- Alcanza a los Pacientes de su propia Prestadora y a ninguno más. El Superadmin no entra por acá:
-- lo suyo va por el permiso de acceso.

CREATE OR REPLACE FUNCTION interno.alcanza_la_informacion_de_salud(p_paciente uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT p_paciente IS NOT NULL
     AND (NOT interno.rige_la_restriccion_de_hce(interno.current_tenant())
          OR interno.atiende_al_paciente(p_paciente)
          OR (interno.es_admin_prestadora()
              AND EXISTS (SELECT 1 FROM pacientes p
                           WHERE p.id = p_paciente
                             AND p.prestadora_id = interno.current_tenant())))
$function$;

NOTIFY pgrst, 'reload schema';
