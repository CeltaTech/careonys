-- Quien firma el documento del que paga lo abre con un enlace que le llega por email: lo lee, lo firma
-- y, con el mismo enlace, vuelve a verlo y lo descarga. No hace falta cuenta. El enlace no entra por
-- una sesión: lo atiende el trabajo sin persona, de a una Prestadora por vez, y la base lo hace cumplir.

BEGIN;

CREATE TABLE public.enlaces_consentimiento_pagador (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id     uuid NOT NULL REFERENCES public.prestadoras(id) ON DELETE CASCADE,
  consentimiento_id uuid NOT NULL REFERENCES public.consentimientos_pagador(id) ON DELETE CASCADE,
  verificador       text NOT NULL UNIQUE,
  expira_en         timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX enlaces_consentimiento_pagador_del_consentimiento
  ON public.enlaces_consentimiento_pagador (prestadora_id, consentimiento_id);

ALTER TABLE public.enlaces_consentimiento_pagador ENABLE ROW LEVEL SECURITY;

CREATE POLICY enlaces_consentimiento_pagador_los_maneja_el_trabajo
  ON public.enlaces_consentimiento_pagador
  FOR ALL TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual())
  WITH CHECK (prestadora_id = interno.prestadora_actual());

REVOKE ALL ON public.enlaces_consentimiento_pagador FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.enlaces_consentimiento_pagador TO trabajo_sin_persona;

-- La firma hecha con el enlace es una forma más de cerrar el consentimiento.
ALTER TABLE public.consentimientos_pagador
  DROP CONSTRAINT consentimientos_pagador_cerrado_como_conocido;
ALTER TABLE public.consentimientos_pagador
  ADD CONSTRAINT consentimientos_pagador_cerrado_como_conocido
  CHECK (cerrado_como IS NULL OR cerrado_como = ANY (ARRAY['documento_firmado', 'confirmado_en_la_app', 'firmado_con_el_enlace']));

-- Quien abre el enlace descarga el archivo firmado, si lo hay. Sólo ése: el que cuelga de un
-- consentimiento de esta Prestadora.
CREATE POLICY documentos_pagador_firmados_los_lee_el_trabajo
  ON storage.objects
  FOR SELECT TO trabajo_sin_persona
  USING (
    bucket_id = 'documentos-pagador'
    AND (storage.foldername(name))[1] = (interno.prestadora_actual())::text
    AND EXISTS (
      SELECT 1 FROM public.consentimientos_pagador c
      WHERE c.archivo_firmado_url = objects.name
        AND c.prestadora_id = interno.prestadora_actual()
    )
  );

INSERT INTO public.catalogo_acciones_registradas (accion, grupo, orden)
VALUES ('envio_de_documento_para_firmar', 'modificacion_critica', 20)
ON CONFLICT (accion) DO NOTHING;

INSERT INTO public.mensajes_del_sistema (prestadora_id, clave, i18n)
VALUES
  (NULL, 'documento_para_firmar.asunto',    '{"es-AR": "Documento para firmar", "en": "Document to sign", "pt-BR": "Documento para assinar"}'),
  (NULL, 'documento_para_firmar.boton',     '{"es-AR": "Ver documento", "en": "View document", "pt-BR": "Ver documento"}'),
  (NULL, 'documento_para_firmar.firmar',    '{"es-AR": "Firmar", "en": "Sign", "pt-BR": "Assinar"}'),
  (NULL, 'documento_para_firmar.descargar', '{"es-AR": "Descargar", "en": "Download", "pt-BR": "Baixar"}'),
  (NULL, 'documento_para_firmar.enviar',    '{"es-AR": "Enviar por email", "en": "Send by email", "pt-BR": "Enviar por e-mail"}'),
  (NULL, 'documento_para_firmar.enviado',   '{"es-AR": "Email enviado", "en": "Email sent", "pt-BR": "E-mail enviado"}');

COMMIT;

NOTIFY pgrst, 'reload schema';
