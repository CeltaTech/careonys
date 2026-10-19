-- EL ENLACE DE ACTIVACIÓN SE RECUERDA SOLO.
--
-- Dos piezas para que el enlace que activa una cuenta se reenvíe sin que nadie lo pida desde el
-- Panel:
--
-- 1. La marca del recordatorio. Cuando un enlace lleva unos días sin usarse, una tarea programada
--    le manda a esa cuenta un enlace nuevo, una sola vez. La fecha en que salió queda anotada en el
--    enlace que lo motivó, y es lo que impide mandarlo dos veces. El trabajo sin persona ya tiene
--    permiso de lectura y de modificación sobre la tabla entera, que alcanza a la columna nueva, y
--    la política de la tabla no cambia.
--
-- 2. Qué cuentas nunca se activaron: ningún enlace usado y ningún ingreso. Es la única definición,
--    y la consumen el pedido de un enlace nuevo, el recordatorio y el reenvío al corregir el email.
--    Mira el registro de ingresos de Supabase, que el trabajo sin persona no alcanza, y por eso
--    corre con los permisos de su dueño. Sólo contesta al trabajo sin persona, sólo dentro de la
--    Prestadora en la que está trabajando, y sólo por las cuentas que se le preguntan.

ALTER TABLE public.tokens_activacion_cuenta
  ADD COLUMN recordatorio_enviado_en timestamptz;

CREATE FUNCTION public.cuentas_nunca_activadas(p_usuarios uuid[])
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, interno
AS $$
  SELECT u.id
  FROM public.usuarios u
  JOIN auth.users a ON a.id = u.id
  WHERE auth.jwt() ->> 'role' = 'trabajo_sin_persona'
    AND u.prestadora_id = interno.prestadora_actual()
    AND u.id = ANY (p_usuarios)
    AND a.last_sign_in_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.tokens_activacion_cuenta t
      WHERE t.usuario_id = u.id
        AND t.usado_en IS NOT NULL
    );
$$;

REVOKE ALL ON FUNCTION public.cuentas_nunca_activadas(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_nunca_activadas(uuid[]) TO trabajo_sin_persona;

NOTIFY pgrst, 'reload schema';
