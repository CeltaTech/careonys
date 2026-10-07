-- Un teléfono de un Legajo que nadie atiende no se borra: queda fuera de uso.
--
-- Que no atiendan no prueba que el número esté mal. Se lo marca, deja de ser el preferido para
-- llamar y queda en el Legajo, y se lo puede restaurar. Borrarlo sigue existiendo, a mano, para
-- cuando hay certeza de que el número está mal; nunca es automático.
--
-- Vacío es en uso. La fecha dice desde cuándo no se usa.
--
-- Sin políticas nuevas: marcar y restaurar son una corrección, y ya la cubre
-- `los_telefonos_los_corrige_quien_puede`. El permiso de tabla de `authenticated` es para la tabla
-- entera, así que alcanza a la columna nueva.

alter table public.telefonos_del_legajo
  add column fuera_de_uso_at timestamptz;

NOTIFY pgrst, 'reload schema';
