-- Quién vio cada dato de salud.
--
-- Hasta acá ninguna lectura quedaba anotada: `registro_actividad` anota escrituras y entradas al
-- Panel, y nada más. Desde acá cada lectura de un dato de salud deja un renglón en
-- `consultas_a_hce`, que es un registro aparte del de actividad porque anota otra cosa y
-- va a tener otro plazo de conservación (`docs/PLAN_HASTA_PRODUCCION.md`, paso 9).
--
-- Seis datos por renglón: la Prestadora, la persona que accedió, el paciente, las categorías de
-- dato alcanzadas, el momento y el origen.
--
--   * La categoría de dato es el nombre de la tabla de donde salió lo que se leyó
--     (`indicaciones_medicacion`, `rangos_referencia_vitales`...). Es un nombre guardado que ya
--     existe, así que no hace falta inventar un catálogo de palabras, y la base comprueba que la
--     tabla exista: una categoría mal escrita no entra.
--   * El origen es por dónde llegó la lectura: el método y la ruta del pedido, sin lo que viaje
--     después del signo de pregunta. Lo arma `backend/src/utils/registroDeConsultas.js`.
--   * El momento lo pone la base, con su reloj. No se le cree a quien inserta.
--
-- Consultable por paciente: hay un índice por Prestadora, paciente y momento, porque «quién vio lo
-- mío» y acotar una brecha a las personas alcanzadas se preguntan por paciente, no por fecha.
--
-- INTEGRIDAD DEMOSTRABLE. Ninguna norma pide que el registro sea «inmutable»: piden poder
-- demostrar que no se alteró. Cada Prestadora tiene su cadena: cada renglón lleva su número en la
-- cadena, el resumen criptográfico (SHA-256) del renglón anterior y el suyo propio, calculado sobre
-- sus seis datos más el resumen anterior. Lo calcula la base en el momento de insertar; lo que
-- traiga quien inserta en esas columnas se descarta. Si alguien cambia un renglón del medio, su
-- resumen deja de coincidir; si además recalcula el suyo, deja de coincidir con el que guarda el
-- siguiente; si borra uno, queda un hueco en la numeración. `public.verificar_cadena_de_consultas()`
-- recorre la cadena y dice en qué renglón se rompe.
--
-- Lo que la cadena no ve: quien tenga el dueño de la base puede recalcular la cadena entera desde
-- el renglón que alteró hasta el final, o borrar los últimos renglones. Eso sólo se descubre
-- guardando afuera, cada tanto, el último resumen de cada Prestadora. No se construye acá.
--
-- NADIE LO EDITA NI LO BORRA, tampoco la llave maestra: un disparador rechaza toda modificación,
-- todo borrado y todo vaciado, y ningún rol recibe permiso de hacerlo.
--
-- QUIÉN ESCRIBE. Se inserta de tres maneras, y en las tres la base decide lo que puede decidir:
--   * con la credencial de una persona: la Prestadora sale de `interno.current_tenant()` y la
--     persona de `auth.uid()`. Si el pedido trae otras, se rechaza.
--   * con la credencial del trabajo sin persona: la Prestadora sale de la credencial y la persona
--     queda vacía, porque no hay nadie.
--   * con la llave maestra, mientras exista (el paso 10 la saca): el backend dice la Prestadora y
--     la persona, porque la base no tiene de dónde sacarlas. Queda anotado con qué credencial se
--     escribió, para que un renglón de esa época se reconozca.
-- En los tres casos el paciente tiene que ser de esa Prestadora.
--
-- El disparador que encadena es `SECURITY DEFINER`: tiene que leer el último renglón de la cadena
-- aunque quien inserta no pueda ver el registro, y comprobar que el paciente sea de la Prestadora.
-- Lee sólo eso, filtrado por la Prestadora que ya quedó resuelta.
--
-- QUIÉN LO LEE. La administración de la Prestadora, y el soporte de CeltaTech con un permiso de
-- acceso abierto sobre ella. Es lo que hay que poder entregarle al cliente cuando lo pide.
--
-- CONSERVACIÓN. No lleva columnas propias: el plazo se calcula con el momento del renglón y el país
-- de la Prestadora, contra `reglas_de_conservacion`. La purga no se construye acá. Cuando se
-- construya va a tener que anotar desde qué número empieza la cadena después de cortar la cabeza,
-- porque hoy la verificación exige que empiece en 1.

-- ─── El registro ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.consultas_a_hce (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id    uuid NOT NULL REFERENCES public.prestadoras(id),
  -- Sin clave foránea hacia `usuarios` ni hacia `pacientes`: dar de baja una cuenta o borrar un
  -- paciente no se puede llevar el registro de quién lo vio.
  usuario_id       uuid,
  paciente_id      uuid NOT NULL,
  categorias       text[] NOT NULL,
  momento          timestamptz NOT NULL DEFAULT clock_timestamp(),
  origen           text NOT NULL,
  credencial_rol   text NOT NULL,
  numero           bigint NOT NULL,
  resumen_anterior bytea,
  resumen          bytea NOT NULL,

  CONSTRAINT consultas_a_hce_un_numero_por_cadena UNIQUE (prestadora_id, numero),
  CONSTRAINT consultas_a_hce_alguna_categoria
    CHECK (cardinality(categorias) > 0 AND array_position(categorias, NULL) IS NULL),
  CONSTRAINT consultas_a_hce_el_origen_no_va_vacio
    CHECK (btrim(origen) <> '' AND length(origen) <= 300),
  -- Sin persona, sólo el trabajo sin persona.
  CONSTRAINT consultas_a_hce_dice_quien
    CHECK (usuario_id IS NOT NULL OR credencial_rol = 'trabajo_sin_persona'),
  CONSTRAINT consultas_a_hce_la_cadena_empieza_en_uno
    CHECK (numero >= 1 AND (numero = 1) = (resumen_anterior IS NULL))
);

COMMENT ON TABLE public.consultas_a_hce IS
  'Quién leyó qué dato de salud de qué paciente, cuándo y por dónde. Una cadena por Prestadora: cada renglón guarda el resumen SHA-256 del anterior y el suyo. Lo escribe la base, no se edita y no se borra.';
COMMENT ON COLUMN public.consultas_a_hce.categorias IS
  'Las tablas de donde salió lo leído. La base comprueba que existan.';
COMMENT ON COLUMN public.consultas_a_hce.origen IS
  'Por dónde llegó la lectura: método y ruta del pedido, sin lo que viaja después del signo de pregunta.';

CREATE INDEX consultas_a_hce_por_paciente
  ON public.consultas_a_hce (prestadora_id, paciente_id, momento);

ALTER TABLE public.consultas_a_hce ENABLE ROW LEVEL SECURITY;

-- Los permisos por defecto del esquema le dan todo a todos: se sacan, y queda insertar y leer.
REVOKE ALL ON public.consultas_a_hce
  FROM PUBLIC, anon, authenticated, service_role, trabajo_sin_persona;
GRANT SELECT, INSERT ON public.consultas_a_hce TO authenticated;
GRANT INSERT ON public.consultas_a_hce TO trabajo_sin_persona;
-- La llave maestra sigue anotando y leyendo mientras exista (paso 10 la saca), pero no edita ni
-- borra.
GRANT SELECT, INSERT ON public.consultas_a_hce TO service_role;

CREATE POLICY cada_persona_anota_lo_que_ella_leyo ON public.consultas_a_hce
  FOR INSERT TO authenticated
  WITH CHECK (prestadora_id = interno.current_tenant() AND usuario_id = auth.uid());

CREATE POLICY el_trabajo_sin_persona_anota_en_su_prestadora ON public.consultas_a_hce
  FOR INSERT TO trabajo_sin_persona
  WITH CHECK (prestadora_id = interno.current_tenant() AND usuario_id IS NULL);

CREATE POLICY lo_lee_la_administracion_de_la_prestadora ON public.consultas_a_hce
  FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.current_tenant()
    AND (interno.es_superadmin() OR interno.es_admin_prestadora())
  );

-- ─── Nadie lo toca ──────────────────────────────────────────────────────────────────────────

CREATE FUNCTION interno.el_registro_de_accesos_no_se_toca()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'interno'
AS $$
BEGIN
  RAISE EXCEPTION 'El registro de accesos a datos de salud no se edita y no se borra'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION interno.el_registro_de_accesos_no_se_toca() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.el_registro_de_accesos_no_se_toca()
  TO authenticated, service_role, trabajo_sin_persona;

CREATE TRIGGER trg_el_registro_de_accesos_no_se_toca
  BEFORE UPDATE OR DELETE ON public.consultas_a_hce
  FOR EACH ROW EXECUTE FUNCTION interno.el_registro_de_accesos_no_se_toca();

CREATE TRIGGER trg_el_registro_de_accesos_no_se_vacia
  BEFORE TRUNCATE ON public.consultas_a_hce
  FOR EACH STATEMENT EXECUTE FUNCTION interno.el_registro_de_accesos_no_se_toca();

-- ─── El resumen de un renglón ───────────────────────────────────────────────────────────────
-- El punto único de verdad de qué entra en el resumen: lo usan el disparador que encadena y la
-- verificación. El momento se escribe en UTC y con microsegundos, para que el texto no dependa de
-- la zona horaria de quien calcula.

CREATE FUNCTION interno.resumen_de_la_consulta(e public.consultas_a_hce)
RETURNS bytea
LANGUAGE sql
STABLE
SET search_path TO 'public', 'interno'
AS $$
  SELECT sha256(convert_to(jsonb_build_array(
    e.id,
    e.prestadora_id,
    e.numero,
    e.usuario_id,
    e.paciente_id,
    to_jsonb(e.categorias),
    to_char(e.momento AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    e.origen,
    e.credencial_rol,
    encode(e.resumen_anterior, 'hex')
  )::text, 'UTF8'));
$$;

-- La usan sólo funciones que corren como dueño.
REVOKE ALL ON FUNCTION interno.resumen_de_la_consulta(public.consultas_a_hce)
  FROM PUBLIC, anon, authenticated, service_role, trabajo_sin_persona;

-- ─── Encadenar al insertar ──────────────────────────────────────────────────────────────────

CREATE FUNCTION interno.encadenar_acceso_a_datos_de_salud()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $$
DECLARE
  v_rol      text := COALESCE(auth.jwt() ->> 'role', session_user::text);
  v_prest    uuid;
  v_usuario  uuid;
  v_ultimo   record;
BEGIN
  IF v_rol = 'authenticated' THEN
    v_prest := interno.current_tenant();
    v_usuario := auth.uid();
    IF v_prest IS NULL OR v_usuario IS NULL THEN
      RAISE EXCEPTION 'Sin persona ni Prestadora resueltas no se anota un acceso' USING ERRCODE = '42501';
    END IF;
    IF NEW.prestadora_id IS DISTINCT FROM v_prest AND NEW.prestadora_id IS NOT NULL
       OR NEW.usuario_id IS DISTINCT FROM v_usuario AND NEW.usuario_id IS NOT NULL THEN
      RAISE EXCEPTION 'Un acceso se anota a nombre de quien entró y en su Prestadora' USING ERRCODE = '42501';
    END IF;
    NEW.prestadora_id := v_prest;
    NEW.usuario_id := v_usuario;

  ELSIF v_rol = 'trabajo_sin_persona' THEN
    v_prest := interno.current_tenant();
    IF v_prest IS NULL THEN
      RAISE EXCEPTION 'Sin Prestadora resuelta no se anota un acceso' USING ERRCODE = '42501';
    END IF;
    IF NEW.prestadora_id IS DISTINCT FROM v_prest AND NEW.prestadora_id IS NOT NULL
       OR NEW.usuario_id IS NOT NULL THEN
      RAISE EXCEPTION 'El trabajo sin persona anota sin persona y en su Prestadora' USING ERRCODE = '42501';
    END IF;
    NEW.prestadora_id := v_prest;

  ELSE
    -- La llave maestra y las migraciones: la base no tiene de dónde sacar a quién, así que tiene
    -- que venir dicho.
    IF NEW.prestadora_id IS NULL OR NEW.usuario_id IS NULL THEN
      RAISE EXCEPTION 'Un acceso anotado con la llave maestra tiene que decir la Prestadora y la persona'
        USING ERRCODE = '23502';
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pacientes p
                  WHERE p.id = NEW.paciente_id AND p.prestadora_id = NEW.prestadora_id) THEN
    RAISE EXCEPTION 'El paciente no es de esa Prestadora' USING ERRCODE = '23503';
  END IF;

  IF NEW.categorias IS NULL OR cardinality(NEW.categorias) = 0
     OR array_position(NEW.categorias, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Un acceso dice qué categorías de dato alcanzó' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(NEW.categorias) c
              WHERE to_regclass(format('public.%I', c)) IS NULL) THEN
    RAISE EXCEPTION 'Una categoría de dato es el nombre de una tabla que existe' USING ERRCODE = '23514';
  END IF;
  -- Ordenadas y sin repetir: el mismo acceso se anota siempre igual.
  NEW.categorias := ARRAY(SELECT DISTINCT c FROM unnest(NEW.categorias) c ORDER BY c);

  -- Lo que sigue lo pone la base, traiga lo que traiga el pedido.
  NEW.id := gen_random_uuid();
  NEW.credencial_rol := v_rol;
  NEW.momento := clock_timestamp();

  -- Una cadena por Prestadora, de a un renglón por vez: dos lecturas simultáneas no pueden
  -- colgarse las dos del mismo renglón anterior. Si igual pasara, la unicidad del número lo frena.
  PERFORM pg_advisory_xact_lock(hashtextextended('consultas_a_hce:' || NEW.prestadora_id::text, 0));

  SELECT a.numero, a.resumen INTO v_ultimo
    FROM consultas_a_hce a
   WHERE a.prestadora_id = NEW.prestadora_id
   ORDER BY a.numero DESC
   LIMIT 1;

  NEW.numero := COALESCE(v_ultimo.numero, 0) + 1;
  NEW.resumen_anterior := v_ultimo.resumen;
  NEW.resumen := interno.resumen_de_la_consulta(NEW);

  RETURN NEW;
END;
$$;

-- Sólo la dispara la base. Postgres no pide permiso de ejecución al disparar.
REVOKE ALL ON FUNCTION interno.encadenar_acceso_a_datos_de_salud()
  FROM PUBLIC, anon, authenticated, service_role, trabajo_sin_persona;

CREATE TRIGGER trg_encadenar_acceso_a_datos_de_salud
  BEFORE INSERT ON public.consultas_a_hce
  FOR EACH ROW EXECUTE FUNCTION interno.encadenar_acceso_a_datos_de_salud();

-- ─── Verificar la cadena ────────────────────────────────────────────────────────────────────
-- Recorre la cadena de una Prestadora en orden y se para en el primer renglón que no cierra.
-- Tres maneras de romperse, y se dice cuál:
--   falta_un_renglon           el número no es el que seguía: se borró algo, o se lo cambió de
--                              Prestadora;
--   no_sigue_al_anterior       el resumen anterior que guarda no es el del renglón de antes;
--   el_renglon_fue_alterado    sus datos ya no dan su resumen.

CREATE FUNCTION interno.verificar_cadena_de_consultas(p_prestadora uuid)
RETURNS TABLE (intacta boolean, renglones bigint, rota_en_numero bigint, rota_en_id uuid, motivo text)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'interno'
AS $$
DECLARE
  r           consultas_a_hce;
  v_esperado  bigint := 1;
  v_anterior  bytea := NULL;
BEGIN
  FOR r IN
    SELECT * FROM consultas_a_hce a
     WHERE a.prestadora_id = p_prestadora
     ORDER BY a.numero
  LOOP
    IF r.numero <> v_esperado THEN
      RETURN QUERY SELECT false, v_esperado - 1, r.numero, r.id, 'falta_un_renglon'::text;
      RETURN;
    END IF;
    IF r.resumen_anterior IS DISTINCT FROM v_anterior THEN
      RETURN QUERY SELECT false, v_esperado - 1, r.numero, r.id, 'no_sigue_al_anterior'::text;
      RETURN;
    END IF;
    IF r.resumen IS DISTINCT FROM interno.resumen_de_la_consulta(r) THEN
      RETURN QUERY SELECT false, v_esperado - 1, r.numero, r.id, 'el_renglon_fue_alterado'::text;
      RETURN;
    END IF;
    v_anterior := r.resumen;
    v_esperado := v_esperado + 1;
  END LOOP;

  RETURN QUERY SELECT true, v_esperado - 1, NULL::bigint, NULL::uuid, NULL::text;
END;
$$;

-- Recibe una Prestadora cualquiera: no la llama nadie de afuera, sólo la puerta de abajo.
REVOKE ALL ON FUNCTION interno.verificar_cadena_de_consultas(uuid)
  FROM PUBLIC, anon, authenticated, service_role, trabajo_sin_persona;

-- La puerta. No recibe ninguna Prestadora: verifica la de quien pregunta. Es `SECURITY DEFINER`
-- porque tiene que recorrer la cadena entera aunque quien pregunta no alcance a ver todos los
-- renglones, y por eso ella misma pide ser la administración de la Prestadora, el soporte con
-- permiso abierto o el trabajo sin persona de esa Prestadora. Cualquier otro caso falla cerrado.
CREATE FUNCTION public.verificar_cadena_de_consultas()
RETURNS TABLE (intacta boolean, renglones bigint, rota_en_numero bigint, rota_en_id uuid, motivo text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $$
DECLARE
  v_prest uuid := interno.current_tenant();
BEGIN
  IF v_prest IS NULL
     OR NOT (interno.es_superadmin()
             OR interno.es_admin_prestadora()
             OR COALESCE(auth.jwt() ->> 'role', '') = 'trabajo_sin_persona') THEN
    RAISE EXCEPTION 'No tiene permiso para verificar el registro de accesos' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM interno.verificar_cadena_de_consultas(v_prest);
END;
$$;

REVOKE ALL ON FUNCTION public.verificar_cadena_de_consultas() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.verificar_cadena_de_consultas() TO authenticated, trabajo_sin_persona;

NOTIFY pgrst, 'reload schema';
