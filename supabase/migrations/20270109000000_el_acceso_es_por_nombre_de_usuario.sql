-- EL ACCESO ES POR NOMBRE DE USUARIO, Y EL EMAIL QUEDA COMO DATO DE CONTACTO.
--
-- Asistentes y Clientes entran con un nombre de usuario que eligen al activar la cuenta, y la
-- coordinación con el suyo, `parte_código`, que le asigna el Administrador. El nombre es único en
-- todo el sistema, sin distinguir mayúsculas, así que alcanza para encontrar la cuenta sin saber de
-- qué Prestadora es.
--
-- La dirección con que el servicio de acceso conoce a cada cuenta deja de salir del email: pasa a
-- ser `<cuenta>@acceso.careonys.invalid`. Corregir el email ya no toca el acceso, y la clave de
-- nadie cambia.
--
-- El email se sigue guardando en cuatro lugares —la cuenta, el Legajo del Asistente, la Ficha del
-- Cliente y las personas autorizadas— y la base los mantiene iguales. Cuando cambia el de una
-- cuenta, queda auditado y se le avisa al email anterior.

BEGIN;

-- 1. La regla del nombre que elige la persona. Es la misma que `backend/src/config/reglaDeUsuario.js`,
--    y `scripts/verificar_regla_de_usuario.mjs` comprueba que no se despeguen.
CREATE OR REPLACE FUNCTION interno.usuario_elegido_bien_escrito(p_usuario text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(p_usuario ~ '^[a-z0-9._-]{4,12}$', false);
$$;

REVOKE ALL ON FUNCTION interno.usuario_elegido_bien_escrito(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.usuario_elegido_bien_escrito(text)
  TO authenticated, service_role, trabajo_sin_persona;

-- 2. El nombre es único en todo el sistema, y la coordinación lo guarda completo.
DROP INDEX public.usuarios_nombre_de_usuario_unico_en_la_prestadora;

ALTER TABLE public.usuarios DROP CONSTRAINT nombre_de_usuario_bien_escrito;

UPDATE public.usuarios u
   SET nombre_de_usuario = u.nombre_de_usuario || '_' || c.dominio
  FROM public.configuracion_prestadora c
 WHERE c.prestadora_id = u.prestadora_id
   AND u.rol = 'coordinador'
   AND u.nombre_de_usuario IS NOT NULL
   AND c.dominio IS NOT NULL
   AND position('_' IN u.nombre_de_usuario) = 0;

ALTER TABLE public.usuarios ADD CONSTRAINT nombre_de_usuario_bien_escrito CHECK (
  nombre_de_usuario IS NULL
  OR interno.usuario_elegido_bien_escrito(nombre_de_usuario)
  OR nombre_de_usuario ~ '^[a-z0-9]([a-z0-9._-]{0,38}[a-z0-9])?_[a-z0-9.-]+$'
);

CREATE UNIQUE INDEX usuarios_nombre_de_usuario_unico
  ON public.usuarios (lower(nombre_de_usuario))
  WHERE nombre_de_usuario IS NOT NULL;

-- 3. Cada Asistente y cada Cliente que ya existe recibe un nombre sacado del suyo: minúsculas, sin
--    tildes, dentro de la regla y sin repetirse. No se le manda nada a nadie.
DO $$
DECLARE
  r record;
  v_texto text;
  v_palabras text[];
  v_base text;
  v_candidato text;
  v_n int;
BEGIN
  FOR r IN
    SELECT id, nombre FROM public.usuarios
     WHERE rol IN ('asistente', 'cliente') AND nombre_de_usuario IS NULL
     ORDER BY created_at, id
  LOOP
    v_texto := lower(translate(coalesce(r.nombre, ''),
      'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
      'aaaaaeeeeiiiiooooouuuuncaaaaaeeeeiiiiooooouuuunc'));
    v_palabras := array_remove(regexp_split_to_array(regexp_replace(v_texto, '[^a-z0-9]+', ' ', 'g'), ' '), '');
    v_palabras := ARRAY(SELECT w FROM unnest(v_palabras) AS w
                         WHERE w NOT IN ('demo', 'import', 'cliente', 'asistente'));
    v_base := CASE
      WHEN coalesce(array_length(v_palabras, 1), 0) = 0 THEN 'cuenta'
      WHEN array_length(v_palabras, 1) = 1 THEN v_palabras[1]
      ELSE v_palabras[1] || '.' || v_palabras[array_length(v_palabras, 1)]
    END;
    v_base := rtrim(left(v_base, 12), '.');

    v_n := 0;
    LOOP
      v_candidato := CASE WHEN v_n = 0 THEN v_base
                          ELSE rtrim(left(v_base, 12 - length(v_n::text)), '.') || v_n::text END;
      EXIT WHEN interno.usuario_elegido_bien_escrito(v_candidato)
            AND NOT EXISTS (SELECT 1 FROM public.usuarios WHERE lower(nombre_de_usuario) = v_candidato);
      v_n := v_n + 1;
    END LOOP;

    UPDATE public.usuarios SET nombre_de_usuario = v_candidato WHERE id = r.id;
  END LOOP;
END;
$$;

-- 4. La dirección del servicio de acceso deja de salir del email.
UPDATE auth.users a
   SET email = a.id::text || '@acceso.careonys.invalid',
       updated_at = now()
  FROM public.usuarios u
 WHERE u.id = a.id
   AND u.rol IN ('coordinador', 'asistente', 'cliente')
   AND a.email IS DISTINCT FROM a.id::text || '@acceso.careonys.invalid';

UPDATE auth.identities i
   SET identity_data = jsonb_set(i.identity_data, '{email}', to_jsonb(i.user_id::text || '@acceso.careonys.invalid')),
       updated_at = now()
  FROM public.usuarios u
 WHERE u.id = i.user_id
   AND i.provider = 'email'
   AND u.rol IN ('coordinador', 'asistente', 'cliente')
   AND i.identity_data ->> 'email' IS DISTINCT FROM i.user_id::text || '@acceso.careonys.invalid';

-- 5. El Cliente de la Prestadora Demo que nunca entró queda con datos inventados.
UPDATE public.usuarios
   SET email = 'cliente.pirulito@example.com',
       telefono = '11 4000-0999'
 WHERE id = '5f1308cc-f3fb-4ecf-90c5-70dba26a5c94';

UPDATE public.personas
   SET email = 'cliente.pirulito@example.com',
       documento_tipo = 'cuil', documento_numero = '20399990018', dni = '39999001', genero = 'masculino',
       calle = NULL, numero = NULL, piso = NULL, unidad = NULL, lat = NULL, lng = NULL, codigo_postal = NULL
 WHERE id = 'fffc688b-92c5-4a5e-8882-cfa0adea8b15';

UPDATE public.telefonos_de_la_persona
   SET telefono = '11 4000-0999'
 WHERE persona_id = 'fffc688b-92c5-4a5e-8882-cfa0adea8b15';

UPDATE public.personas
   SET documento_tipo = 'cuil', documento_numero = '20399990026', dni = '39999002', genero = 'masculino',
       calle = 'Calle Inventada', numero = '100', piso = NULL, unidad = NULL, lat = NULL, lng = NULL
 WHERE id = '577742db-7fa5-4c13-a240-a6c5751cf205';

UPDATE public.personas
   SET documento_tipo = 'cuil', documento_numero = '27399990039', dni = '39999003', genero = 'femenino',
       calle = 'Calle Inventada', numero = '200', piso = NULL, unidad = NULL, lat = NULL, lng = NULL
 WHERE id = '4af25866-03ee-4de5-b4cc-cbc4c7ab7180';

-- 6. Los cuatro lugares del email quedan iguales. Manda el de la cuenta, que es al que hoy llegan
--    los enlaces. Se hace antes de crear los disparadores de abajo, para que no salga ningún aviso
--    ni quede auditado un cambio que nadie hizo.
UPDATE public.asistentes a
   SET email = u.email
  FROM public.usuarios u
 WHERE u.id = a.usuario_id
   AND u.email IS NOT NULL
   AND a.email IS DISTINCT FROM u.email;

UPDATE public.personas p
   SET email = u.email
  FROM public.clientes c
  JOIN public.usuarios u ON u.id = c.usuario_id
 WHERE p.id = c.contratante_persona_id
   AND u.email IS NOT NULL
   AND p.email IS DISTINCT FROM u.email;

UPDATE public.personas_autorizadas pa
   SET email = u.email
  FROM public.usuarios u
 WHERE u.id = pa.usuario_id
   AND u.email IS NOT NULL
   AND pa.email IS DISTINCT FROM u.email;

-- 7. El alta de la cuenta.
CREATE OR REPLACE FUNCTION public.dar_de_alta_la_cuenta(
  p_email text, p_clave text, p_rol text, p_nombre text, p_telefono text,
  p_nombre_de_usuario text DEFAULT NULL::text)
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

  IF EXISTS (SELECT 1 FROM usuarios WHERE prestadora_id = v_prestadora AND lower(email) = v_correo) THEN
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
    IF EXISTS (SELECT 1 FROM usuarios WHERE lower(nombre_de_usuario) = v_nombre_de_usuario) THEN
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
       AND EXISTS (SELECT 1 FROM usuarios WHERE lower(nombre_de_usuario) = v_nombre_de_usuario) THEN
      RAISE EXCEPTION 'usuario_en_uso';
    END IF;
    RAISE EXCEPTION 'correo_de_esta_prestadora';
  END;
  RETURN v_usuario;
END;
$function$;

-- 8. La activación: el enlace se gasta, el nombre se guarda y la clave se pone, todo junto.
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
    IF EXISTS (SELECT 1 FROM usuarios WHERE lower(nombre_de_usuario) = v_nombre AND id <> v_usuario) THEN
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

REVOKE ALL ON FUNCTION public.activar_la_cuenta(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activar_la_cuenta(text, text, text) TO service_role, trabajo_sin_persona;

-- 9. Qué cuenta nombra un nombre de usuario. Lo pregunta el ingreso y la recuperación de la clave,
--    que todavía no saben de qué Prestadora es. Devuelve la cuenta y su Prestadora, nada más.
CREATE OR REPLACE FUNCTION public.cuenta_del_usuario(p_usuario text)
RETURNS TABLE (id uuid, prestadora_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $function$
  SELECT u.id, u.prestadora_id
    FROM usuarios u
   WHERE auth.jwt() ->> 'role' = 'trabajo_sin_persona'
     AND u.rol IN ('coordinador', 'asistente', 'cliente')
     AND u.nombre_de_usuario IS NOT NULL
     AND lower(u.nombre_de_usuario) = lower(btrim(coalesce(p_usuario, ''), E' \t\r\n'));
$function$;

REVOKE ALL ON FUNCTION public.cuenta_del_usuario(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuenta_del_usuario(text) TO service_role, trabajo_sin_persona;

-- 10. El tope de pedidos de clave nueva cuenta por cuenta.
DELETE FROM public.pedidos_de_clave_nueva;
ALTER TABLE public.pedidos_de_clave_nueva
  ADD COLUMN usuario_id uuid NOT NULL REFERENCES public.usuarios (id) ON DELETE CASCADE;
ALTER TABLE public.pedidos_de_clave_nueva DROP COLUMN correo_verificador;
CREATE INDEX pedidos_de_clave_nueva_por_cuenta
  ON public.pedidos_de_clave_nueva (prestadora_id, usuario_id, pedido_en);

-- 11. Los avisos al email anterior. La base anota el cambio y el backend manda el mensaje.
CREATE TABLE public.avisos_de_email_cambiado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras (id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES public.usuarios (id) ON DELETE CASCADE,
  email_anterior text NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.avisos_de_email_cambiado ENABLE ROW LEVEL SECURITY;

CREATE POLICY trabajo_sin_persona_de_esta_prestadora
  ON public.avisos_de_email_cambiado
  FOR ALL TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual())
  WITH CHECK (prestadora_id = interno.prestadora_actual());

REVOKE ALL ON public.avisos_de_email_cambiado FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.avisos_de_email_cambiado TO trabajo_sin_persona;

INSERT INTO public.catalogo_acciones_registradas (accion, grupo, orden)
VALUES ('cambio_de_email', 'modificacion_critica', 17);

-- 12. Los cuatro lugares del email se mantienen iguales.
--
--     La cuenta es el centro: un cambio en el Legajo, en la Ficha del Cliente titular o en las
--     personas autorizadas pasa a la cuenta, y de la cuenta a los demás. Cada paso escribe sólo si
--     el valor es distinto, así que la vuelta termina sola. Un email vacío no se copia: borrar el
--     de una Ficha no deja a la cuenta sin dónde recibir el enlace de la clave.
CREATE OR REPLACE FUNCTION interno.el_email_pasa_a_la_cuenta(p_cuenta uuid, p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, ''), E' \t\r\n'));
BEGIN
  IF p_cuenta IS NULL OR v_email = '' THEN RETURN; END IF;
  UPDATE usuarios SET email = v_email
   WHERE id = p_cuenta AND email IS DISTINCT FROM v_email;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'correo_de_esta_prestadora';
END;
$function$;

REVOKE ALL ON FUNCTION interno.el_email_pasa_a_la_cuenta(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION interno.el_email_del_legajo_pasa_a_la_cuenta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  PERFORM interno.el_email_pasa_a_la_cuenta(NEW.usuario_id, NEW.email);
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION interno.el_email_de_la_ficha_pasa_a_la_cuenta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_cuenta uuid;
BEGIN
  FOR v_cuenta IN SELECT usuario_id FROM clientes WHERE contratante_persona_id = NEW.id LOOP
    PERFORM interno.el_email_pasa_a_la_cuenta(v_cuenta, NEW.email);
  END LOOP;
  RETURN NULL;
END;
$function$;

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
   WHERE usuario_id = NEW.id AND lower(btrim(coalesce(email, ''))) IS DISTINCT FROM NEW.email;

  UPDATE personas p SET email = NEW.email
    FROM clientes c
   WHERE c.usuario_id = NEW.id AND p.id = c.contratante_persona_id
     AND lower(btrim(coalesce(p.email, ''))) IS DISTINCT FROM NEW.email;

  UPDATE personas_autorizadas SET email = NEW.email
   WHERE usuario_id = NEW.id AND lower(btrim(coalesce(email, ''))) IS DISTINCT FROM NEW.email;

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

REVOKE ALL ON FUNCTION interno.el_email_del_legajo_pasa_a_la_cuenta() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION interno.el_email_de_la_ficha_pasa_a_la_cuenta() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION interno.el_email_de_la_cuenta_pasa_a_los_demas() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER el_email_del_legajo_pasa_a_la_cuenta
  AFTER UPDATE OF email ON public.asistentes
  FOR EACH ROW
  WHEN (NEW.email IS DISTINCT FROM OLD.email)
  EXECUTE FUNCTION interno.el_email_del_legajo_pasa_a_la_cuenta();

CREATE TRIGGER el_email_de_la_ficha_pasa_a_la_cuenta
  AFTER UPDATE OF email ON public.personas
  FOR EACH ROW
  WHEN (NEW.email IS DISTINCT FROM OLD.email)
  EXECUTE FUNCTION interno.el_email_de_la_ficha_pasa_a_la_cuenta();

CREATE TRIGGER el_email_de_las_personas_autorizadas_pasa_a_la_cuenta
  AFTER UPDATE OF email ON public.personas_autorizadas
  FOR EACH ROW
  WHEN (NEW.email IS DISTINCT FROM OLD.email)
  EXECUTE FUNCTION interno.el_email_del_legajo_pasa_a_la_cuenta();

CREATE TRIGGER el_email_de_la_cuenta_pasa_a_los_demas
  AFTER UPDATE OF email ON public.usuarios
  FOR EACH ROW
  WHEN (NEW.email IS DISTINCT FROM OLD.email)
  EXECUTE FUNCTION interno.el_email_de_la_cuenta_pasa_a_los_demas();

-- 13. Los mensajes: el de la activación ya no lleva el código de la Prestadora, y el aviso del
--     email cambiado se suma a los de seguridad, que ninguna Prestadora reescribe.
DELETE FROM public.mensajes_del_sistema
 WHERE prestadora_id IS NULL AND clave = 'activacion_cuenta.codigo_prestadora';

INSERT INTO public.mensajes_del_sistema (clave, i18n, admite_texto_propio, activo) VALUES
  ('email_cambiado.asunto',
   '{"es-AR": "Cambió el email de su cuenta", "en": "Your account email changed", "pt-BR": "O e-mail da sua conta mudou"}'::jsonb,
   false, true),
  ('email_cambiado.texto',
   '{"es-AR": "El email de su cuenta en {{empresa}} cambió. Si usted no pidió este cambio, comuníquese con {{empresa}}.", "en": "The email on your {{empresa}} account changed. If you did not request this change, contact {{empresa}}.", "pt-BR": "O e-mail da sua conta na {{empresa}} mudou. Se você não pediu esta alteração, entre em contato com {{empresa}}."}'::jsonb,
   false, true);

COMMIT;

NOTIFY pgrst, 'reload schema';
