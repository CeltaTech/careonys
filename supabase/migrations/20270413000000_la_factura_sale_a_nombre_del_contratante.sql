-- La factura sale siempre a nombre del Contratante.
--
-- Qué hace y por qué:
--
-- El Cliente es una unidad: el Contratante, el Paciente y el Responsable de pagos. Quien asume la
-- responsabilidad legal y comercial de contratar a la Prestadora es el Contratante, así que la
-- factura sale a su nombre: el del Servicio o, si el Servicio no tiene uno anotado, el del Cliente.
--
-- La única excepción la pone la Prestadora, para un Servicio puntual y desde un día puntual: cada
-- tramo de Responsable de pagos lleva una indicación propia, apagada salvo que ella la encienda,
-- de que esos días la factura sale a nombre del Responsable de pagos. Sin un Responsable de pagos
-- anotado, la indicación no se puede encender.
--
-- A nombre de quién sale la factura de un tramo lo contesta una sola función. La usan la vista
-- de los tramos, que leen el backend y el Panel; el control que rechaza un cambio sobre días ya
-- facturados; y el cambio de Responsable de pagos, que parte las facturas sin emitir.
--
-- Un cambio de Responsable de pagos que no cambia a nombre de quién sale la factura ya no parte
-- ninguna factura ni se rechaza por una factura emitida, con cobros o con correcciones: la factura
-- sigue siendo del mismo. Sólo cuando de un lado o del otro del cambio hay indicación encendida
-- cambia la persona de la factura, y ahí rigen el corte y el rechazo de siempre.
--
-- La baja de un Servicio con deuda anota también al Contratante del Cliente cuando el Servicio no
-- tiene uno propio.

BEGIN;

-- La indicación, tramo por tramo.
ALTER TABLE public.pagadores_del_servicio
  ADD COLUMN factura_al_responsable boolean NOT NULL DEFAULT false;

ALTER TABLE public.pagadores_del_servicio
  ADD CONSTRAINT pagadores_del_servicio_factura_al_responsable_con_persona
  CHECK (NOT factura_al_responsable OR pagador_persona_id IS NOT NULL);

COMMENT ON COLUMN public.pagadores_del_servicio.factura_al_responsable IS
  'Encendida, la factura de los días de este tramo sale a nombre del Responsable de pagos. Apagada, a nombre del Contratante.';

-- El registro de actividad del cambio anota también la indicación de antes y la de después.
INSERT INTO public.catalogo_datos_del_registro (clave, orden)
SELECT v.clave, (SELECT COALESCE(max(orden), 0) FROM public.catalogo_datos_del_registro) + v.n
  FROM (VALUES ('factura_al_responsable_anterior', 1), ('factura_al_responsable_nuevo', 2)) AS v(clave, n);

-- El punto único: la persona del Responsable de pagos si el tramo lleva la indicación, o vacío,
-- que quiere decir el Contratante.
CREATE FUNCTION interno.responsable_que_recibe_la_factura(p_persona uuid, p_factura_al_responsable boolean)
  RETURNS uuid
  LANGUAGE sql IMMUTABLE
  SET search_path TO ''
AS $$
  SELECT CASE WHEN coalesce(p_factura_al_responsable, false) THEN p_persona END;
$$;

REVOKE ALL ON FUNCTION interno.responsable_que_recibe_la_factura(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.responsable_que_recibe_la_factura(uuid, boolean)
  TO authenticated, trabajo_sin_persona, service_role;

-- La vista suma la indicación y a nombre de quién sale la factura, al final de sus columnas.
CREATE OR REPLACE VIEW public.tramos_de_pagador_del_servicio WITH (security_invoker = true) AS
SELECT p.id,
       p.prestadora_id,
       p.servicio_id,
       p.pagador_persona_id,
       p.pagador_tipo,
       p.vigente_desde,
       CASE WHEN lag(p.vigente_desde) OVER w IS NULL THEN NULL::date ELSE p.vigente_desde END AS rige_desde,
       lead(p.vigente_desde) OVER w - 1 AS rige_hasta,
       (lag(p.vigente_desde) OVER w IS NULL OR p.vigente_desde <= CURRENT_DATE)
         AND (lead(p.vigente_desde) OVER w IS NULL OR lead(p.vigente_desde) OVER w > CURRENT_DATE) AS rige_hoy,
       p.factura_al_responsable,
       interno.responsable_que_recibe_la_factura(p.pagador_persona_id, p.factura_al_responsable)
         AS responsable_que_recibe_la_factura
  FROM public.pagadores_del_servicio p
WINDOW w AS (PARTITION BY p.servicio_id ORDER BY p.vigente_desde);

REVOKE ALL ON public.tramos_de_pagador_del_servicio FROM PUBLIC, anon, authenticated, trabajo_sin_persona;
GRANT SELECT ON public.tramos_de_pagador_del_servicio TO authenticated, trabajo_sin_persona;

-- El control de la base: un cambio sobre días ya facturados se rechaza sólo si cambia a nombre de
-- quién sale la factura.
CREATE OR REPLACE FUNCTION interno.cambio_de_pagador_sin_factura_emitida() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  v_antes uuid;
  v_es_el_primero boolean;
  v_siguiente date;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.cargado_por := interno.usuario_de_la_sesion();
    NEW.cargado_en := now();
  ELSIF (NEW.prestadora_id, NEW.servicio_id, NEW.vigente_desde)
        IS DISTINCT FROM (OLD.prestadora_id, OLD.servicio_id, OLD.vigente_desde) THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;

  -- A nombre de quién salía la factura de esos días antes de este cambio.
  IF TG_OP = 'UPDATE' THEN
    v_antes := interno.responsable_que_recibe_la_factura(OLD.pagador_persona_id, OLD.factura_al_responsable);
  ELSE
    SELECT interno.responsable_que_recibe_la_factura(p.pagador_persona_id, p.factura_al_responsable) INTO v_antes
      FROM public.pagadores_del_servicio p
     WHERE p.servicio_id = NEW.servicio_id
     ORDER BY (p.vigente_desde <= NEW.vigente_desde) DESC,
              CASE WHEN p.vigente_desde <= NEW.vigente_desde THEN p.vigente_desde END DESC,
              p.vigente_desde ASC
     LIMIT 1;
  END IF;

  -- Si la factura de esos días sigue a nombre del mismo, ninguna factura cambia.
  IF v_antes IS NOT DISTINCT FROM
     interno.responsable_que_recibe_la_factura(NEW.pagador_persona_id, NEW.factura_al_responsable) THEN
    RETURN NEW;
  END IF;

  SELECT NOT EXISTS (SELECT 1 FROM public.pagadores_del_servicio p
                      WHERE p.servicio_id = NEW.servicio_id AND p.vigente_desde < NEW.vigente_desde)
    INTO v_es_el_primero;
  SELECT min(p.vigente_desde) INTO v_siguiente
    FROM public.pagadores_del_servicio p
   WHERE p.servicio_id = NEW.servicio_id AND p.vigente_desde > NEW.vigente_desde;

  IF EXISTS (
    SELECT 1
      FROM public.facturas_cliente f
     WHERE f.servicio_id = NEW.servicio_id
       AND f.prestadora_id = NEW.prestadora_id
       AND (v_es_el_primero OR f.periodo_hasta >= NEW.vigente_desde)
       AND (v_siguiente IS NULL OR f.periodo < v_siguiente)
       AND (f.facturado_at IS NOT NULL OR f.monto_facturado IS NOT NULL OR f.comprobante_subido_at IS NOT NULL
            OR EXISTS (SELECT 1 FROM public.cobros_cliente c WHERE c.factura_id = f.id)
            OR EXISTS (SELECT 1 FROM public.correcciones_factura_cliente r WHERE r.factura_id = f.id))
  ) THEN
    RAISE EXCEPTION 'cambio_de_pagador_con_factura_emitida' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION interno.cambio_de_pagador_sin_factura_emitida() FROM PUBLIC, anon, authenticated;

-- El cambio de Responsable de pagos lleva la indicación. La firma cambia, así que la anterior se
-- borra y se crea la nueva con sus permisos.
DROP FUNCTION public.cambiar_responsable_de_pagos(uuid, uuid, text, date);

CREATE FUNCTION public.cambiar_responsable_de_pagos(
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
  v_antes record;
  v_habia_antes boolean;
  v_id uuid;
  v_siguiente date;
  v_recibe_antes uuid;
  v_recibe_ahora uuid;
  v_recibe_despues uuid;
BEGIN
  IF v_prest IS NULL OR v_quien IS NULL OR NOT interno.es_personal_de_la_prestadora()
     OR NOT interno.tiene_permiso('editar_condiciones_comerciales_servicio') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_servicio IS NULL OR p_desde IS NULL OR NOT isfinite(p_desde)
     OR (p_tipo IS NOT NULL AND p_tipo NOT IN ('cliente', 'obra_social', 'otro'))
     OR (v_indicacion AND p_persona IS NULL) THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;

  -- Un cambio por vez en cada Servicio.
  PERFORM 1 FROM public.servicios s WHERE s.id = p_servicio AND s.prestadora_id = v_prest FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF p_persona IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.personas pe WHERE pe.id = p_persona AND pe.prestadora_id = v_prest
  ) THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;

  -- Quién paga ese día hoy, y si recibe la factura. Si todo es igual, no hay nada que cambiar.
  SELECT t.pagador_persona_id AS persona, t.pagador_tipo AS tipo, t.factura_al_responsable AS indicacion
    INTO v_antes
    FROM public.tramos_de_pagador_del_servicio t
   WHERE t.servicio_id = p_servicio
     AND (t.rige_desde IS NULL OR t.rige_desde <= p_desde)
     AND (t.rige_hasta IS NULL OR t.rige_hasta >= p_desde);
  IF NOT FOUND THEN
    SELECT NULL::uuid AS persona, NULL::text AS tipo, false AS indicacion INTO v_antes;
  END IF;
  IF v_antes.persona IS NOT DISTINCT FROM p_persona AND v_antes.tipo IS NOT DISTINCT FROM p_tipo
     AND v_antes.indicacion IS NOT DISTINCT FROM v_indicacion THEN
    RETURN;
  END IF;

  -- Los días de antes siguen como estaban: si no hay nada escrito antes de ese día, se escribe,
  -- desde siempre.
  SELECT EXISTS (SELECT 1 FROM public.pagadores_del_servicio p
                  WHERE p.servicio_id = p_servicio AND p.vigente_desde < p_desde)
    INTO v_habia_antes;
  IF NOT v_habia_antes THEN
    INSERT INTO public.pagadores_del_servicio
      (prestadora_id, servicio_id, pagador_persona_id, pagador_tipo, factura_al_responsable, vigente_desde)
    VALUES (v_prest, p_servicio, v_antes.persona, v_antes.tipo, coalesce(v_antes.indicacion, false), '-infinity'::date);
  END IF;

  INSERT INTO public.pagadores_del_servicio AS p
    (prestadora_id, servicio_id, pagador_persona_id, pagador_tipo, factura_al_responsable, vigente_desde)
  VALUES (v_prest, p_servicio, p_persona, p_tipo, v_indicacion, p_desde)
  ON CONFLICT (servicio_id, vigente_desde) DO UPDATE
    SET pagador_persona_id = EXCLUDED.pagador_persona_id,
        pagador_tipo = EXCLUDED.pagador_tipo,
        factura_al_responsable = EXCLUDED.factura_al_responsable
  RETURNING p.id INTO v_id;

  SELECT min(p.vigente_desde) INTO v_siguiente
    FROM public.pagadores_del_servicio p
   WHERE p.servicio_id = p_servicio AND p.vigente_desde > p_desde;

  -- A nombre de quién sale la factura el día anterior al cambio, desde el cambio, y desde el
  -- cambio siguiente.
  SELECT interno.responsable_que_recibe_la_factura(p.pagador_persona_id, p.factura_al_responsable)
    INTO v_recibe_antes
    FROM public.pagadores_del_servicio p
   WHERE p.servicio_id = p_servicio AND p.vigente_desde < p_desde
   ORDER BY p.vigente_desde DESC
   LIMIT 1;
  v_recibe_ahora := interno.responsable_que_recibe_la_factura(p_persona, v_indicacion);
  SELECT interno.responsable_que_recibe_la_factura(p.pagador_persona_id, p.factura_al_responsable)
    INTO v_recibe_despues
    FROM public.pagadores_del_servicio p
   WHERE p.servicio_id = p_servicio AND p.vigente_desde = v_siguiente;

  INSERT INTO public.registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, detalle)
  VALUES (v_prest, v_quien, 'cambio_de_responsable_de_pagos', 'pagadores_del_servicio', v_id,
          jsonb_build_object('servicio_id', p_servicio, 'rige_desde', p_desde,
                             'responsable_anterior', v_antes.persona, 'responsable_nuevo', p_persona,
                             'factura_al_responsable_anterior', coalesce(v_antes.indicacion, false),
                             'factura_al_responsable_nuevo', v_indicacion));

  -- Las facturas todavía no emitidas que quedan con días a nombre de dos personas se borran: el
  -- backend las vuelve a generar, una por cada parte. Las emitidas ya las rechazó la base. Si la
  -- factura sigue a nombre del mismo de los dos lados de un corte, ese corte no borra nada.
  RETURN QUERY
  DELETE FROM public.facturas_cliente f
   WHERE f.servicio_id = p_servicio
     AND f.prestadora_id = v_prest
     AND ((v_recibe_antes IS DISTINCT FROM v_recibe_ahora
           AND f.periodo < p_desde AND f.periodo_hasta >= p_desde)
          OR (v_siguiente IS NOT NULL AND v_recibe_ahora IS DISTINCT FROM v_recibe_despues
              AND f.periodo < v_siguiente AND f.periodo_hasta >= v_siguiente))
  RETURNING f.periodo, f.periodo_hasta;
END;
$$;

REVOKE ALL ON FUNCTION public.cambiar_responsable_de_pagos(uuid, uuid, text, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cambiar_responsable_de_pagos(uuid, uuid, text, date, boolean) TO service_role, authenticated;

-- La baja con deuda: el Contratante del Servicio o, si no tiene uno, el del Cliente.
CREATE OR REPLACE FUNCTION interno.anotar_deuda_de_la_baja(p_baja uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_baja bajas_de_servicio%ROWTYPE;
  v_servicio servicios%ROWTYPE;
  v_pagador uuid;
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

  v_pagador := interno.pagador_del_servicio_en(v_servicio.id, current_date);

  SELECT coalesce((regla ->> 'sigue_la_cobranza')::boolean, true) = false INTO v_la_lleva_otro
    FROM configuracion_facturacion_clientes
   WHERE prestadora_id = v_baja.prestadora_id;

  INSERT INTO avisos_baja_servicio_con_deuda
    (prestadora_id, servicio_id, baja_id, cliente_id, responsable_de_pagos_persona_id,
     contratante_persona_id, importe, moneda, dias_de_atraso)
  SELECT v_baja.prestadora_id, v_servicio.id, v_baja.id, v_servicio.cliente_id,
         v_pagador, v_contratante,
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
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
