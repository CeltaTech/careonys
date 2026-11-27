-- Quién asignó un turno de guardia, y quién lo retiró, es siempre una persona del Panel.
--
-- La asignación anota a la persona de la sesión. Cuando la asignación la hace una cuenta
-- automática —la importación de Servicios en curso, por ejemplo—, esa cuenta no es una persona
-- del Panel, y anotarla rompía la referencia a la tabla de usuarios: la asignación no se
-- guardaba. Ahora se anota a la persona sólo si la sesión es de una persona registrada; si no,
-- queda en blanco.

CREATE OR REPLACE FUNCTION interno.la_asignacion_cambia_de_estado()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF coalesce(current_setting('careonys.vetando', true), '') <> '' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF interno.usuario_registrado_de_la_sesion() IS NOT NULL THEN
      NEW.asignado_por := interno.usuario_registrado_de_la_sesion();
    END IF;
    NEW.asignado_at := now();
    NEW.respondida_at := CASE WHEN NEW.estado IN ('aceptada', 'rechazada') THEN now() END;
    NEW.retirada_at := CASE WHEN NEW.estado = 'retirada' THEN now() END;
    NEW.retirada_por := CASE WHEN NEW.estado = 'retirada' THEN interno.usuario_registrado_de_la_sesion() END;
    RETURN NEW;
  END IF;

  IF NEW.prestadora_id IS DISTINCT FROM OLD.prestadora_id
     OR NEW.turno_guardia_id IS DISTINCT FROM OLD.turno_guardia_id
     OR NEW.serie_id IS DISTINCT FROM OLD.serie_id
     OR NEW.ausencia_id IS DISTINCT FROM OLD.ausencia_id
     OR NEW.asistente_id IS DISTINCT FROM OLD.asistente_id
     OR NEW.asistente_anterior_id IS DISTINCT FROM OLD.asistente_anterior_id
     OR NEW.asignado_por IS DISTINCT FROM OLD.asignado_por
     OR NEW.asignado_at IS DISTINCT FROM OLD.asignado_at THEN
    RAISE EXCEPTION 'asignacion_no_se_modifica' USING ERRCODE = '23514';
  END IF;

  NEW.respondida_at := OLD.respondida_at;
  NEW.retirada_at := OLD.retirada_at;
  NEW.retirada_por := OLD.retirada_por;

  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
    RETURN NEW;
  END IF;

  IF OLD.estado <> 'sin_responder' THEN
    RAISE EXCEPTION 'asignacion_ya_respondida' USING ERRCODE = '23514';
  END IF;

  IF NEW.estado IN ('aceptada', 'rechazada') THEN
    NEW.respondida_at := now();
  ELSIF NEW.estado = 'retirada' THEN
    NEW.retirada_at := now();
    NEW.retirada_por := interno.usuario_registrado_de_la_sesion();
  END IF;

  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
