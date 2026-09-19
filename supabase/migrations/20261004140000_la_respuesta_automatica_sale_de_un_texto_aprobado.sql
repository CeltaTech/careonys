-- La respuesta automática de WhatsApp sale de un texto aprobado, o no sale
-- ========================================================================
--
-- QUÉ ESTABA MAL. Hasta acá, cuando entraba un WhatsApp, se le pedía a un modelo de IA que
-- redactara una respuesta y que además decidiera si estaba lo bastante seguro como para
-- mandarla solo. Si contestaba que sí, el texto salía hacia la persona sin que nadie de la
-- Prestadora lo hubiera leído nunca. Eso es improvisar: cada mensaje que sale es un texto
-- nuevo, distinto del anterior, que nadie revisó y del que nadie se hace cargo.
--
-- Y el único cuidado que había sobre lo clínico era una frase adentro del pedido al modelo
-- —«ante cualquier mensaje sobre salud, marcá que necesita revisión»—. Un cuidado escrito así
-- se cumple mientras el modelo tenga ganas: no está en el código, está en una sugerencia.
--
-- QUÉ CAMBIA. La respuesta automática deja de redactar y pasa a elegir. Hay un banco de
-- respuestas preparadas, por Prestadora, en los tres idiomas. Cada una nace SIN APROBAR y no
-- se usa hasta que la Prestadora la aprueba. Si ninguna aprobada sirve para lo que entró, no
-- se contesta: se deriva a una persona. Ante la duda no contesta.
--
-- LAS CUATRO TABLAS, y por qué son cuatro:
--
--   * `respuestas_preparadas_whatsapp` — el banco, por Prestadora. Es el único texto que la
--     respuesta automática puede mandar.
--   * `terminos_de_salud_y_emergencia` — qué palabras hacen que un mensaje no se conteste
--     solo. Es del producto y no de cada Prestadora: si una Prestadora pudiera vaciar esta
--     lista, lo clínico dejaría de derivarse justo donde más importa. Es dato y no código
--     porque se corrige con lo que aparezca, sin publicar una versión nueva.
--   * `telefonos_de_emergencia` — a qué número se avisa una emergencia en cada jurisdicción.
--     NACE VACÍA, a propósito: el número es un dato de cada lugar y no se deduce por parecido
--     con otro país. Sin número configurado no se inventa ninguno: se deriva a una persona y
--     queda registrado.
--   * `auditoria_respuesta_automatica_whatsapp` — qué se contestó solo, a quién y con cuál
--     respuesta aprobada. Sin una sola letra del contenido.
--
-- POR QUÉ UNA RESPUESTA QUE TOCA SALUD NO SE PUEDE APROBAR. Lo clínico se deriva siempre a una
-- persona, aunque haya una respuesta preparada que parezca servir. Eso ya está escrito en el
-- motor, y acá está escrito otra vez como restricción: una fila marcada `toca_salud` no admite
-- fecha de aprobación. Son dos redes y no una sola, que es como se tratan las reglas que no
-- pueden fallar.
--
-- POR QUÉ EL TEXTO VA EN LOS TRES IDIOMAS aunque sea de una Prestadora. La regla general deja
-- que una fila propia de la Prestadora venga en su idioma, porque lo que falte sale del texto
-- del producto. Acá no hay texto del producto abajo: si falta el idioma, no hay nada que
-- mandar y el mensaje queda sin contestar. Entonces se exigen los tres.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. El banco de respuestas preparadas
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.respuestas_preparadas_whatsapp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras (id) ON DELETE CASCADE,
  -- Cómo se llama esta respuesta adentro de la Prestadora. No se le muestra a nadie de afuera.
  nombre_interno text NOT NULL,
  -- Qué palabras del mensaje entrante hacen que ésta sea la respuesta que corresponde. Si
  -- ninguna coincide, ésta no se usa; y si ninguna respuesta coincide, no se contesta.
  terminos text[] NOT NULL DEFAULT '{}',
  -- El texto que se manda, en los tres idiomas. Es lo único que la respuesta automática puede
  -- mandar: no se redacta nada al lado de esto.
  i18n jsonb NOT NULL,
  -- La marca de lo clínico. Una respuesta marcada así queda en el banco para que la use una
  -- persona, y nunca sale sola.
  toca_salud boolean NOT NULL DEFAULT false,
  -- Quién la propuso. La IA propone; aprobar es de la Prestadora y de nadie más.
  origen text NOT NULL DEFAULT 'prestadora',
  activa boolean NOT NULL DEFAULT true,
  -- NACE SIN APROBAR: las dos columnas vacías. Mientras estén vacías, esta fila no se manda.
  aprobada_at timestamptz,
  aprobada_por uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT la_respuesta_preparada_tiene_nombre CHECK (btrim(nombre_interno) <> ''),
  CONSTRAINT la_respuesta_preparada_sale_del_producto_o_de_la_ia
    CHECK (origen = ANY (ARRAY['prestadora', 'ia'])),
  -- Sin texto en los tres idiomas no hay nada que mandar en el idioma que falte.
  CONSTRAINT la_respuesta_preparada_viene_en_los_tres_idiomas CHECK (interno.i18n_completo(i18n)),
  -- Aprobada es aprobada por alguien: una fecha sin nombre no dice quién se hizo cargo.
  CONSTRAINT la_aprobacion_dice_quien_la_firmo
    CHECK ((aprobada_at IS NULL) = (aprobada_por IS NULL)),
  -- Lo clínico no se aprueba para que salga solo. Se deriva siempre a una persona.
  CONSTRAINT lo_que_toca_salud_no_se_aprueba
    CHECK (NOT toca_salud OR aprobada_at IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS una_respuesta_preparada_por_nombre_y_prestadora
  ON public.respuestas_preparadas_whatsapp (prestadora_id, nombre_interno);

-- El motor busca siempre lo mismo: las aprobadas y activas de una Prestadora.
CREATE INDEX IF NOT EXISTS respuestas_preparadas_aprobadas_por_prestadora
  ON public.respuestas_preparadas_whatsapp (prestadora_id)
  WHERE aprobada_at IS NOT NULL AND activa;

ALTER TABLE public.respuestas_preparadas_whatsapp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS respuestas_preparadas_las_lee_su_prestadora ON public.respuestas_preparadas_whatsapp;
CREATE POLICY respuestas_preparadas_las_lee_su_prestadora ON public.respuestas_preparadas_whatsapp
  FOR SELECT TO authenticated
  USING (interno.lee_la_configuracion(prestadora_id));

DROP POLICY IF EXISTS respuestas_preparadas_las_escribe_el_personal ON public.respuestas_preparadas_whatsapp;
CREATE POLICY respuestas_preparadas_las_escribe_el_personal ON public.respuestas_preparadas_whatsapp
  FOR ALL TO authenticated
  USING (interno.escribe_el_catalogo(prestadora_id))
  WITH CHECK (interno.escribe_el_catalogo(prestadora_id));

REVOKE ALL ON TABLE public.respuestas_preparadas_whatsapp FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.respuestas_preparadas_whatsapp TO authenticated;
GRANT ALL ON TABLE public.respuestas_preparadas_whatsapp TO service_role;

COMMENT ON TABLE public.respuestas_preparadas_whatsapp IS
  'El banco de respuestas preparadas de cada Prestadora. Es el único texto que la respuesta automática de WhatsApp puede mandar. Nace sin aprobar y no se usa hasta que la Prestadora la aprueba.';

-- ---------------------------------------------------------------------------
-- 2. Qué no se contesta solo: salud y emergencia
-- ---------------------------------------------------------------------------
--
-- Es una lista del producto, sin Prestadora, y de sólo lectura para todas: la Prestadora
-- decide cómo trabaja, pero no decide que lo clínico se conteste solo.

CREATE TABLE IF NOT EXISTS public.terminos_de_salud_y_emergencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idioma text NOT NULL,
  termino text NOT NULL,
  motivo text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT el_termino_esta_en_un_idioma_del_producto
    CHECK (idioma = ANY (ARRAY['es-AR', 'en', 'pt-BR'])),
  CONSTRAINT el_termino_no_viene_vacio CHECK (btrim(termino) <> ''),
  CONSTRAINT el_termino_deriva_por_salud_o_por_emergencia
    CHECK (motivo = ANY (ARRAY['salud', 'emergencia']))
);

CREATE UNIQUE INDEX IF NOT EXISTS un_termino_por_idioma_y_motivo
  ON public.terminos_de_salud_y_emergencia (idioma, termino, motivo);

ALTER TABLE public.terminos_de_salud_y_emergencia ENABLE ROW LEVEL SECURITY;

-- Sin ninguna política: nadie que entre por la clave pública la toca. La lee el motor, que
-- entra con la llave de servicio, y se corrige desde una migración o desde la administración de
-- la base. Es la lista que decide qué NO se contesta solo: dejarla al alcance de una pantalla
-- sería dejar que una pantalla apague el cuidado.
REVOKE ALL ON TABLE public.terminos_de_salud_y_emergencia FROM anon, authenticated;
GRANT ALL ON TABLE public.terminos_de_salud_y_emergencia TO service_role;

COMMENT ON TABLE public.terminos_de_salud_y_emergencia IS
  'Qué palabras hacen que un mensaje entrante de WhatsApp no se conteste solo. Es del producto y no de cada Prestadora. Si esta lista no se puede leer, el motor deriva todo a una persona.';

-- LO QUE DICE HOY LA LISTA. Se corrige con lo que vaya apareciendo: agregar una palabra es una
-- fila más, no una versión nueva del producto. Cada fila entra en un renglón y con esta forma
-- exacta: ('idioma', 'término', 'motivo').
INSERT INTO public.terminos_de_salud_y_emergencia (idioma, termino, motivo)
VALUES
  ('es-AR', 'emergencia', 'emergencia'),
  ('es-AR', 'urgencia', 'emergencia'),
  ('es-AR', 'ambulancia', 'emergencia'),
  ('es-AR', 'se desmayo', 'emergencia'),
  ('es-AR', 'no respira', 'emergencia'),
  ('es-AR', 'no responde', 'emergencia'),
  ('es-AR', 'se cayo', 'emergencia'),
  ('es-AR', 'sangra', 'emergencia'),
  ('es-AR', 'convulsion', 'emergencia'),
  ('es-AR', 'auxilio', 'emergencia'),
  ('es-AR', 'socorro', 'emergencia'),
  ('es-AR', 'salud', 'salud'),
  ('es-AR', 'medico', 'salud'),
  ('es-AR', 'medica', 'salud'),
  ('es-AR', 'enfermera', 'salud'),
  ('es-AR', 'enfermero', 'salud'),
  ('es-AR', 'dolor', 'salud'),
  ('es-AR', 'fiebre', 'salud'),
  ('es-AR', 'temperatura', 'salud'),
  ('es-AR', 'presion', 'salud'),
  ('es-AR', 'azucar', 'salud'),
  ('es-AR', 'medicamento', 'salud'),
  ('es-AR', 'medicacion', 'salud'),
  ('es-AR', 'remedio', 'salud'),
  ('es-AR', 'pastilla', 'salud'),
  ('es-AR', 'dosis', 'salud'),
  ('es-AR', 'receta', 'salud'),
  ('es-AR', 'herida', 'salud'),
  ('es-AR', 'hospital', 'salud'),
  ('es-AR', 'clinica', 'salud'),
  ('es-AR', 'internacion', 'salud'),
  ('es-AR', 'diagnostico', 'salud'),
  ('es-AR', 'tratamiento', 'salud'),
  ('es-AR', 'sintoma', 'salud'),
  ('es-AR', 'vomito', 'salud'),
  ('es-AR', 'mareo', 'salud'),
  ('es-AR', 'oxigeno', 'salud'),
  ('es-AR', 'sonda', 'salud'),
  ('es-AR', 'curacion', 'salud'),
  ('es-AR', 'escara', 'salud'),
  ('en', 'emergency', 'emergencia'),
  ('en', 'urgent', 'emergencia'),
  ('en', 'ambulance', 'emergencia'),
  ('en', 'not breathing', 'emergencia'),
  ('en', 'unresponsive', 'emergencia'),
  ('en', 'passed out', 'emergencia'),
  ('en', 'fell', 'emergencia'),
  ('en', 'bleeding', 'emergencia'),
  ('en', 'seizure', 'emergencia'),
  ('en', 'help', 'emergencia'),
  ('en', 'health', 'salud'),
  ('en', 'doctor', 'salud'),
  ('en', 'nurse', 'salud'),
  ('en', 'pain', 'salud'),
  ('en', 'fever', 'salud'),
  ('en', 'temperature', 'salud'),
  ('en', 'blood pressure', 'salud'),
  ('en', 'blood sugar', 'salud'),
  ('en', 'medication', 'salud'),
  ('en', 'medicine', 'salud'),
  ('en', 'pill', 'salud'),
  ('en', 'dose', 'salud'),
  ('en', 'prescription', 'salud'),
  ('en', 'wound', 'salud'),
  ('en', 'hospital', 'salud'),
  ('en', 'clinic', 'salud'),
  ('en', 'diagnosis', 'salud'),
  ('en', 'treatment', 'salud'),
  ('en', 'symptom', 'salud'),
  ('en', 'vomit', 'salud'),
  ('en', 'dizzy', 'salud'),
  ('en', 'oxygen', 'salud'),
  ('en', 'bedsore', 'salud'),
  ('pt-BR', 'emergencia', 'emergencia'),
  ('pt-BR', 'urgente', 'emergencia'),
  ('pt-BR', 'ambulancia', 'emergencia'),
  ('pt-BR', 'nao respira', 'emergencia'),
  ('pt-BR', 'nao responde', 'emergencia'),
  ('pt-BR', 'desmaiou', 'emergencia'),
  ('pt-BR', 'caiu', 'emergencia'),
  ('pt-BR', 'sangrando', 'emergencia'),
  ('pt-BR', 'convulsao', 'emergencia'),
  ('pt-BR', 'socorro', 'emergencia'),
  ('pt-BR', 'saude', 'salud'),
  ('pt-BR', 'medico', 'salud'),
  ('pt-BR', 'enfermeira', 'salud'),
  ('pt-BR', 'enfermeiro', 'salud'),
  ('pt-BR', 'dor', 'salud'),
  ('pt-BR', 'febre', 'salud'),
  ('pt-BR', 'temperatura', 'salud'),
  ('pt-BR', 'pressao', 'salud'),
  ('pt-BR', 'acucar', 'salud'),
  ('pt-BR', 'medicamento', 'salud'),
  ('pt-BR', 'remedio', 'salud'),
  ('pt-BR', 'comprimido', 'salud'),
  ('pt-BR', 'dose', 'salud'),
  ('pt-BR', 'receita', 'salud'),
  ('pt-BR', 'ferida', 'salud'),
  ('pt-BR', 'hospital', 'salud'),
  ('pt-BR', 'clinica', 'salud'),
  ('pt-BR', 'internacao', 'salud'),
  ('pt-BR', 'diagnostico', 'salud'),
  ('pt-BR', 'tratamento', 'salud'),
  ('pt-BR', 'sintoma', 'salud'),
  ('pt-BR', 'vomito', 'salud'),
  ('pt-BR', 'tontura', 'salud'),
  ('pt-BR', 'oxigenio', 'salud'),
  ('pt-BR', 'escara', 'salud')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. A qué número se avisa una emergencia, por jurisdicción
-- ---------------------------------------------------------------------------
--
-- MISMO MOLDE QUE LAS ADVERTENCIAS LEGALES, y por el mismo motivo: el dato es de cada lugar y
-- no se deduce por parecido con otro. Sin fila para esa jurisdicción no hay número, y sin
-- número no se inventa ninguno: se deriva a una persona y queda registrado.
--
-- NACE VACÍA. Sembrar acá un número «de ejemplo» sería exactamente lo que la regla prohíbe:
-- el día que alguien lo use de verdad, estaría llamando a donde no corresponde.

CREATE TABLE IF NOT EXISTS public.telefonos_de_emergencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiccion text NOT NULL,
  telefono text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT la_jurisdiccion_no_viene_vacia CHECK (btrim(jurisdiccion) <> ''),
  CONSTRAINT el_telefono_de_emergencia_no_viene_vacio CHECK (btrim(telefono) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS un_telefono_de_emergencia_por_jurisdiccion
  ON public.telefonos_de_emergencia (jurisdiccion)
  WHERE activo;

ALTER TABLE public.telefonos_de_emergencia ENABLE ROW LEVEL SECURITY;

-- Sin políticas, igual que la lista de arriba: la lee el motor con la llave de servicio.
REVOKE ALL ON TABLE public.telefonos_de_emergencia FROM anon, authenticated;
GRANT ALL ON TABLE public.telefonos_de_emergencia TO service_role;

COMMENT ON TABLE public.telefonos_de_emergencia IS
  'A qué número se avisa una emergencia en cada jurisdicción. Nace vacía: el número es configuración de cada lugar y nunca se deduce. Sin fila, el motor no inventa ningún número: deriva a una persona y lo registra.';

-- ---------------------------------------------------------------------------
-- 4. Qué se contestó solo, a quién, y con cuál respuesta aprobada
-- ---------------------------------------------------------------------------
--
-- SIN UNA SOLA LETRA DEL CONTENIDO. Ni el mensaje que entró, ni el texto que salió, ni el
-- teléfono. Quedan identificadores: cuál conversación, cuál mensaje, cuál respuesta preparada.
-- Para leer el contenido se mira el hilo, que es donde vive y donde la RLS ya lo cuida.
--
-- EL MOTIVO SALE DE UNA LISTA CERRADA y no es texto libre: un campo libre adentro de un
-- registro de auditoría termina, tarde o temprano, con el síntoma de alguien adentro.

CREATE TABLE IF NOT EXISTS public.auditoria_respuesta_automatica_whatsapp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras (id) ON DELETE CASCADE,
  conversacion_id uuid REFERENCES public.conversaciones_whatsapp (id) ON DELETE SET NULL,
  mensaje_entrante_id uuid REFERENCES public.mensajes_whatsapp (id) ON DELETE SET NULL,
  mensaje_saliente_id uuid REFERENCES public.mensajes_whatsapp (id) ON DELETE SET NULL,
  respuesta_preparada_id uuid REFERENCES public.respuestas_preparadas_whatsapp (id) ON DELETE SET NULL,
  resultado text NOT NULL,
  motivo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT el_resultado_sale_de_la_lista CHECK (
    resultado = ANY (ARRAY['respondida', 'derivada_a_una_persona', 'emergencia_avisada'])
  ),
  CONSTRAINT el_motivo_sale_de_la_lista CHECK (
    motivo = ANY (ARRAY[
      'respuesta_aprobada',
      'sin_respuesta_aprobada',
      'tema_de_salud',
      'emergencia',
      'sin_telefono_de_emergencia',
      'no_se_pudo_clasificar',
      'envio_fallido'
    ])
  ),
  -- Una respuesta que salió sola salió de una fila aprobada, y se dice cuál. Al revés no: una
  -- derivación no tiene respuesta preparada que nombrar.
  CONSTRAINT lo_respondido_dice_con_que_respuesta CHECK (
    resultado <> 'respondida' OR respuesta_preparada_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS auditoria_respuesta_automatica_por_prestadora
  ON public.auditoria_respuesta_automatica_whatsapp (prestadora_id, created_at DESC);

ALTER TABLE public.auditoria_respuesta_automatica_whatsapp ENABLE ROW LEVEL SECURITY;

-- Se lee y no se toca: la escribe el motor, que entra con la llave de servicio y no pasa por
-- estas políticas. Sin política de escritura, desde el Panel no hay forma de corregir ni de
-- borrar un renglón, que es lo que hace que sirva como registro.
DROP POLICY IF EXISTS auditoria_respuesta_automatica_la_lee_la_administracion
  ON public.auditoria_respuesta_automatica_whatsapp;
CREATE POLICY auditoria_respuesta_automatica_la_lee_la_administracion
  ON public.auditoria_respuesta_automatica_whatsapp
  FOR SELECT TO authenticated
  USING (interno.es_la_administracion_de_la_prestadora(prestadora_id));

REVOKE ALL ON TABLE public.auditoria_respuesta_automatica_whatsapp FROM anon, authenticated;
GRANT SELECT ON TABLE public.auditoria_respuesta_automatica_whatsapp TO authenticated;
GRANT ALL ON TABLE public.auditoria_respuesta_automatica_whatsapp TO service_role;

COMMENT ON TABLE public.auditoria_respuesta_automatica_whatsapp IS
  'Qué contestó sola la respuesta automática de WhatsApp, en cuál conversación y con cuál respuesta aprobada. Sin contenido: sólo identificadores y un motivo de lista cerrada.';

COMMIT;

NOTIFY pgrst, 'reload schema';
