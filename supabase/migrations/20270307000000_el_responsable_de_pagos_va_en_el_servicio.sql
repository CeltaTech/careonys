-- El Responsable de pagos, lo que firma, sus documentos, el plazo y el Contratante se cargan en el
-- Servicio. La migración anterior agregó las columnas y copió los datos; ésta deja a la base
-- trabajando por Servicio:
--
--   1. Lo firmado y los documentos del Responsable de pagos son siempre de un Servicio.
--   2. Lo único que se repite por Servicio es lo que antes se repetía por Cliente.
--   3. Lo comercial del Servicio lo cambia quien puede editar los datos del Cliente.
--   4. El trabajo sin persona lee el Servicio para saber a quién le toca firmar.
--   5. El coordinador ve a las personas que tienen un rol en sus Servicios.

BEGIN;

-- 1. Ya no queda ninguna fila sin Servicio: la migración anterior las copió todas.
ALTER TABLE public.consentimientos_pagador ALTER COLUMN servicio_id SET NOT NULL;
ALTER TABLE public.documentos_pagador ALTER COLUMN servicio_id SET NOT NULL;

-- 2. Un consentimiento pendiente y un documento de cada tipo, por Servicio. Los índices por
-- Cliente impedirían que dos Servicios del mismo Cliente tengan cada uno el suyo.
DROP INDEX IF EXISTS public.consentimientos_pagador_uno_pendiente_por_cliente;
DROP INDEX IF EXISTS public.documentos_pagador_uno_por_tipo;

-- 3. Lo comercial del Servicio. El coordinador puede escribir en los Servicios que coordina
-- (política `coordinador_gestiona_sus_servicios`), pero lo comercial es dato del Cliente y sigue
-- la misma regla que en `clientes`: la administración, o quien tenga `editar_datos_cliente`.
CREATE OR REPLACE FUNCTION interno.lo_comercial_del_servicio_lo_edita_quien_puede()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF (NEW.pagador_tipo IS DISTINCT FROM OLD.pagador_tipo
      OR NEW.pagador_persona_id IS DISTINCT FROM OLD.pagador_persona_id
      OR NEW.dias_hasta_el_vencimiento IS DISTINCT FROM OLD.dias_hasta_el_vencimiento
      OR NEW.contratante_persona_id IS DISTINCT FROM OLD.contratante_persona_id)
     AND COALESCE(auth.jwt() ->> 'role', '') = 'authenticated'
     AND NOT (interno.es_admin_prestadora()
              OR interno.es_superadmin()
              OR interno.tiene_permiso('editar_datos_cliente')) THEN
    RAISE EXCEPTION 'lo_comercial_del_servicio_lo_edita_quien_puede';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION interno.lo_comercial_del_servicio_lo_edita_quien_puede() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS lo_comercial_del_servicio_lo_edita_quien_puede ON public.servicios;
CREATE TRIGGER lo_comercial_del_servicio_lo_edita_quien_puede
  BEFORE UPDATE OF pagador_tipo, pagador_persona_id, dias_hasta_el_vencimiento, contratante_persona_id
  ON public.servicios
  FOR EACH ROW EXECUTE FUNCTION interno.lo_comercial_del_servicio_lo_edita_quien_puede();

-- 4. Cuando el titular nombra o cambia un Apoderado, el backend realinea lo que tiene que firmar
-- cada Servicio del Cliente con la credencial del trabajo sin persona, de a una Prestadora.
GRANT SELECT ON public.servicios TO trabajo_sin_persona;

DROP POLICY IF EXISTS trabajo_sin_persona_de_esta_prestadora ON public.servicios;
CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.servicios
  FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

-- 5. Quien es Contratante o Responsable de pagos de un Servicio también tiene un rol que el
-- coordinador ve. La rama de `clientes` queda hasta que esas columnas se borren.
CREATE OR REPLACE FUNCTION interno.la_persona_tiene_un_rol_que_el_coordinador_ve(p_persona uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT p_persona IS NOT NULL AND interno.es_coordinador() AND (
       EXISTS (SELECT 1 FROM clientes c
                WHERE (c.contratante_persona_id = p_persona OR c.pagador_persona_id = p_persona)
                  AND c.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_al_cliente(c.id))
    OR EXISTS (SELECT 1 FROM servicios s
                WHERE (s.contratante_persona_id = p_persona OR s.pagador_persona_id = p_persona)
                  AND s.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_al_cliente(s.contratante_id))
    OR EXISTS (SELECT 1 FROM apoderados a
                WHERE a.persona_id = p_persona
                  AND a.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_al_cliente(a.cliente_id))
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
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
