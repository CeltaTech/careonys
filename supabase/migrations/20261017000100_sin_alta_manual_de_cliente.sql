-- Ya no hay alta suelta de Clientes: el Cliente llega por un presupuesto aprobado o, la cartera
-- previa, por la importación. El permiso que habilitaba el alta a mano queda sin nada que habilitar
-- y sale del catálogo. Ninguna Prestadora lo tenía configurado.

delete from public.permisos_prestadora where accion = 'alta_manual_cliente';
delete from public.catalogo_acciones_permisos where accion = 'alta_manual_cliente';

NOTIFY pgrst, 'reload schema';
