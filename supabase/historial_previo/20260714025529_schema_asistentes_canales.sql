ALTER TABLE asistentes ADD COLUMN canales TEXT[] NOT NULL DEFAULT ARRAY['directo','match'];

ALTER TABLE asistentes ADD COLUMN motivo_exclusion_directo TEXT;
ALTER TABLE asistentes ADD COLUMN motivo_exclusion_match TEXT;

ALTER TABLE asistentes ADD CONSTRAINT asistentes_canales_valido
  CHECK (canales <@ ARRAY['directo','match']::TEXT[] AND array_length(canales, 1) > 0);

NOTIFY pgrst, 'reload schema';
;
