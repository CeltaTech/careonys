-- Una ficha del Padrón tiene varios teléfonos de contacto.
-- =========================================================
--
-- QUÉ FALTABA. El Legajo guarda un solo teléfono, en la columna `legajos.telefono`. Una Familia
-- tiene el fijo de la casa, el celular de quien contrató y el de la hija que atiende cuando los
-- demás no atienden. Un Asistente tiene el suyo y el de la casa. Con un casillero solo, el segundo
-- número termina escrito adentro de las notas, donde nadie lo busca y nadie lo encuentra.
--
-- QUÉ QUEDA. Una fila por teléfono, colgando del Legajo. Fijos o celulares, los que haga falta, y
-- todos habilitados: ninguno se apaga.
--
-- SE PUEDEN REPETIR, Y NO HAY NINGÚN CONTROL QUE LO IMPIDA. Dos hermanos que viven en la misma
-- casa dan el mismo número, y eso no es un error que haya que atajar. Un teléfono del Padrón es un
-- dato de contacto: sirve para llamar a alguien, no para entrar a ningún lado.
--
-- Y NO SE CONFUNDE CON LA REGLA DEL CELULAR ÚNICO. Ésa vive en
-- `20261004100000_un_celular_es_de_una_sola_persona.sql`, alcanza a `usuarios` —o sea a las
-- cuentas con las que alguien entra— y sigue tal cual: dos cuentas de la misma Prestadora no
-- pueden recuperarse con el mismo celular. Acá no hay cuentas ni recuperación de clave, así que la
-- regla no se estira hasta este lado.
--
-- CUÁL ES EL PREFERIDO PARA LLAMAR NO SE GUARDA ACÁ, y es a propósito. El preferido es el que esa
-- Persona usa en su cuenta, así que ya está dicho en otro lado: escribirlo también acá sería
-- guardar por segunda vez algo que ya está guardado, y quedaría viejo el día que cambie el
-- teléfono de la cuenta sin que nadie se entere. Se deduce al leer, comparando contra la cuenta, y
-- eso se hace en un solo lugar: `backend/src/utils/telefonosDelLegajo.js`. Quien no tenga cuenta,
-- o la tenga sin teléfono, no tiene preferido, y no se le inventa ninguno.
--
-- LO YA CARGADO NO SE PIERDE. El teléfono que hoy tiene cada ficha pasa a ser el primero de su
-- lista, con la fecha que ya tenía. Recién después de comprobar que llegaron todos se da de baja
-- la columna vieja: dejarla puesta dejaría dos lugares diciendo cuál es el teléfono de la misma
-- Persona, y el día que se despeguen no habría forma de saber cuál vale.
--
-- NO HAY NINGÚN DISPARADOR ACÁ. `updated_at` lo escribe la ruta que corrige, igual que en el resto
-- de las tablas hijas de este esquema, y no hace falta nada más.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. La tabla
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.telefonos_del_legajo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras (id),
  legajo_id uuid NOT NULL,

  -- Tal como lo escribieron. No se parte en prefijo y número: cada país lo escribe distinto, y
  -- partirlo acá obligaría a saber de cuál se trata. Compararlos es otra cosa y ya está resuelta
  -- en `interno.numero_comparable`.
  telefono text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT el_telefono_del_legajo_no_va_vacio
    CHECK (btrim(telefono) <> ''),

  -- Las dos columnas juntas: así un teléfono no puede colgar de un Legajo de otra Organización,
  -- por más que alguien escriba el identificador a mano. Es la misma forma que usa
  -- `legajos_lugar_fkey`.
  CONSTRAINT el_telefono_es_de_un_legajo_de_esta_prestadora
    FOREIGN KEY (legajo_id, prestadora_id)
    REFERENCES public.legajos (id, prestadora_id)
);

-- No hay ningún índice único sobre el número, y eso no es un olvido: ver el encabezado.
CREATE INDEX IF NOT EXISTS los_telefonos_se_buscan_por_legajo
  ON public.telefonos_del_legajo (prestadora_id, legajo_id, created_at);

COMMENT ON TABLE public.telefonos_del_legajo IS
  'Los telefonos de contacto de una ficha del Padron. Varios por ficha, fijos o celulares, todos habilitados. Se pueden repetir entre fichas: son datos de contacto, no llaves para entrar.';

COMMENT ON COLUMN public.telefonos_del_legajo.telefono IS
  'Tal como lo escribieron. Cual es el preferido para llamar no se guarda: se deduce del telefono de la cuenta de esa Persona al momento de leer.';

-- ---------------------------------------------------------------------------
-- 2. Lo que ya estaba cargado
-- ---------------------------------------------------------------------------

INSERT INTO public.telefonos_del_legajo (prestadora_id, legajo_id, telefono, created_at, updated_at)
SELECT prestadora_id, id, btrim(telefono), created_at, created_at
  FROM public.legajos
 WHERE telefono IS NOT NULL
   AND btrim(telefono) <> ''
   AND NOT EXISTS (
     SELECT 1 FROM public.telefonos_del_legajo t WHERE t.legajo_id = public.legajos.id
   );

DO $traslado$
DECLARE
  v_tenian bigint;
  v_llegaron bigint;
BEGIN
  SELECT count(*) INTO v_tenian
    FROM public.legajos
   WHERE telefono IS NOT NULL AND btrim(telefono) <> '';

  SELECT count(DISTINCT legajo_id) INTO v_llegaron
    FROM public.telefonos_del_legajo;

  -- Se corta antes de dar de baja la columna: una ficha que no llegó es un teléfono perdido, y
  -- perderlo en silencio es peor que no hacer la migración.
  IF v_llegaron < v_tenian THEN
    RAISE EXCEPTION 'El traslado de los telefonos quedo corto: tenian % fichas y llegaron %', v_tenian, v_llegaron;
  END IF;
END;
$traslado$;

-- Recién ahora, con todo del otro lado, se va la columna vieja.
ALTER TABLE public.legajos DROP COLUMN IF EXISTS telefono;

-- ---------------------------------------------------------------------------
-- 3. Quién los ve y quién los escribe
-- ---------------------------------------------------------------------------
--
-- Las mismas dos acciones del Padrón, sin acciones nuevas: el teléfono de una Persona es parte de
-- quién es esa Persona, y quien puede corregir su ficha puede corregir cómo se la llama.
--
-- Y acá sí hay borrado, a diferencia del Legajo. Un Legajo no se borra porque se pierde el
-- historial de esa Persona; un teléfono al que ya no atiende nadie no tiene ningún historial que
-- perder, y dejarlo puesto hace que alguien lo llame.

ALTER TABLE public.telefonos_del_legajo ENABLE ROW LEVEL SECURITY;

CREATE POLICY los_telefonos_los_lee_su_organizacion
  ON public.telefonos_del_legajo
  FOR SELECT
  USING (
    prestadora_id = interno.current_tenant()
    AND interno.tiene_permiso('ver_padron')
  );

CREATE POLICY los_telefonos_los_carga_quien_puede
  ON public.telefonos_del_legajo
  FOR INSERT
  WITH CHECK (
    prestadora_id = interno.current_tenant()
    AND interno.tiene_permiso('editar_padron')
  );

CREATE POLICY los_telefonos_los_corrige_quien_puede
  ON public.telefonos_del_legajo
  FOR UPDATE
  USING (
    prestadora_id = interno.current_tenant()
    AND interno.tiene_permiso('editar_padron')
  )
  WITH CHECK (
    prestadora_id = interno.current_tenant()
    AND interno.tiene_permiso('editar_padron')
  );

CREATE POLICY los_telefonos_los_saca_quien_puede
  ON public.telefonos_del_legajo
  FOR DELETE
  USING (
    prestadora_id = interno.current_tenant()
    AND interno.tiene_permiso('editar_padron')
  );

-- El permiso de tabla no es la RLS, y en este esquema una tabla nueva nace con todo dado a `anon`
-- y a `authenticated`. Se saca todo y se da lo que hace falta y nada más.
REVOKE ALL ON TABLE public.telefonos_del_legajo FROM anon;
REVOKE ALL ON TABLE public.telefonos_del_legajo FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.telefonos_del_legajo TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Que lo de arriba haya quedado como dice
-- ---------------------------------------------------------------------------

DO $comprobacion$
DECLARE
  v_faltan text := '';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
     WHERE schemaname = 'public' AND tablename = 'telefonos_del_legajo' AND rowsecurity
  ) THEN
    v_faltan := v_faltan || ' la tabla con sus reglas de acceso encendidas;';
  END IF;

  IF (
    SELECT count(*) FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'telefonos_del_legajo'
  ) <> 4 THEN
    v_faltan := v_faltan || ' las cuatro politicas;';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'telefonos_del_legajo' AND grantee = 'anon'
  ) THEN
    v_faltan := v_faltan || ' el alcance anonimo, que no debia quedar;';
  END IF;

  -- Que se puedan repetir es la decisión, no un descuido: si mañana alguien agrega un índice único
  -- sobre el número, esto lo detiene acá y no en la pantalla de quien está cargando.
  -- Se mira qué columna indexa cada índice único, no el texto de su definición: el nombre de la
  -- tabla ya contiene la palabra «telefono», así que buscarla en el texto encuentra la clave
  -- primaria y detiene la migración por algo que sí corresponde.
  IF EXISTS (
    SELECT 1
      FROM pg_index i
      JOIN pg_attribute a
        ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
     WHERE i.indrelid = 'public.telefonos_del_legajo'::regclass
       AND i.indisunique
       AND a.attname = 'telefono'
  ) THEN
    v_faltan := v_faltan || ' un control de unicidad sobre el numero, que no corresponde;';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'legajos' AND column_name = 'telefono'
  ) THEN
    v_faltan := v_faltan || ' la baja de la columna vieja del Legajo;';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.telefonos_del_legajo'::regclass
       AND conname = 'el_telefono_es_de_un_legajo_de_esta_prestadora'
  ) THEN
    v_faltan := v_faltan || ' el vinculo con el Legajo de la misma Organizacion;';
  END IF;

  IF v_faltan <> '' THEN
    RAISE EXCEPTION 'La migracion de los telefonos del Padron no quedo completa:%', v_faltan;
  END IF;
END;
$comprobacion$;

COMMIT;

NOTIFY pgrst, 'reload schema';
