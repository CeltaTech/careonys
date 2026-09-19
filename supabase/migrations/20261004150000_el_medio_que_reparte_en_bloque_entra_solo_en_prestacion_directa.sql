-- El medio que recibe en bloque y reparte entra solo en prestacion directa.
-- =====================================================================================
--
-- QUÉ ENTRA. Un medio de pago más para el Asistente: alguien recibe el dinero en bloque y lo
-- reparte. Es una opción más de la lista `medios_de_pago_al_asistente`, al lado de la
-- transferencia y del efectivo, y no cambia nada de lo que ya estaba.
--
-- POR QUÉ NO PUEDE ESTAR EN MATCH. En Match la Familia le paga al Asistente y la Prestadora no
-- toca ese dinero: cobra el acceso al contacto y nada más. Quien centraliza esa plata queda
-- pareciendo el que dirige el trabajo, y ahí aparece la relación de dependencia. Entonces el medio
-- existe en prestación directa y en ninguna otra modalidad de trabajo.
--
-- QUÉ FALTABA PARA PODER DECIRLO. El catálogo de opciones no distinguía en qué modalidad de
-- trabajo se puede usar cada opción: hasta hoy todas servían para todas. La distinción entra como
-- una columna del catálogo —`opciones_de_lista.modalidades`—, no como una lista escrita adentro de
-- una pantalla ni adentro del motor. Vacía —nula— quiere decir lo de siempre: esta opción alcanza
-- a todas las modalidades. Con valores, alcanza sólo a las que nombra.
--
-- NO SE CREA NINGUNA TABLA. Se le agrega una columna a `public.opciones_de_lista`, que ya nace con
-- protección por fila y con sus permisos concretos en
-- `20261001150000_las_listas_de_opciones.sql`: ahí se revocó todo a `anon` y a `authenticated` y
-- después se concedió lo justo. Una columna nueva queda adentro de esos mismos permisos y de esas
-- mismas políticas, así que no hay nada que volver a conceder.
--
-- QUIÉN LO HACE CUMPLIR, Y POR QUÉ NO ALCANZA LA PANTALLA. Un disparador sobre
-- `liquidaciones_asistente`. La liquidación no guarda ninguna modalidad, así que la modalidad no
-- se pregunta: se deduce de las guardias completadas de ese Asistente adentro del período que la
-- liquidación paga. Si alguna de esas guardias es de una modalidad que el medio no alcanza, la
-- fila no se guarda. Sin guardias completadas en el período no hay nada de Match adentro, y el
-- medio se admite.
--
-- No es `SECURITY DEFINER` —el `CLAUDE.md` del producto lo prohíbe expresamente—: comprueba con
-- los permisos de quien escribe, y por eso las dos funciones nuevas conservan `authenticated`.
--
-- EL DISPARADOR QUE YA ESTABA NO SE TOCA. `el_medio_del_pago_sale_del_catalogo` sigue
-- comprobando que el medio exista en el catálogo. Éste comprueba otra cosa —que alcance a la
-- modalidad— y por eso es otro disparador y otra función. Una migración aplicada no se edita.
--
-- EL NOMBRE DE LA OPCIÓN. `clave` es lo que queda guardado en cada liquidación y no se renombra
-- nunca. Acá se usan las palabras del propio pedido: pago en bloque.
--
-- CÓMO SE VUELVE ATRÁS.
--   DROP TRIGGER IF EXISTS el_medio_del_pago_alcanza_la_modalidad ON public.liquidaciones_asistente;
--   DROP FUNCTION IF EXISTS interno.el_medio_de_pago_alcanza_la_modalidad();
--   DROP FUNCTION IF EXISTS interno.las_modalidades_de_la_liquidacion(uuid, uuid, date, date);
--   DELETE FROM public.opciones_de_lista o USING public.listas_de_opciones l
--     WHERE l.id = o.lista_id AND l.prestadora_id IS NULL
--       AND l.clave = 'medios_de_pago_al_asistente' AND o.clave = 'pago_en_bloque';
--   ALTER TABLE public.opciones_de_lista DROP COLUMN IF EXISTS modalidades;

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. La marca en el catálogo
-- ---------------------------------------------------------------------------
--
-- Nula quiere decir «todas», que es lo que valía hasta hoy para cada opción ya cargada. Así nada
-- de lo que ya está cambia de comportamiento por esta migración.
--
-- Los tres valores admitidos son los mismos que ya guardan `prestadora_modalidades.modalidad` y
-- `guardias.canal_modalidad`. Una lista vacía no se admite: sería una opción que no alcanza a
-- ninguna modalidad, es decir una opción que no se puede usar en ningún lado, y eso ya se dice
-- poniendo `activa` en falso.

ALTER TABLE public.opciones_de_lista
  ADD COLUMN IF NOT EXISTS modalidades text[];

ALTER TABLE public.opciones_de_lista
  DROP CONSTRAINT IF EXISTS opciones_de_lista_modalidades_check;
ALTER TABLE public.opciones_de_lista
  ADD CONSTRAINT opciones_de_lista_modalidades_check
  CHECK (
    modalidades IS NULL
    OR (
      array_length(modalidades, 1) >= 1
      AND modalidades <@ ARRAY['directa', 'marketplace', 'subcontratacion']::text[]
    )
  );

COMMENT ON COLUMN public.opciones_de_lista.modalidades IS
  'En que modalidades de trabajo se puede usar esta opcion. Nulo quiere decir que alcanza a todas.';

-- ---------------------------------------------------------------------------
-- 2. La opción nueva
-- ---------------------------------------------------------------------------
--
-- Va detrás de las dos que ya estaban. El texto entra en los tres idiomas, como toda opción que
-- trae el producto.

INSERT INTO public.opciones_de_lista (prestadora_id, lista_id, clave, i18n, orden, modalidades)
SELECT NULL, l.id, 'pago_en_bloque',
       '{"es-AR": "Pago en bloque", "en": "Bulk payment", "pt-BR": "Pagamento em bloco"}'::jsonb,
       30, ARRAY['directa']::text[]
  FROM public.listas_de_opciones l
 WHERE l.prestadora_id IS NULL
   AND l.clave = 'medios_de_pago_al_asistente'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. De qué modalidades es lo que paga una liquidación
-- ---------------------------------------------------------------------------
--
-- La liquidación no guarda la modalidad, y no se le agrega una: la modalidad ya está escrita en
-- cada guardia. Guardarla otra vez en la liquidación sería el mismo dato en dos lugares, y el día
-- que se corrigiera una guardia los dos dirían cosas distintas.
--
-- Se miran sólo las guardias completadas, que son exactamente las que la liquidación cuenta: una
-- guardia que no se hizo no movió dinero de nadie.

CREATE OR REPLACE FUNCTION interno.las_modalidades_de_la_liquidacion(
  p_prestadora uuid,
  p_asistente uuid,
  p_desde date,
  p_hasta date
)
  RETURNS text[]
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'interno'
AS $$
  SELECT coalesce(array_agg(DISTINCT g.canal_modalidad), ARRAY[]::text[])
    FROM public.guardias g
   WHERE g.prestadora_id = p_prestadora
     AND g.asistente_id = p_asistente
     AND g.fecha >= p_desde
     AND g.fecha <= p_hasta
     AND g.estado = 'completada';
$$;

COMMENT ON FUNCTION interno.las_modalidades_de_la_liquidacion(uuid, uuid, date, date) IS
  'Las modalidades de trabajo de las guardias completadas que paga una liquidacion. Vacio quiere decir que no paga ninguna guardia.';

ALTER FUNCTION interno.las_modalidades_de_la_liquidacion(uuid, uuid, date, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION interno.las_modalidades_de_la_liquidacion(uuid, uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.las_modalidades_de_la_liquidacion(uuid, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION interno.las_modalidades_de_la_liquidacion(uuid, uuid, date, date) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Quien lo hace cumplir
-- ---------------------------------------------------------------------------
--
-- Mira la opción que corresponde a esta Prestadora —la del producto o la suya, nunca la de otra—,
-- y si esa opción nombra modalidades, ninguna de las que la liquidación paga puede quedar afuera.
-- Una opción sin modalidades escritas alcanza a todas y no hay nada que comprobar.

CREATE OR REPLACE FUNCTION interno.el_medio_de_pago_alcanza_la_modalidad()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'interno'
AS $$
DECLARE
  v_permitidas text[];
  v_en_juego text[];
  v_fuera text;
BEGIN
  IF NEW.forma_pago IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT o.modalidades INTO v_permitidas
    FROM public.opciones_de_lista o
    JOIN public.listas_de_opciones l ON l.id = o.lista_id
   WHERE l.prestadora_id IS NULL
     AND l.clave = 'medios_de_pago_al_asistente'
     AND o.clave = NEW.forma_pago
     AND o.activa
     AND (o.prestadora_id IS NULL OR o.prestadora_id = NEW.prestadora_id)
   ORDER BY o.prestadora_id NULLS FIRST
   LIMIT 1;

  -- Sin fila no hay nada que decir acá: que el medio exista lo comprueba el otro disparador, y
  -- contestar dos cosas distintas por el mismo problema confunde a quien lo lee.
  IF v_permitidas IS NULL THEN
    RETURN NEW;
  END IF;

  v_en_juego := interno.las_modalidades_de_la_liquidacion(
    NEW.prestadora_id, NEW.asistente_id, NEW.periodo_desde, NEW.periodo_hasta);

  SELECT m INTO v_fuera
    FROM unnest(v_en_juego) AS m
   WHERE NOT (m = ANY (v_permitidas))
   LIMIT 1;

  IF v_fuera IS NOT NULL THEN
    RAISE EXCEPTION 'medio_de_pago_fuera_de_la_modalidad:%', NEW.forma_pago
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION interno.el_medio_de_pago_alcanza_la_modalidad() IS
  'El medio anotado en una liquidacion tiene que alcanzar a todas las modalidades de trabajo que esa liquidacion paga.';

ALTER FUNCTION interno.el_medio_de_pago_alcanza_la_modalidad() OWNER TO postgres;
REVOKE ALL ON FUNCTION interno.el_medio_de_pago_alcanza_la_modalidad() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.el_medio_de_pago_alcanza_la_modalidad() TO authenticated;
GRANT EXECUTE ON FUNCTION interno.el_medio_de_pago_alcanza_la_modalidad() TO service_role;

DROP TRIGGER IF EXISTS el_medio_del_pago_alcanza_la_modalidad ON public.liquidaciones_asistente;
CREATE TRIGGER el_medio_del_pago_alcanza_la_modalidad
  BEFORE INSERT OR UPDATE OF forma_pago ON public.liquidaciones_asistente
  FOR EACH ROW EXECUTE FUNCTION interno.el_medio_de_pago_alcanza_la_modalidad();

-- ---------------------------------------------------------------------------
-- Que lo de arriba haya quedado como dice
-- ---------------------------------------------------------------------------

DO $comprobacion$
DECLARE
  v_faltan text := '';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'opciones_de_lista'
       AND column_name = 'modalidades'
  ) THEN
    v_faltan := v_faltan || ' la marca de modalidad en el catalogo;';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.opciones_de_lista'::regclass
       AND conname = 'opciones_de_lista_modalidades_check'
  ) THEN
    v_faltan := v_faltan || ' el control de los valores de modalidad;';
  END IF;

  -- La opcion nueva existe, y existe atada a prestacion directa y a ninguna otra.
  IF NOT EXISTS (
    SELECT 1
      FROM public.opciones_de_lista o
      JOIN public.listas_de_opciones l ON l.id = o.lista_id
     WHERE l.prestadora_id IS NULL AND l.clave = 'medios_de_pago_al_asistente'
       AND o.prestadora_id IS NULL AND o.clave = 'pago_en_bloque'
       AND o.modalidades = ARRAY['directa']::text[]
  ) THEN
    v_faltan := v_faltan || ' la opcion nueva atada a prestacion directa;';
  END IF;

  -- Y que las que ya estaban sigan alcanzando a todas: si esta migracion le hubiera puesto
  -- modalidades a alguna, habria cambiado en silencio lo que ya se podia elegir.
  IF EXISTS (
    SELECT 1
      FROM public.opciones_de_lista o
      JOIN public.listas_de_opciones l ON l.id = o.lista_id
     WHERE l.prestadora_id IS NULL AND l.clave = 'medios_de_pago_al_asistente'
       AND o.clave IN ('transferencia', 'efectivo')
       AND o.modalidades IS NOT NULL
  ) THEN
    v_faltan := v_faltan || ' a transferencia o efectivo les quedo una modalidad, y alcanzan a todas;';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.liquidaciones_asistente'::regclass
       AND tgname = 'el_medio_del_pago_alcanza_la_modalidad'
  ) THEN
    v_faltan := v_faltan || ' el disparador de la modalidad;';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.liquidaciones_asistente'::regclass
       AND tgname = 'el_medio_del_pago_sale_del_catalogo'
  ) THEN
    v_faltan := v_faltan || ' se perdio el disparador que ya estaba;';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'interno'
       AND p.proname IN ('el_medio_de_pago_alcanza_la_modalidad', 'las_modalidades_de_la_liquidacion')
       AND p.prosecdef
  ) THEN
    v_faltan := v_faltan || ' alguna funcion quedo SECURITY DEFINER, y no puede serlo;';
  END IF;

  -- Que ninguna liquidacion ya guardada haya quedado con un medio que no alcanza su modalidad.
  -- Si esto suma, hay algo anotado que esta migracion deja incoherente.
  IF EXISTS (
    SELECT 1
      FROM public.liquidaciones_asistente li
      JOIN public.opciones_de_lista o ON o.clave = li.forma_pago
      JOIN public.listas_de_opciones l ON l.id = o.lista_id
     WHERE li.forma_pago IS NOT NULL
       AND l.prestadora_id IS NULL AND l.clave = 'medios_de_pago_al_asistente'
       AND (o.prestadora_id IS NULL OR o.prestadora_id = li.prestadora_id)
       AND o.modalidades IS NOT NULL
       AND EXISTS (
         SELECT 1
           FROM unnest(interno.las_modalidades_de_la_liquidacion(
                  li.prestadora_id, li.asistente_id, li.periodo_desde, li.periodo_hasta)) AS m
          WHERE NOT (m = ANY (o.modalidades))
       )
  ) THEN
    v_faltan := v_faltan || ' quedaron liquidaciones con un medio que no alcanza su modalidad;';
  END IF;

  IF v_faltan <> '' THEN
    RAISE EXCEPTION 'La migracion del medio que reparte en bloque no quedo completa:%', v_faltan;
  END IF;
END;
$comprobacion$;

COMMIT;

NOTIFY pgrst, 'reload schema';
