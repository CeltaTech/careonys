-- Las promociones: el precio de lista por un tiempo acotado, y el descuento a un Cliente en su
-- Servicio.
--
-- QUÉ HACE
--
--   1. LA PROMOCIÓN GENERAL ES UN RENGLÓN MÁS DE LA LISTA, CON FECHA DE FIN, QUE NO CIERRA AL DE
--      SIEMPRE. `lista_precios.promocion_de` apunta al renglón del precio de siempre. La promoción
--      lleva `vigente_desde` y `vigente_hasta` (obligatoria), y el renglón de siempre sigue abierto.
--      Qué precio rige en una fecha lo dice una consulta (`public.precios_de_lista_que_rigen`): entre
--      los renglones vigentes ese día para el mismo tipo, modalidad y moneda, gana la promoción. Al
--      día siguiente del fin, la promoción ya no está vigente y el de siempre vuelve a regir solo:
--      ninguna tarea reescribe filas y no hay nada que volver a crear.
--
--      Las tres maneras de cambiar precios ya escritas dejan la promoción afuera sin tocarlas,
--      porque las tres trabajan sobre los renglones abiertos (`vigente_hasta IS NULL`) y una
--      promoción nunca está abierta: `reemplazar_precio_de_lista` la rechaza (`ya_reemplazado`), y
--      `importar_lista_de_precios` y `actualizar_precios_por_indice` no la ven. Si el de siempre se
--      reemplaza mientras corre una promoción, la promoción sigue ganando hasta su fin y después
--      rige el reemplazo.
--
--   2. LAS PRESTACIONES. Una prestación guarda su precio pactado (`precio_final`,
--      `precio_lista_snapshot`), así que la lista nunca lo cambia sola.
--        · Las que apuntan al renglón de siempre no se tocan ni se marcan: el renglón de siempre no
--          cambia (la promoción es un INSERT, y `trigger_precio_lista_actualizado` sólo salta con un
--          UPDATE del precio), y su precio pactado sigue siendo el que se pactó. A un Cliente que ya
--          tiene precio se le hace precio especial con un descuento en su Servicio (punto 3).
--        · Las que se pactan durante la promoción apuntan al renglón de la promoción. Cuando la
--          promoción termina y la prestación sigue vigente, aparece en
--          `public.prestaciones_con_promocion_vencida()`, que se resuelve consultando la fecha, igual
--          que la lista, para que quien coordina decida el precio desde ese día.
--
--   3. EL DESCUENTO A UN CLIENTE EN SU SERVICIO: tabla `descuentos_del_servicio`. Un porcentaje o un
--      monto (con su moneda), desde una fecha, por una cantidad de períodos de facturación o hasta
--      una fecha. No se borra: se termina (`terminado_en`, `terminado_por`), y quién lo cargó y quién
--      lo terminó lo escribe la base, no quien llama. El alta y la terminación quedan en
--      `registro_actividad`, grupo `consecuencia_economica`. La lee y la escribe quien tiene el
--      permiso `editar_condiciones_comerciales_servicio`, igual que `condiciones_comerciales_servicio`;
--      `trabajo_sin_persona` la lee para armar las facturas.
--
--   4. EL RENGLÓN DE DESCUENTO EN LA FACTURA: `facturas_cliente_items.descuento_id`, para que el
--      renglón que resta se pueda reconocer y llegar al descuento que lo originó.
--
-- QUÉ SE COMPROBÓ EN LA BASE EN VIVO (sólo lectura, 2026-11-13)
--   · `lista_precios`: 2 renglones, de 2 Prestadoras; 0 cerrados, 0 reemplazos, 0 inactivos, 0 con
--     fecha futura. Columnas `vigente_hasta` y `reemplaza_a` ya presentes (20270330000300 aplicada).
--     Restricciones: `lista_precios_vigencia_coherente`, `lista_precios_reemplaza_a_fkey`. Índices:
--     clave, `idx_lista_precios_prestadora_id`, `lista_precios_por_reemplazo`. Ningún índice único
--     por tipo y modalidad: dos renglones vigentes a la vez no chocan con nada.
--   · Disparadores de `lista_precios`: `trg_auditoria_acceso`, `trg_completar_moneda` (BEFORE
--     INSERT) y `trigger_precio_lista_actualizado` (AFTER UPDATE, marca `requiere_revision` sólo si
--     cambió `precio`).
--   · Políticas de `lista_precios`: leen administración y coordinación, escriben administración y
--     superadmin, todas con `prestadora_id = interno.prestadora_actual()`.
--   · `prestaciones` con `precio_lista_id`: 0. Ninguna prestación queda afectada hoy.
--   · `interno.columnas_que_se_copian` copia todas las columnas menos id, created_at y updated_at:
--     `reemplazar_precio_de_lista` copia `promocion_de` del renglón viejo, que en un renglón de
--     siempre es NULL.
--   · `servicios` tiene `UNIQUE (id, prestadora_id)`; `facturas_cliente_items` no tiene restricción
--     sobre el signo de `monto` y admite `unidad` NULL.
--   · `catalogo_acciones_registradas`: 23 acciones, `orden` máximo 23, sin `alta_de_descuento` ni
--     `terminacion_de_descuento`. Grupo `consecuencia_economica` existente.
--   · `catalogo_acciones_permisos`: `editar_condiciones_comerciales_servicio` existe
--     (`default_solo_admin = true`).
--   · `interno.usuario_de_la_sesion()`, `interno.prestadora_actual()`, `interno.tiene_permiso(text)`
--     y `public.fn_auditoria_de_acceso_mutacion()` existen.
--
-- CÓMO SE VUELVE ATRÁS (otra migración adelante, en este orden)
--   DROP FUNCTION public.prestaciones_con_promocion_vencida(date);
--   DROP FUNCTION public.precios_de_lista_que_rigen(date);
--   DROP FUNCTION public.cargar_promocion_de_lista(bigint, numeric, date, date);
--   ALTER TABLE public.facturas_cliente_items DROP COLUMN descuento_id;
--   DROP TABLE public.descuentos_del_servicio;   -- se lleva sus disparadores y políticas
--   DROP FUNCTION interno.descuento_lo_escribe_la_base();
--   DROP FUNCTION interno.anotar_descuento_del_servicio();
--   DELETE FROM public.catalogo_acciones_registradas
--    WHERE accion IN ('alta_de_descuento', 'terminacion_de_descuento');
--     (sólo si `registro_actividad` no tiene renglones con esas acciones; si los tiene, quedan)
--   DELETE FROM public.lista_precios WHERE promocion_de IS NOT NULL;   -- sólo si no hay prestaciones
--   ALTER TABLE public.lista_precios DROP COLUMN promocion_de;          -- que apunten a ellas

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. La promoción en la lista de precios.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.lista_precios
  ADD COLUMN promocion_de bigint REFERENCES public.lista_precios(id),
  -- Una promoción siempre tiene fin: sin fin sería un cambio de precio, y para eso está
  -- `reemplazar_precio_de_lista`.
  ADD CONSTRAINT lista_precios_promocion_con_fin
    CHECK (promocion_de IS NULL OR vigente_hasta IS NOT NULL),
  ADD CONSTRAINT lista_precios_promocion_no_es_reemplazo
    CHECK (promocion_de IS NULL OR reemplaza_a IS NULL);

CREATE INDEX lista_precios_por_promocion ON public.lista_precios (promocion_de);

-- Carga una promoción sobre un renglón de siempre. Devuelve la clave del renglón nuevo.
-- Corre con los permisos de quien llama: la RLS de `lista_precios` decide si puede leer el renglón
-- de siempre y escribir el nuevo.
CREATE FUNCTION public.cargar_promocion_de_lista(p_precio_id bigint, p_precio numeric, p_desde date, p_hasta date)
  RETURNS bigint
  LANGUAGE plpgsql SECURITY INVOKER
  SET search_path TO ''
AS $$
DECLARE
  v_base  public.lista_precios;
  v_nuevo bigint;
BEGIN
  IF p_precio IS NULL OR p_precio <= 0 OR p_desde IS NULL OR p_hasta IS NULL THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;
  IF p_hasta < p_desde THEN
    RAISE EXCEPTION 'fechas_al_reves' USING ERRCODE = 'P0001';
  END IF;

  -- El renglón de siempre se bloquea: dos promociones cargadas al mismo tiempo sobre el mismo
  -- precio no pueden pasar las dos el control de superposición.
  SELECT * INTO v_base FROM public.lista_precios WHERE id = p_precio_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_encontrado' USING ERRCODE = 'P0002';
  END IF;
  -- Sólo sobre un precio de siempre, abierto y activo.
  IF v_base.promocion_de IS NOT NULL OR v_base.vigente_hasta IS NOT NULL OR NOT v_base.activo THEN
    RAISE EXCEPTION 'no_es_precio_vigente' USING ERRCODE = 'P0001';
  END IF;
  IF p_desde < v_base.vigente_desde THEN
    RAISE EXCEPTION 'fecha_anterior' USING ERRCODE = 'P0001';
  END IF;

  -- Dos promociones del mismo tipo, modalidad y moneda no se superponen: el precio de un día
  -- tiene que ser uno solo.
  IF EXISTS (
    SELECT 1 FROM public.lista_precios l
     WHERE l.prestadora_id = v_base.prestadora_id
       AND l.tipo_servicio = v_base.tipo_servicio
       AND l.modalidad = v_base.modalidad
       AND l.moneda = v_base.moneda
       AND l.promocion_de IS NOT NULL
       AND l.activo
       AND l.vigente_desde <= p_hasta
       AND l.vigente_hasta >= p_desde
  ) THEN
    RAISE EXCEPTION 'promocion_superpuesta' USING ERRCODE = 'P0001';
  END IF;

  v_nuevo := interno.copiar_renglon('public.lista_precios', v_base.id, jsonb_build_object(
    'precio', p_precio,
    'vigente_desde', p_desde,
    'vigente_hasta', p_hasta,
    'activo', true,
    'reemplaza_a', NULL,
    'promocion_de', v_base.id
  ));

  RETURN v_nuevo;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cargar_promocion_de_lista(bigint, numeric, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cargar_promocion_de_lista(bigint, numeric, date, date) TO authenticated;

-- El precio que rige en una fecha, uno por tipo, modalidad y moneda: la promoción vigente ese día
-- si la hay, y si no el renglón de siempre. Corre con los permisos de quien llama, así que cada
-- uno ve sólo su Prestadora.
CREATE FUNCTION public.precios_de_lista_que_rigen(p_fecha date DEFAULT CURRENT_DATE)
  RETURNS SETOF public.lista_precios
  LANGUAGE sql STABLE SECURITY INVOKER
  SET search_path TO ''
AS $$
  SELECT DISTINCT ON (l.tipo_servicio, l.modalidad, l.moneda) l.*
    FROM public.lista_precios l
   WHERE l.prestadora_id = interno.prestadora_actual()
     AND l.activo
     AND l.vigente_desde <= p_fecha
     AND (l.vigente_hasta IS NULL OR l.vigente_hasta >= p_fecha)
   ORDER BY l.tipo_servicio, l.modalidad, l.moneda,
            (l.promocion_de IS NOT NULL) DESC,
            l.vigente_desde DESC,
            l.id DESC
$$;
REVOKE EXECUTE ON FUNCTION public.precios_de_lista_que_rigen(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.precios_de_lista_que_rigen(date) TO authenticated, trabajo_sin_persona;

-- Las prestaciones vigentes pactadas con el precio de una promoción que ya terminó y que siguen
-- corriendo después de ese fin. Se resuelve por fecha, como la lista: nada las marca.
CREATE FUNCTION public.prestaciones_con_promocion_vencida(p_fecha date DEFAULT CURRENT_DATE)
  RETURNS TABLE (prestacion_id bigint, promocion_id bigint, promocion_hasta date, precio_de_siempre_id bigint)
  LANGUAGE sql STABLE SECURITY INVOKER
  SET search_path TO ''
AS $$
  SELECT p.id, l.id, l.vigente_hasta, l.promocion_de
    FROM public.prestaciones p
    JOIN public.lista_precios l ON l.id = p.precio_lista_id
   WHERE p.prestadora_id = interno.prestadora_actual()
     AND l.promocion_de IS NOT NULL
     AND l.vigente_hasta < p_fecha
     AND p.estado = 'vigente'
     AND (p.vigente_hasta IS NULL OR p.vigente_hasta > l.vigente_hasta)
$$;
REVOKE EXECUTE ON FUNCTION public.prestaciones_con_promocion_vencida(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prestaciones_con_promocion_vencida(date) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. El descuento a un Cliente en su Servicio.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.descuentos_del_servicio (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id         uuid NOT NULL REFERENCES public.prestadoras(id),
  servicio_id           uuid NOT NULL,
  clase                 text NOT NULL,
  valor                 numeric(14, 2) NOT NULL,
  moneda                text,
  vigente_desde         date NOT NULL,
  cantidad_de_periodos  integer,
  vigente_hasta         date,
  motivo                text,
  cargado_por           uuid REFERENCES public.usuarios(id),
  cargado_en            timestamptz NOT NULL DEFAULT now(),
  terminado_por         uuid REFERENCES public.usuarios(id),
  terminado_en          timestamptz,

  CONSTRAINT descuentos_del_servicio_id_prestadora_unique UNIQUE (id, prestadora_id),
  CONSTRAINT descuentos_del_servicio_de_la_misma_prestadora
    FOREIGN KEY (servicio_id, prestadora_id) REFERENCES public.servicios(id, prestadora_id),
  CONSTRAINT descuentos_del_servicio_clase_conocida CHECK (clase IN ('porcentaje', 'monto')),
  CONSTRAINT descuentos_del_servicio_valor_positivo CHECK (valor > 0),
  CONSTRAINT descuentos_del_servicio_porcentaje_hasta_cien CHECK (clase <> 'porcentaje' OR valor <= 100),
  -- El monto lleva su moneda; el porcentaje no tiene ninguna.
  CONSTRAINT descuentos_del_servicio_moneda_del_monto
    CHECK ((clase = 'monto') = (moneda IS NOT NULL)),
  CONSTRAINT descuentos_del_servicio_moneda_escrita CHECK (moneda IS NULL OR moneda ~ '^[A-Z]{3}$'),
  -- Termina por una de dos: tantos períodos, o una fecha.
  CONSTRAINT descuentos_del_servicio_un_solo_fin
    CHECK (num_nonnulls(cantidad_de_periodos, vigente_hasta) = 1),
  CONSTRAINT descuentos_del_servicio_periodos_razonables
    CHECK (cantidad_de_periodos IS NULL OR cantidad_de_periodos BETWEEN 1 AND 999),
  CONSTRAINT descuentos_del_servicio_fechas_en_orden
    CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde),
  CONSTRAINT descuentos_del_servicio_motivo_escrito
    CHECK (motivo IS NULL OR (btrim(motivo) <> '' AND char_length(motivo) <= 500)),
  CONSTRAINT descuentos_del_servicio_terminacion_completa
    CHECK ((terminado_en IS NULL) = (terminado_por IS NULL))
);

CREATE INDEX descuentos_del_servicio_por_servicio ON public.descuentos_del_servicio (servicio_id);
CREATE INDEX descuentos_del_servicio_por_prestadora ON public.descuentos_del_servicio (prestadora_id);

COMMENT ON TABLE public.descuentos_del_servicio IS
  'Descuentos a un Cliente en su Servicio: porcentaje o monto con su moneda, desde una fecha, por N períodos de facturación o hasta una fecha. No se borran: se terminan. Los aplica descuentosDelPeriodo.js.';

-- Quién lo cargó, quién lo terminó y cuándo los escribe la base, no quien llama. Y un descuento
-- no se edita: lo único que cambia después del alta es que se termina, una sola vez.
CREATE FUNCTION interno.descuento_lo_escribe_la_base()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.cargado_por   := interno.usuario_de_la_sesion();
    NEW.cargado_en    := now();
    NEW.terminado_por := NULL;
    NEW.terminado_en  := NULL;
    RETURN NEW;
  END IF;

  IF OLD.terminado_en IS NOT NULL THEN
    RAISE EXCEPTION 'ya_terminado' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.terminado_en IS NULL THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;
  IF (NEW.prestadora_id, NEW.servicio_id, NEW.clase, NEW.valor, NEW.moneda, NEW.vigente_desde,
      NEW.cantidad_de_periodos, NEW.vigente_hasta, NEW.motivo, NEW.cargado_por, NEW.cargado_en)
     IS DISTINCT FROM
     (OLD.prestadora_id, OLD.servicio_id, OLD.clase, OLD.valor, OLD.moneda, OLD.vigente_desde,
      OLD.cantidad_de_periodos, OLD.vigente_hasta, OLD.motivo, OLD.cargado_por, OLD.cargado_en) THEN
    RAISE EXCEPTION 'no_se_edita' USING ERRCODE = 'P0001';
  END IF;

  NEW.terminado_en  := now();
  NEW.terminado_por := interno.usuario_de_la_sesion();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION interno.descuento_lo_escribe_la_base() FROM PUBLIC, anon;

CREATE TRIGGER descuento_lo_escribe_la_base
  BEFORE INSERT OR UPDATE ON public.descuentos_del_servicio
  FOR EACH ROW EXECUTE FUNCTION interno.descuento_lo_escribe_la_base();

-- La auditoría del alta y de la terminación. Definer: `authenticated` no escribe
-- `registro_actividad`. Sin persona en la sesión no anota nada, igual que
-- `interno.anotar_cambio_de_la_restriccion_de_hce`; el alta y la terminación vienen siempre del
-- Panel, con persona.
CREATE FUNCTION interno.anotar_descuento_del_servicio()
  RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  v_usuario uuid := interno.usuario_de_la_sesion();
BEGIN
  IF v_usuario IS NULL THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.registro_actividad
      (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, campos_cambiados)
    VALUES
      (NEW.prestadora_id, v_usuario, 'alta_de_descuento', TG_TABLE_NAME, NEW.id,
       ARRAY['clase', 'valor', 'moneda', 'vigente_desde', 'cantidad_de_periodos', 'vigente_hasta', 'motivo']);
  ELSIF OLD.terminado_en IS NULL AND NEW.terminado_en IS NOT NULL THEN
    INSERT INTO public.registro_actividad
      (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, campos_cambiados)
    VALUES
      (NEW.prestadora_id, v_usuario, 'terminacion_de_descuento', TG_TABLE_NAME, NEW.id,
       ARRAY['terminado_en']);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION interno.anotar_descuento_del_servicio() FROM PUBLIC, anon;

CREATE TRIGGER anotar_descuento_del_servicio
  AFTER INSERT OR UPDATE ON public.descuentos_del_servicio
  FOR EACH ROW EXECUTE FUNCTION interno.anotar_descuento_del_servicio();

-- Lo hecho con un permiso de acceso queda auditado, como en toda tabla con datos de un Cliente.
CREATE TRIGGER trg_auditoria_acceso
  AFTER INSERT OR UPDATE OR DELETE ON public.descuentos_del_servicio
  FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_de_acceso_mutacion();

INSERT INTO public.catalogo_acciones_registradas (accion, grupo, orden) VALUES
  ('alta_de_descuento',        'consecuencia_economica', 24),
  ('terminacion_de_descuento', 'consecuencia_economica', 25);

-- RLS y permisos. Sin DELETE para nadie: un descuento se termina.
ALTER TABLE public.descuentos_del_servicio ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.descuentos_del_servicio FROM PUBLIC, anon, authenticated, trabajo_sin_persona;
GRANT SELECT ON public.descuentos_del_servicio TO authenticated, trabajo_sin_persona;
GRANT INSERT (prestadora_id, servicio_id, clase, valor, moneda, vigente_desde,
              cantidad_de_periodos, vigente_hasta, motivo)
  ON public.descuentos_del_servicio TO authenticated;
-- La terminación escribe `terminado_en`; el disparador pone la hora y la persona.
GRANT UPDATE (terminado_en) ON public.descuentos_del_servicio TO authenticated;

CREATE POLICY los_descuentos_los_lee_quien_puede ON public.descuentos_del_servicio
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND (interno.tiene_permiso('editar_condiciones_comerciales_servicio')
              OR interno.tiene_permiso('registrar_consentimiento_pagador')));

CREATE POLICY los_descuentos_los_carga_quien_puede ON public.descuentos_del_servicio
  FOR INSERT TO authenticated
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND interno.tiene_permiso('editar_condiciones_comerciales_servicio'));

CREATE POLICY los_descuentos_los_termina_quien_puede ON public.descuentos_del_servicio
  FOR UPDATE TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.tiene_permiso('editar_condiciones_comerciales_servicio'))
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND interno.tiene_permiso('editar_condiciones_comerciales_servicio'));

CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.descuentos_del_servicio
  FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. El renglón de descuento en la factura.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.facturas_cliente_items
  ADD COLUMN descuento_id uuid,
  ADD CONSTRAINT facturas_cliente_items_descuento_de_la_misma_prestadora
    FOREIGN KEY (descuento_id, prestadora_id)
    REFERENCES public.descuentos_del_servicio(id, prestadora_id);

CREATE INDEX facturas_cliente_items_por_descuento
  ON public.facturas_cliente_items (descuento_id) WHERE descuento_id IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
