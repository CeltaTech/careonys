-- La comprobación de la Prestadora falla cerrada.
--
-- `interno.le_corresponde` devolvía nulo, y no falso, cuando no se podía saber de qué Prestadora
-- es quien llama. Las funciones que la usan preguntan `IF NOT …`, y con un nulo esa condición no
-- se cumple: seguían de largo y entregaban el secreto. Ahora la respuesta es siempre sí o no, y
-- ante la duda es no.

BEGIN;

CREATE OR REPLACE FUNCTION interno.le_corresponde(p_prestadora_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT COALESCE(
    auth.role() = 'service_role'
      OR (p_prestadora_id IS NOT NULL AND p_prestadora_id = interno.current_tenant()),
    false)
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
