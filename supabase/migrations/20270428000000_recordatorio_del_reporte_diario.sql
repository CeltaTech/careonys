-- El recordatorio del Reporte Diario antes del fin del turno de guardia.
--
-- Cuando faltan pocos minutos para que termine un turno de guardia y el Asistente todavía no
-- presentó el Reporte Diario, el sistema le manda un aviso al teléfono. Cuántos minutos antes
-- lo elige cada Prestadora; si nunca lo eligió, son 30. El número lo cambia sólo la
-- administración, desde la configuración del Panel.
--
-- El aviso sale una sola vez por turno de guardia. Para eso cada turno anota cuándo se mandó.

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- Cuántos minutos antes del fin se recuerda el Reporte Diario
-- ---------------------------------------------------------------------------------------------

ALTER TABLE public.prestadoras
  ADD COLUMN minutos_recordatorio_reporte_diario integer DEFAULT 30 NOT NULL,
  ADD CONSTRAINT prestadoras_minutos_recordatorio_reporte_diario_check
    CHECK (minutos_recordatorio_reporte_diario >= 5 AND minutos_recordatorio_reporte_diario <= 1440);

COMMENT ON COLUMN public.prestadoras.minutos_recordatorio_reporte_diario IS
  'Cuántos minutos antes del fin del turno de guardia se le recuerda al Asistente que presente el Reporte Diario. Entre 5 y 1440.';

-- La administración no escribe la tabla directo: el cambio lo guarda el backend con la
-- credencial del trabajo de esa Prestadora, que puede tocar sólo las columnas que se le dan.
GRANT UPDATE ("minutos_recordatorio_reporte_diario") ON TABLE public.prestadoras TO trabajo_sin_persona;

-- ---------------------------------------------------------------------------------------------
-- Cuándo se mandó el recordatorio en cada turno de guardia
-- ---------------------------------------------------------------------------------------------

ALTER TABLE public.turnos_guardia
  ADD COLUMN push_recordatorio_reporte_enviado_at timestamp with time zone;

COMMENT ON COLUMN public.turnos_guardia.push_recordatorio_reporte_enviado_at IS
  'Cuándo se le recordó al Asistente que presente el Reporte Diario de este turno de guardia. Vacío si todavía no se le recordó.';

-- ---------------------------------------------------------------------------------------------
-- El texto del aviso
-- ---------------------------------------------------------------------------------------------

INSERT INTO public.mensajes_del_sistema (clave, i18n, admite_texto_propio, activo) VALUES
  ('recordatorio_del_reporte_diario.titulo', '{"es-AR": "Reporte Diario", "en": "Daily Report", "pt-BR": "Relatório Diário"}'::jsonb, true, true),
  ('recordatorio_del_reporte_diario.cuerpo', '{"es-AR": "Presente el Reporte Diario antes del fin del turno de guardia.", "en": "Submit the Daily Report before the guard shift ends.", "pt-BR": "Apresente o Relatório Diário antes do fim do turno de plantão."}'::jsonb, true, true);

COMMIT;

NOTIFY pgrst, 'reload schema';
