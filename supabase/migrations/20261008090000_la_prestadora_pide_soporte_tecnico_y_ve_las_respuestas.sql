-- La Prestadora pide soporte técnico y ve las respuestas
-- ======================================================
--
-- QUÉ SE CONSTRUYE. Lo único que una pantalla del Panel puede tener sobre el soporte técnico: la
-- Prestadora describe el problema y lee lo que le contestan. Nada más.
--
-- QUÉ NO SE CONSTRUYE, Y NO ES UN OLVIDO. Del otro lado no hay ninguna pantalla acá: quien
-- atiende trabaja por fuera del Panel, y entra a estas dos tablas con la llave de servicio. El
-- Panel es la herramienta de la Prestadora, y el soporte no es suyo.
--
-- EL AISLAMIENTO, QUE ES LO PRIMERO. Una solicitud es de una Prestadora y nunca alcanza a otra.
-- Las dos tablas llevan `prestadora_id` —la de mensajes también, aunque cuelgue de la solicitud—
-- para que la política se resuelva sin ir a buscarlo a la tabla de al lado. Ninguna pantalla
-- puede listar solicitudes de dos Prestadoras: no hay consulta que lo permita.
--
-- POR QUÉ EL HILO NO SE EDITA NI SE BORRA. Lo que se escribió en una solicitud es lo que la
-- Prestadora contó y lo que se le contestó. Corregirlo después deja a las dos partes leyendo
-- cosas distintas de la misma conversación. Se puede agregar un mensaje; no se puede cambiar uno.
--
-- QUIÉN LA ABRE. La administración de la Prestadora. No es una pantalla de trabajo diario, y
-- quien coordina turnos no tiene por qué abrirle un pedido a nadie en nombre de la empresa.
--
-- LOS TRES ESTADOS. `abierta` cuando la Prestadora la manda; `en_curso` cuando el soporte la
-- toma; `cerrada` cuando termina. El paso a `en_curso` lo da el soporte y nadie más. Que esté
-- contestada no es un estado: se ve en el hilo.
--
-- Y NADA DEL CONTENIDO SALE EN UN REGISTRO. Lo que se describe acá puede nombrar a un Cliente o
-- a una Asistente. El texto vive en estas tablas, con su protección por fila, y no se copia a
-- ningún registro de actividad ni viaja por ninguna dirección.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. La solicitud
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.solicitudes_de_soporte_tecnico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras (id) ON DELETE CASCADE,
  -- Quién la abrió, de la administración de esa Prestadora. Si esa cuenta se da de baja, la
  -- solicitud queda: es de la Prestadora, no de la persona.
  abierta_por uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  -- De qué se trata, en una línea, para reconocerla en la lista.
  asunto text NOT NULL,
  -- El problema, contado por quien lo tiene. Es texto libre a propósito: es la única forma de
  -- contar algo que el producto no previó.
  problema text NOT NULL,
  estado text NOT NULL DEFAULT 'abierta',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cerrada_at timestamptz,
  CONSTRAINT la_solicitud_de_soporte_tiene_asunto CHECK (btrim(asunto) <> ''),
  CONSTRAINT la_solicitud_de_soporte_describe_el_problema CHECK (btrim(problema) <> ''),
  CONSTRAINT el_estado_de_la_solicitud_sale_de_la_lista
    CHECK (estado = ANY (ARRAY['abierta', 'en_curso', 'cerrada'])),
  -- Cerrada es cerrada con fecha, y sin cerrar no hay fecha de cierre.
  CONSTRAINT la_solicitud_cerrada_dice_cuando
    CHECK ((estado = 'cerrada') = (cerrada_at IS NOT NULL))
);

-- La lista de la pantalla es siempre la misma: las de esta Prestadora, la más nueva arriba.
CREATE INDEX IF NOT EXISTS solicitudes_de_soporte_por_prestadora
  ON public.solicitudes_de_soporte_tecnico (prestadora_id, created_at DESC);

ALTER TABLE public.solicitudes_de_soporte_tecnico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS solicitudes_de_soporte_las_lee_su_administracion
  ON public.solicitudes_de_soporte_tecnico;
CREATE POLICY solicitudes_de_soporte_las_lee_su_administracion
  ON public.solicitudes_de_soporte_tecnico
  FOR SELECT TO authenticated
  USING (interno.es_la_administracion_de_la_prestadora(prestadora_id));

DROP POLICY IF EXISTS solicitudes_de_soporte_las_abre_su_administracion
  ON public.solicitudes_de_soporte_tecnico;
CREATE POLICY solicitudes_de_soporte_las_abre_su_administracion
  ON public.solicitudes_de_soporte_tecnico
  FOR INSERT TO authenticated
  WITH CHECK (interno.es_la_administracion_de_la_prestadora(prestadora_id));

-- Cerrarla es lo único que la Prestadora cambia de una solicitud ya escrita. Cuál de los tres
-- estados queda lo decide la ruta del backend; acá lo que se cuida es que no toque otra
-- Prestadora. Sin política de borrado: un hilo de soporte no se borra.
DROP POLICY IF EXISTS solicitudes_de_soporte_las_cierra_su_administracion
  ON public.solicitudes_de_soporte_tecnico;
CREATE POLICY solicitudes_de_soporte_las_cierra_su_administracion
  ON public.solicitudes_de_soporte_tecnico
  FOR UPDATE TO authenticated
  USING (interno.es_la_administracion_de_la_prestadora(prestadora_id))
  WITH CHECK (interno.es_la_administracion_de_la_prestadora(prestadora_id));

REVOKE ALL ON TABLE public.solicitudes_de_soporte_tecnico FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.solicitudes_de_soporte_tecnico TO authenticated;
GRANT ALL ON TABLE public.solicitudes_de_soporte_tecnico TO service_role;

COMMENT ON TABLE public.solicitudes_de_soporte_tecnico IS
  'Las solicitudes de soporte técnico que abre la administración de cada Prestadora, describiendo el problema. Una solicitud es de una Prestadora y nunca alcanza a otra.';

-- ---------------------------------------------------------------------------
-- 2. El hilo: lo que agrega la Prestadora y lo que le contestan
-- ---------------------------------------------------------------------------
--
-- DOS AUTORES Y UNA SOLA PUERTA PARA CADA UNO. `prestadora` es lo único que se puede escribir
-- con la sesión de una persona del Panel, y lo dice la política, no la pantalla: una respuesta
-- del soporte sólo entra con la llave de servicio. Al revés, la Prestadora no puede fabricarse
-- una respuesta que parezca venir del soporte.

CREATE TABLE IF NOT EXISTS public.mensajes_de_soporte_tecnico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Al lado de la solicitud, para que la política no tenga que ir a buscar la Prestadora.
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras (id) ON DELETE CASCADE,
  solicitud_id uuid NOT NULL REFERENCES public.solicitudes_de_soporte_tecnico (id) ON DELETE CASCADE,
  autor text NOT NULL,
  -- Quién lo escribió, cuando lo escribió alguien de la Prestadora. Del otro lado no se anota
  -- ninguna persona: la Prestadora lee una respuesta del soporte, no el nombre de quien atiende.
  escrito_por uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  texto text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT el_mensaje_de_soporte_no_viene_vacio CHECK (btrim(texto) <> ''),
  CONSTRAINT el_mensaje_de_soporte_lo_escribe_una_de_las_dos_partes
    CHECK (autor = ANY (ARRAY['prestadora', 'soporte'])),
  -- La respuesta del soporte no nombra a nadie de este lado.
  CONSTRAINT la_respuesta_del_soporte_no_nombra_a_nadie
    CHECK (autor <> 'soporte' OR escrito_por IS NULL)
);

CREATE INDEX IF NOT EXISTS mensajes_de_soporte_por_solicitud
  ON public.mensajes_de_soporte_tecnico (solicitud_id, created_at);

ALTER TABLE public.mensajes_de_soporte_tecnico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mensajes_de_soporte_los_lee_su_administracion
  ON public.mensajes_de_soporte_tecnico;
CREATE POLICY mensajes_de_soporte_los_lee_su_administracion
  ON public.mensajes_de_soporte_tecnico
  FOR SELECT TO authenticated
  USING (interno.es_la_administracion_de_la_prestadora(prestadora_id));

-- Sólo del lado de la Prestadora, y sólo agregar. Sin política de corrección ni de borrado: el
-- hilo queda como se escribió.
DROP POLICY IF EXISTS mensajes_de_soporte_los_agrega_su_administracion
  ON public.mensajes_de_soporte_tecnico;
CREATE POLICY mensajes_de_soporte_los_agrega_su_administracion
  ON public.mensajes_de_soporte_tecnico
  FOR INSERT TO authenticated
  WITH CHECK (
    autor = 'prestadora'
    AND interno.es_la_administracion_de_la_prestadora(prestadora_id)
  );

REVOKE ALL ON TABLE public.mensajes_de_soporte_tecnico FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.mensajes_de_soporte_tecnico TO authenticated;
GRANT ALL ON TABLE public.mensajes_de_soporte_tecnico TO service_role;

COMMENT ON TABLE public.mensajes_de_soporte_tecnico IS
  'El hilo de una solicitud de soporte técnico: lo que agrega la Prestadora y lo que le contestan. Con la sesión de una persona del Panel sólo se puede escribir del lado de la Prestadora; la respuesta entra con la llave de servicio.';

COMMIT;

NOTIFY pgrst, 'reload schema';
