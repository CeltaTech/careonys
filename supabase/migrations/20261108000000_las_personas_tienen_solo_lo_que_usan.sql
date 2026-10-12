-- Las personas con sesión tienen sobre la base exactamente lo que sus pantallas usan, y nada más.
--
-- Postgres decide en dos pasos: primero si el rol puede tocar la tabla (el permiso), después qué
-- filas ve (la RLS). Los permisos por defecto de `public` le daban a `authenticated` los siete
-- sobre toda tabla nueva, y así quedaron tres clases de sobrante:
--
-- 1. TRUNCATE, TRIGGER y REFERENCES en toda tabla y vista. TRUNCATE no pasa por la RLS: con la
--    sesión de cualquier persona se podía vaciar una tabla de todas las Prestadoras. TRIGGER y
--    REFERENCES no los usa ninguna pantalla.
-- 2. Escrituras sin ninguna política que las respalde. Hoy la RLS las niega en silencio; después
--    de esto la base contesta 42501, que es lo que corresponde: el error se ve.
-- 3. Todo sobre las cuatro tablas que guardan secretos, y escritura sobre tres vistas.
--
-- Comprobado antes, contra el código y la base en vivo: cada escritura que hoy hacen las pantallas
-- y el backend con la sesión de una persona tiene política y conserva su permiso —la nota interna
-- de una postulación, el código de cobro en efectivo, la configuración de la Prestadora y la de la
-- plataforma, la anotación del cambio de fecha de una ausencia, que la escribe un disparador que
-- corre con el rol de quien edita—. Lo que escribe en estas tablas con privilegio de dueño
-- (SECURITY DEFINER de `postgres`) no depende de `authenticated`. `trabajo_sin_persona` no es
-- miembro de `authenticated` y no se toca. `service_role` tampoco: sale del producto en su propio
-- paso de «Los cimientos».
--
-- Además, dos funciones de privilegio de dueño contestaban sobre cualquier Prestadora:
-- `interno.nombre_de_usuario` y `interno.motivo_bloqueo_matricula`. Hoy sólo las usan vistas y
-- disparadores que ya llegan filtrados, pero no tienen por qué confiar en eso.
--
-- Cómo se vuelve atrás: con GRANT de lo revocado, tabla por tabla, y con ALTER DEFAULT PRIVILEGES
-- ... GRANT de lo que se quitó en el punto 1. Ninguna fila se toca.
BEGIN;

-- ─── 1. Cómo nace lo nuevo ────────────────────────────────────────────────────────────────────
-- Las tablas, vistas y contadores nuevos nacen sin ningún permiso para las personas: cada
-- migración que cree uno dice a quién se lo abre, en el mismo archivo que escribe sus políticas.
-- Desde el 30 de octubre de 2026 Supabase hace nacer cerradas las tablas nuevas de todos los
-- proyectos; esto lo deja escrito acá en vez de depender de eso.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM authenticated, anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM authenticated, anon;

-- Las funciones nuevas nacen cerradas para todos. Una función puede saltearse la RLS, así que se
-- abre a propósito: la que use una política lleva su GRANT EXECUTE a `authenticated` en la misma
-- migración que la crea. El permiso de PUBLIC viene del valor de fábrica de Postgres, que no es
-- por esquema: por eso éste va sin IN SCHEMA, y uno con IN SCHEMA no tendría ningún efecto.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM authenticated, anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA interno
  REVOKE EXECUTE ON FUNCTIONS FROM authenticated, anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- ─── 2. Vaciar, disparadores y referencias, en todo ───────────────────────────────────────────
DO $$
DECLARE
  v_rel regclass;
BEGIN
  FOR v_rel IN
    SELECT c.oid::regclass
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  LOOP
    EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES ON %s FROM authenticated, anon', v_rel);
  END LOOP;
END
$$;

-- ─── 3. Escrituras sin política que las respalde ──────────────────────────────────────────────
-- Ninguna escritura con sesión.
REVOKE INSERT, UPDATE, DELETE ON
  public.usuarios,
  public.auditoria_cambio_dueno_push,
  public.auditoria_de_accesos,
  public.catalogo_acciones_permisos,
  public.catalogo_generos,
  public.catalogo_paises,
  public.accesos_intermediacion,
  public.contactos_vistos_intermediacion,
  public.envios_de_correo,
  public.importaciones_prestadora
FROM authenticated, anon;

-- Se anota, no se corrige ni se borra.
REVOKE UPDATE, DELETE ON
  public.auditoria_advertencias_legales,
  public.ausencias_cambios_de_fecha,
  public.cobros_intermediacion,
  public.qr_cobro_efectivo
FROM authenticated, anon;

-- Se edita lo que ya existe; ni se crea ni se borra.
REVOKE INSERT, DELETE ON
  public.configuracion_plataforma,
  public.configuracion_prestadora,
  public.postulaciones
FROM authenticated, anon;

-- ─── 4. Las cuatro tablas que guardan secretos ────────────────────────────────────────────────
-- Las lee y las escribe sólo el backend. Ninguna persona, ni siquiera la dueña del secreto.
REVOKE ALL ON
  public.credenciales_pasarela_pago,
  public.mfa_codigos_recuperacion,
  public.tokens_activacion_cuenta,
  public.tokens_recuperacion_clave
FROM authenticated, anon;

-- ─── 5. Las vistas se leen ────────────────────────────────────────────────────────────────────
REVOKE INSERT, UPDATE, DELETE ON
  public.asistentes_coordinador,
  public.estado_matricula_asistente,
  public.saldos_cliente
FROM authenticated, anon;

-- ─── 6. Las dos funciones contestan sólo sobre la propia Prestadora ───────────────────────────
-- Quién pregunta lo dice el rol de la credencial. Una persona o el trabajo sin persona sólo
-- alcanzan su Prestadora (`current_tenant()`); la conexión directa y la llave de servicio quedan
-- como estaban, porque no tienen Prestadora con qué compararse —la llave de servicio sale del
-- producto en su propio paso—. Un rol que no es ninguno de esos cae del lado acotado.

-- El nombre de alguien de otra Prestadora no se contesta: vuelve vacío, y vacío no revela nada.
-- Pasa también con quien entró con un permiso de acceso de CeltaTech, que la Prestadora no ve.
CREATE OR REPLACE FUNCTION interno.nombre_de_usuario(p_usuario_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT u.nombre
    FROM public.usuarios u
   WHERE u.id = p_usuario_id
     AND (COALESCE(auth.jwt() ->> 'role', '') IN ('', 'service_role')
          OR u.prestadora_id = interno.current_tenant());
$function$;

-- Acá vacío quiere decir «no está bloqueado», así que contestar vacío sobre otra Prestadora sería
-- abrir. Se corta con error.
CREATE OR REPLACE FUNCTION interno.motivo_bloqueo_matricula(p_asistente_id uuid, p_dia date DEFAULT CURRENT_DATE)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prestadora_id  uuid;
  v_requiere       boolean;
  v_tipo_matricula text;
  v_modo           text;
  v_tiene_alguna   boolean;
  v_vigente        public.matriculas_asistente%ROWTYPE;
BEGIN
  IF p_asistente_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT a.prestadora_id, t.requiere_matricula, t.tipo_matricula
    INTO v_prestadora_id, v_requiere, v_tipo_matricula
    FROM public.asistentes a
    LEFT JOIN public.tipos_asistente t ON t.id = a.tipo_asistente_id
   WHERE a.id = p_asistente_id;

  -- Una persona o el trabajo sin persona sólo preguntan por un Asistente de su Prestadora.
  IF COALESCE(auth.jwt() ->> 'role', '') NOT IN ('', 'service_role')
     AND v_prestadora_id IS DISTINCT FROM interno.current_tenant() THEN
    RAISE EXCEPTION 'El Asistente no pertenece a la Prestadora de quien pregunta'
      USING ERRCODE = '42501';
  END IF;

  -- No existe, no tiene tipo cargado, o su tipo no exige matrícula: la regla no
  -- lo alcanza. Ver el encabezado sobre por qué la falta de tipo no bloquea.
  IF v_requiere IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  SELECT p.modo_control_matricula INTO v_modo
    FROM public.prestadoras p
   WHERE p.id = v_prestadora_id;
  v_modo := COALESCE(v_modo, 'estricto');

  -- ¿Tiene alguna matrícula del tipo que su tipo de Asistente exige? Se
  -- pregunta por separado de "¿tiene una vigente?" porque los dos casos se
  -- resuelven distinto: uno hay que pedirlo, el otro hay que renovarlo.
  SELECT EXISTS (
    SELECT 1 FROM public.matriculas_asistente m
     WHERE m.asistente_id = p_asistente_id
       AND m.tipo = v_tipo_matricula
  ) INTO v_tiene_alguna;

  IF NOT v_tiene_alguna THEN
    RETURN 'sin_matricula';
  END IF;

  -- La que está vigente ese día. Si hubiera varias —pasa cuando se carga la
  -- renovación antes de que caiga la anterior— manda la que vence más tarde, y
  -- la que no vence nunca gana siempre.
  SELECT m.* INTO v_vigente
    FROM public.matriculas_asistente m
   WHERE m.asistente_id = p_asistente_id
     AND m.tipo = v_tipo_matricula
     AND (m.vigente_desde IS NULL OR m.vigente_desde <= p_dia)
     AND (m.vigente_hasta IS NULL OR m.vigente_hasta >= p_dia)
   ORDER BY (m.vigente_hasta IS NULL) DESC, m.vigente_hasta DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN 'vencida';
  END IF;

  -- La verificación se exige en modo estricto, y también cuando la matrícula
  -- la subió el propio Asistente, porque en modo flexible cargarla sería
  -- habilitarse solo.
  IF (v_modo = 'estricto' OR v_vigente.cargada_por_el_asistente)
     AND v_vigente.verificada_at IS NULL THEN
    RETURN 'sin_verificar';
  END IF;

  RETURN NULL;
END;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
