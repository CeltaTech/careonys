-- El Asistente informa adonde se le paga, asi que el los carga y el los corrige.
-- =====================================================================================
--
-- QUE CAMBIA. La migracion `20261003130000_donde_cobra_el_asistente_vive_aparte.sql` dejo al
-- Asistente con politica de lectura y ninguna de escritura: cargaba y corregia la administracion
-- de la Prestadora. El Desarrollador fijo lo contrario — la transferencia va a la cuenta o a la
-- billetera **informada por cada asistente** —, y de ahi sale que el dato lo informa su dueño: el
-- lo carga y el lo corrige. Aquella migracion ya esta aplicada y no se edita; esto la corrige
-- adelante, que es la unica forma.
--
-- QUE NO CAMBIA. La administracion conserva lo que tenia: lee con el permiso
-- `ver_datos_bancarios_asistente` y sigue pudiendo escribir. Alguien tiene que poder pagarle, y
-- alguien tiene que poder corregir el dia que el Asistente no puede hacerlo solo. Es el mismo
-- reparto que ya tiene la Matricula, donde conviven `asistente_carga_su_matricula` y
-- `admin_prestadora_gestiona_matriculas_asistente`, y se sigue ese precedente sin inventar otro.
--
-- DE QUIEN ES LA FILA LO DECIDE LA SESION. `interno.es_su_propia_ficha_de_asistente()` resuelve la
-- ficha con la sesion y la Prestadora por donde esta parada, e `interno.lee_la_configuracion()`
-- exige que la Prestadora de la fila sea esa misma. Ningun identificador que venga en el pedido
-- decide nada: no hay nada que falsificar. Es la misma pareja de condiciones con la que el
-- Asistente carga su Matricula (`20261001140000_leer_y_escribir_la_configuracion.sql`).
--
-- POR QUE TAMBIEN SACA. Corregir incluye sacar: una cuenta que se cerro, un alias que ya no es
-- suyo. Dejarla puesta sin poder quitarla es plata que se manda a una cuenta que no existe, que es
-- justo lo que esta tabla viene a evitar. Y hay una razon de forma: la misma cuenta se dice de
-- varias maneras y cada una es una fila, asi que pasar de decirla por CBU a decirla por alias es
-- sacar una fila y poner otra. El borrado alcanza la fila propia y ninguna otra, igual que el
-- resto.
--
-- Y SIGUE QUEDANDO ANOTADO QUIEN LO CAMBIO. La accion
-- `cambio_de_datos_bancarios_del_asistente` ya esta en el catalogo del registro de actividad,
-- sembrada por la migracion anterior; quien la escribe es el motor, con la cuenta de la sesion
-- comprobada, porque la llave de servicio deja `auth.uid()` vacio adentro de un disparador y una
-- fila mal atribuida es peor que ninguna (`backend/src/utils/registroDeActividad.js`). Lo que se
-- anota son la fila y los nombres de las columnas tocadas. **Nunca el numero de cuenta**, ni
-- entero ni a medias: el registro de actividad no admite ningun dato que no este en
-- `catalogo_datos_del_registro`, y aca no se agrega ninguno.
--
-- LO QUE NO SE TOCA. La tabla, el catalogo de identificadores, el permiso, la accion registrada,
-- los indices, las concesiones y el disparador que impide colgar una cuenta de un Asistente de
-- otra Prestadora quedan como estan. Aca solo se agregan tres politicas.
--
-- CUANDO SE ESCRIBE `updated_at`. Lo pone el motor, que es quien escribe esta tabla desde el
-- producto. No se agrega ningun disparador para eso: seria codigo corriendo en cada escritura para
-- cubrir una via —PostgREST con el pase de una persona— que ninguna pantalla usa.
--
-- COMO SE VUELVE ATRAS.
--   DROP POLICY IF EXISTS asistente_carga_sus_datos_bancarios ON public.datos_bancarios_asistente;
--   DROP POLICY IF EXISTS asistente_corrige_sus_datos_bancarios ON public.datos_bancarios_asistente;
--   DROP POLICY IF EXISTS asistente_saca_sus_datos_bancarios ON public.datos_bancarios_asistente;
--   ALTER POLICY tambien_los_carga_la_administracion ON public.datos_bancarios_asistente
--     RENAME TO carga_los_datos_bancarios_solo_la_administracion;   -- y las otras dos igual

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. El dueño del dato lo carga
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS asistente_carga_sus_datos_bancarios ON public.datos_bancarios_asistente;
CREATE POLICY asistente_carga_sus_datos_bancarios ON public.datos_bancarios_asistente
  FOR INSERT
  TO authenticated
  WITH CHECK (
    interno.lee_la_configuracion(prestadora_id)
    AND interno.es_su_propia_ficha_de_asistente(asistente_id)
  );

-- ---------------------------------------------------------------------------
-- 2. Y lo corrige
-- ---------------------------------------------------------------------------
--
-- Las dos mitades hacen falta y dicen cosas distintas: la de arriba, que la fila que se toca es la
-- suya; la de abajo, que la fila que queda sigue siendo suya y de su Prestadora. Sin la segunda,
-- una correccion podria mudar la fila a la ficha de otro.

DROP POLICY IF EXISTS asistente_corrige_sus_datos_bancarios ON public.datos_bancarios_asistente;
CREATE POLICY asistente_corrige_sus_datos_bancarios ON public.datos_bancarios_asistente
  FOR UPDATE
  TO authenticated
  USING (interno.es_su_propia_ficha_de_asistente(asistente_id))
  WITH CHECK (
    interno.lee_la_configuracion(prestadora_id)
    AND interno.es_su_propia_ficha_de_asistente(asistente_id)
  );

-- ---------------------------------------------------------------------------
-- 3. Y saca la que ya no es suya
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS asistente_saca_sus_datos_bancarios ON public.datos_bancarios_asistente;
CREATE POLICY asistente_saca_sus_datos_bancarios ON public.datos_bancarios_asistente
  FOR DELETE
  TO authenticated
  USING (interno.es_su_propia_ficha_de_asistente(asistente_id));

-- ---------------------------------------------------------------------------
-- 4. Y las tres de la administracion dejan de decir «solo»
-- ---------------------------------------------------------------------------
--
-- Se llamaban `carga_los_datos_bancarios_solo_la_administracion` y sus hermanas, y eso ya no es
-- cierto: ahora escriben los dos. Una politica de seguridad que se llama por lo que no hace
-- engaña justamente a quien la lee para saber quien puede que. Lo que cambia es el nombre; la
-- condicion queda intacta.

DO $renombre$
DECLARE
  v_par record;
BEGIN
  FOR v_par IN
    SELECT * FROM (VALUES
      ('carga_los_datos_bancarios_solo_la_administracion', 'tambien_los_carga_la_administracion'),
      ('edita_los_datos_bancarios_solo_la_administracion', 'tambien_los_corrige_la_administracion'),
      ('borra_los_datos_bancarios_solo_la_administracion', 'tambien_los_saca_la_administracion')
    ) AS p(viejo, nuevo)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'datos_bancarios_asistente'
         AND policyname = v_par.viejo
    ) THEN
      EXECUTE format(
        'ALTER POLICY %I ON public.datos_bancarios_asistente RENAME TO %I',
        v_par.viejo, v_par.nuevo
      );
    END IF;
  END LOOP;
END;
$renombre$;

-- ---------------------------------------------------------------------------
-- Que lo de arriba haya quedado como dice
-- ---------------------------------------------------------------------------

DO $comprobacion$
DECLARE
  v_faltan text := '';
  v_cuantas integer;
BEGIN
  -- Las tres nuevas, cada una con su comando y resolviendo por la sesion.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'datos_bancarios_asistente'
       AND policyname = 'asistente_carga_sus_datos_bancarios'
       AND cmd = 'INSERT'
       AND with_check LIKE '%es_su_propia_ficha_de_asistente%'
       AND with_check LIKE '%lee_la_configuracion%'
  ) THEN
    v_faltan := v_faltan || ' la politica con la que el Asistente carga la suya;';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'datos_bancarios_asistente'
       AND policyname = 'asistente_corrige_sus_datos_bancarios'
       AND cmd = 'UPDATE'
       AND qual LIKE '%es_su_propia_ficha_de_asistente%'
       AND with_check LIKE '%es_su_propia_ficha_de_asistente%'
       AND with_check LIKE '%lee_la_configuracion%'
  ) THEN
    v_faltan := v_faltan || ' la politica con la que el Asistente corrige la suya;';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'datos_bancarios_asistente'
       AND policyname = 'asistente_saca_sus_datos_bancarios'
       AND cmd = 'DELETE'
       AND qual LIKE '%es_su_propia_ficha_de_asistente%'
  ) THEN
    v_faltan := v_faltan || ' la politica con la que el Asistente saca la suya;';
  END IF;

  -- Ninguna de las tres puede alcanzar una fila que no sea la de quien escribe: si alguna quedara
  -- mirando solamente la Prestadora, un Asistente escribiria la cuenta de su compañero.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'datos_bancarios_asistente'
       AND policyname IN ('asistente_carga_sus_datos_bancarios',
                          'asistente_corrige_sus_datos_bancarios',
                          'asistente_saca_sus_datos_bancarios')
       AND coalesce(qual, '') || coalesce(with_check, '') NOT LIKE '%es_su_propia_ficha_de_asistente%'
  ) THEN
    v_faltan := v_faltan || ' una politica del Asistente no se acota a su propia ficha;';
  END IF;

  -- Y la administracion conserva lo suyo: sigue leyendo con el permiso y escribiendo.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'datos_bancarios_asistente'
       AND policyname = 'lee_los_datos_bancarios_quien_tiene_el_permiso'
       AND qual LIKE '%ver_datos_bancarios_asistente%'
  ) THEN
    v_faltan := v_faltan || ' la lectura de la administracion con su permiso;';
  END IF;

  SELECT count(*) INTO v_cuantas
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'datos_bancarios_asistente'
     AND policyname IN ('tambien_los_carga_la_administracion',
                        'tambien_los_corrige_la_administracion',
                        'tambien_los_saca_la_administracion');
  IF v_cuantas <> 3 THEN
    v_faltan := v_faltan || ' las tres escrituras de la administracion;';
  END IF;

  -- La accion que deja anotado el cambio tiene que seguir en el catalogo: sin ella, el motor no
  -- puede escribir el renglon y el cambio quedaria sin autor.
  IF NOT EXISTS (
    SELECT 1 FROM public.catalogo_acciones_registradas
     WHERE accion = 'cambio_de_datos_bancarios_del_asistente'
  ) THEN
    v_faltan := v_faltan || ' la accion del registro de actividad;';
  END IF;

  -- Y el numero de cuenta no puede entrar en el registro de actividad por ninguna puerta: el
  -- catalogo de datos admitidos no tiene que haber ganado nada que se le parezca.
  IF EXISTS (
    SELECT 1 FROM public.catalogo_datos_del_registro
     WHERE clave IN ('identificador', 'cbu', 'cvu', 'alias', 'cuenta', 'banco', 'titular')
  ) THEN
    v_faltan := v_faltan || ' el registro de actividad quedo admitiendo un dato de la cuenta;';
  END IF;

  -- La proteccion por fila sigue encendida y `anon` sigue sin nada.
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'datos_bancarios_asistente' AND c.relrowsecurity
  ) THEN
    v_faltan := v_faltan || ' la proteccion por fila encendida;';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'datos_bancarios_asistente' AND grantee = 'anon'
  ) THEN
    v_faltan := v_faltan || ' a anon le quedo permiso sobre la tabla;';
  END IF;

  -- El disparador que impide colgar una cuenta de un Asistente de otra Prestadora sigue puesto, y
  -- sigue sin ser SECURITY DEFINER. Ahora pesa mas que antes: hasta hoy escribia solamente la
  -- administracion de la Prestadora.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'los_datos_bancarios_son_del_mismo_asistente'
       AND tgrelid = 'public.datos_bancarios_asistente'::regclass
  ) THEN
    v_faltan := v_faltan || ' el disparador que ata la cuenta a la Prestadora del Asistente;';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'interno' AND p.proname = 'los_datos_bancarios_son_del_mismo_asistente'
       AND p.prosecdef
  ) THEN
    v_faltan := v_faltan || ' la funcion del disparador quedo SECURITY DEFINER, y no puede serlo;';
  END IF;

  IF v_faltan <> '' THEN
    RAISE EXCEPTION 'El Asistente no quedo informando sus datos bancarios:%', v_faltan;
  END IF;

  RAISE NOTICE 'El Asistente carga, corrige y saca sus propios datos bancarios, y ninguno mas.';
END;
$comprobacion$;

COMMIT;

NOTIFY pgrst, 'reload schema';
