-- La aplicación del Cliente deja la llave maestra. Dos cosas que muestra no las puede leer el
-- Cliente con su propio acceso, y el backend las pide con el trabajo de su Prestadora, que las
-- políticas ya acotan a ella:
--
-- * las alertas de la revisión automática en la pantalla del Paciente, que la ruta muestra aunque
--   la persona autorizada no tenga el acceso a alertas;
-- * las calificaciones públicas de la vidriera del Match, que dejaron otros Clientes.
--
-- Sólo las columnas que esas pantallas leen, y sólo lectura.

GRANT SELECT (id, prestadora_id, paciente_id, nivel, descripcion, created_at, resuelta_at)
  ON public.alertas TO trabajo_sin_persona;

GRANT SELECT (id, prestadora_id, asistente_id, estrellas, comentario, visible_publica, created_at)
  ON public.calificaciones_asistente TO trabajo_sin_persona;

NOTIFY pgrst, 'reload schema';
