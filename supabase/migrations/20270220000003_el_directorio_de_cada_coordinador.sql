-- El Directorio de Personas, recortado a las personas de los Clientes que cada Coordinador ve.
-- ============================================================================
--
-- Con el permiso `ver_personas`, que nace encendido para el Coordinador, se leía el Directorio
-- entero de la Prestadora, con sus teléfonos. Ahora el Coordinador lee la Ficha de una persona
-- cuando tiene un rol en un Cliente o un Paciente que ve: Contratante, Pagador, firmante de un
-- consentimiento, persona autorizada, el Paciente mismo, su obra social, el familiar que se quedó
-- en una guardia que ve, y el Apoderado de cualquiera de ellas.
--
-- Con el permiso `editar_personas`, que nace reservado al Administrador, sigue leyendo el Directorio
-- entero: quien da de alta Fichas tiene que poder buscar si la persona ya existe, y leer la que
-- acaba de cargar antes de que nadie la cite.

CREATE OR REPLACE FUNCTION interno.la_persona_tiene_un_rol_que_el_coordinador_ve(p_persona uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, interno
AS $$
  SELECT p_persona IS NOT NULL AND interno.es_coordinador() AND (
       EXISTS (SELECT 1 FROM clientes c
                WHERE (c.contratante_persona_id = p_persona OR c.pagador_persona_id = p_persona)
                  AND c.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_al_cliente(c.id))
    OR EXISTS (SELECT 1 FROM consentimientos_pagador cp
                WHERE (cp.pagador_persona_id = p_persona OR cp.firmante_persona_id = p_persona)
                  AND cp.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_al_cliente(cp.cliente_id))
    OR EXISTS (SELECT 1 FROM personas_autorizadas pa
                WHERE pa.persona_id = p_persona
                  AND interno.coordinador_ve_al_cliente(pa.cliente_id))
    OR EXISTS (SELECT 1 FROM pacientes pac
                WHERE (pac.persona_id = p_persona OR pac.obra_social_persona_id = p_persona)
                  AND pac.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_al_paciente(pac.id))
    OR EXISTS (SELECT 1 FROM consentimientos_medicacion cm
                 JOIN indicaciones_medicacion im ON im.id = cm.indicacion_id
                WHERE cm.firmante_persona_id = p_persona
                  AND cm.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_al_paciente(im.paciente_id))
    OR EXISTS (SELECT 1 FROM excepciones_familiar_relevo e
                WHERE e.familiar_persona_id = p_persona
                  AND e.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_la_guardia(e.guardia_id))
  );
$$;

REVOKE ALL ON FUNCTION interno.la_persona_tiene_un_rol_que_el_coordinador_ve(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.la_persona_tiene_un_rol_que_el_coordinador_ve(uuid) TO authenticated;

-- La Ficha, o la de la entidad de la que es Apoderado.
CREATE OR REPLACE FUNCTION interno.coordinador_ve_a_la_persona(p_persona uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, interno
AS $$
  SELECT interno.la_persona_tiene_un_rol_que_el_coordinador_ve(p_persona)
      OR EXISTS (SELECT 1 FROM personas e
                  WHERE e.apoderado_persona_id = p_persona
                    AND e.prestadora_id = interno.prestadora_actual()
                    AND interno.la_persona_tiene_un_rol_que_el_coordinador_ve(e.id));
$$;

REVOKE ALL ON FUNCTION interno.coordinador_ve_a_la_persona(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.coordinador_ve_a_la_persona(uuid) TO authenticated;

DROP POLICY IF EXISTS personas_las_lee_su_organizacion ON public.personas;
CREATE POLICY personas_las_lee_su_organizacion ON public.personas
  FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND interno.tiene_permiso('ver_personas')
    AND (NOT interno.es_coordinador()
         OR interno.tiene_permiso('editar_personas')
         OR interno.coordinador_ve_a_la_persona(id))
  );

DROP POLICY IF EXISTS los_telefonos_los_lee_su_organizacion ON public.telefonos_de_la_persona;
CREATE POLICY los_telefonos_los_lee_su_organizacion ON public.telefonos_de_la_persona
  FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND interno.tiene_permiso('ver_personas')
    AND (NOT interno.es_coordinador()
         OR interno.tiene_permiso('editar_personas')
         OR interno.coordinador_ve_a_la_persona(persona_id))
  );

NOTIFY pgrst, 'reload schema';
