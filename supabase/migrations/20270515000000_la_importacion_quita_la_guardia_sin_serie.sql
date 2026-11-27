-- La importación de Servicios quita la guardia del cronograma que agregó y no llegó a usar.
--
-- Al importar un Servicio en curso, cada renglón agrega su guardia al cronograma y enseguida crea
-- la serie de turnos de guardia que la usa. Si la base rechaza la serie (el horario no entra en el
-- período del Servicio, por ejemplo), la guardia recién agregada quedaría en el cronograma sin
-- ninguna serie. Con este permiso, la importación la quita en ese mismo momento.
--
-- Alcanza sólo a la importación, y sólo en la Prestadora para la que trabaja. Una guardia que ya
-- tiene turnos de guardia no se puede quitar: lo impide el disparador que ya tiene la tabla.

BEGIN;

GRANT DELETE ON TABLE public.cronograma_de_guardias TO trabajo_sin_persona;

CREATE POLICY la_importacion_quita_la_guardia_sin_serie
  ON public.cronograma_de_guardias
  FOR DELETE TO trabajo_sin_persona
  USING (interno.es_la_importacion() AND prestadora_id = interno.prestadora_actual());

COMMIT;

NOTIFY pgrst, 'reload schema';
