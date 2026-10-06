-- La emergencia insiste a su propio ritmo.
--
-- Hasta ahora una emergencia que nadie tomaba se le volvía a avisar al Coordinador con los mismos
-- tramos que una llegada demorada: cada diez minutos la primera hora. Un aviso de emergencia que
-- llega tarde puede costar una vida, así que tiene su propio intervalo, uno solo, que cada
-- Prestadora cambia. El valor de fábrica es un minuto, y entra también en las Prestadoras que ya
-- existen.
--
-- El borde de arriba, una hora, es el de lo razonable: más que eso ya no es insistir. El backend
-- mira el mismo borde antes de guardar (`MINUTOS_INSISTENCIA_EMERGENCIA`).

ALTER TABLE public.configuracion_escalada_coordinador
  ADD COLUMN minutos_insistencia_emergencia integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT minutos_insistencia_emergencia_razonable
    CHECK (minutos_insistencia_emergencia >= 1 AND minutos_insistencia_emergencia <= 60);

NOTIFY pgrst, 'reload schema';
