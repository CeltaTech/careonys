-- =============================================================================
-- El logo para impresión deja de aceptar SVG
-- =============================================================================
--
-- QUÉ HACE
--   El depósito `logos-para-impresion` acepta sólo PNG y JPG. Un SVG es texto que
--   puede llevar programas adentro, y revisarlo no da certeza de que no los traiga.
-- =============================================================================

BEGIN;

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['image/png', 'image/jpeg']
 WHERE id = 'logos-para-impresion';

NOTIFY pgrst, 'reload schema';

COMMIT;
