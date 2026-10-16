-- El bot vuelve a contestar cuando la conversación que atendió una persona se da por terminada.
--
-- Cuando una persona contesta desde el Panel, la conversación queda anotada como atendida por
-- una persona y el bot no se mete. Se da por terminada cuando pasan sin mensajes las horas que
-- fija cada Prestadora; el mensaje siguiente abre una conversación nueva, y ésa la atiende el bot.

ALTER TABLE public.conversaciones_whatsapp
  ADD COLUMN atendida_por_una_persona_at timestamptz;

COMMENT ON COLUMN public.conversaciones_whatsapp.atendida_por_una_persona_at IS 'Cuándo contestó una persona desde el Panel por última vez. Mientras tenga valor y la conversación no se haya dado por terminada, el bot no contesta.';

-- Una fila por Prestadora con la clave `prestadora_id`: `sembrar_configuracion_prestadora` se la
-- crea sola a cada Prestadora nueva, con el valor de arranque de la columna.
CREATE TABLE public.configuracion_respuesta_automatica_whatsapp (
  prestadora_id uuid PRIMARY KEY REFERENCES public.prestadoras(id) ON DELETE CASCADE,
  horas_sin_mensajes_para_terminar smallint NOT NULL DEFAULT 24,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT las_horas_estan_en_rango CHECK (horas_sin_mensajes_para_terminar > 0 AND horas_sin_mensajes_para_terminar <= 720)
);

COMMENT ON TABLE public.configuracion_respuesta_automatica_whatsapp IS 'Cómo se comporta el bot de WhatsApp de cada Prestadora. Sin fila, el bot no vuelve a contestar donde ya contestó una persona.';
COMMENT ON COLUMN public.configuracion_respuesta_automatica_whatsapp.horas_sin_mensajes_para_terminar IS 'Cuántas horas sin mensajes dan por terminada una conversación que atendió una persona. Pasadas, el bot vuelve a contestar.';

ALTER TABLE public.configuracion_respuesta_automatica_whatsapp ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_gestiona_configuracion_respuesta_automatica_whatsapp ON public.configuracion_respuesta_automatica_whatsapp
  USING ((prestadora_id = interno.prestadora_actual()) AND (interno.es_superadmin() OR EXISTS (
    SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin_prestadora')))
  WITH CHECK ((prestadora_id = interno.prestadora_actual()) AND (interno.es_superadmin() OR EXISTS (
    SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin_prestadora')));

CREATE POLICY coordinador_lee_configuracion_respuesta_automatica_whatsapp ON public.configuracion_respuesta_automatica_whatsapp
  FOR SELECT USING ((prestadora_id = interno.prestadora_actual()) AND EXISTS (
    SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol = 'coordinador'));

CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.configuracion_respuesta_automatica_whatsapp
  FOR SELECT TO trabajo_sin_persona USING (prestadora_id = interno.prestadora_actual());

REVOKE ALL ON TABLE public.configuracion_respuesta_automatica_whatsapp FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.configuracion_respuesta_automatica_whatsapp TO authenticated;
GRANT ALL ON TABLE public.configuracion_respuesta_automatica_whatsapp TO service_role;
GRANT SELECT ON TABLE public.configuracion_respuesta_automatica_whatsapp TO trabajo_sin_persona;

-- Las Prestadoras que ya existen reciben su fila con el valor de arranque.
INSERT INTO public.configuracion_respuesta_automatica_whatsapp (prestadora_id)
SELECT id FROM public.prestadoras
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
