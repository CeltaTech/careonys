-- Una sola toma por alarma, y la resuelve sólo quien la tomó.
--
-- Decidido por el Desarrollador para quien coordina:
--   - Cada Coordinador ve su zona.
--   - Una alarma que llega al escalón de todos los Coordinadores la puede ver cualquiera de ellos,
--     y la puede resolver cualquiera, pero primero tiene que hacerse cargo.
--   - La base admite una sola toma por alarma. Los demás ven quién la tiene y no la resuelven.
--   - Las emergencias entran en la misma escalera.
--
-- Hasta acá la toma era un aviso: dos personas podían tomar la misma alarma al mismo tiempo, el
-- vencimiento lo escribía el navegador, y cualquiera podía resolver una alarma tomada por otro.
-- Acá lo hace cumplir la base.

-- 1. Las emergencias pasan a ser un tipo de alarma más.
ALTER TABLE public.alarmas_tomadas DROP CONSTRAINT alarmas_tomadas_tipo_conocido;
ALTER TABLE public.alarmas_tomadas ADD CONSTRAINT alarmas_tomadas_tipo_conocido
  CHECK (tipo = ANY (ARRAY['alerta_temprana_guardia', 'incidente_relevo', 'guardia_sin_cerrar',
                           'incidente_turno_sin_cubrir', 'emergencia_guardia']));

ALTER TABLE public.escalones_de_alarma_avisados DROP CONSTRAINT escalones_de_alarma_avisados_tipo_conocido;
ALTER TABLE public.escalones_de_alarma_avisados ADD CONSTRAINT escalones_de_alarma_avisados_tipo_conocido
  CHECK (tipo = ANY (ARRAY['alerta_temprana_guardia', 'incidente_relevo', 'guardia_sin_cerrar',
                           'incidente_turno_sin_cubrir', 'emergencia_guardia']));

-- 2. Las piezas.

CREATE OR REPLACE FUNCTION interno.es_coordinador()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, interno AS $$
  SELECT EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'coordinador');
$$;

-- La zona de un Coordinador cualquiera, no sólo del que inició sesión. La hace falta la ruta de
-- emergencias, que todavía escribe con la llave maestra y anota a la persona en `atendida_por`.
CREATE OR REPLACE FUNCTION interno.coordinador_alcanza_asistente_de(p_usuario uuid, p_asistente_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, interno AS $$
  SELECT EXISTS (
    SELECT 1
    FROM usuarios u
    JOIN usuario_lugares ul ON ul.usuario_id = u.id
    JOIN asistente_lugares al ON al.lugar_id = ul.lugar_id
    WHERE u.id = p_usuario
      AND u.rol = 'coordinador'
      AND al.asistente_id = p_asistente_id
  );
$$;

-- La de siempre pasa a ser el caso particular de la de arriba: una sola regla de zona.
CREATE OR REPLACE FUNCTION interno.coordinador_alcanza_asistente(p_asistente_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, interno AS $$
  SELECT interno.coordinador_alcanza_asistente_de(auth.uid(), p_asistente_id);
$$;

-- Cuánto dura hacerse cargo. Mismo valor de fábrica y mismos topes que `REGLA_DE_LA_TOMA` en
-- backend/src/utils/alarmasTomadas.js.
CREATE OR REPLACE FUNCTION interno.minutos_que_dura_la_toma(p_prestadora uuid)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, interno AS $$
DECLARE
  v_texto text;
  v_minutos integer;
BEGIN
  SELECT c.regla ->> 'minutos_que_dura_hacerse_cargo' INTO v_texto
    FROM configuracion_alarmas_tomadas c WHERE c.prestadora_id = p_prestadora;
  IF v_texto IS NULL OR v_texto !~ '^\d{1,4}$' THEN
    RETURN 60;
  END IF;
  v_minutos := v_texto::integer;
  IF v_minutos < 5 OR v_minutos > 1440 THEN
    RETURN 60;
  END IF;
  RETURN v_minutos;
END;
$$;

-- Quién tiene la alarma ahora. La Prestadora va escrita porque la llave maestra y el trabajo sin
-- persona no siempre la resuelven solos.
CREATE OR REPLACE FUNCTION interno.quien_tiene_la_alarma(p_prestadora uuid, p_tipo text, p_referencia uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, interno AS $$
  SELECT a.tomada_por
    FROM alarmas_tomadas a
   WHERE a.prestadora_id = p_prestadora
     AND a.tipo = p_tipo
     AND a.referencia_id = p_referencia
     AND a.soltada_at IS NULL
     AND a.vence_at > now()
   ORDER BY a.tomada_at DESC
   LIMIT 1;
$$;

-- Las guardias de un grupo de alarmas del mismo tipo.
CREATE OR REPLACE FUNCTION interno.guardias_de_las_alarmas(p_tipo text, p_referencias uuid[])
RETURNS SETOF uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, interno AS $$
BEGIN
  IF p_tipo = 'alerta_temprana_guardia' THEN
    RETURN QUERY SELECT x.guardia_id FROM alertas_tempranas_guardia x WHERE x.id = ANY (p_referencias);
  ELSIF p_tipo = 'incidente_relevo' THEN
    RETURN QUERY SELECT x.guardia_entrante_id FROM incidentes_relevo x
                  WHERE x.id = ANY (p_referencias) AND x.guardia_entrante_id IS NOT NULL
                 UNION
                 SELECT x.guardia_saliente_id FROM incidentes_relevo x
                  WHERE x.id = ANY (p_referencias) AND x.guardia_saliente_id IS NOT NULL;
  ELSIF p_tipo = 'incidente_turno_sin_cubrir' THEN
    RETURN QUERY SELECT x.guardia_id FROM incidentes_turno_sin_cubrir x WHERE x.id = ANY (p_referencias);
  ELSIF p_tipo = 'emergencia_guardia' THEN
    RETURN QUERY SELECT x.guardia_id FROM emergencias_guardia x WHERE x.id = ANY (p_referencias);
  ELSIF p_tipo = 'guardia_sin_cerrar' THEN
    RETURN QUERY SELECT unnest(p_referencias);
  END IF;
END;
$$;

-- Las alarmas de un tipo que tiene tomadas quien inició sesión.
CREATE OR REPLACE FUNCTION interno.alarmas_que_tengo_tomadas(p_tipo text)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, interno AS $$
  SELECT coalesce(array_agg(a.referencia_id), '{}')
    FROM alarmas_tomadas a
   WHERE a.prestadora_id = interno.current_tenant()
     AND a.tipo = p_tipo
     AND a.tomada_por = auth.uid()
     AND a.soltada_at IS NULL
     AND a.vence_at > now();
$$;

-- Las alarmas de un tipo que el Coordinador tiene a la vista fuera de su zona: las que llegaron
-- al escalón de todos los Coordinadores y siguen abiertas, más las que tiene tomadas.
CREATE OR REPLACE FUNCTION interno.alarmas_a_la_vista_del_coordinador(p_tipo text)
RETURNS uuid[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, interno AS $$
DECLARE
  v_prestadora uuid := interno.current_tenant();
  v_llegaron uuid[];
  v_abiertas uuid[];
BEGIN
  IF v_prestadora IS NULL OR NOT interno.es_coordinador() THEN
    RETURN '{}';
  END IF;

  SELECT coalesce(array_agg(e.referencia_id), '{}') INTO v_llegaron
    FROM escalones_de_alarma_avisados e
   WHERE e.prestadora_id = v_prestadora
     AND e.tipo = p_tipo
     AND e.escalon = 'todos_los_coordinadores';

  IF p_tipo = 'alerta_temprana_guardia' THEN
    SELECT coalesce(array_agg(x.id), '{}') INTO v_abiertas FROM alertas_tempranas_guardia x
     WHERE x.id = ANY (v_llegaron) AND x.resuelto_at IS NULL;
  ELSIF p_tipo = 'incidente_relevo' THEN
    SELECT coalesce(array_agg(x.id), '{}') INTO v_abiertas FROM incidentes_relevo x
     WHERE x.id = ANY (v_llegaron) AND x.resuelto_at IS NULL;
  ELSIF p_tipo = 'incidente_turno_sin_cubrir' THEN
    SELECT coalesce(array_agg(x.id), '{}') INTO v_abiertas FROM incidentes_turno_sin_cubrir x
     WHERE x.id = ANY (v_llegaron) AND x.resuelto_at IS NULL;
  ELSIF p_tipo = 'emergencia_guardia' THEN
    SELECT coalesce(array_agg(x.id), '{}') INTO v_abiertas FROM emergencias_guardia x
     WHERE x.id = ANY (v_llegaron) AND x.atendida_at IS NULL;
  ELSIF p_tipo = 'guardia_sin_cerrar' THEN
    SELECT coalesce(array_agg(x.id), '{}') INTO v_abiertas FROM guardias x
     WHERE x.id = ANY (v_llegaron) AND x.estado = 'activa';
  ELSE
    v_abiertas := '{}';
  END IF;

  RETURN v_abiertas || interno.alarmas_que_tengo_tomadas(p_tipo);
END;
$$;

-- Las guardias que el Coordinador ve fuera de su zona por una alarma: las de las alarmas que tiene
-- a la vista. Y las que puede modificar: sólo las de las alarmas que tiene tomadas.
CREATE OR REPLACE FUNCTION interno.guardias_a_la_vista_por_una_alarma(p_solo_las_tomadas boolean)
RETURNS uuid[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, interno AS $$
DECLARE
  v_tipo text;
  v_guardias uuid[] := '{}';
  v_referencias uuid[];
BEGIN
  IF NOT interno.es_coordinador() THEN
    RETURN '{}';
  END IF;
  FOREACH v_tipo IN ARRAY ARRAY['alerta_temprana_guardia', 'incidente_relevo', 'guardia_sin_cerrar',
                                'incidente_turno_sin_cubrir', 'emergencia_guardia'] LOOP
    v_referencias := CASE WHEN p_solo_las_tomadas THEN interno.alarmas_que_tengo_tomadas(v_tipo)
                          ELSE interno.alarmas_a_la_vista_del_coordinador(v_tipo) END;
    IF cardinality(v_referencias) > 0 THEN
      v_guardias := v_guardias || ARRAY(SELECT interno.guardias_de_las_alarmas(v_tipo, v_referencias));
    END IF;
  END LOOP;
  RETURN v_guardias;
END;
$$;

-- 3. La toma: una sola por alarma, con la hora y el vencimiento que pone la base.
--
-- Corre con el rol de quien toma, así que la comprobación de que la alarma le llega pasa por sus
-- propias políticas: la ve si es de su zona o si llegó a todos los Coordinadores.
CREATE OR REPLACE FUNCTION interno.una_sola_toma_por_alarma()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, interno AS $$
DECLARE
  v_la_ve boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tipo || ':' || NEW.referencia_id::text, 0));

  IF auth.uid() IS NOT NULL THEN
    NEW.tomada_por := auth.uid();

    IF interno.es_coordinador() THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1)',
                     CASE NEW.tipo
                       WHEN 'alerta_temprana_guardia' THEN 'alertas_tempranas_guardia'
                       WHEN 'incidente_relevo' THEN 'incidentes_relevo'
                       WHEN 'incidente_turno_sin_cubrir' THEN 'incidentes_turno_sin_cubrir'
                       WHEN 'emergencia_guardia' THEN 'emergencias_guardia'
                       WHEN 'guardia_sin_cerrar' THEN 'guardias'
                     END)
        INTO v_la_ve USING NEW.referencia_id;
      IF NOT v_la_ve THEN
        RAISE EXCEPTION 'la_alarma_no_le_llega' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  NEW.tomada_at := now();
  NEW.vence_at := now() + make_interval(mins => interno.minutos_que_dura_la_toma(NEW.prestadora_id));
  NEW.soltada_at := NULL;

  IF interno.quien_tiene_la_alarma(NEW.prestadora_id, NEW.tipo, NEW.referencia_id) IS NOT NULL THEN
    RAISE EXCEPTION 'alarma_tomada_por_otra_persona' USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

-- Soltarla es lo único que se le cambia a una toma, y la suelta sólo quien la tomó.
CREATE OR REPLACE FUNCTION interno.la_toma_la_suelta_quien_la_tomo()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, interno AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM OLD.tomada_por THEN
    RAISE EXCEPTION 'alarma_tomada_por_otra_persona' USING ERRCODE = '42501';
  END IF;
  IF OLD.soltada_at IS NOT NULL THEN
    RAISE EXCEPTION 'toma_ya_soltada' USING ERRCODE = '23514';
  END IF;

  NEW.id := OLD.id;
  NEW.prestadora_id := OLD.prestadora_id;
  NEW.tipo := OLD.tipo;
  NEW.referencia_id := OLD.referencia_id;
  NEW.tomada_por := OLD.tomada_por;
  NEW.tomada_at := OLD.tomada_at;
  NEW.vence_at := OLD.vence_at;
  IF NEW.soltada_at IS NOT NULL THEN
    NEW.soltada_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER una_sola_toma_por_alarma
  BEFORE INSERT ON public.alarmas_tomadas
  FOR EACH ROW EXECUTE FUNCTION interno.una_sola_toma_por_alarma();

CREATE TRIGGER la_toma_la_suelta_quien_la_tomo
  BEFORE UPDATE ON public.alarmas_tomadas
  FOR EACH ROW EXECUTE FUNCTION interno.la_toma_la_suelta_quien_la_tomo();

-- Una toma no se borra: es el rastro de quién se hizo cargo.
REVOKE DELETE, TRUNCATE ON public.alarmas_tomadas FROM authenticated;

-- 4. Resolver una alarma tomada por otra persona no se puede.
--
-- Vale para toda persona del Panel, también para la administración. No frena al trabajo sin
-- persona ni al Asistente que cierra su propia guardia: esos no se hacen cargo de alarmas.
CREATE OR REPLACE FUNCTION interno.es_usuario_del_panel(p_usuario uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, interno AS $$
  SELECT EXISTS (SELECT 1 FROM usuarios u
                  WHERE u.id = p_usuario AND u.rol IN ('coordinador', 'admin_prestadora', 'superadmin'));
$$;

CREATE OR REPLACE FUNCTION interno.es_coordinador_de(p_usuario uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, interno AS $$
  SELECT EXISTS (SELECT 1 FROM usuarios u WHERE u.id = p_usuario AND u.rol = 'coordinador');
$$;

CREATE OR REPLACE FUNCTION interno.la_alarma_la_resuelve_quien_la_tomo()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, interno AS $$
DECLARE
  v_tipo text;
  v_resuelve boolean;
  v_actor uuid := auth.uid();
  v_quien uuid;
  v_asistente uuid;
BEGIN
  IF TG_TABLE_NAME = 'alertas_tempranas_guardia' THEN
    v_tipo := 'alerta_temprana_guardia';
    v_resuelve := OLD.resuelto_at IS NULL AND NEW.resuelto_at IS NOT NULL;
  ELSIF TG_TABLE_NAME = 'incidentes_relevo' THEN
    v_tipo := 'incidente_relevo';
    v_resuelve := OLD.resuelto_at IS NULL AND NEW.resuelto_at IS NOT NULL;
  ELSIF TG_TABLE_NAME = 'incidentes_turno_sin_cubrir' THEN
    v_tipo := 'incidente_turno_sin_cubrir';
    v_resuelve := OLD.resuelto_at IS NULL AND NEW.resuelto_at IS NOT NULL;
  ELSIF TG_TABLE_NAME = 'emergencias_guardia' THEN
    v_tipo := 'emergencia_guardia';
    v_resuelve := OLD.atendida_at IS NULL AND NEW.atendida_at IS NOT NULL;
    v_actor := coalesce(v_actor, NEW.atendida_por);
  ELSIF TG_TABLE_NAME = 'guardias' THEN
    v_tipo := 'guardia_sin_cerrar';
    v_resuelve := OLD.estado = 'activa' AND NEW.estado IS DISTINCT FROM 'activa';
  END IF;

  IF NOT coalesce(v_resuelve, false) OR v_actor IS NULL OR NOT interno.es_usuario_del_panel(v_actor) THEN
    RETURN NEW;
  END IF;

  v_quien := interno.quien_tiene_la_alarma(NEW.prestadora_id, v_tipo, NEW.id);
  IF v_quien IS NOT NULL AND v_quien <> v_actor THEN
    RAISE EXCEPTION 'alarma_tomada_por_otra_persona' USING ERRCODE = '42501';
  END IF;

  -- La emergencia se atiende todavía con la llave maestra, así que la zona no la mira ninguna
  -- política: se mira acá. Fuera de su zona, el Coordinador la atiende sólo si la tomó.
  IF TG_TABLE_NAME = 'emergencias_guardia' AND v_quien IS NULL AND interno.es_coordinador_de(v_actor) THEN
    SELECT g.asistente_id INTO v_asistente FROM guardias g WHERE g.id = NEW.guardia_id;
    IF NOT interno.coordinador_alcanza_asistente_de(v_actor, v_asistente) THEN
      RAISE EXCEPTION 'alarma_fuera_de_la_zona' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER la_alarma_la_resuelve_quien_la_tomo
  BEFORE UPDATE ON public.alertas_tempranas_guardia
  FOR EACH ROW EXECUTE FUNCTION interno.la_alarma_la_resuelve_quien_la_tomo();
CREATE TRIGGER la_alarma_la_resuelve_quien_la_tomo
  BEFORE UPDATE ON public.incidentes_relevo
  FOR EACH ROW EXECUTE FUNCTION interno.la_alarma_la_resuelve_quien_la_tomo();
CREATE TRIGGER la_alarma_la_resuelve_quien_la_tomo
  BEFORE UPDATE ON public.incidentes_turno_sin_cubrir
  FOR EACH ROW EXECUTE FUNCTION interno.la_alarma_la_resuelve_quien_la_tomo();
CREATE TRIGGER la_alarma_la_resuelve_quien_la_tomo
  BEFORE UPDATE ON public.emergencias_guardia
  FOR EACH ROW EXECUTE FUNCTION interno.la_alarma_la_resuelve_quien_la_tomo();
CREATE TRIGGER la_alarma_la_resuelve_quien_la_tomo
  BEFORE UPDATE OF estado ON public.guardias
  FOR EACH ROW EXECUTE FUNCTION interno.la_alarma_la_resuelve_quien_la_tomo();

-- 5. Lo que ve y resuelve el Coordinador fuera de su zona.
--
-- La lista se arma una sola vez por consulta —el `(SELECT …)` la vuelve un valor fijo— y no fila
-- por fila.

CREATE POLICY coordinador_ve_la_alarma_que_llego_a_todos ON public.alertas_tempranas_guardia
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.current_tenant()
         AND id = ANY ((SELECT interno.alarmas_a_la_vista_del_coordinador('alerta_temprana_guardia'))::uuid[]));
CREATE POLICY coordinador_resuelve_la_alarma_que_tomo ON public.alertas_tempranas_guardia
  FOR UPDATE TO authenticated
  USING (prestadora_id = interno.current_tenant() AND interno.es_coordinador()
         AND id = ANY ((SELECT interno.alarmas_que_tengo_tomadas('alerta_temprana_guardia'))::uuid[]))
  WITH CHECK (prestadora_id = interno.current_tenant());

CREATE POLICY coordinador_ve_la_alarma_que_llego_a_todos ON public.incidentes_relevo
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.current_tenant()
         AND id = ANY ((SELECT interno.alarmas_a_la_vista_del_coordinador('incidente_relevo'))::uuid[]));
CREATE POLICY coordinador_resuelve_la_alarma_que_tomo ON public.incidentes_relevo
  FOR UPDATE TO authenticated
  USING (prestadora_id = interno.current_tenant() AND interno.es_coordinador()
         AND id = ANY ((SELECT interno.alarmas_que_tengo_tomadas('incidente_relevo'))::uuid[]))
  WITH CHECK (prestadora_id = interno.current_tenant());

CREATE POLICY coordinador_ve_la_alarma_que_llego_a_todos ON public.incidentes_turno_sin_cubrir
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.current_tenant()
         AND id = ANY ((SELECT interno.alarmas_a_la_vista_del_coordinador('incidente_turno_sin_cubrir'))::uuid[]));
CREATE POLICY coordinador_resuelve_la_alarma_que_tomo ON public.incidentes_turno_sin_cubrir
  FOR UPDATE TO authenticated
  USING (prestadora_id = interno.current_tenant() AND interno.es_coordinador()
         AND id = ANY ((SELECT interno.alarmas_que_tengo_tomadas('incidente_turno_sin_cubrir'))::uuid[]))
  WITH CHECK (prestadora_id = interno.current_tenant());

CREATE POLICY coordinador_ve_la_alarma_que_llego_a_todos ON public.emergencias_guardia
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.current_tenant()
         AND id = ANY ((SELECT interno.alarmas_a_la_vista_del_coordinador('emergencia_guardia'))::uuid[]));

CREATE POLICY coordinador_ve_la_guardia_de_una_alarma_que_llego_a_todos ON public.guardias
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.current_tenant()
         AND id = ANY ((SELECT interno.guardias_a_la_vista_por_una_alarma(false))::uuid[]));
CREATE POLICY coordinador_resuelve_la_guardia_de_una_alarma_que_tomo ON public.guardias
  FOR UPDATE TO authenticated
  USING (prestadora_id = interno.current_tenant()
         AND id = ANY ((SELECT interno.guardias_a_la_vista_por_una_alarma(true))::uuid[]))
  WITH CHECK (prestadora_id = interno.current_tenant());

CREATE POLICY coordinador_registra_lo_que_paso_en_la_alarma_que_tomo ON public.excepciones_familiar_relevo
  FOR ALL TO authenticated
  USING (prestadora_id = interno.current_tenant()
         AND guardia_id = ANY ((SELECT interno.guardias_a_la_vista_por_una_alarma(true))::uuid[]))
  WITH CHECK (prestadora_id = interno.current_tenant()
              AND guardia_id = ANY ((SELECT interno.guardias_a_la_vista_por_una_alarma(true))::uuid[]));

-- 6. El padrón de Asistentes lo ven todos los Coordinadores. La política que esconde a los
--    pendientes de conformidad sigue valiendo encima de ésta.
CREATE POLICY coordinador_lee_el_padron_de_asistentes ON public.asistentes
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.current_tenant() AND interno.es_coordinador());

-- 7. La escalera de las emergencias la recorre el trabajo sin persona.
GRANT SELECT ON public.emergencias_guardia TO trabajo_sin_persona;
GRANT UPDATE (ultima_notificacion_at, veces_notificado) ON public.emergencias_guardia TO trabajo_sin_persona;
CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.emergencias_guardia
  FOR ALL TO trabajo_sin_persona
  USING (prestadora_id = interno.current_tenant())
  WITH CHECK (prestadora_id = interno.current_tenant());

-- 8. Permisos de las funciones nuevas: afuera nadie, adentro las políticas, los disparadores y
--    los trabajos.
DO $$
DECLARE
  v_firma text;
BEGIN
  FOREACH v_firma IN ARRAY ARRAY[
    'interno.es_coordinador()',
    'interno.coordinador_alcanza_asistente_de(uuid, uuid)',
    'interno.minutos_que_dura_la_toma(uuid)',
    'interno.quien_tiene_la_alarma(uuid, text, uuid)',
    'interno.guardias_de_las_alarmas(text, uuid[])',
    'interno.alarmas_que_tengo_tomadas(text)',
    'interno.alarmas_a_la_vista_del_coordinador(text)',
    'interno.guardias_a_la_vista_por_una_alarma(boolean)',
    'interno.es_usuario_del_panel(uuid)',
    'interno.es_coordinador_de(uuid)',
    'interno.una_sola_toma_por_alarma()',
    'interno.la_toma_la_suelta_quien_la_tomo()',
    'interno.la_alarma_la_resuelve_quien_la_tomo()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_firma);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role, trabajo_sin_persona', v_firma);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
