-- Los avisos del turno fijo y del reemplazo durante una ausencia.
--
-- Se asignan como el turno de un día: al Asistente le llega que tiene algo para responder, y al que
-- tenía el turno fijo, que ya no es suyo. Los días de la semana se nombran con la conjunción del
-- idioma.

insert into public.mensajes_del_sistema (clave, i18n)
values ('comun.dia_lunes', '{"es-AR": "lunes", "en": "Monday", "pt-BR": "segunda-feira"}'::jsonb),
       ('comun.dia_martes', '{"es-AR": "martes", "en": "Tuesday", "pt-BR": "terça-feira"}'::jsonb),
       ('comun.dia_miercoles', '{"es-AR": "miércoles", "en": "Wednesday", "pt-BR": "quarta-feira"}'::jsonb),
       ('comun.dia_jueves', '{"es-AR": "jueves", "en": "Thursday", "pt-BR": "quinta-feira"}'::jsonb),
       ('comun.dia_viernes', '{"es-AR": "viernes", "en": "Friday", "pt-BR": "sexta-feira"}'::jsonb),
       ('comun.dia_sabado', '{"es-AR": "sábado", "en": "Saturday", "pt-BR": "sábado"}'::jsonb),
       ('comun.dia_domingo', '{"es-AR": "domingo", "en": "Sunday", "pt-BR": "domingo"}'::jsonb),
       ('turno_fijo_para_responder.titulo', '{"es-AR": "Turno fijo asignado", "en": "Recurring shift assigned", "pt-BR": "Plantão fixo atribuído"}'::jsonb),
       ('turno_fijo_para_responder.cuerpo', '{"es-AR": "Tiene un turno fijo asignado: {{dias}}, de {{horaInicio}} a {{horaFin}}. Acepte o rechace la propuesta.", "en": "You have a recurring shift assigned: {{dias}}, from {{horaInicio}} to {{horaFin}}. Accept or decline the offer.", "pt-BR": "Você tem um plantão fixo atribuído: {{dias}}, das {{horaInicio}} às {{horaFin}}. Aceite ou recuse a proposta."}'::jsonb),
       ('turno_fijo_retirado.titulo', '{"es-AR": "Turno fijo retirado", "en": "Recurring shift withdrawn", "pt-BR": "Plantão fixo retirado"}'::jsonb),
       ('turno_fijo_retirado.cuerpo', '{"es-AR": "Ya no tiene asignado el turno fijo de los {{dias}}, de {{horaInicio}} a {{horaFin}}.", "en": "The recurring shift on {{dias}}, from {{horaInicio}} to {{horaFin}}, is no longer assigned to you.", "pt-BR": "O plantão fixo de {{dias}}, das {{horaInicio}} às {{horaFin}}, não está mais atribuído a você."}'::jsonb),
       ('reemplazo_para_responder.titulo', '{"es-AR": "Reemplazo asignado", "en": "Replacement assigned", "pt-BR": "Substituição atribuída"}'::jsonb),
       ('reemplazo_para_responder.cuerpo', '{"es-AR": "Tiene asignado un reemplazo del {{desde}} al {{hasta}}. Acepte o rechace la propuesta.", "en": "You have a replacement assigned from {{desde}} to {{hasta}}. Accept or decline the offer.", "pt-BR": "Você tem uma substituição atribuída de {{desde}} a {{hasta}}. Aceite ou recuse a proposta."}'::jsonb),
       ('reemplazo_para_responder.cuerpo_sin_fin', '{"es-AR": "Tiene asignado un reemplazo a partir del {{desde}}. Acepte o rechace la propuesta.", "en": "You have a replacement assigned starting {{desde}}. Accept or decline the offer.", "pt-BR": "Você tem uma substituição atribuída a partir do dia {{desde}}. Aceite ou recuse a proposta."}'::jsonb);

NOTIFY pgrst, 'reload schema';
