-- El mensaje de texto existe como via de aviso, y nace sin proveedor.
-- =====================================================================================
--
-- QUÉ FALTABA. Un aviso sale hoy por tres vías: WhatsApp, correo y aviso al celular. Quien no usa
-- WhatsApp se queda con el correo, que no interrumpe a nadie: un turno que empieza en veinte
-- minutos y no tiene quien lo cubra le llega a una casilla que esa persona va a mirar más tarde.
-- El mensaje de texto es lo que llega igual a cualquier teléfono, sin aplicación y sin cuenta.
--
-- QUÉ SE DECIDIÓ. Que la vía exista desde hoy, apagada, y que encenderla el día que se contrate un
-- proveedor sea cargar una configuración y nada más: ni una versión nueva del producto, ni una
-- migración, ni una línea de código. Por eso acá se crean los dos lugares donde va esa
-- configuración y la columna con la que cada Prestadora elige el mensaje de texto aviso por aviso.
--
-- QUÉ NO HACE ESTA MIGRACIÓN, Y NO ES UN OLVIDO. No contrata ningún proveedor, no lo integra y no
-- escribe el nombre de ninguno. El catálogo de proveedores nace vacío a propósito, y con el
-- catálogo vacío la vía sale en la lista de la pantalla de Avisos y no se puede elegir. Esa es
-- exactamente la forma que se buscaba: el lugar hecho, y vacío.
--
-- POR QUÉ UN CATÁLOGO Y NO UNA COLUMNA DE TEXTO LIBRE. Porque el nombre del proveedor es un dato y
-- no puede terminar escrito a mano en cada Prestadora: dos formas de escribir el mismo proveedor
-- son dos proveedores distintos para el sistema y nadie se entera. Y porque con el catálogo vacío
-- la condición «no hay proveedor» la sostiene la base, no una pantalla.
--
-- CÓMO SE ENCIENDE EL DÍA QUE HAYA PROVEEDOR. Tres pasos, todos de datos:
--   1. INSERT en catalogo_proveedores_de_mensaje_de_texto con el proveedor contratado.
--   2. INSERT en configuracion_mensaje_de_texto_prestadora con ese proveedor, el remitente y el
--      puntero al secreto guardado en Vault, y activo en verdadero.
--   3. Cada Prestadora enciende la casilla del aviso que quiera en la pantalla de Avisos.
-- Lo único que queda por escribir ese día es el envío contra ese proveedor
-- (backend/src/utils/mensajeDeTexto.js, que hoy tiene el hueco marcado).
--
-- LA CREDENCIAL NO VIVE ACÁ. Igual que el token de WhatsApp: en esta tabla se guarda el puntero al
-- secreto de Vault y nunca el secreto. Por eso la tabla la lee solamente la administración de la
-- Prestadora y no cualquiera con sesión, que es lo que alcanza para el resto de la configuración.
--
-- Y EL MENSAJE DE TEXTO ES LA VÍA DÉBIL. No se cifra, viaja por la red telefónica, se lo puede
-- desviar y llega sin ninguna constancia de quién lo mandó. Por eso entra como respaldo de
-- WhatsApp y no como su reemplazo, y por eso el Panel lo dice en la pantalla. Nada que no pueda
-- viajar en un mensaje sale por acá.
--
-- CÓMO SE VUELVE ATRÁS.
--   ALTER TABLE public.configuracion_notificaciones DROP COLUMN IF EXISTS mensaje_de_texto_activo;
--   DROP TABLE IF EXISTS public.configuracion_mensaje_de_texto_prestadora;
--   DROP TABLE IF EXISTS public.catalogo_proveedores_de_mensaje_de_texto;

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Qué proveedores de mensaje de texto conoce el producto
-- ---------------------------------------------------------------------------
--
-- Nace vacío, y eso es el estado correcto: hoy no hay ninguno contratado. Un proveedor entra
-- cargando una fila acá, nunca tocando código.

CREATE TABLE IF NOT EXISTS public.catalogo_proveedores_de_mensaje_de_texto (
  proveedor text PRIMARY KEY,
  orden smallint NOT NULL DEFAULT 100,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.catalogo_proveedores_de_mensaje_de_texto IS
  'Los proveedores de mensaje de texto que el producto conoce. Nace vacio a proposito: con este catalogo vacio la via sale en la lista de Avisos y no se puede elegir. Un proveedor entra cargando una fila, nunca tocando codigo.';
COMMENT ON COLUMN public.catalogo_proveedores_de_mensaje_de_texto.proveedor IS
  'Como se llama el proveedor. Es un nombre propio y no se traduce.';

-- Sin ningún INSERT. Ver el encabezado: el catálogo vacío es lo que apaga la vía.

ALTER TABLE public.catalogo_proveedores_de_mensaje_de_texto ENABLE ROW LEVEL SECURITY;

-- Lo lee cualquiera con sesión: no dice nada de ninguna persona ni de ninguna Organización.
-- No lo escribe nadie desde el producto.
CREATE POLICY catalogo_proveedores_de_mensaje_de_texto_lo_lee_quien_tiene_sesion
  ON public.catalogo_proveedores_de_mensaje_de_texto
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON TABLE public.catalogo_proveedores_de_mensaje_de_texto FROM PUBLIC;
REVOKE ALL ON TABLE public.catalogo_proveedores_de_mensaje_de_texto FROM anon;
REVOKE ALL ON TABLE public.catalogo_proveedores_de_mensaje_de_texto FROM authenticated;
GRANT SELECT ON TABLE public.catalogo_proveedores_de_mensaje_de_texto TO authenticated;
GRANT ALL ON TABLE public.catalogo_proveedores_de_mensaje_de_texto TO service_role;

-- ---------------------------------------------------------------------------
-- 2. La configuración de la vía en cada Prestadora
-- ---------------------------------------------------------------------------
--
-- Una fila por Prestadora, como la de WhatsApp. Sin fila, la Prestadora no tiene proveedor y la
-- vía no se le puede elegir. La restricción de más abajo es la que impide que alguien la encienda
-- sin proveedor cargado: la condición no depende de ninguna pantalla.

CREATE TABLE IF NOT EXISTS public.configuracion_mensaje_de_texto_prestadora (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras (id) ON DELETE CASCADE,

  -- Cuál de los proveedores del catálogo usa esta Prestadora.
  proveedor text REFERENCES public.catalogo_proveedores_de_mensaje_de_texto (proveedor),
  -- Desde qué número o qué nombre salen los mensajes de esta Prestadora.
  remitente text,
  -- El puntero al secreto guardado en Vault. La credencial no vive en esta tabla.
  token_secret_id uuid,

  activo boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT una_configuracion_de_mensaje_de_texto_por_prestadora
    UNIQUE (prestadora_id),

  -- Falla cerrado: sin proveedor cargado la vía no se enciende, y esto lo sostiene la base.
  CONSTRAINT sin_proveedor_el_mensaje_de_texto_no_se_enciende
    CHECK (NOT activo OR proveedor IS NOT NULL)
);

COMMENT ON TABLE public.configuracion_mensaje_de_texto_prestadora IS
  'Con que proveedor manda mensajes de texto cada Prestadora. Sin fila no hay proveedor y la via no se puede elegir. La credencial vive en Vault; aca solo su puntero.';
COMMENT ON COLUMN public.configuracion_mensaje_de_texto_prestadora.token_secret_id IS
  'Puntero al secreto de Vault. Nunca la credencial en texto plano, igual que el token de WhatsApp.';
COMMENT ON COLUMN public.configuracion_mensaje_de_texto_prestadora.activo IS
  'Si la via esta encendida en esta Prestadora. Sin proveedor no puede estar en verdadero.';

CREATE INDEX IF NOT EXISTS el_mensaje_de_texto_se_busca_por_prestadora
  ON public.configuracion_mensaje_de_texto_prestadora (prestadora_id);

ALTER TABLE public.configuracion_mensaje_de_texto_prestadora ENABLE ROW LEVEL SECURITY;

-- La lee y la escribe solamente la administración de la Prestadora, sobre lo suyo. No alcanza con
-- `interno.lee_la_configuracion()`, que es lo que usa el resto de la configuración: esta fila lleva
-- el puntero a una credencial, y mínimo privilegio manda.
CREATE POLICY configuracion_mensaje_de_texto_la_lee_la_administracion
  ON public.configuracion_mensaje_de_texto_prestadora
  FOR SELECT
  TO authenticated
  USING (interno.es_la_administracion_de_la_prestadora(prestadora_id));

CREATE POLICY configuracion_mensaje_de_texto_la_escribe_la_administracion
  ON public.configuracion_mensaje_de_texto_prestadora
  FOR ALL
  TO authenticated
  USING (interno.es_la_administracion_de_la_prestadora(prestadora_id))
  WITH CHECK (interno.es_la_administracion_de_la_prestadora(prestadora_id));

REVOKE ALL ON TABLE public.configuracion_mensaje_de_texto_prestadora FROM PUBLIC;
REVOKE ALL ON TABLE public.configuracion_mensaje_de_texto_prestadora FROM anon;
REVOKE ALL ON TABLE public.configuracion_mensaje_de_texto_prestadora FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.configuracion_mensaje_de_texto_prestadora TO authenticated;
GRANT ALL ON TABLE public.configuracion_mensaje_de_texto_prestadora TO service_role;

-- ---------------------------------------------------------------------------
-- 3. La vía, aviso por aviso
-- ---------------------------------------------------------------------------
--
-- Mismo molde que `whatsapp_activo`: una columna por vía, que dice si esa Prestadora eligió que
-- ese aviso salga también por ahí. Nace apagada en todos, en todas las Prestadoras.

ALTER TABLE public.configuracion_notificaciones
  ADD COLUMN IF NOT EXISTS mensaje_de_texto_activo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.configuracion_notificaciones.mensaje_de_texto_activo IS
  'Si este aviso sale tambien por mensaje de texto. Respaldo de WhatsApp: se intenta despues de WhatsApp y antes del correo. Encenderla no alcanza si la Prestadora no tiene proveedor cargado.';

-- ---------------------------------------------------------------------------
-- 4. Que la migración haya quedado como dice el encabezado
-- ---------------------------------------------------------------------------
--
-- Una prueba que no puede fallar no prueba nada: esto mira las cuatro cosas que, si se despegaran,
-- dejarían la vía encendible sin proveedor o abierta a quien no corresponde.

DO $comprobacion$
DECLARE
  v_faltan text := '';
BEGIN
  IF EXISTS (SELECT 1 FROM public.catalogo_proveedores_de_mensaje_de_texto) THEN
    v_faltan := v_faltan || ' el catalogo de proveedores nacio con filas, y tiene que nacer vacio;';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'sin_proveedor_el_mensaje_de_texto_no_se_enciende'
  ) THEN
    v_faltan := v_faltan || ' falta la restriccion que impide encender la via sin proveedor;';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'configuracion_notificaciones'
       AND column_name = 'mensaje_de_texto_activo'
  ) THEN
    v_faltan := v_faltan || ' falta la columna del aviso;';
  END IF;

  IF has_table_privilege('anon', 'public.configuracion_mensaje_de_texto_prestadora', 'SELECT') THEN
    v_faltan := v_faltan || ' a anon le quedo permiso sobre la configuracion del proveedor;';
  END IF;

  IF v_faltan <> '' THEN
    RAISE EXCEPTION 'La migracion del mensaje de texto no quedo completa:%', v_faltan;
  END IF;
END;
$comprobacion$;

COMMIT;

NOTIFY pgrst, 'reload schema';
