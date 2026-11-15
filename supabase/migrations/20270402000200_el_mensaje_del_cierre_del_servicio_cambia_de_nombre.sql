-- =============================================================================
-- El mensaje del cierre del Servicio cambia de nombre
-- =============================================================================
--
-- QUÉ HACE
--   Cambia la clave del mensaje que recibe el Asistente cuando se cierra el
--   Servicio de su Paciente: de «cese_de_servicio» a «cierre_del_servicio»,
--   igual que el aviso que lo manda, que ya se llama
--   «aviso_cierre_del_servicio». Alcanza al texto de fábrica y al texto propio
--   que haya cargado cualquier Prestadora.
--
-- POR QUÉ
--   El Asistente independiente no tiene cese: su contratación termina. La
--   palabra sale también de lo guardado.
--
-- QUÉ NO CAMBIA
--   El texto que lee el Asistente, en los tres idiomas.
--
-- QUÉ SE COMPROBÓ ANTES
--   En la base hay dos claves «cese_de_servicio.titulo» y «cese_de_servicio.cuerpo», ninguna
--   «cierre_del_servicio.*», y ninguna tabla tiene clave foránea hacia
--   mensajes_del_sistema.
--
-- CÓMO SE DESHACE
--   El mismo UPDATE con las claves al revés.
-- =============================================================================

BEGIN;

UPDATE public.mensajes_del_sistema
   SET clave = replace(clave, 'cese_de_servicio', 'cierre_del_servicio')
 WHERE clave IN ('cese_de_servicio.titulo', 'cese_de_servicio.cuerpo');

COMMIT;

NOTIFY pgrst, 'reload schema';
