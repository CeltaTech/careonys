-- El registro de accesos a la información de salud se conserva el plazo que fija cada país, y al
-- vencer se borra de a un año calendario entero.
--
-- El plazo es un dato de reglas_de_conservacion (clase 'consultas_a_hce'), no un número del código:
-- cambiarlo para un país es cambiar un renglón. Un país sin renglón no borra nada.
--
-- Borrar el principio de una cadena encadenada la dejaría «rota» para siempre. Por eso cada borrado
-- deja antes un corte: hasta qué número se borró y con qué resumen cerraba. La comprobación arranca
-- desde el último corte, y la consulta siguiente se cuelga de él si ya no queda ningún renglón.
-- El disparador que impide borrar sólo deja pasar lo que un corte ya cubre.

-- ---------------------------------------------------------------------------------------------
-- El plazo de Argentina, el único país con Prestadoras.
-- ---------------------------------------------------------------------------------------------
INSERT INTO public.reglas_de_conservacion
  (jurisdiccion, clase_de_registro, tramo, hecho_de_inicio, plazo_meses, al_vencer, fuente, vigencia_desde)
VALUES
  ('AR', 'consultas_a_hce', 1, 'cada_registro', 36, 'borrar',
   'Piso de tres años del registro de accesos (EHDS, art. 9), por debajo de los diez años de la historia clínica (Ley 26.529, art. 18)',
   DATE '2026-01-01');

-- Lo que el borrado deja dicho en el registro de actividad: el año, cuántos renglones y hasta
-- qué número. Ningún dato del contenido.
INSERT INTO public.catalogo_datos_del_registro (clave, orden) VALUES
  ('anio', 14), ('renglones', 15), ('hasta_numero', 16);

-- El borrado no lo hace ninguna persona: lo hace el sistema cuando vence el plazo. El catálogo de
-- acciones dice cuáles son así, y sólo ésas pueden anotarse sin persona. Las demás siguen
-- exigiéndola, como hasta ahora.
ALTER TABLE public.catalogo_acciones_registradas
  ADD COLUMN la_hace_el_sistema boolean NOT NULL DEFAULT false;

INSERT INTO public.catalogo_acciones_registradas (accion, grupo, orden, la_hace_el_sistema)
VALUES ('borrado_por_vencimiento', 'borrado_de_datos', 21, true);

ALTER TABLE public.registro_actividad ALTER COLUMN usuario_id DROP NOT NULL;
COMMENT ON COLUMN public.registro_actividad.usuario_id IS
  'Quien hizo la accion. Lo pone el motor con la cuenta de la sesion comprobada, nunca con un valor que venga en el pedido. Vacio solo en las acciones que el catalogo marca como hechas por el sistema.';

CREATE OR REPLACE FUNCTION interno.el_registro_de_actividad_solo_lleva_lo_permitido()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, interno
AS $$
DECLARE
  v_clave text;
BEGIN
  IF NEW.usuario_id IS NULL AND NOT EXISTS (
       SELECT 1 FROM public.catalogo_acciones_registradas
        WHERE accion = NEW.accion AND la_hace_el_sistema) THEN
    RAISE EXCEPTION 'Esa accion la hace una persona y tiene que decir quien' USING ERRCODE = '23502';
  END IF;

  IF NEW.detalle IS NULL THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW.detalle) <> 'object' THEN
    RAISE EXCEPTION 'El detalle del registro de actividad tiene que ser un objeto';
  END IF;

  FOR v_clave IN SELECT jsonb_object_keys(NEW.detalle) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.catalogo_datos_del_registro WHERE clave = v_clave
    ) THEN
      RAISE EXCEPTION 'El registro de actividad no admite el dato %', v_clave;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------------------------
-- Los cortes.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE public.cortes_de_consultas_a_hce (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id   uuid        NOT NULL REFERENCES public.prestadoras(id),
  anio            integer     NOT NULL,
  hasta_numero    bigint      NOT NULL CHECK (hasta_numero >= 1),
  ultimo_resumen  bytea       NOT NULL,
  renglones       bigint      NOT NULL CHECK (renglones >= 0),
  momento         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cortes_de_consultas_a_hce_un_corte_por_numero UNIQUE (prestadora_id, hasta_numero),
  CONSTRAINT cortes_de_consultas_a_hce_un_corte_por_anio UNIQUE (prestadora_id, anio)
);

ALTER TABLE public.cortes_de_consultas_a_hce ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cortes_de_consultas_a_hce FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.cortes_de_consultas_a_hce TO trabajo_sin_persona;

CREATE POLICY el_trabajo_sin_persona_lee_los_cortes_de_su_prestadora
  ON public.cortes_de_consultas_a_hce FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

CREATE FUNCTION interno.los_cortes_de_consultas_a_hce_no_se_tocan()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, interno
AS $$
BEGIN
  RAISE EXCEPTION 'Los cortes del registro de accesos no se editan y no se borran'
    USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION interno.los_cortes_de_consultas_a_hce_no_se_tocan() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_los_cortes_de_consultas_a_hce_no_se_tocan
  BEFORE UPDATE OR DELETE ON public.cortes_de_consultas_a_hce
  FOR EACH ROW EXECUTE FUNCTION interno.los_cortes_de_consultas_a_hce_no_se_tocan();
CREATE TRIGGER trg_los_cortes_de_consultas_a_hce_no_se_vacian
  BEFORE TRUNCATE ON public.cortes_de_consultas_a_hce
  FOR EACH STATEMENT EXECUTE FUNCTION interno.los_cortes_de_consultas_a_hce_no_se_tocan();

-- ---------------------------------------------------------------------------------------------
-- Sólo se borra lo que un corte ya cubre. Editar y vaciar, nunca.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION interno.las_consultas_a_hce_no_se_tocan()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, interno
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND EXISTS (
       SELECT 1 FROM cortes_de_consultas_a_hce c
        WHERE c.prestadora_id = OLD.prestadora_id
          AND c.hasta_numero >= OLD.numero) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Las consultas a la HCE no se editan y no se borran'
    USING ERRCODE = '42501';
END;
$$;

-- ---------------------------------------------------------------------------------------------
-- La consulta nueva se cuelga del último renglón, y si no queda ninguno, del último corte.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION interno.encadenar_consulta_a_hce()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, interno
AS $$
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
    -- Las migraciones: la base no tiene de dónde sacar a quién, así que tiene que venir dicho.
    IF NEW.prestadora_id IS NULL OR NEW.usuario_id IS NULL THEN
      RAISE EXCEPTION 'Una consulta anotada sin sesión tiene que decir la Prestadora y la persona'
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

  IF v_ultimo.numero IS NULL THEN
    SELECT c.hasta_numero AS numero, c.ultimo_resumen AS resumen INTO v_ultimo
      FROM cortes_de_consultas_a_hce c
     WHERE c.prestadora_id = NEW.prestadora_id
     ORDER BY c.hasta_numero DESC
     LIMIT 1;
  END IF;

  NEW.numero := COALESCE(v_ultimo.numero, 0) + 1;
  NEW.resumen_anterior := v_ultimo.resumen;
  NEW.resumen := interno.resumen_de_la_consulta(NEW);

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------------------------
-- La comprobación arranca desde el último corte.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION interno.verificar_cadena_de_consultas(p_prestadora uuid)
RETURNS TABLE(intacta boolean, renglones bigint, rota_en_numero bigint, rota_en_id uuid, motivo text)
LANGUAGE plpgsql
STABLE
SET search_path = public, interno
AS $$
DECLARE
  r           consultas_a_hce;
  v_corte     record;
  v_esperado  bigint;
  v_anterior  bytea;
  v_cuantos   bigint := 0;
BEGIN
  SELECT c.hasta_numero, c.ultimo_resumen INTO v_corte
    FROM cortes_de_consultas_a_hce c
   WHERE c.prestadora_id = p_prestadora
   ORDER BY c.hasta_numero DESC
   LIMIT 1;
  v_esperado := COALESCE(v_corte.hasta_numero, 0) + 1;
  v_anterior := v_corte.ultimo_resumen;

  FOR r IN
    SELECT * FROM consultas_a_hce a
     WHERE a.prestadora_id = p_prestadora
     ORDER BY a.numero
  LOOP
    IF r.numero <> v_esperado THEN
      RETURN QUERY SELECT false, v_cuantos, r.numero, r.id, 'falta_un_renglon'::text;
      RETURN;
    END IF;
    IF r.resumen_anterior IS DISTINCT FROM v_anterior THEN
      RETURN QUERY SELECT false, v_cuantos, r.numero, r.id, 'no_sigue_al_anterior'::text;
      RETURN;
    END IF;
    IF r.resumen IS DISTINCT FROM interno.resumen_de_la_consulta(r) THEN
      RETURN QUERY SELECT false, v_cuantos, r.numero, r.id, 'el_renglon_fue_alterado'::text;
      RETURN;
    END IF;
    v_anterior := r.resumen;
    v_esperado := v_esperado + 1;
    v_cuantos := v_cuantos + 1;
  END LOOP;

  RETURN QUERY SELECT true, v_cuantos, NULL::bigint, NULL::uuid, NULL::text;
END;
$$;

-- ---------------------------------------------------------------------------------------------
-- Qué año es el próximo en borrarse y cuándo. Los años se cuentan en UTC: un renglón que cae cerca
-- de la medianoche del 31 de diciembre se guarda, a lo sumo, unas horas de más, nunca de menos.
-- Sin plazo vigente para el país, o sin renglones, no devuelve nada.
-- ---------------------------------------------------------------------------------------------
CREATE FUNCTION interno.consultas_a_hce_por_vencer(p_prestadora uuid)
RETURNS TABLE(anio integer, desde timestamptz, hasta timestamptz, se_borra_el date)
LANGUAGE sql
STABLE
SET search_path = public, interno
AS $$
  WITH regla AS (
    SELECT r.plazo_meses
      FROM reglas_de_conservacion r
      JOIN prestadoras p ON p.id = p_prestadora AND p.pais = r.jurisdiccion
     WHERE r.clase_de_registro = 'consultas_a_hce'
       AND r.al_vencer = 'borrar'
       AND r.tramo = 1
       AND r.vigencia_desde <= current_date
       AND (r.vigencia_hasta IS NULL OR r.vigencia_hasta >= current_date)
     ORDER BY r.vigencia_desde DESC
     LIMIT 1
  ), primero AS (
    SELECT extract(year FROM min(a.momento) AT TIME ZONE 'UTC')::integer AS anio
      FROM consultas_a_hce a
     WHERE a.prestadora_id = p_prestadora
  )
  SELECT pr.anio,
         make_timestamptz(pr.anio, 1, 1, 0, 0, 0, 'UTC'),
         make_timestamptz(pr.anio + 1, 1, 1, 0, 0, 0, 'UTC'),
         (make_date(pr.anio + 1, 1, 1) + make_interval(months => rg.plazo_meses))::date
    FROM primero pr, regla rg
   WHERE pr.anio IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION interno.consultas_a_hce_por_vencer(uuid) FROM PUBLIC, anon, authenticated;

-- La pregunta, para la administración de la Prestadora y para el trabajo sin persona. No recibe a
-- nadie: la Prestadora sale de la sesión. Devuelve fechas, ningún dato del registro.
CREATE FUNCTION public.consultas_a_hce_por_vencer()
RETURNS TABLE(anio integer, desde timestamptz, hasta timestamptz, se_borra_el date)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, interno
AS $$
DECLARE
  v_prest uuid := interno.prestadora_actual();
BEGIN
  IF v_prest IS NULL
     OR NOT (interno.es_superadmin()
             OR interno.es_admin_prestadora()
             OR COALESCE(auth.jwt() ->> 'role', '') = 'trabajo_sin_persona') THEN
    RAISE EXCEPTION 'sin_permiso_para_ver_el_vencimiento_de_las_consultas_a_hce' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM interno.consultas_a_hce_por_vencer(v_prest);
END;
$$;
REVOKE ALL ON FUNCTION public.consultas_a_hce_por_vencer() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.consultas_a_hce_por_vencer() TO authenticated, trabajo_sin_persona;

-- El borrado, sólo para el trabajo sin persona y sólo en su Prestadora. Borra cada año vencido,
-- deja el corte antes de borrar y lo anota en el registro de actividad.
CREATE FUNCTION public.borrar_consultas_a_hce_vencidas()
RETURNS TABLE(anio integer, renglones bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, interno
AS $$
DECLARE
  v_prest    uuid := interno.prestadora_actual();
  v          record;
  v_hasta    record;
  v_cuantos  bigint;
  v_corte    uuid;
BEGIN
  IF v_prest IS NULL OR COALESCE(auth.jwt() ->> 'role', '') <> 'trabajo_sin_persona' THEN
    RAISE EXCEPTION 'sin_permiso_para_borrar_las_consultas_a_hce' USING ERRCODE = '42501';
  END IF;

  -- El mismo candado que la anotación: mientras se borra, nadie se cuelga de un renglón que se va.
  PERFORM pg_advisory_xact_lock(hashtextextended('consultas_a_hce:' || v_prest::text, 0));

  LOOP
    SELECT * INTO v FROM interno.consultas_a_hce_por_vencer(v_prest);
    EXIT WHEN v.anio IS NULL OR v.se_borra_el > current_date;

    SELECT a.numero, a.resumen INTO v_hasta
      FROM consultas_a_hce a
     WHERE a.prestadora_id = v_prest AND a.momento < v.hasta
     ORDER BY a.numero DESC
     LIMIT 1;

    SELECT count(*) INTO v_cuantos
      FROM consultas_a_hce a
     WHERE a.prestadora_id = v_prest AND a.numero <= v_hasta.numero;

    INSERT INTO cortes_de_consultas_a_hce (prestadora_id, anio, hasta_numero, ultimo_resumen, renglones)
    VALUES (v_prest, v.anio, v_hasta.numero, v_hasta.resumen, v_cuantos)
    RETURNING id INTO v_corte;

    DELETE FROM consultas_a_hce a
     WHERE a.prestadora_id = v_prest AND a.numero <= v_hasta.numero;

    INSERT INTO registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, detalle)
    VALUES (v_prest, NULL, 'borrado_por_vencimiento', 'consultas_a_hce', v_corte,
            jsonb_build_object('anio', v.anio, 'renglones', v_cuantos, 'hasta_numero', v_hasta.numero));

    anio := v.anio;
    renglones := v_cuantos;
    RETURN NEXT;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.borrar_consultas_a_hce_vencidas() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.borrar_consultas_a_hce_vencidas() TO trabajo_sin_persona;

NOTIFY pgrst, 'reload schema';
