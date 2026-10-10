-- «Financiador» es palabra retirada del glosario: quien asume la obligación de pagar es el
-- Pagador. Sale también de lo guardado, así que se renombran las columnas, la vista que las
-- muestra, las restricciones y los comentarios. Los valores guardados no cambian.

begin;

alter table public.clientes rename column financiador_tipo to pagador_tipo;
alter table public.clientes rename constraint clientes_financiador_conocido to clientes_pagador_conocido;

alter table public.facturas_cliente rename column financiador_tipo to pagador_tipo;
alter table public.facturas_cliente rename column financiador_nombre to pagador_nombre;
alter table public.facturas_cliente rename constraint facturas_cliente_financiador_conocido to facturas_cliente_pagador_conocido;

alter table public.tipos_documento_pagador rename column financiador_tipo to pagador_tipo;

alter view public.saldos_cliente rename column financiador_tipo to pagador_tipo;
alter view public.saldos_cliente rename column financiador_nombre to pagador_nombre;

comment on column public.clientes.pagador_tipo is
  'A quien se le reclama lo que se le factura a este Cliente: cliente, obra_social u otro. Vacio quiere decir que se le reclama al Cliente, que es lo corriente. Cada factura se lleva este dato copiado el dia que se genera.';
comment on column public.facturas_cliente.pagador_tipo is
  'A quien se le reclama esta factura: cliente, obra_social u otro. Vacio quiere decir que se le reclama al Cliente, que es lo corriente.';
comment on column public.facturas_cliente.pagador_nombre is
  'Como se llama quien paga, cuando no es el Cliente. Texto, porque el padron de obras sociales cambia de pais en pais.';
comment on table public.tipos_documento_pagador is
  'Que papeles exige cada Pagador para aceptar la obligacion de pagar. Lo arma cada Prestadora; el producto no siembra ninguno.';
comment on table public.documentos_pagador is
  'Los papeles que el Pagador exigio para esta contratacion, cargados. Uno por Cliente y por tipo.';

commit;

NOTIFY pgrst, 'reload schema';
