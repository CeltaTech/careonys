-- Guarda el idioma en el que el Postulante completó el formulario público, para que el
-- email de cambio de estado (panelNotificaciones.js) se le escriba en su propio idioma
-- en vez de siempre en español. Ver docs/PROGRESS.md, hallazgo de auditoría 2026-07-09.
ALTER TABLE postulaciones ADD COLUMN IF NOT EXISTS idioma text NOT NULL DEFAULT 'es-AR';
