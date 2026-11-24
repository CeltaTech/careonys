-- El aviso del Reporte pendiente, en voz activa y en imperativo, sin «por favor».
-- Sólo cambia el texto de fábrica: si una Prestadora ya lo había cambiado, queda el suyo.
BEGIN;
UPDATE public.mensajes_del_sistema
   SET i18n = '{"es-AR": "No envió el Reporte de su turno de guardia del día {{fecha}}. Envíelo a la brevedad.", "en": "You did not send the Report for your guard shift on {{fecha}}. Send it as soon as possible.", "pt-BR": "Você não enviou o Relatório do seu turno de plantão do dia {{fecha}}. Envie-o o quanto antes."}'::jsonb
 WHERE clave = 'reporte_pendiente.cuerpo'
   AND i18n = '{"es-AR": "El Reporte correspondiente a su turno de guardia del día {{fecha}} no ha sido enviado. Por favor, hágalo a la brevedad.", "en": "The Report for your guard shift on {{fecha}} has not been sent. Please send it as soon as possible.", "pt-BR": "O Relatório do seu turno de plantão do dia {{fecha}} não foi enviado. Por favor, envie-o o quanto antes."}'::jsonb;
COMMIT;
NOTIFY pgrst, 'reload schema';
