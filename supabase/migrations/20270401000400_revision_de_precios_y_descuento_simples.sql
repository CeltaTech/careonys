-- La revisión de precios y el descuento del Servicio, más simples.
--
-- QUÉ HACE
--
--   1. LA REVISIÓN DE UN PRECIO AJUSTADO POR ÍNDICE ES UNA SOLA ACCIÓN: GUARDAR EL PRECIO.
--      `public.revisar_propuesta_de_ajuste(p_propuesta, p_precio)` reemplaza a
--      `aceptar_propuesta_de_ajuste` y `rechazar_propuesta_de_ajuste`. Quien revisa deja el precio
--      propuesto, lo corrige o vuelve a escribir el actual, y guarda:
--        · un precio distinto del actual rige desde el mes que correspondía (`aceptada`), y el
--          registro de actividad guarda el propuesto y el que quedó;
--        · el mismo precio actual deja todo como estaba (`rechazada`).
--      Las comprobaciones son las de las dos funciones que reemplaza.
--
--   2. EL DESCUENTO DEL SERVICIO PUEDE NO TENER FIN, Y SE FIJA CON UN SOLO NÚMERO.
--      `descuentos_del_servicio_un_solo_fin` pasa de «exactamente un fin» a «a lo sumo uno».
--      `public.fijar_descuento_del_servicio(p_servicio, p_porcentaje)` termina hoy los descuentos
--      abiertos de ese Servicio y, si el porcentaje es mayor que cero, carga uno nuevo desde hoy y
--      sin fin. Corre con los permisos de quien llama: la RLS de la tabla decide.
--
--   3. EL TIEMPO ENTRE ACTUALIZACIONES ES MENSUAL, TRIMESTRAL O SEMESTRAL: 1, 3 O 6 MESES.
--      La restricción de `condiciones_comerciales_servicio.meses_entre_actualizaciones` y
--      `interno.condiciones_del_ajuste_por_indice` pasan de «entre 1 y 24» a «1, 3 o 6». Lo que
--      estaba cargado con otro número vuelve a «rige el de arriba»: null en el Servicio, sin la clave
--      en la regla de la Prestadora. Es la misma lista de `condicionesDelCliente.js`.
--
-- QUÉ SE COMPROBÓ EN EL CÓDIGO
--   · Las dos funciones de revisión sólo las llama `panel/src/pages/AjustesPorIndice.jsx`.
--   · `descuentosDelPeriodo.js`: un descuento terminado no alcanza al período que contiene el día
--     de la terminación, y uno que empieza ese día sí: el cambio de porcentaje no se superpone.
--
-- CÓMO SE VUELVE ATRÁS (otra migración adelante)
--   DROP FUNCTION public.fijar_descuento_del_servicio(uuid, numeric);
--   La restricción vuelve a `= 1` sólo si no hay descuentos sin fin.
--   DROP FUNCTION public.revisar_propuesta_de_ajuste(uuid, numeric); y volver a crear las dos
--   funciones de 20270401000100, punto 6.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. La revisión de precios.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
DROP FUNCTION public.aceptar_propuesta_de_ajuste(uuid);
DROP FUNCTION public.rechazar_propuesta_de_ajuste(uuid);

CREATE FUNCTION public.revisar_propuesta_de_ajuste(p_propuesta uuid, p_precio numeric)
RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO ''
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
REVOKE EXECUTE ON FUNCTION public.revisar_propuesta_de_ajuste(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revisar_propuesta_de_ajuste(uuid, numeric) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. El descuento del Servicio.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.descuentos_del_servicio
  DROP CONSTRAINT descuentos_del_servicio_un_solo_fin,
  ADD CONSTRAINT descuentos_del_servicio_un_solo_fin
    CHECK (num_nonnulls(cantidad_de_periodos, vigente_hasta) <= 1);

COMMENT ON TABLE public.descuentos_del_servicio IS
  'Descuentos a un Cliente en su Servicio: porcentaje o monto con su moneda, desde una fecha, por N períodos de facturación, hasta una fecha o sin fin. No se borran: se terminan. Los aplica descuentosDelPeriodo.js.';

-- Corre con los permisos de quien llama: la RLS de `descuentos_del_servicio` decide si puede
-- terminar y cargar. Ni definer ni alcance anónimo.
CREATE FUNCTION public.fijar_descuento_del_servicio(p_servicio uuid, p_porcentaje numeric)
RETURNS void
  LANGUAGE plpgsql SECURITY INVOKER
  SET search_path TO ''
AS $$
DECLARE
  v_prest uuid := interno.prestadora_actual();
BEGIN
  IF v_prest IS NULL THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_servicio IS NULL OR p_porcentaje IS NULL OR p_porcentaje < 0 OR p_porcentaje > 100 THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;

  -- El mismo porcentaje que ya rige, abierto y sin fin: no hay nada que cambiar.
  IF p_porcentaje > 0 AND EXISTS (
    SELECT 1 FROM public.descuentos_del_servicio d
     WHERE d.servicio_id = p_servicio AND d.prestadora_id = v_prest AND d.terminado_en IS NULL
       AND d.clase = 'porcentaje' AND d.valor = p_porcentaje
       AND d.cantidad_de_periodos IS NULL AND d.vigente_hasta IS NULL
  ) AND (
    SELECT count(*) FROM public.descuentos_del_servicio d
     WHERE d.servicio_id = p_servicio AND d.prestadora_id = v_prest AND d.terminado_en IS NULL
  ) = 1 THEN
    RETURN;
  END IF;

  UPDATE public.descuentos_del_servicio
     SET terminado_en = now()
   WHERE servicio_id = p_servicio AND prestadora_id = v_prest AND terminado_en IS NULL;

  IF p_porcentaje > 0 THEN
    INSERT INTO public.descuentos_del_servicio (prestadora_id, servicio_id, clase, valor, vigente_desde)
    VALUES (v_prest, p_servicio, 'porcentaje', p_porcentaje, current_date);
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fijar_descuento_del_servicio(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fijar_descuento_del_servicio(uuid, numeric) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. El tiempo entre actualizaciones.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
UPDATE public.condiciones_comerciales_servicio
   SET meses_entre_actualizaciones = NULL
 WHERE meses_entre_actualizaciones NOT IN (1, 3, 6);

UPDATE public.configuracion_facturacion_clientes
   SET regla = regla - 'meses_entre_actualizaciones'
 WHERE regla ? 'meses_entre_actualizaciones'
   AND NOT (jsonb_typeof(regla -> 'meses_entre_actualizaciones') = 'number'
            AND (regla ->> 'meses_entre_actualizaciones') IN ('1', '3', '6'));

ALTER TABLE public.condiciones_comerciales_servicio
  DROP CONSTRAINT condiciones_comerciales_servi_meses_entre_actualizaciones_check,
  ADD CONSTRAINT condiciones_comerciales_servi_meses_entre_actualizaciones_check
    CHECK (meses_entre_actualizaciones IN (1, 3, 6));

CREATE OR REPLACE FUNCTION interno.condiciones_del_ajuste_por_indice(p_regla jsonb, p_indice_del_servicio text, p_meses_del_servicio integer, p_ajuste_del_servicio text)
RETURNS TABLE(indice text, meses integer, ajuste text)
  LANGUAGE sql IMMUTABLE
  SET search_path TO ''
AS $$
  SELECT
    NULLIF(coalesce(
      NULLIF(btrim(coalesce(p_indice_del_servicio, '')), ''),
      CASE WHEN jsonb_typeof(p_regla -> 'indice_de_actualizacion') = 'string'
           THEN NULLIF(btrim(p_regla ->> 'indice_de_actualizacion'), '') END
    ), 'ninguno'),
    coalesce(
      CASE WHEN p_meses_del_servicio IN (1, 3, 6) THEN p_meses_del_servicio END,
      CASE WHEN jsonb_typeof(p_regla -> 'meses_entre_actualizaciones') = 'number'
            AND (p_regla ->> 'meses_entre_actualizaciones') IN ('1', '3', '6')
           THEN (p_regla ->> 'meses_entre_actualizaciones')::integer END,
      1),
    coalesce(
      CASE WHEN p_ajuste_del_servicio IN ('automatico', 'revision_previa') THEN p_ajuste_del_servicio END,
      CASE WHEN jsonb_typeof(p_regla -> 'ajuste_por_indice') = 'string'
            AND p_regla ->> 'ajuste_por_indice' IN ('automatico', 'revision_previa')
           THEN p_regla ->> 'ajuste_por_indice' END,
      'revision_previa');
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
