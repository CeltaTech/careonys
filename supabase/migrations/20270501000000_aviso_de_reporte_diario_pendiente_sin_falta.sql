-- El título del aviso al celular cuando el Asistente se fue sin presentar el Reporte Diario.
--
-- «Falta» se lee como que la persona no fue a trabajar. El título vuelve a decir que el reporte
-- está pendiente. Cambia sólo donde todavía dice el texto de origen: lo que una Prestadora haya
-- cambiado por su cuenta queda como ella lo dejó.

BEGIN;

UPDATE public.mensajes_del_sistema
   SET i18n = '{"es-AR": "Reporte Diario pendiente", "en": "Daily Report pending", "pt-BR": "Relatório Diário pendente"}'::jsonb
 WHERE clave = 'reporte_diario_pendiente.titulo'
   AND i18n = '{"es-AR": "Falta su Reporte Diario", "en": "Your Daily Report is missing", "pt-BR": "Falta seu Relatório Diário"}'::jsonb;

COMMIT;

NOTIFY pgrst, 'reload schema';
