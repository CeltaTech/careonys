-- El Responsable de pagos de un Servicio cambia desde un día, y cada día se le factura a quien
-- pagaba ese día.
--
-- Qué hace y por qué:
--
-- 1. Una tabla nueva guarda cada Responsable de pagos de un Servicio con el día desde el que rige.
--    Antes había uno solo, escrito en las condiciones comerciales, y cambiarlo cambiaba también
--    quién había pagado los días anteriores. Ahora un cambio no borra al anterior: queda escrito
--    hasta el día antes del cambio. Una fila sin persona quiere decir que paga quien contrata. El
--    primero de cada Servicio rige desde siempre.
--
-- 2. Una vista dice qué días cubre cada fila: desde su día hasta el día antes del siguiente
--    cambio, y si es el que rige hoy. Es el único lugar que hace esa cuenta. La leen la base, el
--    backend y el Panel.
--
-- 3. Una función interna contesta quién paga un Servicio en una fecha. Lee la vista.
--
-- 4. La base rechaza un cambio que toque días de una factura ya emitida, con comprobante o con
--    cobros. Esa factura ya salió a nombre de alguien y no se puede rehacer. El motivo que sube es
--    `cambio_de_pagador_con_factura_emitida`, y el Panel lo traduce en los tres idiomas.
--
-- 5. Una función pública hace el cambio con la sesión de quien lo pide. Exige el permiso de lo
--    comercial, deja escrito quién pagaba antes de ese día, guarda el cambio, borra las facturas
--    todavía no emitidas que quedan partidas por el cambio y devuelve sus períodos, para que el
--    backend las vuelva a generar en dos partes. El cambio queda en el registro de actividad.
--
-- 6. Los dos Servicios de la nube que tenían Responsable de pagos pasan a la tabla nueva, desde
--    siempre. Ninguno tiene facturas. Después se quitan las dos columnas viejas de las
--    condiciones comerciales.
--
-- 7. Las tres funciones que leían esas columnas pasan a leer al Responsable de pagos de hoy: la
--    firma vigente, la deuda que se anota en la baja de un Servicio y las personas que el
--    Coordinador puede ver. La firma vale si la firmó el Responsable de pagos de hoy. La firma
--    del anterior queda guardada y vale para sus días.
--
-- Qué se comprobó en la base en vivo (2026-11-18):
--   · 2 condiciones comerciales con Responsable de pagos, las dos de la misma Prestadora, sin
--     tipo, y sus Servicios sin ninguna factura.
--   · Sólo tres funciones leían esas dos columnas, y ninguna vista ni ninguna política.
--   · El catálogo de acciones registradas llega a orden 38.
--
-- Cómo se vuelve atrás: otra migración que vuelva a crear las dos columnas en las condiciones
-- comerciales con su control y su clave foránea, que copie ahí al Responsable de pagos de hoy de
-- cada Servicio, que vuelva a escribir las tres funciones como estaban en
-- `20270410000000_guardias_solo_con_la_firma_del_responsable_de_pagos.sql` y en las migraciones
-- anteriores, y que borre la función pública, la función interna, la vista, la tabla y la acción
-- del catálogo. Se pierden los Responsables de pagos anteriores de cada Servicio.

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- 1. Cada Responsable de pagos de un Servicio, con el día desde el que rige
-- ---------------------------------------------------------------------------------------------

CREATE TABLE public.pagadores_del_servicio (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id       uuid NOT NULL REFERENCES public.prestadoras(id),
  servicio_id         uuid NOT NULL,
  pagador_persona_id  uuid,
  pagador_tipo        text,
  vigente_desde       date NOT NULL,
  cargado_por         uuid REFERENCES public.usuarios(id),
  cargado_en          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pagadores_del_servicio_un_cambio_por_dia UNIQUE (servicio_id, vigente_desde),
  CONSTRAINT pagadores_del_servicio_de_la_misma_prestadora
    FOREIGN KEY (servicio_id, prestadora_id) REFERENCES public.servicios(id, prestadora_id) ON DELETE CASCADE,
  CONSTRAINT pagadores_del_servicio_persona_de_la_misma_prestadora
    FOREIGN KEY (pagador_persona_id, prestadora_id) REFERENCES public.personas(id, prestadora_id),
  CONSTRAINT pagadores_del_servicio_tipo_conocido
    CHECK (pagador_tipo IS NULL OR pagador_tipo IN ('cliente', 'obra_social', 'otro'))
);

CREATE INDEX pagadores_del_servicio_por_prestadora ON public.pagadores_del_servicio (prestadora_id);
CREATE INDEX pagadores_del_servicio_por_persona
  ON public.pagadores_del_servicio (pagador_persona_id) WHERE pagador_persona_id IS NOT NULL;

COMMENT ON TABLE public.pagadores_del_servicio IS
  'Cada Responsable de pagos de un Servicio, desde el día en que rige hasta el día antes del siguiente. Sin persona, paga quien contrata. El primero rige desde siempre. Se cambia con cambiar_responsable_de_pagos.';

ALTER TABLE public.pagadores_del_servicio ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pagadores_del_servicio FROM PUBLIC, anon, authenticated, trabajo_sin_persona;
-- Se lee; se escribe sólo con la función pública de más abajo.
GRANT SELECT ON public.pagadores_del_servicio TO authenticated, trabajo_sin_persona;

CREATE POLICY los_responsables_de_pagos_los_lee_quien_puede ON public.pagadores_del_servicio
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND (interno.tiene_permiso('editar_condiciones_comerciales_servicio')
              OR interno.tiene_permiso('registrar_consentimiento_pagador')));

CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.pagadores_del_servicio
  FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

CREATE TRIGGER trg_auditoria_acceso
  AFTER INSERT OR UPDATE OR DELETE ON public.pagadores_del_servicio
  FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_de_acceso_mutacion();

-- ---------------------------------------------------------------------------------------------
-- 2. Qué días cubre cada uno
-- ---------------------------------------------------------------------------------------------

CREATE VIEW public.tramos_de_pagador_del_servicio WITH (security_invoker = true) AS
SELECT p.id,
       p.prestadora_id,
       p.servicio_id,
       p.pagador_persona_id,
       p.pagador_tipo,
       p.vigente_desde,
       -- El primero de cada Servicio rige desde siempre.
       CASE WHEN lag(p.vigente_desde) OVER w IS NULL THEN NULL ELSE p.vigente_desde END AS rige_desde,
       -- Y cada uno, hasta el día antes del siguiente.
       (lead(p.vigente_desde) OVER w - 1) AS rige_hasta,
       (lag(p.vigente_desde) OVER w IS NULL OR p.vigente_desde <= current_date)
         AND (lead(p.vigente_desde) OVER w IS NULL OR lead(p.vigente_desde) OVER w > current_date) AS rige_hoy
  FROM public.pagadores_del_servicio p
WINDOW w AS (PARTITION BY p.servicio_id ORDER BY p.vigente_desde);

COMMENT ON VIEW public.tramos_de_pagador_del_servicio IS
  'Los días que cubre cada Responsable de pagos de un Servicio. rige_desde vacío: desde siempre. rige_hasta vacío: sin fin. Es la única cuenta de quién paga cada día.';

REVOKE ALL ON public.tramos_de_pagador_del_servicio FROM PUBLIC, anon, authenticated, trabajo_sin_persona;
GRANT SELECT ON public.tramos_de_pagador_del_servicio TO authenticated, trabajo_sin_persona;

-- ---------------------------------------------------------------------------------------------
-- 3. Quién paga un Servicio en una fecha
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION interno.pagador_del_servicio_en(p_servicio uuid, p_fecha date) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO ''
AS $$
  SELECT t.pagador_persona_id
    FROM public.tramos_de_pagador_del_servicio t
   WHERE t.servicio_id = p_servicio
     AND (t.rige_desde IS NULL OR t.rige_desde <= p_fecha)
     AND (t.rige_hasta IS NULL OR t.rige_hasta >= p_fecha);
$$;

-- La usan sólo las funciones de la base que ya se saltean la RLS.
REVOKE ALL ON FUNCTION interno.pagador_del_servicio_en(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION interno.pagador_del_servicio_en(uuid, date) TO service_role;

-- ---------------------------------------------------------------------------------------------
-- 4. Un cambio no toca los días de una factura emitida
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION interno.cambio_de_pagador_sin_factura_emitida() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  v_antes record;
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

  -- Quién pagaba esos días antes de este cambio.
  IF TG_OP = 'UPDATE' THEN
    SELECT OLD.pagador_persona_id AS persona, OLD.pagador_tipo AS tipo INTO v_antes;
  ELSE
    SELECT p.pagador_persona_id AS persona, p.pagador_tipo AS tipo INTO v_antes
      FROM public.pagadores_del_servicio p
     WHERE p.servicio_id = NEW.servicio_id
     ORDER BY (p.vigente_desde <= NEW.vigente_desde) DESC,
              CASE WHEN p.vigente_desde <= NEW.vigente_desde THEN p.vigente_desde END DESC,
              p.vigente_desde ASC
     LIMIT 1;
    IF NOT FOUND THEN
      SELECT NULL::uuid AS persona, NULL::text AS tipo INTO v_antes;
    END IF;
  END IF;

  -- Si esos días siguen a nombre del mismo, no cambia ninguna factura.
  IF v_antes.persona IS NOT DISTINCT FROM NEW.pagador_persona_id
     AND v_antes.tipo IS NOT DISTINCT FROM NEW.pagador_tipo THEN
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
            OR EXISTS (SELECT 1 FROM public.cobros_cliente c WHERE c.factura_id = f.id))
  ) THEN
    RAISE EXCEPTION 'cambio_de_pagador_con_factura_emitida' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION interno.cambio_de_pagador_sin_factura_emitida() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER cambio_de_pagador_sin_factura_emitida
  BEFORE INSERT OR UPDATE ON public.pagadores_del_servicio
  FOR EACH ROW EXECUTE FUNCTION interno.cambio_de_pagador_sin_factura_emitida();

-- ---------------------------------------------------------------------------------------------
-- 5. El cambio de Responsable de pagos
-- ---------------------------------------------------------------------------------------------

INSERT INTO public.catalogo_acciones_registradas (accion, grupo, orden, la_hace_el_sistema)
VALUES ('cambio_de_responsable_de_pagos', 'consecuencia_economica', 39, false)
ON CONFLICT (accion) DO NOTHING;

CREATE FUNCTION public.cambiar_responsable_de_pagos(p_servicio uuid, p_persona uuid, p_tipo text, p_desde date)
  RETURNS TABLE (periodo date, periodo_hasta date)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  v_prest uuid := interno.prestadora_actual();
  v_quien uuid := interno.usuario_de_la_sesion();
  v_antes record;
  v_habia_antes boolean;
  v_id uuid;
  v_siguiente date;
BEGIN
  IF v_prest IS NULL OR v_quien IS NULL OR NOT interno.es_personal_de_la_prestadora()
     OR NOT interno.tiene_permiso('editar_condiciones_comerciales_servicio') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_servicio IS NULL OR p_desde IS NULL OR NOT isfinite(p_desde)
     OR (p_tipo IS NOT NULL AND p_tipo NOT IN ('cliente', 'obra_social', 'otro')) THEN
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

  -- Quién paga ese día hoy. Si es el mismo, no hay nada que cambiar.
  SELECT t.pagador_persona_id AS persona, t.pagador_tipo AS tipo INTO v_antes
    FROM public.tramos_de_pagador_del_servicio t
   WHERE t.servicio_id = p_servicio
     AND (t.rige_desde IS NULL OR t.rige_desde <= p_desde)
     AND (t.rige_hasta IS NULL OR t.rige_hasta >= p_desde);
  IF NOT FOUND THEN
    SELECT NULL::uuid AS persona, NULL::text AS tipo INTO v_antes;
  END IF;
  IF v_antes.persona IS NOT DISTINCT FROM p_persona AND v_antes.tipo IS NOT DISTINCT FROM p_tipo THEN
    RETURN;
  END IF;

  -- Los días de antes siguen a nombre de quien pagaba: si no hay nada escrito antes de ese día,
  -- se escribe, desde siempre.
  SELECT EXISTS (SELECT 1 FROM public.pagadores_del_servicio p
                  WHERE p.servicio_id = p_servicio AND p.vigente_desde < p_desde)
    INTO v_habia_antes;
  IF NOT v_habia_antes THEN
    INSERT INTO public.pagadores_del_servicio (prestadora_id, servicio_id, pagador_persona_id, pagador_tipo, vigente_desde)
    VALUES (v_prest, p_servicio, v_antes.persona, v_antes.tipo, '-infinity'::date);
  END IF;

  INSERT INTO public.pagadores_del_servicio AS p (prestadora_id, servicio_id, pagador_persona_id, pagador_tipo, vigente_desde)
  VALUES (v_prest, p_servicio, p_persona, p_tipo, p_desde)
  ON CONFLICT (servicio_id, vigente_desde) DO UPDATE
    SET pagador_persona_id = EXCLUDED.pagador_persona_id,
        pagador_tipo = EXCLUDED.pagador_tipo
  RETURNING p.id INTO v_id;

  SELECT min(p.vigente_desde) INTO v_siguiente
    FROM public.pagadores_del_servicio p
   WHERE p.servicio_id = p_servicio AND p.vigente_desde > p_desde;

  INSERT INTO public.registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, detalle)
  VALUES (v_prest, v_quien, 'cambio_de_responsable_de_pagos', 'pagadores_del_servicio', v_id,
          jsonb_build_object('servicio_id', p_servicio, 'rige_desde', p_desde,
                             'responsable_anterior', v_antes.persona, 'responsable_nuevo', p_persona));

  -- Las facturas todavía no emitidas que el cambio deja con dos Responsables de pagos se borran:
  -- el backend las vuelve a generar, una por cada parte. Las emitidas ya las rechazó la base.
  RETURN QUERY
  DELETE FROM public.facturas_cliente f
   WHERE f.servicio_id = p_servicio
     AND f.prestadora_id = v_prest
     AND ((f.periodo < p_desde AND f.periodo_hasta >= p_desde)
          OR (v_siguiente IS NOT NULL AND f.periodo < v_siguiente AND f.periodo_hasta >= v_siguiente))
  RETURNING f.periodo, f.periodo_hasta;
END;
$$;

REVOKE ALL ON FUNCTION public.cambiar_responsable_de_pagos(uuid, uuid, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cambiar_responsable_de_pagos(uuid, uuid, text, date) TO service_role, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 6. Los Responsables de pagos que había pasan a la tabla nueva, y se quitan las columnas viejas
-- ---------------------------------------------------------------------------------------------

INSERT INTO public.pagadores_del_servicio (prestadora_id, servicio_id, pagador_persona_id, pagador_tipo, vigente_desde)
SELECT c.prestadora_id, c.servicio_id, c.pagador_persona_id, c.pagador_tipo, '-infinity'::date
  FROM public.condiciones_comerciales_servicio c
 WHERE c.pagador_persona_id IS NOT NULL OR c.pagador_tipo IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- 7. Las funciones que leían las columnas viejas
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION interno.firma_del_pagador_vigente(p_servicio uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'interno'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM servicios s
      JOIN consentimientos_pagador k
        ON k.servicio_id = s.id
       AND k.prestadora_id = s.prestadora_id
     WHERE s.id = p_servicio
       AND k.estado = 'cerrado'
       AND k.pagador_persona_id = interno.pagador_del_servicio_en(p_servicio, current_date)
  );
$$;

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

  SELECT cc.contratante_persona_id INTO v_contratante
    FROM condiciones_comerciales_servicio cc
   WHERE cc.servicio_id = v_servicio.id AND cc.prestadora_id = v_baja.prestadora_id;

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

-- El Coordinador ve a quien fue Responsable de pagos de un Servicio que coordina, el de hoy y
-- los anteriores, igual que ve a quien firmó.
CREATE OR REPLACE FUNCTION interno.la_persona_tiene_un_rol_que_el_coordinador_ve(p_persona uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT p_persona IS NOT NULL AND interno.es_coordinador() AND (
       EXISTS (SELECT 1 FROM clientes c
                WHERE c.contratante_persona_id = p_persona
                  AND c.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_al_cliente(c.id))
    OR ((interno.tiene_permiso('editar_condiciones_comerciales_servicio')
         OR interno.tiene_permiso('registrar_consentimiento_pagador'))
        AND (EXISTS (SELECT 1 FROM condiciones_comerciales_servicio cc
                      JOIN servicios s ON s.id = cc.servicio_id AND s.prestadora_id = cc.prestadora_id
                     WHERE cc.contratante_persona_id = p_persona
                       AND cc.prestadora_id = interno.prestadora_actual()
                       AND interno.coordinador_ve_al_cliente(s.cliente_id))
          OR EXISTS (SELECT 1 FROM pagadores_del_servicio ps
                      JOIN servicios s ON s.id = ps.servicio_id AND s.prestadora_id = ps.prestadora_id
                     WHERE ps.pagador_persona_id = p_persona
                       AND ps.prestadora_id = interno.prestadora_actual()
                       AND interno.coordinador_ve_al_cliente(s.cliente_id))))
    OR EXISTS (SELECT 1 FROM apoderados a
                WHERE a.persona_id = p_persona
                  AND a.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_al_cliente(a.cliente_id))
    OR (interno.tiene_permiso('registrar_consentimiento_pagador')
        AND EXISTS (SELECT 1 FROM consentimientos_pagador cp
                    WHERE (cp.pagador_persona_id = p_persona OR cp.firmante_persona_id = p_persona)
                      AND cp.prestadora_id = interno.prestadora_actual()
                      AND interno.coordinador_ve_al_cliente(cp.cliente_id)))
    OR EXISTS (SELECT 1 FROM personas_autorizadas pa
                WHERE pa.persona_id = p_persona
                  AND interno.coordinador_ve_al_cliente(pa.cliente_id))
    OR EXISTS (SELECT 1 FROM pacientes pac
                WHERE (pac.persona_id = p_persona OR pac.obra_social_persona_id = p_persona)
                  AND pac.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_al_paciente(pac.id))
    OR EXISTS (SELECT 1 FROM consentimientos_medicacion cm
                 JOIN indicaciones_medicacion im ON im.id = cm.indicacion_id
                WHERE cm.firmante_persona_id = p_persona
                  AND cm.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_al_paciente(im.paciente_id))
    OR EXISTS (SELECT 1 FROM excepciones_familiar_relevo e
                WHERE e.familiar_persona_id = p_persona
                  AND e.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_la_guardia(e.guardia_id))
  );
$function$;

-- Con las tres funciones al día, las columnas viejas ya no las lee nadie. Su control y su clave
-- foránea salen con ellas.
ALTER TABLE public.condiciones_comerciales_servicio
  DROP COLUMN pagador_persona_id,
  DROP COLUMN pagador_tipo;

COMMIT;

NOTIFY pgrst, 'reload schema';
