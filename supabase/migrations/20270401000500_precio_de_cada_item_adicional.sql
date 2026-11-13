-- =============================================================================
-- Precio de cada ítem adicional de la factura del período
-- =============================================================================
--
-- QUÉ HACE
--   1. Quita el recargo porcentual del adicional: la clave de la regla de
--      facturación de cada Prestadora, la columna de las condiciones comerciales
--      del Servicio y la columna de los ítems de la factura.
--   2. Agrega a `prestaciones` el precio pactado de cada guardia adicional y de
--      cada hora adicional, los dos optativos, en la moneda de la prestación.
--   3. Las tres funciones que cambian el precio de una prestación por índice
--      cambian también esos dos precios, con el mismo factor.
--   4. `public.fijar_precio_de_item_adicional(uuid, numeric, jsonb)`: cambia el
--      precio unitario de un ítem adicional de una factura que todavía no se
--      emitió ni tiene comprobante, y en la misma transacción el importe de cada
--      descuento y el total de la factura. Corre con los permisos de quien llama,
--      así que la RLS sigue mandando, y exige el permiso
--      `editar_condiciones_comerciales_servicio`.
--   5. El disparador `anotar_precio_de_item_adicional` deja en el registro de
--      actividad quién, cuándo, en qué factura, el precio anterior y el nuevo.
--   6. Agrega al catálogo la acción `cambio_de_precio_de_item_adicional` y los
--      datos con nombre que usan esa acción, el ajuste por índice y el cambio de
--      responsable de la facturación, que no estaban.
--
-- QUÉ SE COMPROBÓ EN LA BASE EN VIVO (2026-11-13)
--   · 0 prestaciones, 0 facturas de cliente, 0 ítems adicionales.
--   · 0 reglas con `recargo_del_adicional`, 0 condiciones y 0 ítems con recargo:
--     quitar las columnas no pierde ningún dato.
--   · `catalogo_datos_del_registro` llega a orden 16 y `catalogo_acciones_registradas`
--     a orden 26. Las dos tienen la clave como clave primaria.
--   · Los únicos disparadores de `facturas_cliente_items` son `trg_completar_moneda`
--     y `trg_completar_prestadora`, los dos BEFORE INSERT.
--
-- CÓMO SE VUELVE ATRÁS
--   Otra migración adelante que borre la función, el disparador y su función, las
--   dos columnas de `prestaciones`, la acción y los datos agregados al catálogo, que
--   vuelva a crear las dos columnas del recargo con sus restricciones y permisos, y
--   que reponga las tres funciones del ajuste por índice como estaban en
--   `20270401000400_revision_de_precios_y_descuento_simples.sql`.
-- =============================================================================

BEGIN;

-- 1. Sin recargo del adicional ------------------------------------------------

UPDATE public.configuracion_facturacion_clientes
   SET regla = regla - 'recargo_del_adicional'
 WHERE regla ? 'recargo_del_adicional';

ALTER TABLE public.condiciones_comerciales_servicio DROP COLUMN recargo_del_adicional;
ALTER TABLE public.facturas_cliente_items DROP COLUMN recargo_del_adicional;

-- 2. Precios pactados de los adicionales ---------------------------------------

ALTER TABLE public.prestaciones
  ADD COLUMN precio_guardia_adicional numeric(12,2),
  ADD COLUMN precio_hora_adicional numeric(12,2),
  ADD CONSTRAINT prestaciones_adicionales_no_negativos CHECK (
    (precio_guardia_adicional IS NULL OR precio_guardia_adicional >= 0)
    AND (precio_hora_adicional IS NULL OR precio_hora_adicional >= 0));

COMMENT ON COLUMN public.prestaciones.precio_guardia_adicional IS 'Precio pactado de cada guardia adicional, en la moneda de la prestación. Vacío: la factura la valúa en proporción al precio pactado. Cambia con el precio cuando se ajusta.';
COMMENT ON COLUMN public.prestaciones.precio_hora_adicional IS 'Precio pactado de cada hora adicional, en la moneda de la prestación. Vacío: la factura la valúa en proporción al precio pactado. Cambia con el precio cuando se ajusta.';

-- 3. Catálogo del registro de actividad ----------------------------------------

INSERT INTO public.catalogo_acciones_registradas (accion, grupo, orden, la_hace_el_sistema)
VALUES ('cambio_de_precio_de_item_adicional', 'consecuencia_economica', 27, false)
ON CONFLICT (accion) DO NOTHING;

INSERT INTO public.catalogo_datos_del_registro (clave, orden)
VALUES ('factura_id', 17), ('precio_anterior', 18), ('precio_nuevo', 19), ('moneda', 20),
       ('prestacion_id', 21), ('prestacion_nueva_id', 22), ('servicio_id', 23),
       ('indice', 24), ('precio_actual', 25), ('precio_propuesto', 26),
       ('rige_desde', 27), ('responsable_anterior', 28), ('responsable_nuevo', 29)
ON CONFLICT (clave) DO NOTHING;

-- 4. Ajuste por índice: también los precios de los adicionales ------------------

CREATE OR REPLACE FUNCTION "public"."actualizar_precios_por_indice"("p_desde" "date", "p_periodo_base" "date", "p_periodo_nuevo" "date", "p_aplicar" boolean) RETURNS TABLE("clase" "text", "renglon_id" bigint, "renglon_nuevo_id" bigint, "servicio_id" "uuid", "descripcion" "text", "indice" "text", "precio_actual" numeric, "precio_nuevo" numeric, "moneda" "text")
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  v_prestadora  uuid := interno.prestadora_actual();
  v_regla       jsonb;
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
  -- Igual que `condicionDe` de `panel/src/lib/condicionesDelCliente.js`: 'ninguno' es «sin índice».
  v_indice_p := NULLIF(NULLIF(btrim(coalesce(v_regla ->> 'indice_de_actualizacion', '')), ''), 'ninguno');

  -- Las prestaciones se eligen antes de tocar la lista, con su marca de revisión de ese momento:
  -- reemplazar un renglón de la lista marca a revisar las que apuntan a él, y la que se versiona
  -- acá no tiene nada que revisar.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'servicio_id', p.servicio_id, 'tipo_servicio', p.tipo_servicio,
           'precio_final', p.precio_final, 'precio_lista_snapshot', p.precio_lista_snapshot,
           'precio_lista_id', p.precio_lista_id, 'requiere_revision', p.requiere_revision,
           'precio_guardia_adicional', p.precio_guardia_adicional,
           'precio_hora_adicional', p.precio_hora_adicional,
           'moneda', p.moneda, 'indice', x.indice)), '[]'::jsonb)
    INTO v_pendientes
    FROM public.prestaciones p
    LEFT JOIN public.condiciones_comerciales_servicio c ON c.servicio_id = p.servicio_id
    CROSS JOIN LATERAL (SELECT
        CASE WHEN c.indice_de_actualizacion = 'ninguno' THEN NULL
             ELSE coalesce(NULLIF(btrim(coalesce(c.indice_de_actualizacion, '')), ''), v_indice_p) END AS indice) x
   WHERE p.prestadora_id = v_prestadora
     AND p.estado = 'vigente'
     AND p.vigente_hasta IS NULL
     AND p.vigente_desde < p_desde
     AND p.servicio_id IS NOT NULL
     AND x.indice IS NOT NULL;

  -- La lista de precios de la Prestadora.
  IF v_indice_p IS NOT NULL THEN
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
        'precio_guardia_adicional', CASE WHEN v_elemento ->> 'precio_guardia_adicional' IS NULL THEN NULL
                                         ELSE round((v_elemento ->> 'precio_guardia_adicional')::numeric * v_factor, 2) END,
        'precio_hora_adicional', CASE WHEN v_elemento ->> 'precio_hora_adicional' IS NULL THEN NULL
                                      ELSE round((v_elemento ->> 'precio_hora_adicional')::numeric * v_factor, 2) END,
        'precio_lista_id', coalesce(v_reemplazo, NULLIF(v_elemento ->> 'precio_lista_id', '')::bigint),
        'vigente_desde', p_desde,
        'vigente_hasta', NULL,
        'requiere_revision', false,
        'prestacion_anterior_id', renglon_id
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


CREATE OR REPLACE FUNCTION "public"."ajustar_precios_por_indice"() RETURNS TABLE("aplicados" integer, "propuestos" integer, "sin_efecto" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_prest      uuid := interno.prestadora_actual();
  v_regla      jsonb;
  v            record;
  v_ancla      date;
  v_rige       date;
  v_base       date;
  v_nuevo      date;
  v_factor     numeric;
  v_precio     numeric;
  v_propuesta  uuid;
  v_nueva      bigint;
BEGIN
  IF v_prest IS NULL OR coalesce(auth.jwt() ->> 'role', '') <> 'trabajo_sin_persona' THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;

  -- Dos corridas a la vez para la misma Prestadora harían el mismo ajuste dos veces.
  PERFORM pg_advisory_xact_lock(hashtextextended('ajuste_por_indice:' || v_prest::text, 0));

  aplicados := 0;
  propuestos := 0;
  sin_efecto := 0;

  SELECT c.regla INTO v_regla FROM public.configuracion_facturacion_clientes c
   WHERE c.prestadora_id = v_prest;

  -- Las pendientes que ya no corresponden: la prestación dejó de ser la vigente, cambió su
  -- precio, o el Servicio cambió de índice o lo sacó.
  WITH vencidas AS (
    UPDATE public.propuestas_de_ajuste_por_indice pr
       SET estado = 'sin_efecto'
      FROM public.prestaciones p
      LEFT JOIN public.condiciones_comerciales_servicio c ON c.servicio_id = p.servicio_id
     WHERE pr.prestadora_id = v_prest
       AND pr.estado = 'pendiente'
       AND p.id = pr.prestacion_id
       AND (p.estado <> 'vigente'
            OR p.vigente_hasta IS NOT NULL
            OR p.precio_final <> pr.precio_actual
            OR (SELECT x.indice FROM interno.condiciones_del_ajuste_por_indice(
                  v_regla, c.indice_de_actualizacion, c.meses_entre_actualizaciones, c.ajuste_por_indice) x)
               IS DISTINCT FROM pr.indice)
    RETURNING pr.id
  )
  SELECT count(*) INTO sin_efecto FROM vencidas;

  FOR v IN
    SELECT p.id, p.servicio_id, p.vigente_desde, p.precio_final, p.precio_lista_snapshot, p.moneda,
           p.precio_guardia_adicional, p.precio_hora_adicional,
           x.indice, x.meses, x.ajuste
      FROM public.prestaciones p
      LEFT JOIN public.condiciones_comerciales_servicio c ON c.servicio_id = p.servicio_id
     CROSS JOIN LATERAL interno.condiciones_del_ajuste_por_indice(
           v_regla, c.indice_de_actualizacion, c.meses_entre_actualizaciones, c.ajuste_por_indice) x
     WHERE p.prestadora_id = v_prest
       AND p.estado = 'vigente'
       AND p.vigente_hasta IS NULL
       AND p.servicio_id IS NOT NULL
       AND p.vigente_desde <= current_date
       AND p.precio_final > 0
       AND x.indice IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.propuestas_de_ajuste_por_indice pr
                        WHERE pr.prestacion_id = p.id AND pr.estado = 'pendiente')
     ORDER BY p.id
  LOOP
    SELECT greatest(date_trunc('month', v.vigente_desde)::date, max(pr.rige_desde))
      INTO v_ancla
      FROM public.propuestas_de_ajuste_por_indice pr
     WHERE pr.prestacion_id = v.id AND pr.estado = 'rechazada';

    v_rige := (v_ancla + make_interval(months => v.meses))::date;
    CONTINUE WHEN current_date < v_rige;

    v_base := (date_trunc('month', v.vigente_desde) - interval '1 month')::date;
    v_nuevo := (v_rige - interval '1 month')::date;

    v_factor := interno.valor_del_indice_de_la_prestadora(v_prest, v.indice, v_nuevo)
              / NULLIF(interno.valor_del_indice_de_la_prestadora(v_prest, v.indice, v_base), 0);
    CONTINUE WHEN v_factor IS NULL;

    v_precio := round(v.precio_final * v_factor, 2);
    CONTINUE WHEN v_precio = v.precio_final;

    -- Ya hubo un ajuste para ese mes (rechazado, por ejemplo): no se vuelve a proponer.
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.propuestas_de_ajuste_por_indice pr
                           WHERE pr.prestacion_id = v.id AND pr.rige_desde = v_rige
                             AND pr.estado <> 'sin_efecto');

    IF v.ajuste = 'automatico' THEN
      v_nueva := interno.copiar_renglon('public.prestaciones', v.id, jsonb_build_object(
        'precio_final', v_precio,
        'precio_lista_snapshot', CASE WHEN v.precio_lista_snapshot IS NULL THEN NULL
                                      ELSE round(v.precio_lista_snapshot * v_factor, 2) END,
        'precio_guardia_adicional', CASE WHEN v.precio_guardia_adicional IS NULL THEN NULL
                                         ELSE round(v.precio_guardia_adicional * v_factor, 2) END,
        'precio_hora_adicional', CASE WHEN v.precio_hora_adicional IS NULL THEN NULL
                                      ELSE round(v.precio_hora_adicional * v_factor, 2) END,
        'vigente_desde', v_rige,
        'vigente_hasta', NULL,
        'requiere_revision', false,
        'prestacion_anterior_id', v.id
      ));

      INSERT INTO public.propuestas_de_ajuste_por_indice (
        prestadora_id, prestacion_id, servicio_id, indice, periodo_base, periodo_nuevo,
        precio_actual, precio_propuesto, moneda, rige_desde, estado, prestacion_nueva_id)
      VALUES (v_prest, v.id, v.servicio_id, v.indice, v_base, v_nuevo,
              v.precio_final, v_precio, v.moneda, v_rige, 'aplicada', v_nueva)
      RETURNING id INTO v_propuesta;

      INSERT INTO public.registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, detalle)
      VALUES (v_prest, NULL, 'ajuste_por_indice_aplicado', 'propuestas_de_ajuste_por_indice', v_propuesta,
              jsonb_build_object('prestacion_id', v.id, 'prestacion_nueva_id', v_nueva,
                                 'servicio_id', v.servicio_id, 'indice', v.indice,
                                 'precio_anterior', v.precio_final, 'precio_nuevo', v_precio,
                                 'moneda', v.moneda, 'rige_desde', v_rige));
      aplicados := aplicados + 1;
    ELSE
      INSERT INTO public.propuestas_de_ajuste_por_indice (
        prestadora_id, prestacion_id, servicio_id, indice, periodo_base, periodo_nuevo,
        precio_actual, precio_propuesto, moneda, rige_desde)
      VALUES (v_prest, v.id, v.servicio_id, v.indice, v_base, v_nuevo,
              v.precio_final, v_precio, v.moneda, v_rige);
      propuestos := propuestos + 1;
    END IF;
  END LOOP;

  RETURN NEXT;
END;
$$;


CREATE OR REPLACE FUNCTION "public"."revisar_propuesta_de_ajuste"("p_propuesta" "uuid", "p_precio" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_prest   uuid := interno.prestadora_actual();
  v_quien   uuid := interno.usuario_de_la_sesion();
  pr        public.propuestas_de_ajuste_por_indice;
  p         public.prestaciones;
  v_precio  numeric := round(p_precio, 2);
  v_nueva   bigint;
BEGIN
  IF v_prest IS NULL OR v_quien IS NULL
     OR NOT interno.es_la_administracion_de_la_prestadora(v_prest) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF v_precio IS NULL OR v_precio <= 0 THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO pr FROM public.propuestas_de_ajuste_por_indice
   WHERE id = p_propuesta AND prestadora_id = v_prest
   FOR UPDATE;
  IF NOT FOUND OR pr.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  -- El mismo precio actual: no cambia nada.
  IF v_precio = pr.precio_actual THEN
    UPDATE public.propuestas_de_ajuste_por_indice
       SET estado = 'rechazada', revisada_por = v_quien, revisada_en = now()
     WHERE id = pr.id;

    INSERT INTO public.registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, detalle)
    VALUES (v_prest, v_quien, 'ajuste_por_indice_rechazado', 'propuestas_de_ajuste_por_indice', pr.id,
            jsonb_build_object('prestacion_id', pr.prestacion_id, 'servicio_id', pr.servicio_id,
                               'indice', pr.indice, 'precio_actual', pr.precio_actual,
                               'precio_propuesto', pr.precio_propuesto, 'moneda', pr.moneda,
                               'rige_desde', pr.rige_desde));
    RETURN;
  END IF;

  SELECT * INTO p FROM public.prestaciones
   WHERE id = pr.prestacion_id AND prestadora_id = v_prest
   FOR UPDATE;
  IF NOT FOUND OR p.estado <> 'vigente' OR p.vigente_hasta IS NOT NULL
     OR p.precio_final <> pr.precio_actual THEN
    RAISE EXCEPTION 'ya_reemplazado' USING ERRCODE = 'P0001';
  END IF;

  -- Rige desde el mes que correspondía, aunque ya haya pasado.
  v_nueva := interno.copiar_renglon('public.prestaciones', p.id, jsonb_build_object(
    'precio_final', v_precio,
    'precio_lista_snapshot', CASE WHEN p.precio_lista_snapshot IS NULL THEN NULL
                                  ELSE round(p.precio_lista_snapshot * v_precio / pr.precio_actual, 2) END,
    'precio_guardia_adicional', CASE WHEN p.precio_guardia_adicional IS NULL THEN NULL
                                     ELSE round(p.precio_guardia_adicional * v_precio / pr.precio_actual, 2) END,
    'precio_hora_adicional', CASE WHEN p.precio_hora_adicional IS NULL THEN NULL
                                  ELSE round(p.precio_hora_adicional * v_precio / pr.precio_actual, 2) END,
    'vigente_desde', pr.rige_desde,
    'vigente_hasta', NULL,
    'requiere_revision', false,
    'prestacion_anterior_id', p.id
  ));

  UPDATE public.propuestas_de_ajuste_por_indice
     SET estado = 'aceptada', revisada_por = v_quien, revisada_en = now(), prestacion_nueva_id = v_nueva
   WHERE id = pr.id;

  INSERT INTO public.registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, detalle)
  VALUES (v_prest, v_quien, 'ajuste_por_indice_aceptado', 'propuestas_de_ajuste_por_indice', pr.id,
          jsonb_build_object('prestacion_id', p.id, 'prestacion_nueva_id', v_nueva,
                             'servicio_id', pr.servicio_id, 'indice', pr.indice,
                             'precio_anterior', pr.precio_actual, 'precio_propuesto', pr.precio_propuesto,
                             'precio_nuevo', v_precio, 'moneda', pr.moneda, 'rige_desde', pr.rige_desde));
END;
$$;


-- 5. Auditoría del cambio de precio ---------------------------------------------

CREATE OR REPLACE FUNCTION "interno"."anotar_precio_de_item_adicional"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_usuario uuid := interno.usuario_de_la_sesion();
BEGIN
  IF v_usuario IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.registro_actividad
    (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, campos_cambiados, detalle)
  VALUES
    (NEW.prestadora_id, v_usuario, 'cambio_de_precio_de_item_adicional', TG_TABLE_NAME, NEW.id,
     ARRAY['precio_unitario', 'monto'],
     jsonb_build_object('factura_id', NEW.factura_id,
                        'precio_anterior', OLD.precio_unitario,
                        'precio_nuevo', NEW.precio_unitario,
                        'moneda', NEW.moneda));
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION interno.anotar_precio_de_item_adicional() FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION interno.anotar_precio_de_item_adicional() TO service_role;

CREATE TRIGGER anotar_precio_de_item_adicional
  AFTER UPDATE OF precio_unitario ON public.facturas_cliente_items
  FOR EACH ROW
  WHEN (NEW.concepto = 'adicional' AND OLD.precio_unitario IS DISTINCT FROM NEW.precio_unitario)
  EXECUTE FUNCTION interno.anotar_precio_de_item_adicional();

-- 6. Cambio del precio de un ítem adicional --------------------------------------

CREATE OR REPLACE FUNCTION "public"."fijar_precio_de_item_adicional"("p_item" "uuid", "p_precio" numeric, "p_descuentos" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  v_prest uuid := interno.prestadora_actual();
  v_precio numeric := round(p_precio, 2);
  v_item record;
  v_factura uuid;
  v_descuento record;
  v_valor jsonb;
  v_total numeric;
BEGIN
  IF v_prest IS NULL OR interno.usuario_de_la_sesion() IS NULL
     OR NOT interno.tiene_permiso('editar_condiciones_comerciales_servicio') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_item IS NULL OR v_precio IS NULL OR v_precio < 0
     OR p_descuentos IS NULL OR jsonb_typeof(p_descuentos) <> 'object' THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;

  SELECT i.id, i.factura_id, i.cantidad, i.precio_unitario INTO v_item
    FROM public.facturas_cliente_items i
   WHERE i.id = p_item AND i.prestadora_id = v_prest AND i.concepto = 'adicional'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF v_item.cantidad IS NULL THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;

  -- La factura se cambia mientras no se emitió ni tiene comprobante.
  SELECT f.id INTO v_factura
    FROM public.facturas_cliente f
   WHERE f.id = v_item.factura_id AND f.prestadora_id = v_prest
     AND f.facturado_at IS NULL AND f.monto_facturado IS NULL AND f.comprobante_subido_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;

  IF v_precio IS NOT DISTINCT FROM v_item.precio_unitario THEN
    RETURN;
  END IF;

  -- Cada descuento de la factura llega recalculado, y sólo esos.
  IF (SELECT count(*) FROM jsonb_object_keys(p_descuentos)) <> (
    SELECT count(*) FROM public.facturas_cliente_items i
     WHERE i.factura_id = v_factura AND i.concepto = 'descuento'
  ) THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.facturas_cliente_items
     SET precio_unitario = v_precio,
         monto = round(v_item.cantidad * v_precio, 2)
   WHERE id = v_item.id;

  FOR v_descuento IN
    SELECT i.id, i.descuento_id FROM public.facturas_cliente_items i
     WHERE i.factura_id = v_factura AND i.concepto = 'descuento'
  LOOP
    v_valor := p_descuentos -> (v_descuento.descuento_id::text);
    IF v_valor IS NULL OR jsonb_typeof(v_valor) <> 'number' OR (v_valor #>> '{}')::numeric < 0 THEN
      RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.facturas_cliente_items
       SET monto = -round((v_valor #>> '{}')::numeric, 2)
     WHERE id = v_descuento.id;
  END LOOP;

  SELECT coalesce(sum(i.monto), 0) INTO v_total
    FROM public.facturas_cliente_items i WHERE i.factura_id = v_factura;
  IF v_total < 0 THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.facturas_cliente SET monto_total = v_total WHERE id = v_factura;
END;
$$;

REVOKE ALL ON FUNCTION public.fijar_precio_de_item_adicional(uuid, numeric, jsonb) FROM PUBLIC, anon;
GRANT ALL ON FUNCTION public.fijar_precio_de_item_adicional(uuid, numeric, jsonb) TO service_role, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
