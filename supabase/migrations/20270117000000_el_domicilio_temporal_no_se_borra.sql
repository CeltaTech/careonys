-- El domicilio temporal del Paciente no se borra: se edita, y cada cambio queda en el historial
-- clínico.
--
-- Lo decidió el Desarrollador: el domicilio temporal forma parte de la historia clínica y hay que
-- mantener la trazabilidad de los servicios. Se puede corregir lo mal cargado; si el Paciente pasa
-- a otro domicilio temporal, se agrega uno nuevo.
--
-- 1. Cada alta y cada modificación deja una copia en `versiones_registro_clinico`, con el mismo
--    disparador que ya tienen `indicaciones_medicacion` y `rangos_referencia_vitales`.
-- 2. Nadie lo puede borrar: se le quita el permiso a las personas y un disparador rechaza el
--    borrado venga de donde venga, también de la llave maestra. Ninguna clave foránea lo alcanza en
--    cascada (la de `pacientes` no tiene `ON DELETE`), así que borrar la Ficha del Paciente falla,
--    que es lo que corresponde: una Ficha no se borra nunca.

BEGIN;

CREATE FUNCTION interno.el_domicilio_temporal_no_se_borra()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'interno'
AS $$
BEGIN
  RAISE EXCEPTION 'El domicilio temporal forma parte de la historia clínica y no se borra'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION interno.el_domicilio_temporal_no_se_borra() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.el_domicilio_temporal_no_se_borra() TO authenticated, service_role;

CREATE TRIGGER trg_el_domicilio_temporal_no_se_borra
  BEFORE DELETE ON public.domicilios_temporales_paciente
  FOR EACH ROW EXECUTE FUNCTION interno.el_domicilio_temporal_no_se_borra();

-- Vaciar la tabla entera también es borrar.
CREATE TRIGGER trg_el_domicilio_temporal_no_se_vacia
  BEFORE TRUNCATE ON public.domicilios_temporales_paciente
  FOR EACH STATEMENT EXECUTE FUNCTION interno.el_domicilio_temporal_no_se_borra();

CREATE TRIGGER trg_versiones_del_registro_clinico
  AFTER INSERT OR DELETE OR UPDATE ON public.domicilios_temporales_paciente
  FOR EACH ROW EXECUTE FUNCTION interno.anotar_version_clinica();

REVOKE DELETE ON public.domicilios_temporales_paciente FROM authenticated, anon;

NOTIFY pgrst, 'reload schema';

COMMIT;
