-- Documenta el estado real ya aplicado contra Supabase: la columna metros_tolerancia_checkin
-- de configuracion_ausencia_automatica se había cargado directo contra la base (usada desde
-- 2026-07-20 en backend/src/routes/appAsistentes.js) sin dejar un archivo de schema que la
-- reflejara. IF NOT EXISTS para que correr este archivo contra una base que ya la tiene
-- (producción) no falle.
ALTER TABLE configuracion_ausencia_automatica
  ADD COLUMN IF NOT EXISTS metros_tolerancia_checkin INTEGER NOT NULL DEFAULT 150;

NOTIFY pgrst, 'reload schema';
