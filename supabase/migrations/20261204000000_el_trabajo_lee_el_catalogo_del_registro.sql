-- La credencial del trabajo escribe el registro de actividad de su Prestadora, y el disparador
-- `trg_registro_actividad_solo_lo_permitido` corre con los permisos de quien escribe: para revisar
-- las claves del detalle lee `catalogo_datos_del_registro`. Sin permiso de lectura sobre ese
-- catálogo, todo renglón con detalle escrito con esa credencial falla.
--
-- El catálogo son los nombres de los datos que admite el registro: no es de ninguna Prestadora y
-- no lleva datos de nadie.

GRANT SELECT ON public.catalogo_datos_del_registro TO trabajo_sin_persona;

CREATE POLICY catalogo_datos_del_registro_lo_lee_el_trabajo
  ON public.catalogo_datos_del_registro
  FOR SELECT
  TO trabajo_sin_persona
  USING (true);

NOTIFY pgrst, 'reload schema';
