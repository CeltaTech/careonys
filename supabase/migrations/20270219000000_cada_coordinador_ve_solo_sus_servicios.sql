-- Cada Coordinador ve sólo sus Servicios.
--
-- Hasta acá el Coordinador quedaba atado a su Servicio en los Servicios, las guardias y las series,
-- pero seguía leyendo a todos los Pacientes y Clientes de la Prestadora, y lo que cuelga de una
-- guardia —reportes, emergencias, recorridos, relevos— lo alcanzaba por la zona de los Asistentes.
-- Desde acá alcanza lo mismo por el mismo camino:
--
--   1. Los Servicios que coordina, y los de quien está cubriendo mientras dure la ausencia.
--   2. Los Clientes que contratan esos Servicios, y sus Pacientes.
--   3. Las guardias y las series de esos Servicios, y todo lo que cuelga de ellas.
--   4. La excepción sigue siendo la alarma: quien la toma ve la guardia mientras la tenga.
--
-- Lo que es del Asistente —su legajo, sus documentos, sus ausencias, sus mensajes— sigue por zona:
-- un Asistente trabaja para varios Servicios y lo recluta la Prestadora, no un Servicio.

-- 1. A quién representa la sesión: a sí misma, y a quien está cubriendo por una ausencia.
CREATE FUNCTION interno.coordinadores_que_represento()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN '{}'::uuid[]
              ELSE ARRAY(
                SELECT auth.uid()
                UNION
                SELECT a.usuario_id
                  FROM ausencias a
                 WHERE a.coordinador_que_cubre_id = auth.uid()
                   AND a.prestadora_id = interno.prestadora_actual()
                   AND a.usuario_id IS NOT NULL
                   AND a.fecha_inicio <= current_date
                   AND (a.fecha_vuelta_real IS NULL OR a.fecha_vuelta_real > current_date)
              ) END;
$$;

CREATE OR REPLACE FUNCTION interno.coordina_el_servicio(p_servicio uuid)
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
          AND s.coordinador_id = ANY (interno.coordinadores_que_represento())
     );
$$;

CREATE OR REPLACE FUNCTION interno.coordina_al_paciente(p_paciente uuid)
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
          AND s.coordinador_id = ANY (interno.coordinadores_que_represento())
     );
$$;

-- 2. Los Clientes y sus Pacientes. El Servicio puede no estar vigente: quien lo coordinó sigue
-- alcanzando a su Cliente para cerrarlo, facturarlo o volver a empezar. La información de salud no
-- pasa por acá: la decide `atiende_al_paciente`, que pide un Servicio vigente.
CREATE FUNCTION interno.coordina_un_servicio_del_cliente(p_cliente uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $$
  SELECT p_cliente IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM servicios s
        WHERE s.prestadora_id = interno.prestadora_actual()
          AND s.tipo_contratante = 'cliente'
          AND s.contratante_id = p_cliente
          AND s.coordinador_id = ANY (interno.coordinadores_que_represento())
     );
$$;

CREATE FUNCTION interno.coordinador_ve_al_paciente(p_paciente uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $$
  SELECT p_paciente IS NOT NULL
     AND interno.es_coordinador()
     AND (interno.atiende_al_paciente(p_paciente)
          OR EXISTS (
            SELECT 1 FROM pacientes p
             WHERE p.id = p_paciente
               AND p.prestadora_id = interno.prestadora_actual()
               AND interno.coordina_un_servicio_del_cliente(p.cliente_id)
          ));
$$;

CREATE FUNCTION interno.coordinador_ve_al_cliente(p_cliente uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $$
  SELECT p_cliente IS NOT NULL
     AND interno.es_coordinador()
     AND (interno.coordina_un_servicio_del_cliente(p_cliente)
          OR EXISTS (
            SELECT 1 FROM pacientes p
             WHERE p.cliente_id = p_cliente
               AND p.prestadora_id = interno.prestadora_actual()
               AND interno.atiende_al_paciente(p.id)
          ));
$$;

-- 3. Las guardias y las series. Se pregunta con los datos de la fila para que la política de
-- `guardias` no tenga que volver a leer `guardias`; los Pacientes de la lista se leen acá adentro
-- para no entrar en la política de `guardia_pacientes`, que pregunta por la guardia.
CREATE FUNCTION interno.coordinador_alcanza_la_guardia_de(p_servicio uuid, p_paciente uuid, p_guardia uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $$
  SELECT CASE
    WHEN p_servicio IS NOT NULL THEN interno.coordina_el_servicio(p_servicio)
    ELSE (p_paciente IS NOT NULL AND interno.coordinador_ve_al_paciente(p_paciente))
      OR EXISTS (SELECT 1 FROM guardia_pacientes gp
                  WHERE gp.guardia_id = p_guardia
                    AND interno.coordinador_ve_al_paciente(gp.paciente_id))
  END;
$$;

CREATE FUNCTION interno.coordinador_alcanza_la_serie_de(p_servicio uuid, p_paciente uuid, p_serie uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $$
  SELECT CASE
    WHEN p_servicio IS NOT NULL THEN interno.coordina_el_servicio(p_servicio)
    ELSE (p_paciente IS NOT NULL AND interno.coordinador_ve_al_paciente(p_paciente))
      OR EXISTS (SELECT 1 FROM series_guardias_pacientes sp
                  WHERE sp.serie_id = p_serie
                    AND interno.coordinador_ve_al_paciente(sp.paciente_id))
  END;
$$;

-- Para lo que cuelga de una guardia: reportes, emergencias, recorridos, relevos.
CREATE FUNCTION interno.coordinador_ve_la_guardia(p_guardia uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $$
  SELECT p_guardia IS NOT NULL
     AND interno.es_coordinador()
     AND (EXISTS (
            SELECT 1 FROM guardias g
             WHERE g.id = p_guardia
               AND g.prestadora_id = interno.prestadora_actual()
               AND interno.coordinador_alcanza_la_guardia_de(g.servicio_id, g.paciente_id, g.id)
          )
          OR p_guardia = ANY (interno.guardias_a_la_vista_por_una_alarma(true)));
$$;

CREATE FUNCTION interno.coordinador_ve_la_serie(p_serie uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $$
  SELECT p_serie IS NOT NULL
     AND interno.es_coordinador()
     AND EXISTS (
       SELECT 1 FROM series_guardias sg
        WHERE sg.id = p_serie
          AND sg.prestadora_id = interno.prestadora_actual()
          AND interno.coordinador_alcanza_la_serie_de(sg.servicio_id, sg.paciente_id, sg.id)
     );
$$;

-- Las llaman las políticas, que se evalúan con los permisos de quien consulta: conservan
-- `authenticated`.
REVOKE ALL ON FUNCTION interno.coordinadores_que_represento() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.coordina_un_servicio_del_cliente(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.coordinador_ve_al_paciente(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.coordinador_ve_al_cliente(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.coordinador_alcanza_la_guardia_de(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.coordinador_alcanza_la_serie_de(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.coordinador_ve_la_guardia(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.coordinador_ve_la_serie(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.coordinadores_que_represento() TO authenticated;
GRANT EXECUTE ON FUNCTION interno.coordina_un_servicio_del_cliente(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION interno.coordinador_ve_al_paciente(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION interno.coordinador_ve_al_cliente(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION interno.coordinador_alcanza_la_guardia_de(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION interno.coordinador_alcanza_la_serie_de(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION interno.coordinador_ve_la_guardia(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION interno.coordinador_ve_la_serie(uuid) TO authenticated;

-- 4. El Coordinador no cambia quién contrata su Servicio: sería la forma de alcanzar a otro Cliente.
CREATE FUNCTION interno.el_contratante_lo_fija_la_administracion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $$
BEGIN
  IF (NEW.contratante_id IS DISTINCT FROM OLD.contratante_id
      OR NEW.tipo_contratante IS DISTINCT FROM OLD.tipo_contratante)
     AND COALESCE(auth.jwt() ->> 'role', '') = 'authenticated'
     AND NOT (interno.es_admin_prestadora() OR interno.es_superadmin()) THEN
    RAISE EXCEPTION 'el_contratante_lo_fija_la_administracion';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION interno.el_contratante_lo_fija_la_administracion() FROM PUBLIC, anon;

CREATE TRIGGER el_contratante_lo_fija_la_administracion
  BEFORE UPDATE OF contratante_id, tipo_contratante ON public.servicios
  FOR EACH ROW EXECUTE FUNCTION interno.el_contratante_lo_fija_la_administracion();

-- 5. Servicios, guardias y series.
DROP POLICY coordinador_gestiona_sus_servicios ON public.servicios;
CREATE POLICY coordinador_gestiona_sus_servicios ON public.servicios
  FOR ALL
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.es_coordinador()
         AND coordinador_id = ANY (interno.coordinadores_que_represento()))
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND interno.es_coordinador()
              AND coordinador_id = ANY (interno.coordinadores_que_represento()));

DROP POLICY coordinador_gestiona_guardias_de_sus_servicios ON public.guardias;
CREATE POLICY coordinador_gestiona_guardias_de_sus_servicios ON public.guardias
  FOR ALL
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.es_coordinador()
         AND interno.coordinador_alcanza_la_guardia_de(servicio_id, paciente_id, id));

DROP POLICY coordinador_cierra_servicio_guardias ON public.guardias;
CREATE POLICY coordinador_cierra_servicio_guardias ON public.guardias
  FOR ALL
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.es_coordinador()
         AND interno.coordina_el_servicio(servicio_id)
         AND EXISTS (SELECT 1 FROM cierres_servicio_paciente c
                      WHERE c.servicio_id = guardias.servicio_id
                        AND c.prestadora_id = guardias.prestadora_id))
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND interno.es_coordinador()
              AND interno.coordina_el_servicio(servicio_id)
              AND EXISTS (SELECT 1 FROM cierres_servicio_paciente c
                           WHERE c.servicio_id = guardias.servicio_id
                             AND c.prestadora_id = guardias.prestadora_id));

DROP POLICY coordinador_gestiona_series_guardias_de_sus_servicios ON public.series_guardias;
CREATE POLICY coordinador_gestiona_series_guardias_de_sus_servicios ON public.series_guardias
  FOR ALL
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.es_coordinador()
         AND interno.coordinador_alcanza_la_serie_de(servicio_id, paciente_id, id));

DROP POLICY coordinador_cierra_servicio_series_guardias ON public.series_guardias;
CREATE POLICY coordinador_cierra_servicio_series_guardias ON public.series_guardias
  FOR ALL
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.es_coordinador()
         AND interno.coordina_el_servicio(servicio_id)
         AND EXISTS (SELECT 1 FROM cierres_servicio_paciente c
                      WHERE c.servicio_id = series_guardias.servicio_id
                        AND c.prestadora_id = series_guardias.prestadora_id))
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND interno.es_coordinador()
              AND interno.coordina_el_servicio(servicio_id)
              AND EXISTS (SELECT 1 FROM cierres_servicio_paciente c
                           WHERE c.servicio_id = series_guardias.servicio_id
                             AND c.prestadora_id = series_guardias.prestadora_id));

DROP POLICY el_panel_arma_la_lista_de_pacientes ON public.guardia_pacientes;
CREATE POLICY el_panel_arma_la_lista_de_pacientes ON public.guardia_pacientes
  FOR ALL
  USING (prestadora_id = interno.prestadora_actual()
         AND (interno.es_superadmin() OR interno.es_admin_prestadora()
              OR interno.coordinador_ve_la_guardia(guardia_id)))
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND (interno.es_superadmin() OR interno.es_admin_prestadora()
                   OR interno.coordinador_ve_la_guardia(guardia_id)));

DROP POLICY el_panel_arma_la_lista_de_pacientes_de_la_serie ON public.series_guardias_pacientes;
CREATE POLICY el_panel_arma_la_lista_de_pacientes_de_la_serie ON public.series_guardias_pacientes
  FOR ALL
  USING (prestadora_id = interno.prestadora_actual()
         AND (interno.es_superadmin() OR interno.es_admin_prestadora()
              OR interno.coordinador_ve_la_serie(serie_id)))
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND (interno.es_superadmin() OR interno.es_admin_prestadora()
                   OR interno.coordinador_ve_la_serie(serie_id)));

DROP POLICY panel_gestiona_tareas_del_servicio ON public.tareas_del_servicio;
CREATE POLICY panel_gestiona_tareas_del_servicio ON public.tareas_del_servicio
  FOR ALL
  USING (interno.es_la_administracion_de_la_prestadora(prestadora_id)
         OR (prestadora_id = interno.prestadora_actual()
             AND interno.es_coordinador()
             AND interno.coordina_el_servicio(servicio_id)))
  WITH CHECK (interno.es_la_administracion_de_la_prestadora(prestadora_id)
              OR (prestadora_id = interno.prestadora_actual()
                  AND interno.es_coordinador()
                  AND interno.coordina_el_servicio(servicio_id)));

-- 6. Clientes y Pacientes.
DROP POLICY coordinador_lee_clientes ON public.clientes;
CREATE POLICY coordinador_lee_clientes ON public.clientes
  FOR SELECT
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.coordinador_ve_al_cliente(id));

DROP POLICY coordinador_edita_clientes ON public.clientes;
CREATE POLICY coordinador_edita_clientes ON public.clientes
  FOR UPDATE
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.coordinador_ve_al_cliente(id)
         AND interno.tiene_permiso('editar_datos_cliente'));

DROP POLICY coordinador_gestiona_personas_autorizadas ON public.personas_autorizadas;
CREATE POLICY coordinador_gestiona_personas_autorizadas ON public.personas_autorizadas
  FOR ALL
  USING (EXISTS (SELECT 1 FROM clientes f
                  WHERE f.id = personas_autorizadas.cliente_id
                    AND f.prestadora_id = interno.prestadora_actual())
         AND interno.coordinador_ve_al_cliente(cliente_id)
         AND interno.tiene_permiso('editar_datos_cliente'));

DROP POLICY coordinador_lee_pacientes ON public.pacientes;
CREATE POLICY coordinador_lee_pacientes ON public.pacientes
  FOR SELECT
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.coordinador_ve_al_paciente(id));

DROP POLICY coordinador_edita_pacientes ON public.pacientes;
CREATE POLICY coordinador_edita_pacientes ON public.pacientes
  FOR UPDATE
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.coordinador_ve_al_paciente(id)
         AND interno.tiene_permiso('editar_datos_paciente'));

DROP POLICY coordinador_agrega_pacientes ON public.pacientes;
CREATE POLICY coordinador_agrega_pacientes ON public.pacientes
  FOR INSERT
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND interno.es_coordinador()
              AND interno.coordina_un_servicio_del_cliente(cliente_id)
              AND interno.tiene_permiso('editar_datos_paciente'));

DROP POLICY coordinador_lee_informacion_de_salud ON public.informacion_de_salud_del_paciente;
CREATE POLICY coordinador_lee_informacion_de_salud ON public.informacion_de_salud_del_paciente
  FOR SELECT
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.coordinador_ve_al_paciente(paciente_id));

DROP POLICY coordinador_edita_informacion_de_salud ON public.informacion_de_salud_del_paciente;
CREATE POLICY coordinador_edita_informacion_de_salud ON public.informacion_de_salud_del_paciente
  FOR UPDATE
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.coordinador_ve_al_paciente(paciente_id)
         AND interno.tiene_permiso('editar_datos_paciente'));

DROP POLICY coordinador_agrega_informacion_de_salud ON public.informacion_de_salud_del_paciente;
CREATE POLICY coordinador_agrega_informacion_de_salud ON public.informacion_de_salud_del_paciente
  FOR INSERT
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND interno.coordinador_ve_al_paciente(paciente_id)
              AND interno.tiene_permiso('editar_datos_paciente'));

DROP POLICY coordinador_lee_indicaciones_medicacion ON public.indicaciones_medicacion;
CREATE POLICY coordinador_lee_indicaciones_medicacion ON public.indicaciones_medicacion
  FOR SELECT
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.coordinador_ve_al_paciente(paciente_id));

DROP POLICY consentimientos_medicacion_los_lee_el_panel ON public.consentimientos_medicacion;
CREATE POLICY consentimientos_medicacion_los_lee_el_panel ON public.consentimientos_medicacion
  FOR SELECT
  USING (prestadora_id = interno.prestadora_actual()
         AND (interno.es_superadmin() OR interno.es_admin_prestadora()
              OR EXISTS (SELECT 1 FROM indicaciones_medicacion i
                          WHERE i.id = consentimientos_medicacion.indicacion_id
                            AND interno.coordinador_ve_al_paciente(i.paciente_id))));

DROP POLICY coordinador_lee_autorizaciones_monitoreo ON public.autorizaciones_monitoreo_paciente;
CREATE POLICY coordinador_lee_autorizaciones_monitoreo ON public.autorizaciones_monitoreo_paciente
  FOR SELECT
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.coordinador_ve_al_paciente(paciente_id));

-- Los rangos sin Paciente son los de la Prestadora entera.
DROP POLICY coordinador_lee_rangos_vitales ON public.rangos_referencia_vitales;
CREATE POLICY coordinador_lee_rangos_vitales ON public.rangos_referencia_vitales
  FOR SELECT
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.es_coordinador()
         AND (paciente_id IS NULL OR interno.coordinador_ve_al_paciente(paciente_id)));

DROP POLICY coordinador_gestiona_alertas ON public.alertas;
CREATE POLICY coordinador_gestiona_alertas ON public.alertas
  FOR ALL
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.coordinador_ve_al_paciente(paciente_id));

DROP POLICY panel_gestiona_domicilios_temporales ON public.domicilios_temporales_paciente;
CREATE POLICY panel_gestiona_domicilios_temporales ON public.domicilios_temporales_paciente
  FOR ALL
  USING (prestadora_id = interno.prestadora_actual()
         AND (interno.es_superadmin() OR interno.es_admin_prestadora()
              OR interno.coordinador_ve_al_paciente(paciente_id)));

DROP POLICY panel_gestiona_hospitalizaciones_paciente ON public.hospitalizaciones_paciente;
CREATE POLICY panel_gestiona_hospitalizaciones_paciente ON public.hospitalizaciones_paciente
  FOR ALL
  USING (prestadora_id = interno.prestadora_actual()
         AND (interno.es_superadmin() OR interno.es_admin_prestadora()
              OR interno.coordinador_ve_al_paciente(paciente_id)));

DROP POLICY panel_gestiona_prestaciones ON public.prestaciones;
CREATE POLICY panel_gestiona_prestaciones ON public.prestaciones
  FOR ALL
  USING (prestadora_id = interno.prestadora_actual()
         AND (interno.es_superadmin() OR interno.es_admin_prestadora()
              OR interno.coordinador_ve_al_paciente(paciente_id)));

DROP POLICY coordinador_y_admin_gestionan_cierres_servicio_paciente ON public.cierres_servicio_paciente;
CREATE POLICY coordinador_y_admin_gestionan_cierres_servicio_paciente ON public.cierres_servicio_paciente
  FOR ALL
  USING (prestadora_id = interno.prestadora_actual()
         AND (interno.es_admin_prestadora()
              OR interno.coordinador_ve_al_paciente(paciente_id)));

DROP POLICY coordinador_y_admin_gestionan_cierre_servicio_asistentes ON public.cierre_servicio_asistentes;
CREATE POLICY coordinador_y_admin_gestionan_cierre_servicio_asistentes ON public.cierre_servicio_asistentes
  FOR ALL
  USING (prestadora_id = interno.prestadora_actual()
         AND (interno.es_admin_prestadora()
              OR EXISTS (SELECT 1 FROM cierres_servicio_paciente c
                          WHERE c.id = cierre_servicio_asistentes.cierre_id
                            AND c.prestadora_id = cierre_servicio_asistentes.prestadora_id
                            AND interno.coordinador_ve_al_paciente(c.paciente_id))));

DROP POLICY panel_lee_el_equipo_del_paciente ON public.equipo_paciente;
CREATE POLICY panel_lee_el_equipo_del_paciente ON public.equipo_paciente
  FOR SELECT
  USING (prestadora_id = interno.prestadora_actual()
         AND (interno.es_superadmin() OR interno.es_admin_prestadora()
              OR interno.coordinador_ve_al_paciente(paciente_id)));

DROP POLICY coordinacion_corrige_el_equipo_del_paciente ON public.equipo_paciente;
CREATE POLICY coordinacion_corrige_el_equipo_del_paciente ON public.equipo_paciente
  FOR ALL
  USING (prestadora_id = interno.prestadora_actual()
         AND (interno.es_admin_prestadora()
              OR (interno.coordinador_ve_al_paciente(paciente_id)
                  AND interno.tiene_permiso('corregir_equipo_del_paciente'))))
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND (interno.es_admin_prestadora()
                   OR (interno.coordinador_ve_al_paciente(paciente_id)
                       AND interno.tiene_permiso('corregir_equipo_del_paciente'))));

DROP POLICY coordinador_gestiona_informes_obra_social_de_su_zona ON public.informes_obra_social;
CREATE POLICY coordinador_gestiona_informes_obra_social_de_sus_servicios ON public.informes_obra_social
  FOR ALL TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.coordinador_ve_al_paciente(paciente_id));

DROP POLICY coordinador_ve_notificaciones_cierre_servicio_de_su_zona ON public.notificaciones_cierre_servicio;
CREATE POLICY coordinador_ve_notificaciones_cierre_servicio_de_sus_servicios ON public.notificaciones_cierre_servicio
  FOR ALL TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.coordinador_ve_al_paciente(paciente_id));

DROP POLICY coordinador_inserta_notificaciones_cierre_servicio ON public.notificaciones_cierre_servicio;
CREATE POLICY coordinador_inserta_notificaciones_cierre_servicio ON public.notificaciones_cierre_servicio
  FOR INSERT
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND cerrado_por = auth.uid()
              AND interno.coordinador_ve_al_paciente(paciente_id));

-- 7. Lo que cuelga de una guardia.
DROP POLICY coordinador_gestiona_reportes_de_su_zona ON public.reportes;
CREATE POLICY coordinador_gestiona_reportes_de_sus_servicios ON public.reportes
  FOR ALL TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.coordinador_ve_la_guardia(guardia_id));

DROP POLICY coordinador_lee_emergencias_de_su_zona ON public.emergencias_guardia;
CREATE POLICY coordinador_lee_emergencias_de_sus_servicios ON public.emergencias_guardia
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.coordinador_ve_la_guardia(guardia_id));

DROP POLICY coordinador_atiende_una_emergencia_de_su_zona_o_tomada ON public.emergencias_guardia;
CREATE POLICY coordinador_atiende_una_emergencia_de_sus_servicios_o_tomada ON public.emergencias_guardia
  FOR UPDATE TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.es_coordinador()
         AND atendida_at IS NULL
         AND (interno.coordinador_ve_la_guardia(guardia_id)
              OR id = ANY ((SELECT interno.alarmas_que_tengo_tomadas('emergencia_guardia'))::uuid[])))
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND interno.es_coordinador()
              AND atendida_at IS NOT NULL
              AND atendida_por = auth.uid());

DROP POLICY coordinador_gestiona_guardias_tracking_gps_de_su_zona ON public.guardias_tracking_gps;
CREATE POLICY coordinador_gestiona_guardias_tracking_gps_de_sus_servicios ON public.guardias_tracking_gps
  FOR ALL TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.coordinador_ve_la_guardia(guardia_id));

DROP POLICY coordinador_gestiona_incidentes_relevo_de_su_zona ON public.incidentes_relevo;
CREATE POLICY coordinador_gestiona_incidentes_relevo_de_sus_servicios ON public.incidentes_relevo
  FOR ALL TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND (interno.coordinador_ve_la_guardia(guardia_entrante_id)
              OR interno.coordinador_ve_la_guardia(guardia_saliente_id)));

DROP POLICY coordinador_gestiona_alertas_tempranas_guardia_de_su_zona ON public.alertas_tempranas_guardia;
CREATE POLICY coordinador_gestiona_alertas_tempranas_guardia_de_sus_servicios ON public.alertas_tempranas_guardia
  FOR ALL TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.coordinador_ve_la_guardia(guardia_id));

DROP POLICY coordinador_lee_descansos_de_su_zona ON public.descansos_guardia;
CREATE POLICY coordinador_lee_descansos_de_sus_servicios ON public.descansos_guardia
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.coordinador_ve_la_guardia(guardia_id));

DROP POLICY coordinador_gestiona_consentimientos_paciente_solo ON public.consentimientos_paciente_solo;
CREATE POLICY coordinador_gestiona_consentimientos_paciente_solo ON public.consentimientos_paciente_solo
  FOR ALL
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.coordinador_ve_la_guardia(guardia_id));

DROP POLICY coordinador_lee_extensiones_de_turno ON public.extensiones_de_turno;
CREATE POLICY coordinador_lee_extensiones_de_turno ON public.extensiones_de_turno
  FOR SELECT
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.coordinador_ve_la_guardia(guardia_id));

DROP POLICY coordinador_gestiona_comprobaciones_de_su_zona ON public.guardia_comprobaciones;
CREATE POLICY coordinador_gestiona_comprobaciones_de_sus_servicios ON public.guardia_comprobaciones
  FOR ALL
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.coordinador_ve_la_guardia(guardia_id));

DROP POLICY coordinador_gestiona_incidentes_turno_sin_cubrir ON public.incidentes_turno_sin_cubrir;
CREATE POLICY coordinador_gestiona_incidentes_turno_sin_cubrir ON public.incidentes_turno_sin_cubrir
  FOR ALL
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.coordinador_ve_la_guardia(guardia_id));

DROP POLICY coordinador_gestiona_excepciones_familiar_relevo_de_su_zona ON public.excepciones_familiar_relevo;
CREATE POLICY coordinador_gestiona_excepciones_de_relevo_de_sus_servicios ON public.excepciones_familiar_relevo
  FOR ALL
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.coordinador_ve_la_guardia(guardia_id));

NOTIFY pgrst, 'reload schema';
