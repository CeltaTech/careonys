-- El pedido de autorización lleva el motivo por el que el Asistente no pudo leer el código QR
-- (pendiente #113).
--
-- Quien coordina lo lee antes de autorizar. Va en columnas propias y no en `motivo_sin_comprobar`
-- porque sobrevive a la autorización: una llegada autorizada queda comprobada, y la restricción
-- de estado exige que una comprobada no tenga motivo de sin comprobar.

BEGIN;

ALTER TABLE public.guardia_comprobaciones
  ADD COLUMN motivo_del_pedido text,
  ADD COLUMN detalle_del_pedido text;

ALTER TABLE public.guardia_comprobaciones
  ADD CONSTRAINT guardia_comprobaciones_motivo_del_pedido_check
  CHECK (motivo_del_pedido IS NULL OR motivo_del_pedido IN ('nadie_para_mostrar', 'sin_camara', 'otro'));

COMMIT;

NOTIFY pgrst, 'reload schema';
