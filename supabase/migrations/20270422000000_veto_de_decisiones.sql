-- El veto de la administración sobre las decisiones del Coordinador.
--
-- Cada vez que un Coordinador cambia algo de un Servicio —el equipo, un turno de guardia, la
-- cobertura de una ausencia, una pausa, un reemplazo—, la base anota la decisión y cómo estaba
-- cada cosa antes. La administración de esa misma Prestadora puede vetar la decisión, con un
-- motivo escrito. El veto vuelve todo a como estaba, desde el día del veto en adelante. Un turno
-- de guardia que ya pasó o que ya empezó no se toca nunca.
--
-- Anotar un hecho no es una decisión: una internación, una emergencia, una ausencia o una alerta
-- no se vetan. Lo que el Coordinador decidió después, a raíz de ese hecho, sí.
--
-- Si alguien cambió lo mismo después de la decisión, el veto no se hace y se dice por qué.
--
-- Además, cubrir un turno de guardia con un sustituto pasa a ser una sola operación de la base,
-- que hace las dos escrituras juntas o no hace ninguna.

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- Las decisiones y lo que cambió cada una
-- ---------------------------------------------------------------------------------------------

CREATE TABLE public.decisiones_de_coordinacion (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras(id) ON DELETE CASCADE,
  servicio_id uuid,
  clase text NOT NULL,
  rango smallint NOT NULL,
  transaccion bigint NOT NULL,
  decidida_por uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  decidida_at timestamp with time zone DEFAULT now() NOT NULL,
  vetada_at timestamp with time zone,
  vetada_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  motivo_del_veto text,
  vista_por_el_coordinador_at timestamp with time zone,
  CONSTRAINT decision_del_servicio_de_la_misma_prestadora FOREIGN KEY (servicio_id, prestadora_id)
    REFERENCES public.servicios(id, prestadora_id) ON DELETE CASCADE,
  CONSTRAINT decision_de_clase_conocida CHECK (clase = ANY (ARRAY[
    'cobertura', 'asignacion', 'interrupcion', 'turno_guardia_recurrente', 'equipo', 'tareas',
    'prestacion', 'servicio', 'turno_guardia'])),
  CONSTRAINT el_veto_trae_su_motivo CHECK (
    (vetada_at IS NULL AND vetada_por IS NULL AND motivo_del_veto IS NULL)
    OR (vetada_at IS NOT NULL AND motivo_del_veto IS NOT NULL AND btrim(motivo_del_veto) <> '')),
  CONSTRAINT se_ve_solo_un_veto CHECK (vista_por_el_coordinador_at IS NULL OR vetada_at IS NOT NULL)
);

CREATE UNIQUE INDEX una_decision_por_transaccion ON public.decisiones_de_coordinacion
  (prestadora_id, transaccion, (COALESCE(servicio_id, '00000000-0000-0000-0000-000000000000'::uuid)), decidida_por);
CREATE INDEX decisiones_de_coordinacion_por_servicio ON public.decisiones_de_coordinacion
  (prestadora_id, servicio_id, decidida_at);
CREATE INDEX decisiones_de_coordinacion_vetadas_sin_ver ON public.decisiones_de_coordinacion
  (prestadora_id, decidida_por) WHERE vetada_at IS NOT NULL AND vista_por_el_coordinador_at IS NULL;

ALTER TABLE public.decisiones_de_coordinacion ENABLE ROW LEVEL SECURITY;

-- La administración ve las decisiones de su Prestadora. El Coordinador ve sólo las suyas, para
-- enterarse de cuáles le vetaron. Nadie escribe directo: escriben la captura y el veto.
CREATE POLICY panel_lee_las_decisiones_de_coordinacion ON public.decisiones_de_coordinacion
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND (interno.es_admin_prestadora() OR decidida_por = interno.usuario_de_la_sesion()));

GRANT SELECT ON public.decisiones_de_coordinacion TO authenticated;
GRANT ALL ON public.decisiones_de_coordinacion TO service_role;

CREATE TABLE public.cambios_de_la_decision (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras(id) ON DELETE CASCADE,
  decision_id uuid NOT NULL REFERENCES public.decisiones_de_coordinacion(id) ON DELETE CASCADE,
  orden bigint GENERATED ALWAYS AS IDENTITY,
  tabla text NOT NULL,
  fila_id text NOT NULL,
  operacion text NOT NULL,
  antes jsonb,
  despues jsonb,
  CONSTRAINT cambio_de_operacion_conocida CHECK (operacion = ANY (ARRAY['alta', 'cambio', 'baja']))
);

CREATE INDEX cambios_de_la_decision_por_decision ON public.cambios_de_la_decision (decision_id, orden);

ALTER TABLE public.cambios_de_la_decision ENABLE ROW LEVEL SECURITY;

CREATE POLICY panel_lee_los_cambios_de_la_decision ON public.cambios_de_la_decision
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual() AND interno.es_admin_prestadora());

GRANT SELECT ON public.cambios_de_la_decision TO authenticated;
GRANT ALL ON public.cambios_de_la_decision TO service_role;

-- ---------------------------------------------------------------------------------------------
-- Qué se anota de cada fila
-- ---------------------------------------------------------------------------------------------

-- Las columnas que decide el Coordinador en cada tabla. Las demás —entradas y salidas, avisos
-- enviados, ubicación— son hechos o marcas del sistema, y no se anotan ni se vuelven atrás.
CREATE OR REPLACE FUNCTION interno.columnas_que_decide(p_tabla text) RETURNS text[]
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE p_tabla
    WHEN 'servicios' THEN ARRAY['etiqueta', 'estado', 'vigente_desde', 'vigente_hasta']
    WHEN 'prestaciones' THEN ARRAY['paciente_id', 'servicio_id', 'tipo_servicio', 'configuracion',
      'precio_lista_id', 'precio_lista_snapshot', 'tipo_descuento', 'valor_descuento', 'precio_final',
      'nota', 'estado', 'moneda', 'vigente_desde', 'vigente_hasta', 'forma_de_precio',
      'sentido_del_ajuste', 'prestacion_anterior_id', 'precio_turno_guardia_adicional',
      'precio_hora_adicional']
    WHEN 'equipo_servicio' THEN ARRAY['servicio_id', 'asistente_id', 'usuario_id', 'situacion',
      'cubre_francos', 'motivo']
    WHEN 'tareas_del_servicio' THEN ARRAY['servicio_id', 'tarea_id', 'tipo_asistente_id']
    WHEN 'series_turnos_guardia' THEN ARRAY['servicio_id', 'asistente_id', 'paciente_id',
      'dias_semana', 'hora_inicio', 'hora_fin', 'modalidad', 'canal_modalidad', 'vigente_desde',
      'vigente_hasta', 'estado', 'cancelacion_origen', 'cancelado_at', 'dias_hasta_el_fin']
    WHEN 'series_turnos_guardia_pacientes' THEN ARRAY['serie_id', 'paciente_id']
    WHEN 'turnos_guardia' THEN ARRAY['servicio_id', 'asistente_id', 'paciente_id', 'serie_id',
      'coordinador_id', 'fecha', 'hora_inicio', 'hora_fin', 'dias_hasta_el_fin', 'modalidad',
      'canal_modalidad', 'estado', 'cancelacion_origen', 'cancelacion_alcance', 'interrupcion_id']
    WHEN 'turno_guardia_pacientes' THEN ARRAY['turno_guardia_id', 'paciente_id']
    WHEN 'asignaciones_de_turno_guardia' THEN ARRAY['turno_guardia_id', 'serie_id', 'ausencia_id',
      'asistente_id', 'asistente_anterior_id', 'estado', 'respondida_at', 'retirada_at', 'retirada_por']
    WHEN 'interrupciones_de_cobertura' THEN ARRAY['tipo', 'alcance', 'servicio_id', 'prestacion_id',
      'serie_id', 'turno_guardia_id', 'paciente_id', 'desde', 'vuelta', 'motivo_id', 'detalle',
      'levantada_desde', 'levantada_at', 'levantada_por']
    WHEN 'turnos_guardia_cobertura' THEN ARRAY['turno_guardia_original_id', 'ausencia_id',
      'cobertura_de_ausencia_id', 'asistente_titular_id', 'asistente_sustituto_id', 'motivo',
      'motivo_detalle', 'costo_adicional', 'moneda']
    WHEN 'coberturas_de_ausencia' THEN ARRAY['ausencia_id', 'serie_id', 'asistente_sustituto_id',
      'motivo', 'motivo_detalle', 'costo_adicional', 'moneda', 'objetada_at', 'aceptada_at']
    ELSE ARRAY[]::text[]
  END
$$;

ALTER FUNCTION interno.columnas_que_decide(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION interno.columnas_que_decide(text) FROM PUBLIC, anon;
GRANT ALL ON FUNCTION interno.columnas_que_decide(text) TO service_role;

-- Qué clase de decisión es cada tabla, y cuál pesa más cuando una decisión toca varias: gana el
-- número más bajo. Asignar a alguien mueve el turno de guardia, pero la decisión es la asignación.
CREATE OR REPLACE FUNCTION interno.clase_de_la_decision(p_tabla text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE p_tabla
    WHEN 'turnos_guardia_cobertura' THEN 'cobertura'
    WHEN 'coberturas_de_ausencia' THEN 'cobertura'
    WHEN 'asignaciones_de_turno_guardia' THEN 'asignacion'
    WHEN 'interrupciones_de_cobertura' THEN 'interrupcion'
    WHEN 'series_turnos_guardia' THEN 'turno_guardia_recurrente'
    WHEN 'series_turnos_guardia_pacientes' THEN 'turno_guardia_recurrente'
    WHEN 'equipo_servicio' THEN 'equipo'
    WHEN 'tareas_del_servicio' THEN 'tareas'
    WHEN 'prestaciones' THEN 'prestacion'
    WHEN 'servicios' THEN 'servicio'
    ELSE 'turno_guardia'
  END
$$;

CREATE OR REPLACE FUNCTION interno.rango_de_la_clase(p_clase text) RETURNS smallint
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT (array_position(ARRAY['cobertura', 'asignacion', 'interrupcion', 'turno_guardia_recurrente',
    'equipo', 'tareas', 'prestacion', 'servicio', 'turno_guardia'], p_clase))::smallint
$$;

ALTER FUNCTION interno.clase_de_la_decision(text) OWNER TO postgres;
ALTER FUNCTION interno.rango_de_la_clase(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION interno.clase_de_la_decision(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.rango_de_la_clase(text) FROM PUBLIC, anon;
GRANT ALL ON FUNCTION interno.clase_de_la_decision(text) TO service_role;
GRANT ALL ON FUNCTION interno.rango_de_la_clase(text) TO service_role;

-- Cómo se reconoce cada fila. Las dos listas de Pacientes no tienen identificador propio: se
-- reconocen por el turno de guardia, o el turno fijo, y el Paciente.
CREATE OR REPLACE FUNCTION interno.clave_de_la_fila(p_tabla text, p_fila jsonb) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE p_tabla
    WHEN 'turno_guardia_pacientes' THEN (p_fila ->> 'turno_guardia_id') || '/' || (p_fila ->> 'paciente_id')
    WHEN 'series_turnos_guardia_pacientes' THEN (p_fila ->> 'serie_id') || '/' || (p_fila ->> 'paciente_id')
    ELSE p_fila ->> 'id'
  END
$$;

-- La condición que encuentra la fila, con la clave como primer parámetro.
CREATE OR REPLACE FUNCTION interno.condicion_de_la_fila(p_tabla text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE p_tabla
    WHEN 'prestaciones' THEN 't.id = $1::bigint'
    WHEN 'turno_guardia_pacientes' THEN
      't.turno_guardia_id = split_part($1, ''/'', 1)::uuid AND t.paciente_id = split_part($1, ''/'', 2)::uuid'
    WHEN 'series_turnos_guardia_pacientes' THEN
      't.serie_id = split_part($1, ''/'', 1)::uuid AND t.paciente_id = split_part($1, ''/'', 2)::uuid'
    ELSE 't.id = $1::uuid'
  END
$$;

ALTER FUNCTION interno.clave_de_la_fila(text, jsonb) OWNER TO postgres;
ALTER FUNCTION interno.condicion_de_la_fila(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION interno.clave_de_la_fila(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.condicion_de_la_fila(text) FROM PUBLIC, anon;
GRANT ALL ON FUNCTION interno.clave_de_la_fila(text, jsonb) TO service_role;
GRANT ALL ON FUNCTION interno.condicion_de_la_fila(text) TO service_role;

-- De qué Servicio es una fila.
CREATE OR REPLACE FUNCTION interno.servicio_de_la_fila(p_tabla text, p_fila jsonb) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'interno'
    AS $$
DECLARE
  v_servicio uuid;
BEGIN
  IF p_fila IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_tabla = 'servicios' THEN
    RETURN (p_fila ->> 'id')::uuid;
  ELSIF p_tabla = 'asignaciones_de_turno_guardia' THEN
    SELECT t.servicio_id INTO v_servicio FROM turnos_guardia t WHERE t.id = (p_fila ->> 'turno_guardia_id')::uuid;
    IF v_servicio IS NULL THEN
      SELECT s.servicio_id INTO v_servicio FROM series_turnos_guardia s WHERE s.id = (p_fila ->> 'serie_id')::uuid;
    END IF;
    RETURN v_servicio;
  ELSIF p_tabla = 'turnos_guardia_cobertura' THEN
    SELECT t.servicio_id INTO v_servicio FROM turnos_guardia t WHERE t.id = (p_fila ->> 'turno_guardia_original_id')::uuid;
    RETURN v_servicio;
  ELSIF p_tabla = 'coberturas_de_ausencia' THEN
    SELECT s.servicio_id INTO v_servicio FROM series_turnos_guardia s WHERE s.id = (p_fila ->> 'serie_id')::uuid;
    IF v_servicio IS NULL THEN
      SELECT t.servicio_id INTO v_servicio
        FROM ausencias a
        JOIN turnos_guardia t ON t.asistente_id = a.asistente_id AND t.prestadora_id = a.prestadora_id
       WHERE a.id = (p_fila ->> 'ausencia_id')::uuid
         AND t.fecha >= a.fecha_inicio
       ORDER BY t.fecha, t.hora_inicio
       LIMIT 1;
    END IF;
    RETURN v_servicio;
  ELSIF p_tabla = 'turno_guardia_pacientes' THEN
    SELECT t.servicio_id INTO v_servicio FROM turnos_guardia t WHERE t.id = (p_fila ->> 'turno_guardia_id')::uuid;
    RETURN v_servicio;
  ELSIF p_tabla = 'series_turnos_guardia_pacientes' THEN
    SELECT s.servicio_id INTO v_servicio FROM series_turnos_guardia s WHERE s.id = (p_fila ->> 'serie_id')::uuid;
    RETURN v_servicio;
  END IF;

  RETURN (p_fila ->> 'servicio_id')::uuid;
END;
$$;

ALTER FUNCTION interno.servicio_de_la_fila(text, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION interno.servicio_de_la_fila(text, jsonb) FROM PUBLIC, anon;
GRANT ALL ON FUNCTION interno.servicio_de_la_fila(text, jsonb) TO service_role;

-- Un turno de guardia ya pasó cuando su día quedó atrás, cuando alguien ya entró, o cuando está
-- en curso o terminado. Eso no lo vuelve atrás ningún veto.
CREATE OR REPLACE FUNCTION interno.el_turno_ya_paso(p_turno uuid, p_hoy date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'interno'
    AS $$
  SELECT coalesce((SELECT t.fecha < p_hoy OR t.checkin_at IS NOT NULL OR t.estado IN ('activa', 'completada', 'ausente')
                     FROM turnos_guardia t WHERE t.id = p_turno), false)
$$;

CREATE OR REPLACE FUNCTION interno.la_fila_ya_paso(p_tabla text, p_fila jsonb, p_hoy date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'interno'
    AS $$
  SELECT CASE
    WHEN p_fila IS NULL THEN false
    WHEN p_tabla = 'turnos_guardia' THEN
      (p_fila ->> 'fecha')::date < p_hoy OR (p_fila ->> 'checkin_at') IS NOT NULL
      OR (p_fila ->> 'estado') IN ('activa', 'completada', 'ausente')
    WHEN p_tabla = 'asignaciones_de_turno_guardia' AND (p_fila ->> 'turno_guardia_id') IS NOT NULL THEN
      interno.el_turno_ya_paso((p_fila ->> 'turno_guardia_id')::uuid, p_hoy)
    WHEN p_tabla = 'turnos_guardia_cobertura' THEN
      interno.el_turno_ya_paso((p_fila ->> 'turno_guardia_original_id')::uuid, p_hoy)
    WHEN p_tabla = 'turno_guardia_pacientes' THEN
      interno.el_turno_ya_paso((p_fila ->> 'turno_guardia_id')::uuid, p_hoy)
    ELSE false
  END
$$;

ALTER FUNCTION interno.el_turno_ya_paso(uuid, date) OWNER TO postgres;
ALTER FUNCTION interno.la_fila_ya_paso(text, jsonb, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION interno.el_turno_ya_paso(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.la_fila_ya_paso(text, jsonb, date) FROM PUBLIC, anon;
GRANT ALL ON FUNCTION interno.el_turno_ya_paso(uuid, date) TO service_role;
GRANT ALL ON FUNCTION interno.la_fila_ya_paso(text, jsonb, date) TO service_role;

-- ---------------------------------------------------------------------------------------------
-- La captura: cada cambio que hace un Coordinador queda anotado en su decisión
-- ---------------------------------------------------------------------------------------------

-- Todo lo que el Coordinador cambia en un mismo pedido es una sola decisión por Servicio. No se
-- anota lo que hace el sistema, lo que hace la administración, lo que deshace un veto, ni lo que
-- se cambia en el mismo pedido en que se anota un hecho.
CREATE OR REPLACE FUNCTION interno.capturar_decision_de_coordinacion() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'interno'
    AS $$
DECLARE
  v_usuario   uuid := auth.uid();
  v_prest     uuid;
  v_columnas  text[];
  v_nueva     jsonb;
  v_vieja     jsonb;
  v_fila      jsonb;
  v_antes     jsonb;
  v_despues   jsonb;
  v_operacion text;
  v_clase     text;
  v_servicio  uuid;
  v_decision  uuid;
  k           text;
BEGIN
  IF v_usuario IS NULL THEN
    RETURN NULL;
  END IF;
  IF coalesce(current_setting('careonys.vetando', true), '') <> ''
     OR coalesce(current_setting('careonys.registrando_un_hecho', true), '') <> '' THEN
    RETURN NULL;
  END IF;
  IF NOT interno.es_coordinador() THEN
    RETURN NULL;
  END IF;

  v_prest := interno.prestadora_actual();
  v_nueva := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  v_vieja := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  v_fila := coalesce(v_nueva, v_vieja);

  IF v_prest IS NULL OR (v_fila ->> 'prestadora_id')::uuid IS DISTINCT FROM v_prest THEN
    RETURN NULL;
  END IF;
  -- La suspensión que nace de una internación es parte del hecho.
  IF TG_TABLE_NAME = 'interrupciones_de_cobertura' AND (v_fila ->> 'hospitalizacion_id') IS NOT NULL THEN
    RETURN NULL;
  END IF;

  v_columnas := interno.columnas_que_decide(TG_TABLE_NAME);

  IF TG_OP = 'UPDATE' THEN
    v_antes := '{}'::jsonb;
    v_despues := '{}'::jsonb;
    FOREACH k IN ARRAY v_columnas LOOP
      IF (v_vieja -> k) IS DISTINCT FROM (v_nueva -> k) THEN
        v_antes := v_antes || jsonb_build_object(k, v_vieja -> k);
        v_despues := v_despues || jsonb_build_object(k, v_nueva -> k);
      END IF;
    END LOOP;
    IF v_antes = '{}'::jsonb THEN
      RETURN NULL;
    END IF;
    v_operacion := 'cambio';
  ELSIF TG_OP = 'INSERT' THEN
    v_antes := NULL;
    v_despues := '{}'::jsonb;
    FOREACH k IN ARRAY v_columnas || ARRAY['id'] LOOP
      IF v_nueva ? k THEN
        v_despues := v_despues || jsonb_build_object(k, v_nueva -> k);
      END IF;
    END LOOP;
    v_operacion := 'alta';
  ELSE
    v_antes := v_vieja;
    v_despues := NULL;
    v_operacion := 'baja';
  END IF;

  v_clase := interno.clase_de_la_decision(TG_TABLE_NAME);
  v_servicio := interno.servicio_de_la_fila(TG_TABLE_NAME, v_fila);

  INSERT INTO decisiones_de_coordinacion (prestadora_id, servicio_id, clase, rango, transaccion, decidida_por)
  VALUES (v_prest, v_servicio, v_clase, interno.rango_de_la_clase(v_clase), txid_current(), v_usuario)
  ON CONFLICT (prestadora_id, transaccion, (COALESCE(servicio_id, '00000000-0000-0000-0000-000000000000'::uuid)), decidida_por)
  DO UPDATE SET
    clase = CASE WHEN EXCLUDED.rango < decisiones_de_coordinacion.rango THEN EXCLUDED.clase ELSE decisiones_de_coordinacion.clase END,
    rango = LEAST(EXCLUDED.rango, decisiones_de_coordinacion.rango)
  RETURNING id INTO v_decision;

  INSERT INTO cambios_de_la_decision (prestadora_id, decision_id, tabla, fila_id, operacion, antes, despues)
  VALUES (v_prest, v_decision, TG_TABLE_NAME, interno.clave_de_la_fila(TG_TABLE_NAME, v_fila), v_operacion, v_antes, v_despues);

  RETURN NULL;
END;
$$;

ALTER FUNCTION interno.capturar_decision_de_coordinacion() OWNER TO postgres;
REVOKE ALL ON FUNCTION interno.capturar_decision_de_coordinacion() FROM PUBLIC, anon;
GRANT ALL ON FUNCTION interno.capturar_decision_de_coordinacion() TO service_role;
GRANT ALL ON FUNCTION interno.capturar_decision_de_coordinacion() TO authenticated;
GRANT ALL ON FUNCTION interno.capturar_decision_de_coordinacion() TO trabajo_sin_persona;

CREATE TRIGGER anota_la_decision_del_coordinador AFTER INSERT OR UPDATE OR DELETE ON public.servicios
  FOR EACH ROW EXECUTE FUNCTION interno.capturar_decision_de_coordinacion();
CREATE TRIGGER anota_la_decision_del_coordinador AFTER INSERT OR UPDATE OR DELETE ON public.prestaciones
  FOR EACH ROW EXECUTE FUNCTION interno.capturar_decision_de_coordinacion();
CREATE TRIGGER anota_la_decision_del_coordinador AFTER INSERT OR UPDATE OR DELETE ON public.equipo_servicio
  FOR EACH ROW EXECUTE FUNCTION interno.capturar_decision_de_coordinacion();
CREATE TRIGGER anota_la_decision_del_coordinador AFTER INSERT OR UPDATE OR DELETE ON public.tareas_del_servicio
  FOR EACH ROW EXECUTE FUNCTION interno.capturar_decision_de_coordinacion();
CREATE TRIGGER anota_la_decision_del_coordinador AFTER INSERT OR UPDATE OR DELETE ON public.series_turnos_guardia
  FOR EACH ROW EXECUTE FUNCTION interno.capturar_decision_de_coordinacion();
CREATE TRIGGER anota_la_decision_del_coordinador AFTER INSERT OR UPDATE OR DELETE ON public.series_turnos_guardia_pacientes
  FOR EACH ROW EXECUTE FUNCTION interno.capturar_decision_de_coordinacion();
CREATE TRIGGER anota_la_decision_del_coordinador AFTER INSERT OR UPDATE OR DELETE ON public.turnos_guardia
  FOR EACH ROW EXECUTE FUNCTION interno.capturar_decision_de_coordinacion();
CREATE TRIGGER anota_la_decision_del_coordinador AFTER INSERT OR UPDATE OR DELETE ON public.turno_guardia_pacientes
  FOR EACH ROW EXECUTE FUNCTION interno.capturar_decision_de_coordinacion();
CREATE TRIGGER anota_la_decision_del_coordinador AFTER INSERT OR UPDATE OR DELETE ON public.asignaciones_de_turno_guardia
  FOR EACH ROW EXECUTE FUNCTION interno.capturar_decision_de_coordinacion();
CREATE TRIGGER anota_la_decision_del_coordinador AFTER INSERT OR UPDATE OR DELETE ON public.interrupciones_de_cobertura
  FOR EACH ROW EXECUTE FUNCTION interno.capturar_decision_de_coordinacion();
CREATE TRIGGER anota_la_decision_del_coordinador AFTER INSERT OR UPDATE OR DELETE ON public.turnos_guardia_cobertura
  FOR EACH ROW EXECUTE FUNCTION interno.capturar_decision_de_coordinacion();
CREATE TRIGGER anota_la_decision_del_coordinador AFTER INSERT OR UPDATE OR DELETE ON public.coberturas_de_ausencia
  FOR EACH ROW EXECUTE FUNCTION interno.capturar_decision_de_coordinacion();

-- Anotar un hecho no es decidir: lo que cambia en el mismo pedido es parte del hecho.
CREATE OR REPLACE FUNCTION interno.marcar_que_se_registra_un_hecho() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'interno'
    AS $$
BEGIN
  PERFORM set_config('careonys.registrando_un_hecho', 'si', true);
  RETURN NEW;
END;
$$;

ALTER FUNCTION interno.marcar_que_se_registra_un_hecho() OWNER TO postgres;
REVOKE ALL ON FUNCTION interno.marcar_que_se_registra_un_hecho() FROM PUBLIC, anon;
GRANT ALL ON FUNCTION interno.marcar_que_se_registra_un_hecho() TO service_role;
GRANT ALL ON FUNCTION interno.marcar_que_se_registra_un_hecho() TO authenticated;
GRANT ALL ON FUNCTION interno.marcar_que_se_registra_un_hecho() TO trabajo_sin_persona;

CREATE TRIGGER se_registra_un_hecho BEFORE INSERT OR UPDATE ON public.hospitalizaciones_paciente
  FOR EACH ROW EXECUTE FUNCTION interno.marcar_que_se_registra_un_hecho();
CREATE TRIGGER se_registra_un_hecho BEFORE INSERT OR UPDATE ON public.ausencias
  FOR EACH ROW EXECUTE FUNCTION interno.marcar_que_se_registra_un_hecho();
CREATE TRIGGER se_registra_un_hecho BEFORE INSERT OR UPDATE ON public.emergencias_turno_guardia
  FOR EACH ROW EXECUTE FUNCTION interno.marcar_que_se_registra_un_hecho();
CREATE TRIGGER se_registra_un_hecho BEFORE INSERT OR UPDATE ON public.alertas
  FOR EACH ROW EXECUTE FUNCTION interno.marcar_que_se_registra_un_hecho();

-- ---------------------------------------------------------------------------------------------
-- La asignación deja pasar lo que deshace un veto
-- ---------------------------------------------------------------------------------------------

-- El veto devuelve una asignación a como estaba, con sus fechas. Es lo único que puede volver
-- atrás una asignación ya contestada o retirada, y lo hace con todas sus columnas juntas.
CREATE OR REPLACE FUNCTION interno.la_asignacion_cambia_de_estado() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'interno'
    AS $$
BEGIN
  IF coalesce(current_setting('careonys.vetando', true), '') <> '' THEN
    RETURN NEW;
  END IF;

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
     OR NEW.turno_guardia_id IS DISTINCT FROM OLD.turno_guardia_id
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
$$;

-- ---------------------------------------------------------------------------------------------
-- El veto
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.vetar_decision(p_decision uuid, p_motivo text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'interno'
    AS $$
DECLARE
  v_prest        uuid := interno.prestadora_actual();
  v_usuario      uuid := interno.usuario_de_la_sesion();
  v_decision     decisiones_de_coordinacion;
  v_hoy          date;
  v_nuevos       uuid[];
  v_foto         jsonb;
  v_fila         record;
  v_cambio       record;
  v_merge        jsonb;
  v_ultima       text;
  v_ultimo_antes jsonb;
  v_actual       jsonb;
  v_cond         text;
  v_sets         text;
  v_cols         text;
  v_cols_r       text;
  v_turno        record;
  v_asig         record;
  v_constancia   record;
  v_t            record;
  k              text;
  v_saltear      boolean;
  v_retirados    jsonb := '[]'::jsonb;
  v_devueltas    jsonb := '[]'::jsonb;
  v_retiradas    jsonb := '[]'::jsonb;
  v_deshechos    integer := 0;
  v_salteados    integer := 0;
  v_quedan       boolean;
BEGIN
  IF v_prest IS NULL OR v_usuario IS NULL OR NOT interno.es_admin_prestadora() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_decision
    FROM decisiones_de_coordinacion d
   WHERE d.id = p_decision AND d.prestadora_id = v_prest
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'decision_inexistente' USING ERRCODE = 'P0002';
  END IF;
  IF v_decision.vetada_at IS NOT NULL THEN
    RAISE EXCEPTION 'decision_ya_vetada' USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('careonys.vetando', 'si', true);
  v_hoy := interno.hoy_de_la_prestadora(v_prest);

  -- Quiénes recibieron algo en esta decisión: si después aceptaron, el turno quedó a su nombre, y
  -- eso es consecuencia de la decisión, no un cambio posterior.
  SELECT coalesce(array_agg(DISTINCT (c.despues ->> 'asistente_id')::uuid), ARRAY[]::uuid[])
    INTO v_nuevos
    FROM cambios_de_la_decision c
   WHERE c.decision_id = p_decision
     AND c.tabla = 'asignaciones_de_turno_guardia'
     AND c.operacion = 'alta';

  -- Cómo están hoy los turnos de guardia que vienen, para saber al final a quién avisarle.
  SELECT coalesce(jsonb_object_agg(t.id::text, jsonb_build_object(
           'asistente_id', t.asistente_id, 'estado', t.estado, 'fecha', t.fecha,
           'hora_inicio', t.hora_inicio, 'hora_fin', t.hora_fin)), '{}'::jsonb)
    INTO v_foto
    FROM turnos_guardia t
   WHERE t.prestadora_id = v_prest
     AND t.fecha >= v_hoy
     AND t.checkin_at IS NULL
     AND (v_decision.servicio_id IS NULL OR t.servicio_id = v_decision.servicio_id);

  -- Primera vuelta: que nada de lo que tocó la decisión haya cambiado después.
  FOR v_fila IN
    SELECT c.tabla, c.fila_id FROM cambios_de_la_decision c
     WHERE c.decision_id = p_decision
     GROUP BY c.tabla, c.fila_id
  LOOP
    v_merge := NULL;
    v_ultima := NULL;
    v_ultimo_antes := NULL;
    FOR v_cambio IN
      SELECT c.operacion, c.antes, c.despues FROM cambios_de_la_decision c
       WHERE c.decision_id = p_decision AND c.tabla = v_fila.tabla AND c.fila_id = v_fila.fila_id
       ORDER BY c.orden
    LOOP
      v_ultima := v_cambio.operacion;
      IF v_cambio.operacion = 'baja' THEN
        v_merge := NULL;
        v_ultimo_antes := v_cambio.antes;
      ELSE
        v_merge := coalesce(v_merge, '{}'::jsonb) || v_cambio.despues;
      END IF;
    END LOOP;

    v_cond := interno.condicion_de_la_fila(v_fila.tabla);
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE ' || v_cond, v_fila.tabla)
      INTO v_actual USING v_fila.fila_id;

    IF interno.la_fila_ya_paso(v_fila.tabla, coalesce(v_actual, v_ultimo_antes), v_hoy) THEN
      CONTINUE;
    END IF;

    IF v_ultima = 'baja' THEN
      IF v_actual IS NOT NULL THEN
        RAISE EXCEPTION 'decision_cambiada_despues' USING ERRCODE = 'P0001';
      END IF;
      CONTINUE;
    END IF;

    IF v_actual IS NULL THEN
      RAISE EXCEPTION 'decision_cambiada_despues' USING ERRCODE = 'P0001';
    END IF;

    FOR k IN SELECT jsonb_object_keys(v_merge) LOOP
      v_saltear := k = 'id'
        OR (v_fila.tabla = 'asignaciones_de_turno_guardia' AND k IN ('estado', 'respondida_at', 'retirada_at', 'retirada_por'))
        OR (v_fila.tabla IN ('turnos_guardia', 'series_turnos_guardia') AND k = 'asistente_id'
            AND (v_actual ->> 'asistente_id')::uuid = ANY (v_nuevos));
      IF NOT v_saltear AND (v_actual -> k) IS DISTINCT FROM (v_merge -> k) THEN
        RAISE EXCEPTION 'decision_cambiada_despues' USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
  END LOOP;

  -- Segunda vuelta: deshacer, del último cambio al primero.
  FOR v_cambio IN
    SELECT c.* FROM cambios_de_la_decision c
     WHERE c.decision_id = p_decision
     ORDER BY c.orden DESC
  LOOP
    v_cond := interno.condicion_de_la_fila(v_cambio.tabla);
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE ' || v_cond, v_cambio.tabla)
      INTO v_actual USING v_cambio.fila_id;

    IF interno.la_fila_ya_paso(v_cambio.tabla, coalesce(v_actual, v_cambio.antes, v_cambio.despues), v_hoy) THEN
      v_salteados := v_salteados + 1;
      CONTINUE;
    END IF;

    BEGIN
      IF v_cambio.operacion = 'cambio' THEN
        IF v_actual IS NULL THEN
          v_salteados := v_salteados + 1;
          CONTINUE;
        END IF;
        SELECT string_agg(format('%I = r.%I', x, x), ', ') INTO v_sets
          FROM jsonb_object_keys(v_cambio.antes) x WHERE x <> 'id';
        IF v_sets IS NOT NULL THEN
          EXECUTE format('UPDATE public.%I AS t SET %s FROM jsonb_populate_record(NULL::public.%I, $2) AS r WHERE ' || v_cond,
                         v_cambio.tabla, v_sets, v_cambio.tabla)
            USING v_cambio.fila_id, v_cambio.antes;
          v_deshechos := v_deshechos + 1;
        END IF;
        IF v_cambio.tabla = 'asignaciones_de_turno_guardia' AND (v_cambio.antes ->> 'estado') = 'sin_responder' THEN
          v_devueltas := v_devueltas || jsonb_build_array(jsonb_build_object(
            'asignacion_id', v_actual ->> 'id', 'asistente_id', v_actual ->> 'asistente_id',
            'turno_guardia_id', v_actual ->> 'turno_guardia_id', 'serie_id', v_actual ->> 'serie_id',
            'ausencia_id', v_actual ->> 'ausencia_id'));
        END IF;

      ELSIF v_cambio.operacion = 'baja' THEN
        SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum),
               string_agg('r.' || quote_ident(a.attname), ', ' ORDER BY a.attnum)
          INTO v_cols, v_cols_r
          FROM pg_attribute a
         WHERE a.attrelid = ('public.' || quote_ident(v_cambio.tabla))::regclass
           AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
           AND v_cambio.antes ? a.attname;
        EXECUTE format('INSERT INTO public.%I (%s) OVERRIDING SYSTEM VALUE SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1) AS r',
                       v_cambio.tabla, v_cols, v_cols_r, v_cambio.tabla)
          USING v_cambio.antes;
        v_deshechos := v_deshechos + 1;

      ELSIF v_actual IS NULL THEN
        -- Un alta que ya no está: no queda nada que deshacer.
        v_salteados := v_salteados + 1;

      ELSIF v_cambio.tabla = 'turnos_guardia' THEN
        UPDATE turnos_guardia t
           SET estado = 'cancelada', cancelacion_origen = 'prestadora', cancelacion_alcance = 'turno_guardia', interrupcion_id = NULL
         WHERE t.id = (v_actual ->> 'id')::uuid AND t.checkin_at IS NULL AND t.estado IN ('programada', 'pausada', 'suspendida');
        v_deshechos := v_deshechos + 1;

      ELSIF v_cambio.tabla = 'series_turnos_guardia' THEN
        IF (v_actual ->> 'vigente_desde')::date >= v_hoy THEN
          UPDATE series_turnos_guardia s
             SET estado = 'cancelada', cancelacion_origen = 'prestadora', cancelado_at = now()
           WHERE s.id = (v_actual ->> 'id')::uuid AND s.estado <> 'cancelada';
        ELSE
          UPDATE series_turnos_guardia s
             SET vigente_hasta = LEAST(coalesce(s.vigente_hasta, v_hoy - 1), v_hoy - 1)
           WHERE s.id = (v_actual ->> 'id')::uuid;
        END IF;
        UPDATE turnos_guardia t
           SET estado = 'cancelada', cancelacion_origen = 'prestadora', cancelacion_alcance = 'turno_guardia_recurrente', interrupcion_id = NULL
         WHERE t.serie_id = (v_actual ->> 'id')::uuid AND t.prestadora_id = v_prest AND t.fecha >= v_hoy
           AND t.checkin_at IS NULL AND t.estado IN ('programada', 'pausada', 'suspendida');
        FOR v_asig IN
          UPDATE asignaciones_de_turno_guardia a
             SET estado = 'retirada', retirada_at = now(), retirada_por = v_usuario
           WHERE a.serie_id = (v_actual ->> 'id')::uuid AND a.estado = 'sin_responder'
          RETURNING a.id, a.asistente_id, a.turno_guardia_id, a.serie_id, a.ausencia_id
        LOOP
          v_retiradas := v_retiradas || jsonb_build_array(to_jsonb(v_asig));
        END LOOP;
        v_deshechos := v_deshechos + 1;

      ELSIF v_cambio.tabla = 'asignaciones_de_turno_guardia' THEN
        IF (v_actual ->> 'estado') = 'sin_responder' THEN
          UPDATE asignaciones_de_turno_guardia a
             SET estado = 'retirada', retirada_at = now(), retirada_por = v_usuario
           WHERE a.id = (v_actual ->> 'id')::uuid;
          v_retiradas := v_retiradas || jsonb_build_array(jsonb_build_object(
            'id', v_actual ->> 'id', 'asistente_id', v_actual ->> 'asistente_id',
            'turno_guardia_id', v_actual ->> 'turno_guardia_id', 'serie_id', v_actual ->> 'serie_id',
            'ausencia_id', v_actual ->> 'ausencia_id'));
        ELSIF (v_actual ->> 'estado') = 'aceptada' THEN
          -- La asignación aceptada queda como constancia de que la aceptó. Lo que vuelve es el
          -- turno de guardia, a quien lo tenía antes.
          IF (v_actual ->> 'turno_guardia_id') IS NOT NULL THEN
            UPDATE turnos_guardia t
               SET asistente_id = (v_actual ->> 'asistente_anterior_id')::uuid
             WHERE t.id = (v_actual ->> 'turno_guardia_id')::uuid
               AND t.asistente_id = (v_actual ->> 'asistente_id')::uuid
               AND t.fecha >= v_hoy AND t.checkin_at IS NULL
               AND t.estado IN ('programada', 'pausada', 'suspendida');
          ELSIF (v_actual ->> 'serie_id') IS NOT NULL THEN
            UPDATE series_turnos_guardia s
               SET asistente_id = (v_actual ->> 'asistente_anterior_id')::uuid
             WHERE s.id = (v_actual ->> 'serie_id')::uuid
               AND s.asistente_id = (v_actual ->> 'asistente_id')::uuid;
            UPDATE turnos_guardia t
               SET asistente_id = (v_actual ->> 'asistente_anterior_id')::uuid
             WHERE t.serie_id = (v_actual ->> 'serie_id')::uuid
               AND t.prestadora_id = v_prest
               AND t.asistente_id = (v_actual ->> 'asistente_id')::uuid
               AND t.fecha >= v_hoy AND t.checkin_at IS NULL
               AND t.estado IN ('programada', 'pausada', 'suspendida');
          END IF;
        END IF;
        v_deshechos := v_deshechos + 1;

      ELSIF v_cambio.tabla = 'turnos_guardia_cobertura' THEN
        UPDATE turnos_guardia t
           SET asistente_id = (v_actual ->> 'asistente_titular_id')::uuid
         WHERE t.id = (v_actual ->> 'turno_guardia_original_id')::uuid
           AND t.asistente_id = (v_actual ->> 'asistente_sustituto_id')::uuid
           AND t.checkin_at IS NULL AND t.estado IN ('programada', 'pausada', 'suspendida');
        DELETE FROM turnos_guardia_cobertura c WHERE c.id = (v_actual ->> 'id')::uuid;
        v_deshechos := v_deshechos + 1;

      ELSIF v_cambio.tabla = 'coberturas_de_ausencia' THEN
        FOR v_constancia IN
          SELECT c.id, c.turno_guardia_original_id, c.asistente_titular_id, c.asistente_sustituto_id
            FROM turnos_guardia_cobertura c
           WHERE c.cobertura_de_ausencia_id = (v_actual ->> 'id')::uuid
        LOOP
          IF NOT interno.el_turno_ya_paso(v_constancia.turno_guardia_original_id, v_hoy) THEN
            UPDATE turnos_guardia t
               SET asistente_id = v_constancia.asistente_titular_id
             WHERE t.id = v_constancia.turno_guardia_original_id
               AND t.asistente_id = v_constancia.asistente_sustituto_id
               AND t.estado IN ('programada', 'pausada', 'suspendida');
            DELETE FROM turnos_guardia_cobertura c WHERE c.id = v_constancia.id;
          END IF;
        END LOOP;

        SELECT EXISTS (SELECT 1 FROM turnos_guardia_cobertura c WHERE c.cobertura_de_ausencia_id = (v_actual ->> 'id')::uuid)
          INTO v_quedan;
        IF v_quedan THEN
          -- Ya cubrió días que pasaron: esos quedan, y la cobertura deja de extenderse.
          UPDATE coberturas_de_ausencia c SET objetada_at = now()
           WHERE c.id = (v_actual ->> 'id')::uuid AND c.objetada_at IS NULL;
        ELSE
          DELETE FROM coberturas_de_ausencia c WHERE c.id = (v_actual ->> 'id')::uuid;
        END IF;

        FOR v_asig IN
          UPDATE asignaciones_de_turno_guardia a
             SET estado = 'retirada', retirada_at = now(), retirada_por = v_usuario
           WHERE a.ausencia_id = (v_actual ->> 'ausencia_id')::uuid
             AND a.asistente_id = (v_actual ->> 'asistente_sustituto_id')::uuid
             AND a.estado = 'sin_responder'
             AND NOT EXISTS (
               SELECT 1 FROM coberturas_de_ausencia o
                WHERE o.ausencia_id = a.ausencia_id
                  AND o.asistente_sustituto_id = a.asistente_id
                  AND o.objetada_at IS NULL
                  AND o.id <> (v_actual ->> 'id')::uuid)
          RETURNING a.id, a.asistente_id, a.turno_guardia_id, a.serie_id, a.ausencia_id
        LOOP
          v_retiradas := v_retiradas || jsonb_build_array(to_jsonb(v_asig));
        END LOOP;
        v_deshechos := v_deshechos + 1;

      ELSIF v_cambio.tabla IN ('turno_guardia_pacientes', 'series_turnos_guardia_pacientes') THEN
        -- Si el turno de guardia o el turno fijo también nació en esta decisión, se lo cancela
        -- entero y su lista de Pacientes queda como constancia.
        IF EXISTS (
          SELECT 1 FROM cambios_de_la_decision o
           WHERE o.decision_id = p_decision AND o.operacion = 'alta'
             AND o.tabla = CASE v_cambio.tabla WHEN 'turno_guardia_pacientes' THEN 'turnos_guardia' ELSE 'series_turnos_guardia' END
             AND o.fila_id = split_part(v_cambio.fila_id, '/', 1)) THEN
          v_salteados := v_salteados + 1;
        ELSE
          EXECUTE format('DELETE FROM public.%I AS t WHERE ' || v_cond, v_cambio.tabla) USING v_cambio.fila_id;
          v_deshechos := v_deshechos + 1;
        END IF;

      ELSIF v_cambio.tabla IN ('equipo_servicio', 'tareas_del_servicio') THEN
        EXECUTE format('DELETE FROM public.%I AS t WHERE ' || v_cond, v_cambio.tabla) USING v_cambio.fila_id;
        v_deshechos := v_deshechos + 1;

      ELSIF v_cambio.tabla = 'interrupciones_de_cobertura' THEN
        UPDATE interrupciones_de_cobertura i
           SET levantada_desde = GREATEST(i.desde, v_hoy), levantada_at = now(), levantada_por = v_usuario
         WHERE i.id = (v_actual ->> 'id')::uuid AND i.levantada_at IS NULL;
        v_deshechos := v_deshechos + 1;

      ELSIF v_cambio.tabla = 'prestaciones' THEN
        IF (v_actual ->> 'vigente_desde')::date >= v_hoy THEN
          UPDATE prestaciones p SET estado = 'de_baja', vigente_hasta = p.vigente_desde
           WHERE p.id = (v_actual ->> 'id')::bigint AND p.estado = 'vigente';
        ELSE
          UPDATE prestaciones p SET vigente_hasta = LEAST(coalesce(p.vigente_hasta, v_hoy - 1), v_hoy - 1)
           WHERE p.id = (v_actual ->> 'id')::bigint AND p.estado = 'vigente';
        END IF;
        v_deshechos := v_deshechos + 1;

      ELSE
        -- Un Servicio dado de alta no se deshace con un veto: se da de baja.
        v_salteados := v_salteados + 1;
      END IF;
    EXCEPTION
      WHEN unique_violation OR foreign_key_violation THEN
        RAISE EXCEPTION 'decision_cambiada_despues' USING ERRCODE = 'P0001';
    END;
  END LOOP;

  IF v_decision.servicio_id IS NOT NULL THEN
    PERFORM interno.marcar_turnos_interrumpidos(v_decision.servicio_id, v_hoy);
  END IF;

  -- Lo que cambió en los turnos de guardia que vienen: a quién se le retiró uno, a quién se le
  -- devolvió, y cuál quedó sin nadie.
  FOR v_t IN
    SELECT t.id, t.asistente_id, t.estado, f.value AS antes
      FROM jsonb_each(v_foto) f
      JOIN turnos_guardia t ON t.id = f.key::uuid
  LOOP
    IF (v_t.antes ->> 'asistente_id') IS NOT NULL
       AND (v_t.asistente_id IS DISTINCT FROM (v_t.antes ->> 'asistente_id')::uuid
            OR (v_t.estado = 'cancelada' AND (v_t.antes ->> 'estado') <> 'cancelada')) THEN
      v_retirados := v_retirados || jsonb_build_array(jsonb_build_object(
        'turno_guardia_id', v_t.id, 'asistente_id', v_t.antes ->> 'asistente_id',
        'fecha', v_t.antes ->> 'fecha', 'hora_inicio', v_t.antes ->> 'hora_inicio',
        'hora_fin', v_t.antes ->> 'hora_fin'));
    END IF;

    IF v_t.asistente_id IS NOT NULL AND v_t.asistente_id IS DISTINCT FROM (v_t.antes ->> 'asistente_id')::uuid THEN
      UPDATE turnos_guardia t SET push_asignacion_enviado_at = NULL WHERE t.id = v_t.id;
    END IF;

    IF v_t.estado = 'cancelada' AND (v_t.antes ->> 'estado') <> 'cancelada' THEN
      FOR v_asig IN
        UPDATE asignaciones_de_turno_guardia a
           SET estado = 'retirada', retirada_at = now(), retirada_por = v_usuario
         WHERE a.turno_guardia_id = v_t.id AND a.estado = 'sin_responder'
        RETURNING a.id, a.asistente_id, a.turno_guardia_id, a.serie_id, a.ausencia_id
      LOOP
        v_retiradas := v_retiradas || jsonb_build_array(to_jsonb(v_asig));
      END LOOP;
    END IF;

    IF v_t.estado = 'programada' AND v_t.asistente_id IS NULL AND (v_t.antes ->> 'asistente_id') IS NOT NULL THEN
      INSERT INTO incidentes_turno_guardia_sin_cubrir (prestadora_id, turno_guardia_id)
      VALUES (v_prest, v_t.id)
      ON CONFLICT (turno_guardia_id) WHERE resuelto_at IS NULL DO NOTHING;
    END IF;
  END LOOP;

  PERFORM interno.anotar_turnos_sin_cubrir();

  UPDATE decisiones_de_coordinacion d
     SET vetada_at = now(), vetada_por = v_usuario, motivo_del_veto = btrim(p_motivo)
   WHERE d.id = p_decision;

  INSERT INTO registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, campos_cambiados, detalle)
  VALUES (v_prest, v_usuario, 'veto_de_decision_de_coordinacion', 'decisiones_de_coordinacion', p_decision,
          ARRAY['vetada_at', 'motivo_del_veto'],
          jsonb_build_object('servicio_id', v_decision.servicio_id, 'renglones', v_deshechos));

  RETURN jsonb_build_object(
    'servicio_id', v_decision.servicio_id,
    'decidida_por', v_decision.decidida_por,
    'decidida_at', v_decision.decidida_at,
    'clase', v_decision.clase,
    'turnos_retirados', v_retirados,
    'asignaciones_devueltas', v_devueltas,
    'asignaciones_retiradas', v_retiradas,
    'deshechos', v_deshechos,
    'salteados', v_salteados);
END;
$$;

ALTER FUNCTION public.vetar_decision(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.vetar_decision(uuid, text) FROM PUBLIC, anon;
GRANT ALL ON FUNCTION public.vetar_decision(uuid, text) TO authenticated;
GRANT ALL ON FUNCTION public.vetar_decision(uuid, text) TO service_role;

-- El Coordinador marca como visto el veto de una decisión suya.
CREATE OR REPLACE FUNCTION public.marcar_veto_visto(p_decision uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'interno'
    AS $$
DECLARE
  v_prest   uuid := interno.prestadora_actual();
  v_usuario uuid := interno.usuario_de_la_sesion();
BEGIN
  IF v_prest IS NULL OR v_usuario IS NULL THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  UPDATE decisiones_de_coordinacion d
     SET vista_por_el_coordinador_at = now()
   WHERE d.id = p_decision
     AND d.prestadora_id = v_prest
     AND d.decidida_por = v_usuario
     AND d.vetada_at IS NOT NULL
     AND d.vista_por_el_coordinador_at IS NULL;
  RETURN FOUND;
END;
$$;

ALTER FUNCTION public.marcar_veto_visto(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.marcar_veto_visto(uuid) FROM PUBLIC, anon;
GRANT ALL ON FUNCTION public.marcar_veto_visto(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.marcar_veto_visto(uuid) TO service_role;

-- ---------------------------------------------------------------------------------------------
-- Cubrir un turno de guardia con un sustituto, en una sola operación
-- ---------------------------------------------------------------------------------------------

-- Anota a quién le tocaba el turno de guardia y por qué lo hace otro, y lo pasa a nombre del
-- sustituto. Las dos cosas juntas, o ninguna.
CREATE OR REPLACE FUNCTION public.cubrir_turno_guardia_con_sustituto(
  p_turno_guardia uuid,
  p_asistente_sustituto uuid,
  p_ausencia uuid DEFAULT NULL,
  p_cobertura_de_ausencia uuid DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_motivo_detalle text DEFAULT NULL,
  p_costo_adicional numeric DEFAULT NULL
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'interno'
    AS $$
DECLARE
  v_prest      uuid := interno.prestadora_actual();
  v_turno      turnos_guardia;
  v_constancia uuid;
BEGIN
  IF v_prest IS NULL THEN
    RAISE EXCEPTION 'turno_guardia_no_encontrado';
  END IF;

  SELECT * INTO v_turno FROM turnos_guardia t
   WHERE t.id = p_turno_guardia AND t.prestadora_id = v_prest
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'turno_guardia_no_encontrado';
  END IF;

  IF coalesce(auth.jwt() ->> 'role', '') <> 'trabajo_sin_persona'
     AND NOT interno.puede_gestionar_la_cobertura(v_turno.servicio_id) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;

  IF p_asistente_sustituto IS NULL
     OR NOT EXISTS (SELECT 1 FROM asistentes a WHERE a.id = p_asistente_sustituto AND a.prestadora_id = v_prest) THEN
    RAISE EXCEPTION 'asistente_no_encontrado';
  END IF;
  IF p_asistente_sustituto IS NOT DISTINCT FROM v_turno.asistente_id THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO turnos_guardia_cobertura (
    prestadora_id, ausencia_id, cobertura_de_ausencia_id, turno_guardia_original_id,
    asistente_titular_id, asistente_sustituto_id, motivo, motivo_detalle, costo_adicional)
  VALUES (
    v_prest, p_ausencia, p_cobertura_de_ausencia, v_turno.id,
    v_turno.asistente_id, p_asistente_sustituto, p_motivo, p_motivo_detalle, p_costo_adicional)
  RETURNING id INTO v_constancia;

  UPDATE turnos_guardia t SET asistente_id = p_asistente_sustituto
   WHERE t.id = v_turno.id AND t.prestadora_id = v_prest;

  RETURN v_constancia;
END;
$$;

ALTER FUNCTION public.cubrir_turno_guardia_con_sustituto(uuid, uuid, uuid, uuid, text, text, numeric) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cubrir_turno_guardia_con_sustituto(uuid, uuid, uuid, uuid, text, text, numeric) FROM PUBLIC, anon;
GRANT ALL ON FUNCTION public.cubrir_turno_guardia_con_sustituto(uuid, uuid, uuid, uuid, text, text, numeric) TO authenticated;
GRANT ALL ON FUNCTION public.cubrir_turno_guardia_con_sustituto(uuid, uuid, uuid, uuid, text, text, numeric) TO service_role;
GRANT ALL ON FUNCTION public.cubrir_turno_guardia_con_sustituto(uuid, uuid, uuid, uuid, text, text, numeric) TO trabajo_sin_persona;

-- ---------------------------------------------------------------------------------------------
-- Registro de actividad y mensajes
-- ---------------------------------------------------------------------------------------------

INSERT INTO public.catalogo_acciones_registradas (accion, grupo, orden, la_hace_el_sistema)
SELECT v.accion, 'modificacion_critica', (SELECT max(orden) FROM public.catalogo_acciones_registradas) + v.n, false
  FROM (VALUES ('veto_de_decision_de_coordinacion', 1)) AS v(accion, n);

INSERT INTO public.mensajes_del_sistema (clave, i18n, admite_texto_propio, activo) VALUES
  ('veto_de_decision.asunto', '{"es-AR": "Decisión vetada", "en": "Decision vetoed", "pt-BR": "Decisão vetada"}'::jsonb, true, true),
  ('veto_de_decision.texto', '{"es-AR": "La administración vetó la decisión que usted tomó el {{fecha}} en el Servicio {{servicio}}. Motivo: {{motivo}}. Revise el Servicio en el Panel.", "en": "The administration vetoed the decision you made on {{fecha}} in the Service {{servicio}}. Reason: {{motivo}}. Review the Service in the Panel.", "pt-BR": "A administração vetou a decisão que você tomou em {{fecha}} no Serviço {{servicio}}. Motivo: {{motivo}}. Revise o Serviço no Painel."}'::jsonb, true, true);

COMMIT;

NOTIFY pgrst, 'reload schema';
