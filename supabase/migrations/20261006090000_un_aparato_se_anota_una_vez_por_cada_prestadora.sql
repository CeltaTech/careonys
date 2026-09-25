-- Un aparato se anota una vez por cada Prestadora, no una sola vez en total.
--
-- QUÉ PASABA. La dirección de entrega que emite el navegador para recibir notificaciones es una
-- sola por aparato, y la tabla la exigía única en todas las Prestadoras juntas. Un Asistente que
-- trabaja en dos y usa el mismo teléfono quedaba anotado en la segunda pisando la anotación de la
-- primera, y a partir de ahí la primera ya no tenía a quién mandarle: dejaba de recibir sus
-- notificaciones sin que nadie se enterara.
--
-- Y para detectar ese cruce, el código tenía que leer la tabla entera sin condición de Prestadora,
-- que es justo lo que el aislamiento no admite.
--
-- QUÉ PASA AHORA. El aparato se anota una vez por Prestadora. El mismo teléfono puede figurar dos
-- veces, una por cada una, y cada Prestadora le manda lo suyo. Adentro de una misma Prestadora la
-- dirección sigue siendo única, que es lo que hace falta para que dos personas compartiendo un
-- teléfono se resuelva pisando, como corresponde.
--
-- No hace falta tocar ninguna fila: la condición nueva es menos exigente que la que se va.

ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_endpoint_key;

ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_prestadora_endpoint_key UNIQUE (prestadora_id, endpoint);

NOTIFY pgrst, 'reload schema';
