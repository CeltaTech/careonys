-- El alta de una Prestadora, hecha por CeltaTech.
--
-- Sólo CeltaTech da de alta una Prestadora. Lo hace por una puerta firmada del backend, y esa
-- puerta, una vez comprobada la firma, llama a la función de abajo. La función hace el alta
-- entera en una sola operación de la base: si cualquier parte falla, no queda nada a medias.
--
-- Qué guarda:
--   - La Prestadora, con los datos del contrato que manda CeltaTech. La moneda la pone sola la
--     base a partir del país.
--   - La referencia de CeltaTech, como texto que acá no se interpreta. Con ella, un alta repetida
--     devuelve la misma Prestadora en vez de crear otra.
--   - El código de la Prestadora, que elige CeltaTech y que acá no se elige ni se cambia.
--   - La casilla de envío, el correo al que se reenvían las respuestas y la regla del reenvío.
--   - La cuenta del Administrador, que es el único que nombra CeltaTech.
--   - El renglón del registro de actividad.
--
-- POR QUÉ NO ES UNA LLAVE MAESTRA. La función no lee ni cambia ninguna Prestadora que ya exista.
-- Sólo crea una nueva. Ante una referencia que ya existe contesta el identificador de esa sola
-- Prestadora, que es el dato que CeltaTech ya tiene. La puede llamar únicamente la cuenta
-- automática que no tiene Prestadora, la que hoy sólo pide la lista a recorrer. Y mientras corre,
-- la sesión queda apuntando a la Prestadora recién creada y a ninguna otra, sólo adentro de esta
-- operación: es lo que deja sembrar su configuración.

BEGIN;

-- La referencia de CeltaTech. Es texto opaco: Careonys no supone qué forma tiene.
ALTER TABLE public.prestadoras ADD COLUMN referencia_celtatech text;

COMMENT ON COLUMN public.prestadoras.referencia_celtatech IS
  'Con qué identifica CeltaTech el alta de esta Prestadora. Llega con el alta, no se interpreta y no cambia. Con ella un alta repetida devuelve la misma Prestadora.';

CREATE UNIQUE INDEX prestadoras_referencia_celtatech_unica
  ON public.prestadoras (referencia_celtatech)
  WHERE referencia_celtatech IS NOT NULL;

-- La acción del registro de actividad. La hace el sistema: no hay una persona de la Prestadora
-- detrás.
INSERT INTO public.catalogo_acciones_registradas (accion, grupo, orden, la_hace_el_sistema)
SELECT 'alta_de_la_prestadora', 'permisos_y_membresia', COALESCE(max(orden), 0) + 1, true
  FROM public.catalogo_acciones_registradas
ON CONFLICT DO NOTHING;

CREATE FUNCTION public.dar_de_alta_la_prestadora(
  p_referencia            text,
  p_razon_social          text,
  p_identificacion_fiscal text,
  p_pais                  text,
  p_nombre_fantasia       text,
  p_codigo                text,
  p_casilla_envio         text,
  p_email_respuestas      text,
  p_regla_reenvio         text,
  p_admin_nombre          text,
  p_admin_email           text,
  p_admin_telefono        text
) RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'interno'
AS $$
DECLARE
  v_pase         jsonb := COALESCE(auth.jwt(), '{}'::jsonb);
  v_pase_crudo   text  := current_setting('request.jwt.claims', true);
  v_id           uuid;
  v_admin        uuid;
  v_email        text  := lower(btrim(COALESCE(p_admin_email, '')));
  v_restriccion  text;
  v_mensaje      text;
BEGIN
  -- Sólo la cuenta automática sin Prestadora. Una cuenta de una Prestadora, aunque sea del
  -- trabajo sin persona, no da de alta otra.
  IF v_pase ->> 'role' IS DISTINCT FROM 'trabajo_sin_persona'
     OR COALESCE(v_pase ->> 'prestadora_id', '') <> ''
     OR v_pase ->> 'trabajo' IS NOT NULL THEN
    RAISE EXCEPTION 'sin_permiso';
  END IF;

  IF NULLIF(btrim(COALESCE(p_referencia, '')), '') IS NULL
     OR NULLIF(btrim(COALESCE(p_razon_social, '')), '') IS NULL
     OR NULLIF(btrim(COALESCE(p_pais, '')), '') IS NULL
     OR NULLIF(btrim(COALESCE(p_nombre_fantasia, '')), '') IS NULL
     OR NULLIF(btrim(COALESCE(p_codigo, '')), '') IS NULL
     OR NULLIF(btrim(COALESCE(p_admin_nombre, '')), '') IS NULL
     OR v_email = '' THEN
    RAISE EXCEPTION 'faltan_datos';
  END IF;

  -- El alta repetida devuelve la misma Prestadora.
  SELECT id INTO v_id FROM prestadoras WHERE referencia_celtatech = p_referencia;
  IF FOUND THEN
    RETURN jsonb_build_object('prestadora_id', v_id, 'creada', false);
  END IF;

  v_id := gen_random_uuid();

  BEGIN
    -- La sesión apunta a la Prestadora nueva, y a ninguna otra, mientras dura esta operación.
    -- Es lo que piden los disparadores que siembran su configuración.
    PERFORM set_config('request.jwt.claims',
                       (v_pase || jsonb_build_object('prestadora_id', v_id))::text, true);

    INSERT INTO prestadoras (id, razon_social, identificacion_fiscal, pais, nombre_fantasia,
                             casilla_envio, regla_reenvio, referencia_celtatech, fecha_alta)
    VALUES (v_id, btrim(p_razon_social), NULLIF(btrim(COALESCE(p_identificacion_fiscal, '')), ''),
            upper(btrim(p_pais)), btrim(p_nombre_fantasia), NULLIF(btrim(COALESCE(p_casilla_envio, '')), ''),
            NULLIF(btrim(COALESCE(p_regla_reenvio, '')), ''), p_referencia, current_date);

    -- El código y el correo que recibe las respuestas viven en la configuración, que el
    -- disparador de la Prestadora ya sembró.
    UPDATE configuracion_prestadora
       SET dominio = p_codigo,
           email   = NULLIF(lower(btrim(COALESCE(p_email_respuestas, ''))), ''),
           updated_at = now()
     WHERE prestadora_id = v_id;

    -- La cuenta del Administrador. Entra con su correo. La contraseña nace al azar y nadie la
    -- conoce: la que va a usar se la da CeltaTech.
    v_admin := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_admin, 'authenticated', 'authenticated', v_email,
      extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf', 10)),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
      '', '', '', '', '', '', '', ''
    );

    INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (v_admin::text, v_admin,
            jsonb_build_object('sub', v_admin::text, 'email', v_email, 'email_verified', true),
            'email', NULL, now(), now());

    INSERT INTO usuarios (id, rol, nombre, telefono, email, prestadora_id, nombre_de_usuario)
    VALUES (v_admin, 'admin_prestadora', btrim(p_admin_nombre),
            NULLIF(btrim(COALESCE(p_admin_telefono, '')), ''), v_email, v_id, NULL);

    INSERT INTO registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, detalle)
    VALUES (v_id, NULL, 'alta_de_la_prestadora', 'prestadoras', v_id,
            jsonb_build_object('rol_nuevo', 'admin_prestadora'));

    PERFORM set_config('request.jwt.claims', COALESCE(v_pase_crudo, ''), true);

  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_restriccion = CONSTRAINT_NAME;
      PERFORM set_config('request.jwt.claims', COALESCE(v_pase_crudo, ''), true);

      -- Dos altas iguales a la vez: la otra ganó, y se devuelve la suya.
      IF v_restriccion = 'prestadoras_referencia_celtatech_unica' THEN
        SELECT id INTO v_id FROM prestadoras WHERE referencia_celtatech = p_referencia;
        RETURN jsonb_build_object('prestadora_id', v_id, 'creada', false);
      END IF;

      RAISE EXCEPTION '%', CASE
        WHEN v_restriccion IN ('configuracion_prestadora_dominio_key', 'configuracion_prestadora_dominio_unico') THEN 'codigo_en_uso'
        WHEN v_restriccion = 'prestadoras_casilla_envio_unica' THEN 'casilla_en_uso'
        WHEN v_restriccion = 'prestadoras_nombre_fantasia_unico' THEN 'nombre_en_uso'
        WHEN v_restriccion LIKE 'users_%' OR v_restriccion LIKE 'identities_%' THEN 'correo_de_administracion_en_uso'
        ELSE 'dato_en_uso'
      END;

    WHEN raise_exception THEN
      GET STACKED DIAGNOSTICS v_mensaje = MESSAGE_TEXT;
      PERFORM set_config('request.jwt.claims', COALESCE(v_pase_crudo, ''), true);

      RAISE EXCEPTION '%', CASE
        WHEN v_mensaje = 'la_direccion_de_la_prestadora_no_tiene_forma' THEN 'codigo_mal_escrito'
        WHEN v_mensaje LIKE 'No se sabe en qué moneda trabaja%' THEN 'pais_sin_moneda'
        ELSE 'alta_rechazada'
      END;
  END;

  RETURN jsonb_build_object('prestadora_id', v_id, 'creada', true);
END;
$$;

ALTER FUNCTION public.dar_de_alta_la_prestadora(text, text, text, text, text, text, text, text, text, text, text, text) OWNER TO postgres;

COMMENT ON FUNCTION public.dar_de_alta_la_prestadora(text, text, text, text, text, text, text, text, text, text, text, text) IS
  'El alta de una Prestadora que hace CeltaTech, entera o nada. Sólo la llama la cuenta automática sin Prestadora. No lee ni cambia ninguna Prestadora existente.';

REVOKE ALL ON FUNCTION public.dar_de_alta_la_prestadora(text, text, text, text, text, text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dar_de_alta_la_prestadora(text, text, text, text, text, text, text, text, text, text, text, text) TO trabajo_sin_persona;

COMMIT;

NOTIFY pgrst, 'reload schema';
