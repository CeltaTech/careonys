-- La emergencia se repite cada uno a diez minutos, y no se acepta otro número.
--
-- El borde de arriba era una hora. Más de diez minutos entre un aviso de emergencia y el
-- siguiente ya no es insistir. El backend mira el mismo borde antes de guardar
-- (`MINUTOS_INSISTENCIA_EMERGENCIA`).
--
-- Si alguna Prestadora tuviera guardado más de diez, se la deja en diez antes de poner el borde
-- nuevo, para que la restricción no rechace la migración entera.

UPDATE public.configuracion_escalada_coordinador
   SET minutos_insistencia_emergencia = 10
 WHERE minutos_insistencia_emergencia > 10;

ALTER TABLE public.configuracion_escalada_coordinador
  DROP CONSTRAINT minutos_insistencia_emergencia_razonable,
  ADD CONSTRAINT minutos_insistencia_emergencia_razonable
    CHECK (minutos_insistencia_emergencia >= 1 AND minutos_insistencia_emergencia <= 10);

NOTIFY pgrst, 'reload schema';
