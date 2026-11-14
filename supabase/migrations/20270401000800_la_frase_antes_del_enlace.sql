-- =============================================================================
-- La frase antes del enlace se nombra por lo que es
-- =============================================================================
--
-- QUÉ HACE
--   Las dos frases que van antes del enlace en el correo de activación de la
--   cuenta y en el de recuperación de la contraseña se guardaban con la clave
--   `invitacion_al_enlace`. Ninguna de las dos es una invitación: es la frase que
--   va antes del enlace. Pasan a llamarse `antes_del_enlace`. El texto de cada
--   una no cambia. Y dos comentarios de la base que hablaban de invitar dicen
--   ahora qué es cada cosa.
--
-- QUÉ NO CAMBIA
--   El backend lee los mensajes una sola vez, al arrancar. El que está corriendo
--   conserva las frases con la clave vieja hasta que se despliega el que pide la
--   nueva.
-- =============================================================================

BEGIN;

UPDATE public.mensajes_del_sistema
   SET clave = replace(clave, '.invitacion_al_enlace', '.antes_del_enlace')
 WHERE clave IN ('activacion_cuenta.invitacion_al_enlace', 'recuperacion_clave.invitacion_al_enlace');

-- Ninguna de las puertas que frena la modalidad es una invitación: son la guardia, la asignación
-- y la serie, que es lo que llama a esta función.
COMMENT ON FUNCTION interno.asistente_trabaja_en_modalidad(uuid, text) IS 'Si este Asistente trabaja en esa modalidad. La usan las tres puertas por las que un Asistente queda a cargo: la guardia, la asignación y la serie (regla 12).';

COMMENT ON TABLE public.reglas_de_los_mensajes IS 'Que no puede viajar adentro de un mensaje: el telefono, el correo, el domicilio, el nombre de usuario de otra aplicacion y el pedido de seguir la charla en otro lado. Es dato y no codigo: se agrega una regla sin publicar ninguna version. La aplica el disparador que tapa el texto antes de guardarlo.';

COMMIT;

NOTIFY pgrst, 'reload schema';
