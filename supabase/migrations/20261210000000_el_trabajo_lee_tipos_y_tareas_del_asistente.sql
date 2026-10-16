-- El trabajo sin persona lee los tipos de Asistente y sus tareas.
--
-- El backend arma con esto lo que le toca hacer a un Asistente —lo pide el Asistente al abrir
-- una guardia y el Cliente al ver quién lo cuida— y hasta acá lo leía con la llave maestra. Pasa
-- al trabajo de esa Prestadora. Las políticas de lectura de las dos tablas ya alcanzan a todo
-- rol: un tipo o una tarea del producto, o una propia de la Prestadora actual.

GRANT SELECT (id, clave, nombre, prestadora_id) ON public.tipos_asistente TO trabajo_sin_persona;

GRANT SELECT (id, tipo_asistente_id, prestadora_id, pais, clase, clave, texto, descripcion, orden)
  ON public.tareas_tipo_asistente TO trabajo_sin_persona;

-- La política de las tareas pregunta el país de la Prestadora actual.
GRANT EXECUTE ON FUNCTION interno.pais_de_la_organizacion() TO trabajo_sin_persona;

NOTIFY pgrst, 'reload schema';
