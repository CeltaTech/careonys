-- El descanso que la Coordinadora anota después de que pasó. La base le deja cargarlo sólo a la
-- administración (`la_administracion_carga_un_descanso`), y quien coordina también lo hace: el
-- backend lee la guardia con la credencial de quien pide, y si la base se la dejó ver, anota el
-- descanso con el trabajo de esa Prestadora. Sólo agregar y leer lo agregado: corregir o borrar
-- un descanso no es de este trabajo.

GRANT SELECT (id, prestadora_id, guardia_id, inicio_at, fin_at, nota, registrado_por),
      INSERT (prestadora_id, guardia_id, inicio_at, fin_at, nota, registrado_por)
  ON public.descansos_guardia TO trabajo_sin_persona;

CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.descansos_guardia
  FOR ALL TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual())
  WITH CHECK (prestadora_id = interno.prestadora_actual());

NOTIFY pgrst, 'reload schema';
