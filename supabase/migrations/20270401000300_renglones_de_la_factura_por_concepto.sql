-- ============================================================================================
-- Cada renglón de la factura del Cliente dice qué es: lo pactado, lo medido, un adicional, lo
-- que se descuenta por no prestado o lo que se cobra cancelado por el Cliente.
-- ============================================================================================
--
-- QUÉ HACE
--   Agrega dos columnas a `public.facturas_cliente_items`:
--     - `concepto`: de dónde sale el renglón. Valores:
--         pactado                  lo acordado por período;
--         medido                   lo que se midió por hora o por día de guardia;
--         adicional                guardias u horas por encima de lo pactado;
--         no_prestado              lo que se descuenta porque no se prestó por causa de la
--                                  Prestadora o del Asistente (monto negativo);
--         cancelado_por_el_cliente lo que el Cliente canceló: se cobra o se descuenta, según la
--                                  condición que rija (monto negativo cuando se descuenta).
--       Vacío en los renglones que ya existían: no se adivina qué eran.
--     - `recargo_del_adicional`: el porcentaje de recargo que se aplicó a un renglón adicional,
--       para que el renglón se pueda explicar sin volver a mirar las condiciones del Servicio, que
--       pueden cambiar después. Entero entre 0 y 500, igual que la condición.
--   Un renglón descontado lleva monto negativo, con cantidad y precio unitario positivos: la
--   cantidad sigue siendo cuántas guardias, y el signo lo pone el concepto.
--
-- QUÉ SE COMPROBÓ EN LA BASE EN VIVO (2026-11-13)
--   - `facturas_cliente_items` tiene 0 filas: no hay renglones viejos que clasificar.
--   - Sus columnas son id, factura_id, paciente_id, descripcion, monto, created_at, servicio_id,
--     moneda, prestadora_id, cantidad, unidad, precio_unitario. Ninguna se llama concepto ni
--     recargo_del_adicional.
--   - `monto` no tiene ningún CHECK de signo, así que el renglón descontado entra; `cantidad` sí
--     tiene el de no negativa, y por eso la cantidad del descuento va positiva.
--   - `unidad` acepta periodo, guardia, hora, hora_extra y dia_de_guardia: alcanza, no se toca.
--   - `authenticated` tiene SELECT, INSERT, UPDATE y DELETE sobre la tabla entera, que cubre las
--     columnas nuevas. Se repiten igual por columna abajo para que quede escrito.
--   - Disparadores de la tabla: trg_completar_moneda y trg_completar_prestadora. Ninguno toca las
--     columnas nuevas.
--   - `guardias.cancelacion_origen` acepta 'cliente' y 'prestadora', sólo en la guardia cancelada;
--     `guardias.estado` incluye 'ausente'. De ahí salen los conceptos de descuento.
--
-- CÓMO SE VUELVE ATRÁS
--   BEGIN;
--   ALTER TABLE public.facturas_cliente_items DROP COLUMN IF EXISTS recargo_del_adicional;
--   ALTER TABLE public.facturas_cliente_items DROP COLUMN IF EXISTS concepto;
--   COMMIT;
--   NOTIFY pgrst, 'reload schema';
-- ============================================================================================

BEGIN;

ALTER TABLE public.facturas_cliente_items
  ADD COLUMN concepto text,
  ADD COLUMN recargo_del_adicional integer;

ALTER TABLE public.facturas_cliente_items
  ADD CONSTRAINT facturas_cliente_items_concepto_conocido CHECK (
    concepto IS NULL
    OR concepto = ANY (ARRAY['pactado', 'medido', 'adicional', 'no_prestado', 'cancelado_por_el_cliente', 'descuento'])
  ),
  ADD CONSTRAINT facturas_cliente_items_recargo_en_borde CHECK (
    recargo_del_adicional IS NULL OR (recargo_del_adicional BETWEEN 0 AND 500)
  );

GRANT SELECT (concepto, recargo_del_adicional),
      INSERT (concepto, recargo_del_adicional),
      UPDATE (concepto, recargo_del_adicional)
  ON public.facturas_cliente_items TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
