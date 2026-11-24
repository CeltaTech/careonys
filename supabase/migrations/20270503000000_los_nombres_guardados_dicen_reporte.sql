-- «Reporte Diario» pasa a decirse «Reporte» también en los nombres guardados:
-- los datos de la Prestadora y del turno de guardia, sus controles, sus índices
-- y las claves de los dos avisos al celular. Los datos no cambian.

BEGIN;

ALTER TABLE public.prestadoras RENAME COLUMN minutos_recordatorio_reporte_diario TO minutos_recordatorio_reporte;
ALTER TABLE public.prestadoras RENAME COLUMN factura_turnos_sin_reporte_diario TO factura_turnos_sin_reporte;
ALTER TABLE public.prestadoras RENAME CONSTRAINT prestadoras_minutos_recordatorio_reporte_diario_check TO prestadoras_minutos_recordatorio_reporte_check;

ALTER TABLE public.turnos_guardia RENAME COLUMN salio_sin_reporte_diario TO salio_sin_reporte;
ALTER TABLE public.turnos_guardia RENAME COLUMN reporte_diario_llego_at TO reporte_llego_at;
ALTER TABLE public.turnos_guardia RENAME COLUMN factura_espera_el_reporte_diario TO factura_espera_el_reporte;
ALTER TABLE public.turnos_guardia RENAME CONSTRAINT turnos_guardia_reporte_diario_llego_check TO turnos_guardia_reporte_llego_check;
ALTER TABLE public.turnos_guardia RENAME CONSTRAINT turnos_guardia_factura_espera_el_reporte_diario_check TO turnos_guardia_factura_espera_el_reporte_check;
ALTER INDEX public.turnos_guardia_reporte_diario_tardio_idx RENAME TO turnos_guardia_reporte_tardio_idx;
ALTER INDEX public.turnos_guardia_reporte_diario_pendiente_idx RENAME TO turnos_guardia_reporte_pendiente_idx;

-- El cuerpo de la función guarda el texto con los nombres viejos: se reescribe con los nuevos.
CREATE OR REPLACE FUNCTION interno.la_falta_del_reporte_no_se_borra()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.salio_sin_reporte AND NOT NEW.salio_sin_reporte THEN
    RAISE EXCEPTION 'la_falta_no_se_borra' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.reporte_llego_at IS NOT NULL
     AND NEW.reporte_llego_at IS DISTINCT FROM OLD.reporte_llego_at THEN
    RAISE EXCEPTION 'la_falta_no_se_borra' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.salio_sin_reporte
     AND NEW.factura_espera_el_reporte IS DISTINCT FROM OLD.factura_espera_el_reporte THEN
    RAISE EXCEPTION 'la_falta_no_se_borra' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

UPDATE public.mensajes_del_sistema
   SET clave = replace(clave, 'recordatorio_del_reporte_diario.', 'recordatorio_del_reporte.')
 WHERE clave IN ('recordatorio_del_reporte_diario.titulo', 'recordatorio_del_reporte_diario.cuerpo');

UPDATE public.mensajes_del_sistema
   SET clave = replace(clave, 'reporte_diario_pendiente.', 'reporte_pendiente.')
 WHERE clave IN ('reporte_diario_pendiente.titulo', 'reporte_diario_pendiente.cuerpo');

COMMIT;

NOTIFY pgrst, 'reload schema';
