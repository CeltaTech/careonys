-- Los archivos los separa la base, no el código.
--
-- Cuatro depósitos privados no tenían ninguna política: `certificados-medicos`,
-- `autorizaciones-monitoreo`, `documentos-cese` y `fotos-identidad`. Nadie los alcanzaba con su propio
-- pase y los escribía y leía el backend con la llave maestra, después de comprobar a mano de qué
-- Prestadora era cada cosa. Con eso, lo que separaba a una Prestadora de otra era una línea de
-- código en cada ruta.
--
-- Acá cada uno recibe su política, con la misma forma que el resto de los depósitos: la ruta empieza
-- por la Prestadora, y esa primera carpeta tiene que ser la de quien pide, resuelta por
-- `interno.current_tenant()` —la misma función que usan todas las políticas de las tablas—. Un
-- archivo de otra Prestadora no se alcanza aunque se sepa su ruta entera.
--
-- Quién de adentro de la Prestadora alcanza cada archivo sale de la tabla que lo nombra, sin
-- ampliar a nadie: hoy sólo el Panel pide estos archivos, así que la Familia y el Asistente siguen
-- sin alcanzarlos.
--
-- Ninguna tarea automatizada toca estos depósitos, así que el trabajo sin persona no recibe
-- ninguna política sobre ellos y queda afuera: falla cerrado.
--
-- Y se corrigen dos cosas de los depósitos que ya tenían política:
--   · `prescripciones-medicacion` no tenía ninguna para el Panel, que sube y mira Matrículas y
--     prescripciones. Se le da la de sus tablas: la administración las gestiona, la coordinación
--     las lee.
--   · La hoja firmada del círculo familiar se le dejaba leer al titular sin mirar la Prestadora de
--     la ruta.

-- ─── Los depósitos existen y son privados ────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
SELECT d, d, false
  FROM unnest(ARRAY['certificados-medicos', 'autorizaciones-monitoreo', 'documentos-cese', 'fotos-identidad']) AS d
 WHERE NOT EXISTS (SELECT 1 FROM storage.buckets b WHERE b.id = d);

UPDATE storage.buckets
   SET public = false
 WHERE id IN ('certificados-medicos', 'autorizaciones-monitoreo', 'documentos-cese', 'fotos-identidad')
   AND public;

-- ─── certificados-medicos: <prestadora>/<ausencia>/certificado.<ext> ─────────────────────────────
-- Lo alcanza el personal que ve esa ausencia. Qué ausencias ve cada uno lo decide la política de
-- `ausencias`: la administración todas, la coordinación las de los Asistentes de su zona.
DROP POLICY IF EXISTS certificados_los_alcanza_quien_ve_la_ausencia ON storage.objects;
CREATE POLICY certificados_los_alcanza_quien_ve_la_ausencia ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'certificados-medicos'
    AND (storage.foldername(name))[1] = interno.current_tenant()::text
    AND interno.es_personal_de_la_prestadora()
    AND EXISTS (
      SELECT 1 FROM public.ausencias a
       WHERE a.id::text = (storage.foldername(objects.name))[2]
         AND a.prestadora_id = interno.current_tenant()
    )
  )
  WITH CHECK (
    bucket_id = 'certificados-medicos'
    AND (storage.foldername(name))[1] = interno.current_tenant()::text
    AND interno.es_personal_de_la_prestadora()
    AND EXISTS (
      SELECT 1 FROM public.ausencias a
       WHERE a.id::text = (storage.foldername(objects.name))[2]
         AND a.prestadora_id = interno.current_tenant()
    )
  );

-- ─── documentos-cese: <prestadora>/<cese>/<tipo>.pdf ─────────────────────────────────────────────
-- Lo alcanza quien ve ese cese, que por la política de `ceses` es la administración.
DROP POLICY IF EXISTS documentos_cese_los_alcanza_quien_ve_el_cese ON storage.objects;
CREATE POLICY documentos_cese_los_alcanza_quien_ve_el_cese ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'documentos-cese'
    AND (storage.foldername(name))[1] = interno.current_tenant()::text
    AND interno.es_personal_de_la_prestadora()
    AND EXISTS (
      SELECT 1 FROM public.ceses c
       WHERE c.id::text = (storage.foldername(objects.name))[2]
         AND c.prestadora_id = interno.current_tenant()
    )
  )
  WITH CHECK (
    bucket_id = 'documentos-cese'
    AND (storage.foldername(name))[1] = interno.current_tenant()::text
    AND interno.es_personal_de_la_prestadora()
    AND EXISTS (
      SELECT 1 FROM public.ceses c
       WHERE c.id::text = (storage.foldername(objects.name))[2]
         AND c.prestadora_id = interno.current_tenant()
    )
  );

-- ─── autorizaciones-monitoreo: <prestadora>/<paciente>/autorizacion-<n>.<ext> ────────────────────
-- Igual que `autorizaciones_monitoreo_paciente`: la administración la gestiona, la coordinación la
-- lee.
DROP POLICY IF EXISTS autorizaciones_monitoreo_las_gestiona_quien_administra ON storage.objects;
CREATE POLICY autorizaciones_monitoreo_las_gestiona_quien_administra ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'autorizaciones-monitoreo'
    AND (storage.foldername(name))[1] = interno.current_tenant()::text
    AND (interno.es_admin_prestadora() OR interno.es_superadmin())
  )
  WITH CHECK (
    bucket_id = 'autorizaciones-monitoreo'
    AND (storage.foldername(name))[1] = interno.current_tenant()::text
    AND (interno.es_admin_prestadora() OR interno.es_superadmin())
  );

DROP POLICY IF EXISTS autorizaciones_monitoreo_las_lee_el_personal ON storage.objects;
CREATE POLICY autorizaciones_monitoreo_las_lee_el_personal ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'autorizaciones-monitoreo'
    AND (storage.foldername(name))[1] = interno.current_tenant()::text
    AND interno.es_personal_de_la_prestadora()
  );

-- ─── fotos-identidad: <prestadora>/<asistente>/<tipo> ────────────────────────────────────────────
-- La administración, y la coordinación sobre los Asistentes de su zona. No se mira la fila del
-- Asistente con su propia política porque ésa esconde a los que están pendientes de conformidad,
-- y la verificación de identidad es justamente de antes. El `CASE` evita convertir en uuid un texto
-- que no lo es: una ruta mal formada no alcanza a nadie, en vez de cortar la consulta con un error.
DROP POLICY IF EXISTS fotos_identidad_las_alcanza_quien_administra_o_coordina ON storage.objects;
CREATE POLICY fotos_identidad_las_alcanza_quien_administra_o_coordina ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'fotos-identidad'
    AND (storage.foldername(name))[1] = interno.current_tenant()::text
    AND (
      interno.es_admin_prestadora()
      OR interno.es_superadmin()
      OR CASE
           WHEN (storage.foldername(name))[2] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             THEN interno.coordinador_alcanza_asistente(((storage.foldername(name))[2])::uuid)
           ELSE false
         END
    )
  )
  WITH CHECK (
    bucket_id = 'fotos-identidad'
    AND (storage.foldername(name))[1] = interno.current_tenant()::text
    AND (
      interno.es_admin_prestadora()
      OR interno.es_superadmin()
      OR CASE
           WHEN (storage.foldername(name))[2] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             THEN interno.coordinador_alcanza_asistente(((storage.foldername(name))[2])::uuid)
           ELSE false
         END
    )
  );

-- ─── prescripciones-medicacion: lo que le faltaba al Panel ───────────────────────────────────────
-- Las rutas son <prestadora>/<paciente>/prescripcion-<n>.<ext> y
-- <prestadora>/matriculas/<asistente>/matricula-<n>.<ext>. Igual que `indicaciones_medicacion` y
-- `matriculas_asistente`: la administración las gestiona, la coordinación las lee.
DROP POLICY IF EXISTS prescripciones_las_gestiona_quien_administra ON storage.objects;
CREATE POLICY prescripciones_las_gestiona_quien_administra ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'prescripciones-medicacion'
    AND (storage.foldername(name))[1] = interno.current_tenant()::text
    AND (interno.es_admin_prestadora() OR interno.es_superadmin())
  )
  WITH CHECK (
    bucket_id = 'prescripciones-medicacion'
    AND (storage.foldername(name))[1] = interno.current_tenant()::text
    AND (interno.es_admin_prestadora() OR interno.es_superadmin())
  );

DROP POLICY IF EXISTS prescripciones_las_lee_el_personal ON storage.objects;
CREATE POLICY prescripciones_las_lee_el_personal ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'prescripciones-medicacion'
    AND (storage.foldername(name))[1] = interno.current_tenant()::text
    AND interno.es_personal_de_la_prestadora()
  );

-- ─── instrucciones-acceso-circulo: el titular, adentro de su Prestadora ──────────────────────────
DROP POLICY IF EXISTS instrucciones_circulo_titular_lee ON storage.objects;
CREATE POLICY instrucciones_circulo_titular_lee ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'instrucciones-acceso-circulo'
    AND (storage.foldername(name))[1] = interno.current_tenant()::text
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

NOTIFY pgrst, 'reload schema';
