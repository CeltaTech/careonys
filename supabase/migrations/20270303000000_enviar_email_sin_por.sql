-- El botón que manda el documento dice «Enviar email». Sólo cambia el texto de fábrica: el que una
-- Organización haya puesto para sí sigue siendo suyo.

BEGIN;

UPDATE public.mensajes_del_sistema
SET i18n = '{"es-AR": "Enviar email", "en": "Send email", "pt-BR": "Enviar e-mail"}'::jsonb
WHERE prestadora_id IS NULL
  AND clave = 'documento_para_firmar.enviar';

COMMIT;

NOTIFY pgrst, 'reload schema';
