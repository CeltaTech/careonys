-- El Cliente deja de leer guardias directo de la base, y el punto del viaje no sobrevive al viaje.
-- ============================================================================
--
-- La política le abría al Cliente todas las columnas de las guardias de sus Pacientes: el punto
-- del que salió el Asistente —casi siempre su casa—, los de llegada y cierre, y el del viaje aunque
-- la Prestadora tuviera apagado el mapa en vivo. La protección por fila no recorta columnas.
--
-- Lo que el Cliente ve de una guardia lo arma el backend con el trabajo de la Prestadora y
-- columnas contadas, y el permiso de la persona autorizada lo exige la ruta
-- (backend/src/routes/appClientes.js). Sin política, la base no le entrega ninguna fila, y
-- `guardia_pacientes` tampoco, porque su política mira la guardia.

DROP POLICY IF EXISTS cliente_ve_guardias_de_sus_pacientes ON public.guardias;

-- El punto del viaje sirve sólo mientras el Asistente va en camino. La llegada ya lo borra
-- (backend/src/routes/appAsistentes.js); una guardia cancelada o cerrada sin llegada lo dejaba
-- guardado. Se borra en la base, que es el único lugar por el que pasan todos los cambios.
CREATE OR REPLACE FUNCTION interno.borrar_el_punto_del_viaje()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, interno
AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM 'programada' THEN
    NEW.ubicacion_actual_lat := NULL;
    NEW.ubicacion_actual_lng := NULL;
    NEW.ubicacion_actual_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION interno.borrar_el_punto_del_viaje() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.borrar_el_punto_del_viaje() TO authenticated;

DROP TRIGGER IF EXISTS borrar_el_punto_del_viaje ON public.guardias;
CREATE TRIGGER borrar_el_punto_del_viaje
  BEFORE INSERT OR UPDATE ON public.guardias
  FOR EACH ROW EXECUTE FUNCTION interno.borrar_el_punto_del_viaje();

-- Los que quedaron de antes.
UPDATE public.guardias
   SET ubicacion_actual_lat = NULL, ubicacion_actual_lng = NULL, ubicacion_actual_at = NULL
 WHERE estado IS DISTINCT FROM 'programada'
   AND (ubicacion_actual_lat IS NOT NULL OR ubicacion_actual_lng IS NOT NULL OR ubicacion_actual_at IS NOT NULL);

NOTIFY pgrst, 'reload schema';
