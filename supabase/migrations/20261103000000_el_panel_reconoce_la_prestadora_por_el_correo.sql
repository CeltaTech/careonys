-- El Panel reconoce la Prestadora por el correo de la cuenta, no por la dirección de la página.
--
-- Una cuenta del Panel es de una sola Prestadora: el mismo correo en varias Prestadoras es cosa de
-- Clientes y Asistentes, no del Panel. Entonces el correo alcanza para saber de cuál es.
--
-- Contesta sólo cuando hay exactamente una: con ninguna o con más de una devuelve nulo, y el
-- ingreso falla igual que con una clave equivocada. No dice nada más que el identificador, y sólo
-- se la puede llamar con la credencial del trabajo sin persona, igual que
-- `prestadora_de_la_direccion`.

CREATE FUNCTION public.prestadora_del_correo_del_panel(p_correo text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT min(prestadora_id::text)::uuid FROM usuarios
   WHERE auth.jwt() ->> 'role' = 'trabajo_sin_persona'
     AND lower(btrim(email)) = lower(btrim(p_correo))
     AND rol IN ('admin_prestadora', 'coordinador')
  HAVING count(*) = 1
$$;

REVOKE ALL ON FUNCTION public.prestadora_del_correo_del_panel(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prestadora_del_correo_del_panel(text) FROM anon;
REVOKE ALL ON FUNCTION public.prestadora_del_correo_del_panel(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prestadora_del_correo_del_panel(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.prestadora_del_correo_del_panel(text) TO trabajo_sin_persona;

NOTIFY pgrst, 'reload schema';
