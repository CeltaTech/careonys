-- A una guardia empezada no se le puede sacar un Paciente.
--
-- Una guardia está empezada desde que tiene el check-in. Desde ese momento el Asistente está
-- atendiendo a los Pacientes de su lista y tiene que cargar el Reporte Diario de cada uno: si uno
-- sale de la lista, el reporte queda sin dueño y el Backend lo rechaza. La base no deja que pase.
--
-- 1. La columna `guardias.paciente_id` no cambia de Paciente en una guardia empezada. Pasar de
--    ningún Paciente a uno es agregar, y se permite.
--
-- 2. De `guardia_pacientes` no se borra ni se cambia ninguna fila de una guardia empezada.
--    Agregar Pacientes se permite. Cuando se borra la guardia entera, sus filas se van en cascada
--    y eso no es sacar un Paciente de una guardia que sigue existiendo.
--
-- Las dos funciones corren con los permisos de quien escribe: no se saltean la RLS, y quien puede
-- tocar la lista de Pacientes de una guardia también puede leer esa guardia.

BEGIN;

-- 1. La columna vieja ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION interno.guardia_empezada_no_cambia_de_paciente()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF OLD.paciente_id IS NOT NULL
     AND NEW.paciente_id IS DISTINCT FROM OLD.paciente_id
     AND COALESCE(OLD.checkin_at, NEW.checkin_at) IS NOT NULL THEN
    RAISE EXCEPTION 'guardia_empezada_no_cambia_de_paciente' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION interno.guardia_empezada_no_cambia_de_paciente() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.guardia_empezada_no_cambia_de_paciente() TO authenticated, service_role, trabajo_sin_persona;

DROP TRIGGER IF EXISTS guardia_empezada_no_cambia_de_paciente ON public.guardias;
CREATE TRIGGER guardia_empezada_no_cambia_de_paciente
  BEFORE UPDATE OF paciente_id ON public.guardias
  FOR EACH ROW EXECUTE FUNCTION interno.guardia_empezada_no_cambia_de_paciente();

-- 2. La lista de Pacientes ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION interno.guardia_empezada_no_pierde_pacientes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_checkin timestamptz;
  v_existe boolean;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.guardia_id = OLD.guardia_id
     AND NEW.paciente_id = OLD.paciente_id THEN
    RETURN NEW;
  END IF;

  SELECT true, g.checkin_at
    INTO v_existe, v_checkin
    FROM guardias g
   WHERE g.id = OLD.guardia_id;

  IF v_existe IS NULL THEN
    -- La guardia ya no está: es el borrado en cascada de la guardia entera.
    IF pg_trigger_depth() > 1 THEN
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;
    -- Una guardia que no se pudo leer no se da por no empezada.
    RAISE EXCEPTION 'guardia_empezada_no_cambia_de_paciente' USING ERRCODE = '23514';
  END IF;

  IF v_checkin IS NOT NULL THEN
    RAISE EXCEPTION 'guardia_empezada_no_cambia_de_paciente' USING ERRCODE = '23514';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

REVOKE ALL ON FUNCTION interno.guardia_empezada_no_pierde_pacientes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.guardia_empezada_no_pierde_pacientes() TO authenticated, service_role, trabajo_sin_persona;

DROP TRIGGER IF EXISTS guardia_empezada_no_pierde_pacientes ON public.guardia_pacientes;
CREATE TRIGGER guardia_empezada_no_pierde_pacientes
  BEFORE DELETE OR UPDATE ON public.guardia_pacientes
  FOR EACH ROW EXECUTE FUNCTION interno.guardia_empezada_no_pierde_pacientes();

COMMIT;

NOTIFY pgrst, 'reload schema';
