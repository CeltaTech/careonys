-- La asignación de un turno mira la matrícula del día de la guardia, no la de hoy.
--
-- `interno.exigir_matricula_en_asignacion` ya miraba el día de la guardia al aceptar, pero al
-- asignar miraba el día de hoy. Una matrícula vigente hoy y vencida el día de la guardia dejaba
-- asignar, y el rechazo llegaba recién cuando el Asistente apretaba «Aceptar». Ahora las dos
-- puertas —asignar y aceptar— comparan contra el mismo día: el último de la guardia, o el primero
-- de la serie, igual que `exigir_matricula_en_guardia`.

BEGIN;

CREATE OR REPLACE FUNCTION interno.exigir_matricula_en_asignacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_motivo text;
  v_dia    date;
BEGIN
  IF NOT (TG_OP = 'INSERT'
          OR (NEW.estado = 'aceptada' AND OLD.estado IS DISTINCT FROM 'aceptada')) THEN
    RETURN NEW;
  END IF;

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

  v_motivo := interno.motivo_bloqueo_matricula(NEW.asistente_id, COALESCE(v_dia, CURRENT_DATE));

  IF v_motivo IS NOT NULL THEN
    RAISE EXCEPTION 'matricula_bloquea:%:', v_motivo
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
