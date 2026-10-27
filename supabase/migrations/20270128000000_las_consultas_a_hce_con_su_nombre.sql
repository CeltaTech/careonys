-- Las piezas de las consultas a la HCE y de la restricción de HCE que todavía conservaban los
-- nombres de antes —«registro de accesos», «acceso a datos de salud», «interruptor de salud»—
-- pasan a llamarse como la tabla y la columna que tocan: `consultas_a_hce` y `restriccion_de_hce`.
--
-- Cambiarle el nombre a una función no toca a sus disparadores ni a sus permisos: los dos la
-- guardan por su identificador interno, no por su nombre.
--
-- Y el rechazo de `verificar_cadena_de_consultas`, que es la única de estas que se llama desde
-- afuera, deja de traer una frase escrita acá: trae el motivo, como los demás rechazos de la base,
-- y la frase que ve la persona sale del catálogo, por el código de permiso denegado.

ALTER FUNCTION interno.el_registro_de_accesos_no_se_toca()
  RENAME TO las_consultas_a_hce_no_se_tocan;
ALTER FUNCTION interno.encadenar_acceso_a_datos_de_salud()
  RENAME TO encadenar_consulta_a_hce;
ALTER FUNCTION interno.el_interruptor_de_salud_se_apaga_donde_se_puede()
  RENAME TO la_restriccion_de_hce_se_apaga_donde_se_puede;
ALTER FUNCTION interno.anotar_cambio_del_interruptor_de_salud()
  RENAME TO anotar_cambio_de_la_restriccion_de_hce;

ALTER TRIGGER trg_el_registro_de_accesos_no_se_toca ON public.consultas_a_hce
  RENAME TO trg_las_consultas_a_hce_no_se_tocan;
ALTER TRIGGER trg_el_registro_de_accesos_no_se_vacia ON public.consultas_a_hce
  RENAME TO trg_las_consultas_a_hce_no_se_vacian;
ALTER TRIGGER trg_encadenar_acceso_a_datos_de_salud ON public.consultas_a_hce
  RENAME TO trg_encadenar_consulta_a_hce;
ALTER TRIGGER trg_el_interruptor_de_salud_se_apaga_donde_se_puede ON public.configuracion_de_hce
  RENAME TO trg_la_restriccion_de_hce_se_apaga_donde_se_puede;
ALTER TRIGGER trg_anotar_cambio_del_interruptor_de_salud ON public.configuracion_de_hce
  RENAME TO trg_anotar_cambio_de_la_restriccion_de_hce;

CREATE OR REPLACE FUNCTION interno.las_consultas_a_hce_no_se_tocan()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  RAISE EXCEPTION 'Las consultas a la HCE no se editan y no se borran'
    USING ERRCODE = '42501';
END;
$function$;

CREATE OR REPLACE FUNCTION interno.encadenar_consulta_a_hce()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_rol      text := COALESCE(auth.jwt() ->> 'role', session_user::text);
  v_prest    uuid;
  v_usuario  uuid;
  v_ultimo   record;
BEGIN
  IF v_rol = 'authenticated' THEN
    v_prest := interno.prestadora_actual();
    v_usuario := auth.uid();
    IF v_prest IS NULL OR v_usuario IS NULL THEN
      RAISE EXCEPTION 'Sin persona ni Prestadora resueltas no se anota una consulta' USING ERRCODE = '42501';
    END IF;
    IF NEW.prestadora_id IS DISTINCT FROM v_prest AND NEW.prestadora_id IS NOT NULL
       OR NEW.usuario_id IS DISTINCT FROM v_usuario AND NEW.usuario_id IS NOT NULL THEN
      RAISE EXCEPTION 'Una consulta se anota a nombre de quien entró y en su Prestadora' USING ERRCODE = '42501';
    END IF;
    NEW.prestadora_id := v_prest;
    NEW.usuario_id := v_usuario;

  ELSIF v_rol = 'trabajo_sin_persona' THEN
    v_prest := interno.prestadora_actual();
    IF v_prest IS NULL THEN
      RAISE EXCEPTION 'Sin Prestadora resuelta no se anota una consulta' USING ERRCODE = '42501';
    END IF;
    IF NEW.prestadora_id IS DISTINCT FROM v_prest AND NEW.prestadora_id IS NOT NULL
       OR NEW.usuario_id IS NOT NULL THEN
      RAISE EXCEPTION 'El trabajo sin persona anota sin persona y en su Prestadora' USING ERRCODE = '42501';
    END IF;
    NEW.prestadora_id := v_prest;

  ELSE
    -- La llave maestra y las migraciones: la base no tiene de dónde sacar a quién, así que tiene
    -- que venir dicho.
    IF NEW.prestadora_id IS NULL OR NEW.usuario_id IS NULL THEN
      RAISE EXCEPTION 'Una consulta anotada con la llave maestra tiene que decir la Prestadora y la persona'
        USING ERRCODE = '23502';
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pacientes p
                  WHERE p.id = NEW.paciente_id AND p.prestadora_id = NEW.prestadora_id) THEN
    RAISE EXCEPTION 'El paciente no es de esa Prestadora' USING ERRCODE = '23503';
  END IF;

  IF NEW.categorias IS NULL OR cardinality(NEW.categorias) = 0
     OR array_position(NEW.categorias, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Una consulta dice qué categorías de dato alcanzó' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(NEW.categorias) c
              WHERE to_regclass(format('public.%I', c)) IS NULL) THEN
    RAISE EXCEPTION 'Una categoría de dato es el nombre de una tabla que existe' USING ERRCODE = '23514';
  END IF;
  -- Ordenadas y sin repetir: la misma consulta se anota siempre igual.
  NEW.categorias := ARRAY(SELECT DISTINCT c FROM unnest(NEW.categorias) c ORDER BY c);

  -- Lo que sigue lo pone la base, traiga lo que traiga el pedido.
  NEW.id := gen_random_uuid();
  NEW.credencial_rol := v_rol;
  NEW.momento := clock_timestamp();

  -- Una cadena por Prestadora, de a un renglón por vez: dos lecturas simultáneas no pueden
  -- colgarse las dos del mismo renglón anterior. Si igual pasara, la unicidad del número lo frena.
  PERFORM pg_advisory_xact_lock(hashtextextended('consultas_a_hce:' || NEW.prestadora_id::text, 0));

  SELECT a.numero, a.resumen INTO v_ultimo
    FROM consultas_a_hce a
   WHERE a.prestadora_id = NEW.prestadora_id
   ORDER BY a.numero DESC
   LIMIT 1;

  NEW.numero := COALESCE(v_ultimo.numero, 0) + 1;
  NEW.resumen_anterior := v_ultimo.resumen;
  NEW.resumen := interno.resumen_de_la_consulta(NEW);

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION interno.la_restriccion_de_hce_se_apaga_donde_se_puede()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.prestadora_id IS DISTINCT FROM OLD.prestadora_id THEN
    RAISE EXCEPTION 'La restricción de HCE no cambia de Prestadora';
  END IF;

  IF NOT NEW.restriccion_de_hce THEN
    IF interno.el_pais_exige_la_restriccion_de_hce(NEW.prestadora_id) THEN
      RAISE EXCEPTION 'En el país de esta Prestadora la ley no permite apagarla'
        USING ERRCODE = 'check_violation';
    END IF;
    IF interno.usuario_de_la_sesion() IS NULL THEN
      RAISE EXCEPTION 'Apagarla exige una persona con sesión, para que quede registrado quién lo hizo'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verificar_cadena_de_consultas()
 RETURNS TABLE(intacta boolean, renglones bigint, rota_en_numero bigint, rota_en_id uuid, motivo text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prest uuid := interno.prestadora_actual();
BEGIN
  IF v_prest IS NULL
     OR NOT (interno.es_superadmin()
             OR interno.es_admin_prestadora()
             OR COALESCE(auth.jwt() ->> 'role', '') = 'trabajo_sin_persona') THEN
    RAISE EXCEPTION 'sin_permiso_para_verificar_las_consultas_a_hce' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM interno.verificar_cadena_de_consultas(v_prest);
END;
$function$;

NOTIFY pgrst, 'reload schema';
