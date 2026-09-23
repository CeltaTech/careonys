-- El comprobante que emitió el software de facturación tiene dónde vivir, y la Familia lo baja.
--
-- POR QUÉ. Careonys no emite comprobantes. El software de facturación de la Prestadora emite y le
-- manda el archivo a Careonys, y Careonys lo deja disponible en la aplicación de la Familia para
-- que lo descargue. Hasta hoy de lo emitido volvían tres datos —cómo se llama el comprobante, qué
-- número tiene y por cuánto quedó— y el papel no volvía: la Familia veía el resumen y no tenía de
-- dónde bajar la factura.
--
-- LA RUTA EMPIEZA POR LA PRESTADORA, y la política lo exige: `<prestadora>/<familia>/<archivo>`.
-- Empezando por la factura, el día que dos Prestadoras compartan cualquier cosa las dos verían la
-- misma carpeta.
--
-- EL NOMBRE DEL ARCHIVO LLEVA UN IDENTIFICADOR ÚNICO, así que volver a subir el comprobante de una
-- factura no pisa el anterior. Cuál es el que vale lo dice la columna de la factura.
--
-- SÓLO PDF, Y ACOTADO DE TAMAÑO. Es lo que emite un software de facturación, y un límite que sólo
-- vive en la pantalla actúa después de que el archivo ya ocupó la memoria.
--
-- LA SEGUNDA CARPETA SE COMPARA COMO TEXTO, sin convertirla a identificador: convertir un nombre
-- mal formado revienta la consulta en vez de denegar.
--
-- QUIÉN LO ALCANZA. Quien administra la Prestadora, que es quien ya alcanza la factura. La Familia
-- no llega por acá: las aplicaciones de teléfono no consultan la base, le piden todo al motor, y
-- el motor le entrega una dirección firmada que vence.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
SELECT 'comprobantes-familia', 'comprobantes-familia', false, 5242880,
       ARRAY['application/pdf']::text[]
 WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'comprobantes-familia');

DROP POLICY IF EXISTS el_comprobante_lo_gestiona_quien_administra ON storage.objects;
CREATE POLICY el_comprobante_lo_gestiona_quien_administra ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'comprobantes-familia'
    AND (storage.foldername(name))[1] = interno.current_tenant()::text
    AND (interno.es_admin_prestadora() OR interno.es_superadmin())
  )
  WITH CHECK (
    bucket_id = 'comprobantes-familia'
    AND (storage.foldername(name))[1] = interno.current_tenant()::text
    AND (interno.es_admin_prestadora() OR interno.es_superadmin())
  );

-- Dónde quedó el archivo de esta factura, y cuándo llegó. La ruta no es un secreto por sí misma:
-- el depósito es privado y sin dirección firmada no se abre.
ALTER TABLE public.facturas_familia
  ADD COLUMN IF NOT EXISTS comprobante_archivo text,
  ADD COLUMN IF NOT EXISTS comprobante_subido_at timestamptz;

NOTIFY pgrst, 'reload schema';
