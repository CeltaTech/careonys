-- Crear un Servicio y darlo de baja es un permiso del catálogo: `gestionar_servicios`. Nace
-- reservado al Administrador, que lo delega a quien quiera.
--
-- La política `panel_gestiona_servicios` deja escribir en `servicios` a todo el personal del Panel
-- de la Prestadora; este disparador agrega lo que la política no distingue: que la fila sea nueva,
-- o que el Servicio pase a estar de baja.

BEGIN;

INSERT INTO public.catalogo_acciones_permisos (accion, orden, default_solo_admin)
VALUES ('gestionar_servicios', 19, true)
ON CONFLICT (accion) DO NOTHING;

CREATE OR REPLACE FUNCTION interno.crear_y_cerrar_servicios_lo_hace_quien_puede()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF (TG_OP = 'INSERT'
      OR (NEW.estado = 'de_baja' AND NEW.estado IS DISTINCT FROM OLD.estado))
     AND COALESCE(auth.jwt() ->> 'role', '') = 'authenticated'
     AND NOT (interno.es_admin_prestadora()
              OR interno.es_superadmin()
              OR interno.tiene_permiso('gestionar_servicios')) THEN
    RAISE EXCEPTION 'crear_y_cerrar_servicios_lo_hace_quien_puede';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION interno.crear_y_cerrar_servicios_lo_hace_quien_puede() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS crear_y_cerrar_servicios_lo_hace_quien_puede ON public.servicios;
CREATE TRIGGER crear_y_cerrar_servicios_lo_hace_quien_puede
  BEFORE INSERT OR UPDATE OF estado ON public.servicios
  FOR EACH ROW EXECUTE FUNCTION interno.crear_y_cerrar_servicios_lo_hace_quien_puede();

NOTIFY pgrst, 'reload schema';

COMMIT;
