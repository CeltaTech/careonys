-- El código de presencia se guardaba uno por persona: el Cliente o el Asistente que se va. Cuando
-- varias personas autorizadas del mismo Cliente lo mostraban a la vez en sus teléfonos, cada pedido
-- pisaba el del otro y alguno quedaba mostrando un código que ya no servía.
--
-- Pasa a guardarse uno por pedido, cada uno con su propio vencimiento. Con eso deja de hacer falta
-- guardar el código anterior al lado del actual: cada uno vale lo suyo, sin importar cuántos
-- teléfonos lo estén mostrando.
BEGIN;

DROP TRIGGER guardar_codigo_de_presencia_anterior ON public.codigos_de_presencia;
DROP FUNCTION interno.guardar_codigo_de_presencia_anterior();

ALTER TABLE public.codigos_de_presencia
  DROP CONSTRAINT codigos_de_presencia_sujeto_unico,
  DROP COLUMN codigo_verificador_anterior,
  DROP COLUMN anterior_expira_en;

CREATE INDEX idx_codigos_de_presencia_sujeto ON public.codigos_de_presencia (sujeto_id, expira_en);

COMMIT;

NOTIFY pgrst, 'reload schema';
