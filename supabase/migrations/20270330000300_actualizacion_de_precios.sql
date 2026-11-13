-- La actualización de los precios: a mano, por importación de una lista, o por un índice público.
--
-- EL PRECIO VIEJO NO SE PISA. Cada cambio de precio es un renglón nuevo, con su fecha de comienzo,
-- y el renglón anterior queda guardado con su fecha de fin. Así una factura reemitida da el mismo
-- número que dio el día que se emitió, y siempre se puede ver qué precio regía en una fecha.
--
-- LAS FORMAS SON UNA LISTA ABIERTA. Hoy son tres: 'manual', 'importacion' e 'indice'. Agregar otra
-- es agregar un valor a la restricción de `condiciones_comerciales_servicio.forma_de_actualizacion`
-- y a `FORMAS_DE_ACTUALIZACION` de `panel/src/lib/condicionesDelCliente.js`. Agregar otro índice es
-- agregar un renglón a `indices_de_actualizacion`, sin tocar código.
--
-- La forma de fábrica de la Prestadora vive en `configuracion_facturacion_clientes.regla`
-- (`forma_de_actualizacion` e `indice_de_actualizacion`). La de cada Servicio, en las dos columnas
-- nuevas de `condiciones_comerciales_servicio`; vacío quiere decir que rige la de la Prestadora.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. Los índices públicos.
--
-- SIN `prestadora_id`, Y ES A PROPÓSITO. Un índice público (el IPC del INDEC) es el mismo para
-- todas las Prestadoras y no es dato de ninguna: es un catálogo, como `catalogo_paises` o
-- `monedas_por_pais`, que tampoco llevan la columna. Lo lee cualquiera con sesión y sólo lo escribe
-- una migración. Un renglón de acá no revela nada de ninguna Prestadora.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.indices_de_actualizacion (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo       text NOT NULL UNIQUE CHECK (codigo ~ '^[a-z0-9_]+$'),
  nombre       text NOT NULL CHECK (btrim(nombre) <> ''),
  fuente       text NOT NULL CHECK (btrim(fuente) <> ''),
  periodicidad text NOT NULL DEFAULT 'mensual' CHECK (periodicidad IN ('mensual')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.indices_de_actualizacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.indices_de_actualizacion FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.indices_de_actualizacion TO authenticated, trabajo_sin_persona;

CREATE POLICY los_indices_los_lee_cualquiera_con_sesion ON public.indices_de_actualizacion
  FOR SELECT TO authenticated, trabajo_sin_persona USING (true);

INSERT INTO public.indices_de_actualizacion (codigo, nombre, fuente, periodicidad) VALUES
  ('ipc_indec_nacional',
   'IPC INDEC — nivel general nacional (base diciembre 2016 = 100)',
   'https://www.indec.gob.ar/ftp/cuadros/economia/serie_ipc_divisiones.csv',
   'mensual');

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. Los valores de cada índice, mes por mes.
--
-- Dos clases de renglón, que la restricción `origen_y_prestadora` no deja mezclar:
--   · el público ('automatico', sin `prestadora_id`): lo trae la carga automática desde la fuente,
--     y lo leen todas;
--   · el propio ('manual', con `prestadora_id`): lo carga a mano la administración de una
--     Prestadora, y sólo lo ve y lo usa ella.
-- Al buscar el valor de un mes gana el propio sobre el público (`public.valor_del_indice`). Así una
-- carga manual nunca alcanza a otra Prestadora, y quien no carga nada usa el público.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.valores_de_indice (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indice_id     uuid NOT NULL REFERENCES public.indices_de_actualizacion (id) ON DELETE CASCADE,
  periodo       date NOT NULL CHECK (periodo = date_trunc('month', periodo)::date),
  valor         numeric NOT NULL CHECK (valor > 0),
  origen        text NOT NULL CHECK (origen IN ('automatico', 'manual')),
  prestadora_id uuid REFERENCES public.prestadoras (id) ON DELETE CASCADE,
  cargado_por   uuid REFERENCES public.usuarios (id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT origen_y_prestadora CHECK (
    (origen = 'automatico' AND prestadora_id IS NULL)
    OR (origen = 'manual' AND prestadora_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX valores_de_indice_uno_publico_por_mes
  ON public.valores_de_indice (indice_id, periodo) WHERE prestadora_id IS NULL;
CREATE UNIQUE INDEX valores_de_indice_uno_propio_por_mes
  ON public.valores_de_indice (indice_id, periodo, prestadora_id) WHERE prestadora_id IS NOT NULL;

ALTER TABLE public.valores_de_indice ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.valores_de_indice FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.valores_de_indice TO authenticated, trabajo_sin_persona;
GRANT INSERT (indice_id, periodo, valor, origen, prestadora_id) ON public.valores_de_indice TO authenticated;
GRANT UPDATE (valor, updated_at) ON public.valores_de_indice TO authenticated;
GRANT DELETE ON public.valores_de_indice TO authenticated;

-- Leer: los públicos, y los propios de la Prestadora de la sesión.
CREATE POLICY valores_de_indice_publicos_y_propios ON public.valores_de_indice
  FOR SELECT TO authenticated, trabajo_sin_persona
  USING (prestadora_id IS NULL OR prestadora_id = interno.prestadora_actual());

-- Escribir: sólo los propios, y sólo la administración de esa Prestadora. El público no lo toca
-- nadie con sesión: lo escribe la carga automática por `public.anotar_valor_de_indice_publico`.
CREATE POLICY valores_de_indice_los_carga_la_administracion ON public.valores_de_indice
  FOR INSERT TO authenticated
  WITH CHECK (
    origen = 'manual'
    AND prestadora_id = interno.prestadora_actual()
    AND interno.es_la_administracion_de_la_prestadora(prestadora_id)
    AND cargado_por = auth.uid()
  );

CREATE POLICY valores_de_indice_los_corrige_la_administracion ON public.valores_de_indice
  FOR UPDATE TO authenticated
  USING (
    origen = 'manual'
    AND prestadora_id = interno.prestadora_actual()
    AND interno.es_la_administracion_de_la_prestadora(prestadora_id)
  )
  WITH CHECK (
    origen = 'manual'
    AND prestadora_id = interno.prestadora_actual()
    AND interno.es_la_administracion_de_la_prestadora(prestadora_id)
  );

CREATE POLICY valores_de_indice_los_borra_la_administracion ON public.valores_de_indice
  FOR DELETE TO authenticated
  USING (
    origen = 'manual'
    AND prestadora_id = interno.prestadora_actual()
    AND interno.es_la_administracion_de_la_prestadora(prestadora_id)
  );

-- Los dos primeros valores del IPC nacional, nivel general, base diciembre 2016 = 100.
INSERT INTO public.valores_de_indice (indice_id, periodo, valor, origen, prestadora_id, cargado_por)
SELECT i.id, v.periodo, v.valor, 'automatico', NULL, NULL
  FROM public.indices_de_actualizacion i
 CROSS JOIN (VALUES (DATE '2026-09-01', 12514.1508::numeric),
                    (DATE '2026-10-01', 12785.9321::numeric)) AS v (periodo, valor)
 WHERE i.codigo = 'ipc_indec_nacional';

-- El valor de un índice en un mes, para la Prestadora de la sesión: el propio si lo cargó, si no el
-- público. Corre con los permisos de quien llama, así que la RLS de arriba decide qué ve.
CREATE FUNCTION public.valor_del_indice(p_indice text, p_periodo date) RETURNS numeric
  LANGUAGE sql STABLE SECURITY INVOKER
  SET search_path TO ''
AS $$
  SELECT v.valor
    FROM public.valores_de_indice v
    JOIN public.indices_de_actualizacion i ON i.id = v.indice_id
   WHERE i.codigo = p_indice
     AND v.periodo = date_trunc('month', p_periodo)::date
   ORDER BY (v.prestadora_id IS NULL)
   LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.valor_del_indice(text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.valor_del_indice(text, date) TO authenticated, trabajo_sin_persona;

-- La carga automática. Es lo único que escribe un valor público, y sólo la cuenta automática que no
-- es de ninguna Prestadora la puede llamar: la guarda mira el pase, no un dato del pedido. No toca
-- ninguna otra tabla ni ningún valor propio de una Prestadora.
CREATE FUNCTION public.anotar_valor_de_indice_publico(p_indice text, p_periodo date, p_valor numeric)
  RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  v_indice uuid;
  v_filas  integer;
BEGIN
  IF auth.jwt() ->> 'role' IS DISTINCT FROM 'trabajo_sin_persona'
     OR auth.jwt() ->> 'prestadora_id' IS NOT NULL THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_periodo IS NULL OR p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_indice FROM public.indices_de_actualizacion WHERE codigo = p_indice;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.valores_de_indice (indice_id, periodo, valor, origen, prestadora_id, cargado_por)
  VALUES (v_indice, date_trunc('month', p_periodo)::date, p_valor, 'automatico', NULL, NULL)
  ON CONFLICT (indice_id, periodo) WHERE prestadora_id IS NULL
  DO UPDATE SET valor = EXCLUDED.valor, updated_at = now()
   WHERE public.valores_de_indice.valor IS DISTINCT FROM EXCLUDED.valor;
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  RETURN v_filas > 0;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.anotar_valor_de_indice_publico(text, date, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anotar_valor_de_indice_publico(text, date, numeric) TO trabajo_sin_persona;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. La forma de actualización de cada Servicio. Vacío = rige la de la Prestadora.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.condiciones_comerciales_servicio
  ADD COLUMN forma_de_actualizacion text
    CHECK (forma_de_actualizacion IN ('manual', 'importacion', 'indice')),
  ADD COLUMN indice_de_actualizacion text
    REFERENCES public.indices_de_actualizacion (codigo) ON UPDATE CASCADE,
  -- Un índice escrito junto a una forma que no es por índice no rige y confunde: no se guarda.
  -- Con la forma vacía sí se admite, porque la forma puede venir de la Prestadora.
  ADD CONSTRAINT indice_solo_con_forma_por_indice CHECK (
    indice_de_actualizacion IS NULL
    OR forma_de_actualizacion IS NULL
    OR forma_de_actualizacion = 'indice'
  );

-- La tabla abre UPDATE columna por columna: sin esto, las dos nuevas no se podrían cambiar.
GRANT UPDATE (forma_de_actualizacion, indice_de_actualizacion)
  ON public.condiciones_comerciales_servicio TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4. La lista de precios, con fecha de fin y el renglón al que reemplaza.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.lista_precios
  ADD COLUMN vigente_hasta date,
  ADD COLUMN reemplaza_a bigint REFERENCES public.lista_precios (id),
  ADD CONSTRAINT lista_precios_vigencia_coherente
    CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde);

CREATE INDEX lista_precios_por_reemplazo ON public.lista_precios (reemplaza_a);

-- Las columnas que se copian al versionar un renglón: todas menos la clave y las fechas de alta y
-- de cambio. Se leen del catálogo en el momento, para que una columna que otra migración agregue
-- después se copie sola, sin tener que acordarse de venir a escribirla acá.
CREATE FUNCTION interno.columnas_que_se_copian(p_tabla regclass) RETURNS text[]
  LANGUAGE sql STABLE SECURITY INVOKER
  SET search_path TO ''
AS $$
  SELECT array_agg(a.attname::text ORDER BY a.attnum)
    FROM pg_catalog.pg_attribute a
   WHERE a.attrelid = p_tabla
     AND a.attnum > 0
     AND NOT a.attisdropped
     AND a.attgenerated = ''
     AND a.attname NOT IN ('id', 'created_at', 'updated_at')
$$;
REVOKE EXECUTE ON FUNCTION interno.columnas_que_se_copian(regclass) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.columnas_que_se_copian(regclass) TO authenticated;

-- Copia un renglón con algunos valores cambiados y devuelve la clave del nuevo. `p_cambios` es un
-- objeto columna → valor; lo que no nombra se copia tal cual. Corre con los permisos de quien llama:
-- la RLS de la tabla decide si puede leer el viejo y escribir el nuevo.
CREATE FUNCTION interno.copiar_renglon(p_tabla regclass, p_id bigint, p_cambios jsonb) RETURNS bigint
  LANGUAGE plpgsql SECURITY INVOKER
  SET search_path TO ''
AS $$
DECLARE
  v_columnas text[] := interno.columnas_que_se_copian(p_tabla);
  v_lista    text;
  v_valores  text;
  v_nuevo    bigint;
BEGIN
  SELECT string_agg(format('%I', c), ', '),
         string_agg(
           CASE WHEN p_cambios ? c
             THEN format('(jsonb_populate_record(NULL::%s, $2)).%I', p_tabla, c)
             ELSE format('t.%I', c)
           END, ', ')
    INTO v_lista, v_valores
    FROM unnest(v_columnas) AS c;

  EXECUTE format('INSERT INTO %s (%s) SELECT %s FROM %s t WHERE t.id = $1 RETURNING id',
                 p_tabla, v_lista, v_valores, p_tabla)
     INTO v_nuevo
    USING p_id, p_cambios;

  IF v_nuevo IS NULL THEN
    RAISE EXCEPTION 'no_encontrado' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_nuevo;
END;
$$;
REVOKE EXECUTE ON FUNCTION interno.copiar_renglon(regclass, bigint, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.copiar_renglon(regclass, bigint, jsonb) TO authenticated;

-- Cambia el precio de un renglón de la lista sin pisarlo: escribe uno nuevo que rige desde
-- `p_desde` y cierra el viejo el día anterior. Devuelve la clave del renglón que rige desde esa
-- fecha (el mismo, si el precio no cambió).
--
-- RESPETA LA REVISIÓN DE LAS PRESTACIONES. El disparador `trigger_precio_lista_actualizado` marca
-- `requiere_revision` en las prestaciones vigentes cuando cambia el precio de su renglón. Con el
-- renglón versionado el precio del viejo ya no cambia y el disparador no salta, así que esta
-- función hace lo mismo a mano: marca las prestaciones vigentes que apuntan al renglón viejo y
-- siguen corriendo desde la fecha nueva. El precio de la prestación no se toca: lo decide quien
-- coordina, igual que antes.
CREATE FUNCTION public.reemplazar_precio_de_lista(p_precio_id bigint, p_precio numeric, p_desde date)
  RETURNS bigint
  LANGUAGE plpgsql SECURITY INVOKER
  SET search_path TO ''
AS $$
DECLARE
  v_viejo public.lista_precios;
  v_nuevo bigint;
BEGIN
  IF p_precio IS NULL OR p_precio <= 0 OR p_desde IS NULL THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_viejo FROM public.lista_precios WHERE id = p_precio_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_encontrado' USING ERRCODE = 'P0002';
  END IF;
  -- Un renglón ya cerrado no se vuelve a reemplazar: se reemplaza el que lo sucedió.
  IF v_viejo.vigente_hasta IS NOT NULL THEN
    RAISE EXCEPTION 'ya_reemplazado' USING ERRCODE = 'P0001';
  END IF;

  IF v_viejo.precio = p_precio THEN
    RETURN v_viejo.id;
  END IF;

  IF p_desde <= v_viejo.vigente_desde THEN
    RAISE EXCEPTION 'fecha_anterior' USING ERRCODE = 'P0001';
  END IF;

  v_nuevo := interno.copiar_renglon('public.lista_precios', v_viejo.id, jsonb_build_object(
    'precio', p_precio,
    'vigente_desde', p_desde,
    'vigente_hasta', NULL,
    'activo', true,
    'reemplaza_a', v_viejo.id
  ));

  UPDATE public.lista_precios
     SET vigente_hasta = p_desde - 1, activo = false
   WHERE id = v_viejo.id;

  UPDATE public.prestaciones
     SET requiere_revision = true
   WHERE precio_lista_id = v_viejo.id
     AND estado = 'vigente'
     AND (vigente_hasta IS NULL OR vigente_hasta >= p_desde);

  RETURN v_nuevo;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.reemplazar_precio_de_lista(bigint, numeric, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reemplazar_precio_de_lista(bigint, numeric, date) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 5. La importación de una lista de precios.
--
-- Recibe los renglones ya leídos de la planilla —`[{fila, tipo_servicio, modalidad, precio}]`— y la
-- fecha desde la que rigen. Cada renglón se busca en la lista vigente por tipo de servicio y
-- modalidad:
--   · no está: se agrega;
--   · está una vez: se reemplaza su precio con `reemplazar_precio_de_lista`;
--   · está más de una vez, o el dato no sirve: vuelve como dudoso y no se escribe. Quien importa
--     decide; la base no desempata.
-- Corre entera: si algo falla, no queda escrito ningún renglón.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.importar_lista_de_precios(p_renglones jsonb, p_desde date) RETURNS jsonb
  LANGUAGE plpgsql SECURITY INVOKER
  SET search_path TO ''
AS $$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
  v_renglon    jsonb;
  v_tipo       text;
  v_modalidad  text;
  v_precio     numeric;
  v_fila       integer;
  v_iguales    bigint[];
  v_actual     public.lista_precios;
  v_agregados  integer := 0;
  v_cambiados  integer := 0;
  v_sin_cambio integer := 0;
  v_dudosos    jsonb := '[]'::jsonb;
BEGIN
  IF v_prestadora IS NULL OR NOT interno.es_la_administracion_de_la_prestadora(v_prestadora) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_desde IS NULL OR jsonb_typeof(p_renglones) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;

  FOR v_renglon IN SELECT * FROM jsonb_array_elements(p_renglones) LOOP
    v_fila := NULLIF(v_renglon ->> 'fila', '')::integer;
    v_tipo := btrim(coalesce(v_renglon ->> 'tipo_servicio', ''));
    v_modalidad := btrim(coalesce(v_renglon ->> 'modalidad', ''));
    BEGIN
      v_precio := (v_renglon ->> 'precio')::numeric;
    EXCEPTION WHEN others THEN
      v_precio := NULL;
    END;

    IF v_tipo = '' OR v_modalidad = '' OR v_precio IS NULL OR v_precio <= 0 THEN
      v_dudosos := v_dudosos || jsonb_build_object('fila', v_fila, 'motivo', 'dato_invalido');
      CONTINUE;
    END IF;

    SELECT array_agg(id) INTO v_iguales
      FROM public.lista_precios
     WHERE prestadora_id = v_prestadora
       AND vigente_hasta IS NULL
       AND activo
       AND lower(btrim(tipo_servicio)) = lower(v_tipo)
       AND lower(btrim(modalidad)) = lower(v_modalidad);

    IF v_iguales IS NULL THEN
      INSERT INTO public.lista_precios (tipo_servicio, modalidad, precio, vigente_desde, activo, prestadora_id)
      VALUES (v_tipo, v_modalidad, v_precio, p_desde, true, v_prestadora);
      v_agregados := v_agregados + 1;
    ELSIF array_length(v_iguales, 1) > 1 THEN
      v_dudosos := v_dudosos || jsonb_build_object('fila', v_fila, 'motivo', 'duplicado');
    ELSE
      SELECT * INTO v_actual FROM public.lista_precios WHERE id = v_iguales[1];
      IF v_actual.precio = v_precio THEN
        v_sin_cambio := v_sin_cambio + 1;
      ELSIF p_desde <= v_actual.vigente_desde THEN
        v_dudosos := v_dudosos || jsonb_build_object('fila', v_fila, 'motivo', 'fecha_anterior');
      ELSE
        PERFORM public.reemplazar_precio_de_lista(v_actual.id, v_precio, p_desde);
        v_cambiados := v_cambiados + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'agregados', v_agregados,
    'cambiados', v_cambiados,
    'sin_cambio', v_sin_cambio,
    'dudosos', v_dudosos
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.importar_lista_de_precios(jsonb, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.importar_lista_de_precios(jsonb, date) TO authenticated;

-- El lote de una importación de lista de precios queda anotado junto a los de Asistentes y Clientes.
ALTER TABLE public.importaciones_prestadora DROP CONSTRAINT importaciones_prestadora_tipo_check;
ALTER TABLE public.importaciones_prestadora ADD CONSTRAINT importaciones_prestadora_tipo_check
  CHECK (tipo IN ('asistente', 'cliente', 'lista_precios'));

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 6. La actualización por índice.
--
-- nuevo = vigente × (índice del período nuevo / índice del período de base)
--
-- A qué alcanza:
--   · los renglones vigentes de la lista de precios, si la forma de la Prestadora es 'indice';
--   · las prestaciones vigentes y sin fecha de fin de cada Servicio cuya forma —la propia, o si no
--     la de la Prestadora— sea 'indice', con su índice —el propio, o si no el de la Prestadora—.
--
-- RIGE DESDE EL PRIMER DÍA DE UN MES. La factura de un período cobra entera cada prestación que
-- corre en él (`backend/src/utils/facturaDelPeriodo.js`): si el precio nuevo arrancara a mitad de
-- mes, ese mes se cobrarían el viejo y el nuevo. Empezando el día 1, el renglón viejo termina el
-- último día del mes anterior y cada mes cobra uno solo.
--
-- La prestación vieja queda 'vigente' con su fecha de fin, igual que una que terminó: así lo
-- distingue el Panel («Terminada») y así la deja afuera la factura de los meses siguientes.
--
-- Con `p_aplicar = false` sólo muestra lo que haría, sin escribir nada: es la vista previa. Con
-- `true` escribe todo o nada.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.actualizar_precios_por_indice(
  p_desde date, p_periodo_base date, p_periodo_nuevo date, p_aplicar boolean
) RETURNS TABLE (
  clase text, renglon_id bigint, renglon_nuevo_id bigint, servicio_id uuid, descripcion text,
  indice text, precio_actual numeric, precio_nuevo numeric, moneda text
)
  LANGUAGE plpgsql SECURITY INVOKER
  SET search_path TO ''
AS $$
DECLARE
  v_prestadora  uuid := interno.prestadora_actual();
  v_regla       jsonb;
  v_forma_p     text;
  v_indice_p    text;
  v_factor      numeric;
  v_lista       public.lista_precios;
  v_prestacion  record;
  v_pendientes  jsonb;
  v_elemento    jsonb;
  v_reemplazo   bigint;
BEGIN
  IF v_prestadora IS NULL OR NOT interno.es_la_administracion_de_la_prestadora(v_prestadora) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_desde IS NULL OR p_periodo_base IS NULL OR p_periodo_nuevo IS NULL
     OR p_desde <> date_trunc('month', p_desde)::date
     OR date_trunc('month', p_periodo_nuevo) <= date_trunc('month', p_periodo_base) THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;

  SELECT c.regla INTO v_regla FROM public.configuracion_facturacion_clientes c
   WHERE c.prestadora_id = v_prestadora;
  -- Un valor que no está en la lista se ignora y rige el de fábrica, igual que en
  -- `condicionDe` de `panel/src/lib/condicionesDelCliente.js`.
  v_forma_p := CASE WHEN v_regla ->> 'forma_de_actualizacion' IN ('manual', 'importacion', 'indice')
                    THEN v_regla ->> 'forma_de_actualizacion' ELSE 'manual' END;
  v_indice_p := NULLIF(btrim(coalesce(v_regla ->> 'indice_de_actualizacion', '')), '');

  -- Las prestaciones se eligen antes de tocar la lista, con su marca de revisión de ese momento:
  -- reemplazar un renglón de la lista marca a revisar las que apuntan a él, y la que se versiona
  -- acá no tiene nada que revisar.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'servicio_id', p.servicio_id, 'tipo_servicio', p.tipo_servicio,
           'precio_final', p.precio_final, 'precio_lista_snapshot', p.precio_lista_snapshot,
           'precio_lista_id', p.precio_lista_id, 'requiere_revision', p.requiere_revision,
           'moneda', p.moneda, 'indice', x.indice)), '[]'::jsonb)
    INTO v_pendientes
    FROM public.prestaciones p
    LEFT JOIN public.condiciones_comerciales_servicio c ON c.servicio_id = p.servicio_id
    CROSS JOIN LATERAL (SELECT
        coalesce(c.forma_de_actualizacion, v_forma_p) AS forma,
        coalesce(NULLIF(btrim(coalesce(c.indice_de_actualizacion, '')), ''), v_indice_p) AS indice) x
   WHERE p.prestadora_id = v_prestadora
     AND p.estado = 'vigente'
     AND p.vigente_hasta IS NULL
     AND p.vigente_desde < p_desde
     AND p.servicio_id IS NOT NULL
     AND x.forma = 'indice';

  -- La lista de precios de la Prestadora.
  IF v_forma_p = 'indice' THEN
    v_factor := public.valor_del_indice(v_indice_p, p_periodo_nuevo)
              / NULLIF(public.valor_del_indice(v_indice_p, p_periodo_base), 0);
    FOR v_lista IN
      SELECT * FROM public.lista_precios l
       WHERE l.prestadora_id = v_prestadora AND l.vigente_hasta IS NULL AND l.activo
         AND l.vigente_desde < p_desde
       ORDER BY l.tipo_servicio, l.modalidad, l.id
    LOOP
      clase := 'lista';
      renglon_id := v_lista.id;
      renglon_nuevo_id := NULL;
      servicio_id := NULL;
      descripcion := v_lista.tipo_servicio || ' — ' || v_lista.modalidad;
      indice := v_indice_p;
      precio_actual := v_lista.precio;
      precio_nuevo := round(v_lista.precio * v_factor, 2);
      moneda := v_lista.moneda;
      IF p_aplicar AND precio_nuevo IS NOT NULL THEN
        renglon_nuevo_id := public.reemplazar_precio_de_lista(v_lista.id, precio_nuevo, p_desde);
      END IF;
      RETURN NEXT;
    END LOOP;
  END IF;

  -- Las prestaciones de los Servicios que se actualizan por índice.
  FOR v_elemento IN SELECT * FROM jsonb_array_elements(v_pendientes) LOOP
    v_factor := public.valor_del_indice(v_elemento ->> 'indice', p_periodo_nuevo)
              / NULLIF(public.valor_del_indice(v_elemento ->> 'indice', p_periodo_base), 0);
    clase := 'prestacion';
    renglon_id := (v_elemento ->> 'id')::bigint;
    renglon_nuevo_id := NULL;
    servicio_id := (v_elemento ->> 'servicio_id')::uuid;
    descripcion := v_elemento ->> 'tipo_servicio';
    indice := v_elemento ->> 'indice';
    precio_actual := (v_elemento ->> 'precio_final')::numeric;
    precio_nuevo := round(precio_actual * v_factor, 2);
    moneda := v_elemento ->> 'moneda';

    IF p_aplicar AND precio_nuevo IS NOT NULL AND precio_nuevo <> precio_actual THEN
      -- Si el renglón de la lista del que salió fue reemplazado recién, la nueva apunta al nuevo.
      SELECT l.id INTO v_reemplazo FROM public.lista_precios l
       WHERE l.reemplaza_a = NULLIF(v_elemento ->> 'precio_lista_id', '')::bigint
         AND l.vigente_desde = p_desde
       ORDER BY l.id DESC LIMIT 1;

      renglon_nuevo_id := interno.copiar_renglon('public.prestaciones', renglon_id, jsonb_build_object(
        'precio_final', precio_nuevo,
        'precio_lista_snapshot', CASE WHEN v_elemento ->> 'precio_lista_snapshot' IS NULL THEN NULL
                                      ELSE round((v_elemento ->> 'precio_lista_snapshot')::numeric * v_factor, 2) END,
        'precio_lista_id', coalesce(v_reemplazo, NULLIF(v_elemento ->> 'precio_lista_id', '')::bigint),
        'vigente_desde', p_desde,
        'vigente_hasta', NULL,
        'requiere_revision', false
      ));

      UPDATE public.prestaciones
         SET vigente_hasta = p_desde - 1,
             requiere_revision = (v_elemento ->> 'requiere_revision')::boolean
       WHERE id = renglon_id;
    END IF;
    RETURN NEXT;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.actualizar_precios_por_indice(date, date, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actualizar_precios_por_indice(date, date, date, boolean) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
