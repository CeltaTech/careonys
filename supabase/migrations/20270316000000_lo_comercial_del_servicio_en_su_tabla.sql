-- Lo comercial del Servicio en su propia tabla, que sólo lee quien tiene el permiso.
--
-- El Contratante, el Responsable de pagos, de qué clase es y el plazo de pago estaban en
-- `servicios`, y el Coordinador lee todas las columnas de los Servicios que coordina. Ahora viven
-- aparte: los lee y los corrige quien tiene `editar_condiciones_comerciales_servicio`, y los lee
-- además quien tiene `registrar_consentimiento_pagador`, que necesita saber quién es el
-- Responsable de pagos para pedirle la firma. Lo que firma el Pagador y los documentos que se le
-- piden pasan a leerlos sólo quienes tienen ese segundo permiso. La administración tiene los dos.

BEGIN;

-- 1. La tabla, con las mismas reglas que tenían las columnas.
CREATE TABLE public.condiciones_comerciales_servicio (
  servicio_id               uuid PRIMARY KEY,
  prestadora_id             uuid NOT NULL REFERENCES public.prestadoras(id) ON DELETE CASCADE,
  contratante_persona_id    uuid,
  pagador_tipo              text,
  pagador_persona_id        uuid,
  dias_hasta_el_vencimiento integer,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT condiciones_comerciales_del_servicio_de_la_misma_prestadora
    FOREIGN KEY (servicio_id, prestadora_id) REFERENCES public.servicios(id, prestadora_id) ON DELETE CASCADE,
  CONSTRAINT condiciones_comerciales_contratante_de_la_misma_prestadora
    FOREIGN KEY (contratante_persona_id, prestadora_id) REFERENCES public.personas(id, prestadora_id),
  CONSTRAINT condiciones_comerciales_pagador_de_la_misma_prestadora
    FOREIGN KEY (pagador_persona_id, prestadora_id) REFERENCES public.personas(id, prestadora_id),
  CONSTRAINT condiciones_comerciales_pagador_conocido
    CHECK (pagador_tipo IS NULL OR pagador_tipo IN ('cliente', 'obra_social', 'otro')),
  CONSTRAINT condiciones_comerciales_plazo_razonable
    CHECK (dias_hasta_el_vencimiento IS NULL OR dias_hasta_el_vencimiento BETWEEN 0 AND 365)
);

CREATE INDEX condiciones_comerciales_por_prestadora
  ON public.condiciones_comerciales_servicio (prestadora_id);

-- 2. Lo que ya estaba cargado pasa tal cual.
INSERT INTO public.condiciones_comerciales_servicio
  (servicio_id, prestadora_id, contratante_persona_id, pagador_tipo, pagador_persona_id, dias_hasta_el_vencimiento)
SELECT id, prestadora_id, contratante_persona_id, pagador_tipo, pagador_persona_id, dias_hasta_el_vencimiento
  FROM public.servicios;

-- 3. Cada Servicio nace con su fila, y el Contratante es el de su Cliente. La crea la base y no
-- quien crea el Servicio, porque un Coordinador puede abrir un Servicio sin poder tocar lo
-- comercial.
CREATE OR REPLACE FUNCTION interno.el_servicio_nace_con_sus_condiciones_comerciales()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $$
BEGIN
  INSERT INTO condiciones_comerciales_servicio (servicio_id, prestadora_id, contratante_persona_id)
  SELECT NEW.id, NEW.prestadora_id, c.contratante_persona_id
    FROM clientes c
   WHERE c.id = NEW.cliente_id AND c.prestadora_id = NEW.prestadora_id
  ON CONFLICT (servicio_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION interno.el_servicio_nace_con_sus_condiciones_comerciales() FROM PUBLIC, anon;

CREATE TRIGGER el_servicio_nace_con_sus_condiciones_comerciales
  AFTER INSERT ON public.servicios
  FOR EACH ROW EXECUTE FUNCTION interno.el_servicio_nace_con_sus_condiciones_comerciales();

CREATE OR REPLACE FUNCTION interno.condiciones_comerciales_marcan_el_cambio()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER condiciones_comerciales_marcan_el_cambio
  BEFORE UPDATE ON public.condiciones_comerciales_servicio
  FOR EACH ROW EXECUTE FUNCTION interno.condiciones_comerciales_marcan_el_cambio();

-- Lo que se hace con un permiso de acceso queda auditado, igual que en `servicios`.
CREATE TRIGGER trg_auditoria_acceso
  AFTER INSERT OR UPDATE OR DELETE ON public.condiciones_comerciales_servicio
  FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_de_acceso_mutacion();

-- 4. Quién la lee y quién la corrige. La fila no se crea ni se borra a mano: nace y se va con
-- su Servicio.
ALTER TABLE public.condiciones_comerciales_servicio ENABLE ROW LEVEL SECURITY;

CREATE POLICY lo_comercial_lo_lee_quien_puede ON public.condiciones_comerciales_servicio
  FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND (interno.tiene_permiso('editar_condiciones_comerciales_servicio')
         OR interno.tiene_permiso('registrar_consentimiento_pagador'))
  );

CREATE POLICY lo_comercial_lo_corrige_quien_puede ON public.condiciones_comerciales_servicio
  FOR UPDATE TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND interno.tiene_permiso('editar_condiciones_comerciales_servicio')
  )
  WITH CHECK (
    prestadora_id = interno.prestadora_actual()
    AND interno.tiene_permiso('editar_condiciones_comerciales_servicio')
  );

CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.condiciones_comerciales_servicio
  FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

REVOKE ALL ON public.condiciones_comerciales_servicio FROM PUBLIC, anon;
GRANT SELECT ON public.condiciones_comerciales_servicio TO authenticated;
GRANT UPDATE (contratante_persona_id, pagador_tipo, pagador_persona_id, dias_hasta_el_vencimiento)
  ON public.condiciones_comerciales_servicio TO authenticated;
GRANT SELECT ON public.condiciones_comerciales_servicio TO trabajo_sin_persona;

-- 5. Las funciones que leían las columnas del Servicio leen la tabla nueva.
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

  SELECT cc.pagador_persona_id, cc.contratante_persona_id INTO v_pagador, v_contratante
    FROM condiciones_comerciales_servicio cc
   WHERE cc.servicio_id = v_servicio.id AND cc.prestadora_id = v_baja.prestadora_id;

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

-- El Coordinador alcanza la Ficha de quien contrata o paga un Servicio sólo si tiene el permiso
-- de esa parte. La Ficha del Contratante del Cliente la sigue alcanzando como antes.
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
        AND EXISTS (SELECT 1 FROM condiciones_comerciales_servicio cc
                     JOIN servicios s ON s.id = cc.servicio_id AND s.prestadora_id = cc.prestadora_id
                    WHERE (cc.contratante_persona_id = p_persona OR cc.pagador_persona_id = p_persona)
                      AND cc.prestadora_id = interno.prestadora_actual()
                      AND interno.coordinador_ve_al_cliente(s.cliente_id)))
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

-- 6. Las columnas salen del Servicio, con el disparador que las cuidaba: ahora las cuida la
-- protección por fila de su tabla.
DROP TRIGGER lo_comercial_del_servicio_lo_edita_quien_puede ON public.servicios;
DROP FUNCTION interno.lo_comercial_del_servicio_lo_edita_quien_puede();

ALTER TABLE public.servicios
  DROP COLUMN contratante_persona_id,
  DROP COLUMN pagador_tipo,
  DROP COLUMN pagador_persona_id,
  DROP COLUMN dias_hasta_el_vencimiento;

-- 7. Lo que firma el Pagador y los documentos que se le piden los lee quien tiene el permiso de
-- esa parte, no todo el personal. Los archivos siguen a la fila.
DROP POLICY consentimientos_pagador_los_leen_administrador_y_coordinador ON public.consentimientos_pagador;
CREATE POLICY consentimientos_pagador_los_lee_quien_puede ON public.consentimientos_pagador
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.tiene_permiso('registrar_consentimiento_pagador'));

DROP POLICY documentos_pagador_los_leen_administrador_y_coordinador ON public.documentos_pagador;
CREATE POLICY documentos_pagador_los_lee_quien_puede ON public.documentos_pagador
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.tiene_permiso('registrar_consentimiento_pagador'));

NOTIFY pgrst, 'reload schema';

COMMIT;
