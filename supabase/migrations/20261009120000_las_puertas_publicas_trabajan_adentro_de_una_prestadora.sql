-- Las puertas públicas trabajan adentro de una Prestadora: de cuál es una dirección, y poner la
-- clave con el código que llegó por correo.
--
-- 1. De qué Prestadora es una dirección pública.
--
-- Las puertas que se abren sin sesión —el sitio de una Prestadora, sus formularios, la pantalla de
-- entrada— traen la Prestadora en la dirección: `configuracion_prestadora.dominio`. Quien golpea
-- todavía no es de ninguna, así que entra con la credencial del trabajo sin persona y sin
-- Prestadora, que sólo le deja hacer esta pregunta. Con la respuesta se genera la credencial de
-- esa Prestadora, y todo lo que sigue corre adentro de ella.
--
-- Devuelve el identificador y nada más, y sólo al trabajo sin persona: es el mismo molde que
-- `prestadoras_a_recorrer`. Una dirección que no existe devuelve vacío, y la puerta contesta
-- que no la reconoce.

BEGIN;

CREATE OR REPLACE FUNCTION public.prestadora_de_la_direccion(p_direccion text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT prestadora_id FROM configuracion_prestadora
   WHERE auth.jwt() ->> 'role' = 'trabajo_sin_persona'
     AND dominio = lower(trim(p_direccion))
$function$;
REVOKE ALL ON FUNCTION public.prestadora_de_la_direccion(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prestadora_de_la_direccion(text) TO trabajo_sin_persona;

-- Poner la clave con el código de un solo uso que llegó por correo: al activar la cuenta o al
-- recuperar la clave. Quien lo pide todavía no tiene sesión, y lo que lo autoriza es el código.
--
-- El código se busca sólo en las cuentas de la Prestadora por la que se entró —la de la
-- credencial—, así que uno de otra Prestadora no se encuentra. Se toma y se pone la clave en una
-- sola operación: o pasan las dos cosas o ninguna, y dos pedidos con el mismo código no pasan los
-- dos. Sin llave maestra: la cuenta de ingreso vive en esta misma base.
--
-- Sólo para la gente de la Prestadora: la clave del Administrador y la del equipo técnico las
-- maneja CeltaTech, no el producto.
--
-- Devuelve la cuenta a la que se le puso la clave, o vacío si el código no sirve.
CREATE OR REPLACE FUNCTION public.poner_clave_con_codigo(p_uso text, p_codigo text, p_clave text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid;
  v_usuario uuid;
BEGIN
  IF auth.jwt() ->> 'role' IS DISTINCT FROM 'trabajo_sin_persona' THEN RETURN NULL; END IF;
  v_prestadora := interno.current_tenant();
  IF v_prestadora IS NULL OR coalesce(p_codigo, '') = '' OR coalesce(p_clave, '') = '' THEN
    RETURN NULL;
  END IF;

  IF p_uso = 'activacion' THEN
    UPDATE tokens_activacion_cuenta t SET usado_en = now()
      FROM usuarios u
     WHERE t.token = p_codigo AND t.usado_en IS NULL AND t.expira_en > now()
       AND u.id = t.usuario_id AND u.prestadora_id = v_prestadora
       AND u.rol IN ('coordinador', 'asistente', 'cliente')
    RETURNING t.usuario_id INTO v_usuario;
  ELSIF p_uso = 'recuperacion' THEN
    UPDATE tokens_recuperacion_clave t SET usado_en = now()
      FROM usuarios u
     WHERE t.token = p_codigo AND t.usado_en IS NULL AND t.expira_en > now()
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
