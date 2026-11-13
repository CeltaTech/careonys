-- La factura de cada Servicio, por el período que sale de su frecuencia de cobro.
--
-- Hasta acá una factura era de un mes: `facturas_cliente.periodo` guardaba el primer día del mes y
-- el fin se daba por sabido. Ahora el período puede ser de un día, de una semana, de dos semanas o
-- de un mes, así que el fin se guarda: `periodo` sigue siendo el primer día, y `periodo_hasta` es
-- el último, los dos incluidos.
--
-- Dos facturas del mismo Servicio no pueden cubrir el mismo día. La restricción única que ya existe
-- (un Servicio, un primer día) no alcanza para eso: una factura semanal y una mensual del mismo
-- Servicio empiezan en días distintos y se pisan igual. Lo cierra una restricción de exclusión
-- sobre el tramo de días.
--
-- Además, cada Servicio puede tener su propia frecuencia de cobro y su propia medición, en
-- `condiciones_comerciales_servicio`. Vacío quiere decir que rige el valor de la Prestadora. Y cada
-- renglón de la factura guarda cuántas unidades se cobraron, de qué, y a qué precio, que es lo que
-- el software de facturación necesita para emitirla.

BEGIN;

-- El último día del período de cada factura. Las que ya existen eran de un mes.
ALTER TABLE public.facturas_cliente
  ADD COLUMN periodo_hasta date;

UPDATE public.facturas_cliente
   SET periodo_hasta = (date_trunc('month', periodo) + interval '1 month - 1 day')::date
 WHERE periodo_hasta IS NULL;

ALTER TABLE public.facturas_cliente
  ALTER COLUMN periodo_hasta SET NOT NULL,
  ADD CONSTRAINT facturas_cliente_periodo_en_orden CHECK (periodo_hasta >= periodo),
  ADD CONSTRAINT facturas_cliente_sin_dias_cobrados_dos_veces
    EXCLUDE USING gist (
      servicio_id WITH =,
      daterange(periodo, periodo_hasta, '[]') WITH &&
    );

COMMENT ON COLUMN public.facturas_cliente.periodo IS
  'Primer día del período que cubre la factura, incluido.';
COMMENT ON COLUMN public.facturas_cliente.periodo_hasta IS
  'Último día del período que cubre la factura, incluido. Sale de la frecuencia de cobro del Servicio.';

-- Lo que se cobró en cada renglón: cuántas unidades, de qué, y a qué precio cada una. Nulo en los
-- renglones anteriores, que se cobraban enteros.
ALTER TABLE public.facturas_cliente_items
  ADD COLUMN cantidad numeric(12,2),
  ADD COLUMN unidad text,
  ADD COLUMN precio_unitario numeric(12,2),
  ADD CONSTRAINT facturas_cliente_items_unidad_conocida CHECK (
    unidad IS NULL OR unidad = ANY (ARRAY['periodo'::text, 'guardia'::text, 'hora'::text, 'hora_extra'::text, 'dia_de_guardia'::text])
  ),
  ADD CONSTRAINT facturas_cliente_items_cantidad_no_negativa CHECK (cantidad IS NULL OR cantidad >= 0);

-- Lo propio de cada Servicio. Vacío: rige el de la Prestadora, y si tampoco hay, el de fábrica.
ALTER TABLE public.condiciones_comerciales_servicio
  ADD COLUMN frecuencia_de_cobro text,
  ADD COLUMN medicion text,
  ADD CONSTRAINT condiciones_comerciales_frecuencia_conocida CHECK (
    frecuencia_de_cobro IS NULL
    OR frecuencia_de_cobro = ANY (ARRAY['dia'::text, 'semana'::text, 'quincena'::text, 'mes'::text])
  ),
  ADD CONSTRAINT condiciones_comerciales_medicion_conocida CHECK (
    medicion IS NULL
    OR medicion = ANY (ARRAY['pactado_mas_excedente'::text, 'hora'::text, 'dia_de_guardia'::text])
  );

COMMENT ON COLUMN public.condiciones_comerciales_servicio.frecuencia_de_cobro IS
  'Cada cuánto se le factura este Servicio al Cliente: dia, semana, quincena (dos semanas) o mes. Nula: rige la de la Prestadora.';
COMMENT ON COLUMN public.condiciones_comerciales_servicio.medicion IS
  'Con qué se mide lo que se cobra: pactado_mas_excedente, hora o dia_de_guardia. Nula: rige la de la Prestadora.';

-- Quien edita lo comercial del Servicio desde el Panel escribe estas dos columnas igual que las
-- otras cuatro: el permiso es por columna, y la política de la tabla sigue decidiendo qué filas.
GRANT UPDATE (frecuencia_de_cobro, medicion) ON TABLE public.condiciones_comerciales_servicio TO authenticated;

-- La vista de saldos muestra también el Servicio y el fin del período. Las columnas nuevas van al
-- final, que es lo único que permite reemplazar una vista sin borrarla.
CREATE OR REPLACE VIEW public.saldos_cliente
WITH (security_invoker = true) AS
 SELECT f.id AS factura_id,
    f.prestadora_id,
    f.cliente_id,
    f.periodo,
    f.moneda,
    f.monto_total,
    f.monto_facturado,
    f.comprobante_tipo,
    f.comprobante_numero,
    f.facturado_at,
    co.neto AS correcciones_neto,
    co.correcciones_contadas,
    monto_a_cobrar_de_factura(f.monto_total, f.monto_facturado, f.id) AS monto_a_cobrar,
    r.cobrado,
    (monto_a_cobrar_de_factura(f.monto_total, f.monto_facturado, f.id) - r.cobrado)::numeric(12,2) AS saldo,
    estado_de_factura(monto_a_cobrar_de_factura(f.monto_total, f.monto_facturado, f.id), r.cobrado, f.fecha_vencimiento) AS estado,
    f.estado AS estado_guardado,
    f.fecha_emision,
    f.fecha_vencimiento,
    r.cobros_contados,
    r.ultimo_cobro_fecha,
    r.origenes,
    f.updated_at AS actualizado_en,
    f.servicio_id,
    f.periodo_hasta
   FROM facturas_cliente f
     CROSS JOIN LATERAL resumen_cobros_de_factura(f.id) r(cobrado, cobros_contados, ultimo_cobro_fecha, origenes)
     CROSS JOIN LATERAL correcciones_de_factura(f.id) co(neto, correcciones_contadas);

COMMIT;

NOTIFY pgrst, 'reload schema';
