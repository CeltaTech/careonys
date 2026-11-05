-- Quitar al Apoderado: un solo texto para el botón y la confirmación que aprobó el Desarrollador.
-- La confirmación no nombra a nadie, así que ya no lleva marcador.

UPDATE public.mensajes_del_sistema
SET i18n = '{"es-AR": "Quitar", "en": "Remove", "pt-BR": "Remover"}'
WHERE clave = 'apoderado.quitar' AND prestadora_id IS NULL;

UPDATE public.mensajes_del_sistema
SET i18n = '{"es-AR": "Está por remover una autorización, por favor, confirme.", "en": "You are about to remove an authorization, please confirm.", "pt-BR": "Você está prestes a remover uma autorização, por favor, confirme."}'
WHERE clave = 'apoderado.quitar_aviso' AND prestadora_id IS NULL;

DELETE FROM public.mensajes_del_sistema
WHERE clave = 'apoderado.quitar_confirmar' AND prestadora_id IS NULL;
