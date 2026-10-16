-- El trabajo sin persona lee y guarda dónde trabaja cada persona de su Prestadora.
--
-- Los lugares que acepta cubrir una Asistente y el alcance de una coordinadora se cargan desde el
-- Panel con la credencial del trabajo de la Prestadora sobre la que se está parado: con la de quien
-- coordina, a la Asistente que todavía no tiene ningún lugar no la vería, y la administración no
-- encontraría a la coordinadora cuyo alcance cambia. Guardar es borrar los de esa persona y
-- escribir los elegidos, así que hacen falta las dos cosas; cambiar un renglón no.
--
-- Y el catálogo para elegir trae las zonas con sus lugares, así que el trabajo lee también qué
-- lugares abarca cada zona de su Prestadora.

GRANT INSERT, DELETE ON public.asistente_lugares TO trabajo_sin_persona;
GRANT INSERT, DELETE ON public.usuario_lugares TO trabajo_sin_persona;

GRANT SELECT ON public.zona_lugares TO trabajo_sin_persona;

CREATE POLICY zona_lugares_los_lee_el_trabajo
  ON public.zona_lugares
  FOR SELECT
  TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

NOTIFY pgrst, 'reload schema';
