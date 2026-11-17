-- =============================================================================
-- Los avisos de llegada y de reporte salen del catálogo
-- =============================================================================
--
-- QUÉ HACE
--   Siembra las cuatro frases de los dos avisos que recibe el Cliente en el
--   celular: cuando el Asistente llega al domicilio y cuando el reporte diario
--   queda listo. Hasta ahora esas frases estaban escritas en castellano adentro
--   del backend, así que salían en un solo idioma y ninguna Prestadora podía
--   cambiarlas. El texto en castellano es el mismo que ya salía.
--
-- QUÉ NO CAMBIA
--   El backend lee los mensajes una sola vez, al arrancar: el que está
--   corriendo sigue mandando el texto escrito a mano hasta que se despliega el
--   que pide estas claves.
-- =============================================================================

BEGIN;

INSERT INTO public.mensajes_del_sistema (clave, i18n, admite_texto_propio, activo) VALUES
  ('llegada_del_asistente.titulo', '{"es-AR": "Llegó el Asistente", "en": "The Assistant has arrived", "pt-BR": "O Assistente chegou"}'::jsonb, true, true),
  ('llegada_del_asistente.cuerpo', '{"es-AR": "{{asistente}} llegó al domicilio de {{paciente}}.", "en": "{{asistente}} has arrived at the home of {{paciente}}.", "pt-BR": "{{asistente}} chegou ao domicílio de {{paciente}}."}'::jsonb, true, true),
  ('reporte_disponible.titulo', '{"es-AR": "Reporte diario disponible", "en": "Daily report available", "pt-BR": "Relatório diário disponível"}'::jsonb, true, true),
  ('reporte_disponible.cuerpo', '{"es-AR": "Ya está listo el reporte de la guardia de {{paciente}}.", "en": "The shift report for {{paciente}} is ready.", "pt-BR": "O relatório do plantão de {{paciente}} está pronto."}'::jsonb, true, true);

COMMIT;

NOTIFY pgrst, 'reload schema';
