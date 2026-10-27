-- Los papeles firmados del Pagador y de las personas autorizadas se abren con la credencial de
-- quien pide (paso 9 de «Los cimientos»).
--
-- Hasta acá el Panel los abría con la llave maestra: la ruta deja entrar a quien edita el Cliente,
-- y el depósito sólo a quien puede cargar la firma. La regla que vale es otra y es una sola: el
-- archivo lo lee quien ve la fila que lo nombra. La fila ya dice quién la ve, así que el depósito
-- no repite la decisión con un permiso distinto.
--
-- Y de paso se cierran dos cosas:
--   - Las tablas del Pagador las leía cualquiera de la Prestadora, también un Cliente o un
--     Asistente con su sesión. Sólo las lee el Panel, así que las lee sólo el personal.
--   - El titular no podía abrir su hoja firmada: la política comparaba la segunda carpeta con su
--     cuenta, y la ruta lleva el Cliente. Pasa a la misma regla que el resto.

DROP POLICY consentimientos_pagador_los_lee_su_organizacion ON public.consentimientos_pagador;
CREATE POLICY consentimientos_pagador_los_lee_el_personal ON public.consentimientos_pagador
  FOR SELECT
  USING (prestadora_id = interno.prestadora_actual() AND interno.es_personal_de_la_prestadora());

DROP POLICY documentos_pagador_los_lee_su_organizacion ON public.documentos_pagador;
CREATE POLICY documentos_pagador_los_lee_el_personal ON public.documentos_pagador
  FOR SELECT
  USING (prestadora_id = interno.prestadora_actual() AND interno.es_personal_de_la_prestadora());

CREATE POLICY documentos_pagador_los_lee_quien_ve_la_fila ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documentos-pagador'
    AND (storage.foldername(name))[1] = interno.prestadora_actual()::text
    AND (
      EXISTS (SELECT 1 FROM public.consentimientos_pagador c WHERE c.archivo_firmado_url = objects.name)
      OR EXISTS (SELECT 1 FROM public.documentos_pagador d WHERE d.archivo_url = objects.name)
    )
  );

DROP POLICY instrucciones_personas_autorizadas_titular_lee ON storage.objects;
CREATE POLICY instrucciones_personas_autorizadas_las_lee_quien_ve_la_fila ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'instrucciones-acceso-personas-autorizadas'
    AND (storage.foldername(name))[1] = interno.prestadora_actual()::text
    AND EXISTS (
      SELECT 1 FROM public.instrucciones_acceso_personas_autorizadas i
       WHERE i.archivo_firmado_url = objects.name
    )
  );

NOTIFY pgrst, 'reload schema';
