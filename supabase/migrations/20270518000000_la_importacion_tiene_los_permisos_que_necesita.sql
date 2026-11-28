-- La importación tiene todos los permisos que necesita para no perder nada.
--
-- Faltaban dos, y por los dos se perdía información sin que nadie lo viera:
--
--   - El archivo original del lote y los documentos de la historia anterior los guarda la
--     importación trabajando como el rol trabajo_sin_persona. Las reglas de esos depósitos ya
--     estaban escritas para ese rol, pero sin permiso sobre el esquema de archivos Postgres frena
--     antes de mirar las reglas, y el archivo no se guardaba. Se dan los mismos permisos que tiene
--     la base de producción, para que una base reconstruida desde cero se comporte igual. Qué
--     archivos alcanza lo siguen decidiendo las reglas de cada depósito, que exigen que la ruta
--     empiece por la Organización de la sesión.
--
--   - Al cargar la medicación, la importación anota en el consentimiento quién la cargó, igual
--     que cuando la pide la familia, pero esa columna no estaba entre las que puede escribir.
--     Cada medicación importada fallaba y quedaba sólo en la historia anterior. La regla que acota
--     la carga pasa a exigir además que quien la cargó sea una persona de su Prestadora, como ya
--     lo exige para quien pidió la indicación.

BEGIN;

GRANT USAGE ON SCHEMA storage TO trabajo_sin_persona;
GRANT SELECT ON TABLE storage.buckets TO trabajo_sin_persona;
GRANT SELECT, INSERT, UPDATE ON TABLE storage.objects TO trabajo_sin_persona;

DROP POLICY la_importacion_carga_consentimientos_medicacion ON public.consentimientos_medicacion;

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
    AND EXISTS (SELECT 1 FROM public.usuarios u
                 WHERE u.id = consentimientos_medicacion.cargado_por
                   AND u.prestadora_id = interno.prestadora_actual())
  );

GRANT INSERT (cargado_por) ON TABLE public.consentimientos_medicacion TO trabajo_sin_persona;

COMMIT;

NOTIFY pgrst, 'reload schema';
