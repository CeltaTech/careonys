-- El aviso del plazo vencido para aceptar la ubicación durante el turno.
--
-- Cuando la Prestadora pasa a «Viaje y turno» y un Asistente deja vencer el plazo sin aceptar, se
-- le avisa a la Prestadora, una vez por Asistente, y ella decide. Lo arma `avisos.js` con el evento
-- `plazo_ubicacion_sin_aceptar`; el texto lleva el nombre y los días del plazo, con su forma en
-- singular para cuando el plazo es de un día.

BEGIN;

INSERT INTO public.mensajes_del_sistema (clave, i18n, admite_texto_propio, activo) VALUES
  ('plazo_ubicacion_sin_aceptar.asunto',
   '{"es-AR": "{{nombre}} no aceptó el registro de su ubicación", "en": "{{nombre}} did not accept the recording of their location", "pt-BR": "{{nombre}} não aceitou o registro da sua localização"}'::jsonb,
   true, true),
  ('plazo_ubicacion_sin_aceptar.texto',
   '{"es-AR": "Venció el plazo de {{dias}} días y {{nombre}} no aceptó el registro de su ubicación durante el turno de guardia.", "en": "The period of {{dias}} days expired and {{nombre}} did not accept the recording of their location during the shift.", "pt-BR": "Venceu o prazo de {{dias}} dias e {{nombre}} não aceitou o registro da sua localização durante o turno de plantão."}'::jsonb,
   true, true),
  ('plazo_ubicacion_sin_aceptar.texto_uno',
   '{"es-AR": "Venció el plazo de {{dias}} día y {{nombre}} no aceptó el registro de su ubicación durante el turno de guardia.", "en": "The period of {{dias}} day expired and {{nombre}} did not accept the recording of their location during the shift.", "pt-BR": "Venceu o prazo de {{dias}} dia e {{nombre}} não aceitou o registro da sua localização durante o turno de plantão."}'::jsonb,
   true, true);

COMMIT;

NOTIFY pgrst, 'reload schema';
