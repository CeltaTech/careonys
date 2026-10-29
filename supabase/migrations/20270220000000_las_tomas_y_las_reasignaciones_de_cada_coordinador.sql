-- Las tomas de alarma y las reasignaciones por emergencia, recortadas a lo que cada Coordinador ve.
-- ============================================================================
--
-- Cada Coordinador ve sólo sus Servicios (20270219000000). Dos tablas quedaron leyéndose de toda la
-- Prestadora:
--
-- `alarmas_tomadas`. Tomar ya estaba acotado: el disparador `una_sola_toma_por_alarma` exige que
-- la alarma esté a la vista de quien la toma. Pero la política era una sola, para todo, y dejaba
-- leer las tomas de cualquier alarma de la Prestadora: qué guardia, quién, con qué nota. Ahora se
-- lee la toma propia o la de una alarma que se ve; se toma con el disparador de siempre, y se
-- suelta sólo la propia, que es lo que ya exigía `la_toma_la_suelta_quien_la_tomo`.
--
-- `auditoria_reasignaciones_por_emergencia`. El Coordinador la leía de toda la Prestadora. Ahora,
-- la de las guardias que ve, con la misma función que usan las guardias.

-- Si una alarma está a la vista de quien consulta. Corre con los permisos de quien llama, así que
-- contesta lo que la protección por fila de cada tabla de alarmas le deja ver: es la misma pregunta
-- que hace el disparador al tomarla.
CREATE OR REPLACE FUNCTION interno.la_alarma_esta_a_la_vista(p_tipo text, p_referencia uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public, interno
AS $$
DECLARE
  v_tabla text := CASE p_tipo
    WHEN 'alerta_temprana_guardia' THEN 'alertas_tempranas_guardia'
    WHEN 'incidente_relevo' THEN 'incidentes_relevo'
    WHEN 'incidente_turno_sin_cubrir' THEN 'incidentes_turno_sin_cubrir'
    WHEN 'emergencia_guardia' THEN 'emergencias_guardia'
    WHEN 'guardia_sin_cerrar' THEN 'guardias'
  END;
  v_la_ve boolean;
BEGIN
  IF v_tabla IS NULL OR p_referencia IS NULL THEN
    RETURN false;
  END IF;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1)', v_tabla) INTO v_la_ve USING p_referencia;
  RETURN coalesce(v_la_ve, false);
END;
$$;

REVOKE ALL ON FUNCTION interno.la_alarma_esta_a_la_vista(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.la_alarma_esta_a_la_vista(text, uuid) TO authenticated;

-- El disparador hace la misma pregunta con la misma función.
CREATE OR REPLACE FUNCTION interno.una_sola_toma_por_alarma()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, interno
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tipo || ':' || NEW.referencia_id::text, 0));

  IF interno.usuario_de_la_sesion() IS NOT NULL THEN
    NEW.tomada_por := interno.usuario_de_la_sesion();

    IF interno.es_coordinador() AND NOT interno.la_alarma_esta_a_la_vista(NEW.tipo, NEW.referencia_id) THEN
      RAISE EXCEPTION 'la_alarma_no_le_llega' USING ERRCODE = '42501';
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

DROP POLICY IF EXISTS coordinador_gestiona_alarmas_tomadas ON public.alarmas_tomadas;

CREATE POLICY coordinador_lee_las_tomas_de_lo_que_ve ON public.alarmas_tomadas
  FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND interno.es_coordinador()
    AND (tomada_por = interno.usuario_de_la_sesion()
         OR interno.la_alarma_esta_a_la_vista(tipo, referencia_id))
  );

CREATE POLICY coordinador_toma_una_alarma ON public.alarmas_tomadas
  FOR INSERT TO authenticated
  WITH CHECK (prestadora_id = interno.prestadora_actual() AND interno.es_coordinador());

CREATE POLICY coordinador_suelta_su_toma ON public.alarmas_tomadas
  FOR UPDATE TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND interno.es_coordinador()
    AND tomada_por = interno.usuario_de_la_sesion()
  )
  WITH CHECK (prestadora_id = interno.prestadora_actual() AND interno.es_coordinador());

DROP POLICY IF EXISTS personal_prestadora_lee_reasignaciones_por_emergencia
  ON public.auditoria_reasignaciones_por_emergencia;

CREATE POLICY panel_lee_reasignaciones_por_emergencia ON public.auditoria_reasignaciones_por_emergencia
  FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND (interno.es_superadmin()
         OR EXISTS (SELECT 1 FROM usuarios u
                     WHERE u.id = interno.usuario_de_la_sesion() AND u.rol = 'admin_prestadora'))
  );

CREATE POLICY coordinador_lee_reasignaciones_de_lo_que_ve ON public.auditoria_reasignaciones_por_emergencia
  FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND interno.es_coordinador()
    AND interno.coordinador_ve_la_guardia(guardia_id)
  );

NOTIFY pgrst, 'reload schema';
