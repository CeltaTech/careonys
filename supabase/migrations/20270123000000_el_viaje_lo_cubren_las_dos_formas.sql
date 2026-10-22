-- Las dos formas de tomar la ubicación incluyen el viaje, así que cualquiera de los dos textos
-- aceptados cubre el seguimiento del viaje. Si la Prestadora pasa de «Viaje y turno» a «Sólo
-- viaje», el sí que el Asistente ya dio sigue valiendo: aceptó algo más amplio. Si pasa al revés,
-- el viaje sigue cubierto y lo que espera la aceptación nueva es sólo el control durante el turno.

BEGIN;

CREATE OR REPLACE FUNCTION public.consentimiento_seguimiento_vigente(p_asistente_id uuid, p_clave text DEFAULT 'seguimiento_ubicacion'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM consentimientos_asistente c
    JOIN textos_consentimiento tx ON tx.id = c.texto_consentimiento_id
    WHERE c.asistente_id = p_asistente_id
      AND c.clave = p_clave
      AND c.retirado_at IS NULL
      AND c.decision = 'otorgado'
      AND tx.es_borrador = FALSE
      AND tx.vigente_hasta IS NULL
      AND interno.le_corresponde(c.prestadora_id)
  );
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
