-- Salen tres funciones que contradicen decisiones del Desarrollador.
--
-- En Match la Prestadora nunca le pone precio al trabajo del Asistente: lo acuerdan el Asistente y
-- el Cliente, y el precio acordado no se conoce. Sale «Precio u horario fijado por la plataforma».
--
-- En Match no hay mediación de conflictos. Sale «Mediación de conflictos».
--
-- En prestación directa la Prestadora siempre fija el horario del Asistente, sin ningún aviso.
-- Sale el aviso de horarios fijos.
--
-- El registro de advertencias mostradas no se toca: lo que se avisó queda como se avisó.

BEGIN;

DELETE FROM public.configuracion_funciones_intermediacion
WHERE funcion_clave IN ('precio_horario_fijado_plataforma', 'mediacion_conflictos_intermediacion');

DELETE FROM public.advertencias_legales
WHERE funcion_clave IN ('precio_horario_fijado_plataforma', 'mediacion_conflictos_intermediacion', 'horarios_fijos');

DELETE FROM public.catalogo_funciones_intermediacion
WHERE clave IN ('precio_horario_fijado_plataforma', 'mediacion_conflictos_intermediacion');

-- Las tres que quedan siguen en el orden del documento legal, sin huecos.
UPDATE public.catalogo_funciones_intermediacion SET orden = 3 WHERE clave = 'exclusividad_intermediacion';

COMMIT;

NOTIFY pgrst, 'reload schema';
