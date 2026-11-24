-- El Reporte no se modifica nunca. Se corrige con una aclaración agregada al pie, que guarda quién
-- la escribió, la fecha y la hora, y el texto original queda siempre a la vista, como en una
-- historia clínica. La aclaración tampoco se modifica ni se borra: una aclaración equivocada se
-- corrige con otra aclaración.
--
-- La escriben el Asistente que presentó ese Reporte, el Coordinador de ese Paciente y el
-- Administrador de la Prestadora. La leen los mismos que leen el Reporte, con la misma regla de
-- información de salud.
BEGIN;

-- ─── El Reporte deja de poder modificarse y borrarse ─────────────────────────────────────────────
-- Las dos políticas que daban todo pasan a dar sólo lectura, y ningún rol con sesión conserva el
-- permiso de modificar ni de borrar la tabla.
DROP POLICY IF EXISTS coordinador_gestiona_reportes_de_sus_servicios ON public.reportes;
CREATE POLICY coordinador_lee_reportes_de_sus_servicios ON public.reportes
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.coordinador_ve_el_turno_guardia(turno_guardia_id));

DROP POLICY IF EXISTS panel_gestiona_reportes ON public.reportes;
CREATE POLICY panel_lee_reportes ON public.reportes
  FOR SELECT
  USING ((interno.es_superadmin() AND prestadora_id = interno.prestadora_actual())
         OR (prestadora_id = interno.prestadora_actual()
             AND EXISTS (SELECT 1 FROM public.usuarios u
                          WHERE u.id = auth.uid() AND u.rol = 'admin_prestadora')));

REVOKE UPDATE, DELETE ON TABLE public.reportes FROM authenticated, anon;

-- Y aunque alguien tuviera el permiso, la base no deja tocar un Reporte presentado.
CREATE FUNCTION interno.el_reporte_no_se_modifica() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'interno'
AS $$
BEGIN
  RAISE EXCEPTION 'El Reporte forma parte de la historia clínica y no se modifica ni se borra: se corrige con una aclaración'
    USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION interno.el_reporte_no_se_modifica() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.el_reporte_no_se_modifica() TO authenticated;

CREATE TRIGGER el_reporte_no_se_modifica
  BEFORE UPDATE OR DELETE ON public.reportes
  FOR EACH ROW EXECUTE FUNCTION interno.el_reporte_no_se_modifica();

-- La aclaración apunta al Reporte junto con su Prestadora y su Paciente, así no puede quedar
-- colgada de un Reporte de otra Prestadora ni hablar de otro Paciente.
ALTER TABLE public.reportes
  ADD CONSTRAINT reportes_id_prestadora_paciente_key UNIQUE (id, prestadora_id, paciente_id);

-- ─── Las aclaraciones ────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.aclaraciones_reporte (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id       uuid        NOT NULL REFERENCES public.prestadoras(id),
  reporte_id          uuid        NOT NULL,
  paciente_id         uuid        NOT NULL,
  texto               text        NOT NULL,
  escrita_por         uuid        NOT NULL REFERENCES public.usuarios(id),
  escrita_por_nombre  text        NOT NULL,
  escrita_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aclaraciones_reporte_texto_check CHECK (btrim(texto) <> '' AND char_length(texto) <= 5000),
  CONSTRAINT aclaraciones_reporte_reporte_fk FOREIGN KEY (reporte_id, prestadora_id, paciente_id)
    REFERENCES public.reportes (id, prestadora_id, paciente_id)
);

COMMENT ON TABLE public.aclaraciones_reporte IS
  'Lo que se agrega al pie de un Reporte presentado para corregirlo. El Reporte no se modifica nunca, y la aclaración tampoco: una aclaración equivocada se corrige con otra.';
COMMENT ON COLUMN public.aclaraciones_reporte.escrita_por_nombre IS
  'El nombre de quien la escribió, tal como estaba el día que la escribió. Es la firma de la aclaración y no cambia si después cambia el nombre de la cuenta.';

CREATE INDEX aclaraciones_reporte_reporte_idx ON public.aclaraciones_reporte (reporte_id, escrita_at);
CREATE INDEX aclaraciones_reporte_prestadora_idx ON public.aclaraciones_reporte (prestadora_id);

-- Quién puede aclarar un Reporte. Es el punto único de verdad: lo usa la política de escritura y lo
-- pregunta el Panel para saber si muestra el botón.
CREATE FUNCTION interno.puede_aclarar_el_reporte(p_reporte uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'interno'
AS $$
  SELECT p_reporte IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM reportes r
         JOIN turnos_guardia g ON g.id = r.turno_guardia_id AND g.prestadora_id = r.prestadora_id
        WHERE r.id = p_reporte
          AND r.prestadora_id = interno.prestadora_actual()
          AND interno.alcanza_la_informacion_de_salud(r.paciente_id)
          AND (g.asistente_id = interno.asistente_de_la_sesion()
               OR (interno.es_coordinador() AND interno.coordina_al_paciente(r.paciente_id))
               OR interno.es_admin_prestadora())
     );
$$;
REVOKE ALL ON FUNCTION interno.puede_aclarar_el_reporte(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.puede_aclarar_el_reporte(uuid) TO authenticated;

CREATE FUNCTION public.puede_aclarar_el_reporte(p_reporte uuid) RETURNS boolean
  LANGUAGE sql STABLE
  SET search_path TO 'public', 'interno'
AS $$
  SELECT interno.puede_aclarar_el_reporte(p_reporte);
$$;
REVOKE ALL ON FUNCTION public.puede_aclarar_el_reporte(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_aclarar_el_reporte(uuid) TO authenticated;

-- Lo que la aclaración no recibe de quien la manda: la Prestadora y el Paciente salen del Reporte,
-- y la firma, la fecha y la hora salen de la sesión y del reloj de la base.
CREATE FUNCTION interno.la_aclaracion_se_firma() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'interno'
AS $$
DECLARE
  v_prestadora uuid;
  v_paciente   uuid;
BEGIN
  SELECT r.prestadora_id, r.paciente_id INTO v_prestadora, v_paciente
    FROM reportes r
   WHERE r.id = NEW.reporte_id;
  IF v_prestadora IS NULL THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;

  NEW.prestadora_id := v_prestadora;
  NEW.paciente_id   := v_paciente;
  NEW.escrita_por   := interno.usuario_de_la_sesion();
  NEW.escrita_at    := now();
  SELECT coalesce(nullif(btrim(u.nombre), ''), u.nombre_de_usuario) INTO NEW.escrita_por_nombre
    FROM usuarios u
   WHERE u.id = NEW.escrita_por;
  IF NEW.escrita_por IS NULL OR NEW.escrita_por_nombre IS NULL THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION interno.la_aclaracion_se_firma() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.la_aclaracion_se_firma() TO authenticated;

CREATE TRIGGER la_aclaracion_se_firma
  BEFORE INSERT ON public.aclaraciones_reporte
  FOR EACH ROW EXECUTE FUNCTION interno.la_aclaracion_se_firma();

CREATE FUNCTION interno.la_aclaracion_no_se_modifica() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'interno'
AS $$
BEGIN
  RAISE EXCEPTION 'La aclaración del Reporte forma parte de la historia clínica y no se modifica ni se borra'
    USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION interno.la_aclaracion_no_se_modifica() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.la_aclaracion_no_se_modifica() TO authenticated;

CREATE TRIGGER la_aclaracion_no_se_modifica
  BEFORE UPDATE OR DELETE ON public.aclaraciones_reporte
  FOR EACH ROW EXECUTE FUNCTION interno.la_aclaracion_no_se_modifica();

-- ─── RLS ─────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.aclaraciones_reporte ENABLE ROW LEVEL SECURITY;

-- La lee quien lee el Reporte: la consulta al Reporte pasa por las políticas del Reporte.
CREATE POLICY quien_lee_el_reporte_lee_sus_aclaraciones ON public.aclaraciones_reporte
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.reportes r
                  WHERE r.id = aclaraciones_reporte.reporte_id
                    AND r.prestadora_id = aclaraciones_reporte.prestadora_id));

CREATE POLICY quien_puede_aclarar_agrega_la_aclaracion ON public.aclaraciones_reporte
  FOR INSERT TO authenticated
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND escrita_por = interno.usuario_de_la_sesion()
              AND interno.puede_aclarar_el_reporte(reporte_id));

CREATE POLICY la_informacion_de_salud_la_ve_quien_atiende ON public.aclaraciones_reporte
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (interno.alcanza_la_informacion_de_salud(paciente_id));

CREATE POLICY la_informacion_de_salud_pasa_por_el_registro ON public.aclaraciones_reporte
  AS RESTRICTIVE TO authenticated
  USING (interno.lectura_de_salud_anotada())
  WITH CHECK (interno.lectura_de_salud_anotada());

CREATE POLICY trabajo_sin_persona_lee_de_esta_prestadora ON public.aclaraciones_reporte
  FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

REVOKE ALL ON TABLE public.aclaraciones_reporte FROM PUBLIC, anon, authenticated, trabajo_sin_persona;
GRANT SELECT, INSERT ON TABLE public.aclaraciones_reporte TO authenticated;
GRANT SELECT ON TABLE public.aclaraciones_reporte TO trabajo_sin_persona;

-- ─── Es información de salud ─────────────────────────────────────────────────────────────────────
-- Entra en la lista: se lee y se escribe sólo por las funciones que anotan a qué Paciente alcanzó.
CREATE OR REPLACE FUNCTION interno.tablas_de_salud() RETURNS text[]
  LANGUAGE sql IMMUTABLE
AS $$
  SELECT ARRAY[
    'aclaraciones_reporte', 'alertas', 'cargas_sujetas_a_aprobacion', 'emergencias_turno_guardia',
    'hospitalizaciones_paciente', 'indicaciones_medicacion', 'informacion_de_salud_del_paciente',
    'informes_obra_social', 'rangos_referencia_vitales', 'reportes', 'versiones_registro_clinico'
  ]::text[];
$$;

COMMIT;
NOTIFY pgrst, 'reload schema';
