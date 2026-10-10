-- La factura nombra al Cliente, no al Pagador. A quién se le reclama vive en la Ficha del
-- Cliente y se la consulta ahí; copiarlo en cada factura lo guardaba dos veces. Salen las dos
-- columnas copiadas y su restricción, y la vista de saldos se rehace sin ellas, con las mismas
-- opciones y los mismos permisos.

begin;

drop view public.saldos_cliente;

alter table public.facturas_cliente drop constraint facturas_cliente_pagador_conocido;
alter table public.facturas_cliente drop column pagador_tipo;
alter table public.facturas_cliente drop column pagador_nombre;

create view public.saldos_cliente
  with (security_invoker = true) as
select f.id as factura_id,
       f.prestadora_id,
       f.cliente_id,
       f.periodo,
       f.moneda,
       f.monto_total,
       f.monto_facturado,
       f.comprobante_tipo,
       f.comprobante_numero,
       f.facturado_at,
       co.neto as correcciones_neto,
       co.correcciones_contadas,
       public.monto_a_cobrar_de_factura(f.monto_total, f.monto_facturado, f.id) as monto_a_cobrar,
       r.cobrado,
       (public.monto_a_cobrar_de_factura(f.monto_total, f.monto_facturado, f.id) - r.cobrado)::numeric(12,2) as saldo,
       public.estado_de_factura(public.monto_a_cobrar_de_factura(f.monto_total, f.monto_facturado, f.id), r.cobrado, f.fecha_vencimiento) as estado,
       f.estado as estado_guardado,
       f.fecha_emision,
       f.fecha_vencimiento,
       r.cobros_contados,
       r.ultimo_cobro_fecha,
       r.origenes,
       f.updated_at as actualizado_en
  from public.facturas_cliente f
  cross join lateral public.resumen_cobros_de_factura(f.id) r(cobrado, cobros_contados, ultimo_cobro_fecha, origenes)
  cross join lateral public.correcciones_de_factura(f.id) co(neto, correcciones_contadas);

comment on view public.saldos_cliente is
  'El saldo de cada factura de Cliente: lo que se le reclama menos lo cobrado, con el estado calculado, de que origenes salio el dato y cuando se actualizo. Unico punto de verdad de esa resta.';

revoke all on public.saldos_cliente from public, anon;
grant all on public.saldos_cliente to authenticated, service_role;

commit;

NOTIFY pgrst, 'reload schema';
