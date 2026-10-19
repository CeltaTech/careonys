-- El pase de guardia no abre ninguna revisión posterior (pendiente #113).
--
-- Una llegada o una salida que quedó sin comprobar se anota con el motivo que eligió el Asistente
-- y nada más. Si quien coordina no atendió la llamada, rigen los protocolos que la Prestadora ya
-- tenga para eso: el sistema no le arma una lista para cerrar después. Salen las tres columnas
-- del cierre, el índice que alimentaba esa lista y la restricción que las ataba entre sí.

BEGIN;

DROP INDEX IF EXISTS public.idx_guardia_comprobaciones_sin_comprobar;

ALTER TABLE public.guardia_comprobaciones
  DROP COLUMN cerrada_en,
  DROP COLUMN cerrada_por,
  DROP COLUMN cerrada_nota;

COMMIT;

NOTIFY pgrst, 'reload schema';
