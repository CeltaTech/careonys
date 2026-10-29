-- Las reglas de acceso del Coordinador y del Panel son de personas: se ponen sólo para quien inició
-- sesión. Escritas sin rol, valían para todos los roles, y la base las evaluaba también para el
-- trabajo sin persona, que no tiene permiso sobre las funciones que llaman. Ahí la consulta entera
-- fallaba con «permission denied for function» en vez de seguir con sus propias reglas.
--
-- El trabajo sin persona no pierde nada: ninguna de estas reglas lo dejaba pasar, porque todas
-- piden el rol de quien inició sesión. Tiene sus propias reglas, de a una Prestadora por vez.

ALTER POLICY consentimientos_medicacion_los_lee_el_panel ON public.consentimientos_medicacion TO authenticated;
ALTER POLICY coordinacion_corrige_el_equipo_del_paciente ON public.equipo_paciente TO authenticated;
ALTER POLICY coordinador_agrega_informacion_de_salud ON public.informacion_de_salud_del_paciente TO authenticated;
ALTER POLICY coordinador_agrega_pacientes ON public.pacientes TO authenticated;
ALTER POLICY coordinador_cierra_servicio_guardias ON public.guardias TO authenticated;
ALTER POLICY coordinador_cierra_servicio_series_guardias ON public.series_guardias TO authenticated;
ALTER POLICY coordinador_edita_clientes ON public.clientes TO authenticated;
ALTER POLICY coordinador_edita_informacion_de_salud ON public.informacion_de_salud_del_paciente TO authenticated;
ALTER POLICY coordinador_edita_pacientes ON public.pacientes TO authenticated;
ALTER POLICY coordinador_gestiona_alertas ON public.alertas TO authenticated;
ALTER POLICY coordinador_gestiona_comprobaciones_de_sus_servicios ON public.guardia_comprobaciones TO authenticated;
ALTER POLICY coordinador_gestiona_consentimientos_paciente_solo ON public.consentimientos_paciente_solo TO authenticated;
ALTER POLICY coordinador_gestiona_excepciones_de_relevo_de_sus_servicios ON public.excepciones_familiar_relevo TO authenticated;
ALTER POLICY coordinador_gestiona_guardias_de_sus_servicios ON public.guardias TO authenticated;
ALTER POLICY coordinador_gestiona_incidentes_turno_sin_cubrir ON public.incidentes_turno_sin_cubrir TO authenticated;
ALTER POLICY coordinador_gestiona_personas_autorizadas ON public.personas_autorizadas TO authenticated;
ALTER POLICY coordinador_gestiona_series_guardias_de_sus_servicios ON public.series_guardias TO authenticated;
ALTER POLICY coordinador_gestiona_sus_servicios ON public.servicios TO authenticated;
ALTER POLICY coordinador_inserta_notificaciones_cierre_servicio ON public.notificaciones_cierre_servicio TO authenticated;
ALTER POLICY coordinador_lee_autorizaciones_monitoreo ON public.autorizaciones_monitoreo_paciente TO authenticated;
ALTER POLICY coordinador_lee_clientes ON public.clientes TO authenticated;
ALTER POLICY coordinador_lee_extensiones_de_turno ON public.extensiones_de_turno TO authenticated;
ALTER POLICY coordinador_lee_indicaciones_medicacion ON public.indicaciones_medicacion TO authenticated;
ALTER POLICY coordinador_lee_informacion_de_salud ON public.informacion_de_salud_del_paciente TO authenticated;
ALTER POLICY coordinador_lee_pacientes ON public.pacientes TO authenticated;
ALTER POLICY coordinador_lee_rangos_vitales ON public.rangos_referencia_vitales TO authenticated;
ALTER POLICY coordinador_y_admin_gestionan_cierre_servicio_asistentes ON public.cierre_servicio_asistentes TO authenticated;
ALTER POLICY coordinador_y_admin_gestionan_cierres_servicio_paciente ON public.cierres_servicio_paciente TO authenticated;
ALTER POLICY el_panel_arma_la_lista_de_pacientes ON public.guardia_pacientes TO authenticated;
ALTER POLICY el_panel_arma_la_lista_de_pacientes_de_la_serie ON public.series_guardias_pacientes TO authenticated;
ALTER POLICY panel_gestiona_domicilios_temporales ON public.domicilios_temporales_paciente TO authenticated;
ALTER POLICY panel_gestiona_hospitalizaciones_paciente ON public.hospitalizaciones_paciente TO authenticated;
ALTER POLICY panel_gestiona_prestaciones ON public.prestaciones TO authenticated;
ALTER POLICY panel_gestiona_tareas_del_servicio ON public.tareas_del_servicio TO authenticated;
ALTER POLICY panel_lee_el_equipo_del_paciente ON public.equipo_paciente TO authenticated;

NOTIFY pgrst, 'reload schema';
