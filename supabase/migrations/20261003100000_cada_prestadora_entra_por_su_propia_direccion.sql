-- Cada Prestadora entra por su propia dirección
--
-- QUÉ FALTABA. La pantalla de ingreso ya lee la dirección con la que se la abrió y el motor ya la
-- resuelve contra lo que la Prestadora tenga cargado, pero nadie le cargaba ninguna: al dar de
-- alta una Prestadora la columna `configuracion_prestadora.dominio` quedaba vacía, y una fila
-- vacía significa que esa Prestadora no tiene puerta. Acá se cierra el otro extremo: la dirección
-- es única, no se puede quedar con un nombre que el producto usa para sí, no cambia nunca, y las
-- Prestadoras que ya existen quedan con la suya puesta.
--
-- POR QUÉ NO ES `NOT NULL`. La fila de configuración la siembra la base en el mismo instante en
-- que se inserta la Prestadora (`sembrar_configuracion_prestadora`), y en ese instante todavía no
-- hay dirección elegida: quien la elige es el alta, un momento después. Una columna obligatoria
-- haría imposible el alta. Lo que sí queda garantizado es que ninguna dirección se repite,
-- ninguna es un nombre reservado, y ninguna cambia una vez puesta.
--
-- QUÉ SE GUARDA. El rótulo solo —`cuidardelsur`—, que es lo que el Panel le manda al motor cuando
-- alguien abre la pantalla de ingreso en `cuidardelsur.careonys.com`. Una Prestadora que entre
-- por un dominio suyo tiene guardada la dirección entera, con puntos, y por eso la comprobación
-- contra los nombres reservados se hace sólo cuando el valor no tiene ningún punto: lo reservado
-- es un rótulo bajo el dominio del producto, no una dirección ajena.
--
-- DE QUÉ LADO DEL MURO VIVE. El disparador va en `interno`, que queda afuera de los esquemas
-- publicados, y conserva `authenticated` para que un alta hecha con la sesión de una persona no
-- se caiga con `42501 permission denied for function`. No es SECURITY DEFINER: consulta una tabla
-- directamente, y esa tabla la puede leer cualquiera que haya iniciado sesión.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Los nombres que el producto se reserva para sí
-- ---------------------------------------------------------------------------
--
-- Son las direcciones que el producto ya publica: el Panel general, las dos aplicaciones y el
-- sitio. Ninguna Prestadora puede quedarse con una de ellas, porque le sacaría la puerta a una
-- pantalla del producto. Viven en una tabla y no escritos en el código para que publicar una
-- pantalla nueva sea agregar una fila y no publicar el motor de nuevo.

CREATE TABLE IF NOT EXISTS public.direcciones_reservadas (
  direccion  text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.direcciones_reservadas IS
  'Los rotulos que el producto usa para sus propias pantallas bajo su dominio. Ninguna Prestadora puede recibir uno.';

ALTER TABLE public.direcciones_reservadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cualquiera_con_sesion_lee_direcciones_reservadas" ON public.direcciones_reservadas;
CREATE POLICY "cualquiera_con_sesion_lee_direcciones_reservadas"
  ON public.direcciones_reservadas
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "superadmin_gestiona_direcciones_reservadas" ON public.direcciones_reservadas;
CREATE POLICY "superadmin_gestiona_direcciones_reservadas"
  ON public.direcciones_reservadas
  FOR ALL
  TO authenticated
  USING (interno.es_superadmin())
  WITH CHECK (interno.es_superadmin());

REVOKE ALL ON TABLE public.direcciones_reservadas FROM anon;
GRANT SELECT ON TABLE public.direcciones_reservadas TO authenticated;
GRANT ALL ON TABLE public.direcciones_reservadas TO service_role;

INSERT INTO public.direcciones_reservadas (direccion) VALUES
  ('www'),
  ('gestion'),
  ('familias'),
  ('asistentes')
ON CONFLICT (direccion) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Dos Prestadoras no entran por la misma dirección
-- ---------------------------------------------------------------------------
--
-- La restricción que ya había distinguía mayúsculas de minúsculas, y una dirección web no las
-- distingue: `CuidarDelSur` y `cuidardelsur` son la misma puerta y entraban las dos.

CREATE UNIQUE INDEX IF NOT EXISTS configuracion_prestadora_dominio_unico
  ON public.configuracion_prestadora (lower(dominio));

COMMENT ON COLUMN public.configuracion_prestadora.dominio IS
  'La direccion por la que entra esta Prestadora. Se le asigna sola al darla de alta, es unica y no cambia nunca.';

-- ---------------------------------------------------------------------------
-- 3. Las Prestadoras que ya existen reciben la suya
-- ---------------------------------------------------------------------------
--
-- Con la misma regla que usa el alta: del nombre de la casilla desde la que manda, si ya tiene
-- una —que salió del dominio propio que declaró—, y si no, de su nombre de fantasía. Y con un
-- sufijo cuando el que salió ya está tomado o es un nombre reservado.
--
-- Va antes de crear el disparador a propósito: después, la regla de que la dirección no cambia
-- rechazaría este mismo relleno.

DO $$
DECLARE
  fila       record;
  base       text;
  candidata  text;
  sufijo     int;
BEGIN
  FOR fila IN
    SELECT c.prestadora_id, p.casilla_envio, p.nombre_fantasia
      FROM public.configuracion_prestadora c
      JOIN public.prestadoras p ON p.id = c.prestadora_id
     WHERE c.dominio IS NULL OR btrim(c.dominio) = ''
     ORDER BY p.created_at, p.id
  LOOP
    base := COALESCE(NULLIF(lower(btrim(fila.casilla_envio)), ''), '');

    IF base = '' THEN
      base := regexp_replace(
                translate(lower(btrim(COALESCE(fila.nombre_fantasia, ''))),
                          'áàäâãéèëêíìïîóòöôõúùüûñç',
                          'aaaaaeeeeiiiiooooouuuunc'),
                '[^a-z0-9]+', '-', 'g');
      base := btrim(base, '-');
      base := btrim(left(base, 40), '-');
    END IF;

    IF base = '' THEN
      -- Sin nombre no hay dirección que derivar, y una dirección inventada acá sería un nombre de
      -- negocio inventado. Se corta: esa Prestadora tiene un problema anterior a éste.
      RAISE EXCEPTION 'la Prestadora % no tiene de dónde derivar su dirección', fila.prestadora_id;
    END IF;

    candidata := base;
    sufijo := 1;

    WHILE EXISTS (SELECT 1 FROM public.configuracion_prestadora c2
                   WHERE lower(c2.dominio) = candidata)
       OR EXISTS (SELECT 1 FROM public.direcciones_reservadas r
                   WHERE r.direccion = candidata)
    LOOP
      sufijo := sufijo + 1;
      IF sufijo > 99 THEN
        RAISE EXCEPTION 'no quedó ninguna dirección libre derivada de «%»', base;
      END IF;
      candidata := base || '-' || sufijo;
    END LOOP;

    UPDATE public.configuracion_prestadora
       SET dominio = candidata,
           updated_at = now()
     WHERE prestadora_id = fila.prestadora_id;
  END LOOP;
END;
$$;

-- Y se comprueba que no haya quedado ninguna sin puerta. Si quedó, la migración no pasa: una
-- Prestadora a la que nadie puede entrar no es un estado aceptable de la base.
DO $$
DECLARE sin_puerta int;
BEGIN
  SELECT count(*) INTO sin_puerta
    FROM public.configuracion_prestadora
   WHERE dominio IS NULL OR btrim(dominio) = '';

  IF sin_puerta > 0 THEN
    RAISE EXCEPTION 'quedaron % Prestadoras sin dirección de ingreso', sin_puerta;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. La dirección no se elige a dedo y no cambia nunca
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION interno.la_direccion_de_la_prestadora_es_suya()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, interno
AS $$
DECLARE nueva text;
BEGIN
  nueva := NULLIF(lower(btrim(COALESCE(NEW.dominio, ''))), '');

  IF TG_OP = 'UPDATE'
     AND OLD.dominio IS NOT NULL
     AND nueva IS DISTINCT FROM lower(btrim(OLD.dominio)) THEN
    RAISE EXCEPTION 'la_direccion_de_la_prestadora_no_cambia';
  END IF;

  NEW.dominio := nueva;

  IF nueva IS NULL THEN
    RETURN NEW;
  END IF;

  -- La forma de una dirección web: letras sin acento, números, guiones y puntos, y ni un guión ni
  -- un punto en los extremos.
  IF nueva !~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$' THEN
    RAISE EXCEPTION 'la_direccion_de_la_prestadora_no_tiene_forma';
  END IF;

  -- Lo reservado es un rótulo bajo el dominio del producto. Una Prestadora con dominio propio
  -- guarda la dirección entera, con puntos, y ahí no hay nada que reservar.
  IF position('.' in nueva) = 0
     AND EXISTS (SELECT 1 FROM public.direcciones_reservadas r WHERE r.direccion = nueva) THEN
    RAISE EXCEPTION 'la_direccion_de_la_prestadora_esta_reservada';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION interno.la_direccion_de_la_prestadora_es_suya() IS
  'La direccion por la que entra una Prestadora: con forma de direccion web, nunca un nombre reservado del producto, y una vez puesta no cambia.';

DROP TRIGGER IF EXISTS la_direccion_de_la_prestadora_es_suya ON public.configuracion_prestadora;
CREATE TRIGGER la_direccion_de_la_prestadora_es_suya
  BEFORE INSERT OR UPDATE
  ON public.configuracion_prestadora
  FOR EACH ROW EXECUTE FUNCTION interno.la_direccion_de_la_prestadora_es_suya();

-- ---------------------------------------------------------------------------
-- 5. Permisos
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION interno.la_direccion_de_la_prestadora_es_suya() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.la_direccion_de_la_prestadora_es_suya() TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
