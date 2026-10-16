-- El trabajo sin persona anota en su Prestadora con qué regla se le reenvían las respuestas.
--
-- Cuando la Prestadora cambia su casilla de respuestas desde el Panel, el backend corta el
-- reenvío viejo, abre el nuevo y anota el identificador de la regla en su fila, que es con lo que
-- después se lo corta. Ese identificador lo escribe el sistema y nunca una persona: si lo pudiera
-- escribir quien administra, podría hacer que el backend cortara la regla de otra Prestadora. Por
-- eso el permiso es del trabajo de esa Prestadora, y sólo sobre esa columna.

GRANT UPDATE (regla_reenvio) ON public.prestadoras TO trabajo_sin_persona;

CREATE POLICY trabajo_sin_persona_anota_el_reenvio
  ON public.prestadoras
  FOR UPDATE
  TO trabajo_sin_persona
  USING (id = interno.prestadora_actual())
  WITH CHECK (id = interno.prestadora_actual());

NOTIFY pgrst, 'reload schema';
