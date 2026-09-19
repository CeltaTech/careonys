-- Un celular es de una sola persona; una linea fija se comparte.
-- =====================================================================================
--
-- QUÉ FALTABA. La base aceptaba el mismo número de teléfono en dos personas en todos los casos. Lo
-- único que había era que la misma persona no cargara dos veces el mismo número, y eso no es lo
-- mismo: un celular identifica a una persona, y dos cuentas con el mismo celular son dos cuentas
-- que se recuperan con el mismo teléfono. Una línea fija, en cambio, es de la casa: que el padre y
-- la hija tengan el mismo número fijo es lo corriente y no se rechaza.
--
-- POR QUÉ HACE FALTA DISTINGUIR. Sin saber si un número es fijo o celular, las dos únicas salidas
-- son prohibir todo —y romper a la familia que comparte la línea de la casa— o permitir todo, que
-- es lo que hay hoy.
--
-- CÓMO SE RECONOCE UN CELULAR, Y POR QUÉ NO ESTÁ ESCRITO EN EL CÓDIGO. Depende del país: en
-- Argentina un celular en forma internacional empieza con 54 y un 9 delante del área, y un fijo no
-- lleva ese 9. En otro país la marca es otra. Entonces esto es un catálogo con el país en la clave,
-- igual que `catalogo_identificadores_de_cuenta`: agregar un país es cargar filas, nunca tocar
-- código.
--
-- Y SÓLO ENTRA ARGENTINA. Es el único país cuya regla está averiguada. Un país sin su renglón
-- cargado no tiene ningún número reconocido como celular, así que no se rechaza nada suyo. Se
-- prefiere eso antes que deducir por parecido con el país de al lado.
--
-- LO QUE NO SE RECONOCE, SE PERMITE. Un número cargado sin el código del país no se puede clasificar
-- —los mismos dígitos son un celular en un país y un fijo en otro—, así que no queda marcado como
-- celular y se sigue permitiendo repetido. La restricción se aplica sobre lo que se sabe, no sobre
-- lo que se sospecha.
--
-- LA UNICIDAD LA IMPONE LA BASE. Es un índice, no una comprobación de pantalla ni del motor. El
-- motor comprueba también, porque así puede contestar con una frase entendible en lugar de un choque
-- de base, pero si esa comprobación faltara la base seguiría rechazando igual.
--
-- ES POR PRESTADORA. La misma persona tiene una cuenta por cada Prestadora en la que trabaja, y las
-- dos llevan su celular. Prohibirlo entre Prestadoras sería impedirle entrar a la segunda. Lo que no
-- puede pasar es que adentro de una misma Prestadora dos personas distintas lleven el mismo celular.
--
-- EL NÚMERO NO SALE POR NINGÚN LADO. Es dato sensible: no se registra, no viaja en ninguna
-- dirección, no aparece en ningún mensaje de error y no se escribe para depurar. Por eso el índice
-- no se arma sobre el número sino sobre una huella suya: cuando la base rechaza un repetido, el
-- detalle del error lleva la huella y nunca el teléfono.
--
-- Y LO QUE YA ESTÁ CARGADO NO SE PIERDE. Si hoy hubiera un celular repetido, un índice único a
-- secas dejaría la base sin poder reconstruirse desde cero. Se resuelve de la forma más conservadora
-- que hay: no se borra ni se cambia ningún teléfono de nadie. De cada grupo repetido queda marcada
-- como celular la cuenta más antigua, y las demás quedan sin marcar —lo que las trata como si el
-- número no se hubiera podido reconocer, que es justo el caso que se permite—. Queda un aviso con
-- cuántas fueron, sin ningún número adentro.
--
-- CÓMO SE VUELVE ATRÁS.
--   DROP INDEX IF EXISTS public.un_celular_es_de_una_sola_persona;
--   DROP TRIGGER IF EXISTS el_telefono_dice_si_es_celular ON public.usuarios;
--   DROP FUNCTION IF EXISTS interno.el_telefono_dice_si_es_celular();
--   ALTER TABLE public.usuarios DROP COLUMN IF EXISTS telefono_comparable;
--   ALTER TABLE public.usuarios DROP COLUMN IF EXISTS telefono_es_celular;
--   DROP FUNCTION IF EXISTS interno.es_un_celular(text);
--   DROP FUNCTION IF EXISTS interno.numero_comparable(text);
--   DROP TABLE IF EXISTS public.catalogo_prefijos_de_celular;
--   -- Las columnas salen antes que las funciones: la huella se calcula con una de ellas.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Con qué empieza un celular en cada país
-- ---------------------------------------------------------------------------
--
-- El prefijo se guarda en forma internacional y sólo con dígitos, sin el `+` y sin separadores, que
-- es como queda el número después de normalizarlo. Como el prefijo ya incluye el código del país, la
-- comparación no necesita saber de qué país es el número: el propio número lo dice.

CREATE TABLE IF NOT EXISTS public.catalogo_prefijos_de_celular (
  pais text NOT NULL,
  prefijo text NOT NULL,
  orden integer NOT NULL DEFAULT 100,
  activo boolean NOT NULL DEFAULT true,
  PRIMARY KEY (pais, prefijo),
  CONSTRAINT el_prefijo_de_celular_es_solo_digitos
    CHECK (prefijo ~ '^[0-9]+$')
);

COMMENT ON TABLE public.catalogo_prefijos_de_celular IS
  'Con que empieza un numero de celular en cada pais, en forma internacional y solo con digitos. Un pais nuevo entra cargando filas, nunca tocando codigo. El pais sin filas no tiene ningun numero reconocido como celular.';
COMMENT ON COLUMN public.catalogo_prefijos_de_celular.prefijo IS
  'Digitos con los que empieza el numero, sin el mas y sin separadores. Incluye el codigo de pais.';

-- Argentina: en forma internacional el celular lleva un 9 entre el código de país y el área
-- (54 9 11 …), y el fijo no lo lleva (54 11 …). Es el único país con su regla averiguada.
INSERT INTO public.catalogo_prefijos_de_celular (pais, prefijo, orden) VALUES
  ('AR', '549', 10)
ON CONFLICT (pais, prefijo) DO NOTHING;

ALTER TABLE public.catalogo_prefijos_de_celular ENABLE ROW LEVEL SECURITY;

-- Lo lee cualquiera con sesión: no dice nada de ninguna persona ni de ninguna Organización.
-- No lo escribe nadie desde el producto.
CREATE POLICY catalogo_prefijos_de_celular_lo_lee_quien_tiene_sesion
  ON public.catalogo_prefijos_de_celular
  FOR SELECT
  TO authenticated
  USING (true);

-- La plantilla de Supabase le da ALL a `anon` y `authenticated` en toda tabla nueva de `public`.
-- Se lo saca primero y después se le da lo que hace falta y nada más.
REVOKE ALL ON TABLE public.catalogo_prefijos_de_celular FROM anon;
REVOKE ALL ON TABLE public.catalogo_prefijos_de_celular FROM authenticated;
GRANT SELECT ON TABLE public.catalogo_prefijos_de_celular TO authenticated;
GRANT ALL ON TABLE public.catalogo_prefijos_de_celular TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Cuándo dos números son el mismo, sin escribir ninguno
-- ---------------------------------------------------------------------------
--
-- Acá sólo interesa la pregunta «¿es el mismo número?», y para eso alcanza una huella. Se queda con
-- los dígitos —así `+54 9 11 5555-1234` y `5491155551234` son el mismo— y devuelve la huella, nunca
-- el número. Es lo que hace que el detalle del choque de índice que arma Postgres no lleve adentro
-- el teléfono de nadie. Es la misma idea que ya usa `telefono_huella` del lado del motor.
--
-- Tiene que ser IMMUTABLE porque un índice se arma sobre ella, y por eso se queda con `md5`, que es
-- del núcleo de Postgres: no depende de ninguna extensión instalada.

CREATE OR REPLACE FUNCTION interno.numero_comparable(p_telefono text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
AS $$
  SELECT CASE
           WHEN regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g') = '' THEN NULL
           ELSE md5(regexp_replace(p_telefono, '[^0-9]', '', 'g'))
         END;
$$;

COMMENT ON FUNCTION interno.numero_comparable(text) IS
  'La huella de un telefono, para comparar dos numeros sin guardar ni mostrar ninguno.';

ALTER FUNCTION interno.numero_comparable(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION interno.numero_comparable(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.numero_comparable(text) TO authenticated;
GRANT EXECUTE ON FUNCTION interno.numero_comparable(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Si ese número es un celular
-- ---------------------------------------------------------------------------
--
-- Lee el catálogo, así que es STABLE y no puede ir adentro de un índice: por eso lo que se guarda en
-- la ficha es la respuesta, y el índice se arma sobre ella. Un número vacío, o que no empieza con
-- ningún prefijo cargado, no es un celular reconocido y se trata como fijo.

CREATE OR REPLACE FUNCTION interno.es_un_celular(p_telefono text)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.catalogo_prefijos_de_celular c
     WHERE c.activo
       AND regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g') <> ''
       AND regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g') LIKE c.prefijo || '%'
  );
$$;

COMMENT ON FUNCTION interno.es_un_celular(text) IS
  'Si ese numero es un celular segun el catalogo de prefijos. Lo que no esta en el catalogo no es celular reconocido.';

ALTER FUNCTION interno.es_un_celular(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION interno.es_un_celular(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.es_un_celular(text) TO authenticated;
GRANT EXECUTE ON FUNCTION interno.es_un_celular(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. La respuesta guardada en la ficha
-- ---------------------------------------------------------------------------

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS telefono_es_celular boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.usuarios.telefono_es_celular IS
  'Si el telefono de esta cuenta es un celular reconocido. Lo completa un disparador con el catalogo de prefijos; no lo escribe ninguna pantalla.';

-- Y la huella del número, calculada por la base y nunca escrita por nadie. Es lo que deja que el
-- motor pregunte «¿este número ya está?» sin que el número viaje en ninguna dirección web: lo que
-- va en la consulta es la huella. Es la misma idea que `telefono_huella`, que ya se usa para lo
-- mismo del lado del motor.
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS telefono_comparable text
  GENERATED ALWAYS AS (interno.numero_comparable(telefono)) STORED;

COMMENT ON COLUMN public.usuarios.telefono_comparable IS
  'La huella del telefono, para comparar dos numeros sin que ninguno viaje ni quede escrito. La calcula la base.';

-- ---------------------------------------------------------------------------
-- 5. Lo que ya estaba cargado
-- ---------------------------------------------------------------------------
--
-- Primero se contesta la pregunta para todas las fichas que ya existen, y recién después se desmarca
-- lo repetido. Las dos cosas pasan antes de que exista el disparador y antes de que exista el
-- índice: así ninguna fila queda rechazada por una regla que todavía no regía cuando se cargó.

UPDATE public.usuarios
   SET telefono_es_celular = interno.es_un_celular(telefono)
 WHERE telefono IS NOT NULL
   AND telefono_es_celular IS DISTINCT FROM interno.es_un_celular(telefono);

-- De cada grupo repetido queda la cuenta más antigua. Las demás no se borran, no se editan y no
-- pierden su teléfono: sólo dejan de estar marcadas como celular, que es exactamente el trato que
-- recibe un número que no se pudo reconocer. El aviso dice cuántas fueron y ningún número.
DO $ya_cargados$
DECLARE
  v_desmarcadas integer := 0;
BEGIN
  WITH repetidos AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY coalesce(prestadora_id, '00000000-0000-0000-0000-000000000000'::uuid),
                          telefono_comparable
             ORDER BY created_at NULLS LAST, id
           ) AS puesto
      FROM public.usuarios
     WHERE telefono_es_celular
  )
  UPDATE public.usuarios u
     SET telefono_es_celular = false
    FROM repetidos r
   WHERE r.id = u.id
     AND r.puesto > 1;

  GET DIAGNOSTICS v_desmarcadas = ROW_COUNT;

  IF v_desmarcadas > 0 THEN
    RAISE NOTICE 'Cuentas que compartian un celular y quedaron sin marcar: %', v_desmarcadas;
  END IF;
END;
$ya_cargados$;

-- ---------------------------------------------------------------------------
-- 6. La unicidad, impuesta por la base
-- ---------------------------------------------------------------------------
--
-- Parcial: sólo alcanza a lo que está marcado como celular, así que dos personas con el mismo número
-- fijo siguen entrando. Y por Prestadora, porque la misma persona tiene una cuenta en cada una.
-- `prestadora_id` está en nulo para el Superadmin, y en un índice único los nulos no chocan entre
-- sí; el `coalesce` los junta para que ahí la regla también rija.

CREATE UNIQUE INDEX IF NOT EXISTS un_celular_es_de_una_sola_persona
  ON public.usuarios (
    coalesce(prestadora_id, '00000000-0000-0000-0000-000000000000'::uuid),
    telefono_comparable
  )
  WHERE telefono_es_celular;

-- ---------------------------------------------------------------------------
-- 7. Quién completa la respuesta
-- ---------------------------------------------------------------------------
--
-- Se vuelve a preguntar cuando la ficha nace y cuando cambia el teléfono, y en ningún otro caso:
-- corregirle el nombre a una ficha vieja no tiene por qué chocar contra una regla que no existía el
-- día que se cargó. Mientras el teléfono no cambia, la respuesta se conserva tal cual estaba, así
-- que tampoco se la puede pisar escribiendo la columna a mano.
--
-- No es `SECURITY DEFINER`: corre con el rol de quien escribe, y por eso la función que llama tiene
-- `EXECUTE` para `authenticated` en `interno` (CLAUDE.md del producto, §6).

CREATE OR REPLACE FUNCTION interno.el_telefono_dice_si_es_celular()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'interno'
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.telefono IS DISTINCT FROM OLD.telefono THEN
    NEW.telefono_es_celular := interno.es_un_celular(NEW.telefono);
  ELSE
    NEW.telefono_es_celular := OLD.telefono_es_celular;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION interno.el_telefono_dice_si_es_celular() IS
  'Completa si el telefono de la ficha es un celular. No nombra ningun numero.';

ALTER FUNCTION interno.el_telefono_dice_si_es_celular() OWNER TO postgres;
REVOKE ALL ON FUNCTION interno.el_telefono_dice_si_es_celular() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.el_telefono_dice_si_es_celular() TO authenticated;
GRANT EXECUTE ON FUNCTION interno.el_telefono_dice_si_es_celular() TO service_role;

DROP TRIGGER IF EXISTS el_telefono_dice_si_es_celular ON public.usuarios;
CREATE TRIGGER el_telefono_dice_si_es_celular
  BEFORE INSERT OR UPDATE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION interno.el_telefono_dice_si_es_celular();

-- ---------------------------------------------------------------------------
-- Que lo de arriba haya quedado como dice
-- ---------------------------------------------------------------------------

DO $comprobacion$
DECLARE
  v_faltan text := '';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.catalogo_prefijos_de_celular WHERE pais = 'AR' AND activo
  ) THEN
    v_faltan := v_faltan || ' el catalogo de prefijos de Argentina;';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'catalogo_prefijos_de_celular' AND c.relrowsecurity
  ) THEN
    v_faltan := v_faltan || ' la proteccion por fila encendida en el catalogo;';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'catalogo_prefijos_de_celular' AND grantee = 'anon'
  ) THEN
    v_faltan := v_faltan || ' a anon le quedo permiso sobre el catalogo;';
  END IF;

  -- Un celular argentino se reconoce, y el mismo número sin el 9 no.
  IF NOT interno.es_un_celular('+54 9 11 5555-1234') THEN
    v_faltan := v_faltan || ' el celular argentino no se reconoce;';
  END IF;

  IF interno.es_un_celular('+54 11 5555-1234') THEN
    v_faltan := v_faltan || ' la linea fija argentina quedo tratada como celular;';
  END IF;

  IF interno.es_un_celular(NULL) OR interno.es_un_celular('') THEN
    v_faltan := v_faltan || ' un telefono vacio quedo tratado como celular;';
  END IF;

  -- El mismo número escrito de dos maneras tiene que dar la misma huella, y otro número otra.
  IF interno.numero_comparable('+54 9 11 5555-1234') <> interno.numero_comparable('5491155551234') THEN
    v_faltan := v_faltan || ' el mismo numero escrito distinto no da la misma huella;';
  END IF;

  IF interno.numero_comparable('5491155551234') = interno.numero_comparable('5491155551235') THEN
    v_faltan := v_faltan || ' dos numeros distintos dan la misma huella;';
  END IF;

  -- Sin numero no hay huella: asi ninguna ficha sin telefono choca con otra.
  IF interno.numero_comparable(NULL) IS NOT NULL OR interno.numero_comparable(' ') IS NOT NULL THEN
    v_faltan := v_faltan || ' un telefono vacio quedo con huella;';
  END IF;

  -- Y la huella la calcula la base sola: la columna es generada y nadie la escribe.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'usuarios'
       AND column_name = 'telefono_comparable' AND is_generated = 'ALWAYS'
  ) THEN
    v_faltan := v_faltan || ' la huella del telefono no la calcula la base;';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'usuarios'
       AND indexname = 'un_celular_es_de_una_sola_persona'
       AND indexdef LIKE '%telefono_es_celular%'
  ) THEN
    v_faltan := v_faltan || ' el indice que impide el celular repetido;';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'el_telefono_dice_si_es_celular'
       AND tgrelid = 'public.usuarios'::regclass
       AND NOT tgisinternal
  ) THEN
    v_faltan := v_faltan || ' el disparador que completa la respuesta;';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'interno'
       AND p.proname IN ('el_telefono_dice_si_es_celular', 'es_un_celular', 'numero_comparable')
       AND p.prosecdef
  ) THEN
    v_faltan := v_faltan || ' alguna funcion quedo SECURITY DEFINER, y no puede serlo;';
  END IF;

  -- Y que no haya quedado ningún celular repetido, que es lo que el indice no perdonaria.
  IF EXISTS (
    SELECT 1 FROM public.usuarios
     WHERE telefono_es_celular
     GROUP BY coalesce(prestadora_id, '00000000-0000-0000-0000-000000000000'::uuid),
              telefono_comparable
    HAVING count(*) > 1
  ) THEN
    v_faltan := v_faltan || ' quedo algun celular en mas de una cuenta;';
  END IF;

  IF v_faltan <> '' THEN
    RAISE EXCEPTION 'La migracion del celular de una sola persona no quedo completa:%', v_faltan;
  END IF;
END;
$comprobacion$;

COMMIT;

NOTIFY pgrst, 'reload schema';
