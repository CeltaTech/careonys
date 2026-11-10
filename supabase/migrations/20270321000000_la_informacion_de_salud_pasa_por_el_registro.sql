-- ---------------------------------------------------------------------------
-- La información de salud pasa por el registro de accesos
--
-- Hasta acá la base decidía QUIÉN ve la información de salud de cada Paciente, pero cualquiera
-- que la viera podía leerla directo, sin dejar constancia. Desde acá, con sesión de una persona,
-- la información de salud sólo sale por un paso que la lee y anota la lectura en la misma
-- operación: si la anotación falla, no sale nada.
--
-- Cómo:
--   - Cada tabla de salud lleva una regla más, restrictiva, que exige la marca de «lectura
--     anotada». La marca vive sólo dentro de la transacción y la ponen únicamente las funciones
--     de esta migración, que anotan lo que leen.
--   - Las reglas de quién ve qué Paciente quedan exactamente como estaban: la marca se suma, no
--     las reemplaza.
--   - El trabajo sin persona no cambia: la regla nueva es sólo para quien inició sesión. Lo que
--     lee para una persona lo anota el backend, como hasta ahora.
--   - Los valores de fábrica de la Prestadora (rangos sin Paciente) no son de ningún Paciente y
--     siguen como estaban. Las cargas pendientes sólo pasan por el registro cuando son de
--     información de salud.
--
-- Nada de esto da un acceso que no se tuviera: las funciones son SECURITY INVOKER, corren con
-- los permisos de quien llama, y todas las reglas de la Organización siguen mandando.
-- ---------------------------------------------------------------------------

-- ── 1. La lista de tablas y la marca ────────────────────────────────────────

CREATE OR REPLACE FUNCTION interno.tablas_de_salud()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'alertas', 'cargas_sujetas_a_aprobacion', 'emergencias_guardia', 'hospitalizaciones_paciente',
    'indicaciones_medicacion', 'informacion_de_salud_del_paciente', 'informes_obra_social',
    'rangos_referencia_vitales', 'reportes', 'versiones_registro_clinico'
  ]::text[];
$$;

CREATE OR REPLACE FUNCTION interno.lectura_de_salud_anotada()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(current_setting('careonys.lectura_de_salud', true), '') = 'anotada';
$$;

-- ── 2. Las piezas con que se arma el pedido ─────────────────────────────────
-- Nada del pedido entra como texto a la consulta: los nombres se validan contra el catálogo y se
-- citan con %I, y los valores se convierten al tipo de la columna con jsonb_populate_record.

CREATE OR REPLACE FUNCTION interno.columna_del_pedido(p_tabla text, p_columna text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public, interno
AS $$
BEGIN
  IF p_columna IS NULL OR NOT EXISTS (
       SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = to_regclass('public.' || quote_ident(p_tabla))
          AND a.attname = p_columna AND a.attnum > 0 AND NOT a.attisdropped) THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = '22023';
  END IF;
  RETURN p_columna;
END;
$$;

CREATE OR REPLACE FUNCTION interno.condicion_del_pedido(p_tabla text, p_alias text, p_filtros jsonb,
                                                        p_union text DEFAULT 'AND')
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public, interno
AS $$
DECLARE
  e        jsonb;
  v_partes text[] := '{}';
  v_col    text;
  v_op     text;
  v_valor  text;
BEGIN
  IF p_union NOT IN ('AND', 'OR') OR p_alias NOT IN ('t', 'g') THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_filtros IS NULL OR p_filtros = 'null'::jsonb THEN
    RETURN 'true';
  END IF;
  IF jsonb_typeof(p_filtros) <> 'array' THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = '22023';
  END IF;

  FOR e IN SELECT x FROM jsonb_array_elements(p_filtros) x LOOP
    IF jsonb_typeof(e) <> 'object' THEN
      RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = '22023';
    END IF;

    IF e ? 'o' THEN
      v_partes := v_partes || ('(' || interno.condicion_del_pedido(p_tabla, p_alias, e -> 'o', 'OR') || ')');
    ELSIF e ? 'y' THEN
      v_partes := v_partes || ('(' || interno.condicion_del_pedido(p_tabla, p_alias, e -> 'y', 'AND') || ')');
    ELSIF e ? 'guardia' THEN
      -- Una condición sobre la guardia de la fila. La guardia se lee con los permisos de quien
      -- pide, como cualquier otra lectura suya.
      IF p_alias <> 't' THEN
        RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = '22023';
      END IF;
      PERFORM interno.columna_del_pedido(p_tabla, 'guardia_id');
      v_partes := v_partes || format(
        'EXISTS (SELECT 1 FROM public.guardias g WHERE g.id = t.guardia_id AND %s)',
        interno.condicion_del_pedido('guardias', 'g', e -> 'guardia', 'AND'));
    ELSE
      v_col := interno.columna_del_pedido(p_tabla, e ->> 'columna');
      v_op := e ->> 'op';
      v_valor := format('(jsonb_populate_record(NULL::public.%I, %L::jsonb)).%I',
                        p_tabla, jsonb_build_object(v_col, e -> 'valor'), v_col);
      v_partes := v_partes || CASE v_op
        WHEN 'eq'       THEN format('%I.%I = %s',  p_alias, v_col, v_valor)
        WHEN 'neq'      THEN format('%I.%I <> %s', p_alias, v_col, v_valor)
        WHEN 'gt'       THEN format('%I.%I > %s',  p_alias, v_col, v_valor)
        WHEN 'gte'      THEN format('%I.%I >= %s', p_alias, v_col, v_valor)
        WHEN 'lt'       THEN format('%I.%I < %s',  p_alias, v_col, v_valor)
        WHEN 'lte'      THEN format('%I.%I <= %s', p_alias, v_col, v_valor)
        WHEN 'is_null'  THEN format('%I.%I IS NULL', p_alias, v_col)
        WHEN 'not_null' THEN format('%I.%I IS NOT NULL', p_alias, v_col)
        WHEN 'in'       THEN format(
          '%I.%I = ANY (ARRAY(SELECT (jsonb_populate_record(NULL::public.%I, jsonb_build_object(%L, x))).%I FROM jsonb_array_elements(%L::jsonb) x))',
          p_alias, v_col, p_tabla, v_col, v_col,
          CASE WHEN jsonb_typeof(e -> 'valor') = 'array' THEN e -> 'valor' END)
      END;
      IF v_partes[cardinality(v_partes)] IS NULL THEN
        RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  IF cardinality(v_partes) = 0 THEN
    RETURN CASE WHEN p_union = 'OR' THEN 'false' ELSE 'true' END;
  END IF;
  RETURN array_to_string(v_partes, ' ' || p_union || ' ');
END;
$$;

CREATE OR REPLACE FUNCTION interno.orden_del_pedido(p_tabla text, p_orden jsonb)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public, interno
AS $$
DECLARE
  e        jsonb;
  v_partes text[] := '{}';
BEGIN
  IF p_orden IS NOT NULL AND p_orden <> 'null'::jsonb AND jsonb_typeof(p_orden) <> 'array' THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = '22023';
  END IF;
  FOR e IN SELECT x FROM jsonb_array_elements(coalesce(nullif(p_orden, 'null'::jsonb), '[]'::jsonb)) x LOOP
    v_partes := v_partes || format('t.%I %s', interno.columna_del_pedido(p_tabla, e ->> 'columna'),
                                   CASE WHEN coalesce((e ->> 'desc')::boolean, false) THEN 'DESC' ELSE 'ASC' END);
  END LOOP;
  -- El identificador desempata: el mismo pedido devuelve siempre el mismo orden.
  RETURN array_to_string(v_partes || 't.id'::text, ', ');
END;
$$;

CREATE OR REPLACE FUNCTION interno.fila_del_pedido(p_tabla text, p_columnas text[])
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public, interno
AS $$
DECLARE
  v_partes text;
BEGIN
  IF p_columnas IS NULL OR p_columnas = ARRAY['*'] THEN
    RETURN 'to_jsonb(t)';
  END IF;
  IF cardinality(p_columnas) = 0 OR cardinality(p_columnas) > 50 THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = '22023';
  END IF;
  SELECT string_agg(format('%L, t.%I', c, interno.columna_del_pedido(p_tabla, c)), ', ')
    INTO v_partes
    FROM unnest(p_columnas) c;
  RETURN 'jsonb_build_object(' || v_partes || ')';
END;
$$;

-- De qué Pacientes es cada fila: es lo que se anota.
CREATE OR REPLACE FUNCTION interno.pacientes_de_la_fila(p_tabla text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_tabla
    WHEN 'emergencias_guardia' THEN 'ARRAY(SELECT interno.pacientes_de_la_guardia(t.guardia_id))'
    WHEN 'cargas_sujetas_a_aprobacion' THEN
      'CASE WHEN t.tabla = ''informacion_de_salud_del_paciente'' THEN ARRAY[t.paciente_id] ELSE ''{}''::uuid[] END'
    ELSE 'ARRAY[t.paciente_id]'
  END;
$$;

CREATE OR REPLACE FUNCTION interno.pedido_de_salud_valido(p_tabla text, p_origen text)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public, interno
AS $$
BEGIN
  IF auth.uid() IS NULL OR interno.prestadora_actual() IS NULL THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_tabla IS NULL OR NOT (p_tabla = ANY (interno.tablas_de_salud())) THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = '22023';
  END IF;
  IF nullif(btrim(coalesce(p_origen, '')), '') IS NULL OR length(p_origen) > 200 THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = '22023';
  END IF;
END;
$$;

-- Una fila por Paciente leído. El disparador del registro completa la Organización y la persona
-- desde la sesión, y rechaza al Paciente que no es de esa Organización.
CREATE OR REPLACE FUNCTION interno.anotar_lo_que_se_leyo(p_tabla text, p_pacientes uuid[], p_origen text)
RETURNS void
LANGUAGE sql
SET search_path = public, interno
AS $$
  INSERT INTO consultas_a_hce (paciente_id, categorias, origen)
  SELECT DISTINCT p, ARRAY[p_tabla], p_origen
    FROM unnest(coalesce(p_pacientes, '{}'::uuid[])) p
   WHERE p IS NOT NULL;
$$;

-- ── 3. Las tres puertas: leer, modificar, agregar ───────────────────────────
-- Devuelven jsonb, no filas de la tabla: así nadie puede colgarles otra tabla al pedido y leerla
-- sin anotar.

CREATE OR REPLACE FUNCTION public.leer_informacion_de_salud(
  p_tabla    text,
  p_origen   text,
  p_columnas text[]  DEFAULT NULL,
  p_filtros  jsonb   DEFAULT '[]',
  p_orden    jsonb   DEFAULT '[]',
  p_limite   integer DEFAULT NULL,
  p_contar   boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = public, interno
AS $$
DECLARE
  v_antes     text := coalesce(current_setting('careonys.lectura_de_salud', true), '');
  v_orden     text;
  v_sql       text;
  v_resultado jsonb;
  v_pacientes uuid[];
BEGIN
  PERFORM interno.pedido_de_salud_valido(p_tabla, p_origen);
  IF p_limite IS NOT NULL AND (p_limite < 1 OR p_limite > 5000) THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = '22023';
  END IF;

  v_orden := interno.orden_del_pedido(p_tabla, p_orden);
  v_sql := format(
    'WITH f AS MATERIALIZED (
       SELECT %s AS fila, %s AS pacientes, row_number() OVER (ORDER BY %s) AS n
         FROM public.%I t
        WHERE %s
        ORDER BY %s %s)
     SELECT %s, (SELECT array_agg(DISTINCT p) FROM f, unnest(f.pacientes) p WHERE p IS NOT NULL)
       FROM f',
    CASE WHEN p_contar THEN 'NULL::jsonb' ELSE interno.fila_del_pedido(p_tabla, p_columnas) END,
    interno.pacientes_de_la_fila(p_tabla), v_orden, p_tabla,
    interno.condicion_del_pedido(p_tabla, 't', p_filtros), v_orden,
    CASE WHEN p_limite IS NULL THEN '' ELSE 'LIMIT ' || p_limite END,
    CASE WHEN p_contar THEN 'to_jsonb(count(*))'
         ELSE 'coalesce(jsonb_agg(f.fila ORDER BY f.n), ''[]''::jsonb)' END);

  PERFORM set_config('careonys.lectura_de_salud', 'anotada', true);
  EXECUTE v_sql INTO v_resultado, v_pacientes;
  PERFORM set_config('careonys.lectura_de_salud', v_antes, true);

  PERFORM interno.anotar_lo_que_se_leyo(p_tabla, v_pacientes, p_origen);
  RETURN v_resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.modificar_informacion_de_salud(
  p_tabla              text,
  p_origen             text,
  p_cambios            jsonb,
  p_filtros            jsonb,
  p_columnas_devueltas text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = public, interno
AS $$
DECLARE
  v_antes     text := coalesce(current_setting('careonys.lectura_de_salud', true), '');
  v_cols      text[];
  v_lista     text;
  v_sql       text;
  v_resultado jsonb;
  v_pacientes uuid[];
BEGIN
  PERFORM interno.pedido_de_salud_valido(p_tabla, p_origen);
  IF p_cambios IS NULL OR jsonb_typeof(p_cambios) <> 'object'
     OR p_filtros IS NULL OR jsonb_typeof(p_filtros) <> 'array' OR jsonb_array_length(p_filtros) = 0 THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = '22023';
  END IF;
  v_cols := ARRAY(SELECT interno.columna_del_pedido(p_tabla, k) FROM jsonb_object_keys(p_cambios) k);
  IF cardinality(v_cols) = 0 OR v_cols && ARRAY['id', 'prestadora_id'] THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = '22023';
  END IF;
  SELECT string_agg(format('%I', c), ', ') INTO v_lista FROM unnest(v_cols) c;

  v_sql := format(
    'WITH u AS (
       UPDATE public.%I t SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1))
        WHERE %s
       RETURNING t.*),
     f AS (SELECT %s AS fila, %s AS pacientes FROM u t)
     SELECT coalesce(jsonb_agg(f.fila), ''[]''::jsonb),
            (SELECT array_agg(DISTINCT p) FROM f, unnest(f.pacientes) p WHERE p IS NOT NULL)
       FROM f',
    p_tabla, v_lista, v_lista, p_tabla,
    interno.condicion_del_pedido(p_tabla, 't', p_filtros),
    CASE WHEN p_columnas_devueltas IS NULL THEN 'jsonb_build_object(''id'', t.id)'
         ELSE interno.fila_del_pedido(p_tabla, p_columnas_devueltas) END,
    interno.pacientes_de_la_fila(p_tabla));

  PERFORM set_config('careonys.lectura_de_salud', 'anotada', true);
  EXECUTE v_sql INTO v_resultado, v_pacientes USING p_cambios;
  PERFORM set_config('careonys.lectura_de_salud', v_antes, true);

  PERFORM interno.anotar_lo_que_se_leyo(p_tabla, v_pacientes, p_origen);
  RETURN v_resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.agregar_informacion_de_salud(
  p_tabla              text,
  p_origen             text,
  p_fila               jsonb,
  p_columnas_devueltas text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = public, interno
AS $$
DECLARE
  v_antes     text := coalesce(current_setting('careonys.lectura_de_salud', true), '');
  v_cols      text[];
  v_lista     text;
  v_sql       text;
  v_resultado jsonb;
  v_pacientes uuid[];
BEGIN
  PERFORM interno.pedido_de_salud_valido(p_tabla, p_origen);
  IF p_fila IS NULL OR jsonb_typeof(p_fila) <> 'object' THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = '22023';
  END IF;
  v_cols := ARRAY(SELECT interno.columna_del_pedido(p_tabla, k) FROM jsonb_object_keys(p_fila) k);
  IF cardinality(v_cols) = 0 THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = '22023';
  END IF;
  SELECT string_agg(format('%I', c), ', ') INTO v_lista FROM unnest(v_cols) c;

  -- Sólo las columnas que llegaron: las demás toman su valor de fábrica.
  v_sql := format(
    'WITH i AS (
       INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1)
       RETURNING *),
     f AS (SELECT %s AS fila, %s AS pacientes FROM i t)
     SELECT coalesce(jsonb_agg(f.fila), ''[]''::jsonb),
            (SELECT array_agg(DISTINCT p) FROM f, unnest(f.pacientes) p WHERE p IS NOT NULL)
       FROM f',
    p_tabla, v_lista, v_lista, p_tabla,
    CASE WHEN p_columnas_devueltas IS NULL THEN 'jsonb_build_object(''id'', t.id)'
         ELSE interno.fila_del_pedido(p_tabla, p_columnas_devueltas) END,
    interno.pacientes_de_la_fila(p_tabla));

  PERFORM set_config('careonys.lectura_de_salud', 'anotada', true);
  EXECUTE v_sql INTO v_resultado, v_pacientes USING p_fila;
  PERFORM set_config('careonys.lectura_de_salud', v_antes, true);

  PERFORM interno.anotar_lo_que_se_leyo(p_tabla, v_pacientes, p_origen);
  RETURN v_resultado;
END;
$$;

-- ── 4. La regla nueva en cada tabla de salud ────────────────────────────────

DO $$
DECLARE
  v_tabla text;
  v_cond  text;
BEGIN
  FOREACH v_tabla IN ARRAY interno.tablas_de_salud() LOOP
    v_cond := CASE v_tabla
      WHEN 'rangos_referencia_vitales'   THEN 'paciente_id IS NULL OR interno.lectura_de_salud_anotada()'
      WHEN 'versiones_registro_clinico'  THEN 'paciente_id IS NULL OR interno.lectura_de_salud_anotada()'
      WHEN 'cargas_sujetas_a_aprobacion' THEN
        'tabla <> ''informacion_de_salud_del_paciente'' OR interno.lectura_de_salud_anotada()'
      ELSE 'interno.lectura_de_salud_anotada()'
    END;
    EXECUTE format('DROP POLICY IF EXISTS la_informacion_de_salud_pasa_por_el_registro ON public.%I', v_tabla);
    EXECUTE format(
      'CREATE POLICY la_informacion_de_salud_pasa_por_el_registro ON public.%I
         AS RESTRICTIVE FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
      v_tabla, v_cond, v_cond);
  END LOOP;
END;
$$;

-- ── 5. Las reglas de otras tablas que miraban la medicación ─────────────────
-- Miraban la indicación con una consulta propia, que ahora no ve nada sin anotar. Pasan a
-- preguntarlo a una función que sólo contesta sí o no, con la misma condición de antes.

CREATE OR REPLACE FUNCTION interno.coordinador_ve_la_indicacion(p_indicacion uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, interno
AS $$
  SELECT EXISTS (
    SELECT 1 FROM indicaciones_medicacion i
     WHERE i.id = p_indicacion
       AND i.prestadora_id = interno.prestadora_actual()
       AND interno.coordinador_ve_al_paciente(i.paciente_id)
  );
$$;
REVOKE ALL ON FUNCTION interno.coordinador_ve_la_indicacion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.coordinador_ve_la_indicacion(uuid) TO authenticated;

DROP POLICY IF EXISTS consentimientos_medicacion_los_lee_el_panel ON public.consentimientos_medicacion;
CREATE POLICY consentimientos_medicacion_los_lee_el_panel ON public.consentimientos_medicacion
  FOR SELECT TO authenticated
  USING ((prestadora_id = interno.prestadora_actual())
         AND (interno.es_superadmin() OR interno.es_admin_prestadora()
              OR interno.coordinador_ve_la_indicacion(indicacion_id)));

DROP POLICY IF EXISTS consentimientos_medicacion_los_lee_la_familia ON public.consentimientos_medicacion;
CREATE POLICY consentimientos_medicacion_los_lee_la_familia ON public.consentimientos_medicacion
  FOR SELECT TO authenticated
  USING ((prestadora_id = interno.prestadora_actual())
         AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_medicacion'::text)
         AND interno.indicacion_de_un_paciente_del_cliente(indicacion_id));

-- ── 6. Las funciones que ya tocaban estas tablas con la sesión de la persona ─

CREATE OR REPLACE FUNCTION public.cerrar_hospitalizacion(p_hospitalizacion uuid, p_fecha date)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_antes    text := coalesce(current_setting('careonys.lectura_de_salud', true), '');
  v_paciente uuid;
  v_inicio   date;
BEGIN
  PERFORM set_config('careonys.lectura_de_salud', 'anotada', true);
  UPDATE hospitalizaciones_paciente h
     SET fecha_fin = greatest(p_fecha, h.fecha_inicio)
   WHERE h.id = p_hospitalizacion
     AND h.prestadora_id = interno.prestadora_actual()
     AND h.fecha_fin IS NULL
  RETURNING h.paciente_id, h.fecha_inicio INTO v_paciente, v_inicio;
  PERFORM set_config('careonys.lectura_de_salud', v_antes, true);
  IF v_paciente IS NULL THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  PERFORM interno.anotar_lo_que_se_leyo('hospitalizaciones_paciente', ARRAY[v_paciente], 'cerrar_hospitalizacion');

  IF EXISTS (SELECT 1 FROM domicilios_temporales_paciente d WHERE d.hospitalizacion_id = p_hospitalizacion) THEN
    UPDATE domicilios_temporales_paciente d
       SET fecha_fin = greatest(p_fecha, d.fecha_inicio)
     WHERE d.hospitalizacion_id = p_hospitalizacion
       AND (d.fecha_fin IS NULL OR d.fecha_fin > greatest(p_fecha, d.fecha_inicio));
  ELSE
    UPDATE guardias SET estado = 'programada' WHERE paciente_id = v_paciente AND estado = 'pausada';
    UPDATE series_guardias SET estado = 'activa' WHERE paciente_id = v_paciente AND estado = 'pausada';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_hospitalizacion(p_paciente uuid, p_institucion text, p_motivo text, p_fecha_inicio date, p_domicilio jsonb)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_antes      text := coalesce(current_setting('careonys.lectura_de_salud', true), '');
  v_prestadora uuid;
  v_id         uuid := gen_random_uuid();
  v_d          domicilios_temporales_paciente;
BEGIN
  SELECT p.prestadora_id INTO v_prestadora
    FROM pacientes p
   WHERE p.id = p_paciente
     AND p.prestadora_id = interno.prestadora_actual();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(coalesce(p_institucion, '')), '') IS NULL OR p_fecha_inicio IS NULL THEN
    RAISE EXCEPTION 'falta_un_dato' USING ERRCODE = '23502';
  END IF;

  -- El identificador se arma acá y no se lee de vuelta: quien no alcanza la información de salud
  -- del Paciente puede registrar la internación, pero no leerla.
  PERFORM set_config('careonys.lectura_de_salud', 'anotada', true);
  INSERT INTO hospitalizaciones_paciente
    (id, prestadora_id, paciente_id, institucion, motivo, fecha_inicio, registrado_por)
  VALUES
    (v_id, v_prestadora, p_paciente, btrim(p_institucion), nullif(btrim(coalesce(p_motivo, '')), ''),
     p_fecha_inicio, interno.usuario_de_la_sesion());
  PERFORM set_config('careonys.lectura_de_salud', v_antes, true);
  PERFORM interno.anotar_lo_que_se_leyo('hospitalizaciones_paciente', ARRAY[p_paciente], 'registrar_hospitalizacion');

  IF p_domicilio IS NULL THEN
    UPDATE guardias SET estado = 'pausada'
     WHERE paciente_id = p_paciente AND estado = 'programada' AND fecha >= p_fecha_inicio;
    UPDATE series_guardias SET estado = 'pausada'
     WHERE paciente_id = p_paciente AND estado = 'activa';
  ELSE
    v_d := jsonb_populate_record(NULL::domicilios_temporales_paciente, p_domicilio);
    INSERT INTO domicilios_temporales_paciente
      (prestadora_id, paciente_id, hospitalizacion_id, domicilio, calle, numero, piso, unidad,
       lugar_id, codigo_postal, lat, lng, motivo, fecha_inicio)
    VALUES
      (v_prestadora, p_paciente, v_id, v_d.domicilio, v_d.calle, v_d.numero, v_d.piso, v_d.unidad,
       v_d.lugar_id, v_d.codigo_postal, v_d.lat, v_d.lng, v_d.motivo, p_fecha_inicio);
  END IF;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pedir_medicacion(p_paciente uuid, p_medicamento text, p_dosis text, p_frecuencia text, p_via uuid, p_prescripcion text, p_desde date, p_hasta date, p_documento jsonb)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_antes text := coalesce(current_setting('careonys.lectura_de_salud', true), '');
  v_id uuid := gen_random_uuid();
  v_quien uuid := auth.uid();
  v_prestadora uuid;
  v_cliente uuid;
  v_en_la_app boolean;
BEGIN
  SELECT p.prestadora_id, p.cliente_id INTO v_prestadora, v_cliente
    FROM pacientes p
   WHERE p.id = p_paciente;
  IF v_prestadora IS NULL OR v_quien IS NULL THEN
    RAISE EXCEPTION 'paciente_no_encontrado' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('careonys.lectura_de_salud', 'anotada', true);
  INSERT INTO indicaciones_medicacion
    (id, prestadora_id, paciente_id, cliente_id, medicamento, dosis, frecuencia,
     via_administracion_id, prescripcion_archivo_url, fecha_desde, fecha_hasta, solicitado_por)
  VALUES
    (v_id, v_prestadora, p_paciente, v_cliente, p_medicamento, p_dosis, p_frecuencia,
     p_via, p_prescripcion, p_desde, p_hasta, v_quien);
  PERFORM set_config('careonys.lectura_de_salud', v_antes, true);
  PERFORM interno.anotar_lo_que_se_leyo('indicaciones_medicacion', ARRAY[p_paciente], 'pedir_medicacion');

  IF p_documento IS NOT NULL THEN
    v_en_la_app := coalesce((p_documento ->> 'en_la_app')::boolean, false);
    INSERT INTO consentimientos_medicacion
      (prestadora_id, indicacion_id, documento_texto, documento_verificador, documento_idioma,
       estado, cerrado_como, cerrado_en, cerrado_desde, cargado_por)
    VALUES
      (v_prestadora, v_id, p_documento ->> 'texto', p_documento ->> 'verificador', p_documento ->> 'idioma',
       CASE WHEN v_en_la_app THEN 'cerrado' ELSE 'pendiente_firma' END,
       CASE WHEN v_en_la_app THEN 'confirmado_en_la_app' END,
       CASE WHEN v_en_la_app THEN now() END,
       CASE WHEN v_en_la_app THEN 'app_clientes' END,
       v_quien);
  END IF;

  RETURN v_id;
END;
$function$;

-- Si una alarma está a la vista se pregunta sólo por su existencia: no sale ningún dato de ella.
CREATE OR REPLACE FUNCTION interno.la_alarma_esta_a_la_vista(p_tipo text, p_referencia uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_tabla text := CASE p_tipo
    WHEN 'alerta_temprana_guardia' THEN 'alertas_tempranas_guardia'
    WHEN 'incidente_relevo' THEN 'incidentes_relevo'
    WHEN 'incidente_turno_sin_cubrir' THEN 'incidentes_turno_sin_cubrir'
    WHEN 'emergencia_guardia' THEN 'emergencias_guardia'
    WHEN 'guardia_sin_cerrar' THEN 'guardias'
  END;
  v_antes text := coalesce(current_setting('careonys.lectura_de_salud', true), '');
  v_la_ve boolean;
BEGIN
  IF v_tabla IS NULL OR p_referencia IS NULL THEN
    RETURN false;
  END IF;
  IF v_tabla = 'emergencias_guardia' THEN
    PERFORM set_config('careonys.lectura_de_salud', 'anotada', true);
  END IF;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1)', v_tabla) INTO v_la_ve USING p_referencia;
  IF v_tabla = 'emergencias_guardia' THEN
    PERFORM set_config('careonys.lectura_de_salud', v_antes, true);
  END IF;
  RETURN coalesce(v_la_ve, false);
END;
$function$;

-- ── 7. Permisos ─────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION interno.tablas_de_salud() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.lectura_de_salud_anotada() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.columna_del_pedido(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.condicion_del_pedido(text, text, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.orden_del_pedido(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.fila_del_pedido(text, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.pacientes_de_la_fila(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.pedido_de_salud_valido(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.anotar_lo_que_se_leyo(text, uuid[], text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leer_informacion_de_salud(text, text, text[], jsonb, jsonb, integer, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.modificar_informacion_de_salud(text, text, jsonb, jsonb, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agregar_informacion_de_salud(text, text, jsonb, text[]) FROM PUBLIC, anon;

-- Las usa la regla nueva, que se evalúa con los permisos de quien consulta: authenticated las
-- necesita. El trabajo sin persona no: la regla no es para él.
GRANT EXECUTE ON FUNCTION interno.tablas_de_salud() TO authenticated;
GRANT EXECUTE ON FUNCTION interno.lectura_de_salud_anotada() TO authenticated;
GRANT EXECUTE ON FUNCTION interno.columna_del_pedido(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION interno.condicion_del_pedido(text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION interno.orden_del_pedido(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION interno.fila_del_pedido(text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION interno.pacientes_de_la_fila(text) TO authenticated;
GRANT EXECUTE ON FUNCTION interno.pedido_de_salud_valido(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION interno.anotar_lo_que_se_leyo(text, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leer_informacion_de_salud(text, text, text[], jsonb, jsonb, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.modificar_informacion_de_salud(text, text, jsonb, jsonb, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agregar_informacion_de_salud(text, text, jsonb, text[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
