-- El aviso del Reporte pendiente dice de qué turno de guardia es, con su fecha.
-- Sólo cambia el texto de fábrica: si una Prestadora ya lo había cambiado, queda el suyo.
BEGIN;
UPDATE public.mensajes_del_sistema
   SET i18n = '{"es-AR": "El Reporte correspondiente a su turno de guardia del día {{fecha}} no ha sido enviado. Por favor, hágalo a la brevedad.", "en": "The Report for your guard shift on {{fecha}} has not been sent. Please send it as soon as possible.", "pt-BR": "O Relatório do seu turno de plantão do dia {{fecha}} não foi enviado. Por favor, envie-o o quanto antes."}'::jsonb
 WHERE clave = 'reporte_pendiente.cuerpo'
   AND i18n = '{"es-AR": "Preséntelo cuanto antes desde la aplicación.", "en": "Submit it from the app as soon as you can.", "pt-BR": "Apresente-o pelo aplicativo o quanto antes."}'::jsonb;
COMMIT;
NOTIFY pgrst, 'reload schema';
