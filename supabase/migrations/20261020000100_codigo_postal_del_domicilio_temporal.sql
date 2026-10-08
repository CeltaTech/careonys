-- El domicilio temporal del Paciente lleva las mismas partes que el permanente, y el código postal
-- es una de ellas. Se cargan con el mismo casillero y se guardan con la misma función: si esta
-- tabla no tuviera la columna, guardar un domicilio temporal fallaría.

alter table public.domicilios_temporales_paciente add column if not exists codigo_postal text;

notify pgrst, 'reload schema';
