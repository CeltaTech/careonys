-- El Asistente lee el domicilio temporal de los Pacientes de sus guardias.
--
-- El check-in y la hora estimada de llegada miden contra el domicilio que rige ese día, y lo
-- resuelve `public.domicilios_de_pacientes_en`, que corre con los permisos de quien llama. Con la
-- credencial del Asistente, sin esta política el domicilio temporal no aparecía y se medía contra
-- el de siempre: la alerta de check-in fuera de rango volvía a saltar en falso.
--
-- Alcance: la Prestadora en la que está parado y sólo los Pacientes de sus guardias, con la misma
-- función que ya usa la política de `pacientes`.

CREATE POLICY asistente_lee_domicilios_temporales_de_sus_pacientes
  ON public.domicilios_temporales_paciente
  FOR SELECT
  TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND paciente_id IN (SELECT interno.pacientes_del_asistente())
  );

NOTIFY pgrst, 'reload schema';
