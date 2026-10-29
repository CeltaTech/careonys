-- Qué períodos ya se le pagaron al Asistente que inició sesión.
-- ============================================================================
--
-- De sus guardias pasadas el Asistente ve sólo las que todavía no se le pagaron, para poder
-- reclamar. Una guardia no guarda si se pagó: se deduce de que haya una liquidación pagada suya
-- cuyo período la cubra. Las liquidaciones las lee sólo la administración, así que esta función
-- contesta nada más que las fechas de esos períodos —ni importes ni conceptos— y no recibe a
-- nadie: el Asistente es el de la sesión, en la Prestadora de la sesión.

CREATE FUNCTION public.periodos_pagados_de_la_sesion()
RETURNS TABLE (desde date, hasta date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $$
  SELECT l.periodo_desde, l.periodo_hasta
  FROM public.liquidaciones_asistente l
  WHERE l.estado = 'pagada'
    AND l.prestadora_id = interno.prestadora_actual()
    AND l.asistente_id = interno.asistente_de_la_sesion();
$$;

REVOKE ALL ON FUNCTION public.periodos_pagados_de_la_sesion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.periodos_pagados_de_la_sesion() TO authenticated;

NOTIFY pgrst, 'reload schema';
