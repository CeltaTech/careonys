-- El trabajo sin persona lee las advertencias legales y registra que se mostraron.
--
-- El backend resuelve qué advertencia corresponde al encender una función de riesgo y deja
-- anotado que se avisó, y hasta acá lo hacía con la llave maestra. Pasa al trabajo de esa
-- Prestadora. Las advertencias son del producto, una por país y función, iguales para todas
-- las Prestadoras. El registro, en cambio, es de cada una: el trabajo sólo anota en la suya.

GRANT SELECT (jurisdiccion, funcion_clave, texto_advertencia) ON public.advertencias_legales TO trabajo_sin_persona;

CREATE POLICY trabajo_sin_persona_lee_advertencias_legales ON public.advertencias_legales
  FOR SELECT TO trabajo_sin_persona
  USING (interno.prestadora_actual() IS NOT NULL);

GRANT INSERT (prestadora_id, usuario_id, funcion_clave, jurisdiccion, texto_mostrado)
  ON public.auditoria_advertencias_legales TO trabajo_sin_persona;

CREATE POLICY trabajo_sin_persona_registra_advertencia_mostrada ON public.auditoria_advertencias_legales
  FOR INSERT TO trabajo_sin_persona
  WITH CHECK (prestadora_id = interno.prestadora_actual());

NOTIFY pgrst, 'reload schema';
