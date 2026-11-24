-- La salida sin Reporte Diario.
--
-- El relevo lee con la ubicación el código del Asistente que sale y toma el turno de guardia,
-- aunque el que sale todavía no haya presentado el Reporte Diario. La hora de esa lectura es la
-- hora de salida del que sale.
--
-- Si el que sale ya presentó el Reporte Diario, su turno de guardia queda completado. Si no, queda
-- en un estado propio, «Salida sin Reporte Diario». Mientras está así, sus horas no se le
-- liquidan. Cuando el reporte llega, el turno de guardia pasa a completado y conserva la hora de
-- salida que ya tenía.
--
-- La falta queda anotada para siempre en el turno de guardia: que salió sin el reporte, y cuándo
-- llegó el reporte. Con eso el Legajo del Asistente arma su lista de faltas, y ninguna de las dos
-- marcas se borra cuando el turno de guardia pasa a completado.

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- El estado nuevo
-- ---------------------------------------------------------------------------------------------

ALTER TABLE public.turnos_guardia DROP CONSTRAINT turnos_guardia_estado_check;
ALTER TABLE public.turnos_guardia ADD CONSTRAINT turnos_guardia_estado_check
  CHECK (estado = ANY (ARRAY['programada'::text, 'activa'::text, 'completada'::text, 'cancelada'::text,
                             'ausente'::text, 'pausada'::text, 'suspendida'::text, 'salida_sin_reporte'::text]));

-- ---------------------------------------------------------------------------------------------
-- La falta, anotada en el turno de guardia
-- ---------------------------------------------------------------------------------------------

ALTER TABLE public.turnos_guardia
  ADD COLUMN salio_sin_reporte_diario boolean DEFAULT false NOT NULL,
  ADD COLUMN reporte_diario_llego_at timestamp with time zone;

COMMENT ON COLUMN public.turnos_guardia.salio_sin_reporte_diario IS
  'Verdadero si el Asistente salió del turno de guardia sin haber presentado el Reporte Diario. Queda verdadero aunque el reporte llegue después.';
COMMENT ON COLUMN public.turnos_guardia.reporte_diario_llego_at IS
  'Cuándo llegó el Reporte Diario de un turno de guardia del que el Asistente salió sin presentarlo. Vacío mientras sigue pendiente.';

-- Mientras el turno de guardia espera el reporte, la falta está anotada, la salida marcada y el
-- reporte sin llegar.
ALTER TABLE public.turnos_guardia ADD CONSTRAINT turnos_guardia_salida_sin_reporte_check
  CHECK (estado <> 'salida_sin_reporte'
         OR (salio_sin_reporte_diario AND reporte_diario_llego_at IS NULL AND checkout_at IS NOT NULL));

-- La llegada del reporte sólo se anota donde hubo falta.
ALTER TABLE public.turnos_guardia ADD CONSTRAINT turnos_guardia_reporte_diario_llego_check
  CHECK (reporte_diario_llego_at IS NULL OR salio_sin_reporte_diario);

-- La falta no se borra y la fecha de llegada no se reescribe.
CREATE OR REPLACE FUNCTION interno.la_falta_del_reporte_no_se_borra()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.salio_sin_reporte_diario AND NOT NEW.salio_sin_reporte_diario THEN
    RAISE EXCEPTION 'la_falta_no_se_borra' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.reporte_diario_llego_at IS NOT NULL
     AND NEW.reporte_diario_llego_at IS DISTINCT FROM OLD.reporte_diario_llego_at THEN
    RAISE EXCEPTION 'la_falta_no_se_borra' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION interno.la_falta_del_reporte_no_se_borra() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.la_falta_del_reporte_no_se_borra() FROM anon;

CREATE TRIGGER la_falta_del_reporte_no_se_borra
  BEFORE UPDATE OF salio_sin_reporte_diario, reporte_diario_llego_at ON public.turnos_guardia
  FOR EACH ROW EXECUTE FUNCTION interno.la_falta_del_reporte_no_se_borra();

-- Para la lista de faltas del Legajo.
CREATE INDEX turnos_guardia_faltas_del_asistente_idx
  ON public.turnos_guardia (prestadora_id, asistente_id, fecha DESC)
  WHERE salio_sin_reporte_diario;

-- ---------------------------------------------------------------------------------------------
-- El cierre por la salida sin reporte también deja su rastro
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_rastro_del_cierre_por_el_asistente()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Que la hora de salida sea nueva. Un UPDATE cualquiera sobre una guardia ya cerrada no
  -- vuelve a marcar nada.
  IF NEW.checkout_at IS NULL OR OLD.checkout_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Que la guardia efectivamente quede cerrada: completada, o con la salida hecha y el Reporte
  -- Diario pendiente. Marcar la salida sin dar por terminada la guardia no es un cierre.
  IF NEW.estado IS NULL OR NEW.estado NOT IN ('completada', 'salida_sin_reporte') THEN
    RETURN NEW;
  END IF;

  -- Que nadie haya escrito ya el rastro en esta misma operación. Si vino escrito, manda quien
  -- lo escribió.
  IF NEW.cerrada_at IS NOT NULL OR NEW.cerrada_origen IS NOT NULL THEN
    RETURN NEW;
  END IF;

  NEW.cerrada_at     := NEW.checkout_at;
  NEW.cerrada_origen := 'asistente';
  NEW.cerrada_por    := NEW.asistente_id;
  NEW.cerrada_motivo := NULL;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- Un turno de guardia con la salida hecha no cuenta como asignado al cancelar la cobertura
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancelar_cobertura_desde(p_alcance text, p_prestacion bigint, p_serie uuid, p_desde date, p_motivo uuid, p_detalle text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prest    uuid := interno.prestadora_actual();
  v_hoy      date;
  v_servicio uuid;
  v_paciente uuid;
  v_inicio   date;
  v_detalle  text;
  v_series   uuid[];
  v_turnos   uuid[];
  v_id       uuid;
BEGIN
  IF v_prest IS NULL THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_desde IS NULL THEN
    RAISE EXCEPTION 'falta_un_dato' USING ERRCODE = '23502';
  END IF;
  v_hoy := interno.hoy_de_la_prestadora(v_prest);

  IF p_alcance = 'turno_guardia_recurrente' THEN
    SELECT s.servicio_id, s.vigente_desde INTO v_servicio, v_inicio FROM series_turnos_guardia s
     WHERE s.id = p_serie AND s.prestadora_id = v_prest AND s.estado = 'activa';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'turno_guardia_recurrente_inexistente' USING ERRCODE = 'P0001';
    END IF;
    v_series := ARRAY[p_serie];
    v_turnos := ARRAY(SELECT t.id FROM turnos_guardia t
                       WHERE t.serie_id = p_serie AND t.prestadora_id = v_prest AND t.fecha >= p_desde);
  ELSIF p_alcance = 'prestacion' THEN
    SELECT p.servicio_id, p.paciente_id, p.vigente_desde INTO v_servicio, v_paciente, v_inicio
      FROM prestaciones p
     WHERE p.id = p_prestacion AND p.prestadora_id = v_prest AND p.estado = 'vigente';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'prestacion_inexistente' USING ERRCODE = 'P0001';
    END IF;
    -- Los recurrentes del Servicio que atienden a ese Paciente, y los turnos de guardia de las
    -- guardias de esa Prestación.
    v_series := ARRAY(SELECT s.id FROM series_turnos_guardia s
                       WHERE s.servicio_id = v_servicio AND s.prestadora_id = v_prest AND s.estado = 'activa'
                         AND (s.paciente_id = v_paciente
                              OR EXISTS (SELECT 1 FROM series_turnos_guardia_pacientes sp
                                          WHERE sp.serie_id = s.id AND sp.paciente_id = v_paciente)));
    v_turnos := ARRAY(SELECT DISTINCT tg.turno_guardia_id
                        FROM turno_guardia_guardias tg
                        JOIN cronograma_de_guardias c ON c.id = tg.guardia_id
                        JOIN turnos_guardia t ON t.id = tg.turno_guardia_id
                       WHERE c.prestacion_id = p_prestacion AND t.prestadora_id = v_prest
                         AND t.fecha >= p_desde);
    IF EXISTS (SELECT 1 FROM series_turnos_guardia_pacientes sp
                JOIN series_turnos_guardia s ON s.id = sp.serie_id
               WHERE sp.serie_id = ANY (v_series) AND sp.paciente_id <> v_paciente)
       OR EXISTS (SELECT 1 FROM series_turnos_guardia s
                   WHERE s.id = ANY (v_series) AND s.paciente_id <> v_paciente)
       OR EXISTS (SELECT 1 FROM turno_guardia_pacientes tp
                   WHERE tp.turno_guardia_id = ANY (v_turnos) AND tp.paciente_id <> v_paciente) THEN
      RAISE EXCEPTION 'el_turno_guardia_recurrente_atiende_a_otro_paciente' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;

  IF NOT interno.puede_gestionar_la_cobertura(v_servicio) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_desde < v_hoy THEN
    RAISE EXCEPTION 'la_fecha_ya_paso' USING ERRCODE = 'P0001';
  END IF;
  v_detalle := interno.validar_motivo_de_la_interrupcion(v_prest, 'cancelacion', p_motivo, p_detalle);

  -- Lo asignado no se cancela solo: se le quita primero el Asistente. Un turno de guardia con
  -- la salida hecha, aunque espere el Reporte Diario, ya no está asignado.
  IF EXISTS (SELECT 1 FROM turnos_guardia t
              WHERE t.id = ANY (v_turnos) AND t.asistente_id IS NOT NULL
                AND t.estado NOT IN ('cancelada', 'completada', 'ausente', 'salida_sin_reporte'))
     OR EXISTS (SELECT 1 FROM series_turnos_guardia s
                 WHERE s.id = ANY (v_series) AND s.asistente_id IS NOT NULL
                   AND (s.vigente_hasta IS NULL OR s.vigente_hasta >= p_desde)) THEN
    RAISE EXCEPTION 'quedan_turnos_guardia_asignados' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO interrupciones_de_cobertura
    (prestadora_id, tipo, alcance, servicio_id, prestacion_id, serie_id, desde, motivo_id, detalle)
  VALUES
    (v_prest, 'cancelacion', p_alcance, v_servicio,
     CASE WHEN p_alcance = 'prestacion' THEN p_prestacion END,
     CASE WHEN p_alcance = 'turno_guardia_recurrente' THEN p_serie END,
     p_desde, p_motivo, v_detalle)
  RETURNING id INTO v_id;

  UPDATE turnos_guardia t
     SET estado = 'cancelada', cancelacion_origen = 'prestadora', cancelacion_alcance = p_alcance,
         interrupcion_id = NULL
   WHERE t.id = ANY (v_turnos) AND t.checkin_at IS NULL
     AND t.estado IN ('programada', 'pausada', 'suspendida');

  -- El recurrente rige hasta el día anterior; si no le queda ningún día, se cancela.
  UPDATE series_turnos_guardia s
     SET estado = 'cancelada', cancelacion_origen = 'prestadora', cancelado_at = now()
   WHERE s.id = ANY (v_series) AND p_desde <= s.vigente_desde;
  UPDATE series_turnos_guardia s
     SET vigente_hasta = least(COALESCE(s.vigente_hasta, p_desde - 1), p_desde - 1)
   WHERE s.id = ANY (v_series) AND s.estado = 'activa';

  IF p_alcance = 'prestacion' THEN
    IF p_desde <= v_inicio THEN
      UPDATE prestaciones SET estado = 'de_baja', vigente_hasta = vigente_desde WHERE id = p_prestacion;
    ELSE
      UPDATE prestaciones SET vigente_hasta = least(COALESCE(vigente_hasta, p_desde - 1), p_desde - 1)
       WHERE id = p_prestacion;
    END IF;
  END IF;

  PERFORM interno.anotar_turnos_sin_cubrir();
  RETURN v_id;
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- El aviso al Asistente que salió sin el reporte
-- ---------------------------------------------------------------------------------------------

INSERT INTO public.mensajes_del_sistema (clave, i18n, admite_texto_propio, activo) VALUES
  ('reporte_diario_pendiente.titulo', '{"es-AR": "Reporte Diario pendiente", "en": "Daily Report pending", "pt-BR": "Relatório Diário pendente"}'::jsonb, true, true),
  ('reporte_diario_pendiente.cuerpo', '{"es-AR": "Su Reporte Diario está pendiente. Preséntelo ahora.", "en": "Your Daily Report is pending. Submit it now.", "pt-BR": "Seu Relatório Diário está pendente. Apresente-o agora."}'::jsonb, true, true);

COMMIT;

NOTIFY pgrst, 'reload schema';
