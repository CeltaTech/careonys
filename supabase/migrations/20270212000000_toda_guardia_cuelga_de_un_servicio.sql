-- Toda guardia y toda serie cuelgan de un Servicio, y la base no deja guardarlas sin él.
--
-- `interno.atiende_al_paciente`, que decide quién ve la información de salud de un Paciente, busca
-- quién lo atiende por las guardias y las series de un Servicio vigente. Una guardia sin Servicio no
-- entraba en esa cuenta: quien la tenía asignada quedaba sin ver a su Paciente. No hay ninguna así,
-- y todos los caminos de alta ponen el Servicio —el Panel, la generación nocturna de las series por
-- el disparador `trg_servicio_de_la_serie` y `mover_turno_a_otro_paciente`—, así que se cierra la
-- columna y deja de poder pasar.

BEGIN;

ALTER TABLE public.guardias ALTER COLUMN servicio_id SET NOT NULL;
ALTER TABLE public.series_guardias ALTER COLUMN servicio_id SET NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
