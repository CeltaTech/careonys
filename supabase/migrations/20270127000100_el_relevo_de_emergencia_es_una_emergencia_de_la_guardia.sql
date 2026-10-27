-- «No puedo continuar» deja de colgar de la extensión del turno y pasa a ser una emergencia de la
-- guardia: el Relevo de emergencia.
--
-- Se puede pedir en cualquier momento de la guardia y más de una vez, nunca cierra la guardia, y
-- le hace sonar al Coordinador la misma alarma que una emergencia, con la misma escalera, la misma
-- toma y las mismas políticas. Por eso vive en `emergencias_guardia`: lo que la distingue es una
-- columna, y que el detalle sea optativo, porque quien está en el medio de algo puede no estar en
-- condiciones de escribir nada.
--
-- Las dos columnas de `extensiones_de_turno` que lo guardaban salen, con la política que dejaba
-- al Asistente escribirlas. No tienen ninguna fila cargada.
--
-- Y el aviso al Coordinador cambia de nombre y de texto: el de antes decía que el relevo no había
-- llegado, que es otro caso y tiene su propio aviso. Sólo existen las dos filas base.

ALTER TABLE public.emergencias_guardia
  ADD COLUMN relevo_de_emergencia boolean NOT NULL DEFAULT false,
  ALTER COLUMN detalle DROP NOT NULL,
  ADD CONSTRAINT emergencias_guardia_detalle_salvo_en_el_relevo
    CHECK (relevo_de_emergencia OR detalle IS NOT NULL);

DROP POLICY asistente_avisa_que_no_puede_continuar ON public.extensiones_de_turno;

ALTER TABLE public.extensiones_de_turno
  DROP COLUMN no_puede_continuar_at,
  DROP COLUMN no_puede_continuar_detalle;

DELETE FROM public.mensajes_del_sistema
 WHERE prestadora_id IS NULL AND clave = 'no_puede_continuar_la_extension.asunto';

DELETE FROM public.mensajes_del_sistema
 WHERE prestadora_id IS NULL AND clave = 'no_puede_continuar_la_extension.texto';

INSERT INTO public.mensajes_del_sistema (prestadora_id, clave, i18n)
VALUES
  (NULL, 'relevo_de_emergencia.asunto',
   '{"es-AR": "Relevo de emergencia", "en": "Emergency relief", "pt-BR": "Rendição de emergência"}'),
  (NULL, 'relevo_de_emergencia.texto',
   '{"es-AR": "Guardia del {{fecha}} de {{horaInicio}} a {{horaFin}}. El Asistente pidió un relevo de emergencia y sigue en el domicilio.", "en": "Shift on {{fecha}} from {{horaInicio}} to {{horaFin}}. The care worker requested emergency relief and is still at the home.", "pt-BR": "Plantão de {{fecha}} das {{horaInicio}} às {{horaFin}}. O Assistente pediu uma rendição de emergência e continua no domicílio."}');

NOTIFY pgrst, 'reload schema';
