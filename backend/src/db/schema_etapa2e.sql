-- Etapa 2 — Proceso de Incorporación de Asistentes (uso interno del Panel; ver nota de
-- CLAUDE.md 2026-07-08 sobre por qué esta pantalla no se llama "Filtro prestadora-original").
-- Conecta la postulación cruda (tabla "postulaciones", Etapa 1) con la cuenta real de
-- Asistente que se crea al iniciar la verificación (tablas "asistentes" y
-- "verificaciones_asistente", Etapa 2B).

ALTER TABLE postulaciones ADD COLUMN IF NOT EXISTS asistente_id UUID REFERENCES asistentes(id);
