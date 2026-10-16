-- El trabajo sin persona lee las modalidades de la Prestadora y sus funciones de riesgo legal.
--
-- Las dos preguntas las hace el backend en nombre de quien pide —el Asistente al abrir su perfil
-- o la vidriera, el Cliente al ordenar la lista de Asistentes— y hasta acá las hacía con la llave
-- maestra. Pasan al trabajo de esa Prestadora, que ve sólo lo de la suya.
--
-- No van con la credencial de la persona porque ni el Asistente ni el Cliente alcanzan estas
-- filas: son configuración de la Prestadora.

GRANT SELECT (prestadora_id, modalidad, activa) ON public.prestadora_modalidades TO trabajo_sin_persona;

CREATE POLICY trabajo_sin_persona_lee_modalidades
  ON public.prestadora_modalidades
  FOR SELECT
  TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

GRANT SELECT (prestadora_id, funcion_clave, activa) ON public.configuracion_funciones_intermediacion TO trabajo_sin_persona;

CREATE POLICY trabajo_sin_persona_lee_funciones_intermediacion
  ON public.configuracion_funciones_intermediacion
  FOR SELECT
  TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

NOTIFY pgrst, 'reload schema';
