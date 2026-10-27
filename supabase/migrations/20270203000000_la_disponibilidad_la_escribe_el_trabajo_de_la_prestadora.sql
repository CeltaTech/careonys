-- El Asistente prende y apaga su disponibilidad desde la aplicación. No tiene permiso para corregir
-- su propio Legajo, así que el backend escribe esas dos columnas con el trabajo de su Prestadora,
-- que la política `trabajo_sin_persona_de_esta_prestadora` ya acota a ella. Se dan sólo esas dos
-- columnas: el resto del Legajo sigue sin poder escribirse por este camino.

GRANT UPDATE (disponible, disponibilidad_cambiada_en) ON public.asistentes TO trabajo_sin_persona;

NOTIFY pgrst, 'reload schema';
