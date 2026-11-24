-- El turno de guardia sin Reporte Diario se factura, y al Asistente se le insiste hasta que lo
-- presente.
--
-- Que falte el Reporte Diario no es motivo para dejar de cobrarle el turno de guardia al Cliente:
-- el turno se prestó. Cada Prestadora puede elegir lo contrario, y entonces ese turno se cobra
-- recién cuando llega el reporte. Si el reporte llega después de emitida la factura del período,
-- el turno entra en la factura siguiente y no se pierde.
--
-- Mientras el reporte no llegue, el sistema le vuelve a mandar el aviso al teléfono del Asistente
-- cada tantas horas. Cuántas horas lo elige cada Prestadora; si nunca lo eligió, son 2. Al
-- Cliente no le llega nada.
--
-- Los textos de los avisos al teléfono se reescriben más cortos y naturales. Se cambian sólo
-- donde siguen diciendo el texto de origen.

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- Si se facturan los turnos de guardia sin Reporte Diario
-- ---------------------------------------------------------------------------------------------

ALTER TABLE public.prestadoras
  ADD COLUMN factura_turnos_sin_reporte_diario boolean DEFAULT true NOT NULL;

COMMENT ON COLUMN public.prestadoras.factura_turnos_sin_reporte_diario IS
  'Si se le factura al Cliente el turno de guardia en el que el Asistente salió sin presentar el Reporte Diario. Verdadero: se factura igual. Falso: se factura cuando llega el reporte.';

-- ---------------------------------------------------------------------------------------------
-- Cada cuántas horas se le insiste al Asistente con el Reporte Diario pendiente
-- ---------------------------------------------------------------------------------------------
-- Entre 1 y 24: más de un aviso por hora deja de leerse, y menos de uno por día deja que el
-- reporte se olvide.

ALTER TABLE public.prestadoras
  ADD COLUMN horas_entre_avisos_reporte_pendiente integer DEFAULT 2 NOT NULL,
  ADD CONSTRAINT prestadoras_horas_entre_avisos_reporte_pendiente_check
    CHECK (horas_entre_avisos_reporte_pendiente >= 1 AND horas_entre_avisos_reporte_pendiente <= 24);

COMMENT ON COLUMN public.prestadoras.horas_entre_avisos_reporte_pendiente IS
  'Cada cuántas horas se le repite al Asistente el aviso de que falta su Reporte Diario, mientras no lo presente. Entre 1 y 24.';

-- La administración no escribe la tabla directo: el cambio lo guarda el backend con la
-- credencial del trabajo de esa Prestadora, que puede tocar sólo las columnas que se le dan.
GRANT UPDATE ("factura_turnos_sin_reporte_diario", "horas_entre_avisos_reporte_pendiente")
  ON TABLE public.prestadoras TO trabajo_sin_persona;

-- ---------------------------------------------------------------------------------------------
-- Lo que cada turno de guardia sin reporte guarda
-- ---------------------------------------------------------------------------------------------
-- La elección de la Prestadora se anota en el turno de guardia en el momento de la salida. Si
-- después la cambia, los turnos que ya salieron siguen como estaban: ninguno se cobra dos veces
-- y ninguno queda sin cobrar.

ALTER TABLE public.turnos_guardia
  ADD COLUMN factura_espera_el_reporte_diario boolean DEFAULT false NOT NULL,
  ADD COLUMN push_reporte_pendiente_enviado_at timestamp with time zone,
  ADD CONSTRAINT turnos_guardia_factura_espera_el_reporte_diario_check
    CHECK (NOT factura_espera_el_reporte_diario OR salio_sin_reporte_diario);

COMMENT ON COLUMN public.turnos_guardia.factura_espera_el_reporte_diario IS
  'Verdadero si el Asistente salió sin Reporte Diario y la Prestadora había elegido no facturar esos turnos de guardia: se factura cuando llega el reporte, en la factura del período en que llegó si la de su fecha ya estaba hecha.';

COMMENT ON COLUMN public.turnos_guardia.push_reporte_pendiente_enviado_at IS
  'Cuándo se le avisó por última vez al Asistente que falta su Reporte Diario de este turno de guardia. Vacío si todavía no se le avisó.';

-- La elección anotada no cambia después de la salida, igual que la falta.
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
  IF OLD.salio_sin_reporte_diario
     AND NEW.factura_espera_el_reporte_diario IS DISTINCT FROM OLD.factura_espera_el_reporte_diario THEN
    RAISE EXCEPTION 'la_falta_no_se_borra' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION interno.la_falta_del_reporte_no_se_borra() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.la_falta_del_reporte_no_se_borra() FROM anon;

DROP TRIGGER la_falta_del_reporte_no_se_borra ON public.turnos_guardia;
CREATE TRIGGER la_falta_del_reporte_no_se_borra
  BEFORE UPDATE OF salio_sin_reporte_diario, reporte_diario_llego_at, factura_espera_el_reporte_diario
  ON public.turnos_guardia
  FOR EACH ROW EXECUTE FUNCTION interno.la_falta_del_reporte_no_se_borra();

-- Para la revisión periódica de los reportes pendientes.
CREATE INDEX turnos_guardia_reporte_diario_pendiente_idx
  ON public.turnos_guardia (prestadora_id, push_reporte_pendiente_enviado_at)
  WHERE estado = 'salida_sin_reporte';

-- Para encontrar los turnos de guardia cuyo reporte llegó tarde, al facturar y al liquidar.
CREATE INDEX turnos_guardia_reporte_diario_tardio_idx
  ON public.turnos_guardia (prestadora_id, reporte_diario_llego_at)
  WHERE salio_sin_reporte_diario AND reporte_diario_llego_at IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- Los textos de los avisos al teléfono
-- ---------------------------------------------------------------------------------------------
-- Cada fila cambia sólo si todavía dice el texto de origen.

UPDATE public.mensajes_del_sistema
   SET i18n = '{"es-AR": "Presente el Reporte Diario antes de terminar el turno.", "en": "Submit your Daily Report before your shift ends.", "pt-BR": "Apresente o Relatório Diário antes de terminar o plantão."}'::jsonb
 WHERE clave = 'recordatorio_del_reporte_diario.cuerpo'
   AND i18n = '{"es-AR": "Presente el Reporte Diario antes del fin del turno de guardia.", "en": "Submit the Daily Report before the guard shift ends.", "pt-BR": "Apresente o Relatório Diário antes do fim do turno de plantão."}'::jsonb;

UPDATE public.mensajes_del_sistema
   SET i18n = '{"es-AR": "Falta su Reporte Diario", "en": "Your Daily Report is missing", "pt-BR": "Falta seu Relatório Diário"}'::jsonb
 WHERE clave = 'reporte_diario_pendiente.titulo'
   AND i18n = '{"es-AR": "Reporte Diario pendiente", "en": "Daily Report pending", "pt-BR": "Relatório Diário pendente"}'::jsonb;

UPDATE public.mensajes_del_sistema
   SET i18n = '{"es-AR": "Preséntelo cuanto antes desde la aplicación.", "en": "Submit it from the app as soon as you can.", "pt-BR": "Apresente-o pelo aplicativo o quanto antes."}'::jsonb
 WHERE clave = 'reporte_diario_pendiente.cuerpo'
   AND i18n = '{"es-AR": "Su Reporte Diario está pendiente. Preséntelo ahora.", "en": "Your Daily Report is pending. Submit it now.", "pt-BR": "Seu Relatório Diário está pendente. Apresente-o agora."}'::jsonb;

COMMIT;

NOTIFY pgrst, 'reload schema';
