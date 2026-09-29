-- La credencial del trabajo sin persona.
--
-- Lo que el producto hace solo —las tareas automatizadas, las direcciones que llaman otros
-- programas, las puertas públicas— hoy entra a la base con la llave maestra, que ve todas las
-- Prestadoras a la vez. Acá nace su reemplazo: un rol propio, `trabajo_sin_persona`, que entra con
-- una credencial corta que genera el backend para una sola Prestadora, y que alcanza sólo las
-- tablas que ese trabajo toca, con sólo las operaciones que hace sobre cada una.
--
-- Es un agregado: nada de lo que ya funciona cambia. La llave maestra se saca después, a medida que
-- cada trabajo pasa a usar esta credencial.

BEGIN;

-- 1. El rol. PostgREST entra como `authenticator` y cambia al rol que dice la credencial, así que
--    `authenticator` tiene que poder asumirlo.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'trabajo_sin_persona') THEN
    CREATE ROLE trabajo_sin_persona NOLOGIN NOINHERIT;
  END IF;
END $$;
GRANT trabajo_sin_persona TO authenticator;
GRANT USAGE ON SCHEMA public, interno TO trabajo_sin_persona;

-- 2. De qué Prestadora es. Una tercera fuente, después de las dos que ya estaban: si quien consulta
--    es el trabajo sin persona, la Prestadora sale de su credencial. Se mira el rol que dice la
--    credencial y no `current_user`, que adentro de esta función es su dueño. Una credencial sin
--    Prestadora no resuelve nada y la base niega todo.
CREATE OR REPLACE FUNCTION interno.current_tenant()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT COALESCE(
    -- 1. La sesión de soporte técnico, mientras está viva. Tapa todo lo demás.
    (SELECT s.prestadora_id FROM permisos_de_acceso s
      WHERE s.admin_id = auth.uid()
        AND s.salida_at IS NULL
        AND s.expira_at > NOW()
        AND s.ultima_actividad_at > NOW() - INTERVAL '5 minutes'
      ORDER BY s.entrada_at DESC LIMIT 1),

    -- 2. La Prestadora de la cuenta con la que se entró. Es una sola: para trabajar en otra hay
    --    que salir de ésta y entrar allá, con la cuenta de allá.
    (SELECT prestadora_id FROM usuarios WHERE id = auth.uid()),

    -- 3. El trabajo sin persona: la Prestadora para la que el backend generó su credencial.
    (SELECT NULLIF(auth.jwt() ->> 'prestadora_id', '')::uuid
      WHERE auth.jwt() ->> 'role' = 'trabajo_sin_persona')
  )
$function$;

-- 3. Las funciones que las políticas llaman. Las políticas escritas para todos los roles también
--    se evalúan para éste, y si no puede ejecutar lo que llaman, la consulta falla en vez de
--    devolver sólo lo suyo. Recibe las mismas que ya tiene `authenticated`, y ninguna más.
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS firma
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'interno'
       AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO trabajo_sin_persona', f.firma);
  END LOOP;
END $$;

-- 4. Las tablas de cada Prestadora: sólo lo suyo, y sólo las operaciones que hace el trabajo sin
--    persona sobre cada una. La lista sale del código: cada tabla que alcanza alguna tarea
--    automatizada, alguna dirección que llama otro programa, alguna puerta pública o algo que el
--    backend sigue haciendo después de contestar.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('accesos_marketplace',                       'SELECT, UPDATE'),
    ('alarmas_tomadas',                           'SELECT'),
    ('alertas',                                   'INSERT'),
    ('alertas_tempranas_guardia',                 'SELECT, INSERT, UPDATE'),
    ('asistente_lugares',                         'SELECT'),
    ('asistentes',                                'SELECT'),
    ('auditoria_de_accesos',                      'INSERT'),
    ('auditoria_respuesta_automatica_whatsapp',   'INSERT'),
    ('ausencias',                                 'SELECT, UPDATE'),
    ('cambios_de_clave_habilitados',              'SELECT, UPDATE'),
    ('cierre_servicio_asistentes',                'SELECT, UPDATE'),
    ('cobros_marketplace',                        'SELECT, INSERT, UPDATE'),
    ('codigos_al_telefono',                       'SELECT, INSERT, UPDATE'),
    ('configuracion_alarmas_tomadas',             'SELECT'),
    ('configuracion_alertas_ia',                  'SELECT'),
    ('configuracion_ausencia_automatica',         'SELECT'),
    ('configuracion_ausencias',                   'SELECT'),
    ('configuracion_aviso_cese_asistente',        'SELECT'),
    ('configuracion_aviso_guardia_sin_cubrir',    'SELECT'),
    ('configuracion_cobro_marketplace',           'SELECT'),
    ('configuracion_equipo_paciente',             'SELECT'),
    ('configuracion_escalada_coordinador',        'SELECT'),
    ('configuracion_escalada_relevo',             'SELECT'),
    ('configuracion_incidentes_turno_sin_cubrir', 'SELECT'),
    ('configuracion_mensaje_de_texto_prestadora', 'SELECT'),
    ('configuracion_notificaciones',              'SELECT'),
    ('configuracion_prestadora',                  'SELECT'),
    ('configuracion_whatsapp_prestadora',         'SELECT'),
    ('conversaciones_whatsapp',                   'SELECT, INSERT, UPDATE'),
    ('credenciales_pasarela_pago',                'SELECT'),
    ('desafios_de_llave',                         'SELECT, INSERT, UPDATE'),
    ('documentos_asistente',                      'SELECT'),
    ('entrevistas_postulacion',                   'SELECT'),
    ('envios_de_correo',                          'INSERT'),
    ('equipo_paciente',                           'SELECT'),
    ('escalones_de_alarma_avisados',              'SELECT, INSERT'),
    ('estados_de_cuenta_externos',                'INSERT'),
    ('extensiones_de_turno',                      'SELECT, INSERT, UPDATE'),
    ('facturas_familia',                          'SELECT, UPDATE'),
    ('familias',                                  'SELECT'),
    ('guardia_pacientes',                         'SELECT, INSERT, UPDATE'),
    ('guardias',                                  'SELECT, INSERT, UPDATE'),
    ('incidentes_relevo',                         'SELECT, INSERT, UPDATE'),
    ('incidentes_turno_sin_cubrir',               'SELECT, INSERT, UPDATE'),
    ('indicaciones_medicacion',                   'SELECT'),
    ('llaves_de_dispositivo',                     'SELECT, INSERT, UPDATE'),
    ('mensajes_asistente',                        'SELECT, UPDATE'),
    ('mensajes_del_sistema',                      'SELECT'),
    ('mensajes_whatsapp',                         'SELECT, INSERT, UPDATE'),
    ('opciones_postulacion',                      'SELECT'),
    ('pacientes',                                 'SELECT, UPDATE'),
    ('pedidos_de_clave_nueva',                    'SELECT, INSERT'),
    ('pedidos_de_codigo_al_telefono',             'SELECT, INSERT'),
    ('permisos_de_acceso',                        'SELECT, UPDATE'),
    ('personal_emergencia',                       'SELECT'),
    ('plantillas_whatsapp',                       'SELECT, UPDATE'),
    ('postulaciones',                             'INSERT'),
    ('push_subscriptions',                        'SELECT, DELETE'),
    ('registro_actividad',                        'INSERT'),
    ('reportes',                                  'SELECT'),
    ('respuestas_preparadas_whatsapp',            'SELECT'),
    ('restricciones_de_cobranza',                 'INSERT'),
    ('series_guardias',                           'SELECT'),
    ('series_guardias_pacientes',                 'SELECT'),
    ('solicitudes',                               'INSERT'),
    ('telefonos_confirmados_por_la_prestadora',   'SELECT'),
    ('tipos_documento_asistente',                 'SELECT'),
    ('uso_ia',                                    'INSERT'),
    ('usuario_lugares',                           'SELECT'),
    ('usuarios',                                  'SELECT, UPDATE'),
    ('zonas_cobertura',                           'SELECT')
  ) AS v(tabla, operaciones)
  LOOP
    EXECUTE format('GRANT %s ON public.%I TO trabajo_sin_persona', t.operaciones, t.tabla);
    EXECUTE format('DROP POLICY IF EXISTS trabajo_sin_persona_de_esta_prestadora ON public.%I', t.tabla);
    EXECUTE format(
      'CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.%I AS PERMISSIVE FOR ALL '
      'TO trabajo_sin_persona USING (prestadora_id = interno.current_tenant()) '
      'WITH CHECK (prestadora_id = interno.current_tenant())',
      t.tabla);
  END LOOP;
END $$;

-- 5. Las tablas que no llevan la Prestadora en una columna propia.

-- La Prestadora misma: sólo su propia fila.
GRANT SELECT ON public.prestadoras TO trabajo_sin_persona;
DROP POLICY IF EXISTS trabajo_sin_persona_de_esta_prestadora ON public.prestadoras;
CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.prestadoras
  FOR SELECT TO trabajo_sin_persona
  USING (id = interno.current_tenant());

-- El círculo de una Familia: de las Familias de esta Prestadora.
GRANT SELECT ON public.miembros_familia TO trabajo_sin_persona;
DROP POLICY IF EXISTS trabajo_sin_persona_de_esta_prestadora ON public.miembros_familia;
CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.miembros_familia
  FOR SELECT TO trabajo_sin_persona
  USING (familia_id IN (SELECT f.id FROM public.familias f
                         WHERE f.prestadora_id = interno.current_tenant()));

-- Los códigos de activación y de recuperación: de las cuentas de esta Prestadora.
GRANT SELECT, UPDATE ON public.tokens_activacion_cuenta TO trabajo_sin_persona;
DROP POLICY IF EXISTS trabajo_sin_persona_de_esta_prestadora ON public.tokens_activacion_cuenta;
CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.tokens_activacion_cuenta
  FOR ALL TO trabajo_sin_persona
  USING (usuario_id IN (SELECT u.id FROM public.usuarios u
                         WHERE u.prestadora_id = interno.current_tenant()))
  WITH CHECK (usuario_id IN (SELECT u.id FROM public.usuarios u
                              WHERE u.prestadora_id = interno.current_tenant()));

GRANT SELECT, INSERT, UPDATE ON public.tokens_recuperacion_clave TO trabajo_sin_persona;
DROP POLICY IF EXISTS trabajo_sin_persona_de_esta_prestadora ON public.tokens_recuperacion_clave;
CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.tokens_recuperacion_clave
  FOR ALL TO trabajo_sin_persona
  USING (usuario_id IN (SELECT u.id FROM public.usuarios u
                         WHERE u.prestadora_id = interno.current_tenant()))
  WITH CHECK (usuario_id IN (SELECT u.id FROM public.usuarios u
                              WHERE u.prestadora_id = interno.current_tenant()));

-- Las listas que son iguales para todas las Prestadoras: sólo lectura, y sólo con una Prestadora
-- resuelta, como todo lo demás.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['catalogo_prefijos_de_celular', 'configuracion_plataforma',
                           'escalas_legales', 'telefonos_de_emergencia',
                           'terminos_de_salud_y_emergencia']
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO trabajo_sin_persona', t);
    EXECUTE format('DROP POLICY IF EXISTS trabajo_sin_persona_de_esta_prestadora ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.%I FOR SELECT '
      'TO trabajo_sin_persona USING (interno.current_tenant() IS NOT NULL)', t);
  END LOOP;
END $$;

-- 6. El comprobante de la factura: se sube y se baja sólo adentro de la carpeta de esta
--    Prestadora.
GRANT USAGE ON SCHEMA storage TO trabajo_sin_persona;
GRANT SELECT ON storage.buckets TO trabajo_sin_persona;
GRANT SELECT, INSERT ON storage.objects TO trabajo_sin_persona;
DROP POLICY IF EXISTS trabajo_sin_persona_de_esta_prestadora ON storage.objects;
CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON storage.objects
  FOR ALL TO trabajo_sin_persona
  USING (bucket_id = 'comprobantes-familia'
         AND (storage.foldername(name))[1] = interno.current_tenant()::text)
  WITH CHECK (bucket_id = 'comprobantes-familia'
              AND (storage.foldername(name))[1] = interno.current_tenant()::text);

-- 7. Las funciones que leen secretos de una Prestadora, y la que le siembra la configuración.
--    Reciben la Prestadora como dato, así que para este rol se exige que sea la de su credencial:
--    con otra, no devuelven nada. La llave maestra sigue pasando mientras dure la mudanza.
CREATE OR REPLACE FUNCTION interno.le_corresponde(p_prestadora_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT auth.role() = 'service_role'
      OR (p_prestadora_id IS NOT NULL AND p_prestadora_id = interno.current_tenant())
$function$;
REVOKE ALL ON FUNCTION interno.le_corresponde(uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.leer_app_secret_whatsapp(p_prestadora_id uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'vault'
AS $function$
DECLARE v_secret_id UUID; v_secreto TEXT;
BEGIN
  IF NOT interno.le_corresponde(p_prestadora_id) THEN RETURN NULL; END IF;
  SELECT app_secret_secret_id INTO v_secret_id
    FROM configuracion_whatsapp_prestadora WHERE prestadora_id = p_prestadora_id;
  IF v_secret_id IS NULL THEN RETURN NULL; END IF;
  SELECT decrypted_secret INTO v_secreto FROM vault.decrypted_secrets WHERE id = v_secret_id;
  RETURN v_secreto;
END;
$function$;

CREATE OR REPLACE FUNCTION public.leer_token_whatsapp(p_prestadora_id uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'vault'
AS $function$
DECLARE v_secret_id UUID; v_token TEXT;
BEGIN
  IF NOT interno.le_corresponde(p_prestadora_id) THEN RETURN NULL; END IF;
  SELECT token_secret_id INTO v_secret_id
    FROM configuracion_whatsapp_prestadora WHERE prestadora_id = p_prestadora_id;
  IF v_secret_id IS NULL THEN RETURN NULL; END IF;
  SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE id = v_secret_id;
  RETURN v_token;
END;
$function$;

CREATE OR REPLACE FUNCTION public.leer_verify_token_whatsapp(p_prestadora_id uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'vault'
AS $function$
DECLARE v_secret_id UUID; v_token TEXT;
BEGIN
  IF NOT interno.le_corresponde(p_prestadora_id) THEN RETURN NULL; END IF;
  SELECT verify_token_secret_id INTO v_secret_id
    FROM configuracion_whatsapp_prestadora WHERE prestadora_id = p_prestadora_id;
  IF v_secret_id IS NULL THEN RETURN NULL; END IF;
  SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE id = v_secret_id;
  RETURN v_token;
END;
$function$;

CREATE OR REPLACE FUNCTION public.leer_credencial_pasarela_pago(p_prestadora_id uuid, p_proveedor text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'vault'
AS $function$
DECLARE v_secret_id UUID; v_credencial TEXT;
BEGIN
  IF NOT interno.le_corresponde(p_prestadora_id) THEN RETURN NULL; END IF;
  SELECT credencial_secret_id INTO v_secret_id
    FROM credenciales_pasarela_pago WHERE prestadora_id = p_prestadora_id AND proveedor = p_proveedor;
  IF v_secret_id IS NULL THEN RETURN NULL; END IF;
  SELECT decrypted_secret INTO v_credencial FROM vault.decrypted_secrets WHERE id = v_secret_id;
  RETURN v_credencial;
END;
$function$;

CREATE OR REPLACE FUNCTION public.leer_secreto_firma_pasarela_pago(p_prestadora_id uuid, p_proveedor text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'vault'
AS $function$
DECLARE v_secret_id UUID; v_secreto TEXT;
BEGIN
  IF NOT interno.le_corresponde(p_prestadora_id) THEN RETURN NULL; END IF;
  SELECT secreto_firma_secret_id INTO v_secret_id
    FROM credenciales_pasarela_pago WHERE prestadora_id = p_prestadora_id AND proveedor = p_proveedor;
  IF v_secret_id IS NULL THEN RETURN NULL; END IF;
  SELECT decrypted_secret INTO v_secreto FROM vault.decrypted_secrets WHERE id = v_secret_id;
  RETURN v_secreto;
END;
$function$;

CREATE OR REPLACE FUNCTION public.leer_secreto_del_aviso_de_cobranza(p_prestadora_id uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'vault'
AS $function$
DECLARE v_secret_id UUID; v_secreto TEXT;
BEGIN
  IF NOT interno.le_corresponde(p_prestadora_id) THEN RETURN NULL; END IF;
  SELECT secreto_del_aviso_secret_id INTO v_secret_id
    FROM configuracion_facturacion_familias WHERE prestadora_id = p_prestadora_id;
  IF v_secret_id IS NULL THEN RETURN NULL; END IF;
  SELECT decrypted_secret INTO v_secreto FROM vault.decrypted_secrets WHERE id = v_secret_id;
  RETURN v_secreto;
END;
$function$;

CREATE OR REPLACE FUNCTION public.leer_secreto_del_aviso_de_facturacion(p_prestadora_id uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'vault'
AS $function$
DECLARE v_secret_id UUID; v_secreto TEXT;
BEGIN
  IF NOT interno.le_corresponde(p_prestadora_id) THEN RETURN NULL; END IF;
  SELECT secreto_del_aviso_de_facturacion_secret_id INTO v_secret_id
    FROM configuracion_facturacion_familias WHERE prestadora_id = p_prestadora_id;
  IF v_secret_id IS NULL THEN RETURN NULL; END IF;
  SELECT decrypted_secret INTO v_secreto FROM vault.decrypted_secrets WHERE id = v_secret_id;
  RETURN v_secreto;
END;
$function$;

-- La siembra es la del alta y no se copia: se le antepone la misma comprobación a su cuerpo de hoy.
DO $$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.sembrar_configuracion_prestadora(uuid)'::regprocedure);
  IF position('interno.le_corresponde' IN v_def) = 0 THEN
    v_def := replace(v_def, E'BEGIN\n  -- La única que no se llena sola',
      E'BEGIN\n  IF NOT interno.le_corresponde(p_prestadora_id) THEN\n'
      || E'    RAISE EXCEPTION ''sembrar_configuracion_prestadora: esa Prestadora no es la de quien llama'';\n'
      || E'  END IF;\n\n  -- La única que no se llena sola');
    IF position('interno.le_corresponde' IN v_def) = 0 THEN
      RAISE EXCEPTION 'No se encontró dónde poner la comprobación en sembrar_configuracion_prestadora';
    END IF;
    EXECUTE v_def;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION
  public.sembrar_configuracion_prestadora(uuid),
  public.leer_app_secret_whatsapp(uuid),
  public.leer_token_whatsapp(uuid),
  public.leer_verify_token_whatsapp(uuid),
  public.leer_credencial_pasarela_pago(uuid, text),
  public.leer_secreto_firma_pasarela_pago(uuid, text),
  public.leer_secreto_del_aviso_de_cobranza(uuid),
  public.leer_secreto_del_aviso_de_facturacion(uuid)
TO trabajo_sin_persona;

-- Las que corren con los permisos de quien llama: alcanza con dejarlas llamar, porque lo que tocan
-- ya lo filtra la política de cada tabla.
GRANT EXECUTE ON FUNCTION
  public.sumar_intento_de_codigo(text, uuid, uuid),
  public.sumar_contactos_al_saldo(uuid, integer),
  public.domicilios_de_pacientes_en(uuid[], date)
TO trabajo_sin_persona;

-- 8. Qué Prestadoras hay que recorrer. Las tareas automatizadas trabajan de a una, y para eso
--    necesitan saber cuáles hay. Devuelve los identificadores y nada más, y sólo al trabajo sin
--    persona.
CREATE OR REPLACE FUNCTION public.prestadoras_a_recorrer()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id FROM prestadoras
   WHERE auth.jwt() ->> 'role' = 'trabajo_sin_persona'
   ORDER BY id
$function$;
REVOKE ALL ON FUNCTION public.prestadoras_a_recorrer() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prestadoras_a_recorrer() TO trabajo_sin_persona;

COMMIT;

NOTIFY pgrst, 'reload schema';
