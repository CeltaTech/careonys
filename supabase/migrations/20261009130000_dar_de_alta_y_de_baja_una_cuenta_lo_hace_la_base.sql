-- Dar de alta y de baja una cuenta lo hace la base, sin llave maestra.
--
-- Hasta acá el backend creaba y borraba la cuenta de ingreso con la llave maestra, que alcanza a
-- todas las Prestadoras, y después escribía la fila de `usuarios` en un segundo paso. Si el segundo
-- paso fallaba quedaba una cuenta de ingreso sin nadie detrás.
--
-- Ahora son dos procedimientos, y cada uno hace todo junto: o pasa entero o no pasa nada. La
-- Prestadora sale de la credencial de quien pide —`interno.current_tenant()`—, nunca del pedido,
-- así que no se puede dar de alta ni de baja una cuenta de otra Prestadora.
--
-- El producto sólo hace las cuentas de la gente de la Prestadora: coordinación, Asistentes,
-- Clientes y su personas autorizadas. La del Administrador y la del equipo técnico son de CeltaTech, y estos
-- procedimientos se niegan a tocarlas.
--
-- El correo de ingreso se arma acá con la misma fórmula que `backend/src/config/correoDeAcceso.js`:
-- el resumen SHA-256 de «prestadora:correo», en minúsculas y sin espacios, con el dominio
-- `acceso.careonys.invalid`. Si una de las dos cambia, las cuentas dejan de encontrarse: no se
-- cambia ninguna.

BEGIN;

CREATE OR REPLACE FUNCTION public.dar_de_alta_la_cuenta(
  p_email text, p_clave text, p_rol text, p_nombre text, p_telefono text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid;
  v_correo text;
  v_ingreso text;
  v_existente uuid;
  v_usuario uuid := gen_random_uuid();
BEGIN
  IF auth.jwt() ->> 'role' IS DISTINCT FROM 'trabajo_sin_persona' THEN
    RAISE EXCEPTION 'sin_permiso';
  END IF;
  v_prestadora := interno.current_tenant();
  IF v_prestadora IS NULL THEN RAISE EXCEPTION 'sin_permiso'; END IF;
  IF p_rol IS NULL OR p_rol NOT IN ('coordinador', 'asistente', 'cliente') THEN
    RAISE EXCEPTION 'sin_permiso';
  END IF;

  v_correo := lower(btrim(coalesce(p_email, ''), E' \t\r\n'));
  IF v_correo = '' OR coalesce(p_clave, '') = '' THEN RAISE EXCEPTION 'faltan_datos'; END IF;

  v_ingreso := encode(extensions.digest(lower(v_prestadora::text) || ':' || v_correo, 'sha256'), 'hex')
               || '@acceso.careonys.invalid';

  -- Si ya hay una cuenta de ingreso con ese correo, se mira qué tiene detrás. Sin fila en
  -- `usuarios` es lo que dejó un alta anterior cortada por la mitad: no le sirve a nadie y se
  -- borra. Con fila, esa persona ya tiene cuenta en esta Prestadora: el correo lleva la
  -- Prestadora adentro, así que no puede ser de otra.
  SELECT id INTO v_existente FROM auth.users WHERE email = v_ingreso;
  IF v_existente IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM usuarios WHERE id = v_existente) THEN
      RAISE EXCEPTION 'correo_de_esta_prestadora';
    END IF;
    DELETE FROM auth.users WHERE id = v_existente;
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  VALUES (
    '00000000-0000-0000-0000-000000000000', v_usuario, 'authenticated', 'authenticated',
    v_ingreso, extensions.crypt(p_clave, extensions.gen_salt('bf', 10)), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', '', '', '', '', '');

  INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (
    v_usuario::text, v_usuario,
    jsonb_build_object('sub', v_usuario::text, 'email', v_ingreso, 'email_verified', true),
    'email', NULL, now(), now());

  -- El correo de verdad va acá y no del lado del ingreso, guardado comparable, que es como se busca.
  INSERT INTO usuarios (id, rol, nombre, telefono, email, prestadora_id)
  VALUES (v_usuario, p_rol, p_nombre, nullif(btrim(coalesce(p_telefono, '')), ''), v_correo, v_prestadora);

  RETURN v_usuario;
END;
$function$;
REVOKE ALL ON FUNCTION public.dar_de_alta_la_cuenta(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dar_de_alta_la_cuenta(text, text, text, text, text) TO trabajo_sin_persona;

-- Dar de baja una cuenta: su fila de `usuarios` y su cuenta de ingreso, juntas. Sólo una cuenta de
-- la Prestadora de la credencial, y sólo de la gente que el producto da de alta. Devuelve si
-- encontró qué dar de baja: una cuenta de otra Prestadora y una que no existe se contestan igual.
CREATE OR REPLACE FUNCTION public.dar_de_baja_la_cuenta(p_usuario uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid;
BEGIN
  IF auth.jwt() ->> 'role' IS DISTINCT FROM 'trabajo_sin_persona' THEN RETURN false; END IF;
  v_prestadora := interno.current_tenant();
  IF v_prestadora IS NULL OR p_usuario IS NULL THEN RETURN false; END IF;

  DELETE FROM usuarios
   WHERE id = p_usuario
     AND prestadora_id = v_prestadora
     AND rol IN ('coordinador', 'asistente', 'cliente');
  IF NOT FOUND THEN RETURN false; END IF;

  DELETE FROM auth.users WHERE id = p_usuario;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.dar_de_baja_la_cuenta(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dar_de_baja_la_cuenta(uuid) TO trabajo_sin_persona;

COMMIT;

NOTIFY pgrst, 'reload schema';
