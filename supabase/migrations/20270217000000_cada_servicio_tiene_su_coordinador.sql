-- Una sola persona coordina cada Servicio, y la asigna la administración.
--
-- Hasta acá el Coordinador alcanzaba a un Paciente por la zona de los Asistentes que lo atendían, y
-- cualquier Coordinador de la Prestadora veía todos los Servicios. Desde acá:
--
--   1. Cada Servicio anota a su Coordinador. Mientras no tenga uno responde el Administrador, que es
--      el Coordinador general.
--   2. Lo asigna la administración, y sólo a una cuenta que coordina en esa Prestadora. Una vez
--      asignado se puede cambiar por otro, pero el Servicio no vuelve a quedarse sin nadie.
--   3. Sin Coordinador el Servicio no está habilitado: no se le arma ninguna guardia ni ninguna serie.
--      Las guardias que salen de una serie ya armada no se frenan: la serie pasó por acá al nacer.
--   4. Cada Coordinador ve sólo los Servicios que tiene asignados, sus guardias y sus series, y la
--      información de salud de los Pacientes de esos Servicios. La excepción es la alarma: quien la
--      toma ve la guardia mientras la tenga, como ya estaba escrito en las políticas de alarmas.
--
-- El Paciente pertenece al Servicio por quien lo contrata: es la misma regla que ya amarra a cada
-- guardia con su Servicio, en `interno.exigir_paciente_y_servicio_del_mismo_contratante`.

ALTER TABLE public.servicios
  ADD COLUMN coordinador_id uuid,
  ADD COLUMN coordinador_asignado_por uuid,
  ADD COLUMN coordinador_asignado_en timestamptz,
  ADD CONSTRAINT servicios_coordinador_de_la_misma_prestadora
    FOREIGN KEY (coordinador_id, prestadora_id) REFERENCES public.usuarios (id, prestadora_id);

CREATE INDEX servicios_coordinador_idx ON public.servicios (coordinador_id) WHERE coordinador_id IS NOT NULL;

-- 2. Quién asigna y a quién.
CREATE FUNCTION interno.el_coordinador_del_servicio_lo_asigna_la_administracion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.coordinador_id IS NOT DISTINCT FROM OLD.coordinador_id THEN
    NEW.coordinador_asignado_por := OLD.coordinador_asignado_por;
    NEW.coordinador_asignado_en := OLD.coordinador_asignado_en;
    RETURN NEW;
  END IF;

  IF NEW.coordinador_id IS NULL THEN
    IF TG_OP = 'UPDATE' THEN
      RAISE EXCEPTION 'el_servicio_no_se_queda_sin_coordinador';
    END IF;
    NEW.coordinador_asignado_por := NULL;
    NEW.coordinador_asignado_en := NULL;
    RETURN NEW;
  END IF;

  -- Una persona con sesión sólo asigna si administra la Prestadora. Lo que corre sin persona —el
  -- trabajo de la Prestadora, la carga de datos inventados— no pasa por esta pregunta.
  IF COALESCE(auth.jwt() ->> 'role', '') = 'authenticated'
     AND NOT (interno.es_admin_prestadora() OR interno.es_superadmin()) THEN
    RAISE EXCEPTION 'el_coordinador_lo_asigna_la_administracion';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM usuarios u
     WHERE u.id = NEW.coordinador_id
       AND u.prestadora_id = NEW.prestadora_id
       AND u.rol = 'coordinador'
       AND u.desactivada_en IS NULL
  ) THEN
    RAISE EXCEPTION 'el_asignado_no_coordina_en_la_prestadora';
  END IF;

  NEW.coordinador_asignado_por := auth.uid();
  NEW.coordinador_asignado_en := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION interno.el_coordinador_del_servicio_lo_asigna_la_administracion() FROM PUBLIC, anon;

CREATE TRIGGER el_coordinador_lo_asigna_la_administracion
  BEFORE INSERT OR UPDATE ON public.servicios
  FOR EACH ROW EXECUTE FUNCTION interno.el_coordinador_del_servicio_lo_asigna_la_administracion();

CREATE TRIGGER trg_auditoria_acceso
  AFTER INSERT OR DELETE OR UPDATE ON public.servicios
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria_de_acceso_mutacion();

-- 3. Sin Coordinador no hay guardias ni series.
CREATE FUNCTION interno.sin_coordinador_no_hay_guardias()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $$
BEGIN
  -- Las series no tienen `serie_id`: se pregunta por el registro entero para que la misma función
  -- sirva a las dos tablas.
  IF to_jsonb(NEW) ->> 'serie_id' IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.servicio_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.servicio_id IS NOT DISTINCT FROM OLD.servicio_id THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM servicios s
     WHERE s.id = NEW.servicio_id
       AND s.prestadora_id = NEW.prestadora_id
       AND s.coordinador_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'servicio_sin_coordinador:%', NEW.servicio_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION interno.sin_coordinador_no_hay_guardias() FROM PUBLIC, anon;

CREATE TRIGGER sin_coordinador_no_hay_guardias
  BEFORE INSERT OR UPDATE OF servicio_id ON public.guardias
  FOR EACH ROW EXECUTE FUNCTION interno.sin_coordinador_no_hay_guardias();

CREATE TRIGGER sin_coordinador_no_hay_guardias
  BEFORE INSERT OR UPDATE OF servicio_id ON public.series_guardias
  FOR EACH ROW EXECUTE FUNCTION interno.sin_coordinador_no_hay_guardias();

-- 4. Qué alcanza cada Coordinador.
CREATE FUNCTION interno.coordina_el_servicio(p_servicio uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $$
  SELECT p_servicio IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM servicios s
        WHERE s.id = p_servicio
          AND s.prestadora_id = interno.prestadora_actual()
          AND s.coordinador_id = auth.uid()
     );
$$;

CREATE FUNCTION interno.coordina_al_paciente(p_paciente uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $$
  SELECT p_paciente IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM pacientes p
         JOIN servicios s ON s.prestadora_id = p.prestadora_id
                         AND s.tipo_contratante = 'cliente'
                         AND s.contratante_id = p.cliente_id
        WHERE p.id = p_paciente
          AND p.prestadora_id = interno.prestadora_actual()
          AND s.estado = 'vigente'
          AND s.coordinador_id = auth.uid()
     );
$$;

-- Las llaman las políticas, que se evalúan con los permisos de quien consulta: conservan
-- `authenticated`.
REVOKE ALL ON FUNCTION interno.coordina_el_servicio(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.coordina_al_paciente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.coordina_el_servicio(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION interno.coordina_al_paciente(uuid) TO authenticated;

DROP POLICY panel_gestiona_servicios ON public.servicios;

CREATE POLICY administracion_gestiona_servicios ON public.servicios
  FOR ALL
  USING (prestadora_id = interno.prestadora_actual()
         AND (interno.es_superadmin() OR interno.es_admin_prestadora()))
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND (interno.es_superadmin() OR interno.es_admin_prestadora()));

CREATE POLICY coordinador_gestiona_sus_servicios ON public.servicios
  FOR ALL
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.es_coordinador()
         AND coordinador_id = auth.uid())
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND interno.es_coordinador()
              AND coordinador_id = auth.uid());

DROP POLICY coordinador_gestiona_guardias_de_su_zona ON public.guardias;

CREATE POLICY coordinador_gestiona_guardias_de_sus_servicios ON public.guardias
  FOR ALL
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.es_coordinador()
         AND CASE WHEN servicio_id IS NULL THEN interno.coordinador_alcanza_guardia(asistente_id)
                  ELSE interno.coordina_el_servicio(servicio_id) END);

DROP POLICY coordinador_gestiona_series_guardias_de_su_zona ON public.series_guardias;

CREATE POLICY coordinador_gestiona_series_guardias_de_sus_servicios ON public.series_guardias
  FOR ALL
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.es_coordinador()
         AND CASE WHEN servicio_id IS NULL THEN interno.coordinador_alcanza_guardia(asistente_id)
                  ELSE interno.coordina_el_servicio(servicio_id) END);

-- La información de salud: el Coordinador alcanza a los Pacientes de sus Servicios, y ya no a los
-- de la zona de los Asistentes que los atienden.
CREATE OR REPLACE FUNCTION interno.atiende_al_paciente(p_paciente uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $function$
  WITH yo AS (
    SELECT auth.uid()                       AS uid,
           interno.prestadora_actual()         AS tenant,
           interno.asistente_de_la_sesion() AS asistente
  ),
  pac AS (
    SELECT p.id, p.cliente_id
      FROM pacientes p, yo
     WHERE p.id = p_paciente
       AND p.prestadora_id = yo.tenant
  )
  SELECT EXISTS (
    SELECT 1
      FROM pac, yo
     WHERE yo.uid IS NOT NULL
       AND (
         -- Quien recibe el Servicio.
         pac.cliente_id = interno.cliente_id_de_usuario(yo.uid)

         -- Quien coordina uno de sus Servicios.
         OR interno.coordina_al_paciente(pac.id)

         -- Quien la Prestadora sumó al equipo.
         OR EXISTS (
           SELECT 1 FROM equipo_paciente e
            WHERE e.paciente_id = pac.id
              AND e.prestadora_id = yo.tenant
              AND e.situacion = 'sumada'
              AND (e.usuario_id = yo.uid
                   OR (yo.asistente IS NOT NULL AND e.asistente_id = yo.asistente))
         )

         -- Quien lo presta, guardia por guardia.
         OR EXISTS (
           SELECT 1
             FROM guardias g
             JOIN servicios s ON s.id = g.servicio_id
                             AND s.prestadora_id = g.prestadora_id
                             AND s.estado = 'vigente'
            WHERE g.prestadora_id = yo.tenant
              AND g.estado <> 'cancelada'
              AND yo.asistente IS NOT NULL
              AND g.asistente_id = yo.asistente
              AND (g.paciente_id = pac.id
                   OR EXISTS (SELECT 1 FROM guardia_pacientes gp
                               WHERE gp.guardia_id = g.id AND gp.paciente_id = pac.id))
         )

         -- Quien lo presta por una serie que sigue en pie.
         OR EXISTS (
           SELECT 1
             FROM series_guardias sg
             JOIN servicios s ON s.id = sg.servicio_id
                             AND s.prestadora_id = sg.prestadora_id
                             AND s.estado = 'vigente'
            WHERE sg.prestadora_id = yo.tenant
              AND sg.estado <> 'cancelada'
              AND yo.asistente IS NOT NULL
              AND sg.asistente_id = yo.asistente
              AND (sg.paciente_id = pac.id
                   OR EXISTS (SELECT 1 FROM series_guardias_pacientes sp
                               WHERE sp.serie_id = sg.id AND sp.paciente_id = pac.id))
         )

         -- Quien tiene tomada una alarma de una de sus guardias, mientras la tenga.
         OR EXISTS (
           SELECT 1
             FROM guardias g
            WHERE g.prestadora_id = yo.tenant
              AND g.id = ANY (interno.guardias_a_la_vista_por_una_alarma(true))
              AND (g.paciente_id = pac.id
                   OR EXISTS (SELECT 1 FROM guardia_pacientes gp
                               WHERE gp.guardia_id = g.id AND gp.paciente_id = pac.id))
         )
       )
  )
$function$;

NOTIFY pgrst, 'reload schema';
