-- El enlace para activar la cuenta y el enlace para restablecer la contraseña se guardan como huella.
--
-- QUÉ HACE
--   1. Las filas que ya están en las dos tablas pasan a guardar la huella (sha256 en hexadecimal)
--      del enlace en vez del enlace mismo. El enlace que la persona tiene en su correo sigue
--      sirviendo: al abrirlo, se calcula la huella de lo que llegó y se busca ésa.
--   2. Las dos tablas rechazan guardar cualquier cosa que no tenga forma de huella. El enlace se
--      arma con 32 bytes en base64url (43 caracteres), que nunca tiene esa forma, así que un enlace
--      guardado en claro por error no entra.
--   3. `poner_clave_con_codigo` calcula ella misma la huella de lo que recibe y compara contra la
--      guardada. Pasarle la huella robada de la tabla no sirve: la huella de una huella no coincide.
--
-- POR QUÉ
--   Quien se llevara cualquiera de las dos tablas tenía enlaces vigentes, y con un enlace vigente
--   se le pone contraseña a una cuenta ajena. Con la huella no se arma ningún enlace.
--
-- QUÉ SE COMPROBÓ ANTES, EN LA BASE EN VIVO
--   - 6 filas en `tokens_activacion_cuenta`, las 6 en claro; 0 en `tokens_recuperacion_clave`.
--   - `poner_clave_con_codigo` sólo la ejecutan postgres, service_role y trabajo_sin_persona.
--     CREATE OR REPLACE conserva esos permisos; igual se revoca de nuevo a PUBLIC y anon.
--
-- NO BORRA NADA. Convertir las filas no tiene vuelta atrás —de la huella no se recupera el enlace—,
-- y no hace falta: los enlaces viejos siguen funcionando con la función nueva.

BEGIN;

UPDATE public.tokens_activacion_cuenta
   SET token = encode(extensions.digest(token, 'sha256'), 'hex')
 WHERE token !~ '^[0-9a-f]{64}$';

UPDATE public.tokens_recuperacion_clave
   SET token = encode(extensions.digest(token, 'sha256'), 'hex')
 WHERE token !~ '^[0-9a-f]{64}$';

ALTER TABLE public.tokens_activacion_cuenta
  ADD CONSTRAINT tokens_activacion_cuenta_token_es_huella CHECK (token ~ '^[0-9a-f]{64}$');

ALTER TABLE public.tokens_recuperacion_clave
  ADD CONSTRAINT tokens_recuperacion_clave_token_es_huella CHECK (token ~ '^[0-9a-f]{64}$');

CREATE OR REPLACE FUNCTION public.poner_clave_con_codigo(p_uso text, p_codigo text, p_clave text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid;
  v_usuario uuid;
  v_huella text;
BEGIN
  IF auth.jwt() ->> 'role' IS DISTINCT FROM 'trabajo_sin_persona' THEN RETURN NULL; END IF;
  v_prestadora := interno.current_tenant();
  IF v_prestadora IS NULL OR coalesce(p_codigo, '') = '' OR coalesce(p_clave, '') = '' THEN
    RETURN NULL;
  END IF;

  -- Llega el enlace tal como vino en el correo; lo guardado es su huella.
  v_huella := encode(extensions.digest(p_codigo, 'sha256'), 'hex');

  IF p_uso = 'activacion' THEN
    UPDATE tokens_activacion_cuenta t SET usado_en = now()
      FROM usuarios u
     WHERE t.token = v_huella AND t.usado_en IS NULL AND t.expira_en > now()
       AND u.id = t.usuario_id AND u.prestadora_id = v_prestadora
       AND u.rol IN ('coordinador', 'asistente', 'cliente')
    RETURNING t.usuario_id INTO v_usuario;
  ELSIF p_uso = 'recuperacion' THEN
    UPDATE tokens_recuperacion_clave t SET usado_en = now()
      FROM usuarios u
     WHERE t.token = v_huella AND t.usado_en IS NULL AND t.expira_en > now()
       AND u.id = t.usuario_id AND u.prestadora_id = v_prestadora
       AND u.rol IN ('coordinador', 'asistente', 'cliente')
    RETURNING t.usuario_id INTO v_usuario;
  ELSE
    RETURN NULL;
  END IF;

  IF v_usuario IS NULL THEN RETURN NULL; END IF;

  UPDATE auth.users
     SET encrypted_password = extensions.crypt(p_clave, extensions.gen_salt('bf', 10)),
         updated_at = now()
   WHERE id = v_usuario;
  -- Sin cuenta de ingreso no queda ninguna clave puesta, y el código tampoco se gasta.
  IF NOT FOUND THEN RAISE EXCEPTION 'poner_clave_con_codigo: la cuenta no tiene ingreso'; END IF;

  RETURN v_usuario;
END;
$function$;

REVOKE ALL ON FUNCTION public.poner_clave_con_codigo(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.poner_clave_con_codigo(text, text, text) TO trabajo_sin_persona;

COMMIT;

NOTIFY pgrst, 'reload schema';
