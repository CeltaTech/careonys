-- =============================================================================
-- El logo para impresión
-- =============================================================================
--
-- QUÉ HACE
--   La Prestadora puede cargar un segundo logo, el que va en los documentos que
--   se imprimen: presupuestos, facturas, correspondencia. Acepta PNG, JPG o SVG.
--   El logo de internet (`prestadoras.logo_url`) sigue como está.
--
--   El archivo vive en un depósito privado nuevo, `logos-para-impresion`, en la
--   carpeta de cada Prestadora. Es privado porque un SVG puede llevar programas
--   adentro, y un archivo así no se sirve con dirección pública: se entrega con
--   enlace temporal y sólo a quien genera documentos.
--
--   Leerlo puede el personal del Panel de la Prestadora, que es quien genera
--   documentos. Subirlo, cambiarlo y quitarlo, sólo su Administración, igual que
--   el logo de internet.
--
--   La ruta del archivo se anota en `prestadoras.logo_impresion_ruta`.
-- =============================================================================

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('logos-para-impresion', 'logos-para-impresion', false, 2097152,
        ARRAY['image/png', 'image/jpeg', 'image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY logos_para_impresion_los_lee_el_personal
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'logos-para-impresion'
         AND (storage.foldername(name))[1] = interno.prestadora_actual()::text
         AND interno.es_personal_de_la_prestadora());

CREATE POLICY logos_para_impresion_los_sube_la_administracion
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'logos-para-impresion'
              AND (storage.foldername(name))[1] = interno.prestadora_actual()::text
              AND (interno.es_admin_prestadora() OR interno.es_superadmin()));

CREATE POLICY logos_para_impresion_los_reemplaza_la_administracion
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'logos-para-impresion'
         AND (storage.foldername(name))[1] = interno.prestadora_actual()::text
         AND (interno.es_admin_prestadora() OR interno.es_superadmin()))
  WITH CHECK (bucket_id = 'logos-para-impresion'
              AND (storage.foldername(name))[1] = interno.prestadora_actual()::text
              AND (interno.es_admin_prestadora() OR interno.es_superadmin()));

CREATE POLICY logos_para_impresion_los_borra_la_administracion
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'logos-para-impresion'
         AND (storage.foldername(name))[1] = interno.prestadora_actual()::text
         AND (interno.es_admin_prestadora() OR interno.es_superadmin()));

ALTER TABLE public.prestadoras ADD COLUMN logo_impresion_ruta text;

COMMENT ON COLUMN public.prestadoras.logo_impresion_ruta IS 'Ruta del logo para impresión adentro del depósito logos-para-impresion: el que va en los documentos que se imprimen. Vacío significa que no lo cargó: en ese caso el documento usa el logo de internet si es PNG o JPG, y si no sale sin logo.';

-- El nombre de fantasía y los dos logos los cambia el backend con el trabajo de la Prestadora,
-- porque en `prestadoras` sólo escribe el Superadmin. El trabajo cambia nada más que las columnas
-- que se le conceden una por una, y a estas tres no se le habían concedido: el cambio del nombre
-- y del logo desde Configuración fallaba con permiso denegado.
GRANT UPDATE (nombre_fantasia, logo_url, logo_impresion_ruta) ON TABLE public.prestadoras TO trabajo_sin_persona;

NOTIFY pgrst, 'reload schema';

COMMIT;
