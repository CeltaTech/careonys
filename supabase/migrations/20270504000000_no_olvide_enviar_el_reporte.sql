-- El recordatorio que recibe el Asistente antes del fin del turno dice «No olvide enviar el Reporte
-- al finalizar su turno.».
--
-- La fila cambia sólo donde todavía dice el texto de origen: lo que una Prestadora haya cambiado
-- por su cuenta queda como ella lo dejó.

BEGIN;

UPDATE public.mensajes_del_sistema
   SET i18n = '{"es-AR": "No olvide enviar el Reporte al finalizar su turno.", "en": "Remember to send your Report at the end of your shift.", "pt-BR": "Não se esqueça de enviar o Relatório ao finalizar o seu plantão."}'::jsonb
 WHERE clave = 'recordatorio_del_reporte.cuerpo'
   AND i18n = '{"es-AR": "Presente el Reporte antes de terminar el turno.", "en": "Submit your Report before your shift ends.", "pt-BR": "Apresente o Relatório antes de terminar o plantão."}'::jsonb;

COMMIT;

NOTIFY pgrst, 'reload schema';
