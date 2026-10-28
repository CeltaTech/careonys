-- Quien inició sesión pregunta si la regla de salud le deja leer a un Paciente.
--
-- Algunas lecturas de información de salud las hace el backend con el trabajo de la Prestadora,
-- porque la credencial de la persona perdería filas por otra razón —el reporte trae pegada una
-- guardia que no fue suya—. Esas lecturas no pasan por la política restrictiva
-- `la_informacion_de_salud_la_ve_quien_atiende`, que es de `authenticated`. Antes de hacerlas, el
-- backend pregunta con la credencial de la persona si esa regla la deja, y si no, no lee.
--
-- La decisión sigue escrita una sola vez, en `interno.alcanza_la_informacion_de_salud`. Ésta sólo
-- la publica para quien inició sesión, y contesta falso por un Paciente de otra Prestadora.

CREATE FUNCTION public.alcanza_la_informacion_de_salud_la_sesion(p_paciente uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $$
  SELECT COALESCE(
    interno.usuario_de_la_sesion() IS NOT NULL
    AND EXISTS (SELECT 1 FROM pacientes p
                 WHERE p.id = p_paciente
                   AND p.prestadora_id = interno.prestadora_actual())
    AND interno.alcanza_la_informacion_de_salud(p_paciente),
    false);
$$;

REVOKE ALL ON FUNCTION public.alcanza_la_informacion_de_salud_la_sesion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.alcanza_la_informacion_de_salud_la_sesion(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
