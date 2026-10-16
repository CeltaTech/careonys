-- Cuántos correos salieron desde un momento, contando todas las Prestadoras.
--
-- El tope del despachante de correo es de la cuenta entera, así que el número que se compara contra
-- él tiene que sumar los envíos de todas las Prestadoras y los que no son de ninguna. La protección
-- por fila no deja a nadie verlos todos, y está bien que no deje: esta función devuelve el total y
-- ningún dato de nadie, y sólo a Superadmin. A cualquier otro le contesta vacío, que no es cero.
--
-- Se saltea la protección por fila, así que no queda al alcance de quien no inició sesión. No la usa
-- ninguna política: `authenticated` la conserva porque la llama la ruta con la credencial de quien
-- pide.

CREATE FUNCTION public.correos_enviados_desde(p_desde timestamptz)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, interno
AS $$
  SELECT CASE WHEN interno.es_superadmin()
              THEN (SELECT count(*) FROM envios_de_correo WHERE created_at >= p_desde)
         END;
$$;

REVOKE ALL ON FUNCTION public.correos_enviados_desde(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.correos_enviados_desde(timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.correos_enviados_desde(timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';
