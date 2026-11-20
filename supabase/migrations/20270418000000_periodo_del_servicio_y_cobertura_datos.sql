-- Prepara los datos para el período del Servicio, la forma de la internación y el alcance de la
-- cancelación.
-- ==================================================================================
--
-- Qué hace:
--
-- 1. Cada Servicio pasa a tener período: el primer día y el último. Para los Servicios que ya
--    existen, el primer día es el más temprano entre el día en que se creó, el comienzo de sus
--    Prestaciones, el de sus turnos de guardia recurrentes y la fecha de sus turnos de guardia.
--    Los Servicios dados de baja reciben como último día el de su baja. Los vigentes quedan sin
--    último día, que es la duración indeterminada.
-- 2. Cada internación pasa a decir qué pasa con el Servicio mientras dura. La que tiene domicilio
--    temporal en la institución muda el Servicio; la que no, lo suspende.
-- 3. El alcance de la cancelación de un turno de guardia deja de ser parcial o total y pasa a
--    nombrar qué se canceló: el Servicio, una Prestación, un turno de guardia recurrente o un solo
--    turno de guardia. La cancelación total era la de la baja del Servicio; la parcial, la de un
--    solo turno de guardia.
--
-- Por qué: la migración que sigue, que sale de comparar la estructura, exige estos datos ya
-- cargados para poner las columnas como obligatorias y las reglas nuevas.

BEGIN;

ALTER TABLE public.servicios ADD COLUMN IF NOT EXISTS vigente_desde date;
ALTER TABLE public.servicios ADD COLUMN IF NOT EXISTS vigente_hasta date;

UPDATE public.servicios s
   SET vigente_desde = least(
         (s.created_at AT TIME ZONE interno.zona_horaria_de_la_prestadora(s.prestadora_id))::date,
         (SELECT min(p.vigente_desde) FROM public.prestaciones p WHERE p.servicio_id = s.id),
         (SELECT min(r.vigente_desde) FROM public.series_turnos_guardia r WHERE r.servicio_id = s.id),
         (SELECT min(t.fecha) FROM public.turnos_guardia t WHERE t.servicio_id = s.id))
 WHERE s.vigente_desde IS NULL;

UPDATE public.servicios s
   SET vigente_hasta = greatest(s.vigente_desde, coalesce(
         (SELECT (max(b.created_at) AT TIME ZONE interno.zona_horaria_de_la_prestadora(s.prestadora_id))::date
            FROM public.bajas_de_servicio b WHERE b.servicio_id = s.id),
         (SELECT max(p.vigente_hasta) FROM public.prestaciones p WHERE p.servicio_id = s.id),
         (now() AT TIME ZONE interno.zona_horaria_de_la_prestadora(s.prestadora_id))::date))
 WHERE s.estado = 'de_baja' AND s.vigente_hasta IS NULL;

ALTER TABLE public.hospitalizaciones_paciente ADD COLUMN IF NOT EXISTS forma text;

-- La información de salud se escribe con la marca de lectura anotada.
SELECT set_config('careonys.lectura_de_salud', 'anotada', true);
UPDATE public.hospitalizaciones_paciente h
   SET forma = CASE WHEN EXISTS (SELECT 1 FROM public.domicilios_temporales_paciente d
                                  WHERE d.hospitalizacion_id = h.id)
                    THEN 'muda' ELSE 'suspende' END
 WHERE h.forma IS NULL;
SELECT set_config('careonys.lectura_de_salud', '', true);

ALTER TABLE public.turnos_guardia DROP CONSTRAINT IF EXISTS turnos_guardia_cancelacion_alcance_check;
UPDATE public.turnos_guardia SET cancelacion_alcance = 'servicio' WHERE cancelacion_alcance = 'total';
UPDATE public.turnos_guardia SET cancelacion_alcance = 'turno_guardia' WHERE cancelacion_alcance = 'parcial';

COMMIT;
