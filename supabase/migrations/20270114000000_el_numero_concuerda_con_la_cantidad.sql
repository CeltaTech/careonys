-- El número de la frase concuerda con la cantidad.
--
-- Los mensajes que llevan minutos o días que configura la Prestadora —o que salen de una cuenta—
-- decían «1 minutos» y «1 días» cuando la cantidad era uno. Cada uno suma su forma en singular,
-- con la misma clave y `_uno` al final, igual que `comun.asistente_uno`. `avisos.js` elige cuál va.
-- La redacción es la misma de la clave en plural; cambia sólo la concordancia.

BEGIN;

INSERT INTO public.mensajes_del_sistema (clave, i18n, admite_texto_propio, activo) VALUES
  ('comun.minutos_uno',
   '{"es-AR": "minuto", "en": "minute", "pt-BR": "minuto"}'::jsonb,
   false, true),
  ('activacion_cuenta.pie_de_aviso_uno',
   '{"es-AR": "El enlace vence en {{dias}} día. Si no esperaba este correo, puede ignorarlo.", "en": "The link expires in {{dias}} day. If you were not expecting this email, you can ignore it.", "pt-BR": "O link expira em {{dias}} dia. Se este e-mail não era esperado, pode ser ignorado."}'::jsonb,
   true, true),
  ('alerta_temprana_respaldo.demora_uno',
   '{"es-AR": "La alerta temprana sigue sin resolver hace {{minutos}} minuto.", "en": "The early warning has been unresolved for {{minutos}} minute.", "pt-BR": "O alerta antecipado continua sem resolver há {{minutos}} minuto."}'::jsonb,
   true, true),
  ('alerta_temprana_sin_resolver.detalle_uno',
   '{"es-AR": "Origen: {{origen}}. Motivo: {{motivo}}. Sin resolver hace {{minutos}} minuto.", "en": "Source: {{origen}}. Reason: {{motivo}}. Unresolved for {{minutos}} minute.", "pt-BR": "Origem: {{origen}}. Motivo: {{motivo}}. Sem resolver há {{minutos}} minuto."}'::jsonb,
   true, true),
  ('escalada_a_la_administracion.asunto_uno',
   '{"es-AR": "Sin resolver hace {{minutos}} minuto: pasa a la administración", "en": "Unresolved for {{minutos}} minute: passed to management", "pt-BR": "Sem resolver há {{minutos}} minuto: passa à administração"}'::jsonb,
   true, true),
  ('escalada_a_todos_los_coordinadores.asunto_uno',
   '{"es-AR": "Sin resolver hace {{minutos}} minuto: pasa a todos los Coordinadores", "en": "Unresolved for {{minutos}} minute: passed to every coordinator", "pt-BR": "Sem resolver há {{minutos}} minuto: passa a todos os Coordenadores"}'::jsonb,
   true, true),
  ('guardia_sin_cerrar_respaldo.texto_uno',
   '{"es-AR": "La guardia del {{fecha}}, de {{horaInicio}} a {{horaFin}}, sigue sin cerrarse {{minutos}} minuto después del plazo.", "en": "The shift on {{fecha}}, from {{horaInicio}} to {{horaFin}}, is still open {{minutos}} minute past the deadline.", "pt-BR": "O plantão de {{fecha}}, das {{horaInicio}} às {{horaFin}}, continua sem fechar {{minutos}} minuto depois do prazo."}'::jsonb,
   true, true),
  ('incidente_relevo_fase_automatica.sin_resolver_desde_uno',
   '{"es-AR": "Sin resolver hace más de {{minutosUmbral}} minuto.", "en": "Unresolved for more than {{minutosUmbral}} minute.", "pt-BR": "Sem resolver há mais de {{minutosUmbral}} minuto."}'::jsonb,
   true, true),
  ('incidente_relevo_respaldo.demora_uno',
   '{"es-AR": "El relevo sigue sin llegar hace {{minutos}} minuto.", "en": "The relief has still not arrived after {{minutos}} minute.", "pt-BR": "A rendição continua sem chegar há {{minutos}} minuto."}'::jsonb,
   true, true),
  ('incidente_relevo_sin_resolver.demora_uno',
   '{"es-AR": "El relevo sigue sin llegar hace {{minutos}} minuto.", "en": "The relief has still not arrived after {{minutos}} minute.", "pt-BR": "A rendição continua sem chegar há {{minutos}} minuto."}'::jsonb,
   true, true),
  ('vencimiento_documentos.encabezado_uno',
   '{"es-AR": "Estos Asistentes tienen {{etiqueta}} vencido o por vencer dentro de {{dias}} día:", "en": "These care workers have their {{etiqueta}} expired or expiring within {{dias}} day:", "pt-BR": "Estes Assistentes têm {{etiqueta}} vencido ou a vencer dentro de {{dias}} dia:"}'::jsonb,
   true, true);

COMMIT;

NOTIFY pgrst, 'reload schema';
