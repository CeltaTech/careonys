-- Los mensajes del sistema se editan desde afuera
-- =============================================
--
-- QUÉ RESUELVE. Cada aviso que sale del motor —el correo, el mensaje al celular, el que va por
-- WhatsApp— tenía sus frases escritas adentro del código, en los tres idiomas. Cambiar una coma
-- era cambiar un archivo y publicar una versión nueva del producto. Desde acá las frases son
-- dato: viven en esta tabla y se editan desde afuera por API.
--
-- EL MOLDE ES EL DE LAS LISTAS DE OPCIONES, y a propósito: mismos dos pisos, mismo jsonb con los
-- tres idiomas adentro, mismas funciones de comprobación del esquema `interno`, mismas
-- políticas. Dos mecanismos parecidos y distintos serían dos cosas para mantener.
--
-- LOS DOS PISOS. Una fila sin Prestadora es el texto que trae el producto, y va en los tres
-- idiomas. Una fila con Prestadora es lo que escribió esa Prestadora para su gente, y alcanza
-- con el castellano. Cuando ella no escribió nada, sale el del producto.
--
-- QUÉ NO REESCRIBE NINGUNA PRESTADORA. Lo marca `admite_texto_propio` en la fila del producto:
-- los cuatro avisos de la seguridad de la cuenta, porque cómo se entra y cómo se recupera la
-- clave es igual para todas y no aparece en su configuración; y las piezas de gramática
-- compartida —la conjunción de una lista, el plural de una palabra—, que no son un mensaje sino
-- las partes con las que se arman todos.
--
-- LAS CLAVES SON PIEZAS, NO AVISOS ENTEROS. Un aviso no es una frase con huecos: en castellano
-- el plazo se dice «hace 20 minutos» y en inglés «20 minutes ago». Entonces acá vive la
-- redacción, en pedazos con marcadores `{{nombre}}`, y el código sigue decidiendo cuál pedazo
-- va, en qué orden y con qué número.

BEGIN;

CREATE TABLE IF NOT EXISTS public.mensajes_del_sistema (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id uuid REFERENCES public.prestadoras (id) ON DELETE CASCADE,
  clave text NOT NULL,
  i18n jsonb NOT NULL,
  admite_texto_propio boolean NOT NULL DEFAULT true,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT la_clave_del_mensaje_no_viene_vacia CHECK (btrim(clave) <> ''),
  -- El texto del producto va en los tres idiomas; el que escribe una Prestadora, en el suyo.
  CONSTRAINT el_mensaje_trae_los_idiomas_que_le_tocan CHECK (
    CASE
      WHEN prestadora_id IS NOT NULL THEN interno.i18n_minimo(i18n)
      ELSE interno.i18n_completo(i18n)
    END
  )
);

-- Dos índices parciales y no uno solo: en Postgres dos nulos son distintos, así que un único
-- índice sobre (prestadora_id, clave) dejaría entrar dos textos del producto para la misma clave.
CREATE UNIQUE INDEX IF NOT EXISTS un_mensaje_del_producto_por_clave
  ON public.mensajes_del_sistema (clave)
  WHERE prestadora_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS un_mensaje_propio_por_clave_y_prestadora
  ON public.mensajes_del_sistema (prestadora_id, clave)
  WHERE prestadora_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS mensajes_del_sistema_por_prestadora
  ON public.mensajes_del_sistema (prestadora_id)
  WHERE prestadora_id IS NOT NULL;

/* Una Prestadora sólo reescribe lo que el producto dejó abierto, y sólo sobre una clave que el
   producto ya trae: un texto propio con una clave inventada no lo pide nadie y quedaría muerto
   adentro de la tabla.

   SIN SECURITY DEFINER, a propósito. El disparador corre con los permisos de quien escribe, así
   que la fila del producto —que todos leen— se ve, y la de otra Prestadora se comporta como una
   fila que no existe. Fallar cerrado acá es lo correcto: si no se ve la fila del producto, no se
   deja escribir. */
CREATE OR REPLACE FUNCTION interno.el_texto_propio_solo_donde_el_producto_lo_admite()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'interno'
AS $$
DECLARE
  admitido boolean;
BEGIN
  IF NEW.prestadora_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT m.admite_texto_propio INTO admitido
    FROM public.mensajes_del_sistema m
   WHERE m.prestadora_id IS NULL
     AND m.clave = NEW.clave;

  IF admitido IS NULL THEN
    RAISE EXCEPTION 'El mensaje del sistema % no existe en el catálogo del producto', NEW.clave
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT admitido THEN
    RAISE EXCEPTION 'El mensaje del sistema % no admite texto propio de la Prestadora', NEW.clave
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION interno.el_texto_propio_solo_donde_el_producto_lo_admite() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.el_texto_propio_solo_donde_el_producto_lo_admite() TO authenticated, service_role;

DROP TRIGGER IF EXISTS el_texto_propio_solo_donde_el_producto_lo_admite ON public.mensajes_del_sistema;
CREATE TRIGGER el_texto_propio_solo_donde_el_producto_lo_admite
  BEFORE INSERT OR UPDATE ON public.mensajes_del_sistema
  FOR EACH ROW EXECUTE FUNCTION interno.el_texto_propio_solo_donde_el_producto_lo_admite();

ALTER TABLE public.mensajes_del_sistema ENABLE ROW LEVEL SECURITY;

-- El texto del producto lo lee cualquiera que haya entrado: es el que sale cuando su Prestadora
-- no escribió el suyo. El texto propio lo lee solamente la Prestadora que lo escribió.
DROP POLICY IF EXISTS mensajes_del_sistema_los_lee_su_prestadora ON public.mensajes_del_sistema;
CREATE POLICY mensajes_del_sistema_los_lee_su_prestadora ON public.mensajes_del_sistema
  FOR SELECT TO authenticated
  USING (prestadora_id IS NULL OR interno.lee_la_configuracion(prestadora_id));

-- Y escribir es siempre escribir lo propio: el catálogo del producto no se toca desde adentro de
-- ninguna Prestadora.
DROP POLICY IF EXISTS mensajes_del_sistema_los_escribe_el_personal ON public.mensajes_del_sistema;
CREATE POLICY mensajes_del_sistema_los_escribe_el_personal ON public.mensajes_del_sistema
  FOR ALL TO authenticated
  USING (prestadora_id IS NOT NULL AND interno.escribe_el_catalogo(prestadora_id))
  WITH CHECK (prestadora_id IS NOT NULL AND interno.escribe_el_catalogo(prestadora_id));

REVOKE ALL ON TABLE public.mensajes_del_sistema FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.mensajes_del_sistema TO authenticated;
GRANT ALL ON TABLE public.mensajes_del_sistema TO service_role;

/* LO QUE DICE HOY CADA PIEZA, palabra por palabra, en los tres idiomas.

   El bloque de abajo se lee también desde una prueba del motor, que comprueba que todo lo que el
   código pide esté sembrado acá. Por eso cada fila entra en un renglón y con esta forma exacta:
   ('clave', admite_texto_propio, '{"es-AR": ..., "en": ..., "pt-BR": ...}'). */
INSERT INTO public.mensajes_del_sistema (clave, admite_texto_propio, i18n)
VALUES
  ('comun.conjuncion', false, '{"es-AR":"y","en":"and","pt-BR":"e"}'),
  ('comun.paciente_sin_nombre', false, '{"es-AR":"Paciente sin nombre cargado","en":"patient with no name on file","pt-BR":"Paciente sem nome cadastrado"}'),
  ('comun.minutos', false, '{"es-AR":"minutos","en":"minutes","pt-BR":"minutos"}'),
  ('comun.horas', false, '{"es-AR":"horas","en":"hours","pt-BR":"horas"}'),
  ('comun.asistente_uno', false, '{"es-AR":"Asistente","en":"care worker","pt-BR":"Assistente"}'),
  ('comun.asistente_varios', false, '{"es-AR":"Asistentes","en":"care workers","pt-BR":"Assistentes"}'),
  ('comun.marca', false, '{"es-AR":"Con la tecnología de {{producto}}","en":"Powered by {{producto}}","pt-BR":"Com a tecnologia de {{producto}}"}'),
  ('comun.saludo', false, '{"es-AR":"Hola {{nombre}},","en":"Hi {{nombre}},","pt-BR":"Olá {{nombre}},"}'),
  ('comun.linea_guardia', false, '{"es-AR":"Guardia del {{fecha}}, de {{horaInicio}} a {{horaFin}}, para {{pacientes}}.","en":"Shift on {{fecha}}, from {{horaInicio}} to {{horaFin}}, for {{pacientes}}.","pt-BR":"Plantão de {{fecha}}, das {{horaInicio}} às {{horaFin}}, para {{pacientes}}."}'),
  ('comun.asistente_sin_asignar', false, '{"es-AR":"Asistente sin asignar","en":"no care worker assigned","pt-BR":"Assistente sem atribuição"}'),
  ('comun.a_cargo', false, '{"es-AR":"A cargo de {{asistente}}. Terminaba hace {{atraso}} y sigue abierta.","en":"Assigned to {{asistente}}. It was due to end {{atraso}} ago and is still open.","pt-BR":"A cargo de {{asistente}}. Terminava há {{atraso}} e continua aberto."}'),
  ('comun.aviso_repetido_guardia', false, '{"es-AR":"Es el aviso número {{veces}} de esta misma guardia.","en":"This is notice number {{veces}} for this same shift.","pt-BR":"É o aviso número {{veces}} deste mesmo plantão."}'),
  ('comun.aviso_repetido_ausencia', false, '{"es-AR":"Es el aviso número {{veces}} de esta misma ausencia.","en":"This is notice number {{veces}} for this same absence.","pt-BR":"É o aviso número {{veces}} desta mesma ausência."}'),
  ('comun.empieza_en', false, '{"es-AR":"Empieza en {{horas}} h.","en":"It starts in {{horas}} h.","pt-BR":"Começa em {{horas}} h."}'),
  ('comun.tendria_que_haber_empezado', false, '{"es-AR":"Tendría que haber empezado hace {{horas}} h.","en":"It should have started {{horas}} h ago.","pt-BR":"Deveria ter começado há {{horas}} h."}'),
  ('comun.un_asistente', false, '{"es-AR":"Un Asistente","en":"A care worker","pt-BR":"Um Assistente"}'),
  ('comun.ausencia_desde', false, '{"es-AR":"{{asistente}} no va a estar desde el {{fechaInicio}}.","en":"{{asistente}} will be away from {{fechaInicio}}.","pt-BR":"{{asistente}} não vai estar de {{fechaInicio}}."}'),
  ('comun.ausencia_desde_hasta', false, '{"es-AR":"{{asistente}} no va a estar desde el {{fechaInicio}} hasta el {{fechaFin}}.","en":"{{asistente}} will be away from {{fechaInicio}} to {{fechaFin}}.","pt-BR":"{{asistente}} não vai estar de {{fechaInicio}} até {{fechaFin}}."}'),
  ('origen_de_alerta.aviso_telefonico', true, '{"es-AR":"aviso telefónico registrado por la Prestadora","en":"phone call logged by the care provider","pt-BR":"aviso por telefone registrado pela Prestadora"}'),
  ('origen_de_alerta.aviso_demora_asistente', true, '{"es-AR":"aviso de demora dado por el Asistente desde la aplicación","en":"delay reported by the care worker from the application","pt-BR":"aviso de atraso dado pelo Assistente pelo aplicativo"}'),
  ('origen_de_alerta.calculo_llegada_tardia', true, '{"es-AR":"cuenta del sistema: la hora estimada de llegada pasa la hora de inicio","en":"system estimate: the expected arrival time is past the start time","pt-BR":"cálculo do sistema: o horário previsto de chegada passa do horário de início"}'),
  ('origen_de_alerta.sin_aviso_ni_salida', true, '{"es-AR":"llegó la hora de inicio sin marca de salida, sin aviso de demora y sin llegada registrada","en":"the start time came with no departure recorded, no delay reported and no arrival logged","pt-BR":"chegou o horário de início sem registro de saída, sem aviso de atraso e sem chegada registrada"}'),
  ('origen_de_alerta.sin_registrar', true, '{"es-AR":"origen sin registrar","en":"source not recorded","pt-BR":"origem sem registro"}'),
  ('guardia_sin_cerrar.asunto', true, '{"es-AR":"Guardia terminada y todavía sin cerrar","en":"Shift finished and still open","pt-BR":"Plantão terminado e ainda sem fechar"}'),
  ('guardia_sin_cerrar.salida_marcada', true, '{"es-AR":"El Asistente ya marcó su salida: falta confirmar que quedó todo hecho.","en":"The care worker already clocked out: what is missing is the confirmation that everything was done.","pt-BR":"O Assistente já registrou a saída: falta confirmar que ficou tudo feito."}'),
  ('guardia_sin_cerrar.salida_sin_marcar', true, '{"es-AR":"El Asistente todavía no marcó su salida.","en":"The care worker has not clocked out yet.","pt-BR":"O Assistente ainda não registrou a saída."}'),
  ('guardia_sin_cerrar_grave.asunto', true, '{"es-AR":"Urgente: una guardia lleva horas sin cerrarse","en":"Urgent: a shift has been open for hours","pt-BR":"Urgente: um plantão está há horas sem fechar"}'),
  ('guardia_sin_cerrar_grave.hace_falta_autoridad', true, '{"es-AR":"Ya se avisó al Coordinador y la guardia sigue sin cerrarse. Hace falta que intervenga alguien con autoridad para resolverlo.","en":"The coordinator has already been notified and the shift is still open. Someone with authority needs to step in.","pt-BR":"O Coordenador já foi avisado e o plantão continua sem fechar. É preciso que alguém com autoridade intervenha."}'),
  ('guardia_sin_cerrar_grave.salida_marcada', true, '{"es-AR":"El Asistente marcó su salida, así que se fue del domicilio: lo que falta es confirmar que quedó todo hecho.","en":"The care worker clocked out, so they left the home: what is missing is the confirmation that everything was done.","pt-BR":"O Assistente registrou a saída, então saiu do domicílio: falta confirmar que ficou tudo feito."}'),
  ('guardia_sin_cerrar_grave.salida_sin_marcar', true, '{"es-AR":"El Asistente no marcó su salida, así que no hay constancia de que la guardia haya terminado ni de quién quedó a cargo del Paciente.","en":"The care worker did not clock out, so there is no record that the shift ended or of who was left in charge of the patient.","pt-BR":"O Assistente não registrou a saída, então não há registro de que o plantão tenha terminado nem de quem ficou a cargo do Paciente."}'),
  ('guardia_sin_cerrar_familia.titulo', true, '{"es-AR":"Guardia sin cerrar","en":"Shift not closed","pt-BR":"Plantão sem encerrar"}'),
  ('guardia_sin_cerrar_familia.cuerpo', true, '{"es-AR":"La guardia del {{fecha}}, de {{horaInicio}} a {{horaFin}}, para {{pacientes}} pasó su hora de cierre y todavía figura abierta. Ante cualquier duda, puede comunicarse con el Coordinador.","en":"The shift on {{fecha}}, from {{horaInicio}} to {{horaFin}}, for {{pacientes}} is past its closing time and is still open. If you have any questions, you can contact the coordinator.","pt-BR":"O plantão de {{fecha}}, das {{horaInicio}} às {{horaFin}}, para {{pacientes}} passou da hora de encerramento e ainda consta aberto. Em caso de dúvida, pode entrar em contato com o Coordenador."}'),
  ('guardia_sin_cerrar_grave_familia.titulo', true, '{"es-AR":"Guardia sin cerrar","en":"Shift not closed","pt-BR":"Plantão sem encerrar"}'),
  ('guardia_sin_cerrar_grave_familia.cuerpo', true, '{"es-AR":"La guardia del {{fecha}}, de {{horaInicio}} a {{horaFin}}, para {{pacientes}} sigue figurando abierta varias horas después de su hora de cierre. Ante cualquier duda, puede comunicarse con el Coordinador.","en":"The shift on {{fecha}}, from {{horaInicio}} to {{horaFin}}, for {{pacientes}} is still open several hours after its closing time. If you have any questions, you can contact the coordinator.","pt-BR":"O plantão de {{fecha}}, das {{horaInicio}} às {{horaFin}}, para {{pacientes}} continua aberto várias horas depois da hora de encerramento. Em caso de dúvida, pode entrar em contato com o Coordenador."}'),
  ('alerta_temprana_guardia_familia.titulo', true, '{"es-AR":"Guardia con un aviso pendiente","en":"Shift with an open alert","pt-BR":"Plantão com um aviso pendente"}'),
  ('alerta_temprana_guardia_familia.cuerpo', true, '{"es-AR":"La guardia del {{fecha}}, de {{horaInicio}} a {{horaFin}}, para {{pacientes}} tiene un aviso pendiente de resolver. Ante cualquier duda, puede comunicarse con el Coordinador.","en":"The shift on {{fecha}}, from {{horaInicio}} to {{horaFin}}, for {{pacientes}} has an alert that is still open. If you have any questions, you can contact the coordinator.","pt-BR":"O plantão de {{fecha}}, das {{horaInicio}} às {{horaFin}}, para {{pacientes}} tem um aviso pendente de resolver. Em caso de dúvida, pode entrar em contato com o Coordenador."}'),
  ('guardia_sin_cerrar_respaldo.texto', true, '{"es-AR":"La guardia del {{fecha}}, de {{horaInicio}} a {{horaFin}}, sigue sin cerrarse {{minutos}} minutos después del plazo.","en":"The shift on {{fecha}}, from {{horaInicio}} to {{horaFin}}, is still open {{minutos}} minutes past the deadline.","pt-BR":"O plantão de {{fecha}}, das {{horaInicio}} às {{horaFin}}, continua sem fechar {{minutos}} minutos depois do prazo."}'),
  ('escalada_a_respaldo.asunto', true, '{"es-AR":"Sin resolver: pasa al Coordinador de respaldo","en":"Still unresolved: passed to the backup coordinator","pt-BR":"Sem resolver: passa ao Coordenador de retaguarda"}'),
  ('escalada_a_todos_los_coordinadores.asunto', true, '{"es-AR":"Sin resolver hace {{minutos}} minutos: pasa a todos los Coordinadores","en":"Unresolved for {{minutos}} minutes: passed to every coordinator","pt-BR":"Sem resolver há {{minutos}} minutos: passa a todos os Coordenadores"}'),
  ('escalada_a_la_administracion.asunto', true, '{"es-AR":"Sin resolver hace {{minutos}} minutos: pasa a la administración","en":"Unresolved for {{minutos}} minutes: passed to management","pt-BR":"Sem resolver há {{minutos}} minutos: passa à administração"}'),
  ('alerta_temprana_sin_resolver.asunto', true, '{"es-AR":"Alerta temprana de posible ausencia sin resolver","en":"Early warning of a possible no-show, unresolved","pt-BR":"Alerta antecipado de possível ausência sem resolver"}'),
  ('alerta_temprana_sin_resolver.detalle', true, '{"es-AR":"Origen: {{origen}}. Motivo: {{motivo}}. Sin resolver hace {{minutos}} minutos.","en":"Source: {{origen}}. Reason: {{motivo}}. Unresolved for {{minutos}} minutes.","pt-BR":"Origem: {{origen}}. Motivo: {{motivo}}. Sem resolver há {{minutos}} minutos."}'),
  ('alerta_temprana_respaldo.demora', true, '{"es-AR":"La alerta temprana sigue sin resolver hace {{minutos}} minutos.","en":"The early warning has been unresolved for {{minutos}} minutes.","pt-BR":"O alerta antecipado continua sem resolver há {{minutos}} minutos."}'),
  ('aviso_demora_asistente.asunto', true, '{"es-AR":"Aviso de demora del Asistente","en":"Care worker reported a delay","pt-BR":"Aviso de atraso do Assistente"}'),
  ('aviso_demora_asistente.texto', true, '{"es-AR":"Guardia del {{fecha}} a las {{horaInicio}}. Origen: {{origen}}. Motivo: {{motivo}}.","en":"Shift on {{fecha}} at {{horaInicio}}. Source: {{origen}}. Reason: {{motivo}}.","pt-BR":"Plantão de {{fecha}} às {{horaInicio}}. Origem: {{origen}}. Motivo: {{motivo}}."}'),
  ('emergencia_en_guardia.asunto', true, '{"es-AR":"Emergencia avisada desde una guardia","en":"Emergency reported from a shift","pt-BR":"Emergência avisada a partir de um plantão"}'),
  ('emergencia_en_guardia.texto', true, '{"es-AR":"Guardia del {{fecha}} a las {{horaInicio}}. El Asistente avisó una emergencia. El detalle está en el Panel.","en":"Shift on {{fecha}} at {{horaInicio}}. The care worker reported an emergency. The details are in the Panel.","pt-BR":"Plantão de {{fecha}} às {{horaInicio}}. O Assistente avisou uma emergência. O detalhe está no Painel."}'),
  ('no_puede_continuar_la_extension.asunto', true, '{"es-AR":"El Asistente que espera el relevo no puede continuar","en":"The care worker waiting for the handover cannot continue","pt-BR":"O Assistente que espera a rendição não pode continuar"}'),
  ('no_puede_continuar_la_extension.texto', true, '{"es-AR":"Guardia del {{fecha}} de {{horaInicio}} a {{horaFin}}. Terminó y el relevo no llegó. El Asistente sigue en el domicilio y avisó que no puede continuar. El detalle está en el Panel.","en":"Shift on {{fecha}} from {{horaInicio}} to {{horaFin}}. It ended and no one arrived. The care worker is still at the home and reported being unable to continue. The details are in the Panel.","pt-BR":"Plantão de {{fecha}} das {{horaInicio}} às {{horaFin}}. Terminou e a rendição não chegou. O Assistente continua no domicílio e avisou que não pode continuar. O detalhe está no Painel."}'),
  ('incidente_relevo_sin_resolver.asunto', true, '{"es-AR":"La guardia terminó y el relevo todavía no llegó","en":"The shift ended and the relief has not arrived","pt-BR":"O plantão terminou e a rendição ainda não chegou"}'),
  ('incidente_relevo_sin_resolver.demora', true, '{"es-AR":"El relevo sigue sin llegar hace {{minutos}} minutos.","en":"The relief has still not arrived after {{minutos}} minutes.","pt-BR":"A rendição continua sem chegar há {{minutos}} minutos."}'),
  ('incidente_relevo_respaldo.demora', true, '{"es-AR":"El relevo sigue sin llegar hace {{minutos}} minutos.","en":"The relief has still not arrived after {{minutos}} minutes.","pt-BR":"A rendição continua sem chegar há {{minutos}} minutos."}'),
  ('incidente_relevo_fase_automatica.asunto', true, '{"es-AR":"Se salió a buscar quién cubra la guardia","en":"The search for someone to cover the shift has started","pt-BR":"Saiu-se à procura de quem cubra o plantão"}'),
  ('incidente_relevo_fase_automatica.sin_resolver_desde', true, '{"es-AR":"Sin resolver hace más de {{minutosUmbral}} minutos.","en":"Unresolved for more than {{minutosUmbral}} minutes.","pt-BR":"Sem resolver há mais de {{minutosUmbral}} minutos."}'),
  ('incidente_relevo_fase_automatica.sin_orden', true, '{"es-AR":"No hay ningún orden de prioridad cargado, así que no se contactó a nadie.","en":"There is no priority order on file, so nobody was contacted.","pt-BR":"Não há nenhuma ordem de prioridade cadastrada, portanto ninguém foi contatado."}'),
  ('incidente_relevo_fase_automatica.contactados_uno', true, '{"es-AR":"Se le escribió a {{contactados}} Asistente, en el orden de prioridad cargado.","en":"{{contactados}} care worker was contacted, in the priority order on file.","pt-BR":"{{contactados}} Assistente foi contatado, na ordem de prioridade cadastrada."}'),
  ('incidente_relevo_fase_automatica.contactados_varios', true, '{"es-AR":"Se le escribió a {{contactados}} Asistentes, en el orden de prioridad cargado.","en":"{{contactados}} care workers were contacted, in the priority order on file.","pt-BR":"{{contactados}} Assistentes foram contatados, na ordem de prioridade cadastrada."}'),
  ('incidente_relevo_fase_automatica.nadie_disponible', true, '{"es-AR":"No había nadie disponible en el orden de prioridad cargado.","en":"Nobody in the priority order on file was available to contact.","pt-BR":"Não havia ninguém disponível na ordem de prioridade cadastrada."}'),
  ('incidente_relevo_fase_automatica.queda_el_familiar', true, '{"es-AR":"Queda por avisarle al familiar, y esa decisión es suya.","en":"The family member is still to be told, and that decision is yours.","pt-BR":"Falta avisar o familiar, e essa decisão é sua."}'),
  ('incidente_relevo_fase_automatica.sigue_sin_nadie', true, '{"es-AR":"La guardia sigue sin nadie asignado.","en":"The shift still has nobody assigned.","pt-BR":"O plantão continua sem ninguém atribuído."}'),
  ('convocatoria_de_relevo.titulo', true, '{"es-AR":"Se busca quién cubra una guardia: {{fecha}}, de {{horaInicio}} a {{horaFin}}","en":"Cover needed for a shift: {{fecha}}, from {{horaInicio}} to {{horaFin}}","pt-BR":"Procura-se quem cubra um plantão: {{fecha}}, das {{horaInicio}} às {{horaFin}}"}'),
  ('incidente_relevo_familia.titulo', true, '{"es-AR":"Continuidad de guardia","en":"Shift continuity","pt-BR":"Continuidade de plantão"}'),
  ('incidente_relevo_familia.cuerpo', true, '{"es-AR":"La guardia del {{fecha}}, de {{horaInicio}} a {{horaFin}}, terminó y el relevo todavía no llegó. Ante cualquier duda, puede comunicarse con el Coordinador.","en":"The shift on {{fecha}}, from {{horaInicio}} to {{horaFin}}, has ended and the relief has not arrived yet. If you have any questions, you can contact the coordinator.","pt-BR":"O plantão de {{fecha}}, das {{horaInicio}} às {{horaFin}}, terminou e a rendição ainda não chegou. Em caso de dúvida, pode entrar em contato com o Coordenador."}'),
  ('cambio_de_asistente.asunto_uno', true, '{"es-AR":"Cambió el Asistente de una guardia","en":"The care worker on a shift changed","pt-BR":"O Assistente de um plantão mudou"}'),
  ('cambio_de_asistente.asunto_varios', true, '{"es-AR":"Cambió el Asistente de varias guardias","en":"The care worker on several shifts changed","pt-BR":"O Assistente de vários plantões mudou"}'),
  ('cambio_de_asistente.asistente_sin_nombre', true, '{"es-AR":"un Asistente sin nombre cargado","en":"a care worker with no name on file","pt-BR":"um Assistente sem nome cadastrado"}'),
  ('cambio_de_asistente.asistente_sin_nombre_encabezando', true, '{"es-AR":"un Asistente sin nombre cargado","en":"A care worker with no name on file","pt-BR":"um Assistente sem nome cadastrado"}'),
  ('cambio_de_asistente.cambio_uno', true, '{"es-AR":"{{anterior}} ya no hace esta guardia. Ahora la hace {{nuevo}}.","en":"{{anterior}} no longer covers this shift. {{nuevo}} covers it now.","pt-BR":"{{anterior}} não faz mais este plantão. Agora é feito por {{nuevo}}."}'),
  ('cambio_de_asistente.cambio_varios', true, '{"es-AR":"{{anterior}} ya no hace estas guardias. Ahora las hace {{nuevo}}.","en":"{{anterior}} no longer covers these shifts. {{nuevo}} covers them now.","pt-BR":"{{anterior}} não faz mais estes plantões. Agora são feitos por {{nuevo}}."}'),
  ('cambio_de_asistente.pasa_uno', true, '{"es-AR":"Esta guardia pasa a {{nuevo}}.","en":"This shift goes to {{nuevo}}.","pt-BR":"Este plantão passa para {{nuevo}}."}'),
  ('cambio_de_asistente.pasa_varios', true, '{"es-AR":"Estas guardias pasan a {{nuevo}}.","en":"These shifts go to {{nuevo}}.","pt-BR":"Estes plantões passam para {{nuevo}}."}'),
  ('cambio_de_asistente.linea_turno', true, '{"es-AR":"{{fecha}}, de {{horaInicio}} a {{horaFin}}, para {{pacientes}}.","en":"{{fecha}}, from {{horaInicio}} to {{horaFin}}, for {{pacientes}}.","pt-BR":"{{fecha}}, das {{horaInicio}} às {{horaFin}}, para {{pacientes}}."}'),
  ('cambio_de_asistente_familia.titulo', true, '{"es-AR":"Cambio de Asistente","en":"Change of care worker","pt-BR":"Mudança de Assistente"}'),
  ('cambio_de_asistente_familia.otro_asistente', true, '{"es-AR":"otro Asistente","en":"another care worker","pt-BR":"outro Assistente"}'),
  ('cambio_de_asistente_familia.cuerpo_uno', true, '{"es-AR":"La guardia del {{fecha}}, de {{horaInicio}} a {{horaFin}}, la hace {{nuevo}}.","en":"The shift on {{fecha}}, from {{horaInicio}} to {{horaFin}}, will be covered by {{nuevo}}.","pt-BR":"O plantão de {{fecha}}, das {{horaInicio}} às {{horaFin}}, será feito por {{nuevo}}."}'),
  ('cambio_de_asistente_familia.cuerpo_varios', true, '{"es-AR":"{{cuantas}} guardias, desde la del {{fecha}}, las hace {{nuevo}}.","en":"{{cuantas}} shifts, starting with the one on {{fecha}}, will be covered by {{nuevo}}.","pt-BR":"{{cuantas}} plantões, a partir do de {{fecha}}, serão feitos por {{nuevo}}."}'),
  ('ausencia_avisada_con_tiempo.asunto', true, '{"es-AR":"Un Asistente avisó que falta","en":"A care worker reported an absence","pt-BR":"Um Assistente avisou que vai faltar"}'),
  ('ausencia_avisada_con_tiempo.deja_turnos_uno', true, '{"es-AR":"Deja {{turnos}} guardia sin nadie. La primera es la del {{fecha}}, de {{horaInicio}} a {{horaFin}}, y empieza en {{horas}} h.","en":"This leaves {{turnos}} shift with nobody. The first one is on {{fecha}}, from {{horaInicio}} to {{horaFin}}, and it starts in {{horas}} h.","pt-BR":"Deixa {{turnos}} plantão sem ninguém. O primeiro é o de {{fecha}}, das {{horaInicio}} às {{horaFin}}, e começa em {{horas}} h."}'),
  ('ausencia_avisada_con_tiempo.deja_turnos_varios', true, '{"es-AR":"Deja {{turnos}} guardias sin nadie. La primera es la del {{fecha}}, de {{horaInicio}} a {{horaFin}}, y empieza en {{horas}} h.","en":"This leaves {{turnos}} shifts with nobody. The first one is on {{fecha}}, from {{horaInicio}} to {{horaFin}}, and it starts in {{horas}} h.","pt-BR":"Deixa {{turnos}} plantões sem ninguém. O primeiro é o de {{fecha}}, das {{horaInicio}} às {{horaFin}}, e começa em {{horas}} h."}'),
  ('ausencia_de_golpe.asunto_ya_empezo', true, '{"es-AR":"Falta un Asistente: la guardia ya tendría que haber empezado","en":"A care worker is missing: the shift should have started already","pt-BR":"Falta um Assistente: o plantão já deveria ter começado"}'),
  ('ausencia_de_golpe.asunto', true, '{"es-AR":"Falta un Asistente y la guardia empieza enseguida","en":"A care worker is missing and the shift starts shortly","pt-BR":"Falta um Assistente e o plantão começa em seguida"}'),
  ('ausencia_de_golpe.ademas_uno', true, '{"es-AR":"Además deja otra guardia sin nadie.","en":"It also leaves {{otras}} more shift with nobody.","pt-BR":"Além disso, deixa outro plantão sem ninguém."}'),
  ('ausencia_de_golpe.ademas_varios', true, '{"es-AR":"Además deja otras {{otras}} guardias sin nadie.","en":"It also leaves {{otras}} more shifts with nobody.","pt-BR":"Além disso, deixa outros {{otras}} plantões sem ninguém."}'),
  ('guardia_sin_cubrir.asunto_ya_empezo', true, '{"es-AR":"Guardia sin cubrir: la hora de inicio ya pasó","en":"Shift not covered: the start time has passed","pt-BR":"Plantão sem cobertura: o horário de início já passou"}'),
  ('guardia_sin_cubrir.asunto', true, '{"es-AR":"Guardia sin cubrir","en":"Shift not covered","pt-BR":"Plantão sem cobertura"}'),
  ('guardia_sin_cubrir.sin_ofrecer', true, '{"es-AR":"Todavía no se le ofreció a ningún Asistente.","en":"It has not been offered to any care worker yet.","pt-BR":"Ainda não foi oferecido a nenhum Assistente."}'),
  ('guardia_sin_cubrir.publicada_sin_invitar', true, '{"es-AR":"Está publicada, pero no se invitó a ningún Asistente en particular.","en":"It is published, but no particular care worker was invited.","pt-BR":"Está publicado, mas não se convidou nenhum Assistente em particular."}'),
  ('guardia_sin_cubrir.sin_contestar_uno', true, '{"es-AR":"Se invitó a {{invitados}} y {{sinContestar}} todavía no contestó.","en":"{{invitados}} were invited and {{sinContestar}} has not replied yet.","pt-BR":"Foram convidados {{invitados}} e {{sinContestar}} ainda não respondeu."}'),
  ('guardia_sin_cubrir.sin_contestar_varios', true, '{"es-AR":"Se invitó a {{invitados}} y {{sinContestar}} todavía no contestaron.","en":"{{invitados}} were invited and {{sinContestar}} have not replied yet.","pt-BR":"Foram convidados {{invitados}} e {{sinContestar}} ainda não responderam."}'),
  ('guardia_sin_cubrir.aceptaron_uno', true, '{"es-AR":"{{aceptaron}} aceptó, pero la guardia sigue sin asignar.","en":"{{aceptaron}} accepted, but the shift is still unassigned.","pt-BR":"{{aceptaron}} aceitou, mas o plantão continua sem atribuição."}'),
  ('guardia_sin_cubrir.aceptaron_varios', true, '{"es-AR":"{{aceptaron}} aceptaron, pero la guardia sigue sin asignar.","en":"{{aceptaron}} accepted, but the shift is still unassigned.","pt-BR":"{{aceptaron}} aceitaram, mas o plantão continua sem atribuição."}'),
  ('guardia_sin_cubrir.rechazaron_uno', true, '{"es-AR":"Se invitó a {{invitados}} y rechazó.","en":"{{invitados}} were invited and declined.","pt-BR":"Foram convidados {{invitados}} e recusou."}'),
  ('guardia_sin_cubrir.rechazaron_varios', true, '{"es-AR":"Se invitó a {{invitados}} y todos rechazaron.","en":"{{invitados}} were invited and all of them declined.","pt-BR":"Foram convidados {{invitados}} e todos recusaram."}'),
  ('incidente_turno_sin_cubrir.asunto_ya_empezo', true, '{"es-AR":"Guardia sin nadie: ya empezó y sigue abierta","en":"Shift with nobody: it already started and is still open","pt-BR":"Plantão sem ninguém: já começou e continua aberto"}'),
  ('incidente_turno_sin_cubrir.asunto', true, '{"es-AR":"Guardia sin nadie: queda poco para que empiece","en":"Shift with nobody: little time left before it starts","pt-BR":"Plantão sem ninguém: falta pouco para começar"}'),
  ('incidente_turno_sin_cubrir.cubren_francos', true, '{"es-AR":"Cubre francos de este Paciente: {{nombres}}.","en":"Covers this patient''s days off: {{nombres}}.","pt-BR":"Cobre as folgas deste Paciente: {{nombres}}."}'),
  ('incidente_turno_sin_cubrir.equipo', true, '{"es-AR":"Equipo del Paciente: {{nombres}}.","en":"Patient''s team: {{nombres}}.","pt-BR":"Equipe do Paciente: {{nombres}}."}'),
  ('incidente_turno_sin_cubrir.sin_equipo', true, '{"es-AR":"Este Paciente todavía no tiene equipo armado.","en":"This patient has no team set up yet.","pt-BR":"Este Paciente ainda não tem equipe montada."}'),
  ('incidente_turno_sin_cubrir.recordatorio_repetido', true, '{"es-AR":"Es el recordatorio número {{veces}} de esta misma guardia.","en":"This is reminder number {{veces}} for this same shift.","pt-BR":"É o lembrete número {{veces}} deste mesmo plantão."}'),
  ('alerta_ia_coordinador.asunto_roja', true, '{"es-AR":"Alerta roja sobre un Paciente","en":"Red alert about a patient","pt-BR":"Alerta vermelho sobre um Paciente"}'),
  ('alerta_ia_coordinador.asunto_amarilla', true, '{"es-AR":"Alerta amarilla sobre un Paciente","en":"Yellow alert about a patient","pt-BR":"Alerta amarelo sobre um Paciente"}'),
  ('alerta_ia_coordinador.texto', true, '{"es-AR":"El detalle está en el Panel.","en":"The details are in the Panel.","pt-BR":"O detalhe está no Painel."}'),
  ('alerta_ia_familia.titulo_roja', true, '{"es-AR":"Alerta sobre el Paciente","en":"Alert about the patient","pt-BR":"Alerta sobre o Paciente"}'),
  ('alerta_ia_familia.titulo_amarilla', true, '{"es-AR":"Novedad sobre el Paciente","en":"Update about the patient","pt-BR":"Novidade sobre o Paciente"}'),
  ('alerta_ia_familia.cuerpo_roja', true, '{"es-AR":"Hay una novedad importante para revisar en la aplicación.","en":"There is something important to review in the application.","pt-BR":"Há uma novidade importante para revisar no aplicativo."}'),
  ('alerta_ia_familia.cuerpo_amarilla', true, '{"es-AR":"Hay algo para mirar sin apuro en la aplicación.","en":"There is something to look at in the application, no rush.","pt-BR":"Há algo para olhar sem pressa no aplicativo."}'),
  ('vencimiento_documentos.asunto_uno', true, '{"es-AR":"Vencimientos próximos de {{etiqueta}} — {{cuantos}} Asistente","en":"{{etiqueta}} expiring soon — {{cuantos}} care worker","pt-BR":"Vencimentos próximos de {{etiqueta}} — {{cuantos}} Assistente"}'),
  ('vencimiento_documentos.asunto_varios', true, '{"es-AR":"Vencimientos próximos de {{etiqueta}} — {{cuantos}} Asistentes","en":"{{etiqueta}} expiring soon — {{cuantos}} care workers","pt-BR":"Vencimentos próximos de {{etiqueta}} — {{cuantos}} Assistentes"}'),
  ('vencimiento_documentos.encabezado', true, '{"es-AR":"Estos Asistentes tienen {{etiqueta}} vencido o por vencer dentro de {{dias}} días:","en":"These care workers have their {{etiqueta}} expired or expiring within {{dias}} days:","pt-BR":"Estes Assistentes têm {{etiqueta}} vencido ou a vencer dentro de {{dias}} dias:"}'),
  ('vencimiento_documentos.linea', true, '{"es-AR":"{{nombre}}: vence {{fechaVencimiento}}","en":"{{nombre}}: expires {{fechaVencimiento}}","pt-BR":"{{nombre}}: vence {{fechaVencimiento}}"}'),
  ('mfa_codigo_recuperacion.asunto', true, '{"es-AR":"Código de recuperación de acceso — {{producto}}","en":"Access recovery code — {{producto}}","pt-BR":"Código de recuperação de acesso — {{producto}}"}'),
  ('mfa_codigo_recuperacion.texto', true, '{"es-AR":"El código de recuperación es {{codigo}}. Vence en {{minutos}} minutos. Si no lo pidió usted, puede ignorar este correo.","en":"The recovery code is {{codigo}}. It expires in {{minutos}} minutes. If you did not request it, you can ignore this email.","pt-BR":"O código de recuperação é {{codigo}}. Vence em {{minutos}} minutos. Se não tiver sido solicitado, pode ignorar este e-mail."}'),
  ('codigo_instruccion_circulo.asunto', true, '{"es-AR":"Código para confirmar los accesos de su círculo familiar — {{remite}}","en":"Code to confirm your family circle''s access — {{remite}}","pt-BR":"Código para confirmar os acessos do seu círculo familiar — {{remite}}"}'),
  ('codigo_instruccion_circulo.texto', true, '{"es-AR":"Su código para confirmar la instrucción sobre los accesos de su círculo familiar es {{codigo}}. Vence en {{minutos}} minutos. Si no lo pidió usted, no lo use y avise a {{remite}}.","en":"Your code to confirm the instruction about your family circle''s access is {{codigo}}. It expires in {{minutos}} minutes. If you did not request it, do not use it and let {{remite}} know.","pt-BR":"O seu código para confirmar a instrução sobre os acessos do seu círculo familiar é {{codigo}}. Vence em {{minutos}} minutos. Se não tiver sido solicitado, não o use e avise {{remite}}."}'),
  ('activacion_cuenta.asunto', true, '{"es-AR":"Active su cuenta en {{empresa}}","en":"Activate your {{empresa}} account","pt-BR":"Ative a sua conta na {{empresa}}"}'),
  ('activacion_cuenta.cuerpo', true, '{"es-AR":"Su cuenta en {{empresa}} ya está creada. Falta un paso: elegir su contraseña.","en":"Your {{empresa}} account has been created. One step left: choose your password.","pt-BR":"A sua conta na {{empresa}} já está criada. Falta um passo: escolher a sua senha."}'),
  ('activacion_cuenta.invitacion_al_enlace', true, '{"es-AR":"Se activa acá:","en":"Activate it here:","pt-BR":"A ativação é feita aqui:"}'),
  ('activacion_cuenta.boton', true, '{"es-AR":"Activar mi cuenta","en":"Activate my account","pt-BR":"Ativar a minha conta"}'),
  ('activacion_cuenta.pie_de_aviso', true, '{"es-AR":"El enlace vence en {{dias}} días. Si no esperaba este correo, puede ignorarlo.","en":"The link expires in {{dias}} days. If you were not expecting this email, you can ignore it.","pt-BR":"O link expira em {{dias}} dias. Se este e-mail não era esperado, pode ser ignorado."}'),
  ('recuperacion_clave.asunto', true, '{"es-AR":"Recupere su clave en {{empresa}}","en":"Recover your {{empresa}} password","pt-BR":"Recupere a sua senha na {{empresa}}"}'),
  ('recuperacion_clave.cuerpo', true, '{"es-AR":"Se pidió una clave nueva para su cuenta en {{empresa}}.","en":"A new password was requested for your {{empresa}} account.","pt-BR":"Foi pedida uma senha nova para a sua conta na {{empresa}}."}'),
  ('recuperacion_clave.invitacion_al_enlace', true, '{"es-AR":"Se elige acá:","en":"Choose it here:","pt-BR":"A escolha é feita aqui:"}'),
  ('recuperacion_clave.boton', true, '{"es-AR":"Elegir una clave nueva","en":"Choose a new password","pt-BR":"Escolher uma senha nova"}'),
  ('recuperacion_clave.pie_de_aviso', true, '{"es-AR":"El enlace vence en {{horas}} horas y sirve una sola vez. Si no lo pidió, puede ignorar este correo: su clave sigue siendo la de siempre.","en":"The link expires in {{horas}} hours and works only once. If you did not request it, you can ignore this email: your password stays as it was.","pt-BR":"O link expira em {{horas}} horas e serve uma só vez. Se não tiver sido solicitada, pode ignorar este e-mail: a sua senha continua a mesma."}'),
  ('estado_postulacion.asunto', true, '{"es-AR":"{{empresa}} — Su postulación","en":"{{empresa}} — Your application","pt-BR":"{{empresa}} — A sua candidatura"}'),
  ('estado_postulacion.en_revision', true, '{"es-AR":"Su postulación está en revisión.","en":"Your application is under review.","pt-BR":"A sua candidatura está em análise."}'),
  ('estado_postulacion.aprobado', true, '{"es-AR":"Su postulación fue aprobada. Nos vamos a poner en contacto con usted.","en":"Your application was approved. We will be in touch with you.","pt-BR":"A sua candidatura foi aprovada. Entraremos em contato."}'),
  ('estado_postulacion.rechazado', true, '{"es-AR":"Gracias por su interés en {{empresa}}. En esta oportunidad no vamos a avanzar con su postulación.","en":"Thank you for your interest in {{empresa}}. We will not be moving forward with your application at this time.","pt-BR":"Obrigado pelo interesse na {{empresa}}. Desta vez não vamos avançar com a candidatura."}'),
  ('estado_postulacion.firma', true, '{"es-AR":"Equipo de {{empresa}}","en":"The {{empresa}} team","pt-BR":"Equipe {{empresa}}"}'),
  ('nueva_postulacion_asistente.asunto', true, '{"es-AR":"Nueva postulación de Asistente — {{nombre}}","en":"New care worker application — {{nombre}}","pt-BR":"Nova candidatura de Assistente — {{nombre}}"}'),
  ('nueva_postulacion_asistente.texto', true, '{"es-AR":"Se recibió una postulación de {{nombre}}. Los datos están en el Panel.","en":"An application from {{nombre}} was received. The details are in the Panel.","pt-BR":"Foi recebida uma candidatura de {{nombre}}. Os dados estão no Painel."}'),
  ('nueva_solicitud_servicio.asunto', true, '{"es-AR":"Nueva solicitud de servicio — {{nombre}}","en":"New service request — {{nombre}}","pt-BR":"Nova solicitação de serviço — {{nombre}}"}'),
  ('nueva_solicitud_servicio.texto', true, '{"es-AR":"Nombre: {{nombre}}\nTeléfono: {{telefono}}\nCorreo: {{email}}\nLocalidad: {{localidad}}\nServicio: {{tipoServicio}} ({{modalidad}})\nDías y horario: {{diasHorario}}\nDescripción: {{descripcion}}","en":"Name: {{nombre}}\nPhone: {{telefono}}\nEmail address: {{email}}\nTown: {{localidad}}\nService: {{tipoServicio}} ({{modalidad}})\nDays and hours: {{diasHorario}}\nDescription: {{descripcion}}","pt-BR":"Nome: {{nombre}}\nTelefone: {{telefono}}\nE-mail: {{email}}\nLocalidade: {{localidad}}\nServiço: {{tipoServicio}} ({{modalidad}})\nDias e horário: {{diasHorario}}\nDescrição: {{descripcion}}"}'),
  ('mensaje_del_coordinador.titulo', true, '{"es-AR":"Nuevo mensaje del Coordinador","en":"New message from the coordinator","pt-BR":"Nova mensagem do Coordenador"}'),
  ('guardia_asignada.titulo', true, '{"es-AR":"Nueva guardia asignada","en":"New shift assigned","pt-BR":"Novo plantão atribuído"}'),
  ('guardia_asignada.cuerpo', true, '{"es-AR":"Hay una guardia asignada el {{fecha}} a las {{horaInicio}}.","en":"A shift has been assigned on {{fecha}} at {{horaInicio}}.","pt-BR":"Há um plantão atribuído no dia {{fecha}} às {{horaInicio}}."}'),
  ('recordatorio_de_guardia.titulo', true, '{"es-AR":"Recordatorio de guardia","en":"Shift reminder","pt-BR":"Lembrete de plantão"}'),
  ('recordatorio_de_guardia.cuerpo', true, '{"es-AR":"La guardia del {{fecha}} empieza a las {{horaInicio}}.","en":"The shift on {{fecha}} starts at {{horaInicio}}.","pt-BR":"O plantão do dia {{fecha}} começa às {{horaInicio}}."}'),
  ('fin_periodo_sin_cargo.titulo', true, '{"es-AR":"Termina el período sin cargo","en":"The free period is ending","pt-BR":"Termina o período sem cobrança"}'),
  ('fin_periodo_sin_cargo.cuerpo', true, '{"es-AR":"A partir del {{dia}} se cobra {{importe}}. Si prefiere no continuar, puede darse de baja antes desde la aplicación.","en":"From {{dia}} the charge is {{importe}}. If you would rather not continue, you can cancel before then from the application.","pt-BR":"A partir de {{dia}} passa a ser cobrado {{importe}}. Se preferir não continuar, pode cancelar antes pelo aplicativo."}'),
  ('cobro_no_realizado.titulo', true, '{"es-AR":"El cobro no se pudo hacer","en":"The payment could not be taken","pt-BR":"A cobrança não pôde ser feita"}'),
  ('cobro_no_realizado.cuerpo', true, '{"es-AR":"No se pudo cobrar {{importe}}. El acceso sigue funcionando hasta el {{dia}}; si para entonces el cobro no entró, queda suspendido.","en":"{{importe}} could not be charged. Access keeps working until {{dia}}; if the payment has not come through by then, it is suspended.","pt-BR":"Não foi possível cobrar {{importe}}. O acesso continua funcionando até {{dia}}; se até lá a cobrança não entrar, fica suspenso."}'),
  ('cese_de_servicio.titulo', true, '{"es-AR":"Finalización de servicio","en":"Service ended","pt-BR":"Fim do serviço"}'),
  ('cese_de_servicio.cuerpo', true, '{"es-AR":"Se cerró el Servicio en el que participaba. Para más información, puede comunicarse con el Coordinador.","en":"The service you were taking part in has been closed. For more information, please get in touch with the coordinator.","pt-BR":"O Serviço do qual participava foi encerrado. Para mais informações, pode entrar em contato com o Coordenador."}'),
  ('entrevista_agendada.titulo', true, '{"es-AR":"Entrevista con {{prestadora}}","en":"Interview with {{prestadora}}","pt-BR":"Entrevista com {{prestadora}}"}'),
  ('entrevista_agendada.cuerpo', true, '{"es-AR":"Su entrevista quedó agendada para el {{cuando}}.\n\nEl día de la entrevista, entre por acá:\n{{enlace}}\n\nLa puerta se abre {{anticipo}} minutos antes de la hora. No hace falta instalar nada ni crear ninguna cuenta.","en":"Your interview is scheduled for {{cuando}}.\n\nOn the day, join here:\n{{enlace}}\n\nThe door opens {{anticipo}} minutes before the start time. Nothing to install, no account to create.","pt-BR":"A sua entrevista ficou marcada para {{cuando}}.\n\nNo dia da entrevista, entre por aqui:\n{{enlace}}\n\nA porta abre {{anticipo}} minutos antes do horário. Não é preciso instalar nada nem criar nenhuma conta."}'),
  ('entrevista_reprogramada.titulo', true, '{"es-AR":"Se cambió el día de su entrevista con {{prestadora}}","en":"Your interview with {{prestadora}} has moved","pt-BR":"Mudou o dia da sua entrevista com {{prestadora}}"}'),
  ('entrevista_reprogramada.cuerpo', true, '{"es-AR":"Su entrevista pasó al {{cuando}}.\n\nEntre por el mismo enlace de siempre:\n{{enlace}}\n\nLa puerta se abre {{anticipo}} minutos antes de la hora.","en":"Your interview is now set for {{cuando}}.\n\nJoin through the same link as before:\n{{enlace}}\n\nThe door opens {{anticipo}} minutes before the start time.","pt-BR":"A sua entrevista passou para {{cuando}}.\n\nEntre pelo mesmo link de sempre:\n{{enlace}}\n\nA porta abre {{anticipo}} minutos antes do horário."}'),
  ('entrevista_cancelada.titulo', true, '{"es-AR":"Se canceló su entrevista con {{prestadora}}","en":"Your interview with {{prestadora}} was cancelled","pt-BR":"Sua entrevista com {{prestadora}} foi cancelada"}'),
  ('entrevista_cancelada.cuerpo', true, '{"es-AR":"La entrevista del {{cuando}} quedó sin efecto. Su postulación sigue en pie.","en":"The interview set for {{cuando}} has been called off. Your application still stands.","pt-BR":"A entrevista de {{cuando}} ficou sem efeito. A sua candidatura continua de pé."}'),
  ('clave_recuperada.asunto', false, '{"es-AR":"Se cambió la clave de su cuenta en {{prestadora}}","en":"Your {{prestadora}} account password was changed","pt-BR":"A senha da sua conta na {{prestadora}} foi alterada"}'),
  ('clave_recuperada.texto', false, '{"es-AR":"{{nombre}}: la clave de su cuenta acaba de cambiarse.\n\nSi no fue usted, avise a {{prestadora}} ahora mismo.","en":"{{nombre}}: the password on your account has just been changed.\n\nIf this was not you, tell {{prestadora}} right away.","pt-BR":"{{nombre}}: a senha da sua conta acaba de ser alterada.\n\nSe não foi você, avise a {{prestadora}} agora mesmo."}'),
  ('telefono_cambiado.asunto', false, '{"es-AR":"Se cambió el teléfono de su cuenta en {{prestadora}}","en":"The phone number on your {{prestadora}} account was changed","pt-BR":"O telefone da sua conta na {{prestadora}} foi alterado"}'),
  ('telefono_cambiado.texto', false, '{"es-AR":"{{nombre}}: el teléfono de su cuenta acaba de cambiarse y todavía está sin verificar.\n\nSi no fue usted, avise a {{prestadora}} ahora mismo.","en":"{{nombre}}: the phone number on your account has just been changed and is not verified yet.\n\nIf this was not you, tell {{prestadora}} right away.","pt-BR":"{{nombre}}: o telefone da sua conta acaba de ser alterado e ainda está sem verificar.\n\nSe não foi você, avise a {{prestadora}} agora mesmo."}'),
  ('entrada_desde_equipo_nuevo.asunto', false, '{"es-AR":"Entraron a su cuenta de {{prestadora}} desde un equipo nuevo","en":"Your {{prestadora}} account was opened from a new device","pt-BR":"Entraram na sua conta da {{prestadora}} a partir de um equipamento novo"}'),
  ('entrada_desde_equipo_nuevo.texto', false, '{"es-AR":"{{nombre}}: se entró a su cuenta desde un equipo desde el que nunca se había entrado.\n\nSi no fue usted, cambie su clave y cierre la sesión en todos los equipos desde su propia pantalla.","en":"{{nombre}}: your account was opened from a device that had never been used before.\n\nIf this was not you, change your password and sign out on every device from your own screen.","pt-BR":"{{nombre}}: entraram na sua conta a partir de um equipamento do qual nunca se tinha entrado.\n\nSe não foi você, troque a sua senha e feche a sessão em todos os equipamentos pela sua própria tela."}'),
  ('cambio_de_clave_habilitado.asunto', false, '{"es-AR":"{{prestadora}} habilitó un cambio de clave en su cuenta","en":"{{prestadora}} opened a password change on your account","pt-BR":"A {{prestadora}} liberou uma troca de senha na sua conta"}'),
  ('cambio_de_clave_habilitado.texto', false, '{"es-AR":"{{nombre}}: {{prestadora}} habilitó por un rato que usted elija una clave nueva. La clave la elige usted: nadie de {{prestadora}} la ve ni la conoce.\n\nSi usted no llamó para pedirlo, avise ahora mismo.","en":"{{nombre}}: {{prestadora}} has opened a short window for you to choose a new password. You choose it: nobody at {{prestadora}} sees it or knows it.\n\nIf you did not call to ask for this, say so right away.","pt-BR":"{{nombre}}: a {{prestadora}} liberou por um tempo curto que você escolha uma senha nova. A senha é escolhida por você: ninguém da {{prestadora}} a vê nem a conhece.\n\nSe você não ligou para pedir isso, avise agora mesmo."}')
ON CONFLICT DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
