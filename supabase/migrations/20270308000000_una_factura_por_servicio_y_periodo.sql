-- Una factura por Servicio y período. Un Cliente con dos Servicios recibe dos facturas del mismo
-- período, cada una para el Responsable de pagos de su Servicio. La deuda sigue siendo del Cliente,
-- que es quien figura en cada factura, y el estado de cuenta se arma por Cliente.

BEGIN;

-- La única que queda es `facturas_cliente_una_por_servicio_y_periodo`.
ALTER TABLE public.facturas_cliente DROP CONSTRAINT IF EXISTS facturas_cliente_cliente_id_periodo_key;

-- No hay ninguna factura sin Servicio: toda factura nace de uno.
ALTER TABLE public.facturas_cliente ALTER COLUMN servicio_id SET NOT NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
