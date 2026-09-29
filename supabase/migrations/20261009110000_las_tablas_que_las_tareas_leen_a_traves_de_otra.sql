-- Las tablas que las tareas automatizadas leen a través de otra.
--
-- Tres tareas traen, junto con la fila que buscan, datos de otra tabla que cuelga de ella: el
-- motivo del cierre de un Servicio, el período de la forma de cobro de un acceso y las respuestas a
-- las ofertas de una guardia. El permiso de la tabla principal no alcanza para la que cuelga, y la
-- tarea fallaba con «permission denied». Lectura sola, y sólo de esta Prestadora, como las demás.

BEGIN;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cierres_servicio_paciente', 'formas_de_cobro_marketplace', 'ofertas_guardia']
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO trabajo_sin_persona', t);
    EXECUTE format('DROP POLICY IF EXISTS trabajo_sin_persona_de_esta_prestadora ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.%I AS PERMISSIVE FOR SELECT '
      'TO trabajo_sin_persona USING (prestadora_id = interno.current_tenant())',
      t);
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
