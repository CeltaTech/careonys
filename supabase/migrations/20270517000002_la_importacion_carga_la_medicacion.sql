-- La importación carga la medicación que trae la Prestadora.
--
-- La medicación importada entra vigente, y con ella el documento de consentimiento que la familia
-- tiene que firmar, que entra pendiente de firma. Hasta ahora la importación no podía cargar
-- ninguna de las dos cosas.
--
-- Lo que se le da es sólo eso:
--   - Sólo la importación. Los demás trabajos automáticos siguen sin poder cargar medicación.
--   - Sólo cargar. No modifica ni borra ninguna indicación ni ningún consentimiento.
--   - La indicación entra aceptada, para un Paciente de su Prestadora y a nombre del Cliente de
--     ese Paciente, pedida por una persona de su Prestadora.
--   - El consentimiento entra pendiente de firma, sin firmante y sin documento firmado, para una
--     indicación de su Prestadora. Esas columnas no se le dan: quedan como nacen.
--
-- Corre entera o no corre.

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- 1. Las indicaciones de medicación
-- ---------------------------------------------------------------------------------------------

-- La regla que ya existía para los trabajos automáticos alcanza a todos. Esta otra se suma a
-- ella y la acota: para cargar, además, tiene que ser la importación.
CREATE POLICY la_carga_de_medicacion_es_solo_de_la_importacion
  ON public.indicaciones_medicacion
  AS RESTRICTIVE
  FOR INSERT TO trabajo_sin_persona
  WITH CHECK (interno.es_la_importacion());

CREATE POLICY la_importacion_carga_indicaciones_medicacion
  ON public.indicaciones_medicacion
  FOR INSERT TO trabajo_sin_persona
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

GRANT INSERT (prestadora_id, paciente_id, cliente_id, medicamento, dosis, frecuencia,
              via_administracion_id, fecha_desde, fecha_hasta, nota_aclaratoria, estado,
              solicitado_por)
  ON TABLE public.indicaciones_medicacion TO trabajo_sin_persona;

-- ---------------------------------------------------------------------------------------------
-- 2. Los consentimientos de medicación
-- ---------------------------------------------------------------------------------------------

-- La importación carga el consentimiento y lo lee para devolver su identificador. Lee sólo los
-- de su Prestadora.
CREATE POLICY la_importacion_carga_consentimientos_medicacion
  ON public.consentimientos_medicacion
  FOR INSERT TO trabajo_sin_persona
  WITH CHECK (
    interno.es_la_importacion()
    AND prestadora_id = interno.prestadora_actual()
    AND estado = 'pendiente_firma'
    AND EXISTS (SELECT 1 FROM public.indicaciones_medicacion i
                 WHERE i.id = consentimientos_medicacion.indicacion_id
                   AND i.prestadora_id = interno.prestadora_actual())
  );

CREATE POLICY la_importacion_lee_consentimientos_medicacion
  ON public.consentimientos_medicacion
  FOR SELECT TO trabajo_sin_persona
  USING (interno.es_la_importacion() AND prestadora_id = interno.prestadora_actual());

GRANT INSERT (prestadora_id, indicacion_id, documento_texto, documento_verificador, documento_idioma)
  ON TABLE public.consentimientos_medicacion TO trabajo_sin_persona;

GRANT SELECT (id, prestadora_id, indicacion_id, estado)
  ON TABLE public.consentimientos_medicacion TO trabajo_sin_persona;

COMMIT;

NOTIFY pgrst, 'reload schema';
