-- Sale «Exclusividad» de las funciones de riesgo legal de Match.
--
-- El interruptor sólo mostraba un aviso: ninguna parte del sistema lo consultaba. Y los mismos
-- Asistentes trabajan en Match y en prestación directa, así que la Prestadora no les exige
-- exclusividad.
--
-- El registro de advertencias mostradas no se toca: lo que se avisó queda como se avisó.

BEGIN;

DELETE FROM public.configuracion_funciones_intermediacion
WHERE funcion_clave = 'exclusividad_intermediacion';

DELETE FROM public.advertencias_legales
WHERE funcion_clave = 'exclusividad_intermediacion';

DELETE FROM public.catalogo_funciones_intermediacion
WHERE clave = 'exclusividad_intermediacion';

COMMIT;

NOTIFY pgrst, 'reload schema';
