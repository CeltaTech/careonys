-- El interruptor que mueve el Asistente desde su aplicación se llama «Disponible». Los turnos de
-- guardia se asignan, no se ofrecen, así que el nombre guardado tampoco habla de ofertas.

ALTER TABLE public.asistentes RENAME COLUMN disponible_para_ofertas TO disponible;

COMMENT ON COLUMN public.asistentes.disponible IS 'Lo decide el Asistente desde su aplicacion, no la Prestadora. En false, el aviso automatico de relevo no le escribe y en la lista de candidatos queda con su motivo. No cambia ningun turno ya asignado. Distinto de asistentes.estado, que es la decision administrativa de la Prestadora.';

NOTIFY pgrst, 'reload schema';
