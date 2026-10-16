-- El turno fijo y el reemplazo durante una ausencia se aceptan una sola vez
-- ==========================================================================
--
-- Un turno de un día ya no pasa a ser de nadie hasta que el Asistente lo acepta. Ahora vale lo
-- mismo para los otros dos: el turno fijo —todos los lunes y miércoles de 8 a 14— y el reemplazo
-- de un Asistente ausente. El Asistente contesta una vez por todo, no día por día.
--
-- Una asignación apunta a una sola de tres cosas: un turno, un turno fijo o una ausencia.
--
--   - El turno fijo queda sin Asistente mientras espera. Al aceptarlo, pasa a ser suyo y también
--     sus turnos que vienen y no tienen a nadie.
--   - En la ausencia, quien coordina anota las coberturas como hasta ahora, pero quedan esperando.
--     Al aceptarlas se aplican; al rechazarlas quedan objetadas, igual que si las hubiera objetado
--     después.
--
-- Las tres tablas están vacías en vivo: no hay filas que acomodar.

-- ---------------------------------------------------------------------------------------------
-- La asignación
-- ---------------------------------------------------------------------------------------------

ALTER TABLE public.asignaciones_de_turno
  ALTER COLUMN guardia_id DROP NOT NULL,
  ADD COLUMN serie_id uuid REFERENCES public.series_guardias(id) ON DELETE CASCADE,
  ADD COLUMN ausencia_id uuid REFERENCES public.ausencias(id) ON DELETE CASCADE,
  ADD CONSTRAINT asignaciones_de_turno_apunta_a_una_sola_cosa
    CHECK (num_nonnulls(guardia_id, serie_id, ausencia_id) = 1);

-- Un turno fijo espera a una persona por vez, igual que un turno.
CREATE UNIQUE INDEX asignaciones_de_turno_una_sin_responder_por_serie
  ON public.asignaciones_de_turno (serie_id)
  WHERE estado = 'sin_responder' AND serie_id IS NOT NULL;

-- En una ausencia puede haber varios sustitutos —uno por turno fijo—, y cada uno contesta una vez
-- por todo lo suyo.
CREATE UNIQUE INDEX asignaciones_de_turno_una_sin_responder_por_ausencia
  ON public.asignaciones_de_turno (ausencia_id, asistente_id)
  WHERE estado = 'sin_responder' AND ausencia_id IS NOT NULL;

COMMENT ON COLUMN public.asignaciones_de_turno.serie_id IS
  'El turno fijo asignado entero. Se acepta o se rechaza una vez por todos sus días.';
COMMENT ON COLUMN public.asignaciones_de_turno.ausencia_id IS
  'La ausencia que el Asistente cubre. Se acepta o se rechaza una vez por todas sus coberturas pendientes.';

-- ---------------------------------------------------------------------------------------------
-- La cobertura de una ausencia
-- ---------------------------------------------------------------------------------------------

-- Sin turno fijo, la cobertura es la de los turnos sueltos del ausente.
ALTER TABLE public.coberturas_de_ausencia
  ALTER COLUMN serie_id DROP NOT NULL,
  ADD COLUMN aceptada_at timestamptz;

CREATE UNIQUE INDEX coberturas_de_ausencia_una_para_los_sueltos
  ON public.coberturas_de_ausencia (ausencia_id)
  WHERE serie_id IS NULL AND objetada_at IS NULL;

COMMENT ON COLUMN public.coberturas_de_ausencia.aceptada_at IS
  'Cuándo la aceptó el sustituto. Hasta entonces no cubre ninguna guardia.';

-- ---------------------------------------------------------------------------------------------
-- Los disparadores de la asignación
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION interno.la_asignacion_cambia_de_estado()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF interno.usuario_de_la_sesion() IS NOT NULL THEN
      NEW.asignado_por := interno.usuario_de_la_sesion();
    END IF;
    NEW.asignado_at := now();
    NEW.respondida_at := CASE WHEN NEW.estado IN ('aceptada', 'rechazada') THEN now() END;
    NEW.retirada_at := CASE WHEN NEW.estado = 'retirada' THEN now() END;
    NEW.retirada_por := CASE WHEN NEW.estado = 'retirada' THEN interno.usuario_de_la_sesion() END;
    RETURN NEW;
  END IF;

  IF NEW.prestadora_id IS DISTINCT FROM OLD.prestadora_id
     OR NEW.guardia_id IS DISTINCT FROM OLD.guardia_id
     OR NEW.serie_id IS DISTINCT FROM OLD.serie_id
     OR NEW.ausencia_id IS DISTINCT FROM OLD.ausencia_id
     OR NEW.asistente_id IS DISTINCT FROM OLD.asistente_id
     OR NEW.asistente_anterior_id IS DISTINCT FROM OLD.asistente_anterior_id
     OR NEW.asignado_por IS DISTINCT FROM OLD.asignado_por
     OR NEW.asignado_at IS DISTINCT FROM OLD.asignado_at THEN
    RAISE EXCEPTION 'asignacion_no_se_modifica' USING ERRCODE = '23514';
  END IF;

  NEW.respondida_at := OLD.respondida_at;
  NEW.retirada_at := OLD.retirada_at;
  NEW.retirada_por := OLD.retirada_por;

  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
    RETURN NEW;
  END IF;

  IF OLD.estado <> 'sin_responder' THEN
    RAISE EXCEPTION 'asignacion_ya_respondida' USING ERRCODE = '23514';
  END IF;

  IF NEW.estado IN ('aceptada', 'rechazada') THEN
    NEW.respondida_at := now();
  ELSIF NEW.estado = 'retirada' THEN
    NEW.retirada_at := now();
    NEW.retirada_por := interno.usuario_de_la_sesion();
  END IF;

  RETURN NEW;
END;
$function$;

-- La Matrícula se mira contra el último día que se acepta: el de la guardia, o el comienzo del
-- turno fijo si todavía no empezó. La ausencia se mira contra hoy.
CREATE OR REPLACE FUNCTION interno.exigir_matricula_en_asignacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_motivo text;
  v_dia    date;
BEGIN
  IF NEW.estado = 'aceptada'
     AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'aceptada') THEN
    IF NEW.guardia_id IS NOT NULL THEN
      SELECT interno.dia_en_que_termina_guardia(g.fecha, g.hora_inicio, g.hora_fin)
        INTO v_dia
        FROM public.guardias g
       WHERE g.id = NEW.guardia_id;
    ELSIF NEW.serie_id IS NOT NULL THEN
      SELECT GREATEST(s.vigente_desde, CURRENT_DATE)
        INTO v_dia
        FROM public.series_guardias s
       WHERE s.id = NEW.serie_id;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    v_dia := CURRENT_DATE;
  ELSE
    RETURN NEW;
  END IF;

  v_motivo := interno.motivo_bloqueo_matricula(NEW.asistente_id, COALESCE(v_dia, CURRENT_DATE));

  IF v_motivo IS NOT NULL THEN
    RAISE EXCEPTION 'matricula_bloquea:%:', v_motivo
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION interno.fn_modalidad_en_asignacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_modalidad text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.guardia_id IS NOT NULL THEN
    SELECT g.canal_modalidad INTO v_modalidad
      FROM public.guardias g
     WHERE g.id = NEW.guardia_id;
  ELSIF NEW.serie_id IS NOT NULL THEN
    SELECT s.canal_modalidad INTO v_modalidad
      FROM public.series_guardias s
     WHERE s.id = NEW.serie_id;
  END IF;

  IF v_modalidad IS NOT NULL
     AND NOT interno.asistente_trabaja_en_modalidad(NEW.asistente_id, v_modalidad) THEN
    RAISE EXCEPTION 'modalidad_bloquea:%:', v_modalidad
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- Asignar un turno fijo
-- ---------------------------------------------------------------------------------------------
--
-- El molde es `asignar_turno`: corre con la credencial de quien pide, y la protección por fila
-- decide qué alcanza. Quien tenía el turno fijo —aceptado o esperando— lo pierde en el mismo paso.
-- Sus turnos que vienen no se tocan acá: los sigue haciendo quien los tiene hasta que el nuevo
-- acepte, y ahí pasan los que no tienen a nadie.

CREATE OR REPLACE FUNCTION public.asignar_serie(p_serie_id uuid, p_asistente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
  v_serie      public.series_guardias;
  v_pendiente  public.asignaciones_de_turno;
  v_anterior   uuid;
  v_nueva      uuid;
  v_motivo     text;
BEGIN
  IF v_prestadora IS NULL THEN
    RAISE EXCEPTION 'serie_no_encontrada';
  END IF;

  SELECT * INTO v_pendiente
    FROM asignaciones_de_turno
   WHERE serie_id = p_serie_id
     AND prestadora_id = v_prestadora
     AND estado = 'sin_responder'
   FOR UPDATE;

  SELECT * INTO v_serie
    FROM series_guardias
   WHERE id = p_serie_id
     AND prestadora_id = v_prestadora
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'serie_no_encontrada';
  END IF;

  IF v_serie.estado <> 'activa' THEN
    RAISE EXCEPTION 'serie_no_se_asigna' USING ERRCODE = '23514';
  END IF;

  IF p_asistente_id IS NOT NULL AND v_pendiente.asistente_id = p_asistente_id THEN
    RETURN jsonb_build_object('sin_cambios', true);
  END IF;
  IF p_asistente_id IS NOT NULL AND v_pendiente.id IS NULL AND v_serie.asistente_id = p_asistente_id THEN
    RETURN jsonb_build_object('sin_cambios', true);
  END IF;
  IF p_asistente_id IS NULL AND v_pendiente.id IS NULL AND v_serie.asistente_id IS NULL THEN
    RETURN jsonb_build_object('sin_cambios', true);
  END IF;

  v_anterior := COALESCE(v_serie.asistente_id, v_pendiente.asistente_anterior_id);

  IF p_asistente_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM asistentes a WHERE a.id = p_asistente_id AND a.prestadora_id = v_prestadora) THEN
      RAISE EXCEPTION 'asistente_no_encontrado';
    END IF;

    IF EXISTS (SELECT 1 FROM usuarios u WHERE u.id = interno.usuario_de_la_sesion() AND u.rol = 'coordinador')
       AND NOT interno.coordinador_alcanza_asistente(p_asistente_id) THEN
      RAISE EXCEPTION 'asistente_no_encontrado';
    END IF;

    v_motivo := interno.motivo_bloqueo_matricula(p_asistente_id, GREATEST(v_serie.vigente_desde, CURRENT_DATE));
    IF v_motivo IS NOT NULL THEN
      RAISE EXCEPTION 'matricula_bloquea:%:', v_motivo USING ERRCODE = '23514';
    END IF;

    IF v_serie.canal_modalidad IS NOT NULL
       AND NOT interno.asistente_trabaja_en_modalidad(p_asistente_id, v_serie.canal_modalidad) THEN
      RAISE EXCEPTION 'modalidad_bloquea:%:', v_serie.canal_modalidad USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_pendiente.id IS NOT NULL THEN
    UPDATE asignaciones_de_turno SET estado = 'retirada' WHERE id = v_pendiente.id;
  END IF;

  IF v_serie.asistente_id IS NOT NULL THEN
    UPDATE series_guardias SET asistente_id = NULL WHERE id = v_serie.id;
  END IF;

  IF p_asistente_id IS NOT NULL THEN
    INSERT INTO asignaciones_de_turno (prestadora_id, serie_id, asistente_id, asistente_anterior_id)
    VALUES (v_prestadora, v_serie.id, p_asistente_id, v_anterior)
    RETURNING id INTO v_nueva;
  END IF;

  RETURN jsonb_build_object(
    'sin_cambios', false,
    'asignacion_id', v_nueva,
    'titular_retirado', v_serie.asistente_id,
    'pendiente_retirado', v_pendiente.asistente_id,
    'asistente_anterior_id', v_anterior
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.asignar_serie(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asignar_serie(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Aceptar
-- ---------------------------------------------------------------------------------------------
--
-- Devuelve la guardia cuando lo aceptado es un turno; para el turno fijo y la ausencia, nada: son
-- muchos días. Las coberturas de la ausencia quedan aceptadas acá, y las aplica el backend.

DROP FUNCTION public.aceptar_asignacion(uuid);

CREATE FUNCTION public.aceptar_asignacion(p_asignacion_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
  v_asistente  uuid := interno.asistente_de_la_sesion();
  v_asignacion public.asignaciones_de_turno;
  v_tomadas    integer;
BEGIN
  IF v_prestadora IS NULL OR v_asistente IS NULL THEN
    RAISE EXCEPTION 'asignacion_no_encontrada';
  END IF;

  SELECT * INTO v_asignacion
    FROM asignaciones_de_turno
   WHERE id = p_asignacion_id
     AND prestadora_id = v_prestadora
     AND asistente_id = v_asistente
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'asignacion_no_encontrada';
  END IF;

  IF v_asignacion.estado <> 'sin_responder' THEN
    RAISE EXCEPTION 'asignacion_ya_respondida';
  END IF;

  IF v_asignacion.guardia_id IS NOT NULL THEN
    UPDATE guardias
       SET asistente_id = v_asistente
     WHERE id = v_asignacion.guardia_id
       AND prestadora_id = v_prestadora
       AND estado = 'programada'
       AND asistente_id IS NULL;

    GET DIAGNOSTICS v_tomadas = ROW_COUNT;
    IF v_tomadas = 0 THEN
      RAISE EXCEPTION 'guardia_ya_cubierta';
    END IF;

  ELSIF v_asignacion.serie_id IS NOT NULL THEN
    UPDATE series_guardias
       SET asistente_id = v_asistente
     WHERE id = v_asignacion.serie_id
       AND prestadora_id = v_prestadora
       AND estado = 'activa'
       AND asistente_id IS NULL;

    GET DIAGNOSTICS v_tomadas = ROW_COUNT;
    IF v_tomadas = 0 THEN
      RAISE EXCEPTION 'guardia_ya_cubierta';
    END IF;

    -- Los turnos que vienen y no tienen a nadie pasan a ser suyos. Los que esperan la respuesta de
    -- otro por ese día quedan como están.
    UPDATE guardias g
       SET asistente_id = v_asistente
     WHERE g.serie_id = v_asignacion.serie_id
       AND g.prestadora_id = v_prestadora
       AND g.estado = 'programada'
       AND g.asistente_id IS NULL
       AND g.fecha >= CURRENT_DATE
       AND NOT EXISTS (
         SELECT 1 FROM asignaciones_de_turno o
          WHERE o.guardia_id = g.id
            AND o.estado = 'sin_responder'
       );

  ELSE
    UPDATE coberturas_de_ausencia
       SET aceptada_at = now()
     WHERE ausencia_id = v_asignacion.ausencia_id
       AND prestadora_id = v_prestadora
       AND asistente_sustituto_id = v_asistente
       AND aceptada_at IS NULL
       AND objetada_at IS NULL;
  END IF;

  UPDATE asignaciones_de_turno
     SET estado = 'aceptada'
   WHERE id = v_asignacion.id;

  RETURN v_asignacion.guardia_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.aceptar_asignacion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aceptar_asignacion(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Lo que el Asistente tiene para responder
-- ---------------------------------------------------------------------------------------------
--
-- Una fila por asignación. El turno trae su día; el turno fijo, sus días de la semana y desde
-- cuándo; la ausencia, desde y hasta cuándo y cuántos turnos son. Barrio y nivel de complejidad,
-- de todos los Pacientes que alcanza.

DROP FUNCTION public.turnos_asignados_sin_responder();

CREATE FUNCTION public.turnos_asignados_sin_responder()
 RETURNS TABLE(
   asignacion_id uuid,
   asignado_at timestamp with time zone,
   tipo text,
   guardia_id uuid,
   serie_id uuid,
   ausencia_id uuid,
   fecha date,
   hora_inicio time without time zone,
   hora_fin time without time zone,
   dias_hasta_el_fin smallint,
   modalidad text,
   dias_semana text[],
   desde date,
   hasta date,
   cantidad integer,
   barrios text[],
   niveles_de_complejidad text[]
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  WITH mias AS (
    SELECT a.*
      FROM asignaciones_de_turno a
     WHERE a.prestadora_id = interno.prestadora_actual()
       AND a.asistente_id = interno.asistente_de_la_sesion()
       AND a.estado = 'sin_responder'
  ),
  -- Un turno suelto.
  turnos AS (
    SELECT a.id, a.asignado_at, 'turno'::text AS tipo, g.id AS guardia_id, NULL::uuid AS serie_id,
           NULL::uuid AS ausencia_id, g.fecha, g.hora_inicio, g.hora_fin, g.dias_hasta_el_fin,
           g.modalidad, NULL::text[] AS dias_semana, g.fecha AS desde, g.fecha AS hasta,
           1 AS cantidad, quienes.ids, g.fecha AS dia_del_domicilio, g.prestadora_id
      FROM mias a
      JOIN guardias g
        ON g.id = a.guardia_id
       AND g.prestadora_id = a.prestadora_id
     CROSS JOIN LATERAL (
       SELECT CASE WHEN count(gp.paciente_id) > 0
                   THEN array_agg(gp.paciente_id)
                   ELSE array_remove(ARRAY[g.paciente_id], NULL)
              END AS ids
         FROM guardia_pacientes gp
        WHERE gp.guardia_id = g.id
          AND gp.prestadora_id = g.prestadora_id
     ) quienes
     WHERE g.estado = 'programada'
       AND g.asistente_id IS NULL
  ),
  -- Un turno fijo entero.
  fijos AS (
    SELECT a.id, a.asignado_at, 'serie'::text, NULL::uuid, s.id, NULL::uuid,
           NULL::date, s.hora_inicio, s.hora_fin, s.dias_hasta_el_fin, s.modalidad, s.dias_semana,
           GREATEST(s.vigente_desde, CURRENT_DATE), s.vigente_hasta, NULL::integer,
           array_remove(ARRAY[s.paciente_id], NULL)
             || ARRAY(SELECT sp.paciente_id FROM series_guardias_pacientes sp
                       WHERE sp.serie_id = s.id AND sp.prestadora_id = s.prestadora_id),
           GREATEST(s.vigente_desde, CURRENT_DATE), s.prestadora_id
      FROM mias a
      JOIN series_guardias s
        ON s.id = a.serie_id
       AND s.prestadora_id = a.prestadora_id
     WHERE s.estado = 'activa'
       AND s.asistente_id IS NULL
  ),
  -- El reemplazo de un ausente: hasta dónde llega lo decide la misma cuenta que
  -- `hastaDondeCubrir` del backend.
  ausencias_mias AS (
    SELECT a.id, a.asignado_at, a.prestadora_id, au.id AS ausencia_id, au.asistente_id AS titular_id,
           GREATEST(au.fecha_inicio, CURRENT_DATE) AS desde,
           CASE WHEN au.fecha_vuelta_real IS NULL AND au.fecha_fin < CURRENT_DATE
                THEN CURRENT_DATE + 2
                ELSE au.fecha_fin
           END AS hasta
      FROM mias a
      JOIN ausencias au
        ON au.id = a.ausencia_id
       AND au.prestadora_id = a.prestadora_id
  ),
  turnos_del_ausente AS (
    SELECT am.id AS asignacion_id, g.id AS guardia_id, g.fecha, g.paciente_id, g.prestadora_id
      FROM ausencias_mias am
      JOIN guardias g
        ON g.prestadora_id = am.prestadora_id
       AND g.asistente_id = am.titular_id
       AND g.estado = 'programada'
       AND g.fecha BETWEEN am.desde AND am.hasta
     WHERE EXISTS (
       SELECT 1 FROM coberturas_de_ausencia c
        WHERE c.ausencia_id = am.ausencia_id
          AND c.prestadora_id = am.prestadora_id
          AND c.asistente_sustituto_id = interno.asistente_de_la_sesion()
          AND c.aceptada_at IS NULL
          AND c.objetada_at IS NULL
          AND c.serie_id IS NOT DISTINCT FROM g.serie_id
     )
  ),
  reemplazos AS (
    SELECT am.id, am.asignado_at, 'ausencia'::text, NULL::uuid, NULL::uuid, am.ausencia_id,
           NULL::date, NULL::time, NULL::time, NULL::smallint, NULL::text, NULL::text[],
           am.desde, am.hasta,
           (SELECT count(*)::integer FROM turnos_del_ausente t WHERE t.asignacion_id = am.id),
           ARRAY(
             SELECT DISTINCT p.id
               FROM turnos_del_ausente t
               CROSS JOIN LATERAL (
                 SELECT gp.paciente_id AS id FROM guardia_pacientes gp
                  WHERE gp.guardia_id = t.guardia_id AND gp.prestadora_id = t.prestadora_id
                 UNION
                 SELECT t.paciente_id WHERE t.paciente_id IS NOT NULL
               ) p
              WHERE t.asignacion_id = am.id
           ),
           am.desde, am.prestadora_id
      FROM ausencias_mias am
  ),
  todo AS (
    SELECT * FROM turnos
    UNION ALL SELECT * FROM fijos
    UNION ALL SELECT * FROM reemplazos
  )
  SELECT x.id,
         x.asignado_at,
         x.tipo,
         x.guardia_id,
         x.serie_id,
         x.ausencia_id,
         x.fecha,
         x.hora_inicio,
         x.hora_fin,
         x.dias_hasta_el_fin,
         x.modalidad,
         x.dias_semana,
         x.desde,
         x.hasta,
         x.cantidad,
         (SELECT array_agg(DISTINCT d.lugar ORDER BY d.lugar)
            FROM public.domicilios_de_pacientes_en(x.ids, x.dia_del_domicilio) d
           WHERE d.lugar IS NOT NULL),
         (SELECT array_agg(DISTINCT p.nivel_complejidad ORDER BY p.nivel_complejidad)
            FROM public.pacientes p
           WHERE p.id = ANY (x.ids)
             AND p.prestadora_id = x.prestadora_id
             AND p.nivel_complejidad IS NOT NULL)
    FROM todo x
   ORDER BY x.asignado_at DESC
   LIMIT 50
$function$;

REVOKE ALL ON FUNCTION public.turnos_asignados_sin_responder() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.turnos_asignados_sin_responder() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
