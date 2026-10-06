-- Lo que guarda el sistema lleva el nombre funcional de cada modalidad, y el comercial queda para
-- el Panel. La prestación directa ya se guardaba como `directa`; la intermediación se guardaba con
-- su nombre comercial, `match`, y pasa a `intermediacion`: el valor guardado, las tablas, sus
-- índices, restricciones y políticas, la columna y las funciones que lo llevaban en el nombre.
--
-- Cambiar un nombre no mueve datos: las políticas, las claves foráneas y los permisos apuntan al
-- objeto, no a su nombre, y siguen en pie. Lo único que guarda nombres escritos es el cuerpo de
-- las funciones, y por eso las cinco que nombran algo de esto se vuelven a escribir acá abajo.

-- 1. Lo habilitado a cada Prestadora se lee con el nombre nuevo antes de tocar ningún dato: el
-- disparador de `asistentes` compara contra esta función, y con el nombre viejo rechazaría a todo
-- Asistente que pase a `intermediacion`.
CREATE OR REPLACE FUNCTION interno.modalidades_habilitadas_de_prestadora(p_prestadora_id uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    NULLIF(
      ARRAY(
        SELECT pm.modalidad
          FROM public.prestadora_modalidades pm
         WHERE pm.prestadora_id = p_prestadora_id
           AND pm.activa
           AND pm.modalidad IN ('directa', 'intermediacion')
         ORDER BY pm.modalidad
      ),
      ARRAY[]::text[]
    ),
    ARRAY['directa']::text[]
  );
$function$;

-- Y los cinco controles de valores admiten el nombre nuevo y no el viejo.
ALTER TABLE public.guardias DROP CONSTRAINT guardias_canal_modalidad_check;
ALTER TABLE public.series_guardias DROP CONSTRAINT series_guardias_canal_modalidad_check;
ALTER TABLE public.prestadora_modalidades DROP CONSTRAINT prestadora_modalidades_modalidad_check;
ALTER TABLE public.opciones_de_lista DROP CONSTRAINT opciones_de_lista_modalidades_check;
ALTER TABLE public.asistentes DROP CONSTRAINT asistentes_canales_valido;

UPDATE public.guardias SET canal_modalidad = 'intermediacion' WHERE canal_modalidad = 'match';
UPDATE public.series_guardias SET canal_modalidad = 'intermediacion' WHERE canal_modalidad = 'match';
UPDATE public.prestadora_modalidades SET modalidad = 'intermediacion' WHERE modalidad = 'match';
UPDATE public.opciones_de_lista
   SET modalidades = array_replace(modalidades, 'match', 'intermediacion')
 WHERE 'match' = ANY (modalidades);
UPDATE public.asistentes
   SET canales = array_replace(canales, 'match', 'intermediacion')
 WHERE 'match' = ANY (canales);

ALTER TABLE public.guardias ADD CONSTRAINT guardias_canal_modalidad_check
  CHECK (canal_modalidad = ANY (ARRAY['directa'::text, 'intermediacion'::text]));
ALTER TABLE public.series_guardias ADD CONSTRAINT series_guardias_canal_modalidad_check
  CHECK (canal_modalidad = ANY (ARRAY['directa'::text, 'intermediacion'::text]));
ALTER TABLE public.prestadora_modalidades ADD CONSTRAINT prestadora_modalidades_modalidad_check
  CHECK (modalidad = ANY (ARRAY['directa'::text, 'intermediacion'::text]));
ALTER TABLE public.opciones_de_lista ADD CONSTRAINT opciones_de_lista_modalidades_check
  CHECK (modalidades IS NULL
         OR (array_length(modalidades, 1) >= 1
             AND modalidades <@ ARRAY['directa'::text, 'intermediacion'::text]));
ALTER TABLE public.asistentes ADD CONSTRAINT asistentes_canales_valido
  CHECK (canales <@ ARRAY['directa'::text, 'intermediacion'::text] AND array_length(canales, 1) > 0);

ALTER TABLE public.asistentes
  ALTER COLUMN canales SET DEFAULT ARRAY['directa'::text, 'intermediacion'::text];

-- Las dos funciones de riesgo del catálogo también llevaban la modalidad en su clave. La clave
-- nueva entra primero, la configuración y los avisos pasan a ella, y la vieja sale al final, para
-- que la clave foránea de la configuración no quede nunca apuntando a nada.
INSERT INTO public.catalogo_funciones_match (clave, orden, created_at)
SELECT replace(clave, '_match', '_intermediacion'), orden, created_at
  FROM public.catalogo_funciones_match
 WHERE clave LIKE '%\_match';
UPDATE public.configuracion_funciones_match
   SET funcion_clave = replace(funcion_clave, '_match', '_intermediacion')
 WHERE funcion_clave LIKE '%\_match';
UPDATE public.advertencias_legales
   SET funcion_clave = replace(funcion_clave, '_match', '_intermediacion')
 WHERE funcion_clave LIKE '%\_match';
DELETE FROM public.catalogo_funciones_match WHERE clave LIKE '%\_match';

-- 2. Las tablas, escritas de a una: la prueba de aislamiento del backend sigue cada tabla por su
-- `RENAME TO` literal, y una tabla renombrada adentro de un ciclo dejaría de exigirle el filtro de
-- Prestadora a sus consultas.
ALTER TABLE public.accesos_match                 RENAME TO accesos_intermediacion;
ALTER TABLE public.catalogo_funciones_match      RENAME TO catalogo_funciones_intermediacion;
ALTER TABLE public.cobros_match                  RENAME TO cobros_intermediacion;
ALTER TABLE public.configuracion_cobro_match     RENAME TO configuracion_cobro_intermediacion;
ALTER TABLE public.configuracion_funciones_match RENAME TO configuracion_funciones_intermediacion;
ALTER TABLE public.contactos_vistos_match        RENAME TO contactos_vistos_intermediacion;
ALTER TABLE public.conversaciones_match          RENAME TO conversaciones_intermediacion;
ALTER TABLE public.formas_de_cobro_match         RENAME TO formas_de_cobro_intermediacion;
ALTER TABLE public.mensajes_match                RENAME TO mensajes_intermediacion;

-- Y después todo lo que cuelga de ellas con `match` en el nombre.
DO $$
DECLARE
  r record;
BEGIN
  -- Las restricciones primero: renombrar una restricción renombra también su índice.
  FOR r IN
    SELECT con.conname, con.conrelid::regclass AS tabla
      FROM pg_constraint con JOIN pg_namespace n ON n.oid = con.connamespace
     WHERE n.nspname = 'public' AND con.conname LIKE '%match%'
  LOOP
    EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO %I',
                   r.tabla, r.conname, replace(r.conname, 'match', 'intermediacion'));
  END LOOP;

  FOR r IN
    SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE '%match%'
  LOOP
    EXECUTE format('ALTER INDEX public.%I RENAME TO %I',
                   r.indexname, replace(r.indexname, 'match', 'intermediacion'));
  END LOOP;

  FOR r IN
    SELECT tablename, policyname FROM pg_policies
     WHERE schemaname = 'public' AND policyname LIKE '%match%'
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I RENAME TO %I',
                   r.policyname, r.tablename, replace(r.policyname, 'match', 'intermediacion'));
  END LOOP;
END $$;

ALTER TABLE public.datos_reservados_asistente
  RENAME COLUMN motivo_exclusion_match TO motivo_exclusion_intermediacion;

-- 3. Las funciones. Las dos que llevaban el nombre se renombran —conservan sus permisos y las
-- políticas que las llaman— y las otras cuatro que nombran algo de esto por escrito se reescriben.
ALTER FUNCTION public.consumir_contacto_match(uuid, uuid)
  RENAME TO consumir_contacto_intermediacion;
ALTER FUNCTION interno.conversacion_match_es_propia(uuid)
  RENAME TO conversacion_intermediacion_es_propia;

CREATE OR REPLACE FUNCTION interno.conversacion_intermediacion_es_propia(p_conversacion_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM conversaciones_intermediacion c
     WHERE c.id = p_conversacion_id
       -- Primero la Prestadora, que sale de la cuenta con la que se entró y de ningún otro lado.
       AND c.prestadora_id = interno.current_tenant()
       -- Y después una de las dos puntas. Quien no es ninguna de las dos no resuelve nada:
       -- comparar contra una ficha que no existe da desconocido, y desconocido no deja pasar.
       AND (
            c.cliente_id = interno.cliente_id_de_usuario(auth.uid())
         OR c.asistente_id = interno.asistente_de_la_sesion()
       )
  )
$function$;

CREATE OR REPLACE FUNCTION public.fn_modalidades_de_asistente_nuevo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  -- Solo cuando no vinieron elegidas. Si el alta las mandó, mandan las que mandó:
  -- el valor por omisión de la columna no distingue una cosa de la otra.
  IF NEW.prestadora_id IS NOT NULL
     AND (NEW.canales IS NULL
          OR NEW.canales = ARRAY['directa'::text, 'intermediacion'::text]) THEN
    NEW.canales := interno.modalidades_habilitadas_de_prestadora(NEW.prestadora_id);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sumar_contactos_al_saldo(p_acceso_id uuid, p_cuantos integer)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_saldo integer;
BEGIN
  IF p_cuantos IS NULL OR p_cuantos <= 0 THEN
    RAISE EXCEPTION 'sumar_contactos_al_saldo: se suman contactos, no cero ni menos';
  END IF;

  -- En una sola sentencia. Un saldo vacío es un acceso que todavía no se sostenía por saldo: la
  -- primera carga lo estrena, y de ahí en más se le suma lo de cada compra.
  UPDATE public.accesos_intermediacion
     SET saldo_contactos = COALESCE(saldo_contactos, 0) + p_cuantos,
         updated_at = now()
   WHERE id = p_acceso_id
  RETURNING saldo_contactos INTO v_saldo;

  -- Sin fila, queda nulo. Se devuelve así: quien llama tiene que poder distinguir «no había qué
  -- cargar» de «quedó en cero», que no son lo mismo.
  RETURN v_saldo;
END;
$function$;

CREATE OR REPLACE FUNCTION public.consumir_contacto_intermediacion(p_acceso_id uuid, p_asistente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_acceso public.accesos_intermediacion%ROWTYPE;
  v_ya_estaba boolean;
  v_saldo integer;
BEGIN
  -- Tomada la fila del acceso, el que llegue segundo espera acá. Sin esto, dos pedidos leen el
  -- mismo saldo y los dos descuentan sobre ese número: de dos contactos se cobra uno.
  SELECT * INTO v_acceso
    FROM public.accesos_intermediacion
   WHERE id = p_acceso_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'acceso_inexistente');
  END IF;

  -- Falla cerrado: un acceso vencido o dado de baja no abre nada, aunque le haya quedado saldo.
  IF v_acceso.estado <> 'vigente' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'acceso_no_vigente');
  END IF;

  -- Ya abierto antes: se contesta que sí y no se cobra de nuevo. El contacto de un Asistente se
  -- paga una sola vez por Cliente, y mirarlo otra vez no es un contacto nuevo.
  SELECT EXISTS (
    SELECT 1 FROM public.contactos_vistos_intermediacion
     WHERE cliente_id = v_acceso.cliente_id AND asistente_id = p_asistente_id
  ) INTO v_ya_estaba;

  IF v_ya_estaba THEN
    RETURN jsonb_build_object(
      'ok', true, 'ya_estaba', true, 'saldo_contactos', v_acceso.saldo_contactos
    );
  END IF;

  IF v_acceso.saldo_contactos IS NOT NULL AND v_acceso.saldo_contactos <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'saldo_agotado', 'saldo_contactos', 0);
  END IF;

  -- Se anota primero y se descuenta después, en ese orden y no al revés: así el candado de la
  -- tabla es el que decide, y no queda ninguna forma de descontar sin haber anotado. La misma
  -- Cliente con dos paquetes abriendo el mismo Asistente a la vez llega hasta acá por dos filas
  -- de acceso distintas, que el candado de más arriba no cruza; el segundo choca contra éste.
  BEGIN
    INSERT INTO public.contactos_vistos_intermediacion
      (prestadora_id, cliente_id, asistente_id, acceso_id)
    VALUES
      (v_acceso.prestadora_id, v_acceso.cliente_id, p_asistente_id, p_acceso_id);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'ok', true, 'ya_estaba', true, 'saldo_contactos', v_acceso.saldo_contactos
    );
  END;

  -- El que se sostiene por fecha no tiene qué descontar: queda anotado y el saldo sigue vacío.
  IF v_acceso.saldo_contactos IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'ya_estaba', false, 'saldo_contactos', NULL);
  END IF;

  UPDATE public.accesos_intermediacion
     SET saldo_contactos = saldo_contactos - 1,
         updated_at = now()
   WHERE id = p_acceso_id
  RETURNING saldo_contactos INTO v_saldo;

  RETURN jsonb_build_object('ok', true, 'ya_estaba', false, 'saldo_contactos', v_saldo);
END;
$function$;

NOTIFY pgrst, 'reload schema';
