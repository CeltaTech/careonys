-- Las conversaciones de WhatsApp, recortadas por la zona del Asistente.
-- ============================================================================
--
-- Cualquier Coordinador leía y escribía todas las conversaciones de WhatsApp de la Prestadora. Una
-- conversación es con un Asistente, o con un número que todavía no es de ninguno. Se aplica la
-- misma regla que ya tienen los mensajes internos de los Asistentes (`mensajes_asistente`): la
-- conversación de un Asistente la ve el Coordinador que lo alcanza por zona, o quien cubre su
-- ausencia (`coordinador_alcanza_asistente`). La de un número sin Asistente la ven todos, porque
-- todavía no se sabe a quién le toca.

CREATE OR REPLACE FUNCTION interno.coordinador_ve_la_conversacion(p_conversacion uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, interno
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversaciones_whatsapp c
     WHERE c.id = p_conversacion
       AND c.prestadora_id = interno.prestadora_actual()
       AND interno.es_coordinador()
       AND (c.asistente_id IS NULL OR interno.coordinador_alcanza_asistente(c.asistente_id))
  );
$$;

REVOKE ALL ON FUNCTION interno.coordinador_ve_la_conversacion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.coordinador_ve_la_conversacion(uuid) TO authenticated;

DROP POLICY IF EXISTS coordinador_gestiona_conversaciones_whatsapp ON public.conversaciones_whatsapp;
CREATE POLICY coordinador_gestiona_conversaciones_whatsapp_de_su_zona ON public.conversaciones_whatsapp
  FOR ALL TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND interno.es_coordinador()
    AND (asistente_id IS NULL OR interno.coordinador_alcanza_asistente(asistente_id))
  )
  WITH CHECK (
    prestadora_id = interno.prestadora_actual()
    AND interno.es_coordinador()
    AND (asistente_id IS NULL OR interno.coordinador_alcanza_asistente(asistente_id))
  );

DROP POLICY IF EXISTS coordinador_gestiona_mensajes_whatsapp ON public.mensajes_whatsapp;
CREATE POLICY coordinador_gestiona_mensajes_whatsapp_de_su_zona ON public.mensajes_whatsapp
  FOR ALL TO authenticated
  USING (prestadora_id = interno.prestadora_actual() AND interno.coordinador_ve_la_conversacion(conversacion_id))
  WITH CHECK (prestadora_id = interno.prestadora_actual() AND interno.coordinador_ve_la_conversacion(conversacion_id));

NOTIFY pgrst, 'reload schema';
