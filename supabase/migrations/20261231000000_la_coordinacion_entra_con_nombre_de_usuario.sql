-- La coordinación entra al Panel con un nombre de usuario, y el nombre dice de qué Prestadora es.
--
-- El nombre completo es `<parte>_<código de la Prestadora>`: la parte la escribe el Administrador al
-- dar el alta, y el código es el de `configuracion_prestadora.dominio`, que nunca lleva «_». Así el
-- ingreso y la recuperación de la clave saben la Prestadora por lo que escribe la persona, y nada
-- mira la dirección de la página. Acá se guarda sólo la parte; el código ya está en la Prestadora.
--
-- El correo de la cuenta sigue siendo el de contacto: a él llega el enlace para elegir una clave
-- nueva.

ALTER TABLE public.usuarios ADD COLUMN nombre_de_usuario text;

ALTER TABLE public.usuarios ADD CONSTRAINT nombre_de_usuario_bien_escrito
  CHECK (nombre_de_usuario IS NULL OR nombre_de_usuario ~ '^[a-z0-9]([a-z0-9._-]{0,38}[a-z0-9])?$');

-- `usuarios` reparte permisos por columna: la lista del Panel la lee con la credencial de quien
-- pide, y el ingreso la busca con el trabajo de la Prestadora. Escribirla, sólo el alta.
GRANT SELECT (nombre_de_usuario) ON public.usuarios TO authenticated, trabajo_sin_persona;

CREATE UNIQUE INDEX usuarios_nombre_de_usuario_unico_en_la_prestadora
  ON public.usuarios (prestadora_id, lower(nombre_de_usuario))
  WHERE nombre_de_usuario IS NOT NULL;

-- Las cuentas de coordinación que ya existen reciben como nombre lo que va antes de la arroba de su
-- correo, limpio. La que no tiene correo queda sin nombre hasta que se le dé uno.
UPDATE public.usuarios
   SET nombre_de_usuario = btrim(regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9._-]', '', 'g'), '._-')
 WHERE rol = 'coordinador'
   AND email IS NOT NULL
   AND btrim(regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9._-]', '', 'g'), '._-') <> '';

-- El alta recibe el nombre de usuario, y para la coordinación es obligatorio. Se borra la firma
-- anterior para que no queden dos funciones con el mismo nombre.
DROP FUNCTION public.dar_de_alta_la_cuenta(text, text, text, text, text);

CREATE FUNCTION public.dar_de_alta_la_cuenta(
  p_email text, p_clave text, p_rol text, p_nombre text, p_telefono text, p_nombre_de_usuario text DEFAULT NULL)
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
  v_nombre_de_usuario text;
BEGIN
  IF auth.jwt() ->> 'role' IS DISTINCT FROM 'trabajo_sin_persona' THEN
    RAISE EXCEPTION 'sin_permiso';
  END IF;
  v_prestadora := interno.prestadora_actual();
  IF v_prestadora IS NULL THEN RAISE EXCEPTION 'sin_permiso'; END IF;
  IF p_rol IS NULL OR p_rol NOT IN ('coordinador', 'asistente', 'cliente') THEN
    RAISE EXCEPTION 'sin_permiso';
  END IF;
  v_correo := lower(btrim(coalesce(p_email, ''), E' \t\r\n'));
  IF v_correo = '' OR coalesce(p_clave, '') = '' THEN RAISE EXCEPTION 'faltan_datos'; END IF;
  -- El nombre de usuario es de la coordinación, que entra al Panel con él. Los demás no lo llevan.
  v_nombre_de_usuario := nullif(lower(btrim(coalesce(p_nombre_de_usuario, ''), E' \t\r\n')), '');
  IF p_rol = 'coordinador' THEN
    IF v_nombre_de_usuario IS NULL THEN RAISE EXCEPTION 'faltan_datos'; END IF;
    IF v_nombre_de_usuario !~ '^[a-z0-9]([a-z0-9._-]{0,38}[a-z0-9])?$' THEN
      RAISE EXCEPTION 'usuario_mal_escrito';
    END IF;
    IF EXISTS (SELECT 1 FROM usuarios
                WHERE prestadora_id = v_prestadora AND lower(nombre_de_usuario) = v_nombre_de_usuario) THEN
      RAISE EXCEPTION 'usuario_de_esta_prestadora';
    END IF;
  ELSE
    v_nombre_de_usuario := NULL;
  END IF;
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
  INSERT INTO usuarios (id, rol, nombre, telefono, email, prestadora_id, nombre_de_usuario)
  VALUES (v_usuario, p_rol, p_nombre, nullif(btrim(coalesce(p_telefono, '')), ''), v_correo, v_prestadora,
          v_nombre_de_usuario);
  RETURN v_usuario;
END;
$function$;

REVOKE ALL ON FUNCTION public.dar_de_alta_la_cuenta(text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dar_de_alta_la_cuenta(text, text, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.dar_de_alta_la_cuenta(text, text, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dar_de_alta_la_cuenta(text, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.dar_de_alta_la_cuenta(text, text, text, text, text, text) TO trabajo_sin_persona;

-- El Panel ya no busca la Prestadora por el correo: la dice el nombre de usuario.
DROP FUNCTION public.prestadora_del_correo_del_panel(text);

NOTIFY pgrst, 'reload schema';
