-- Borrar una Prestadora se lleva sus cuentas automáticas.
--
-- Al borrarse la Prestadora, la base borra los renglones de `interno.cuentas_automaticas` que la
-- nombran, pero la cuenta de Supabase seguía existiendo: sin Prestadora no veía nada, aunque su
-- contraseña seguía sirviendo para entrar. Este disparador borra la cuenta junto con su renglón.
--
-- Es `SECURITY DEFINER` porque la tabla de cuentas es de Supabase y quien borra la Prestadora no
-- tiene por qué poder tocarla. Sólo borra la cuenta del renglón que se acaba de borrar.

CREATE FUNCTION interno.borrar_la_cuenta_automatica() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO ''
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = OLD.id;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION interno.borrar_la_cuenta_automatica() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER borrar_la_cuenta_automatica
  AFTER DELETE ON interno.cuentas_automaticas
  FOR EACH ROW EXECUTE FUNCTION interno.borrar_la_cuenta_automatica();

NOTIFY pgrst, 'reload schema';
