-- Dos correcciones de los Servicios.
--
-- 1. El Servicio de un Cliente que espera conformidad queda oculto, igual que el Cliente y sus
--    Pacientes. Es la misma regla que ya tiene la información de salud del Paciente: la fila se ve
--    sólo si se ve aquello de lo que cuelga, así que la importación —la única que ve lo pendiente—
--    lo sigue viendo, y nadie más.
--
-- 2. Cuando quien crea el Servicio es un Coordinador con el permiso `gestionar_servicios`, el
--    Servicio nace coordinado por él. El alta la hace el trabajo sin persona, que no tiene sesión,
--    así que quién lo asignó lo dice el backend; a una persona con sesión se le sigue tomando de su
--    propia sesión y no lo puede declarar.

CREATE POLICY oculta_pendientes_de_conformidad
  ON public.servicios AS RESTRICTIVE
  USING (EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = cliente_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = cliente_id));

CREATE OR REPLACE FUNCTION interno.el_coordinador_del_servicio_lo_asigna_la_administracion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.coordinador_id IS NOT DISTINCT FROM OLD.coordinador_id THEN
    NEW.coordinador_asignado_por := OLD.coordinador_asignado_por;
    NEW.coordinador_asignado_en := OLD.coordinador_asignado_en;
    RETURN NEW;
  END IF;

  IF NEW.coordinador_id IS NULL THEN
    IF TG_OP = 'UPDATE' THEN
      RAISE EXCEPTION 'el_servicio_no_se_queda_sin_coordinador';
    END IF;
    NEW.coordinador_asignado_por := NULL;
    NEW.coordinador_asignado_en := NULL;
    RETURN NEW;
  END IF;

  -- Una persona con sesión sólo asigna si administra la Prestadora. Lo que corre sin persona —el
  -- trabajo de la Prestadora, la carga de datos inventados— no pasa por esta pregunta.
  IF COALESCE(auth.jwt() ->> 'role', '') = 'authenticated'
     AND NOT (interno.es_admin_prestadora() OR interno.es_superadmin()) THEN
    RAISE EXCEPTION 'el_coordinador_lo_asigna_la_administracion';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM usuarios u
     WHERE u.id = NEW.coordinador_id
       AND u.prestadora_id = NEW.prestadora_id
       AND u.rol = 'coordinador'
       AND u.desactivada_en IS NULL
  ) THEN
    RAISE EXCEPTION 'el_asignado_no_coordina_en_la_prestadora';
  END IF;

  NEW.coordinador_asignado_por := CASE WHEN auth.uid() IS NULL THEN NEW.coordinador_asignado_por
                                       ELSE auth.uid() END;
  NEW.coordinador_asignado_en := now();
  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
