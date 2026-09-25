-- Lo que manda el producto es un mensaje del sistema, y lo que encuentra el producto es una
-- alerta. «Aviso» queda para lo que avisa una persona.
--
-- Cuatro textos sembrados en `20261002180000_los_mensajes_del_sistema_se_editan_desde_afuera.sql`
-- usaban la palabra con otro sentido. Esa migración ya corrió y no se edita: se corrige acá.
--
-- Las claves no se tocan: `comun.aviso_repetido_*` y `alerta_temprana_guardia_familia.*` son
-- nombre guardado. Sólo cambia el valor, en los tres idiomas.
--
-- Y sólo el texto del producto: la fila de una Prestadora que escribió el suyo se deja como está.

UPDATE public.mensajes_del_sistema
SET i18n = '{"es-AR":"Es el mensaje número {{veces}} de esta misma guardia.","en":"This is message number {{veces}} for this same shift.","pt-BR":"É a mensagem número {{veces}} deste mesmo plantão."}'
WHERE clave = 'comun.aviso_repetido_guardia' AND prestadora_id IS NULL;

UPDATE public.mensajes_del_sistema
SET i18n = '{"es-AR":"Es el mensaje número {{veces}} de esta misma ausencia.","en":"This is message number {{veces}} for this same absence.","pt-BR":"É a mensagem número {{veces}} desta mesma ausência."}'
WHERE clave = 'comun.aviso_repetido_ausencia' AND prestadora_id IS NULL;

-- Acá lo pendiente es un hallazgo del propio producto, no algo que avisó alguien. El inglés ya
-- decía «alert»; el castellano y el portugués se le emparejan.
UPDATE public.mensajes_del_sistema
SET i18n = '{"es-AR":"Guardia con una alerta pendiente","en":"Shift with an open alert","pt-BR":"Plantão com um alerta pendente"}'
WHERE clave = 'alerta_temprana_guardia_familia.titulo' AND prestadora_id IS NULL;

UPDATE public.mensajes_del_sistema
SET i18n = '{"es-AR":"La guardia del {{fecha}}, de {{horaInicio}} a {{horaFin}}, para {{pacientes}} tiene una alerta pendiente de resolver. Ante cualquier duda, puede comunicarse con el Coordinador.","en":"The shift on {{fecha}}, from {{horaInicio}} to {{horaFin}}, for {{pacientes}} has an alert that is still open. If you have any questions, you can contact the coordinator.","pt-BR":"O plantão de {{fecha}}, das {{horaInicio}} às {{horaFin}}, para {{pacientes}} tem um alerta pendente de resolver. Em caso de dúvida, pode entrar em contato com o Coordenador."}'
WHERE clave = 'alerta_temprana_guardia_familia.cuerpo' AND prestadora_id IS NULL;
