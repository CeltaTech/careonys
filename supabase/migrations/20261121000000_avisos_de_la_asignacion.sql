-- Los avisos de la asignación de un turno desde el Panel.
--
-- Al Asistente al que se le asigna: que tiene un turno para responder. Al que lo tenía, aceptado o
-- esperando respuesta: que ya no es suyo. Y al Cliente, cuando el nuevo acepta: quién deja de ir y
-- quién lo reemplaza.

insert into public.mensajes_del_sistema (clave, i18n)
values ('turno_para_responder.titulo', '{"es-AR": "Turno asignado", "en": "Shift assigned", "pt-BR": "Plantão atribuído"}'::jsonb),
       ('turno_para_responder.cuerpo', '{"es-AR": "Tiene un turno asignado para el {{fecha}}, de {{horaInicio}} a {{horaFin}}. Acepte o rechace la propuesta.", "en": "You have a shift assigned for {{fecha}}, from {{horaInicio}} to {{horaFin}}. Accept or decline the offer.", "pt-BR": "Você tem um plantão atribuído para o dia {{fecha}}, das {{horaInicio}} às {{horaFin}}. Aceite ou recuse a proposta."}'::jsonb),
       ('turno_retirado.titulo', '{"es-AR": "Turno retirado", "en": "Shift withdrawn", "pt-BR": "Plantão retirado"}'::jsonb),
       ('turno_retirado.cuerpo', '{"es-AR": "Ya no tiene asignado el turno del {{fecha}}, de {{horaInicio}} a {{horaFin}}.", "en": "The shift on {{fecha}}, from {{horaInicio}} to {{horaFin}}, is no longer assigned to you.", "pt-BR": "O plantão do dia {{fecha}}, das {{horaInicio}} às {{horaFin}}, não está mais atribuído a você."}'::jsonb),
       ('cambio_de_asistente_cliente.reemplaza_uno', '{"es-AR": "{{nuevo}} reemplaza a {{anterior}} en la guardia del {{fecha}}, de {{horaInicio}} a {{horaFin}}.", "en": "{{nuevo}} replaces {{anterior}} on the shift of {{fecha}}, from {{horaInicio}} to {{horaFin}}.", "pt-BR": "{{nuevo}} substitui {{anterior}} no plantão do dia {{fecha}}, das {{horaInicio}} às {{horaFin}}."}'::jsonb),
       ('cambio_de_asistente_cliente.reemplaza_varios', '{"es-AR": "{{nuevo}} reemplaza a {{anterior}} en {{cuantas}} guardias a partir del {{fecha}}.", "en": "{{nuevo}} replaces {{anterior}} on {{cuantas}} shifts starting {{fecha}}.", "pt-BR": "{{nuevo}} substitui {{anterior}} em {{cuantas}} plantões a partir do dia {{fecha}}."}'::jsonb);

NOTIFY pgrst, 'reload schema';
