-- ---------------------------------------------------------------------------
-- A QUIEN SE LE RECLAMA CADA FACTURA SALE DE LA FICHA DE LA CLIENTE
--
-- DE DONDE VIENE. La migracion anterior le puso a cada factura a quien se le reclama
-- (`financiador_tipo` y `financiador_nombre`), pero no habia de donde sacarlo: la factura se
-- genera sola una vez por mes y nadie esta ahi para escribirlo factura por factura. El dato es de
-- el Cliente —con ella se acordo quien paga— y cambia poco, asi que vive en su ficha y cada
-- factura se lo lleva escrito el dia que se genera.
--
-- POR QUE SE COPIA Y NO SE MIRA LA FICHA. Una factura emitida no cambia. Si manana esa Cliente
-- pasa a pagar por si misma, las facturas viejas tienen que seguir diciendo a quien se le
-- reclamaron, porque es lo que se reclamo. Mirar la ficha haria que el pasado cambiara solo.
--
-- VACIO QUIERE DECIR LA CLIENTE. Es lo corriente y no hay que configurarlo. La obra social o un
-- tercero se cargan cuando los hay.
--
-- EL NOMBRE ES TEXTO Y NO SE INTERPRETA. El padron de obras sociales cambia de pais en pais y el
-- producto no conoce ninguno.
-- ---------------------------------------------------------------------------

BEGIN;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS financiador_tipo text,
  ADD COLUMN IF NOT EXISTS financiador_nombre text;

ALTER TABLE public.clientes
  DROP CONSTRAINT IF EXISTS clientes_financiador_conocido;

ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_financiador_conocido
  CHECK (financiador_tipo IS NULL
         OR financiador_tipo IN ('cliente', 'obra_social', 'otro'));

COMMENT ON COLUMN public.clientes.financiador_tipo IS
  'A quien se le reclama lo que se le factura a esta Cliente: cliente, obra_social u otro. Vacio quiere decir que se le reclama al Cliente, que es lo corriente. Cada factura se lleva este dato copiado el dia que se genera.';

COMMENT ON COLUMN public.clientes.financiador_nombre IS
  'Como se llama quien paga, cuando no es el Cliente. Texto, porque el padron de obras sociales cambia de pais en pais.';

-- ---------------------------------------------------------------------------
-- Y la pantalla de saldos tiene que poder mostrarlo
--
-- La vista se vuelve a declarar entera con las dos columnas nuevas al final. Es la misma resta de
-- siempre: no se toca ni un termino. Lo que se agrega es de quien es esa deuda.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.saldos_cliente WITH (security_invoker = true) AS
SELECT
  f.id AS factura_id,
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
  public.monto_a_cobrar_de_factura(f.monto_total, f.monto_facturado, f.id) AS monto_a_cobrar,
  r.cobrado,
  (public.monto_a_cobrar_de_factura(f.monto_total, f.monto_facturado, f.id) - r.cobrado)::numeric(12, 2) AS saldo,
  public.estado_de_factura(
    public.monto_a_cobrar_de_factura(f.monto_total, f.monto_facturado, f.id),
    r.cobrado,
    f.fecha_vencimiento
  ) AS estado,
  f.estado AS estado_guardado,
  f.fecha_emision,
  f.fecha_vencimiento,
  r.cobros_contados,
  r.ultimo_cobro_fecha,
  r.origenes,
  f.updated_at AS actualizado_en,

  -- A quien se le reclama esta factura, tal como quedo escrito el dia que se genero.
  f.financiador_tipo,
  f.financiador_nombre
FROM public.facturas_cliente f
CROSS JOIN LATERAL public.resumen_cobros_de_factura(f.id) r
CROSS JOIN LATERAL public.correcciones_de_factura(f.id) co;

COMMENT ON VIEW public.saldos_cliente IS
  'El saldo de cada factura de Cliente: lo que se le reclama menos lo cobrado, con el estado calculado, a quien se le reclama, de que origenes salio el dato y cuando se actualizo. Unico punto de verdad de esa resta.';

GRANT SELECT ON TABLE public.saldos_cliente TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- La comprobacion de que quedo como se queria
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  faltantes text;
BEGIN
  SELECT string_agg(c.nombre, ', ')
    INTO faltantes
    FROM (VALUES ('financiador_tipo'), ('financiador_nombre')) AS c(nombre)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'clientes'
        AND column_name = c.nombre
   );

  IF faltantes IS NOT NULL THEN
    RAISE EXCEPTION 'Faltan columnas en clientes: %', faltantes;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'saldos_cliente'
       AND column_name = 'financiador_tipo'
  ) THEN
    RAISE EXCEPTION 'La vista saldos_cliente no quedo con el financiador';
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
