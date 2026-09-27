-- ============================================================================================
-- El permiso de acceso
--
-- QUE ES. Un permiso temporal con el que alguien de CeltaTech entra a los datos de una Prestadora
-- para resolver un problema: una Prestadora por vez, corte a los 5 minutos sin actividad, tope de
-- 60 minutos, y todo lo que se hace adentro queda auditado.
--
-- QUE CAMBIA. El nombre, y nada mas. Se llamaba «sesion de soporte tecnico», que nombra a quien
-- lo usa y no a lo que es. Las dos tablas pasan a llamarse por lo que guardan: el permiso, y lo
-- que se hizo con el.
--
-- POR QUE SE RENOMBRA algo que se guarda para siempre. Porque el nombre nunca describio la cosa,
-- no porque haya cambiado ninguna marca. De aca en mas estos dos nombres no se vuelven a tocar.
--
-- QUIEN ABRE EL PERMISO. CeltaTech, desde su lado. La cerradura tiene que estar aca —la que
-- decide que filas ve una consulta es esta base— y la llave es de CeltaTech: quien tiene derecho
-- a entrar, con que cuenta y quien esta habilitado hoy no se anota adentro del producto. Por eso
-- el Panel deja de tener rutas para abrir, renovar y cerrar el permiso: lo unico que queda de
-- este lado es hacerlo cumplir.
--
-- EL CUERPO DE LAS FUNCIONES SE REESCRIBE SOLO. Una politica guarda el identificador interno de
-- la tabla y sigue el renombre sin enterarse; el cuerpo de una funcion guarda texto y se vuelve a
-- resolver cada vez que corre. Asi que se recorren las funciones que nombran alguno de los cuatro
-- nombres viejos y se las vuelve a crear con su propia definicion corregida, en vez de escribirla
-- de nuevo aca: lo que queda publicado es exactamente lo que la base tiene hoy, con el nombre
-- cambiado, y no lo que este archivo suponga que tiene.
-- ============================================================================================

-- --------------------------------------------------------------------------------------------
-- 1. Las dos tablas
-- --------------------------------------------------------------------------------------------

ALTER TABLE public.sesiones_soporte_tecnico RENAME TO permisos_de_acceso;
ALTER TABLE public.auditoria_soporte_tecnico RENAME TO auditoria_de_accesos;

COMMENT ON TABLE public.permisos_de_acceso IS
  'Cada fila es un permiso con el que alguien de CeltaTech entro a los datos de una Prestadora: '
  'cual, cuando entro, hasta cuando vale, cuando se lo vio por ultima vez y cuando salio. Uno por '
  'vez y nunca dos Prestadoras a la vez. Lo abre CeltaTech desde su lado.';

COMMENT ON TABLE public.auditoria_de_accesos IS
  'Todo lo que se hizo con un permiso de acceso: la entrada, la renovacion, la salida —con su '
  'motivo— y cada escritura hecha adentro de la Prestadora visitada. Nunca claves ni contenido.';

-- --------------------------------------------------------------------------------------------
-- 2. Las dos funciones que llevaban el nombre viejo
--
-- Se buscan en vez de nombrarles el esquema porque una de las dos se mudo a `interno` el dia que
-- las funciones de politica salieron del esquema publicado, y la migracion no tiene por que saber
-- en cual quedo cada una.
-- --------------------------------------------------------------------------------------------

DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure::text AS firma, p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname IN ('public', 'interno')
       AND p.proname IN ('es_sesion_soporte_activa', 'fn_auditoria_soporte_mutacion')
  LOOP
    EXECUTE format('ALTER FUNCTION %s RENAME TO %I;', f.firma,
      CASE f.proname
        WHEN 'es_sesion_soporte_activa' THEN 'hay_permiso_de_acceso_vigente'
        ELSE 'fn_auditoria_de_acceso_mutacion'
      END);
  END LOOP;
END $$;

-- --------------------------------------------------------------------------------------------
-- 3. Los cuerpos que nombraban a cualquiera de los cuatro
--
-- Las firmas se materializan antes de tocar nada: el recorrido no puede ir leyendo pg_proc
-- mientras se lo modifica.
-- --------------------------------------------------------------------------------------------

DO $$
DECLARE
  viejos text[] := ARRAY[
    'sesiones_soporte_tecnico', 'auditoria_soporte_tecnico',
    'es_sesion_soporte_activa', 'fn_auditoria_soporte_mutacion'];
  nuevos text[] := ARRAY[
    'permisos_de_acceso', 'auditoria_de_accesos',
    'hay_permiso_de_acceso_vigente', 'fn_auditoria_de_acceso_mutacion'];
  oids oid[];
  o oid;
  def text;
  i int;
BEGIN
  SELECT array_agg(p.oid)
    INTO oids
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname IN ('public', 'interno')
     AND EXISTS (SELECT 1 FROM unnest(viejos) v WHERE p.prosrc LIKE '%' || v || '%');

  IF oids IS NULL THEN
    RAISE EXCEPTION
      'Ninguna funcion nombra las tablas que se acaban de renombrar. `interno.current_tenant()` '
      'tiene que estar entre ellas, asi que la base no es la que esta migracion leyo.';
  END IF;

  FOREACH o IN ARRAY oids LOOP
    def := pg_get_functiondef(o);
    FOR i IN 1 .. array_length(viejos, 1) LOOP
      def := replace(def, viejos[i], nuevos[i]);
    END LOOP;
    EXECUTE def;
    RAISE NOTICE 'Reescrita %', o::regprocedure::text;
  END LOOP;
END $$;

-- --------------------------------------------------------------------------------------------
-- 4. Lo que quedo nombrado por el nombre viejo: claves, indices, politicas y disparadores
--
-- Ninguno de estos nombres hace falta para que la base funcione, y por eso mismo son los que
-- sobreviven a un renombre y hacen que el nombre viejo siga apareciendo dentro de un año.
-- --------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.nombre_nuevo(viejo text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT replace(replace(replace(replace(replace(replace(viejo,
    'sesiones_soporte_tecnico', 'permisos_de_acceso'),
    'auditoria_soporte_tecnico', 'auditoria_de_accesos'),
    'sesion_de_soporte', 'permiso_de_acceso'),
    'sesion_activa', 'permiso_vigente'),
    'soporte_tecnico', 'acceso'),
    'soporte', 'acceso')
$$;

DO $$
DECLARE
  r record;
  nuevo text;
BEGIN
  -- Las restricciones de las dos tablas.
  FOR r IN
    SELECT c.conname, c.conrelid::regclass::text AS tabla
      FROM pg_constraint c
     WHERE c.conrelid IN ('public.permisos_de_acceso'::regclass, 'public.auditoria_de_accesos'::regclass)
  LOOP
    nuevo := pg_temp.nombre_nuevo(r.conname);
    IF nuevo <> r.conname THEN
      EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO %I;', r.tabla, r.conname, nuevo);
    END IF;
  END LOOP;

  -- Los indices que no cuelgan de una restriccion, que ya se renombro sola.
  FOR r IN
    SELECT i.indexrelid::regclass::text AS indice, ci.relname
      FROM pg_index i
      JOIN pg_class ci ON ci.oid = i.indexrelid
     WHERE i.indrelid IN ('public.permisos_de_acceso'::regclass, 'public.auditoria_de_accesos'::regclass)
       AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)
  LOOP
    nuevo := pg_temp.nombre_nuevo(r.relname);
    IF nuevo <> r.relname THEN
      EXECUTE format('ALTER INDEX %s RENAME TO %I;', r.indice, nuevo);
    END IF;
  END LOOP;

  -- Las politicas de las dos tablas.
  FOR r IN
    SELECT pol.polname, pol.polrelid::regclass::text AS tabla
      FROM pg_policy pol
     WHERE pol.polrelid IN ('public.permisos_de_acceso'::regclass, 'public.auditoria_de_accesos'::regclass)
  LOOP
    nuevo := pg_temp.nombre_nuevo(r.polname);
    IF nuevo <> r.polname THEN
      EXECUTE format('ALTER POLICY %I ON %s RENAME TO %I;', r.polname, r.tabla, nuevo);
    END IF;
  END LOOP;

  -- El disparador que anota cada escritura hecha con un permiso abierto, en todas las tablas que
  -- lo tienen puesto.
  FOR r IN
    SELECT t.tgname, t.tgrelid::regclass::text AS tabla
      FROM pg_trigger t
     WHERE NOT t.tgisinternal
       AND t.tgname LIKE '%soporte%'
  LOOP
    nuevo := pg_temp.nombre_nuevo(r.tgname);
    IF nuevo <> r.tgname THEN
      EXECUTE format('ALTER TRIGGER %I ON %s RENAME TO %I;', r.tgname, r.tabla, nuevo);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
