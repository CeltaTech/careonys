-- El aviso de turno de guardia sin cubrir conserva la configuración de cada Prestadora.
-- =====================================================================================
--
-- El cambio de nombre a «turno de guardia» pasó la clave de este aviso a
-- `turno_guardia_sin_cubrir` en el catálogo de avisos, pero la configuración guardada de cada
-- Prestadora quedó con la clave anterior. El catálogo no la encuentra y aplica los valores de
-- fábrica. Esta migración le pone a esa configuración la clave vigente.
--
-- Si una Prestadora ya tuviera las dos claves, se conserva la vigente y se borra la anterior, para
-- no chocar con la clave primaria.

BEGIN;

DELETE FROM public.configuracion_notificaciones v
 WHERE v.evento = 'guardia_sin_cubrir'
   AND EXISTS (SELECT 1 FROM public.configuracion_notificaciones n
                WHERE n.prestadora_id = v.prestadora_id
                  AND n.evento = 'turno_guardia_sin_cubrir');

UPDATE public.configuracion_notificaciones
   SET evento = 'turno_guardia_sin_cubrir'
 WHERE evento = 'guardia_sin_cubrir';

COMMIT;

NOTIFY pgrst, 'reload schema';
