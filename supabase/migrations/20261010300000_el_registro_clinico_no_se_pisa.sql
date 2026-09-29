-- El registro clínico no se pisa.
--
-- Corregir una indicación de medicación o un rango de referencia de signos vitales sobreescribía
-- la fila: lo anterior se perdía. Desde acá cada estado de un registro clínico queda guardado
-- como una versión —con su momento, su autor y su nota aclaratoria— en
-- `versiones_registro_clinico`, y la fila de la tabla sigue siendo la versión vigente. Por eso
-- ninguna pantalla ni ninguna ruta cambia: siguen leyendo y escribiendo donde leían.
--
-- Quién escribe la versión: la base, con un disparador. Nadie la escribe a mano. Por eso el
-- historial no le da permiso de escritura a ningún rol: si se lo diera, cualquiera con sesión
-- podría inventarse una versión. El disparador que anota es `SECURITY DEFINER` sólo para poder
-- insertar ahí; no consulta ninguna tabla, así que no le saca la protección por fila a nada.
-- Anota después de escribir, cuando la fila ya pasó la política de la tabla: la Prestadora y el
-- paciente salen de esa fila, no de quien pide.
--
-- El historial no se edita, no se borra y no se vacía, para nadie que entre por la API.
--
-- Una baja también queda: se anota la última versión con la operación `baja`, y lo anotado antes
-- sigue ahí. El historial no tiene clave foránea hacia el paciente ni hacia el registro, justamente
-- para que borrar uno no se lleve su historia.
--
-- Quién lo ve: la administración de la Prestadora, y además quien hoy puede ver ese registro en su
-- tabla. La segunda condición la resuelve la propia base con la política de esa tabla, así que la
-- historia de un registro se ve exactamente donde se ve el registro.
--
-- Toda tabla clínica nueva se engancha con una línea:
--   SELECT interno.versionar_tabla_clinica('public.<tabla>');
-- La tabla tiene que tener `id uuid` y `prestadora_id uuid`; si tiene `paciente_id`, el historial
-- queda consultable por paciente.

-- ─── El historial ───────────────────────────────────────────────────────────────────────────

CREATE TABLE public.versiones_registro_clinico (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id    uuid NOT NULL REFERENCES public.prestadoras(id),
  paciente_id      uuid,
  tabla            text NOT NULL,
  registro_id      uuid NOT NULL,
  version          integer NOT NULL CHECK (version > 0),
  operacion        text NOT NULL
                   CHECK (operacion IN ('anterior_al_historial', 'alta', 'modificacion', 'baja')),
  datos            jsonb NOT NULL,
  nota_aclaratoria text,
  autor_id         uuid,
  credencial_rol   text NOT NULL,
  momento          timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tabla, registro_id, version)
);

CREATE INDEX versiones_registro_clinico_por_paciente
  ON public.versiones_registro_clinico (prestadora_id, paciente_id, momento);
CREATE INDEX versiones_registro_clinico_por_registro
  ON public.versiones_registro_clinico (tabla, registro_id, version);

ALTER TABLE public.versiones_registro_clinico ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.versiones_registro_clinico FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.versiones_registro_clinico TO authenticated;
-- La llave maestra sigue leyendo mientras exista (paso 10 la saca), pero no escribe ni borra.
GRANT SELECT ON public.versiones_registro_clinico TO service_role;

-- ─── Nadie lo toca ──────────────────────────────────────────────────────────────────────────

CREATE FUNCTION interno.el_historial_clinico_no_se_toca()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'interno'
AS $$
BEGIN
  RAISE EXCEPTION 'El historial del registro clínico no se edita y no se borra'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION interno.el_historial_clinico_no_se_toca() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.el_historial_clinico_no_se_toca() TO authenticated, service_role;

CREATE TRIGGER trg_historial_clinico_no_se_toca
  BEFORE UPDATE OR DELETE ON public.versiones_registro_clinico
  FOR EACH ROW EXECUTE FUNCTION interno.el_historial_clinico_no_se_toca();

CREATE TRIGGER trg_historial_clinico_no_se_vacia
  BEFORE TRUNCATE ON public.versiones_registro_clinico
  FOR EACH STATEMENT EXECUTE FUNCTION interno.el_historial_clinico_no_se_toca();

-- ─── La nota es de una versión ──────────────────────────────────────────────────────────────
-- La nota aclaratoria viaja en la misma escritura que corrige, en la columna `nota_aclaratoria`
-- de la tabla. Una escritura que no trae nota nueva no hereda la de la versión anterior.

CREATE FUNCTION interno.la_nota_aclaratoria_es_de_una_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'interno'
AS $$
BEGIN
  IF (to_jsonb(NEW) ->> 'nota_aclaratoria') IS NOT DISTINCT FROM (to_jsonb(OLD) ->> 'nota_aclaratoria') THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object('nota_aclaratoria', NULL));
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION interno.la_nota_aclaratoria_es_de_una_version() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.la_nota_aclaratoria_es_de_una_version()
  TO authenticated, service_role, trabajo_sin_persona;

-- ─── Anotar la versión ──────────────────────────────────────────────────────────────────────

CREATE FUNCTION interno.anotar_version_clinica()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $$
DECLARE
  v_fila      jsonb;
  v_anterior  jsonb;
  v_operacion text;
  v_version   integer;
  v_prest     uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_fila := to_jsonb(OLD);
    v_operacion := 'baja';
  ELSIF TG_OP = 'INSERT' THEN
    v_fila := to_jsonb(NEW);
    v_operacion := 'alta';
  ELSE
    v_fila := to_jsonb(NEW);
    v_anterior := to_jsonb(OLD);
    -- Una escritura que no cambia ningún dato y no trae nota no es una versión nueva.
    IF (v_fila - 'updated_at' - 'nota_aclaratoria') = (v_anterior - 'updated_at' - 'nota_aclaratoria')
       AND (v_fila ->> 'nota_aclaratoria') IS NULL THEN
      RETURN NULL;
    END IF;
    v_operacion := 'modificacion';
  END IF;

  v_prest := (v_fila ->> 'prestadora_id')::uuid;
  IF v_prest IS NULL THEN
    RAISE EXCEPTION 'Un registro clínico sin Prestadora no se puede versionar';
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
    FROM versiones_registro_clinico
   WHERE tabla = TG_TABLE_NAME AND registro_id = (v_fila ->> 'id')::uuid;

  INSERT INTO versiones_registro_clinico
    (prestadora_id, paciente_id, tabla, registro_id, version, operacion, datos,
     nota_aclaratoria, autor_id, credencial_rol)
  VALUES
    (v_prest, (v_fila ->> 'paciente_id')::uuid, TG_TABLE_NAME, (v_fila ->> 'id')::uuid, v_version,
     v_operacion, v_fila, CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE v_fila ->> 'nota_aclaratoria' END,
     auth.uid(), COALESCE(auth.jwt() ->> 'role', session_user::text));

  RETURN NULL;
END;
$$;

-- Sólo la dispara la base. Postgres no pide permiso de ejecución al disparar.
REVOKE ALL ON FUNCTION interno.anotar_version_clinica() FROM PUBLIC, anon, authenticated;

-- ─── ¿Quien consulta puede ver ese registro en su tabla? ────────────────────────────────────
-- Corre con los permisos de quien consulta, así que contesta la política de la tabla de origen.
-- Falla cerrada: una tabla que no está versionada no muestra nada.

CREATE FUNCTION interno.el_registro_clinico_se_ve(p_tabla text, p_registro_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'interno'
AS $$
DECLARE
  v_tabla regclass := to_regclass(format('public.%I', p_tabla));
  v_se_ve boolean;
BEGIN
  IF v_tabla IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = v_tabla AND tgname = 'trg_versiones_del_registro_clinico'
  ) THEN
    RETURN false;
  END IF;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE id = $1)', v_tabla)
     INTO v_se_ve USING p_registro_id;
  RETURN COALESCE(v_se_ve, false);
END;
$$;

-- La usa la política: conserva `authenticated`.
REVOKE ALL ON FUNCTION interno.el_registro_clinico_se_ve(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.el_registro_clinico_se_ve(text, uuid) TO authenticated, service_role;

CREATE POLICY se_ve_la_historia_de_lo_que_se_ve ON public.versiones_registro_clinico
  FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.current_tenant()
    AND (
      interno.es_superadmin()
      OR interno.es_admin_prestadora()
      OR interno.el_registro_clinico_se_ve(tabla, registro_id)
    )
  );

-- ─── Enganchar una tabla clínica ────────────────────────────────────────────────────────────

CREATE FUNCTION interno.versionar_tabla_clinica(p_tabla regclass)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'interno'
AS $$
DECLARE
  v_nombre text;
BEGIN
  SELECT c.relname INTO v_nombre
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.oid = p_tabla AND n.nspname = 'public';
  IF v_nombre IS NULL THEN
    RAISE EXCEPTION 'Sólo se versionan tablas del esquema public: %', p_tabla;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = v_nombre
                    AND column_name = 'id' AND data_type = 'uuid')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = v_nombre
                    AND column_name = 'prestadora_id' AND data_type = 'uuid') THEN
    RAISE EXCEPTION 'La tabla % necesita id uuid y prestadora_id uuid para versionarse', v_nombre;
  END IF;

  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS nota_aclaratoria text', p_tabla);

  -- Lo que ya estaba escrito entra como primera versión. Lo que se pisó antes de hoy no se
  -- recupera: el momento es el de la última escritura conocida y el autor queda sin saberse.
  EXECUTE format($f$
    INSERT INTO versiones_registro_clinico
      (prestadora_id, paciente_id, tabla, registro_id, version, operacion, datos,
       nota_aclaratoria, autor_id, credencial_rol, momento)
    SELECT (to_jsonb(t) ->> 'prestadora_id')::uuid, (to_jsonb(t) ->> 'paciente_id')::uuid,
           %L, t.id, 1, 'anterior_al_historial', to_jsonb(t), NULL, NULL, session_user::text,
           COALESCE((to_jsonb(t) ->> 'updated_at')::timestamptz,
                    (to_jsonb(t) ->> 'created_at')::timestamptz, now())
      FROM %s t
     WHERE NOT EXISTS (SELECT 1 FROM versiones_registro_clinico v
                        WHERE v.tabla = %L AND v.registro_id = t.id)
  $f$, v_nombre, p_tabla, v_nombre);

  EXECUTE format('DROP TRIGGER IF EXISTS trg_la_nota_es_de_una_version ON %s', p_tabla);
  EXECUTE format('CREATE TRIGGER trg_la_nota_es_de_una_version BEFORE UPDATE ON %s
                  FOR EACH ROW EXECUTE FUNCTION interno.la_nota_aclaratoria_es_de_una_version()', p_tabla);

  EXECUTE format('DROP TRIGGER IF EXISTS trg_versiones_del_registro_clinico ON %s', p_tabla);
  EXECUTE format('CREATE TRIGGER trg_versiones_del_registro_clinico AFTER INSERT OR UPDATE OR DELETE ON %s
                  FOR EACH ROW EXECUTE FUNCTION interno.anotar_version_clinica()', p_tabla);
END;
$$;

-- Es obra de migración, no de nadie con sesión.
REVOKE ALL ON FUNCTION interno.versionar_tabla_clinica(regclass) FROM PUBLIC, anon, authenticated, service_role;

SELECT interno.versionar_tabla_clinica('public.indicaciones_medicacion');
SELECT interno.versionar_tabla_clinica('public.rangos_referencia_vitales');

NOTIFY pgrst, 'reload schema';
