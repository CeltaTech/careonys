-- El detalle de las horas de cada liquidación del Asistente.
--
-- Las horas que se pagan son las trabajadas: salen de la llegada y el cierre que marcó el
-- Asistente en cada turno de guardia. Cada liquidación guarda, turno por turno, el horario
-- programado, las dos marcas y las horas que se contaron, tal como estaban el día que se generó.
-- Así se puede ver de dónde salió cada hora aunque después alguien corrija una marca.
--
-- La columna vive en la misma fila de la liquidación, así que la protegen las mismas reglas de
-- acceso que ya tiene la tabla.

alter table public.liquidaciones_asistente
  add column if not exists detalle_horas jsonb not null default '[]'::jsonb;

comment on column public.liquidaciones_asistente.detalle_horas is
  'Un renglón por turno de guardia cerrado del período: fecha, horario programado, llegada, cierre, minutos normales, minutos extra y si le faltaba una marca.';

NOTIFY pgrst, 'reload schema';
