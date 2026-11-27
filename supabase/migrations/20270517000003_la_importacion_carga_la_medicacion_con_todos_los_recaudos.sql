-- La medicación que carga la importación cumple todos los recaudos, no sólo el de la Prestadora.
--
-- La regla que ya tenían los trabajos automáticos sobre las indicaciones de medicación sólo mira
-- que la fila sea de su Prestadora. Como las reglas que permiten se suman entre sí, alcanzaba con
-- ésa para que la importación cargara una indicación pendiente, para un Paciente de otra
-- Prestadora, a nombre de un Cliente que no es el de ese Paciente o pedida por una persona de
-- otra Prestadora. La regla que acota la carga pasa a exigir todo:
--   - que sea la importación;
--   - que la fila sea de su Prestadora;
--   - que entre aceptada;
--   - que el Paciente sea de su Prestadora y el Cliente sea el de ese Paciente;
--   - que la pida una persona de su Prestadora.
-- La regla que permitía lo mismo por separado queda de más y se quita, para que la condición viva
-- en un solo lugar.
--
-- Corre entera o no corre.

BEGIN;

ALTER POLICY la_carga_de_medicacion_es_solo_de_la_importacion
  ON public.indicaciones_medicacion
  WITH CHECK (
    interno.es_la_importacion()
    AND prestadora_id = interno.prestadora_actual()
    AND estado = 'aceptada'
    AND EXISTS (SELECT 1 FROM public.pacientes p
                 WHERE p.id = indicaciones_medicacion.paciente_id
                   AND p.prestadora_id = interno.prestadora_actual()
                   AND p.cliente_id = indicaciones_medicacion.cliente_id)
    AND EXISTS (SELECT 1 FROM public.usuarios u
                 WHERE u.id = indicaciones_medicacion.solicitado_por
                   AND u.prestadora_id = interno.prestadora_actual())
  );

DROP POLICY la_importacion_carga_indicaciones_medicacion ON public.indicaciones_medicacion;

COMMIT;

NOTIFY pgrst, 'reload schema';
