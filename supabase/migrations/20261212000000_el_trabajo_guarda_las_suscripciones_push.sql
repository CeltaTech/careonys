-- El trabajo sin persona guarda la suscripción a las notificaciones de un aparato y anota cuando
-- cambia de dueño.
--
-- El backend lo hacía con la llave maestra porque tiene que ver la anotación que ese aparato ya
-- tenga en la Prestadora, aunque sea de otra persona: si la ve, la pisa y deja el rastro. Pasa al
-- trabajo de esa Prestadora. La política que ya tiene el trabajo sobre las suscripciones lo deja
-- sólo en la suya; faltaba el permiso de escribir esas columnas.

GRANT INSERT (prestadora_id, endpoint, p256dh, auth, user_agent, asistente_id, cliente_id),
      UPDATE (prestadora_id, endpoint, p256dh, auth, user_agent, asistente_id, cliente_id)
  ON public.push_subscriptions TO trabajo_sin_persona;

GRANT INSERT (suscripcion_id, prestadora_anterior, prestadora_nueva, usuario_anterior, usuario_nuevo,
              rol_anterior, rol_nuevo, user_agent)
  ON public.auditoria_cambio_dueno_push TO trabajo_sin_persona;

CREATE POLICY trabajo_sin_persona_anota_cambio_de_dueno ON public.auditoria_cambio_dueno_push
  FOR INSERT TO trabajo_sin_persona
  WITH CHECK (prestadora_anterior = interno.prestadora_actual() AND prestadora_nueva = interno.prestadora_actual());

NOTIFY pgrst, 'reload schema';
