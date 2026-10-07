-- «Ficha» dejó de nombrar al Asistente: lo suyo es el Legajo. La palabra retirada sale también de
-- lo guardado.
--
-- Sólo cambia el nombre. Las políticas que la usan guardan el identificador interno de la función,
-- no su nombre, así que siguen apuntando a la misma; y los permisos viajan con ella.

alter function interno.es_su_propia_ficha_de_asistente(uuid)
  rename to es_su_propio_legajo_de_asistente;

NOTIFY pgrst, 'reload schema';
