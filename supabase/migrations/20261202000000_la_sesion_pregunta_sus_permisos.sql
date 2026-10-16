-- Quien inició sesión pregunta qué permisos tiene, y sólo los suyos.
--
-- El backend comprueba cada acción que la Prestadora puede reservar con `tiene_permiso_de`, y le
-- arma al Panel la lista entera con `permisos_efectivos_de`. Las dos reciben de quién se pregunta,
-- así que no quedan al alcance de una persona: con ellas podría preguntar por cualquier cuenta. Por
-- eso el backend las llamaba con la llave maestra.
--
-- Estas dos no reciben a nadie: preguntan por quien inició sesión, y contestan exactamente lo mismo
-- que las otras dos para esa persona. Con ellas la pregunta va con la credencial de quien pide. La
-- decisión sigue escrita una sola vez, en `tiene_permiso_de`.

CREATE FUNCTION public.tiene_permiso_la_sesion(p_accion text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $$
  SELECT COALESCE(public.tiene_permiso_de(interno.usuario_de_la_sesion(), p_accion), false);
$$;

CREATE FUNCTION public.permisos_efectivos_de_la_sesion()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $$
  SELECT public.permisos_efectivos_de(interno.usuario_de_la_sesion());
$$;

REVOKE ALL ON FUNCTION public.tiene_permiso_la_sesion(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.permisos_efectivos_de_la_sesion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tiene_permiso_la_sesion(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.permisos_efectivos_de_la_sesion() TO authenticated;

NOTIFY pgrst, 'reload schema';
