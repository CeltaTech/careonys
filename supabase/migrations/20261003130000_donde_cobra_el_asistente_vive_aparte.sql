-- Donde cobra el Asistente vive aparte, y lo ve solamente la administracion.
-- =====================================================================================
--
-- QUÉ FALTABA. La liquidación decía cuánto se le paga al Asistente y con qué medio, pero no había
-- ningún lugar donde anotar adónde se le paga: el banco, a nombre de quién está la cuenta y el
-- número con el que se la identifica. Eso terminaba escrito en el campo de la referencia del pago,
-- o afuera del producto.
--
-- POR QUÉ EN UNA TABLA APARTE. Es un dato sensible, y la protección por fila filtra filas, no
-- columnas: guardado adentro de la ficha del Asistente, cualquiera que pudiera leer la ficha lo
-- leería. Es el mismo motivo por el que `remuneraciones_asistente` ya vive aparte, y acá se sigue
-- ese precedente sin cambiarle nada.
--
-- QUIÉN LO VE. Del lado de la Prestadora, sólo quien tenga la acción
-- `ver_datos_bancarios_asistente`, que nace reservada a la administración. Quien coordina turnos no
-- la tiene. Escribir es de la administración y de nadie más, con la misma condición que usa la
-- remuneración.
--
-- Y EL ASISTENTE VE LA SUYA. Cada Asistente alcanza su propia fila y ninguna otra, para comprobar
-- que adónde se le paga está bien escrito. No necesita ningún permiso de la Prestadora: es un dato
-- suyo. Quién es el dueño de la ficha lo contesta `interno.es_su_propia_ficha_de_asistente()`, que
-- ya es el punto único de verdad de eso y resuelve la Prestadora adentro.
--
-- VERIFICAR ES MIRAR, NO CORREGIR. El Asistente lee y avisa; quien corrige es la administración.
-- Es el mismo precedente que el resto de su ficha —en la aplicación del Asistente él cambia lo que
-- es decisión suya, como estar disponible para ofertas, y no los datos que la Prestadora asienta
-- sobre él—, y acá pesa además que un dato de pago que pueda cambiar cualquiera es una desviación
-- de dinero. Por eso abajo se agrega una política de lectura y ninguna de escritura.
--
-- Y TODO CAMBIO QUEDA ANOTADO. La acción `cambio_de_datos_bancarios_del_asistente` entra en el
-- catálogo del registro de actividad, en el grupo de las que tienen consecuencia económica. Se
-- anotan quién, cuándo, sobre qué fila y qué columnas se tocaron; nunca el contenido de ninguna.
--
-- Y NO SALE POR NINGÚN LADO. No se registra, no viaja en ninguna dirección, no aparece en ningún
-- mensaje de error y no se escribe para depurar. Por eso el disparador de más abajo nombra la
-- columna que falló y nunca el valor.
--
-- POR QUÉ EL PAÍS ESTÁ ADELANTE. Careonys no es sólo Argentina, y con qué número se identifica una
-- cuenta cambia de país en país: acá son el CBU, el CVU y el alias; en otro lado es otra cosa. Se
-- resuelve como ya se resolvieron los documentos de identidad —un catálogo con el país en la
-- clave—, así que agregar un país es cargar filas y no tocar código. La sigla se guarda sin
-- traducir por el mismo motivo que DNI o CUIT: es un nombre propio, no una descripción.
--
-- CÓMO SE VUELVE ATRÁS.
--   DROP TABLE IF EXISTS public.datos_bancarios_asistente;
--   DROP TABLE IF EXISTS public.catalogo_identificadores_de_cuenta;
--   DELETE FROM public.catalogo_acciones_permisos WHERE accion = 'ver_datos_bancarios_asistente';
--   DELETE FROM public.catalogo_acciones_registradas
--    WHERE accion = 'cambio_de_datos_bancarios_del_asistente';
--   -- Atención: eso último no sale si el registro de actividad ya anotó algún cambio con ella, y
--   -- así tiene que ser: el registro no se borra.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Con qué número se identifica una cuenta en cada país
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.catalogo_identificadores_de_cuenta (
  pais text NOT NULL,
  codigo text NOT NULL,
  sigla text NOT NULL,
  orden integer NOT NULL DEFAULT 100,
  activo boolean NOT NULL DEFAULT true,
  PRIMARY KEY (pais, codigo)
);

COMMENT ON TABLE public.catalogo_identificadores_de_cuenta IS
  'Con que numero se identifica una cuenta bancaria en cada pais. Un pais nuevo entra cargando filas, nunca tocando codigo.';
COMMENT ON COLUMN public.catalogo_identificadores_de_cuenta.sigla IS
  'Como se llama ese identificador en su pais. No se traduce: CBU y CVU son nombres propios.';

INSERT INTO public.catalogo_identificadores_de_cuenta (pais, codigo, sigla, orden) VALUES
  ('AR', 'cbu',   'CBU',   10),
  ('AR', 'cvu',   'CVU',   20),
  ('AR', 'alias', 'Alias', 30)
ON CONFLICT (pais, codigo) DO NOTHING;

ALTER TABLE public.catalogo_identificadores_de_cuenta ENABLE ROW LEVEL SECURITY;

-- Lo lee cualquiera con sesión: no dice nada de ninguna persona ni de ninguna Organización.
-- No lo escribe nadie desde el producto.
CREATE POLICY catalogo_identificadores_lo_lee_quien_tiene_sesion
  ON public.catalogo_identificadores_de_cuenta
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON TABLE public.catalogo_identificadores_de_cuenta FROM anon;
REVOKE ALL ON TABLE public.catalogo_identificadores_de_cuenta FROM authenticated;
GRANT SELECT ON TABLE public.catalogo_identificadores_de_cuenta TO authenticated;
GRANT ALL ON TABLE public.catalogo_identificadores_de_cuenta TO service_role;

-- ---------------------------------------------------------------------------
-- 2. La acción del catálogo de permisos
-- ---------------------------------------------------------------------------
--
-- Orden 14: el último del catálogo. Nace reservada, que es lo que significa el TRUE, con el mismo
-- molde que `ver_pagos_asistente`. Cada Prestadora la abre o la cierra desde su Panel.

INSERT INTO public.catalogo_acciones_permisos (accion, default_solo_admin, orden)
SELECT 'ver_datos_bancarios_asistente', true, 14
 WHERE NOT EXISTS (
   SELECT 1 FROM public.catalogo_acciones_permisos WHERE accion = 'ver_datos_bancarios_asistente'
 );

-- ---------------------------------------------------------------------------
-- 2 bis. La acción que deja anotado quién cambió adónde se paga
-- ---------------------------------------------------------------------------
--
-- Va en el grupo de las que tienen consecuencia económica: cambiar el número de una cuenta desvía
-- dinero, y sin registro no hay forma de saber quién lo hizo. Lo que se anota son la fila y los
-- nombres de las columnas tocadas; el registro de actividad ya rechaza, por su propio disparador,
-- cualquier dato con nombre que no esté en su catálogo, y acá no se agrega ninguno: nada de lo que
-- hay en esta tabla puede entrar ahí.

INSERT INTO public.catalogo_acciones_registradas (accion, grupo, orden)
SELECT v.accion, v.grupo,
       (SELECT COALESCE(MAX(orden), 0) FROM public.catalogo_acciones_registradas)::smallint + v.n
  FROM (VALUES
    ('cambio_de_datos_bancarios_del_asistente', 'consecuencia_economica', 1)
  ) AS v(accion, grupo, n)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.catalogo_acciones_registradas c WHERE c.accion = v.accion
 );

-- ---------------------------------------------------------------------------
-- 3. Adónde se le paga a cada Asistente
-- ---------------------------------------------------------------------------
--
-- Una fila por identificador: en Argentina una cuenta se dice con el CBU y además con el alias, y
-- las dos formas nombran la misma cuenta. Guardarlas como dos filas es lo que deja que un país
-- tenga una sola forma y otro tenga tres sin cambiar la tabla.

CREATE TABLE IF NOT EXISTS public.datos_bancarios_asistente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras (id),
  asistente_id uuid NOT NULL REFERENCES public.asistentes (id) ON DELETE CASCADE,

  pais text NOT NULL,
  identificador_clase text NOT NULL,
  identificador text NOT NULL,

  -- Con qué banco. Texto, y no un catálogo: la lista de bancos de cada país la publica cada país,
  -- cambia sola y ninguna Prestadora debería quedarse sin poder cargar el suyo porque falte.
  banco text,
  -- A nombre de quién está la cuenta, que no siempre es el Asistente.
  titular text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT el_identificador_de_la_cuenta_no_esta_vacio
    CHECK (length(btrim(identificador)) > 0),

  CONSTRAINT el_identificador_es_uno_de_los_de_ese_pais
    FOREIGN KEY (pais, identificador_clase)
    REFERENCES public.catalogo_identificadores_de_cuenta (pais, codigo)
);

COMMENT ON TABLE public.datos_bancarios_asistente IS
  'Adonde se le paga a cada Asistente. Dato sensible: vive aparte de la ficha porque la proteccion por fila filtra filas y no columnas. No se registra, no viaja en ninguna direccion y no aparece en ningun mensaje de error.';
COMMENT ON COLUMN public.datos_bancarios_asistente.identificador IS
  'El numero con el que se identifica la cuenta. Nunca se muestra en un registro ni en un mensaje.';

-- La misma cuenta no se dice dos veces de la misma forma para el mismo Asistente.
CREATE UNIQUE INDEX IF NOT EXISTS un_identificador_por_clase_y_asistente
  ON public.datos_bancarios_asistente (asistente_id, identificador_clase);

CREATE INDEX IF NOT EXISTS los_datos_bancarios_se_buscan_por_asistente
  ON public.datos_bancarios_asistente (prestadora_id, asistente_id);

ALTER TABLE public.datos_bancarios_asistente ENABLE ROW LEVEL SECURITY;

-- Leer: la Prestadora de la sesión, la acción habilitada, y que la ficha del Asistente esté al
-- alcance de quien mira. El EXISTS no repite el filtro de Prestadora ni el de zona: reusa las
-- políticas de `asistentes`, que es el punto único de verdad de a qué Asistentes alcanza cada
-- rol. Es la misma forma que usa `remuneraciones_asistente`.
CREATE POLICY lee_los_datos_bancarios_quien_tiene_el_permiso
  ON public.datos_bancarios_asistente
  FOR SELECT
  TO authenticated
  USING (
    prestadora_id = interno.current_tenant()
    AND interno.tiene_permiso('ver_datos_bancarios_asistente')
    AND EXISTS (
      SELECT 1 FROM public.asistentes a WHERE a.id = datos_bancarios_asistente.asistente_id
    )
  );

-- Y el Asistente, la suya. No pasa por el permiso de la Prestadora: el permiso gobierna quién de
-- la Prestadora mira los datos de otro, y esto es el dueño mirando los propios. La condición no
-- recibe ningún identificador de afuera: `interno.es_su_propia_ficha_de_asistente()` resuelve la
-- ficha por la sesión y la Prestadora por dónde está parado, así que no hay nada que falsificar
-- desde el pedido. Sólo lectura, porque verificar es mirar: corregir es de la administración.
CREATE POLICY lee_sus_propios_datos_bancarios_el_asistente
  ON public.datos_bancarios_asistente
  FOR SELECT
  TO authenticated
  USING (interno.es_su_propia_ficha_de_asistente(asistente_id));

-- Escribir: sólo la administración de la Prestadora, igual que la remuneración. Un dato de pago
-- que pudiera cambiar quien coordina turnos es una desviación de dinero. El Asistente tampoco
-- escribe acá: avisa, y corrige la administración, que es lo que deja el cambio anotado.
CREATE POLICY carga_los_datos_bancarios_solo_la_administracion
  ON public.datos_bancarios_asistente
  FOR INSERT
  TO authenticated
  WITH CHECK (interno.es_la_administracion_de_la_prestadora(prestadora_id));

CREATE POLICY edita_los_datos_bancarios_solo_la_administracion
  ON public.datos_bancarios_asistente
  FOR UPDATE
  TO authenticated
  USING (interno.es_la_administracion_de_la_prestadora(prestadora_id))
  WITH CHECK (interno.es_la_administracion_de_la_prestadora(prestadora_id));

CREATE POLICY borra_los_datos_bancarios_solo_la_administracion
  ON public.datos_bancarios_asistente
  FOR DELETE
  TO authenticated
  USING (interno.es_la_administracion_de_la_prestadora(prestadora_id));

-- La plantilla de Supabase le da ALL a `anon` y `authenticated` en toda tabla nueva de `public`.
-- Se lo saca primero y después se le da lo que hace falta y nada más.
REVOKE ALL ON TABLE public.datos_bancarios_asistente FROM anon;
REVOKE ALL ON TABLE public.datos_bancarios_asistente FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.datos_bancarios_asistente TO authenticated;
GRANT ALL ON TABLE public.datos_bancarios_asistente TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Que la fila no cruce Prestadoras
-- ---------------------------------------------------------------------------
--
-- La Prestadora de la fila tiene que ser la del Asistente. Sin esto, alguien con sesión en una
-- Prestadora podría colgar una cuenta del Asistente de otra. No es `SECURITY DEFINER`: comprueba
-- con los permisos de quien escribe y falla cerrado. Y el mensaje nombra la fila, nunca el número
-- de cuenta.

CREATE OR REPLACE FUNCTION interno.los_datos_bancarios_son_del_mismo_asistente()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'interno'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.asistentes a
     WHERE a.id = NEW.asistente_id
       AND a.prestadora_id = NEW.prestadora_id
  ) THEN
    RAISE EXCEPTION 'datos_bancarios_de_otra_prestadora'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION interno.los_datos_bancarios_son_del_mismo_asistente() IS
  'La Prestadora de la cuenta tiene que ser la del Asistente. El mensaje no nombra ningun dato de la cuenta.';

ALTER FUNCTION interno.los_datos_bancarios_son_del_mismo_asistente() OWNER TO postgres;
REVOKE ALL ON FUNCTION interno.los_datos_bancarios_son_del_mismo_asistente() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.los_datos_bancarios_son_del_mismo_asistente() TO authenticated;
GRANT EXECUTE ON FUNCTION interno.los_datos_bancarios_son_del_mismo_asistente() TO service_role;

DROP TRIGGER IF EXISTS los_datos_bancarios_son_del_mismo_asistente ON public.datos_bancarios_asistente;
CREATE TRIGGER los_datos_bancarios_son_del_mismo_asistente
  BEFORE INSERT OR UPDATE ON public.datos_bancarios_asistente
  FOR EACH ROW EXECUTE FUNCTION interno.los_datos_bancarios_son_del_mismo_asistente();

-- ---------------------------------------------------------------------------
-- Que lo de arriba haya quedado como dice
-- ---------------------------------------------------------------------------

DO $comprobacion$
DECLARE
  v_faltan text := '';
BEGIN
  IF (SELECT count(*) FROM public.catalogo_identificadores_de_cuenta WHERE pais = 'AR') <> 3 THEN
    v_faltan := v_faltan || ' el catalogo de identificadores de Argentina;';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.catalogo_acciones_permisos
     WHERE accion = 'ver_datos_bancarios_asistente' AND default_solo_admin
  ) THEN
    v_faltan := v_faltan || ' la accion del catalogo, reservada a la administracion;';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'datos_bancarios_asistente' AND c.relrowsecurity
  ) THEN
    v_faltan := v_faltan || ' la proteccion por fila encendida;';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.catalogo_acciones_registradas
     WHERE accion = 'cambio_de_datos_bancarios_del_asistente'
       AND grupo = 'consecuencia_economica'
  ) THEN
    v_faltan := v_faltan || ' la accion del registro de actividad;';
  END IF;

  IF (
    SELECT count(*) FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'datos_bancarios_asistente'
  ) <> 5 THEN
    v_faltan := v_faltan || ' las cinco politicas;';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'datos_bancarios_asistente'
       AND policyname = 'lee_los_datos_bancarios_quien_tiene_el_permiso'
       AND qual LIKE '%ver_datos_bancarios_asistente%'
  ) THEN
    v_faltan := v_faltan || ' la politica de lectura con el permiso;';
  END IF;

  -- El Asistente llega a la suya, y por la funcion que resuelve la ficha con la sesion.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'datos_bancarios_asistente'
       AND policyname = 'lee_sus_propios_datos_bancarios_el_asistente'
       AND cmd = 'SELECT'
       AND qual LIKE '%es_su_propia_ficha_de_asistente%'
  ) THEN
    v_faltan := v_faltan || ' la politica con la que el Asistente lee la suya;';
  END IF;

  -- Y no escribe: las tres de escritura siguen siendo solo de la administracion.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'datos_bancarios_asistente'
       AND cmd <> 'SELECT'
       AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%es_su_propia_ficha_de_asistente%'
  ) THEN
    v_faltan := v_faltan || ' el Asistente quedo pudiendo escribir sus datos bancarios;';
  END IF;

  -- Que `anon` no haya quedado con nada: la plantilla se lo da y hay que sacarselo.
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'datos_bancarios_asistente' AND grantee = 'anon'
  ) THEN
    v_faltan := v_faltan || ' a anon le quedo permiso sobre la tabla;';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'interno' AND p.proname = 'los_datos_bancarios_son_del_mismo_asistente'
       AND p.prosecdef
  ) THEN
    v_faltan := v_faltan || ' la funcion quedo SECURITY DEFINER, y no puede serlo;';
  END IF;

  IF v_faltan <> '' THEN
    RAISE EXCEPTION 'La migracion de donde cobra el Asistente no quedo completa:%', v_faltan;
  END IF;
END;
$comprobacion$;

COMMIT;

NOTIFY pgrst, 'reload schema';
