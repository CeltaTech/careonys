-- «Reporte Diario» pasa a decirse «Reporte» en los avisos al celular.
--
-- Cada fila cambia sólo donde todavía dice el texto de origen: lo que una Prestadora haya
-- cambiado por su cuenta queda como ella lo dejó.

BEGIN;

UPDATE public.mensajes_del_sistema
   SET i18n = '{"es-AR": "Reporte", "en": "Report", "pt-BR": "Relatório"}'::jsonb
 WHERE clave = 'recordatorio_del_reporte_diario.titulo'
   AND i18n = '{"es-AR": "Reporte Diario", "en": "Daily Report", "pt-BR": "Relatório Diário"}'::jsonb;

UPDATE public.mensajes_del_sistema
   SET i18n = '{"es-AR": "Presente el Reporte antes de terminar el turno.", "en": "Submit your Report before your shift ends.", "pt-BR": "Apresente o Relatório antes de terminar o plantão."}'::jsonb
 WHERE clave = 'recordatorio_del_reporte_diario.cuerpo'
   AND i18n = '{"es-AR": "Presente el Reporte Diario antes de terminar el turno.", "en": "Submit your Daily Report before your shift ends.", "pt-BR": "Apresente o Relatório Diário antes de terminar o plantão."}'::jsonb;

UPDATE public.mensajes_del_sistema
   SET i18n = '{"es-AR": "Reporte pendiente", "en": "Report pending", "pt-BR": "Relatório pendente"}'::jsonb
 WHERE clave = 'reporte_diario_pendiente.titulo'
   AND i18n = '{"es-AR": "Reporte Diario pendiente", "en": "Daily Report pending", "pt-BR": "Relatório Diário pendente"}'::jsonb;

UPDATE public.mensajes_del_sistema
   SET i18n = '{"es-AR": "Reporte disponible", "en": "Report available", "pt-BR": "Relatório disponível"}'::jsonb
 WHERE clave = 'reporte_disponible.titulo'
   AND i18n = '{"es-AR": "Reporte diario disponible", "en": "Daily report available", "pt-BR": "Relatório diário disponível"}'::jsonb;

COMMIT;

NOTIFY pgrst, 'reload schema';
