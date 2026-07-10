-- Etapa 2 — Proceso de Incorporación de Asistentes (uso interno del Panel, ver glosario
-- de CLAUDE.md).
-- Conecta la postulación cruda (tabla "postulaciones", Etapa 1) con la cuenta real de
-- Asistente que se crea al iniciar la verificación (tablas "asistentes" y
-- "verificaciones_asistente", Etapa 2B).

ALTER TABLE postulaciones ADD COLUMN IF NOT EXISTS asistente_id UUID REFERENCES asistentes(id);
