-- El Servicio nace junto con el Cliente: en el alta desde el Panel con un Cliente nuevo y en la
-- importación. Las dos crean el Cliente con la credencial del trabajo sin persona, de a una
-- Prestadora, así que esa credencial también tiene que poder crear su Servicio, y borrarlo si el
-- alta se deshace a mitad de camino.

BEGIN;

GRANT INSERT (prestadora_id, etiqueta, tipo_contratante, contratante_id, contratante_persona_id)
  ON public.servicios TO trabajo_sin_persona;
GRANT DELETE ON public.servicios TO trabajo_sin_persona;

DROP POLICY IF EXISTS trabajo_sin_persona_de_esta_prestadora ON public.servicios;
CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.servicios
  FOR ALL TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual())
  WITH CHECK (prestadora_id = interno.prestadora_actual());

NOTIFY pgrst, 'reload schema';

COMMIT;
