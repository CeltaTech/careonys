-- El trabajo sin persona escribe el hilo entre un Cliente y un Asistente del Match.
--
-- Leer el hilo lo lee cada punta con su propia credencial, que ya podía. Escribirlo no: abrir una
-- conversación, dejar un mensaje, darlo por leído y anotar la sala de la videollamada son cosas que
-- el backend hace después de comprobar lo que la base no puede comprobar —que el Asistente esté en
-- la vidriera, que la Prestadora ofrezca la modalidad, de qué lado escribe quien escribe—. Con la
-- credencial de la persona se podrían hacer salteando esas comprobaciones, porque la persona tiene
-- esa misma credencial en el teléfono. Las escribe el backend, con el trabajo de la Prestadora del
-- hilo.
--
-- Se le da sólo lo que se usa, y nada de borrar.

GRANT SELECT (id, prestadora_id, cliente_id, asistente_id, ultimo_mensaje_at, sala_videollamada, sala_abierta_at)
  ON public.conversaciones_intermediacion TO trabajo_sin_persona;
GRANT INSERT (prestadora_id, cliente_id, asistente_id)
  ON public.conversaciones_intermediacion TO trabajo_sin_persona;
GRANT UPDATE (ultimo_mensaje_at, sala_videollamada, sala_abierta_at)
  ON public.conversaciones_intermediacion TO trabajo_sin_persona;

GRANT SELECT (id, prestadora_id, conversacion_id, lado, cuerpo, automatico, created_at, leido_at, regla_tapada)
  ON public.mensajes_intermediacion TO trabajo_sin_persona;
GRANT INSERT (prestadora_id, conversacion_id, lado, autor_usuario_id, cuerpo, automatico)
  ON public.mensajes_intermediacion TO trabajo_sin_persona;
GRANT UPDATE (leido_at)
  ON public.mensajes_intermediacion TO trabajo_sin_persona;

CREATE POLICY trabajo_sin_persona_ve_los_hilos ON public.conversaciones_intermediacion
  FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());
CREATE POLICY trabajo_sin_persona_abre_los_hilos ON public.conversaciones_intermediacion
  FOR INSERT TO trabajo_sin_persona
  WITH CHECK (prestadora_id = interno.prestadora_actual());
CREATE POLICY trabajo_sin_persona_actualiza_los_hilos ON public.conversaciones_intermediacion
  FOR UPDATE TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual())
  WITH CHECK (prestadora_id = interno.prestadora_actual());

CREATE POLICY trabajo_sin_persona_ve_los_mensajes_del_hilo ON public.mensajes_intermediacion
  FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());
CREATE POLICY trabajo_sin_persona_escribe_en_el_hilo ON public.mensajes_intermediacion
  FOR INSERT TO trabajo_sin_persona
  WITH CHECK (prestadora_id = interno.prestadora_actual());
CREATE POLICY trabajo_sin_persona_da_por_leido ON public.mensajes_intermediacion
  FOR UPDATE TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual())
  WITH CHECK (prestadora_id = interno.prestadora_actual());

NOTIFY pgrst, 'reload schema';
