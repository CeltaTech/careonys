-- UNA CUENTA DESACTIVADA SE PUEDE REACTIVAR.
--
-- La reactiva el Administrador de la Prestadora y nadie más: ni la coordinación ni el soporte
-- técnico de CeltaTech con un permiso de acceso abierto. Reactivar limpia cuándo y por qué se
-- desactivó, levanta el bloqueo de la cuenta de ingreso y deja el renglón en el registro de
-- actividad, todo en el mismo paso.
--
-- Una cuenta desactivada deja libres su email y su nombre de usuario: otra cuenta los puede tomar.
-- Por eso, al reactivarla, cualquiera de los dos puede chocar con una cuenta activa, y entonces no
-- se reactiva y se dice cuál de los dos choca.

BEGIN;

-- LA DESACTIVADA NO OCUPA EL EMAIL NI EL NOMBRE DE USUARIO.
DROP INDEX IF EXISTS public.usuarios_correo_unico_en_la_prestadora;
CREATE UNIQUE INDEX usuarios_correo_unico_en_la_prestadora
  ON public.usuarios (prestadora_id, lower(email))
  WHERE email IS NOT NULL AND desactivada_en IS NULL;

DROP INDEX IF EXISTS public.usuarios_nombre_de_usuario_unico;
CREATE UNIQUE INDEX usuarios_nombre_de_usuario_unico
  ON public.usuarios (lower(nombre_de_usuario))
  WHERE nombre_de_usuario IS NOT NULL AND desactivada_en IS NULL;

-- El alta comprueba contra las cuentas activas, igual que los índices.
CREATE OR REPLACE FUNCTION public.dar_de_alta_la_cuenta(p_email text, p_clave text, p_rol text, p_nombre text, p_telefono text, p_nombre_de_usuario text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid;
  v_correo text;
  v_usuario uuid := gen_random_uuid();
  v_ingreso text;
  v_parte text;
  v_dominio text;
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

  IF EXISTS (SELECT 1 FROM usuarios WHERE prestadora_id = v_prestadora AND lower(email) = v_correo
                AND desactivada_en IS NULL) THEN
    RAISE EXCEPTION 'correo_de_esta_prestadora';
  END IF;

  -- La coordinación nace con su nombre: la parte que escribe el Administrador y el código de la
  -- Prestadora. Asistentes y Clientes eligen el suyo al activar la cuenta.
  IF p_rol = 'coordinador' THEN
    v_parte := nullif(lower(btrim(coalesce(p_nombre_de_usuario, ''), E' \t\r\n')), '');
    IF v_parte IS NULL THEN RAISE EXCEPTION 'faltan_datos'; END IF;
    IF v_parte !~ '^[a-z0-9]([a-z0-9._-]{0,38}[a-z0-9])?$' THEN
      RAISE EXCEPTION 'usuario_mal_escrito';
    END IF;
    SELECT dominio INTO v_dominio FROM configuracion_prestadora WHERE prestadora_id = v_prestadora;
    IF v_dominio IS NULL THEN RAISE EXCEPTION 'faltan_datos'; END IF;
    v_nombre_de_usuario := v_parte || '_' || lower(v_dominio);
    IF EXISTS (SELECT 1 FROM usuarios WHERE lower(nombre_de_usuario) = v_nombre_de_usuario
                  AND desactivada_en IS NULL) THEN
      RAISE EXCEPTION 'usuario_en_uso';
    END IF;
  END IF;

  v_ingreso := v_usuario::text || '@acceso.careonys.invalid';

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
  BEGIN
    INSERT INTO usuarios (id, rol, nombre, telefono, email, prestadora_id, nombre_de_usuario)
    VALUES (v_usuario, p_rol, p_nombre, nullif(btrim(coalesce(p_telefono, '')), ''), v_correo, v_prestadora,
            v_nombre_de_usuario);
  EXCEPTION WHEN unique_violation THEN
    -- Dos altas al mismo tiempo pasaron las dos comprobaciones de arriba: el índice decide.
    IF v_nombre_de_usuario IS NOT NULL
       AND EXISTS (SELECT 1 FROM usuarios WHERE lower(nombre_de_usuario) = v_nombre_de_usuario
                      AND desactivada_en IS NULL) THEN
      RAISE EXCEPTION 'usuario_en_uso';
    END IF;
    RAISE EXCEPTION 'correo_de_esta_prestadora';
  END;
  RETURN v_usuario;
END;
$function$;

-- La activación también: el nombre que elige el Asistente o el Cliente sólo choca con una activa.
CREATE OR REPLACE FUNCTION public.activar_la_cuenta(p_codigo text, p_clave text, p_usuario text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid;
  v_usuario uuid;
  v_rol text;
  v_nombre text;
BEGIN
  IF auth.jwt() ->> 'role' IS DISTINCT FROM 'trabajo_sin_persona' THEN RETURN NULL; END IF;
  v_prestadora := interno.prestadora_actual();
  IF v_prestadora IS NULL OR coalesce(p_codigo, '') = '' OR coalesce(p_clave, '') = '' THEN
    RETURN NULL;
  END IF;

  UPDATE tokens_activacion_cuenta t SET usado_en = now()
    FROM usuarios u
   WHERE t.token = encode(extensions.digest(p_codigo, 'sha256'), 'hex')
     AND t.usado_en IS NULL AND t.expira_en > now()
     AND u.id = t.usuario_id AND u.prestadora_id = v_prestadora
     AND u.rol IN ('coordinador', 'asistente', 'cliente')
  RETURNING t.usuario_id, u.rol INTO v_usuario, v_rol;

  IF v_usuario IS NULL THEN RETURN NULL; END IF;

  -- La coordinación ya tiene el suyo. Asistentes y Clientes lo eligen ahora.
  IF v_rol IN ('asistente', 'cliente') THEN
    v_nombre := lower(btrim(coalesce(p_usuario, ''), E' \t\r\n'));
    IF v_nombre = '' THEN RAISE EXCEPTION 'faltan_datos'; END IF;
    IF NOT interno.usuario_elegido_bien_escrito(v_nombre) THEN RAISE EXCEPTION 'usuario_mal_escrito'; END IF;
    IF EXISTS (SELECT 1 FROM usuarios WHERE lower(nombre_de_usuario) = v_nombre AND id <> v_usuario
                  AND desactivada_en IS NULL) THEN
      RAISE EXCEPTION 'usuario_en_uso';
    END IF;
    BEGIN
      UPDATE usuarios SET nombre_de_usuario = v_nombre WHERE id = v_usuario;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'usuario_en_uso';
    END;
  END IF;

  UPDATE auth.users
     SET encrypted_password = extensions.crypt(p_clave, extensions.gen_salt('bf', 10)),
         updated_at = now()
   WHERE id = v_usuario;
  IF NOT FOUND THEN RAISE EXCEPTION 'activar_la_cuenta: la cuenta no tiene ingreso'; END IF;

  RETURN v_usuario;
END;
$function$;

-- LAS DESACTIVADAS LAS VE SÓLO EL ADMINISTRADOR DE LA PRESTADORA. El soporte técnico con un permiso
-- de acceso abierto sigue viendo las activas, y la coordinación sigue viendo sólo su propia fila.
DROP POLICY IF EXISTS la_administracion_ve_las_cuentas_del_panel_de_su_prestadora ON public.usuarios;
CREATE POLICY la_administracion_ve_las_cuentas_del_panel_de_su_prestadora
  ON public.usuarios
  FOR SELECT
  TO authenticated
  USING (
    rol IN ('admin_prestadora', 'coordinador')
    AND interno.es_la_administracion_de_la_prestadora(prestadora_id)
    AND (desactivada_en IS NULL OR interno.es_admin_prestadora())
  );

-- La reactivación queda en el registro de actividad con su propio nombre.
INSERT INTO public.catalogo_acciones_registradas (accion, grupo, orden)
VALUES ('reactivacion_de_cuenta', 'permisos_y_membresia', 19)
ON CONFLICT (accion) DO NOTHING;

-- LA REACTIVACIÓN. Corre con la sesión de quien la pide: sin sesión, sin ser el Administrador de la
-- Prestadora o sin Prestadora resuelta, no hace nada y contesta falso.
CREATE OR REPLACE FUNCTION public.reactivar_la_cuenta(p_usuario uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid;
  v_quien uuid := auth.uid();
  v_rol text;
  v_email text;
  v_nombre_de_usuario text;
BEGIN
  IF v_quien IS NULL OR p_usuario IS NULL THEN RETURN false; END IF;
  IF NOT coalesce(interno.es_admin_prestadora(), false) THEN RETURN false; END IF;
  v_prestadora := interno.prestadora_actual();
  IF v_prestadora IS NULL THEN RETURN false; END IF;

  SELECT rol, lower(email), lower(nombre_de_usuario)
    INTO v_rol, v_email, v_nombre_de_usuario
    FROM usuarios
   WHERE id = p_usuario
     AND prestadora_id = v_prestadora
     AND rol = 'coordinador'
     AND desactivada_en IS NOT NULL
   FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_nombre_de_usuario IS NOT NULL AND EXISTS (
    SELECT 1 FROM usuarios
     WHERE lower(nombre_de_usuario) = v_nombre_de_usuario
       AND desactivada_en IS NULL AND id <> p_usuario) THEN
    RAISE EXCEPTION 'reactivacion_usuario_en_uso';
  END IF;
  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM usuarios
     WHERE prestadora_id = v_prestadora AND lower(email) = v_email
       AND desactivada_en IS NULL AND id <> p_usuario) THEN
    RAISE EXCEPTION 'reactivacion_correo_en_uso';
  END IF;

  BEGIN
    UPDATE usuarios
       SET desactivada_en = NULL,
           motivo_de_la_desactivacion = NULL
     WHERE id = p_usuario;
  EXCEPTION WHEN unique_violation THEN
    -- Otra cuenta tomó el nombre o el email entre la comprobación y la escritura: el índice decide.
    IF v_nombre_de_usuario IS NOT NULL AND EXISTS (
      SELECT 1 FROM usuarios
       WHERE lower(nombre_de_usuario) = v_nombre_de_usuario
         AND desactivada_en IS NULL AND id <> p_usuario) THEN
      RAISE EXCEPTION 'reactivacion_usuario_en_uso';
    END IF;
    RAISE EXCEPTION 'reactivacion_correo_en_uso';
  END;

  -- La cuenta de ingreso vuelve a entrar con la clave que tenía.
  UPDATE auth.users
     SET banned_until = NULL,
         updated_at = now()
   WHERE id = p_usuario;

  INSERT INTO registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, detalle)
  VALUES (v_prestadora, v_quien, 'reactivacion_de_cuenta', 'usuarios', p_usuario,
          jsonb_build_object('rol_nuevo', v_rol));

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.reactivar_la_cuenta(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reactivar_la_cuenta(uuid) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
