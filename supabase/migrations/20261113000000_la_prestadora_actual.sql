-- La función que contesta de qué Prestadora es quien entró se llamaba con una palabra que el
-- glosario retiró. Pasa a llamarse `prestadora_actual`, igual en todo lo demás.
--
-- Las políticas, los disparadores y los valores por defecto apuntan a la función misma y no a su
-- nombre escrito, así que siguen el cambio solos. Las funciones que la llaman tienen el nombre
-- escrito en su cuerpo: se rehacen con el nombre nuevo, con su misma definición, dueño y permisos.
-- Si al final queda alguna con el nombre viejo, no se aplica nada.
BEGIN;

ALTER FUNCTION interno.current_tenant() RENAME TO prestadora_actual;

DO $$
DECLARE
  f oid;
BEGIN
  FOR f IN
    SELECT p.oid FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname IN ('public', 'interno')
       AND p.prosrc LIKE '%current_tenant%'
  LOOP
    EXECUTE replace(pg_get_functiondef(f), 'current_tenant', 'prestadora_actual');
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE prosrc LIKE '%current_tenant%') THEN
    RAISE EXCEPTION 'Quedó una función que llama a la Prestadora de la sesión con el nombre viejo';
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
