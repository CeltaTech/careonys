-- El trabajo sin persona lee el catálogo de vías de administración.
--
-- Es un catálogo de fábrica, igual para todas las Prestadoras: no tiene columna de Prestadora ni
-- dato de nadie, y quien tiene sesión ya lo lee entero. Las órdenes de medicación que ve el
-- Asistente se leen con la credencial del trabajo de su Prestadora, y cada orden trae su vía de
-- este catálogo: sin este permiso la lectura falla y el Asistente no ve ninguna.

GRANT SELECT ON public.vias_administracion TO trabajo_sin_persona;

CREATE POLICY vias_administracion_las_lee_el_trabajo
  ON public.vias_administracion
  FOR SELECT
  TO trabajo_sin_persona
  USING (true);

NOTIFY pgrst, 'reload schema';
