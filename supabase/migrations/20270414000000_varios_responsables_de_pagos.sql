-- Un Servicio puede tener varios Responsables de pagos a la vez.
--
-- Qué hace y por qué:
--
-- Hasta ahora cada Servicio tenía, cada día, un solo Responsable de pagos: una fila por cambio, y
-- cada una regía hasta el día antes de la siguiente. Ahora pueden ser varios a la vez. Cada uno es
-- una fila propia con el día desde el que rige y, cuando deja de serlo, el día hasta el que rigió.
-- La misma persona no puede estar dos veces en días que se superponen.
--
-- Cada uno firma su propio documento. Con la opción de la Prestadora encendida, para programar
-- guardias tienen que haber firmado todos los que rigen hoy, cada uno el suyo.
--
-- La factura sigue saliendo a nombre del Contratante. La indicación de que sale a nombre del
-- Responsable de pagos se enciende en uno solo por día, y la base lo hace cumplir. Un cambio que
-- mueve los días de esa indicación se rechaza si toca días de una factura ya emitida, con cobros o
-- con correcciones, y borra las facturas sin emitir que quedan con días a nombre de dos personas
-- para que el backend las vuelva a generar partidas. Un cambio que no toca la indicación no toca
-- ninguna factura.
--
-- Se escribe sólo con tres funciones: agregar un Responsable de pagos, darle el día hasta el que
-- rige, y encender o apagar la indicación. Cada una queda en el registro de actividad.
--
-- El aviso de la baja de un Servicio con deuda anota a todos los Responsables de pagos de ese día.
--
-- Qué se borra y qué se comprobó antes:
--
-- - Las filas sin persona, que querían decir «paga el Contratante». Ahora eso es no tener ningún
--   Responsable de pagos en esos días. Antes de escribir esta migración la base en la nube no tenía
--   ninguna.
-- - La función `cambiar_responsable_de_pagos`, la vista `tramos_de_pagador_del_servicio`, las
--   funciones `pagador_del_servicio_en` y `responsable_que_recibe_la_factura`, y el control
--   `cambio_de_pagador_sin_factura_emitida`. Los reemplazan las piezas de más abajo.
-- - La columna `responsable_de_pagos_persona_id` del aviso de la baja con deuda, que pasa a ser una
--   lista. Ninguna otra función de la base la usaba.
--
-- Cómo se vuelve atrás: con otra migración que recree las piezas tal como las deja
-- `20270413000000_la_factura_sale_a_nombre_del_contratante.sql`, y que pase cada fila a un tramo
-- por día conservando, en los días con varios, el que lleva la indicación.

BEGIN;

-- 1. Lo que se reemplaza.
DROP TRIGGER cambio_de_pagador_sin_factura_emitida ON public.pagadores_del_servicio;
DROP FUNCTION interno.cambio_de_pagador_sin_factura_emitida();
DROP FUNCTION public.cambiar_responsable_de_pagos(uuid, uuid, text, date, boolean);
DROP FUNCTION interno.pagador_del_servicio_en(uuid, date);
DROP VIEW public.tramos_de_pagador_del_servicio;
DROP FUNCTION interno.responsable_que_recibe_la_factura(uuid, boolean);

-- 2. El día hasta el que rige cada uno. Los tramos que había pasan a la forma nueva: cada uno rige
-- hasta el día antes del siguiente, y el primero, que regía desde siempre, rige desde el día en que
-- se cargó o, si es anterior, desde el alta del Servicio.
ALTER TABLE public.pagadores_del_servicio ADD COLUMN vigente_hasta date;

UPDATE public.pagadores_del_servicio p
   SET vigente_hasta = x.siguiente - 1
  FROM (SELECT q.id, lead(q.vigente_desde) OVER (PARTITION BY q.servicio_id ORDER BY q.vigente_desde) AS siguiente
          FROM public.pagadores_del_servicio q) x
 WHERE x.id = p.id AND x.siguiente IS NOT NULL;

DELETE FROM public.pagadores_del_servicio WHERE pagador_persona_id IS NULL;

UPDATE public.pagadores_del_servicio p
   SET vigente_desde = least(p.cargado_en::date, s.created_at::date, coalesce(p.vigente_hasta, 'infinity'::date))
  FROM public.servicios s
 WHERE s.id = p.servicio_id AND NOT isfinite(p.vigente_desde);

-- 3. Las reglas de la tabla.
ALTER TABLE public.pagadores_del_servicio
  DROP CONSTRAINT pagadores_del_servicio_un_cambio_por_dia,
  DROP CONSTRAINT pagadores_del_servicio_factura_al_responsable_con_persona,
  ALTER COLUMN pagador_persona_id SET NOT NULL,
  ADD CONSTRAINT pagadores_del_servicio_desde_un_dia CHECK (isfinite(vigente_desde)),
  ADD CONSTRAINT pagadores_del_servicio_hasta_despues_del_desde
    CHECK (vigente_hasta IS NULL OR (isfinite(vigente_hasta) AND vigente_hasta >= vigente_desde)),
  -- La misma persona no está dos veces en días que se superponen.
  ADD CONSTRAINT pagadores_del_servicio_persona_una_vez_por_dia
    EXCLUDE USING gist (servicio_id WITH =, pagador_persona_id WITH =,
                        daterange(vigente_desde, vigente_hasta, '[]') WITH &&),
  -- La indicación de la factura, en uno solo por día.
  ADD CONSTRAINT pagadores_del_servicio_una_factura_al_responsable_por_dia
    EXCLUDE USING gist (servicio_id WITH =, daterange(vigente_desde, vigente_hasta, '[]') WITH &&)
    WHERE (factura_al_responsable);

COMMENT ON TABLE public.pagadores_del_servicio IS
  'Cada Responsable de pagos de un Servicio, con el día desde el que rige y, cuando deja de serlo, el día hasta el que rigió. Puede haber varios a la vez. Se escribe sólo con agregar_responsable_de_pagos, terminar_responsable_de_pagos y marcar_factura_al_responsable.';

COMMENT ON COLUMN public.pagadores_del_servicio.vigente_hasta IS
  'El último día en que rige. Vacío: sigue rigiendo.';

COMMENT ON COLUMN public.pagadores_del_servicio.factura_al_responsable IS
  'Encendida, la factura de los días de este Responsable de pagos sale a su nombre. Apagada, a nombre del Contratante. Encendida en uno solo por día.';

-- 4. El control de las filas: quién y cuándo cargó cada una, y que una fila cargada no cambie de
-- Servicio, de persona, de tipo ni de día desde. Para eso se termina y se agrega otra.
CREATE FUNCTION interno.responsable_de_pagos_no_cambia_de_persona() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.cargado_por := interno.usuario_de_la_sesion();
    NEW.cargado_en := now();
    RETURN NEW;
  END IF;
  IF (NEW.prestadora_id, NEW.servicio_id, NEW.pagador_persona_id, NEW.pagador_tipo, NEW.vigente_desde)
     IS DISTINCT FROM (OLD.prestadora_id, OLD.servicio_id, OLD.pagador_persona_id, OLD.pagador_tipo, OLD.vigente_desde) THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;
  NEW.cargado_por := OLD.cargado_por;
  NEW.cargado_en := OLD.cargado_en;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION interno.responsable_de_pagos_no_cambia_de_persona() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER responsable_de_pagos_no_cambia_de_persona
  BEFORE INSERT OR UPDATE ON public.pagadores_del_servicio
  FOR EACH ROW EXECUTE FUNCTION interno.responsable_de_pagos_no_cambia_de_persona();

-- 5. Los Responsables de pagos de un Servicio en un día. Es la única cuenta de quién paga cada día.
CREATE FUNCTION interno.responsables_de_pagos_en(p_servicio uuid, p_fecha date) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO ''
AS $$
  SELECT p.pagador_persona_id
    FROM public.pagadores_del_servicio p
   WHERE p.servicio_id = p_servicio
     AND p.vigente_desde <= p_fecha
     AND (p.vigente_hasta IS NULL OR p.vigente_hasta >= p_fecha)
   ORDER BY p.vigente_desde, p.cargado_en;
$$;

-- La usan sólo las funciones de la base que ya se saltean la RLS.
REVOKE ALL ON FUNCTION interno.responsables_de_pagos_en(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION interno.responsables_de_pagos_en(uuid, date) TO service_role;

-- 6. A nombre de quién sale la factura cada día: los días del Responsable de pagos con la
-- indicación, a su nombre; los demás, con el responsable vacío, que quiere decir el Contratante.
-- Cubre todos los días; un Servicio sin ninguna indicación no tiene filas, y entonces todo sale a
-- nombre del Contratante.
CREATE VIEW public.tramos_de_la_factura_del_servicio WITH (security_invoker = true) AS
WITH marcados AS (
  SELECT p.prestadora_id, p.servicio_id, p.vigente_desde, p.vigente_hasta, p.pagador_persona_id,
         row_number() OVER w AS orden,
         lead(p.vigente_desde) OVER w AS desde_del_siguiente
    FROM public.pagadores_del_servicio p
   WHERE p.factura_al_responsable
  WINDOW w AS (PARTITION BY p.servicio_id ORDER BY p.vigente_desde)
)
SELECT m.prestadora_id, m.servicio_id,
       m.vigente_desde AS rige_desde, m.vigente_hasta AS rige_hasta,
       m.pagador_persona_id AS responsable_que_recibe_la_factura
  FROM marcados m
UNION ALL
-- Antes del primero, desde siempre.
SELECT m.prestadora_id, m.servicio_id, NULL::date, m.vigente_desde - 1, NULL::uuid
  FROM marcados m
 WHERE m.orden = 1
UNION ALL
-- Entre uno y el siguiente, y después del último.
SELECT m.prestadora_id, m.servicio_id, m.vigente_hasta + 1, m.desde_del_siguiente - 1, NULL::uuid
  FROM marcados m
 WHERE m.vigente_hasta IS NOT NULL
   AND (m.desde_del_siguiente IS NULL OR m.desde_del_siguiente > m.vigente_hasta + 1);

COMMENT ON VIEW public.tramos_de_la_factura_del_servicio IS
  'A nombre de quién sale la factura de un Servicio en cada tramo de días. responsable_que_recibe_la_factura vacío: el Contratante. rige_desde vacío: desde siempre. rige_hasta vacío: sin fin. Sin filas, todo sale a nombre del Contratante.';

REVOKE ALL ON public.tramos_de_la_factura_del_servicio FROM PUBLIC, anon, authenticated, trabajo_sin_persona;
GRANT SELECT ON public.tramos_de_la_factura_del_servicio TO authenticated, trabajo_sin_persona;

-- 7. Lo que pasa con las facturas cuando los días de la indicación se mueven. Recibe los días que
-- la indicación cubría antes y los que cubre después; los días que cambian de nombre son los que
-- están en uno solo de los dos. Rechaza el cambio si toca una factura emitida, con comprobante,
-- con cobros o con correcciones, y borra las facturas sin emitir que quedan con días a nombre de
-- dos personas, que el backend vuelve a generar partidas. Devuelve los períodos de las borradas.
CREATE FUNCTION interno.preparar_cambio_de_la_factura(
  p_prestadora uuid, p_servicio uuid, p_antes daterange, p_despues daterange
)
  RETURNS TABLE(periodo date, periodo_hasta date)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  v_cambian datemultirange :=
    (datemultirange(p_antes) - datemultirange(p_despues)) + (datemultirange(p_despues) - datemultirange(p_antes));
BEGIN
  IF isempty(v_cambian) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.facturas_cliente f
     WHERE f.servicio_id = p_servicio
       AND f.prestadora_id = p_prestadora
       AND v_cambian && daterange(f.periodo, f.periodo_hasta, '[]')
       AND (f.facturado_at IS NOT NULL OR f.monto_facturado IS NOT NULL OR f.comprobante_subido_at IS NOT NULL
            OR EXISTS (SELECT 1 FROM public.cobros_cliente c WHERE c.factura_id = f.id)
            OR EXISTS (SELECT 1 FROM public.correcciones_factura_cliente r WHERE r.factura_id = f.id))
  ) THEN
    RAISE EXCEPTION 'cambio_de_pagador_con_factura_emitida' USING ERRCODE = 'P0001';
  END IF;

  -- Una factura cuyos días cambian todos de nombre sigue entera: a nombre de quién sale se lee de
  -- los tramos. Sólo se borra la que queda con días de los dos lados.
  RETURN QUERY
  DELETE FROM public.facturas_cliente f
   WHERE f.servicio_id = p_servicio
     AND f.prestadora_id = p_prestadora
     AND v_cambian && daterange(f.periodo, f.periodo_hasta, '[]')
     AND NOT v_cambian @> daterange(f.periodo, f.periodo_hasta, '[]')
  RETURNING f.periodo, f.periodo_hasta;
END;
$$;

REVOKE ALL ON FUNCTION interno.preparar_cambio_de_la_factura(uuid, uuid, daterange, daterange) FROM PUBLIC, anon, authenticated;

-- 8. El motivo que entiende el Panel para cada regla de la tabla. Es el punto único: lo usan las
-- tres funciones de escritura.
CREATE FUNCTION interno.motivo_del_responsable_de_pagos(p_restriccion text) RETURNS text
  LANGUAGE sql IMMUTABLE
  SET search_path TO ''
AS $$
  SELECT CASE p_restriccion
    WHEN 'pagadores_del_servicio_persona_una_vez_por_dia' THEN 'responsable_de_pagos_repetido'
    WHEN 'pagadores_del_servicio_una_factura_al_responsable_por_dia' THEN 'responsable_de_pagos_con_otra_marca'
    WHEN 'pagadores_del_servicio_hasta_despues_del_desde' THEN 'responsable_de_pagos_hasta_antes_del_desde'
    ELSE 'dato_invalido'
  END;
$$;

REVOKE ALL ON FUNCTION interno.motivo_del_responsable_de_pagos(text) FROM PUBLIC, anon, authenticated;

-- 9. Las tres escrituras, que quedan en el registro de actividad.
INSERT INTO public.catalogo_acciones_registradas (accion, grupo, orden, la_hace_el_sistema)
SELECT v.accion, 'consecuencia_economica', (SELECT max(orden) FROM public.catalogo_acciones_registradas) + v.n, false
  FROM (VALUES ('alta_de_responsable_de_pagos', 1), ('fin_de_responsable_de_pagos', 2),
               ('cambio_de_factura_al_responsable', 3)) AS v(accion, n);

CREATE FUNCTION public.agregar_responsable_de_pagos(
  p_servicio uuid,
  p_persona uuid,
  p_tipo text,
  p_desde date,
  p_factura_al_responsable boolean DEFAULT false
)
  RETURNS TABLE(periodo date, periodo_hasta date)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  v_prest uuid := interno.prestadora_actual();
  v_quien uuid := interno.usuario_de_la_sesion();
  v_indicacion boolean := coalesce(p_factura_al_responsable, false);
  v_id uuid;
  v_restriccion text;
BEGIN
  IF v_prest IS NULL OR v_quien IS NULL OR NOT interno.es_personal_de_la_prestadora()
     OR NOT interno.tiene_permiso('editar_condiciones_comerciales_servicio') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_servicio IS NULL OR p_persona IS NULL OR p_desde IS NULL OR NOT isfinite(p_desde)
     OR (p_tipo IS NOT NULL AND p_tipo NOT IN ('cliente', 'obra_social', 'otro')) THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;

  -- Un cambio por vez en cada Servicio.
  PERFORM 1 FROM public.servicios s WHERE s.id = p_servicio AND s.prestadora_id = v_prest FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.personas pe WHERE pe.id = p_persona AND pe.prestadora_id = v_prest) THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    INSERT INTO public.pagadores_del_servicio
      (prestadora_id, servicio_id, pagador_persona_id, pagador_tipo, factura_al_responsable, vigente_desde)
    VALUES (v_prest, p_servicio, p_persona, p_tipo, v_indicacion, p_desde)
    RETURNING id INTO v_id;
  EXCEPTION WHEN exclusion_violation OR check_violation THEN
    GET STACKED DIAGNOSTICS v_restriccion = CONSTRAINT_NAME;
    RAISE EXCEPTION '%', interno.motivo_del_responsable_de_pagos(v_restriccion) USING ERRCODE = 'P0001';
  END;

  INSERT INTO public.registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, detalle)
  VALUES (v_prest, v_quien, 'alta_de_responsable_de_pagos', 'pagadores_del_servicio', v_id,
          jsonb_build_object('servicio_id', p_servicio, 'responsable_nuevo', p_persona, 'desde', p_desde,
                             'factura_al_responsable_nuevo', v_indicacion));

  IF v_indicacion THEN
    RETURN QUERY SELECT * FROM interno.preparar_cambio_de_la_factura(
      v_prest, p_servicio, 'empty'::daterange, daterange(p_desde, NULL, '[]'));
  END IF;
END;
$$;

CREATE FUNCTION public.terminar_responsable_de_pagos(p_responsable uuid, p_hasta date)
  RETURNS TABLE(periodo date, periodo_hasta date)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  v_prest uuid := interno.prestadora_actual();
  v_quien uuid := interno.usuario_de_la_sesion();
  v_fila public.pagadores_del_servicio%ROWTYPE;
  v_restriccion text;
BEGIN
  IF v_prest IS NULL OR v_quien IS NULL OR NOT interno.es_personal_de_la_prestadora()
     OR NOT interno.tiene_permiso('editar_condiciones_comerciales_servicio') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_responsable IS NULL OR (p_hasta IS NOT NULL AND NOT isfinite(p_hasta)) THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_fila FROM public.pagadores_del_servicio p
   WHERE p.id = p_responsable AND p.prestadora_id = v_prest;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_encontrado' USING ERRCODE = 'P0002';
  END IF;
  PERFORM 1 FROM public.servicios s WHERE s.id = v_fila.servicio_id AND s.prestadora_id = v_prest FOR UPDATE;
  -- Con el Servicio bloqueado, la fila no la cambia nadie más.
  SELECT * INTO v_fila FROM public.pagadores_del_servicio p WHERE p.id = p_responsable;
  IF v_fila.vigente_hasta IS NOT DISTINCT FROM p_hasta THEN
    RETURN;
  END IF;

  BEGIN
    UPDATE public.pagadores_del_servicio p SET vigente_hasta = p_hasta WHERE p.id = p_responsable;
  EXCEPTION WHEN exclusion_violation OR check_violation THEN
    GET STACKED DIAGNOSTICS v_restriccion = CONSTRAINT_NAME;
    RAISE EXCEPTION '%', interno.motivo_del_responsable_de_pagos(v_restriccion) USING ERRCODE = 'P0001';
  END;

  INSERT INTO public.registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, detalle)
  VALUES (v_prest, v_quien, 'fin_de_responsable_de_pagos', 'pagadores_del_servicio', p_responsable,
          jsonb_build_object('servicio_id', v_fila.servicio_id, 'responsable_nuevo', v_fila.pagador_persona_id,
                             'desde', v_fila.vigente_desde, 'hasta', p_hasta));

  IF v_fila.factura_al_responsable THEN
    RETURN QUERY SELECT * FROM interno.preparar_cambio_de_la_factura(
      v_prest, v_fila.servicio_id,
      daterange(v_fila.vigente_desde, v_fila.vigente_hasta, '[]'),
      daterange(v_fila.vigente_desde, p_hasta, '[]'));
  END IF;
END;
$$;

CREATE FUNCTION public.marcar_factura_al_responsable(p_responsable uuid, p_encendida boolean)
  RETURNS TABLE(periodo date, periodo_hasta date)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  v_prest uuid := interno.prestadora_actual();
  v_quien uuid := interno.usuario_de_la_sesion();
  v_fila public.pagadores_del_servicio%ROWTYPE;
  v_dias daterange;
  v_restriccion text;
BEGIN
  IF v_prest IS NULL OR v_quien IS NULL OR NOT interno.es_personal_de_la_prestadora()
     OR NOT interno.tiene_permiso('editar_condiciones_comerciales_servicio') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_responsable IS NULL OR p_encendida IS NULL THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_fila FROM public.pagadores_del_servicio p
   WHERE p.id = p_responsable AND p.prestadora_id = v_prest;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_encontrado' USING ERRCODE = 'P0002';
  END IF;
  PERFORM 1 FROM public.servicios s WHERE s.id = v_fila.servicio_id AND s.prestadora_id = v_prest FOR UPDATE;
  SELECT * INTO v_fila FROM public.pagadores_del_servicio p WHERE p.id = p_responsable;
  IF v_fila.factura_al_responsable = p_encendida THEN
    RETURN;
  END IF;

  BEGIN
    UPDATE public.pagadores_del_servicio p SET factura_al_responsable = p_encendida WHERE p.id = p_responsable;
  EXCEPTION WHEN exclusion_violation OR check_violation THEN
    GET STACKED DIAGNOSTICS v_restriccion = CONSTRAINT_NAME;
    RAISE EXCEPTION '%', interno.motivo_del_responsable_de_pagos(v_restriccion) USING ERRCODE = 'P0001';
  END;

  INSERT INTO public.registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, detalle)
  VALUES (v_prest, v_quien, 'cambio_de_factura_al_responsable', 'pagadores_del_servicio', p_responsable,
          jsonb_build_object('servicio_id', v_fila.servicio_id, 'responsable_nuevo', v_fila.pagador_persona_id,
                             'factura_al_responsable_anterior', v_fila.factura_al_responsable,
                             'factura_al_responsable_nuevo', p_encendida));

  v_dias := daterange(v_fila.vigente_desde, v_fila.vigente_hasta, '[]');
  RETURN QUERY SELECT * FROM interno.preparar_cambio_de_la_factura(
    v_prest, v_fila.servicio_id,
    CASE WHEN p_encendida THEN 'empty'::daterange ELSE v_dias END,
    CASE WHEN p_encendida THEN v_dias ELSE 'empty'::daterange END);
END;
$$;

REVOKE ALL ON FUNCTION public.agregar_responsable_de_pagos(uuid, uuid, text, date, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.terminar_responsable_de_pagos(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.marcar_factura_al_responsable(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agregar_responsable_de_pagos(uuid, uuid, text, date, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.terminar_responsable_de_pagos(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.marcar_factura_al_responsable(uuid, boolean) TO authenticated, service_role;

-- 10. La firma: con la opción encendida, tienen que haber firmado todos los que rigen hoy, cada uno
-- su propio documento. Sin ninguno que rija hoy no hay firma, como hasta ahora.
CREATE OR REPLACE FUNCTION interno.firma_del_pagador_vigente(p_servicio uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'interno'
AS $$
  SELECT EXISTS (SELECT 1 FROM interno.responsables_de_pagos_en(p_servicio, current_date))
     AND NOT EXISTS (
       SELECT 1
         FROM interno.responsables_de_pagos_en(p_servicio, current_date) AS r(persona)
        WHERE NOT EXISTS (
          SELECT 1
            FROM servicios s
            JOIN consentimientos_pagador k
              ON k.servicio_id = s.id
             AND k.prestadora_id = s.prestadora_id
           WHERE s.id = p_servicio
             AND k.estado = 'cerrado'
             AND k.pagador_persona_id = r.persona));
$$;

-- 11. Un documento pendiente de firmar por Servicio y por persona.
DROP INDEX public.consentimientos_pagador_uno_pendiente_por_servicio;
CREATE UNIQUE INDEX consentimientos_pagador_uno_pendiente_por_persona
  ON public.consentimientos_pagador (servicio_id, pagador_persona_id) WHERE (estado = 'pendiente_firma');

-- 12. El aviso de la baja con deuda anota a todos los Responsables de pagos de ese día.
ALTER TABLE public.avisos_baja_servicio_con_deuda
  ADD COLUMN responsables_de_pagos_persona_ids uuid[] NOT NULL DEFAULT '{}';
UPDATE public.avisos_baja_servicio_con_deuda
   SET responsables_de_pagos_persona_ids = ARRAY[responsable_de_pagos_persona_id]
 WHERE responsable_de_pagos_persona_id IS NOT NULL;
ALTER TABLE public.avisos_baja_servicio_con_deuda DROP COLUMN responsable_de_pagos_persona_id;

COMMENT ON COLUMN public.avisos_baja_servicio_con_deuda.responsables_de_pagos_persona_ids IS
  'Los Responsables de pagos del Servicio el día de la baja. Vacía: no tenía ninguno.';

CREATE OR REPLACE FUNCTION interno.anotar_deuda_de_la_baja(p_baja uuid) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'interno'
AS $$
DECLARE
  v_baja bajas_de_servicio%ROWTYPE;
  v_servicio servicios%ROWTYPE;
  v_responsables uuid[];
  v_contratante uuid;
  v_la_lleva_otro boolean;
  v_anotados integer;
BEGIN
  SELECT * INTO v_baja FROM bajas_de_servicio
   WHERE id = p_baja AND prestadora_id = interno.prestadora_actual();
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF EXISTS (SELECT 1 FROM configuracion_notificaciones
              WHERE prestadora_id = v_baja.prestadora_id
                AND evento = 'baja_servicio_con_deuda'
                AND activo = false) THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_servicio FROM servicios WHERE id = v_baja.servicio_id;

  SELECT coalesce(
           (SELECT cc.contratante_persona_id
              FROM condiciones_comerciales_servicio cc
             WHERE cc.servicio_id = v_servicio.id AND cc.prestadora_id = v_baja.prestadora_id),
           (SELECT c.contratante_persona_id
              FROM clientes c
             WHERE c.id = v_servicio.cliente_id AND c.prestadora_id = v_baja.prestadora_id))
    INTO v_contratante;

  v_responsables := ARRAY(SELECT interno.responsables_de_pagos_en(v_servicio.id, current_date));

  SELECT coalesce((regla ->> 'sigue_la_cobranza')::boolean, true) = false INTO v_la_lleva_otro
    FROM configuracion_facturacion_clientes
   WHERE prestadora_id = v_baja.prestadora_id;

  INSERT INTO avisos_baja_servicio_con_deuda
    (prestadora_id, servicio_id, baja_id, cliente_id, responsables_de_pagos_persona_ids,
     contratante_persona_id, importe, moneda, dias_de_atraso)
  SELECT v_baja.prestadora_id, v_servicio.id, v_baja.id, v_servicio.cliente_id,
         v_responsables, v_contratante,
         d.importe, d.moneda, d.dias_de_atraso
    FROM (
      SELECT e.saldo AS importe, e.moneda, e.dias_de_atraso
        FROM estado_de_cuenta_externo_vigente e
       WHERE coalesce(v_la_lleva_otro, false)
         AND e.prestadora_id = v_baja.prestadora_id
         AND e.cliente_id = v_servicio.cliente_id
      UNION ALL
      SELECT sum(s.saldo), s.moneda,
             coalesce(current_date - min(s.fecha_vencimiento) FILTER (WHERE s.fecha_vencimiento < current_date), 0)
        FROM saldos_cliente s
       WHERE NOT coalesce(v_la_lleva_otro, false)
         AND s.prestadora_id = v_baja.prestadora_id
         AND s.cliente_id = v_servicio.cliente_id
         AND s.saldo > 0
       GROUP BY s.moneda
    ) d
   WHERE d.importe > 0
  ON CONFLICT (baja_id, moneda) DO NOTHING;

  GET DIAGNOSTICS v_anotados = ROW_COUNT;
  RETURN v_anotados;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
