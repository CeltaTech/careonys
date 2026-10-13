-- «Huella» y «hash» pasan a ser «identificador de verificación» (glosario de la empresa). En los
-- nombres guardados, la forma corta: `verificador`. Sólo cambian nombres y comentarios; ningún
-- dato se toca.
BEGIN;

ALTER TABLE public.codigos_al_telefono RENAME COLUMN codigo_huella TO codigo_verificador;
ALTER TABLE public.codigos_de_presencia RENAME COLUMN codigo_huella TO codigo_verificador;
ALTER TABLE public.guardia_comprobaciones RENAME COLUMN codigo_huella TO codigo_verificador;
ALTER TABLE public.instrucciones_acceso_personas_autorizadas RENAME COLUMN codigo_huella TO codigo_verificador;
ALTER TABLE public.instrucciones_acceso_personas_autorizadas RENAME COLUMN documento_huella TO documento_verificador;
ALTER TABLE public.consentimientos_medicacion RENAME COLUMN documento_huella TO documento_verificador;
ALTER TABLE public.consentimientos_pagador RENAME COLUMN documento_huella TO documento_verificador;
ALTER TABLE public.equipos_conocidos RENAME COLUMN marca_huella TO marca_verificador;
ALTER TABLE public.pedidos_de_clave_nueva RENAME COLUMN correo_huella TO correo_verificador;
ALTER TABLE public.pedidos_de_codigo_al_telefono RENAME COLUMN telefono_huella TO telefono_verificador;
ALTER TABLE public.telefonos_confirmados_por_la_prestadora RENAME COLUMN telefono_huella TO telefono_verificador;
ALTER TABLE public.mfa_codigos_recuperacion RENAME COLUMN codigo_hash TO codigo_verificador;

ALTER TABLE public.tokens_activacion_cuenta
  RENAME CONSTRAINT tokens_activacion_cuenta_token_es_huella TO tokens_activacion_cuenta_token_es_verificador;
ALTER TABLE public.tokens_recuperacion_clave
  RENAME CONSTRAINT tokens_recuperacion_clave_token_es_huella TO tokens_recuperacion_clave_token_es_verificador;
ALTER TABLE public.consentimientos_medicacion
  RENAME CONSTRAINT consentimientos_medicacion_documento_huella_check TO consentimientos_medicacion_documento_verificador_check;

-- El cuerpo de una función no sigue el cambio de nombre de una columna: se vuelve a escribir.
-- `CREATE OR REPLACE` conserva los permisos que ya tiene cada una.
CREATE OR REPLACE FUNCTION interno.la_firma_es_sobre_el_texto_de_la_prestadora()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
begin
  if tg_op = 'UPDATE' and old.estado = 'cerrado'
     and (new.documento_texto is distinct from old.documento_texto
          or new.documento_verificador is distinct from old.documento_verificador
          or new.estado is distinct from old.estado) then
    raise exception 'Lo que ya se firmó no se cambia.' using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.poner_clave_con_codigo(p_uso text, p_codigo text, p_clave text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid;
  v_usuario uuid;
  v_verificador text;
BEGIN
  IF auth.jwt() ->> 'role' IS DISTINCT FROM 'trabajo_sin_persona' THEN RETURN NULL; END IF;
  v_prestadora := interno.current_tenant();
  IF v_prestadora IS NULL OR coalesce(p_codigo, '') = '' OR coalesce(p_clave, '') = '' THEN
    RETURN NULL;
  END IF;

  -- Llega el enlace tal como vino en el correo; lo guardado es su identificador de verificación.
  v_verificador := encode(extensions.digest(p_codigo, 'sha256'), 'hex');

  IF p_uso = 'activacion' THEN
    UPDATE tokens_activacion_cuenta t SET usado_en = now()
      FROM usuarios u
     WHERE t.token = v_verificador AND t.usado_en IS NULL AND t.expira_en > now()
       AND u.id = t.usuario_id AND u.prestadora_id = v_prestadora
       AND u.rol IN ('coordinador', 'asistente', 'cliente')
    RETURNING t.usuario_id INTO v_usuario;
  ELSIF p_uso = 'recuperacion' THEN
    UPDATE tokens_recuperacion_clave t SET usado_en = now()
      FROM usuarios u
     WHERE t.token = v_verificador AND t.usado_en IS NULL AND t.expira_en > now()
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

COMMENT ON TABLE public.codigos_de_presencia IS
  'El código de seis dígitos que una persona muestra en la pantalla de su teléfono para que el Asistente que llega compruebe que está en la casa (pendiente #113, Plan A). Se guarda su identificador de verificación y vence solo a los segundos que configuró la Prestadora.';
COMMENT ON COLUMN public.consentimientos_pagador.documento_verificador IS
  'Identificador de verificación del texto firmado. Si alguien le mueve una coma, deja de coincidir.';
COMMENT ON TABLE public.codigos_al_telefono IS
  'El código corto que se le manda al teléfono de una persona. Se guarda el identificador de verificación del código, nunca el código. Lo escribe y lo lee únicamente el backend.';
COMMENT ON TABLE public.pedidos_de_codigo_al_telefono IS
  'Un renglón por cada código que se mandó, para poder frenar al que pide de más. Guarda el identificador de verificación del número y no el número: para contar alcanza, y así acá no queda a quién se le mandó nada.';
COMMENT ON TABLE public.pedidos_de_clave_nueva IS
  'Un renglón por cada pedido de clave nueva, para poder frenar al que pide de más. Guarda el identificador de verificación del correo y no el correo: para contar alcanza, y así acá no queda quién pidió nada.';
COMMENT ON TABLE public.equipos_conocidos IS
  'Los aparatos desde los que esta persona ya entró. Guarda el identificador de verificación de una marca que emitió el backend y que el navegador conserva, nunca nada del aparato ni de dónde se conecta.';
COMMENT ON TABLE public.telefonos_confirmados_por_la_prestadora IS
  'Quien atiende el llamado confirma que ese número es de esa persona, y con eso el número no espera nada para servir de llave. Guarda el identificador de verificación del número, no el número.';
COMMENT ON FUNCTION interno.numero_comparable(text) IS
  'El identificador de verificación de un teléfono, para comparar dos números sin guardar ni mostrar ninguno.';
COMMENT ON COLUMN public.usuarios.telefono_comparable IS
  'El identificador de verificación del teléfono, para comparar dos números sin que ninguno viaje ni quede escrito. Lo calcula la base.';

COMMIT;

NOTIFY pgrst, 'reload schema';
