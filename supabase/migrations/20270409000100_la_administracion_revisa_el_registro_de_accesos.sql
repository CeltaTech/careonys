-- La administración de cada Prestadora revisa el registro de accesos a la información de salud.
--
-- Qué hace y por qué:
--
-- El registro de accesos anota cada vez que alguien leyó información de salud de un Paciente.
-- Anotarlo no alcanza: alguien de la Prestadora tiene que mirarlo y dejar constancia de que lo
-- miró. Esta migración prepara la base para eso.
--
-- 1. La configuración de la revisión, en la Prestadora. Cada Prestadora fija su horario de
--    trabajo, su zona horaria, cuántos Pacientes distintos por día lee una persona sin que
--    llame la atención, y cuántas horas antes y después de una guardia se considera que el
--    Asistente todavía atiende a ese Paciente. Cada una arranca con un valor y la Prestadora
--    lo cambia.
--
-- 2. Las constancias de revisión. Cada constancia dice qué período se revisó, quién lo revisó,
--    cuándo y, si quiso, qué observó. Una constancia no se edita ni se borra. La lee y la firma
--    sólo la administración de esa Prestadora.
--
-- 3. Los accesos fuera de lo normal de un período. Un acceso sale de lo normal por tres
--    motivos, y puede tener más de uno:
--      · fuera del horario: pasó fuera del horario de trabajo de la Prestadora, y la persona no
--        tenía en ese momento ninguna guardia propia;
--      · sin relación con el Paciente: la persona no tenía una guardia con ese Paciente cerca de
--        ese momento, no coordinaba esa guardia y no coordina el Servicio del Paciente;
--      · volumen inusual: ese día la persona leyó más Pacientes distintos que el tope de la
--        Prestadora.
--
-- 4. El resumen por persona de un período: cuántos Pacientes distintos leyó, cuántos accesos
--    hizo y cuántos accesos de emergencia abrió.
--
-- 5. El informe diario: un trabajo sin persona cuenta, una vez por día y de a una Prestadora,
--    los accesos fuera de lo normal del día anterior, y lo deja en el registro de actividad.
--
-- 6. Ver el registro de accesos queda anotado en el registro de actividad, sin forma de
--    apagarlo, y esta migración da de alta esa acción en el catálogo. La descarga se anota como
--    toda descarga, con la acción de exportación general.
--
-- Los períodos son días de la zona horaria de la Prestadora, con los dos extremos incluidos.
--
-- Cómo se vuelve atrás: otra migración que borre las cinco funciones, la tabla de constancias con
-- su disparador y la función del disparador, el índice del registro por momento, las dos
-- acciones y los cuatro datos del catálogo, y las cinco columnas de la Prestadora.

-- ---------------------------------------------------------------------------------------------
-- 1. La configuración de la revisión
-- ---------------------------------------------------------------------------------------------

-- La zona horaria de la Prestadora. Hasta ahora ninguna parte de la base la guardaba, y la
-- revisión la necesita para saber a qué hora del lugar pasó cada acceso. El nombre es el de la
-- base internacional de zonas horarias. La restricción rechaza un nombre que la base no conoce.
ALTER TABLE public.prestadoras
  ADD COLUMN zona_horaria text NOT NULL DEFAULT 'America/Argentina/Buenos_Aires'
    CONSTRAINT prestadoras_zona_horaria_conocida
    CHECK ((TIMESTAMPTZ '2000-01-01 00:00:00+00' AT TIME ZONE zona_horaria) IS NOT NULL);

-- El horario de trabajo: un acceso antes de la hora de inicio o desde la hora de fin sale de lo
-- normal. Si la hora de inicio es mayor que la de fin, el horario cruza la medianoche.
ALTER TABLE public.prestadoras
  ADD COLUMN registro_de_accesos_hora_de_inicio time NOT NULL DEFAULT '07:00',
  ADD COLUMN registro_de_accesos_hora_de_fin time NOT NULL DEFAULT '20:00',
  ADD CONSTRAINT prestadoras_registro_de_accesos_horario_valido
    CHECK (registro_de_accesos_hora_de_inicio <> registro_de_accesos_hora_de_fin);

-- Cuántos Pacientes distintos por día puede leer una persona sin que llame la atención.
ALTER TABLE public.prestadoras
  ADD COLUMN registro_de_accesos_pacientes_por_dia integer NOT NULL DEFAULT 20
    CONSTRAINT prestadoras_registro_de_accesos_pacientes_por_dia_valido
    CHECK (registro_de_accesos_pacientes_por_dia > 0);

-- Cuántas horas antes del comienzo y después del fin de una guardia se considera que el
-- Asistente todavía atiende a ese Paciente.
ALTER TABLE public.prestadoras
  ADD COLUMN registro_de_accesos_horas_alrededor_de_la_guardia integer NOT NULL DEFAULT 12
    CONSTRAINT prestadoras_registro_de_accesos_horas_alrededor_valido
    CHECK (registro_de_accesos_horas_alrededor_de_la_guardia BETWEEN 0 AND 72);

COMMENT ON COLUMN public.prestadoras.zona_horaria IS 'Zona horaria de la Prestadora, con el nombre de la base internacional de zonas horarias.';
COMMENT ON COLUMN public.prestadoras.registro_de_accesos_hora_de_inicio IS 'Hora de inicio del horario de trabajo. Un acceso a información de salud fuera del horario sale de lo normal.';
COMMENT ON COLUMN public.prestadoras.registro_de_accesos_hora_de_fin IS 'Hora de fin del horario de trabajo. Si es menor que la de inicio, el horario cruza la medianoche.';
COMMENT ON COLUMN public.prestadoras.registro_de_accesos_pacientes_por_dia IS 'Pacientes distintos por día que una persona lee sin que llame la atención.';
COMMENT ON COLUMN public.prestadoras.registro_de_accesos_horas_alrededor_de_la_guardia IS 'Horas antes y después de una guardia en las que el Asistente todavía atiende a ese Paciente.';

-- La revisión recorre el registro de una Prestadora por momento, sin Paciente.
CREATE INDEX IF NOT EXISTS consultas_a_hce_por_momento
  ON public.consultas_a_hce (prestadora_id, momento);

-- ---------------------------------------------------------------------------------------------
-- 2. Las constancias de revisión
-- ---------------------------------------------------------------------------------------------

CREATE TABLE public.constancias_de_revision_del_registro_de_accesos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras (id),
  desde date NOT NULL,
  hasta date NOT NULL,
  revisado_por uuid NOT NULL REFERENCES public.usuarios (id),
  revisado_en timestamptz NOT NULL DEFAULT now(),
  observaciones text,
  CONSTRAINT constancias_de_revision_periodo_valido CHECK (desde <= hasta),
  CONSTRAINT constancias_de_revision_observaciones_validas
    CHECK (observaciones IS NULL OR (btrim(observaciones) <> '' AND char_length(observaciones) <= 2000))
);

COMMENT ON TABLE public.constancias_de_revision_del_registro_de_accesos IS 'Constancia de que la administración de la Prestadora revisó el registro de accesos a la información de salud de un período. No se edita ni se borra.';

CREATE INDEX constancias_de_revision_por_periodo
  ON public.constancias_de_revision_del_registro_de_accesos (prestadora_id, desde DESC);

-- Quién firma, para qué Prestadora y cuándo los pone la base, nunca el pedido: salen de la
-- sesión. Una constancia firmada no se cambia ni se borra.
CREATE OR REPLACE FUNCTION interno.la_constancia_de_revision_la_firma_la_sesion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, interno
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'La constancia de revisión no se edita y no se borra';
  END IF;
  NEW.prestadora_id := interno.prestadora_actual();
  NEW.revisado_por := interno.usuario_de_la_sesion();
  NEW.revisado_en := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION interno.la_constancia_de_revision_la_firma_la_sesion() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_la_constancia_de_revision_la_firma_la_sesion
  BEFORE INSERT OR UPDATE OR DELETE ON public.constancias_de_revision_del_registro_de_accesos
  FOR EACH ROW EXECUTE FUNCTION interno.la_constancia_de_revision_la_firma_la_sesion();

ALTER TABLE public.constancias_de_revision_del_registro_de_accesos ENABLE ROW LEVEL SECURITY;

CREATE POLICY la_lee_la_administracion_de_la_prestadora
  ON public.constancias_de_revision_del_registro_de_accesos
  FOR SELECT TO authenticated
  USING (interno.es_la_administracion_de_la_prestadora(prestadora_id));

CREATE POLICY la_firma_la_administracion_de_la_prestadora
  ON public.constancias_de_revision_del_registro_de_accesos
  FOR INSERT TO authenticated
  WITH CHECK (interno.es_la_administracion_de_la_prestadora(prestadora_id)
              AND revisado_por = auth.uid());

REVOKE ALL ON TABLE public.constancias_de_revision_del_registro_de_accesos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.constancias_de_revision_del_registro_de_accesos TO authenticated;
GRANT INSERT (desde, hasta, observaciones) ON TABLE public.constancias_de_revision_del_registro_de_accesos TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Las acciones nuevas del registro de actividad y sus datos
-- ---------------------------------------------------------------------------------------------

-- Ver el registro de accesos: en la Ficha del Cliente, los accesos fuera de lo normal o el
-- resumen por persona. La hace una persona.
INSERT INTO public.catalogo_acciones_registradas (accion, grupo, orden, la_hace_el_sistema)
SELECT 'consulta_del_registro_de_accesos', 'entrada_administrativa', COALESCE(max(orden), 0) + 1, false
  FROM public.catalogo_acciones_registradas
ON CONFLICT (accion) DO NOTHING;

-- El informe diario de los accesos fuera de lo normal. Lo hace el sistema.
INSERT INTO public.catalogo_acciones_registradas (accion, grupo, orden, la_hace_el_sistema)
SELECT 'informe_diario_de_accesos_fuera_de_lo_normal', 'entrada_administrativa', COALESCE(max(orden), 0) + 1, true
  FROM public.catalogo_acciones_registradas
ON CONFLICT (accion) DO NOTHING;

-- Qué parte del registro se vio, el período y cuántos accesos.
INSERT INTO public.catalogo_datos_del_registro (clave, orden)
SELECT 'vista', COALESCE(max(orden), 0) + 1 FROM public.catalogo_datos_del_registro
ON CONFLICT (clave) DO NOTHING;

INSERT INTO public.catalogo_datos_del_registro (clave, orden)
SELECT 'desde', COALESCE(max(orden), 0) + 1 FROM public.catalogo_datos_del_registro
ON CONFLICT (clave) DO NOTHING;

INSERT INTO public.catalogo_datos_del_registro (clave, orden)
SELECT 'hasta', COALESCE(max(orden), 0) + 1 FROM public.catalogo_datos_del_registro
ON CONFLICT (clave) DO NOTHING;

INSERT INTO public.catalogo_datos_del_registro (clave, orden)
SELECT 'cantidad', COALESCE(max(orden), 0) + 1 FROM public.catalogo_datos_del_registro
ON CONFLICT (clave) DO NOTHING;

-- ---------------------------------------------------------------------------------------------
-- 4. Los accesos fuera de lo normal de un período
-- ---------------------------------------------------------------------------------------------

-- La regla, en un solo lugar. La usan la consulta de la administración y el informe diario. No
-- la llama nadie de afuera: la Prestadora se la pasa la función que ya comprobó quién pregunta.
CREATE OR REPLACE FUNCTION interno.accesos_fuera_de_lo_normal_de(
  p_prestadora uuid, p_desde date, p_hasta date
) RETURNS TABLE (
  consulta_id uuid,
  usuario_id uuid,
  persona text,
  paciente_id uuid,
  paciente text,
  categorias text[],
  momento timestamptz,
  origen text,
  motivos text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, interno
AS $$
  WITH configuracion AS (
    SELECT p.zona_horaria AS zona,
           p.registro_de_accesos_hora_de_inicio AS inicio,
           p.registro_de_accesos_hora_de_fin AS fin,
           p.registro_de_accesos_pacientes_por_dia AS tope,
           make_interval(hours => p.registro_de_accesos_horas_alrededor_de_la_guardia) AS margen,
           p.registro_de_accesos_horas_alrededor_de_la_guardia / 24 + 2 AS dias_de_margen
      FROM prestadoras p
     WHERE p.id = p_prestadora
  ),
  -- Las lecturas de personas en el período, con la hora del lugar.
  lecturas AS (
    SELECT c.id, c.usuario_id, c.paciente_id, c.categorias, c.momento, c.origen,
           (c.momento AT TIME ZONE k.zona) AS hora_local,
           k.inicio, k.fin, k.tope, k.margen
      FROM consultas_a_hce c
      CROSS JOIN configuracion k
     WHERE c.prestadora_id = p_prestadora
       AND c.usuario_id IS NOT NULL
       AND c.momento >= (p_desde::timestamp AT TIME ZONE k.zona)
       AND c.momento <  ((p_hasta + 1)::timestamp AT TIME ZONE k.zona)
  ),
  -- Las guardias que rodean el período, con su comienzo y su fin en hora del lugar. La que
  -- termina a una hora menor que la de comienzo cruza la medianoche.
  guardias_del_periodo AS (
    SELECT g.paciente_id, g.coordinador_id, a.usuario_id AS asistente_usuario_id,
           (g.fecha + g.hora_inicio) AS empieza,
           (g.fecha + g.hora_fin
             + CASE WHEN g.hora_fin <= g.hora_inicio THEN interval '1 day' ELSE interval '0' END) AS termina
      FROM guardias g
      CROSS JOIN configuracion k
      LEFT JOIN asistentes a ON a.id = g.asistente_id AND a.prestadora_id = g.prestadora_id
     WHERE g.prestadora_id = p_prestadora
       AND g.estado <> 'cancelada'
       AND g.fecha BETWEEN p_desde - k.dias_de_margen AND p_hasta + k.dias_de_margen
  ),
  -- Las personas que ese día leyeron más Pacientes distintos que el tope.
  volumen AS (
    SELECT l.usuario_id, l.hora_local::date AS dia
      FROM lecturas l
     GROUP BY l.usuario_id, l.hora_local::date
    HAVING count(DISTINCT l.paciente_id) > max(l.tope)
  ),
  marcadas AS (
    SELECT l.*,
           array_remove(ARRAY[
             CASE WHEN NOT (CASE WHEN l.inicio < l.fin
                                 THEN l.hora_local::time >= l.inicio AND l.hora_local::time < l.fin
                                 ELSE l.hora_local::time >= l.inicio OR l.hora_local::time < l.fin END)
                   AND NOT EXISTS (
                     SELECT 1 FROM guardias_del_periodo g
                      WHERE g.asistente_usuario_id = l.usuario_id
                        AND l.hora_local >= g.empieza AND l.hora_local < g.termina)
                  THEN 'fuera_del_horario' END,
             CASE WHEN NOT EXISTS (
                     SELECT 1 FROM guardias_del_periodo g
                      WHERE g.paciente_id = l.paciente_id
                        AND (g.asistente_usuario_id = l.usuario_id OR g.coordinador_id = l.usuario_id)
                        AND l.hora_local >= g.empieza - l.margen
                        AND l.hora_local <  g.termina + l.margen)
                   AND NOT EXISTS (
                     SELECT 1 FROM pacientes pa
                       JOIN servicios s ON s.prestadora_id = pa.prestadora_id
                                       AND s.cliente_id = pa.cliente_id
                      WHERE pa.id = l.paciente_id
                        AND pa.prestadora_id = p_prestadora
                        AND s.estado = 'vigente'
                        AND s.coordinador_id = l.usuario_id)
                  THEN 'sin_relacion_con_el_paciente' END,
             CASE WHEN EXISTS (
                     SELECT 1 FROM volumen v
                      WHERE v.usuario_id = l.usuario_id AND v.dia = l.hora_local::date)
                  THEN 'volumen_inusual' END
           ], NULL) AS motivos
      FROM lecturas l
  )
  SELECT m.id, m.usuario_id, u.nombre, m.paciente_id, pe.nombre_visible,
         m.categorias, m.momento, m.origen, m.motivos
    FROM marcadas m
    LEFT JOIN usuarios u ON u.id = m.usuario_id
    LEFT JOIN pacientes pa ON pa.id = m.paciente_id AND pa.prestadora_id = p_prestadora
    LEFT JOIN personas pe ON pe.id = pa.persona_id
   WHERE cardinality(m.motivos) > 0
   ORDER BY m.momento DESC;
$$;

REVOKE ALL ON FUNCTION interno.accesos_fuera_de_lo_normal_de(uuid, date, date) FROM PUBLIC, anon, authenticated, trabajo_sin_persona;

-- El resumen por persona, en un solo lugar.
CREATE OR REPLACE FUNCTION interno.resumen_del_registro_de_accesos_de(
  p_prestadora uuid, p_desde date, p_hasta date
) RETURNS TABLE (
  usuario_id uuid,
  persona text,
  pacientes_distintos integer,
  accesos integer,
  accesos_de_emergencia integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, interno
AS $$
  WITH tramo AS (
    SELECT (p_desde::timestamp AT TIME ZONE p.zona_horaria) AS desde,
           ((p_hasta + 1)::timestamp AT TIME ZONE p.zona_horaria) AS hasta
      FROM prestadoras p
     WHERE p.id = p_prestadora
  ),
  lecturas AS (
    SELECT c.usuario_id,
           count(DISTINCT c.paciente_id)::integer AS pacientes,
           count(*)::integer AS cantidad
      FROM consultas_a_hce c, tramo t
     WHERE c.prestadora_id = p_prestadora
       AND c.usuario_id IS NOT NULL
       AND c.momento >= t.desde AND c.momento < t.hasta
     GROUP BY c.usuario_id
  ),
  -- El acceso de emergencia lo anota en el registro de actividad la acción de ese nombre.
  emergencias AS (
    SELECT r.usuario_id, count(*)::integer AS cantidad
      FROM registro_actividad r, tramo t
     WHERE r.prestadora_id = p_prestadora
       AND r.accion = 'acceso_de_emergencia'
       AND r.usuario_id IS NOT NULL
       AND r.created_at >= t.desde AND r.created_at < t.hasta
     GROUP BY r.usuario_id
  )
  SELECT COALESCE(l.usuario_id, e.usuario_id),
         u.nombre,
         COALESCE(l.pacientes, 0),
         COALESCE(l.cantidad, 0),
         COALESCE(e.cantidad, 0)
    FROM lecturas l
    FULL JOIN emergencias e ON e.usuario_id = l.usuario_id
    LEFT JOIN usuarios u ON u.id = COALESCE(l.usuario_id, e.usuario_id)
   ORDER BY 3 DESC, 2;
$$;

REVOKE ALL ON FUNCTION interno.resumen_del_registro_de_accesos_de(uuid, date, date) FROM PUBLIC, anon, authenticated, trabajo_sin_persona;

-- Lo que pide la administración, con su sesión. La Prestadora sale de la sesión y no del pedido,
-- y sólo contesta a la administración de esa Prestadora.
CREATE OR REPLACE FUNCTION public.accesos_fuera_de_lo_normal(p_desde date, p_hasta date)
RETURNS TABLE (
  consulta_id uuid,
  usuario_id uuid,
  persona text,
  paciente_id uuid,
  paciente text,
  categorias text[],
  momento timestamptz,
  origen text,
  motivos text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, interno
AS $$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
BEGIN
  IF v_prestadora IS NULL OR NOT interno.es_la_administracion_de_la_prestadora(v_prestadora) THEN
    RAISE EXCEPTION 'Sin permiso para revisar el registro de accesos' USING ERRCODE = '42501';
  END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde THEN
    RAISE EXCEPTION 'El período no es válido' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT * FROM interno.accesos_fuera_de_lo_normal_de(v_prestadora, p_desde, p_hasta);
END;
$$;

REVOKE ALL ON FUNCTION public.accesos_fuera_de_lo_normal(date, date) FROM PUBLIC, anon, trabajo_sin_persona;
GRANT EXECUTE ON FUNCTION public.accesos_fuera_de_lo_normal(date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.resumen_del_registro_de_accesos_por_persona(p_desde date, p_hasta date)
RETURNS TABLE (
  usuario_id uuid,
  persona text,
  pacientes_distintos integer,
  accesos integer,
  accesos_de_emergencia integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, interno
AS $$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
BEGIN
  IF v_prestadora IS NULL OR NOT interno.es_la_administracion_de_la_prestadora(v_prestadora) THEN
    RAISE EXCEPTION 'Sin permiso para revisar el registro de accesos' USING ERRCODE = '42501';
  END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde THEN
    RAISE EXCEPTION 'El período no es válido' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT * FROM interno.resumen_del_registro_de_accesos_de(v_prestadora, p_desde, p_hasta);
END;
$$;

REVOKE ALL ON FUNCTION public.resumen_del_registro_de_accesos_por_persona(date, date) FROM PUBLIC, anon, trabajo_sin_persona;
GRANT EXECUTE ON FUNCTION public.resumen_del_registro_de_accesos_por_persona(date, date) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. El informe diario
-- ---------------------------------------------------------------------------------------------

-- La llama el trabajo sin persona, de a una Prestadora: la Prestadora sale de su credencial. El
-- día anterior es el de la zona horaria de la Prestadora. Se anota una sola vez por día aunque
-- el trabajo corra más de una vez: el candado del momento evita que dos corridas juntas anoten
-- dos renglones del mismo día.
CREATE OR REPLACE FUNCTION public.informar_accesos_fuera_de_lo_normal_del_dia_anterior()
RETURNS TABLE (dia date, cantidad integer, anotado boolean)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, interno
AS $$
DECLARE
  v_prestadora uuid;
  v_dia date;
  v_cantidad integer;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'trabajo_sin_persona' THEN
    RAISE EXCEPTION 'El informe diario lo hace el trabajo sin persona' USING ERRCODE = '42501';
  END IF;
  v_prestadora := interno.prestadora_actual();
  IF v_prestadora IS NULL THEN
    RAISE EXCEPTION 'Sin Prestadora para el informe diario' USING ERRCODE = '42501';
  END IF;

  SELECT (now() AT TIME ZONE p.zona_horaria)::date - 1 INTO v_dia
    FROM prestadoras p WHERE p.id = v_prestadora;

  PERFORM pg_advisory_xact_lock(hashtext('informe_diario_de_accesos_fuera_de_lo_normal'), hashtext(v_prestadora::text));

  SELECT count(*)::integer INTO v_cantidad
    FROM interno.accesos_fuera_de_lo_normal_de(v_prestadora, v_dia, v_dia);

  IF EXISTS (
    SELECT 1 FROM registro_actividad r
     WHERE r.prestadora_id = v_prestadora
       AND r.accion = 'informe_diario_de_accesos_fuera_de_lo_normal'
       AND r.detalle ->> 'desde' = v_dia::text
  ) THEN
    RETURN QUERY SELECT v_dia, v_cantidad, false;
    RETURN;
  END IF;

  INSERT INTO registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, detalle)
  VALUES (v_prestadora, NULL, 'informe_diario_de_accesos_fuera_de_lo_normal', 'consultas_a_hce',
          jsonb_build_object('desde', v_dia::text, 'hasta', v_dia::text, 'cantidad', v_cantidad));

  RETURN QUERY SELECT v_dia, v_cantidad, true;
END;
$$;

REVOKE ALL ON FUNCTION public.informar_accesos_fuera_de_lo_normal_del_dia_anterior() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.informar_accesos_fuera_de_lo_normal_del_dia_anterior() TO trabajo_sin_persona;

NOTIFY pgrst, 'reload schema';
