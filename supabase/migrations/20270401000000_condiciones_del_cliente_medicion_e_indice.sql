-- =============================================================================
-- Condiciones del Cliente: medición en tres capas y ajuste por índice
-- =============================================================================
--
-- QUÉ HACE
--   · Saca de `condiciones_comerciales_servicio` la columna `forma_de_actualizacion`
--     y su restricción `indice_solo_con_forma_por_indice`. Ya no se elige entre
--     manual, importación e índice: un Servicio con índice se ajusta por índice,
--     y uno sin índice se cambia a mano o por importación, cuando se quiera.
--   · Cambia la clave foránea de `indice_de_actualizacion` por un disparador que
--     acepta también 'ninguno': un Servicio puede decir «sin índice» aunque la
--     Prestadora tenga uno.
--   · Agrega las columnas de la medición —qué se descuenta, qué cuenta como
--     adicional y a qué valor se cobra— y las del ajuste por índice —cada cuántos
--     meses y si se aplica solo o con revisión previa—.
--
-- Vacío en cualquiera de ellas quiere decir «rige el de la Prestadora», y el de
-- la Prestadora, si tampoco hay, el de fábrica: `panel/src/lib/condicionesDelCliente.js`.
--
-- QUÉ SE COMPROBÓ EN LA BASE EN VIVO ANTES DE ESCRIBIRLA
--   · Ninguna de las 15 filas de `condiciones_comerciales_servicio` tiene
--     `forma_de_actualizacion`, `indice_de_actualizacion`, `frecuencia_de_cobro`
--     ni `medicion` cargados.
--   · Las dos `configuracion_facturacion_clientes.regla` están vacías.
--   · `actualizar_precios_por_indice` es la única función que lee
--     `forma_de_actualizacion`, y ninguna vista la usa: se reescribe acá mismo,
--     en el punto 4, para que no quede rota ni un momento.
--
-- CÓMO SE VUELVE ATRÁS
--   Con otra migración que vuelva a agregar la columna y la restricción, y saque
--   las nuevas. No hay datos que recuperar.
-- =============================================================================

BEGIN;

-- 1. Fuera la forma de actualización.
ALTER TABLE public.condiciones_comerciales_servicio
  DROP CONSTRAINT IF EXISTS indice_solo_con_forma_por_indice,
  DROP COLUMN forma_de_actualizacion;

-- 2. El índice del Servicio: un código de la tabla de índices, o 'ninguno'.
ALTER TABLE public.condiciones_comerciales_servicio
  DROP CONSTRAINT IF EXISTS condiciones_comerciales_servicio_indice_de_actualizacion_fkey;

CREATE FUNCTION interno.revisar_indice_del_servicio() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER
  SET search_path TO ''
AS $$
BEGIN
  IF NEW.indice_de_actualizacion IS NULL OR NEW.indice_de_actualizacion = 'ninguno' THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.indices_de_actualizacion i
                  WHERE i.codigo = NEW.indice_de_actualizacion) THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION interno.revisar_indice_del_servicio() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.revisar_indice_del_servicio() TO authenticated, trabajo_sin_persona;

CREATE TRIGGER revisar_indice_del_servicio
  BEFORE INSERT OR UPDATE OF indice_de_actualizacion ON public.condiciones_comerciales_servicio
  FOR EACH ROW EXECUTE FUNCTION interno.revisar_indice_del_servicio();

-- 3. La medición y el ajuste por índice propios del Servicio.
ALTER TABLE public.condiciones_comerciales_servicio
  ADD COLUMN cobra_cancelada_por_el_cliente boolean,
  ADD COLUMN descuenta_lo_no_prestado boolean,
  ADD COLUMN cobra_guardias_adicionales boolean,
  ADD COLUMN cobra_horas_adicionales boolean,
  ADD COLUMN recargo_del_adicional integer
    CHECK (recargo_del_adicional BETWEEN 0 AND 500),
  ADD COLUMN meses_entre_actualizaciones integer
    CHECK (meses_entre_actualizaciones BETWEEN 1 AND 24),
  ADD COLUMN ajuste_por_indice text
    CHECK (ajuste_por_indice IN ('automatico', 'revision_previa'));

-- La tabla abre UPDATE columna por columna: sin esto, las nuevas no se podrían cambiar.
GRANT UPDATE (
  cobra_cancelada_por_el_cliente, descuenta_lo_no_prestado, cobra_guardias_adicionales,
  cobra_horas_adicionales, recargo_del_adicional, meses_entre_actualizaciones, ajuste_por_indice
) ON public.condiciones_comerciales_servicio TO authenticated;

-- 4. La actualización por índice, sin la forma de actualización.
--
-- A qué alcanza ahora:
--   · los renglones vigentes de la lista de precios, si la Prestadora tiene índice;
--   · las prestaciones vigentes y sin fecha de fin de cada Servicio que tenga índice —el propio,
--     o si no el de la Prestadora—. Un Servicio con 'ninguno' no se actualiza.
-- El resto queda como en `20270330000300_actualizacion_de_precios.sql`.
CREATE OR REPLACE FUNCTION public.actualizar_precios_por_indice(
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
REVOKE EXECUTE ON FUNCTION public.actualizar_precios_por_indice(date, date, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actualizar_precios_por_indice(date, date, date, boolean) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
