-- Los dos correos de la entrevista con la redacción que aprobó el Desarrollador: lo que se
-- habilita antes de la hora es el acceso. Sólo cambia la versión general; el texto propio que haya
-- cargado una Prestadora no se toca.

UPDATE public.mensajes_del_sistema m
SET i18n = v.i18n
FROM (values
  ('entrevista_agendada.cuerpo', '{"es-AR": "Su entrevista está agendada para el {{cuando}}.\n\nEl día de la entrevista, ingrese por este enlace:\n{{enlace}}\n\nEl acceso se habilita {{anticipo}} minutos antes de la hora. No necesita instalar nada ni crear una cuenta.", "en": "Your interview is scheduled for {{cuando}}.\n\nOn the day of the interview, join through this link:\n{{enlace}}\n\nAccess opens {{anticipo}} minutes before the start time. You do not need to install anything or create an account.", "pt-BR": "Sua entrevista está marcada para {{cuando}}.\n\nNo dia da entrevista, entre por este link:\n{{enlace}}\n\nO acesso é liberado {{anticipo}} minutos antes do horário. Não é necessário instalar nada nem criar uma conta."}'::jsonb),
  ('entrevista_reprogramada.cuerpo', '{"es-AR": "Su entrevista está agendada para el {{cuando}}.\n\nIngrese por el mismo enlace de siempre:\n{{enlace}}\n\nEl acceso se habilita {{anticipo}} minutos antes de la hora.", "en": "Your interview is scheduled for {{cuando}}.\n\nJoin through the same link as before:\n{{enlace}}\n\nAccess opens {{anticipo}} minutes before the start time.", "pt-BR": "Sua entrevista está marcada para {{cuando}}.\n\nEntre pelo mesmo link de sempre:\n{{enlace}}\n\nO acesso é liberado {{anticipo}} minutos antes do horário."}'::jsonb)
) AS v(clave, i18n)
WHERE m.clave = v.clave AND m.prestadora_id IS NULL;

NOTIFY pgrst, 'reload schema';
