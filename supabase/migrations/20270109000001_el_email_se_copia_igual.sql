-- EL EMAIL SE COPIA IGUAL EN LOS CUATRO LUGARES.
--
-- La cuenta guarda el email en minúsculas. Al pasarlo al Legajo, a la Ficha del Cliente y a las
-- personas autorizadas, la comparación sin distinguir mayúsculas dejaba en el Legajo la forma en
-- que se escribió, distinta de la de la cuenta. Ahora se copia tal cual está en la cuenta. La
-- vuelta termina igual: al volver, el valor ya es el mismo y la cuenta no se escribe.

BEGIN;

CREATE OR REPLACE FUNCTION interno.el_email_de_la_cuenta_pasa_a_los_demas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_quien uuid;
BEGIN
  IF NEW.email IS NULL OR btrim(NEW.email) = '' THEN RETURN NULL; END IF;

  UPDATE asistentes SET email = NEW.email
   WHERE usuario_id = NEW.id AND email IS DISTINCT FROM NEW.email;

  UPDATE personas p SET email = NEW.email
    FROM clientes c
   WHERE c.usuario_id = NEW.id AND p.id = c.contratante_persona_id
     AND p.email IS DISTINCT FROM NEW.email;

  UPDATE personas_autorizadas SET email = NEW.email
   WHERE usuario_id = NEW.id AND email IS DISTINCT FROM NEW.email;

  -- Queda auditado quién lo cambió y en qué cuenta, sin ninguno de los dos emails.
  SELECT id INTO v_quien FROM usuarios WHERE id = interno.usuario_de_la_sesion();
  INSERT INTO registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, campos_cambiados)
  VALUES (NEW.prestadora_id, coalesce(v_quien, NEW.id), 'cambio_de_email', 'usuarios', NEW.id, ARRAY['email']);

  -- Y se le avisa al email anterior, que es el único que puede darse cuenta si no fue él.
  IF OLD.email IS NOT NULL AND btrim(OLD.email) <> '' AND NEW.prestadora_id IS NOT NULL THEN
    INSERT INTO avisos_de_email_cambiado (prestadora_id, usuario_id, email_anterior)
    VALUES (NEW.prestadora_id, NEW.id, OLD.email);
  END IF;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION interno.el_email_de_la_cuenta_pasa_a_los_demas() FROM PUBLIC, anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
