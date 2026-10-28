-- La Configuración del Panel muestra si la información de salud es visible para todos.
--
-- Cuánto rige la restricción de HCE y si el país la exige ya está escrito en
-- `interno.rige_la_restriccion_de_hce` y `interno.el_pais_exige_la_restriccion_de_hce`. Ésta sólo
-- se lo contesta a quien inició sesión, para su Prestadora, así la pantalla no repite la regla.

CREATE FUNCTION public.la_restriccion_de_hce_de_la_sesion()
RETURNS TABLE (rige boolean, la_exige_el_pais boolean)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'interno'
AS $$
  SELECT interno.rige_la_restriccion_de_hce(interno.prestadora_actual()),
         COALESCE(interno.el_pais_exige_la_restriccion_de_hce(interno.prestadora_actual()), false);
$$;

REVOKE ALL ON FUNCTION public.la_restriccion_de_hce_de_la_sesion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.la_restriccion_de_hce_de_la_sesion() TO authenticated;

NOTIFY pgrst, 'reload schema';
