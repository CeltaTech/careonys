-- UNA CUENTA NO SE BORRA: SE DESACTIVA.
--
-- La cuenta queda, con su fila y su historia, y no puede entrar: su cuenta de ingreso queda
-- bloqueada, se cierran sus sesiones y se anulan los enlaces y códigos que tenía pendientes. La
-- fila guarda cuándo y por qué. Vale para la baja de una cuenta del Panel y para quitar una
-- persona autorizada.
--
-- Borrar queda sólo para deshacer un alta que se cortó por la mitad, y sólo sobre una cuenta que
-- nunca entró ni fue desactivada.

BEGIN;

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS desactivada_en timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_de_la_desactivacion text;

-- La desactivación queda en el registro de actividad con su propio nombre, sea de una cuenta del
-- Panel o de una persona autorizada. El motivo no entra: es contenido, y queda en la cuenta.
INSERT INTO public.catalogo_acciones_registradas (accion, grupo, orden)
VALUES ('desactivacion_de_cuenta', 'permisos_y_membresia', 18)
ON CONFLICT (accion) DO NOTHING;

-- LA DESACTIVACIÓN.
CREATE OR REPLACE FUNCTION public.desactivar_la_cuenta(p_usuario uuid, p_motivo text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid;
  v_motivo text := btrim(coalesce(p_motivo, ''), E' \t\r\n');
BEGIN
  IF auth.jwt() ->> 'role' IS DISTINCT FROM 'trabajo_sin_persona' THEN RETURN false; END IF;
  v_prestadora := interno.prestadora_actual();
  IF v_prestadora IS NULL OR p_usuario IS NULL OR v_motivo = '' THEN RETURN false; END IF;

  UPDATE usuarios
     SET desactivada_en = now(),
         motivo_de_la_desactivacion = v_motivo
   WHERE id = p_usuario
     AND prestadora_id = v_prestadora
     AND rol IN ('coordinador', 'asistente', 'cliente')
     AND desactivada_en IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;

  -- La cuenta de ingreso queda bloqueada: no entra con la clave, no renueva la sesión y no canjea
  -- ningún enlace. El bloqueo no lo levanta un cambio de clave.
  UPDATE auth.users
     SET banned_until = now() + interval '100 years',
         updated_at = now()
   WHERE id = p_usuario;

  -- Las sesiones abiertas se cierran ahora y no cuando venzan.
  DELETE FROM auth.refresh_tokens WHERE user_id = p_usuario::text;
  DELETE FROM auth.sessions WHERE user_id = p_usuario;

  -- Lo que tenía pendiente para entrar o cambiar la clave deja de servir.
  UPDATE tokens_activacion_cuenta SET usado_en = now()
   WHERE usuario_id = p_usuario AND usado_en IS NULL;
  UPDATE tokens_recuperacion_clave SET usado_en = now()
   WHERE usuario_id = p_usuario AND usado_en IS NULL;
  UPDATE cambios_de_clave_habilitados SET anulado_en = now()
   WHERE usuario_id = p_usuario AND usado_en IS NULL AND anulado_en IS NULL;
  UPDATE codigos_al_telefono SET anulado_en = now()
   WHERE usuario_id = p_usuario AND verificado_en IS NULL AND anulado_en IS NULL;
  UPDATE equipos_conocidos SET revocado_en = now()
   WHERE usuario_id = p_usuario AND revocado_en IS NULL;

  -- La responsabilidad del reclutamiento queda libre, como quedaba al borrar la cuenta.
  UPDATE configuracion_reclutamiento SET responsable_id = NULL
   WHERE responsable_id = p_usuario AND prestadora_id = v_prestadora;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.desactivar_la_cuenta(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desactivar_la_cuenta(uuid, text) TO service_role, trabajo_sin_persona;

-- EL ÚNICO BORRADO DE UNA CUENTA.
CREATE OR REPLACE FUNCTION public.deshacer_el_alta_de_la_cuenta(p_usuario uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid;
BEGIN
  -- Único borrado de una cuenta: deshace un alta que se cortó, y sólo si la cuenta nunca entró.
  IF auth.jwt() ->> 'role' IS DISTINCT FROM 'trabajo_sin_persona' THEN RETURN false; END IF;
  v_prestadora := interno.prestadora_actual();
  IF v_prestadora IS NULL OR p_usuario IS NULL THEN RETURN false; END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE id = p_usuario AND last_sign_in_at IS NOT NULL) THEN
    RETURN false;
  END IF;

  DELETE FROM usuarios
   WHERE id = p_usuario
     AND prestadora_id = v_prestadora
     AND rol IN ('coordinador', 'asistente', 'cliente')
     AND desactivada_en IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;

  DELETE FROM auth.users WHERE id = p_usuario;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.deshacer_el_alta_de_la_cuenta(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deshacer_el_alta_de_la_cuenta(uuid) TO service_role, trabajo_sin_persona;

DROP FUNCTION IF EXISTS public.dar_de_baja_la_cuenta(uuid);

-- UNA CUENTA DESACTIVADA NO TIENE PRESTADORA. Con una credencial que todavía no venció, la base no
-- le abre nada.
CREATE OR REPLACE FUNCTION interno.prestadora_actual()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT COALESCE(
    -- 1. El permiso de acceso que CeltaTech abrió para esta cuenta, mientras está vigente. Tapa
    --    todo lo demás.
    (SELECT s.prestadora_id FROM permisos_de_acceso s
      WHERE s.admin_id = auth.uid()
        AND s.salida_at IS NULL
        AND s.expira_at > NOW()
        AND s.ultima_actividad_at > NOW() - INTERVAL '5 minutes'
      ORDER BY s.entrada_at DESC LIMIT 1),

    -- 2. La Prestadora de la cuenta con la que se entró, si la cuenta no está desactivada. Es una
    --    sola: para trabajar en otra hay que salir de ésta y entrar allá, con la cuenta de allá.
    (SELECT prestadora_id FROM usuarios WHERE id = auth.uid() AND desactivada_en IS NULL),

    -- 3. El trabajo sin persona: la Prestadora para la que el backend generó su credencial.
    (SELECT NULLIF(auth.jwt() ->> 'prestadora_id', '')::uuid
      WHERE auth.jwt() ->> 'role' = 'trabajo_sin_persona')
  )
$function$;

-- UNA CUENTA DESACTIVADA NO SE ENCUENTRA POR SU NOMBRE DE USUARIO: ni para entrar ni para
-- recuperar la clave.
CREATE OR REPLACE FUNCTION public.cuenta_del_usuario(p_usuario text)
 RETURNS TABLE(id uuid, prestadora_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT u.id, u.prestadora_id
    FROM usuarios u
   WHERE auth.jwt() ->> 'role' = 'trabajo_sin_persona'
     AND u.rol IN ('coordinador', 'asistente', 'cliente')
     AND u.desactivada_en IS NULL
     AND u.nombre_de_usuario IS NOT NULL
     AND lower(u.nombre_de_usuario) = lower(btrim(coalesce(p_usuario, ''), E' \t\r\n'));
$function$;

-- Y NINGÚN ENLACE LE PONE CLAVE.
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
  v_prestadora := interno.prestadora_actual();
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
       AND u.desactivada_en IS NULL
    RETURNING t.usuario_id INTO v_usuario;
  ELSIF p_uso = 'recuperacion' THEN
    UPDATE tokens_recuperacion_clave t SET usado_en = now()
      FROM usuarios u
     WHERE t.token = v_verificador AND t.usado_en IS NULL AND t.expira_en > now()
       AND u.id = t.usuario_id AND u.prestadora_id = v_prestadora
       AND u.rol IN ('coordinador', 'asistente', 'cliente')
       AND u.desactivada_en IS NULL
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

COMMIT;

NOTIFY pgrst, 'reload schema';
