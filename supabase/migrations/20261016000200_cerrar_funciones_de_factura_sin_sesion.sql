-- Las dos funciones de factura que se pueden llamar como dirección web dejan de aceptar a quien
-- no inició sesión. No se saltean la seguridad —corren con los permisos de quien llama—, así que
-- sin sesión ya devolvían vacío; esto las cierra del todo.
--
-- Conservan `authenticated` y `service_role`: las usan la vista `saldos_cliente` y la función de
-- disparador `fn_estado_factura_segun_cobros`, que corren con el rol de quien consulta o escribe.

DO $$
DECLARE
  f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('correcciones_de_factura', 'monto_a_cobrar_de_factura')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
