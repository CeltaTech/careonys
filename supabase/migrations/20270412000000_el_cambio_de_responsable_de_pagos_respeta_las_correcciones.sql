-- Un cambio de Responsable de pagos tampoco toca los días de una factura con correcciones.
--
-- Qué hace y por qué:
--
-- Una corrección de factura lleva su propio comprobante, o sea que es un documento ya emitido.
-- Hasta ahora la base dejaba cambiar el Responsable de pagos sobre los días de una factura sin
-- mandar que tenía correcciones. El cambio borra esa factura para volver a armarla partida, y al
-- borrarla se borraban solas sus correcciones, sin que nadie se enterara.
--
-- Ahora una factura con correcciones cuenta igual que una emitida, con comprobante o con cobros:
-- la base rechaza el cambio y no se borra nada. El motivo que sube es el mismo,
-- `cambio_de_pagador_con_factura_emitida`.
--
-- Se vuelve a escribir entera la función que hace ese control, con la misma seguridad: corre con
-- los permisos de su dueño, con la ruta de búsqueda vacía, y nadie más que la base la puede
-- llamar.

BEGIN;

CREATE OR REPLACE FUNCTION interno.cambio_de_pagador_sin_factura_emitida() RETURNS trigger
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
            OR EXISTS (SELECT 1 FROM public.cobros_cliente c WHERE c.factura_id = f.id)
            OR EXISTS (SELECT 1 FROM public.correcciones_factura_cliente r WHERE r.factura_id = f.id))
  ) THEN
    RAISE EXCEPTION 'cambio_de_pagador_con_factura_emitida' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION interno.cambio_de_pagador_sin_factura_emitida() FROM PUBLIC, anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
