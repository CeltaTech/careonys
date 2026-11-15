-- =============================================================================
-- El aviso del cierre del servicio al Asistente cambia de nombre guardado
-- =============================================================================
--
-- QUÉ HACE
--   Renombra la tabla de configuración del aviso que recibe el Asistente
--   cuando termina el Servicio a un Paciente, con su clave, su relación con
--   la Prestadora y sus dos políticas con nombre propio. Pasa también la
--   clave del evento en la configuración de notificaciones.
--
-- POR QUÉ
--   El nombre decía «cese», que en el glosario es el fin del vínculo de un
--   empleado. Este aviso es del cierre de un Servicio. El texto que ve el
--   Asistente y el que ve la Prestadora no cambian.
--
-- QUÉ SE COMPROBÓ
--   La tabla tiene 2 filas, que se conservan: es un cambio de nombre, no una
--   tabla nueva. configuracion_notificaciones no tiene filas con el evento
--   viejo; la actualización queda igual por si una base las tuviera.
--
-- CÓMO SE DESHACE
--   Con otra migración adelante que haga los mismos cambios de nombre al revés.
-- =============================================================================

BEGIN;

ALTER TABLE public.configuracion_aviso_cese_asistente
  RENAME TO configuracion_aviso_cierre_del_servicio;
ALTER TABLE public.configuracion_aviso_cierre_del_servicio
  RENAME CONSTRAINT configuracion_aviso_cese_asistente_pkey TO configuracion_aviso_cierre_del_servicio_pkey;
ALTER TABLE public.configuracion_aviso_cierre_del_servicio
  RENAME CONSTRAINT configuracion_aviso_cese_asistente_prestadora_id_fkey TO configuracion_aviso_cierre_del_servicio_prestadora_id_fkey;
ALTER POLICY admin_gestiona_configuracion_aviso_cese_asistente ON public.configuracion_aviso_cierre_del_servicio
  RENAME TO admin_gestiona_configuracion_aviso_cierre_del_servicio;
ALTER POLICY coordinador_lee_configuracion_aviso_cese_asistente ON public.configuracion_aviso_cierre_del_servicio
  RENAME TO coordinador_lee_configuracion_aviso_cierre_del_servicio;

UPDATE public.configuracion_notificaciones
   SET evento = 'aviso_cierre_del_servicio'
 WHERE evento = 'aviso_cese_asistente';

COMMIT;

NOTIFY pgrst, 'reload schema';
