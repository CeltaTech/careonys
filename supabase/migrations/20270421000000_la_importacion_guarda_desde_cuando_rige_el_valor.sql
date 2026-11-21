-- La importación de Asistentes desde una planilla guarda la fecha desde la que rige el valor hora.
-- La importación trabaja sin la sesión de una persona, con un permiso que alcanza sólo a las
-- columnas que carga. Hasta ahora cargaba el valor hora sin su fecha, y la base le ponía la de hoy.
-- Con este permiso puede cargar también la fecha que trae la planilla. Si la planilla no la trae,
-- la base sigue poniendo la de hoy.

GRANT INSERT (rige_desde) ON TABLE public.remuneraciones_asistente TO trabajo_sin_persona;

NOTIFY pgrst, 'reload schema';
