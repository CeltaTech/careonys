-- CONTENIDOS: ARCHIVOS SUBIDOS, ADEMÁS DEL ENLACE.
--
-- Una pieza de Contenidos puede llevar uno o más archivos que la Prestadora sube: lo que no quiere
-- dejar publicado en otro lado. Lo trivial sigue yendo por enlace y no ocupa espacio acá.
--
-- QUIÉN VE CADA ARCHIVO lo decide la pieza a la que pertenece, y nada más: el renglón del archivo
-- se ve si se ve su pieza, y el archivo del depósito se ve si se ve su renglón. Así un borrador no
-- deja ver sus archivos a nadie que no escriba contenidos, y quitar un destinatario se los quita
-- también, sin una segunda regla que mantener.
--
-- QUIÉN LOS SUBE Y LOS BORRA: quien tiene `publicar_contenidos` en su Prestadora, igual que la pieza.
--
-- EL DEPÓSITO ES PRIVADO y se mira con enlace temporal. La ruta es
-- `<prestadora>/<contenido>/<identificador>.<extensión>`, y la política exige la primera carpeta.
-- El tamaño y los tipos son los de `backend/src/config/archivosDeContenidos.js`; acá se repiten
-- porque el depósito los hace cumplir aunque alguien llegue sin pasar por el backend.

BEGIN;

-- 1. Los archivos de cada pieza.
CREATE TABLE public.contenidos_archivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras(id) ON DELETE CASCADE,
  contenido_id uuid NOT NULL,
  ruta text NOT NULL UNIQUE,
  nombre text NOT NULL,
  tipo text NOT NULL,
  tamano bigint NOT NULL,
  subido_por uuid REFERENCES public.usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- El archivo es de la misma Prestadora que su pieza, y se va con ella.
  CONSTRAINT contenidos_archivos_de_su_pieza
    FOREIGN KEY (contenido_id, prestadora_id)
    REFERENCES public.contenidos(id, prestadora_id) ON DELETE CASCADE,
  CONSTRAINT contenidos_archivos_ruta_de_su_prestadora
    CHECK (split_part(ruta, '/', 1) = prestadora_id::text AND split_part(ruta, '/', 2) = contenido_id::text),
  CONSTRAINT contenidos_archivos_nombre_con_texto CHECK (btrim(nombre) <> ''),
  CONSTRAINT contenidos_archivos_tamano_permitido CHECK (tamano > 0 AND tamano <= 10485760)
);

CREATE INDEX contenidos_archivos_por_pieza ON public.contenidos_archivos (contenido_id, created_at);

COMMENT ON TABLE public.contenidos_archivos IS 'Los archivos que la Prestadora sube a una pieza de Contenidos. Los ve quien ve la pieza.';
COMMENT ON COLUMN public.contenidos_archivos.ruta IS 'Dónde quedó en el depósito contenidos-archivos: <prestadora>/<contenido>/<identificador>.<extensión>.';
COMMENT ON COLUMN public.contenidos_archivos.nombre IS 'El nombre con el que se subió, para mostrarlo y para la descarga.';

ALTER TABLE public.contenidos_archivos ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON public.contenidos_archivos TO authenticated;
REVOKE ALL ON public.contenidos_archivos FROM anon;

CREATE POLICY quien_publica_gestiona_los_archivos ON public.contenidos_archivos
  USING (prestadora_id = interno.current_tenant() AND interno.tiene_permiso('publicar_contenidos'))
  WITH CHECK (prestadora_id = interno.current_tenant() AND interno.tiene_permiso('publicar_contenidos'));

-- La consulta a `contenidos` corre con la protección por fila de quien pregunta: ve el archivo
-- quien ve la pieza.
CREATE POLICY cada_uno_ve_los_archivos_de_lo_que_ve ON public.contenidos_archivos FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.contenidos c WHERE c.id = contenidos_archivos.contenido_id));

-- 2. El depósito.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contenidos-archivos',
  'contenidos-archivos',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
);

CREATE POLICY archivos_de_contenidos_los_gestiona_quien_publica ON storage.objects
  USING (
    bucket_id = 'contenidos-archivos'
    AND (storage.foldername(name))[1] = interno.current_tenant()::text
    AND interno.tiene_permiso('publicar_contenidos')
  )
  WITH CHECK (
    bucket_id = 'contenidos-archivos'
    AND (storage.foldername(name))[1] = interno.current_tenant()::text
    AND interno.tiene_permiso('publicar_contenidos')
  );

-- Se ve el archivo si se ve su renglón, y el renglón si se ve su pieza.
CREATE POLICY archivos_de_contenidos_los_ve_quien_ve_la_pieza ON storage.objects FOR SELECT
  USING (
    bucket_id = 'contenidos-archivos'
    AND EXISTS (SELECT 1 FROM public.contenidos_archivos a WHERE a.ruta = objects.name)
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
