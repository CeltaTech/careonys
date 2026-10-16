-- El bot de WhatsApp le deja la conversación a una persona.
--
-- Dos casos nuevos en los que el bot no contesta y deriva: cuando quien escribe pide hablar con
-- una persona, y cuando la conversación ya está esperando a una. Las palabras con las que se pide
-- una persona son del producto, como las de salud y emergencia, y se leen igual: con la
-- credencial del trabajo sin persona, de a una Prestadora por vez.

CREATE TABLE public.terminos_para_pedir_una_persona (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idioma text NOT NULL,
  termino text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT el_pedido_esta_en_un_idioma_del_producto CHECK (idioma = ANY (ARRAY['es-AR', 'en', 'pt-BR'])),
  CONSTRAINT el_pedido_no_viene_vacio CHECK (btrim(termino) <> ''),
  CONSTRAINT un_pedido_por_idioma UNIQUE (idioma, termino)
);

COMMENT ON TABLE public.terminos_para_pedir_una_persona IS 'Con qué palabras quien escribe por WhatsApp pide hablar con una persona. Es del producto y no de cada Prestadora. Si esta lista no se puede leer, el bot deriva todo a una persona.';

ALTER TABLE public.terminos_para_pedir_una_persona ENABLE ROW LEVEL SECURITY;

CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.terminos_para_pedir_una_persona
  FOR SELECT TO trabajo_sin_persona USING (interno.prestadora_actual() IS NOT NULL);

REVOKE ALL ON TABLE public.terminos_para_pedir_una_persona FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.terminos_para_pedir_una_persona TO service_role;
GRANT SELECT ON TABLE public.terminos_para_pedir_una_persona TO trabajo_sin_persona;

-- Se comparan sin acentos y como palabras enteras (`textoComparable`), así que van sin acento.
INSERT INTO public.terminos_para_pedir_una_persona (idioma, termino) VALUES
  ('es-AR', 'hablar con una persona'),
  ('es-AR', 'hablar con alguien'),
  ('es-AR', 'persona real'),
  ('es-AR', 'humano'),
  ('es-AR', 'operador'),
  ('es-AR', 'operadora'),
  ('es-AR', 'coordinador'),
  ('es-AR', 'coordinadora'),
  ('en', 'talk to a person'),
  ('en', 'speak to a person'),
  ('en', 'talk to someone'),
  ('en', 'speak to someone'),
  ('en', 'real person'),
  ('en', 'human'),
  ('en', 'operator'),
  ('en', 'coordinator'),
  ('pt-BR', 'falar com uma pessoa'),
  ('pt-BR', 'falar com alguem'),
  ('pt-BR', 'pessoa real'),
  ('pt-BR', 'humano'),
  ('pt-BR', 'atendente'),
  ('pt-BR', 'operador'),
  ('pt-BR', 'coordenador'),
  ('pt-BR', 'coordenadora');

ALTER TABLE public.auditoria_respuesta_automatica_whatsapp DROP CONSTRAINT el_motivo_sale_de_la_lista;
ALTER TABLE public.auditoria_respuesta_automatica_whatsapp ADD CONSTRAINT el_motivo_sale_de_la_lista CHECK (motivo = ANY (ARRAY[
  'respuesta_aprobada', 'sin_respuesta_aprobada', 'tema_de_salud', 'emergencia',
  'sin_telefono_de_emergencia', 'no_se_pudo_clasificar', 'envio_fallido',
  'pidio_una_persona', 'la_atiende_una_persona'
]));

NOTIFY pgrst, 'reload schema';
