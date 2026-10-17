-- Dos frases sembradas con la redacción que aprobó el Desarrollador: el correo de la entrevista
-- agendada y la línea del aviso grave por una guardia sin cerrar. Sólo cambia la versión general;
-- el texto propio que haya cargado una Prestadora no se toca.

UPDATE public.mensajes_del_sistema m
SET i18n = v.i18n
FROM (values
  ('entrevista_agendada.cuerpo', '{"es-AR": "Su entrevista está agendada para el {{cuando}}.\n\nEl día de la entrevista, ingrese por este enlace:\n{{enlace}}\n\nLa sala se abre {{anticipo}} minutos antes de la hora. No necesita instalar nada ni crear una cuenta.", "en": "Your interview is scheduled for {{cuando}}.\n\nOn the day of the interview, join through this link:\n{{enlace}}\n\nThe room opens {{anticipo}} minutes before the start time. You do not need to install anything or create an account.", "pt-BR": "Sua entrevista está marcada para {{cuando}}.\n\nNo dia da entrevista, entre por este link:\n{{enlace}}\n\nA sala abre {{anticipo}} minutos antes do horário. Não é necessário instalar nada nem criar uma conta."}'::jsonb),
  ('guardia_sin_cerrar_grave.hace_falta_autoridad', '{"es-AR": "El sistema avisó al Coordinador y la guardia sigue sin cerrarse. Intervenga para resolverlo.", "en": "The system notified the Coordinator and the shift is still not closed. Step in to resolve it.", "pt-BR": "O sistema avisou o Coordenador e o plantão continua sem ser encerrado. Intervenha para resolver."}'::jsonb)
) AS v(clave, i18n)
WHERE m.clave = v.clave AND m.prestadora_id IS NULL;

NOTIFY pgrst, 'reload schema';
