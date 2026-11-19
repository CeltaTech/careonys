-- Cambio de nombre: todo lo que en la base es el turno de una Asistente pasa a llamarse «turno de guardia».
-- La guardia completa es una Prestación y conserva su nombre (por ejemplo, dia_de_guardia queda igual).
-- Corre entera en una sola transacción, en este orden: suelta las restricciones de verificación que
-- nombran valores viejos, cambia los valores y las claves guardadas, vuelve a poner esas restricciones con
-- los valores nuevos, cambia los nombres de tablas, columnas, índices, políticas, disparadores,
-- restricciones y funciones, reescribe las funciones cuyo cuerpo nombra algo renombrado, y avisa a la API.
-- No toca los registros históricos ni los textos legales y de consentimiento.
--
-- Tablas:
--   alertas_tempranas_guardia  ->  alertas_tempranas_turno_guardia
--   asignaciones_de_turno  ->  asignaciones_de_turno_guardia
--   configuracion_aviso_guardia_sin_cubrir  ->  configuracion_aviso_turno_guardia_sin_cubrir
--   configuracion_incidentes_turno_sin_cubrir  ->  configuracion_incidentes_turno_guardia_sin_cubrir
--   descansos_guardia  ->  descansos_turno_guardia
--   emergencias_guardia  ->  emergencias_turno_guardia
--   extensiones_de_turno  ->  extensiones_de_turno_guardia
--   finales_turno_sin_cubrir  ->  finales_turno_guardia_sin_cubrir
--   guardia_comprobaciones  ->  turno_guardia_comprobaciones
--   guardia_pacientes  ->  turno_guardia_pacientes
--   guardias  ->  turnos_guardia
--   guardias_cobertura  ->  turnos_guardia_cobertura
--   guardias_tracking_gps  ->  turnos_guardia_tracking_gps
--   incidentes_turno_sin_cubrir  ->  incidentes_turno_guardia_sin_cubrir
--   motivos_aviso_previo_guardia  ->  motivos_aviso_previo_turno_guardia
--   motivos_sustitucion_guardia  ->  motivos_sustitucion_turno_guardia
--   series_guardias  ->  series_turnos_guardia
--   series_guardias_pacientes  ->  series_turnos_guardia_pacientes
--
-- Columnas (tabla vieja.columna):
--   alertas_tempranas_guardia.guardia_id  ->  turno_guardia_id
--   asignaciones_de_turno.guardia_id  ->  turno_guardia_id
--   auditoria_asignaciones_con_aviso.guardia_id  ->  turno_guardia_id
--   auditoria_reasignaciones_por_emergencia.guardia_id  ->  turno_guardia_id
--   ausencias.guardias_afectadas  ->  turnos_guardia_afectados
--   calificaciones_asistente.guardia_id  ->  turno_guardia_id
--   condiciones_comerciales_servicio.cobra_guardias_adicionales  ->  cobra_turnos_guardia_adicionales
--   configuracion_escalada_coordinador.minutos_gracia_cierre_guardia  ->  minutos_gracia_cierre_turno_guardia
--   consentimientos_paciente_solo.guardia_id  ->  turno_guardia_id
--   descansos_guardia.guardia_id  ->  turno_guardia_id
--   emergencias_guardia.guardia_id  ->  turno_guardia_id
--   excepciones_familiar_relevo.guardia_id  ->  turno_guardia_id
--   excepciones_por_documentos.guardia_id  ->  turno_guardia_id
--   extensiones_de_turno.guardia_id  ->  turno_guardia_id
--   extensiones_de_turno.relevo_guardia_id  ->  relevo_turno_guardia_id
--   guardia_comprobaciones.guardia_id  ->  turno_guardia_id
--   guardia_pacientes.guardia_id  ->  turno_guardia_id
--   guardias_cobertura.guardia_original_id  ->  turno_guardia_original_id
--   guardias_tracking_gps.guardia_id  ->  turno_guardia_id
--   incidentes_relevo.guardia_entrante_id  ->  turno_guardia_entrante_id
--   incidentes_relevo.guardia_saliente_id  ->  turno_guardia_saliente_id
--   incidentes_turno_sin_cubrir.guardia_id  ->  turno_guardia_id
--   liquidaciones_asistente.guardias_contadas  ->  turnos_guardia_contados
--   plazos_de_ubicacion_avisados.control_en_el_turno_desde  ->  control_en_el_turno_guardia_desde
--   prestaciones.precio_guardia_adicional  ->  precio_turno_guardia_adicional
--   prestadoras.control_de_ubicacion_en_el_turno  ->  control_de_ubicacion_en_el_turno_guardia
--   prestadoras.control_de_ubicacion_en_el_turno_desde  ->  control_de_ubicacion_en_el_turno_guardia_desde
--   prestadoras.dias_generacion_series_guardia  ->  dias_generacion_series_turno_guardia
--   prestadoras.guardias_solo_con_firma_del_pagador  ->  turnos_guardia_solo_con_firma_del_pagador
--   prestadoras.minutos_aviso_previo_guardia  ->  minutos_aviso_previo_turno_guardia
--   prestadoras.registro_de_accesos_horas_alrededor_de_la_guardia  ->  registro_de_accesos_horas_alrededor_del_turno_guardia
--   remuneraciones_asistente.valor_guardia  ->  valor_turno_guardia
--   reportes.guardia_id  ->  turno_guardia_id
--   textos_consentimiento.control_de_ubicacion_en_el_turno  ->  control_de_ubicacion_en_el_turno_guardia
--
-- Funciones:
--   interno.anotar_desde_cuando_se_controla_en_el_turno  ->  interno.anotar_desde_cuando_se_controla_en_el_turno_guardia
--   interno.asistente_de_la_guardia  ->  interno.asistente_del_turno_guardia
--   interno.coordinador_alcanza_guardia  ->  interno.coordinador_alcanza_turno_guardia
--   interno.coordinador_alcanza_la_guardia_de  ->  interno.coordinador_alcanza_el_turno_guardia_de
--   interno.coordinador_ve_la_guardia  ->  interno.coordinador_ve_el_turno_guardia
--   interno.dia_en_que_termina_guardia  ->  interno.dia_en_que_termina_turno_guardia
--   interno.el_asistente_marca_solo_su_guardia  ->  interno.el_asistente_marca_solo_su_turno_guardia
--   interno.exigir_documentos_en_guardia  ->  interno.exigir_documentos_en_turno_guardia
--   interno.guardia_empezada_no_cambia_de_asistente  ->  interno.turno_guardia_empezado_no_cambia_de_asistente
--   interno.guardia_empezada_no_cambia_de_paciente  ->  interno.turno_guardia_empezado_no_cambia_de_paciente
--   interno.guardia_empezada_no_pierde_pacientes  ->  interno.turno_guardia_empezado_no_pierde_pacientes
--   interno.guardias_a_la_vista_por_una_alarma  ->  interno.turnos_guardia_a_la_vista_por_una_alarma
--   interno.guardias_asignadas_del_servicio  ->  interno.turnos_guardia_asignados_del_servicio
--   interno.guardias_de_las_alarmas  ->  interno.turnos_guardia_de_las_alarmas
--   interno.guardias_del_paciente  ->  interno.turnos_guardia_del_paciente
--   interno.pacientes_de_la_guardia  ->  interno.pacientes_del_turno_guardia
--   interno.sin_coordinador_no_hay_guardias  ->  interno.sin_coordinador_no_hay_turnos_guardia
--   interno.sin_firma_del_pagador_no_hay_guardias  ->  interno.sin_firma_del_pagador_no_hay_turnos_guardia
--   interno.turnos_que_traban_la_desactivacion  ->  interno.turnos_guardia_que_traban_la_desactivacion
--   interno.validar_paciente_de_guardia_del_contratante  ->  interno.validar_paciente_de_turno_guardia_del_contratante
--   public.asignar_turno  ->  public.asignar_turno_guardia
--   public.exigir_paciente_del_turno  ->  public.exigir_paciente_del_turno_guardia
--   public.fn_modalidad_de_la_guardia  ->  public.fn_modalidad_del_turno_guardia
--   public.mover_turno_a_otro_paciente  ->  public.mover_turno_guardia_a_otro_paciente
--   public.reasignar_guardia_por_emergencia  ->  public.reasignar_turno_guardia_por_emergencia
--   public.sincronizar_paciente_principal_de_guardia  ->  public.sincronizar_paciente_principal_de_turno_guardia
--   public.turnos_asignados_sin_responder  ->  public.turnos_guardia_asignados_sin_responder
--   public.turnos_que_traban_la_desactivacion  ->  public.turnos_guardia_que_traban_la_desactivacion
--
-- Disparadores:
--   guardia_pacientes.guardia_empezada_no_pierde_pacientes  ->  turno_guardia_empezado_no_pierde_pacientes
--   guardia_pacientes.validar_contratante_guardia_pacientes  ->  validar_contratante_turno_guardia_pacientes
--   guardias.asistente_marca_solo_su_guardia  ->  asistente_marca_solo_su_turno_guardia
--   guardias.guardia_empezada_no_cambia_de_asistente  ->  turno_guardia_empezado_no_cambia_de_asistente
--   guardias.guardia_empezada_no_cambia_de_paciente  ->  turno_guardia_empezado_no_cambia_de_paciente
--   guardias.sin_coordinador_no_hay_guardias  ->  sin_coordinador_no_hay_turnos_guardia
--   guardias.sin_firma_del_pagador_no_hay_guardias  ->  sin_firma_del_pagador_no_hay_turnos_guardia
--   guardias.trg_exigir_documentos_en_guardia  ->  trg_exigir_documentos_en_turno_guardia
--   guardias.trg_modalidad_en_guardia  ->  trg_modalidad_en_turno_guardia
--   guardias.validar_servicio_guardias  ->  validar_servicio_turnos_guardia
--   guardias_cobertura.validar_motivo_guardias_cobertura  ->  validar_motivo_turnos_guardia_cobertura
--   incidentes_turno_sin_cubrir.validar_final_incidente_turno_sin_cubrir  ->  validar_final_incidente_turno_guardia_sin_cubrir
--   prestadoras.anotar_desde_cuando_se_controla_en_el_turno  ->  anotar_desde_cuando_se_controla_en_el_turno_guardia
--   reportes.trg_reporte_paciente_del_turno  ->  trg_reporte_paciente_del_turno_guardia
--   series_guardias.sin_coordinador_no_hay_guardias  ->  sin_coordinador_no_hay_turnos_guardia
--   series_guardias.sin_firma_del_pagador_no_hay_guardias  ->  sin_firma_del_pagador_no_hay_turnos_guardia
--   series_guardias.validar_servicio_series_guardias  ->  validar_servicio_series_turnos_guardia
--   series_guardias_pacientes.validar_cliente_series_guardias_pacientes  ->  validar_cliente_series_turnos_guardia_pacientes
--
-- Políticas:
--   alertas_tempranas_guardia.asistente_avisa_demora_en_su_guardia  ->  asistente_avisa_demora_en_su_turno_guardia
--   alertas_tempranas_guardia.coordinador_gestiona_alertas_tempranas_guardia_de_sus_servicios  ->  coordinador_gestiona_alertas_turno_guardia_de_sus_servicios
--   alertas_tempranas_guardia.panel_gestiona_alertas_tempranas_guardia  ->  panel_gestiona_alertas_tempranas_turno_guardia
--   configuracion_aviso_guardia_sin_cubrir.admin_gestiona_configuracion_aviso_guardia_sin_cubrir  ->  admin_gestiona_configuracion_aviso_turno_guardia_sin_cubrir
--   configuracion_aviso_guardia_sin_cubrir.coordinador_lee_configuracion_aviso_guardia_sin_cubrir  ->  coordinador_lee_configuracion_aviso_turno_guardia_sin_cubrir
--   configuracion_incidentes_turno_sin_cubrir.configuracion_incidentes_turno_sin_cubrir_la_escribe_la_adminis  ->  config_incidentes_turno_guardia_sin_cubrir_la_escribe_la_admin
--   configuracion_incidentes_turno_sin_cubrir.configuracion_incidentes_turno_sin_cubrir_la_lee_su_prestadora  ->  config_incidentes_turno_guardia_sin_cubrir_la_lee_su_prestadora
--   descansos_guardia.asistente_empieza_descanso_en_su_guardia  ->  asistente_empieza_descanso_en_su_turno_guardia
--   descansos_guardia.asistente_ve_descansos_de_su_guardia  ->  asistente_ve_descansos_de_su_turno_guardia
--   descansos_guardia.panel_lee_descansos_guardia  ->  panel_lee_descansos_turno_guardia
--   emergencias_guardia.asistente_avisa_emergencia_en_su_guardia  ->  asistente_avisa_emergencia_en_su_turno_guardia
--   emergencias_guardia.asistente_ve_emergencias_de_su_guardia  ->  asistente_ve_emergencias_de_su_turno_guardia
--   emergencias_guardia.panel_lee_emergencias_guardia  ->  panel_lee_emergencias_turno_guardia
--   extensiones_de_turno.asistente_ve_la_extension_de_su_turno  ->  asistente_ve_la_extension_de_su_turno_guardia
--   extensiones_de_turno.coordinador_lee_extensiones_de_turno  ->  coordinador_lee_extensiones_de_turno_guardia
--   extensiones_de_turno.panel_lee_extensiones_de_turno  ->  panel_lee_extensiones_de_turno_guardia
--   finales_turno_sin_cubrir.admin_prestadora_gestiona_finales_turno_sin_cubrir  ->  admin_prestadora_gestiona_finales_turno_guardia_sin_cubrir
--   finales_turno_sin_cubrir.coordinador_lee_finales_turno_sin_cubrir  ->  coordinador_lee_finales_turno_guardia_sin_cubrir
--   guardia_pacientes.se_ven_los_pacientes_de_una_guardia_visible  ->  se_ven_los_pacientes_de_un_turno_guardia_visible
--   guardias.asistente_actualiza_su_guardia  ->  asistente_actualiza_su_turno_guardia
--   guardias.asistente_ve_sus_guardias  ->  asistente_ve_sus_turnos_guardia
--   guardias.coordinador_cierra_servicio_guardias  ->  coordinador_cierra_servicio_turnos_guardia
--   guardias.coordinador_gestiona_guardias_de_sus_servicios  ->  coordinador_gestiona_turnos_guardia_de_sus_servicios
--   guardias.coordinador_resuelve_la_guardia_de_una_alarma_que_tomo  ->  coordinador_resuelve_el_turno_guardia_de_una_alarma_que_tomo
--   guardias.coordinador_ve_la_guardia_de_una_alarma_que_llego_a_todos  ->  coordinador_ve_el_turno_guardia_de_una_alarma_que_llego_a_todos
--   guardias.panel_gestiona_guardias  ->  panel_gestiona_turnos_guardia
--   guardias_cobertura.admin_gestiona_guardias_cobertura  ->  admin_gestiona_turnos_guardia_cobertura
--   guardias_cobertura.coordinador_gestiona_guardias_cobertura_de_su_zona  ->  coordinador_gestiona_turnos_guardia_cobertura_de_su_zona
--   guardias_tracking_gps.coordinador_gestiona_guardias_tracking_gps_de_sus_servicios  ->  coordinador_gestiona_turnos_guardia_gps_de_sus_servicios
--   guardias_tracking_gps.panel_gestiona_guardias_tracking_gps  ->  panel_gestiona_turnos_guardia_tracking_gps
--   incidentes_turno_sin_cubrir.coordinador_gestiona_incidentes_turno_sin_cubrir  ->  coordinador_gestiona_incidentes_turno_guardia_sin_cubrir
--   incidentes_turno_sin_cubrir.panel_gestiona_incidentes_turno_sin_cubrir  ->  panel_gestiona_incidentes_turno_guardia_sin_cubrir
--   pacientes.asistente_lee_pacientes_de_sus_guardias  ->  asistente_lee_pacientes_de_sus_turnos_guardia
--   reportes.asistente_carga_reportes_de_su_guardia  ->  asistente_carga_reportes_de_su_turno_guardia
--   reportes.asistente_lee_reportes_de_su_guardia  ->  asistente_lee_reportes_de_su_turno_guardia
--   series_guardias.coordinador_cierra_servicio_series_guardias  ->  coordinador_cierra_servicio_series_turnos_guardia
--   series_guardias.coordinador_gestiona_series_guardias_de_sus_servicios  ->  coordinador_gestiona_series_turnos_guardia_de_sus_servicios
--   series_guardias.panel_gestiona_series_guardias  ->  panel_gestiona_series_turnos_guardia
--   objects.reportes_asistente_lee_fotos_de_sus_guardias  ->  reportes_asistente_lee_fotos_de_sus_turnos_guardia
--   objects.reportes_asistente_sube_foto_de_su_guardia  ->  reportes_asistente_sube_foto_de_su_turno_guardia
--
-- Índices:
--   idx_alertas_tempranas_guardia_guardia  ->  idx_alertas_tempranas_turno_guardia_turno_guardia
--   idx_alertas_tempranas_guardia_prestadora_id  ->  idx_alertas_tempranas_turno_guardia_prestadora_id
--   asignaciones_de_turno_una_sin_responder_por_ausencia  ->  asignaciones_de_turno_guardia_una_sin_responder_por_ausencia
--   asignaciones_de_turno_una_sin_responder_por_serie  ->  asignaciones_de_turno_guardia_una_sin_responder_por_serie
--   asignaciones_de_turno_una_sin_responder_por_turno  ->  asignaciones_de_turno_guardia_una_sin_responder_por_cada_uno
--   idx_asignaciones_de_turno_por_asistente  ->  idx_asignaciones_de_turno_guardia_por_asistente
--   auditoria_reasignaciones_por_emergencia_guardia_idx  ->  auditoria_reasignaciones_por_emergencia_turno_guardia_idx
--   coberturas_de_ausencia_una_por_turno  ->  coberturas_de_ausencia_una_por_turno_guardia
--   consentimientos_paciente_solo_por_turno  ->  consentimientos_paciente_solo_por_turno_guardia
--   idx_descansos_guardia_cierre_sin_repetir  ->  idx_descansos_turno_guardia_cierre_sin_repetir
--   idx_descansos_guardia_por_guardia  ->  idx_descansos_turno_guardia_por_turno_guardia
--   idx_descansos_guardia_prestadora_id  ->  idx_descansos_turno_guardia_prestadora_id
--   idx_descansos_guardia_sin_repetir  ->  idx_descansos_turno_guardia_sin_repetir
--   idx_descansos_guardia_uno_abierto_por_guardia  ->  idx_descansos_turno_guardia_uno_abierto_por_turno_guardia
--   idx_emergencias_guardia_por_guardia  ->  idx_emergencias_turno_guardia_por_turno_guardia
--   idx_emergencias_guardia_sin_atender  ->  idx_emergencias_turno_guardia_sin_atender
--   idx_emergencias_guardia_sin_repetir  ->  idx_emergencias_turno_guardia_sin_repetir
--   excepciones_familiar_relevo_por_turno  ->  excepciones_familiar_relevo_por_turno_guardia
--   excepciones_por_documentos_guardia_idx  ->  excepciones_por_documentos_turno_guardia_idx
--   extensiones_de_turno_abiertas  ->  extensiones_de_turno_guardia_abiertas
--   extensiones_de_turno_una_abierta_por_guardia  ->  extensiones_de_turno_guardia_una_abierta_por_turno_guardia
--   finales_turno_sin_cubrir_activos  ->  finales_turno_guardia_sin_cubrir_activos
--   finales_turno_sin_cubrir_clave_unica  ->  finales_turno_guardia_sin_cubrir_clave_unica
--   finales_turno_sin_cubrir_nombre_unico  ->  finales_turno_guardia_sin_cubrir_nombre_unico
--   idx_guardia_comprobaciones_guardia  ->  idx_turno_guardia_comprobaciones_turno_guardia
--   idx_guardia_comprobaciones_pendientes  ->  idx_turno_guardia_comprobaciones_pendientes
--   idx_guardia_pacientes_paciente  ->  idx_turno_guardia_pacientes_paciente
--   idx_guardia_pacientes_prestadora_id  ->  idx_turno_guardia_pacientes_prestadora_id
--   guardias_en_curso_por_fecha  ->  turnos_guardia_en_curso_por_fecha
--   guardias_servicio_id_idx  ->  turnos_guardia_servicio_id_idx
--   idx_guardias_asistente  ->  idx_turnos_guardia_asistente
--   idx_guardias_canal_modalidad  ->  idx_turnos_guardia_canal_modalidad
--   idx_guardias_fecha  ->  idx_turnos_guardia_fecha
--   idx_guardias_paciente  ->  idx_turnos_guardia_paciente
--   idx_guardias_serie  ->  idx_turnos_guardia_serie
--   idx_guardias_sin_cerrar  ->  idx_turnos_guardia_sin_cerrar
--   idx_guardias_sin_cubrir  ->  idx_turnos_guardia_sin_cubrir
--   guardias_cobertura_de_ausencia_idx  ->  turnos_guardia_cobertura_de_ausencia_idx
--   idx_guardias_cobertura_prestadora_id  ->  idx_turnos_guardia_cobertura_prestadora_id
--   idx_guardias_tracking_gps_guardia  ->  idx_turnos_guardia_tracking_gps_turno_guardia
--   idx_guardias_tracking_gps_prestadora_id  ->  idx_turnos_guardia_tracking_gps_prestadora_id
--   incidentes_turno_sin_cubrir_abiertos  ->  incidentes_turno_guardia_sin_cubrir_abiertos
--   incidentes_turno_sin_cubrir_uno_abierto_por_turno  ->  incidentes_turno_guardia_sin_cubrir_uno_abierto_por_cada_uno
--   motivos_sustitucion_guardia_activos  ->  motivos_sustitucion_turno_guardia_activos
--   motivos_sustitucion_guardia_clave_unica  ->  motivos_sustitucion_turno_guardia_clave_unica
--   motivos_sustitucion_guardia_nombre_unico  ->  motivos_sustitucion_turno_guardia_nombre_unico
--   idx_reportes_guardia  ->  idx_reportes_turno_guardia
--   reportes_uno_por_paciente_y_guardia  ->  reportes_uno_por_paciente_y_turno_guardia
--   idx_series_guardias_asistente  ->  idx_series_turnos_guardia_asistente
--   idx_series_guardias_paciente  ->  idx_series_turnos_guardia_paciente
--   idx_series_guardias_prestadora_id  ->  idx_series_turnos_guardia_prestadora_id
--   series_guardias_servicio_id_idx  ->  series_turnos_guardia_servicio_id_idx
--   idx_series_guardias_pacientes_paciente  ->  idx_series_turnos_guardia_pacientes_paciente
--   idx_series_guardias_pacientes_prestadora_id  ->  idx_series_turnos_guardia_pacientes_prestadora_id
--
-- Restricciones:
--   alertas_tempranas_guardia.alertas_tempranas_guardia_guardia_tenant_fk  ->  alertas_tempranas_turno_guardia_turno_guardia_tenant_fk
--   alertas_tempranas_guardia.alertas_tempranas_guardia_pkey  ->  alertas_tempranas_turno_guardia_pkey
--   alertas_tempranas_guardia.alertas_tempranas_guardia_prestadora_id_fkey  ->  alertas_tempranas_turno_guardia_prestadora_id_fkey
--   alertas_tempranas_guardia.alertas_tempranas_guardia_reportado_por_fkey  ->  alertas_tempranas_turno_guardia_reportado_por_fkey
--   asignaciones_de_turno.asignaciones_de_turno_apunta_a_una_sola_cosa  ->  asignaciones_de_turno_guardia_apunta_a_una_sola_cosa
--   asignaciones_de_turno.asignaciones_de_turno_asignado_por_fkey  ->  asignaciones_de_turno_guardia_asignado_por_fkey
--   asignaciones_de_turno.asignaciones_de_turno_asistente_anterior_id_fkey  ->  asignaciones_de_turno_guardia_asistente_anterior_id_fkey
--   asignaciones_de_turno.asignaciones_de_turno_asistente_id_fkey  ->  asignaciones_de_turno_guardia_asistente_id_fkey
--   asignaciones_de_turno.asignaciones_de_turno_ausencia_id_fkey  ->  asignaciones_de_turno_guardia_ausencia_id_fkey
--   asignaciones_de_turno.asignaciones_de_turno_estado_check  ->  asignaciones_de_turno_guardia_estado_check
--   asignaciones_de_turno.asignaciones_de_turno_pkey  ->  asignaciones_de_turno_guardia_pkey
--   asignaciones_de_turno.asignaciones_de_turno_prestadora_id_fkey  ->  asignaciones_de_turno_guardia_prestadora_id_fkey
--   asignaciones_de_turno.asignaciones_de_turno_respondida_check  ->  asignaciones_de_turno_guardia_respondida_check
--   asignaciones_de_turno.asignaciones_de_turno_retirada_check  ->  asignaciones_de_turno_guardia_retirada_check
--   asignaciones_de_turno.asignaciones_de_turno_retirada_por_fkey  ->  asignaciones_de_turno_guardia_retirada_por_fkey
--   asignaciones_de_turno.asignaciones_de_turno_serie_id_fkey  ->  asignaciones_de_turno_guardia_serie_id_fkey
--   auditoria_asignaciones_con_aviso.auditoria_asignaciones_con_aviso_guardia_tenant_fk  ->  auditoria_asignaciones_con_aviso_turno_guardia_tenant_fk
--   calificaciones_asistente.calificaciones_asistente_guardia_id_fkey  ->  calificaciones_asistente_turno_guardia_id_fkey
--   configuracion_aviso_guardia_sin_cubrir.configuracion_aviso_guardia_sin_cubrir_horas_antes_check  ->  configuracion_aviso_turno_guardia_sin_cubrir_horas_antes_check
--   configuracion_aviso_guardia_sin_cubrir.configuracion_aviso_guardia_sin_cubrir_horas_entre_avisos_check  ->  config_aviso_turno_guardia_sin_cubrir_horas_entre_avisos_check
--   configuracion_aviso_guardia_sin_cubrir.configuracion_aviso_guardia_sin_cubrir_pkey  ->  configuracion_aviso_turno_guardia_sin_cubrir_pkey
--   configuracion_aviso_guardia_sin_cubrir.configuracion_aviso_guardia_sin_cubrir_prestadora_id_fkey  ->  configuracion_aviso_turno_guardia_sin_cubrir_prestadora_id_fkey
--   configuracion_escalada_coordinador.minutos_gracia_cierre_guardia_razonable  ->  minutos_gracia_cierre_turno_guardia_razonable
--   configuracion_incidentes_turno_sin_cubrir.configuracion_incidentes_turno_sin_cubrir_pkey  ->  configuracion_incidentes_turno_guardia_sin_cubrir_pkey
--   configuracion_incidentes_turno_sin_cubrir.configuracion_incidentes_turno_sin_cubrir_prestadora_id_fkey  ->  config_incidentes_turno_guardia_sin_cubrir_prestadora_id_fkey
--   configuracion_incidentes_turno_sin_cubrir.configuracion_incidentes_turno_sin_cubrir_regla_es_objeto  ->  config_incidentes_turno_guardia_sin_cubrir_regla_es_objeto
--   consentimientos_paciente_solo.consentimientos_paciente_solo_guardia_tenant_fk  ->  consentimientos_paciente_solo_turno_guardia_tenant_fk
--   descansos_guardia.descansos_guardia_fin_despues_del_inicio  ->  descansos_turno_guardia_fin_despues_del_inicio
--   descansos_guardia.descansos_guardia_guardia_fkey  ->  descansos_turno_guardia_turno_guardia_fkey
--   descansos_guardia.descansos_guardia_pkey  ->  descansos_turno_guardia_pkey
--   descansos_guardia.descansos_guardia_prestadora_id_fkey  ->  descansos_turno_guardia_prestadora_id_fkey
--   emergencias_guardia.emergencias_guardia_detalle_check  ->  emergencias_turno_guardia_detalle_check
--   emergencias_guardia.emergencias_guardia_detalle_salvo_en_el_relevo  ->  emergencias_turno_guardia_detalle_salvo_en_el_relevo
--   emergencias_guardia.emergencias_guardia_guardia_fkey  ->  emergencias_turno_guardia_turno_guardia_fkey
--   emergencias_guardia.emergencias_guardia_pkey  ->  emergencias_turno_guardia_pkey
--   emergencias_guardia.emergencias_guardia_prestadora_id_fkey  ->  emergencias_turno_guardia_prestadora_id_fkey
--   excepciones_familiar_relevo.excepciones_familiar_relevo_guardia_tenant_fk  ->  excepciones_familiar_relevo_turno_guardia_tenant_fk
--   excepciones_por_documentos.excepciones_por_documentos_guardia_id_fkey  ->  excepciones_por_documentos_turno_guardia_id_fkey
--   extensiones_de_turno.extensiones_de_turno_pkey  ->  extensiones_de_turno_guardia_pkey
--   extensiones_de_turno.extensiones_de_turno_prestadora_id_fkey  ->  extensiones_de_turno_guardia_prestadora_id_fkey
--   extensiones_de_turno.extensiones_de_turno_relevo_fkey  ->  extensiones_de_turno_guardia_relevo_fkey
--   extensiones_de_turno.extensiones_de_turno_termina_despues  ->  extensiones_de_turno_guardia_termina_despues
--   finales_turno_sin_cubrir.finales_turno_sin_cubrir_los_del_sistema_no_se_apagan  ->  finales_turno_guardia_sin_cubrir_los_del_sistema_no_se_apagan
--   finales_turno_sin_cubrir.finales_turno_sin_cubrir_los_del_sistema_son_del_producto  ->  finales_turno_guardia_sin_cubrir_del_sistema_son_del_producto
--   finales_turno_sin_cubrir.finales_turno_sin_cubrir_nombre_segun_nivel  ->  finales_turno_guardia_sin_cubrir_nombre_segun_nivel
--   finales_turno_sin_cubrir.finales_turno_sin_cubrir_pkey  ->  finales_turno_guardia_sin_cubrir_pkey
--   finales_turno_sin_cubrir.finales_turno_sin_cubrir_prestadora_id_fkey  ->  finales_turno_guardia_sin_cubrir_prestadora_id_fkey
--   guardia_comprobaciones.guardia_comprobaciones_asistente_tenant_fk  ->  turno_guardia_comprobaciones_asistente_tenant_fk
--   guardia_comprobaciones.guardia_comprobaciones_autorizacion_check  ->  turno_guardia_comprobaciones_autorizacion_check
--   guardia_comprobaciones.guardia_comprobaciones_autorizada_por_fkey  ->  turno_guardia_comprobaciones_autorizada_por_fkey
--   guardia_comprobaciones.guardia_comprobaciones_coherencia_check  ->  turno_guardia_comprobaciones_coherencia_check
--   guardia_comprobaciones.guardia_comprobaciones_estado_check  ->  turno_guardia_comprobaciones_estado_check
--   guardia_comprobaciones.guardia_comprobaciones_guardia_tenant_fk  ->  turno_guardia_comprobaciones_turno_guardia_tenant_fk
--   guardia_comprobaciones.guardia_comprobaciones_medio_check  ->  turno_guardia_comprobaciones_medio_check
--   guardia_comprobaciones.guardia_comprobaciones_momento_check  ->  turno_guardia_comprobaciones_momento_check
--   guardia_comprobaciones.guardia_comprobaciones_momento_unico_por_guardia  ->  turno_guardia_comprobaciones_momento_unico_por_turno_guardia
--   guardia_comprobaciones.guardia_comprobaciones_motivo_check  ->  turno_guardia_comprobaciones_motivo_check
--   guardia_comprobaciones.guardia_comprobaciones_motivo_del_pedido_check  ->  turno_guardia_comprobaciones_motivo_del_pedido_check
--   guardia_comprobaciones.guardia_comprobaciones_pkey  ->  turno_guardia_comprobaciones_pkey
--   guardia_comprobaciones.guardia_comprobaciones_prestadora_id_fkey  ->  turno_guardia_comprobaciones_prestadora_id_fkey
--   guardia_comprobaciones.guardia_comprobaciones_sujeto_coherencia_check  ->  turno_guardia_comprobaciones_sujeto_coherencia_check
--   guardia_comprobaciones.guardia_comprobaciones_sujeto_tipo_check  ->  turno_guardia_comprobaciones_sujeto_tipo_check
--   guardia_pacientes.guardia_pacientes_guardia_tenant_fk  ->  turno_guardia_pacientes_turno_guardia_tenant_fk
--   guardia_pacientes.guardia_pacientes_paciente_tenant_fk  ->  turno_guardia_pacientes_paciente_tenant_fk
--   guardia_pacientes.guardia_pacientes_pkey  ->  turno_guardia_pacientes_pkey
--   guardia_pacientes.guardia_pacientes_prestadora_id_fkey  ->  turno_guardia_pacientes_prestadora_id_fkey
--   guardias.guardias_asistente_tenant_fk  ->  turnos_guardia_asistente_tenant_fk
--   guardias.guardias_canal_modalidad_check  ->  turnos_guardia_canal_modalidad_check
--   guardias.guardias_cancelacion_alcance_check  ->  turnos_guardia_cancelacion_alcance_check
--   guardias.guardias_cancelacion_check  ->  turnos_guardia_cancelacion_check
--   guardias.guardias_cancelacion_origen_check  ->  turnos_guardia_cancelacion_origen_check
--   guardias.guardias_cerrada_origen_check  ->  turnos_guardia_cerrado_origen_check
--   guardias.guardias_cerrada_por_fkey  ->  turnos_guardia_cerrado_por_fkey
--   guardias.guardias_checkout_bloqueado_requiere_excepcion  ->  turnos_guardia_checkout_bloqueado_requiere_excepcion
--   guardias.guardias_checkout_excepcion_autorizado_por_fkey  ->  turnos_guardia_checkout_excepcion_autorizado_por_fkey
--   guardias.guardias_cierre_por_el_asistente_sin_motivo  ->  turnos_guardia_cierre_por_el_asistente_sin_motivo
--   guardias.guardias_cierre_por_el_panel_exige_persona_y_motivo  ->  turnos_guardia_cierre_por_el_panel_exige_persona_y_motivo
--   guardias.guardias_cierre_rastro_completo  ->  turnos_guardia_cierre_rastro_completo
--   guardias.guardias_coordinador_id_fkey  ->  turnos_guardia_coordinador_id_fkey
--   guardias.guardias_dias_hasta_el_fin_valido  ->  turnos_guardia_dios_hasta_el_fin_valido
--   guardias.guardias_estado_check  ->  turnos_guardia_estado_check
--   guardias.guardias_horas_extra_con_motivo  ->  turnos_guardia_horos_extra_con_motivo
--   guardias.guardias_horas_extra_no_negativas  ->  turnos_guardia_horos_extra_no_negativas
--   guardias.guardias_id_prestadora_unique  ->  turnos_guardia_id_prestadora_unique
--   guardias.guardias_paciente_tenant_fk  ->  turnos_guardia_paciente_tenant_fk
--   guardias.guardias_pkey  ->  turnos_guardia_pkey
--   guardias.guardias_prestadora_id_fkey  ->  turnos_guardia_prestadora_id_fkey
--   guardias.guardias_serie_tenant_fk  ->  turnos_guardia_serie_tenant_fk
--   guardias.guardias_servicio_de_la_misma_prestadora  ->  turnos_guardia_servicio_de_la_misma_prestadora
--   guardias.guardias_sin_cubrir_estado_check  ->  turnos_guardia_sin_cubrir_estado_check
--   guardias.guardias_sin_cubrir_sin_marcas_check  ->  turnos_guardia_sin_cubrir_sin_marcas_check
--   guardias_cobertura.guardias_cobertura_asistente_sustituto_id_fkey  ->  turnos_guardia_cobertura_asistente_sustituto_id_fkey
--   guardias_cobertura.guardias_cobertura_asistente_titular_id_fkey  ->  turnos_guardia_cobertura_asistente_titular_id_fkey
--   guardias_cobertura.guardias_cobertura_ausencia_id_fkey  ->  turnos_guardia_cobertura_ausencia_id_fkey
--   guardias_cobertura.guardias_cobertura_cobertura_de_ausencia_id_fkey  ->  turnos_guardia_cobertura_cobertura_de_ausencia_id_fkey
--   guardias_cobertura.guardias_cobertura_pkey  ->  turnos_guardia_cobertura_pkey
--   guardias_cobertura.guardias_cobertura_prestadora_id_fkey  ->  turnos_guardia_cobertura_prestadora_id_fkey
--   guardias_cobertura.guardias_cobertura_titular_distinto_del_sustituto  ->  turnos_guardia_cobertura_titular_distinto_del_sustituto
--   guardias_tracking_gps.guardias_tracking_gps_guardia_tenant_fk  ->  turnos_guardia_tracking_gps_turno_guardia_tenant_fk
--   guardias_tracking_gps.guardias_tracking_gps_pkey  ->  turnos_guardia_tracking_gps_pkey
--   guardias_tracking_gps.guardias_tracking_gps_prestadora_id_fkey  ->  turnos_guardia_tracking_gps_prestadora_id_fkey
--   incidentes_turno_sin_cubrir.incidentes_turno_sin_cubrir_cerrar_es_decir_como  ->  incidentes_turno_guardia_sin_cubrir_cerrar_es_decir_como
--   incidentes_turno_sin_cubrir.incidentes_turno_sin_cubrir_guardia_tenant_fk  ->  incidentes_turno_guardia_sin_cubrir_turno_guardia_tenant_fk
--   incidentes_turno_sin_cubrir.incidentes_turno_sin_cubrir_pkey  ->  incidentes_turno_guardia_sin_cubrir_pkey
--   incidentes_turno_sin_cubrir.incidentes_turno_sin_cubrir_prestadora_id_fkey  ->  incidentes_turno_guardia_sin_cubrir_prestadora_id_fkey
--   incidentes_turno_sin_cubrir.incidentes_turno_sin_cubrir_resuelto_por_fkey  ->  incidentes_turno_guardia_sin_cubrir_resuelto_por_fkey
--   motivos_aviso_previo_guardia.motivos_aviso_previo_guardia_id_prestadora_id_key  ->  motivos_aviso_previo_turno_guardia_id_prestadora_id_key
--   motivos_aviso_previo_guardia.motivos_aviso_previo_guardia_pkey  ->  motivos_aviso_previo_turno_guardia_pkey
--   motivos_aviso_previo_guardia.motivos_aviso_previo_guardia_prestadora_id_fkey  ->  motivos_aviso_previo_turno_guardia_prestadora_id_fkey
--   motivos_aviso_previo_guardia.motivos_aviso_previo_guardia_prestadora_id_nombre_key  ->  motivos_aviso_previo_turno_guardia_prestadora_id_nombre_key
--   motivos_sustitucion_guardia.motivos_sustitucion_guardia_id_prestadora_id_key  ->  motivos_sustitucion_turno_guardia_id_prestadora_id_key
--   motivos_sustitucion_guardia.motivos_sustitucion_guardia_nombre_segun_nivel  ->  motivos_sustitucion_turno_guardia_nombre_segun_nivel
--   motivos_sustitucion_guardia.motivos_sustitucion_guardia_pkey  ->  motivos_sustitucion_turno_guardia_pkey
--   motivos_sustitucion_guardia.motivos_sustitucion_guardia_prestadora_id_fkey  ->  motivos_sustitucion_turno_guardia_prestadora_id_fkey
--   prestadoras.prestadoras_minutos_aviso_previo_guardia_check  ->  prestadoras_minutos_aviso_previo_turno_guardia_check
--   reportes.reportes_guardia_tenant_fk  ->  reportes_turno_guardia_tenant_fk
--   series_guardias.series_guardias_asistente_tenant_fk  ->  series_turnos_guardia_asistente_tenant_fk
--   series_guardias.series_guardias_canal_modalidad_check  ->  series_turnos_guardia_canal_modalidad_check
--   series_guardias.series_guardias_cancelacion_check  ->  series_turnos_guardia_cancelacion_check
--   series_guardias.series_guardias_cancelacion_origen_check  ->  series_turnos_guardia_cancelacion_origen_check
--   series_guardias.series_guardias_dias_hasta_el_fin_valido  ->  series_turnos_guardia_dias_hasta_el_fin_valido
--   series_guardias.series_guardias_estado_check  ->  series_turnos_guardia_estado_check
--   series_guardias.series_guardias_id_prestadora_unique  ->  series_turnos_guardia_id_prestadora_unique
--   series_guardias.series_guardias_paciente_tenant_fk  ->  series_turnos_guardia_paciente_tenant_fk
--   series_guardias.series_guardias_pkey  ->  series_turnos_guardia_pkey
--   series_guardias.series_guardias_prestadora_id_fkey  ->  series_turnos_guardia_prestadora_id_fkey
--   series_guardias.series_guardias_servicio_tenant_fk  ->  series_turnos_guardia_servicio_tenant_fk
--   series_guardias_pacientes.series_guardias_pacientes_paciente_tenant_fk  ->  series_turnos_guardia_pacientes_paciente_tenant_fk
--   series_guardias_pacientes.series_guardias_pacientes_pkey  ->  series_turnos_guardia_pacientes_pkey
--   series_guardias_pacientes.series_guardias_pacientes_prestadora_id_fkey  ->  series_turnos_guardia_pacientes_prestadora_id_fkey
--   series_guardias_pacientes.series_guardias_pacientes_serie_tenant_fk  ->  series_turnos_guardia_pacientes_serie_tenant_fk
--
-- Valores guardados:
--   alerta_temprana_guardia  ->  alerta_temprana_turno_guardia
--   alertas_tempranas_guardia  ->  alertas_tempranas_turno_guardia
--   asignaciones_de_turno  ->  asignaciones_de_turno_guardia
--   asistente_en_otro_turno  ->  asistente_en_otro_turno_guardia
--   cantidad_guardias  ->  cantidad_turnos_guardia
--   desactivacion_con_turnos_por_delante  ->  desactivacion_con_turnos_guardia_por_delante
--   el_servicio_tiene_guardias_asignadas  ->  el_servicio_tiene_turnos_guardia_asignados
--   emergencia_guardia  ->  emergencia_turno_guardia
--   emergencias_guardia  ->  emergencias_turno_guardia
--   guardia  ->  turno_guardia
--   guardia_empezada_no_cambia_de_asistente  ->  turno_guardia_empezado_no_cambia_de_asistente
--   guardia_empezada_no_cambia_de_paciente  ->  turno_guardia_empezado_no_cambia_de_paciente
--   guardia_id  ->  turno_guardia_id
--   guardia_no_encontrada  ->  turno_guardia_no_encontrado
--   guardia_no_se_asigna  ->  turno_guardia_no_se_asigna
--   guardia_nueva_id  ->  turno_guardia_nuevo_id
--   guardia_sin_asistente  ->  turno_guardia_sin_asistente
--   guardia_sin_cerrar  ->  turno_guardia_sin_cerrar
--   guardia_ya_cubierta  ->  turno_guardia_ya_cubierto
--   guardias  ->  turnos_guardia
--   incidente_turno_sin_cubrir  ->  incidente_turno_guardia_sin_cubrir
--   incidentes_turno_sin_cubrir  ->  incidentes_turno_guardia_sin_cubrir
--   persona_autorizada_guardias  ->  persona_autorizada_turnos_guardia
--   precio_guardia_adicional  ->  precio_turno_guardia_adicional
--   puntuacion_aceptacion_guardia  ->  puntuacion_aceptacion_turno_guardia
--   reasignacion_sin_guardia  ->  reasignacion_sin_turno_guardia
--   se_extendio_el_turno  ->  se_extendio_el_turno_guardia
--   turno  ->  turno_guardia
--   turno_sin_cubrir  ->  turno_guardia_sin_cubrir
--   valor_guardia  ->  valor_turno_guardia
--
-- Claves de mensajes:
--   alerta_temprana_guardia_cliente.cuerpo  ->  alerta_temprana_turno_guardia_cliente.cuerpo
--   alerta_temprana_guardia_cliente.titulo  ->  alerta_temprana_turno_guardia_cliente.titulo
--   ausencia_avisada_con_tiempo.deja_turnos_uno  ->  ausencia_avisada_con_tiempo.deja_turnos_guardia_uno
--   ausencia_avisada_con_tiempo.deja_turnos_varios  ->  ausencia_avisada_con_tiempo.deja_turnos_guardia_varios
--   cambio_de_asistente.linea_turno  ->  cambio_de_asistente.linea_turno_guardia
--   comun.aviso_repetido_guardia  ->  comun.aviso_repetido_turno_guardia
--   comun.linea_guardia  ->  comun.linea_turno_guardia
--   emergencia_en_guardia.asunto  ->  emergencia_en_turno_guardia.asunto
--   emergencia_en_guardia.texto  ->  emergencia_en_turno_guardia.texto
--   guardia_asignada.cuerpo  ->  turno_guardia_asignado.cuerpo
--   guardia_asignada.titulo  ->  turno_guardia_asignado.titulo
--   guardia_sin_cerrar.asunto  ->  turno_guardia_sin_cerrar.asunto
--   guardia_sin_cerrar.salida_marcada  ->  turno_guardia_sin_cerrar.salida_marcada
--   guardia_sin_cerrar.salida_sin_marcar  ->  turno_guardia_sin_cerrar.salida_sin_marcar
--   guardia_sin_cerrar_cliente.cuerpo  ->  turno_guardia_sin_cerrar_cliente.cuerpo
--   guardia_sin_cerrar_cliente.titulo  ->  turno_guardia_sin_cerrar_cliente.titulo
--   guardia_sin_cerrar_grave.asunto  ->  turno_guardia_sin_cerrar_grave.asunto
--   guardia_sin_cerrar_grave.hace_falta_autoridad  ->  turno_guardia_sin_cerrar_grave.hace_falta_autoridad
--   guardia_sin_cerrar_grave.salida_marcada  ->  turno_guardia_sin_cerrar_grave.salida_marcada
--   guardia_sin_cerrar_grave.salida_sin_marcar  ->  turno_guardia_sin_cerrar_grave.salida_sin_marcar
--   guardia_sin_cerrar_grave_cliente.cuerpo  ->  turno_guardia_sin_cerrar_grave_cliente.cuerpo
--   guardia_sin_cerrar_grave_cliente.titulo  ->  turno_guardia_sin_cerrar_grave_cliente.titulo
--   guardia_sin_cerrar_respaldo.texto  ->  turno_guardia_sin_cerrar_respaldo.texto
--   guardia_sin_cerrar_respaldo.texto_uno  ->  turno_guardia_sin_cerrar_respaldo.texto_uno
--   guardia_sin_cubrir.asunto  ->  turno_guardia_sin_cubrir.asunto
--   guardia_sin_cubrir.asunto_ya_empezo  ->  turno_guardia_sin_cubrir.asunto_ya_empezo
--   guardia_sin_cubrir.rechazada_una_vez  ->  turno_guardia_sin_cubrir.rechazada_una_vez
--   guardia_sin_cubrir.rechazada_varias_veces  ->  turno_guardia_sin_cubrir.rechazada_varias_veces
--   guardia_sin_cubrir.sin_asignar  ->  turno_guardia_sin_cubrir.sin_asignar
--   guardia_sin_cubrir.sin_responder  ->  turno_guardia_sin_cubrir.sin_responder
--   incidente_turno_sin_cubrir.asunto  ->  incidente_turno_guardia_sin_cubrir.asunto
--   incidente_turno_sin_cubrir.asunto_ya_empezo  ->  incidente_turno_guardia_sin_cubrir.asunto_ya_empezo
--   incidente_turno_sin_cubrir.cubren_francos  ->  incidente_turno_guardia_sin_cubrir.cubren_francos
--   incidente_turno_sin_cubrir.equipo  ->  incidente_turno_guardia_sin_cubrir.equipo
--   incidente_turno_sin_cubrir.recordatorio_repetido  ->  incidente_turno_guardia_sin_cubrir.recordatorio_repetido
--   incidente_turno_sin_cubrir.sin_equipo  ->  incidente_turno_guardia_sin_cubrir.sin_equipo
--   recordatorio_de_guardia.cuerpo  ->  recordatorio_de_turno_guardia.cuerpo
--   recordatorio_de_guardia.titulo  ->  recordatorio_de_turno_guardia.titulo
--   turno_fijo_para_responder.cuerpo  ->  turno_guardia_fijo_para_responder.cuerpo
--   turno_fijo_para_responder.titulo  ->  turno_guardia_fijo_para_responder.titulo
--   turno_fijo_retirado.cuerpo  ->  turno_guardia_fijo_retirado.cuerpo
--   turno_fijo_retirado.titulo  ->  turno_guardia_fijo_retirado.titulo
--   turno_para_responder.cuerpo  ->  turno_guardia_para_responder.cuerpo
--   turno_para_responder.titulo  ->  turno_guardia_para_responder.titulo
--   turno_retirado.cuerpo  ->  turno_guardia_retirado.cuerpo
--   turno_retirado.titulo  ->  turno_guardia_retirado.titulo
--

BEGIN;

-- Los cuerpos de las funciones se revisan al usarlas: así el orden de creación no importa.
SET LOCAL check_function_bodies = off;

-- 1. Restricciones de verificación que nombran valores viejos.
ALTER TABLE public.alarmas_tomadas DROP CONSTRAINT alarmas_tomadas_tipo_conocido;
ALTER TABLE public.condiciones_comerciales_servicio DROP CONSTRAINT condiciones_comerciales_medicion_conocida;
ALTER TABLE public.escalones_de_alarma_avisados DROP CONSTRAINT escalones_de_alarma_avisados_tipo_conocido;
ALTER TABLE public.excepciones_familiar_relevo DROP CONSTRAINT excepciones_familiar_relevo_origen_conocido;
ALTER TABLE public.facturas_cliente_items DROP CONSTRAINT facturas_cliente_items_unidad_conocida;
ALTER TABLE public.liquidaciones_asistente DROP CONSTRAINT liquidaciones_asistente_base_unidad_check;
ALTER TABLE public.remuneraciones_asistente DROP CONSTRAINT remuneraciones_asistente_unidad_conocida;

-- 2. Valores y claves guardados.
UPDATE public.advertencias_legales x SET funcion_clave = m.nuevo FROM (VALUES ('alerta_temprana_guardia', 'alerta_temprana_turno_guardia'), ('alertas_tempranas_guardia', 'alertas_tempranas_turno_guardia'), ('asignaciones_de_turno', 'asignaciones_de_turno_guardia'), ('asistente_en_otro_turno', 'asistente_en_otro_turno_guardia'), ('cantidad_guardias', 'cantidad_turnos_guardia'), ('desactivacion_con_turnos_por_delante', 'desactivacion_con_turnos_guardia_por_delante'), ('el_servicio_tiene_guardias_asignadas', 'el_servicio_tiene_turnos_guardia_asignados'), ('emergencia_guardia', 'emergencia_turno_guardia'), ('emergencias_guardia', 'emergencias_turno_guardia'), ('guardia', 'turno_guardia'), ('guardia_empezada_no_cambia_de_asistente', 'turno_guardia_empezado_no_cambia_de_asistente'), ('guardia_empezada_no_cambia_de_paciente', 'turno_guardia_empezado_no_cambia_de_paciente'), ('guardia_id', 'turno_guardia_id'), ('guardia_no_encontrada', 'turno_guardia_no_encontrado'), ('guardia_no_se_asigna', 'turno_guardia_no_se_asigna'), ('guardia_nueva_id', 'turno_guardia_nuevo_id'), ('guardia_sin_asistente', 'turno_guardia_sin_asistente'), ('guardia_sin_cerrar', 'turno_guardia_sin_cerrar'), ('guardia_ya_cubierta', 'turno_guardia_ya_cubierto'), ('guardias', 'turnos_guardia'), ('incidente_turno_sin_cubrir', 'incidente_turno_guardia_sin_cubrir'), ('incidentes_turno_sin_cubrir', 'incidentes_turno_guardia_sin_cubrir'), ('persona_autorizada_guardias', 'persona_autorizada_turnos_guardia'), ('precio_guardia_adicional', 'precio_turno_guardia_adicional'), ('puntuacion_aceptacion_guardia', 'puntuacion_aceptacion_turno_guardia'), ('reasignacion_sin_guardia', 'reasignacion_sin_turno_guardia'), ('se_extendio_el_turno', 'se_extendio_el_turno_guardia'), ('turno', 'turno_guardia'), ('turno_sin_cubrir', 'turno_guardia_sin_cubrir'), ('valor_guardia', 'valor_turno_guardia')) m(viejo, nuevo) WHERE x.funcion_clave = m.viejo;
-- Una toma no cambia de tipo y una toma soltada no se toca: la protección se aparta sólo mientras
-- dura el cambio de nombre, que no cambia qué alarma es.
ALTER TABLE public.alarmas_tomadas DISABLE TRIGGER la_toma_la_suelta_quien_la_tomo;
UPDATE public.alarmas_tomadas x SET tipo = m.nuevo FROM (VALUES ('alerta_temprana_guardia', 'alerta_temprana_turno_guardia'), ('alertas_tempranas_guardia', 'alertas_tempranas_turno_guardia'), ('asignaciones_de_turno', 'asignaciones_de_turno_guardia'), ('asistente_en_otro_turno', 'asistente_en_otro_turno_guardia'), ('cantidad_guardias', 'cantidad_turnos_guardia'), ('desactivacion_con_turnos_por_delante', 'desactivacion_con_turnos_guardia_por_delante'), ('el_servicio_tiene_guardias_asignadas', 'el_servicio_tiene_turnos_guardia_asignados'), ('emergencia_guardia', 'emergencia_turno_guardia'), ('emergencias_guardia', 'emergencias_turno_guardia'), ('guardia', 'turno_guardia'), ('guardia_empezada_no_cambia_de_asistente', 'turno_guardia_empezado_no_cambia_de_asistente'), ('guardia_empezada_no_cambia_de_paciente', 'turno_guardia_empezado_no_cambia_de_paciente'), ('guardia_id', 'turno_guardia_id'), ('guardia_no_encontrada', 'turno_guardia_no_encontrado'), ('guardia_no_se_asigna', 'turno_guardia_no_se_asigna'), ('guardia_nueva_id', 'turno_guardia_nuevo_id'), ('guardia_sin_asistente', 'turno_guardia_sin_asistente'), ('guardia_sin_cerrar', 'turno_guardia_sin_cerrar'), ('guardia_ya_cubierta', 'turno_guardia_ya_cubierto'), ('guardias', 'turnos_guardia'), ('incidente_turno_sin_cubrir', 'incidente_turno_guardia_sin_cubrir'), ('incidentes_turno_sin_cubrir', 'incidentes_turno_guardia_sin_cubrir'), ('persona_autorizada_guardias', 'persona_autorizada_turnos_guardia'), ('precio_guardia_adicional', 'precio_turno_guardia_adicional'), ('puntuacion_aceptacion_guardia', 'puntuacion_aceptacion_turno_guardia'), ('reasignacion_sin_guardia', 'reasignacion_sin_turno_guardia'), ('se_extendio_el_turno', 'se_extendio_el_turno_guardia'), ('turno', 'turno_guardia'), ('turno_sin_cubrir', 'turno_guardia_sin_cubrir'), ('valor_guardia', 'valor_turno_guardia')) m(viejo, nuevo) WHERE x.tipo = m.viejo;
ALTER TABLE public.alarmas_tomadas ENABLE TRIGGER la_toma_la_suelta_quien_la_tomo;
UPDATE public.escalones_de_alarma_avisados x SET tipo = m.nuevo FROM (VALUES ('alerta_temprana_guardia', 'alerta_temprana_turno_guardia'), ('alertas_tempranas_guardia', 'alertas_tempranas_turno_guardia'), ('asignaciones_de_turno', 'asignaciones_de_turno_guardia'), ('asistente_en_otro_turno', 'asistente_en_otro_turno_guardia'), ('cantidad_guardias', 'cantidad_turnos_guardia'), ('desactivacion_con_turnos_por_delante', 'desactivacion_con_turnos_guardia_por_delante'), ('el_servicio_tiene_guardias_asignadas', 'el_servicio_tiene_turnos_guardia_asignados'), ('emergencia_guardia', 'emergencia_turno_guardia'), ('emergencias_guardia', 'emergencias_turno_guardia'), ('guardia', 'turno_guardia'), ('guardia_empezada_no_cambia_de_asistente', 'turno_guardia_empezado_no_cambia_de_asistente'), ('guardia_empezada_no_cambia_de_paciente', 'turno_guardia_empezado_no_cambia_de_paciente'), ('guardia_id', 'turno_guardia_id'), ('guardia_no_encontrada', 'turno_guardia_no_encontrado'), ('guardia_no_se_asigna', 'turno_guardia_no_se_asigna'), ('guardia_nueva_id', 'turno_guardia_nuevo_id'), ('guardia_sin_asistente', 'turno_guardia_sin_asistente'), ('guardia_sin_cerrar', 'turno_guardia_sin_cerrar'), ('guardia_ya_cubierta', 'turno_guardia_ya_cubierto'), ('guardias', 'turnos_guardia'), ('incidente_turno_sin_cubrir', 'incidente_turno_guardia_sin_cubrir'), ('incidentes_turno_sin_cubrir', 'incidentes_turno_guardia_sin_cubrir'), ('persona_autorizada_guardias', 'persona_autorizada_turnos_guardia'), ('precio_guardia_adicional', 'precio_turno_guardia_adicional'), ('puntuacion_aceptacion_guardia', 'puntuacion_aceptacion_turno_guardia'), ('reasignacion_sin_guardia', 'reasignacion_sin_turno_guardia'), ('se_extendio_el_turno', 'se_extendio_el_turno_guardia'), ('turno', 'turno_guardia'), ('turno_sin_cubrir', 'turno_guardia_sin_cubrir'), ('valor_guardia', 'valor_turno_guardia')) m(viejo, nuevo) WHERE x.tipo = m.viejo;
UPDATE public.configuracion_notificaciones x SET evento = m.nuevo FROM (VALUES ('alerta_temprana_guardia', 'alerta_temprana_turno_guardia'), ('alertas_tempranas_guardia', 'alertas_tempranas_turno_guardia'), ('asignaciones_de_turno', 'asignaciones_de_turno_guardia'), ('asistente_en_otro_turno', 'asistente_en_otro_turno_guardia'), ('cantidad_guardias', 'cantidad_turnos_guardia'), ('desactivacion_con_turnos_por_delante', 'desactivacion_con_turnos_guardia_por_delante'), ('el_servicio_tiene_guardias_asignadas', 'el_servicio_tiene_turnos_guardia_asignados'), ('emergencia_guardia', 'emergencia_turno_guardia'), ('emergencias_guardia', 'emergencias_turno_guardia'), ('guardia', 'turno_guardia'), ('guardia_empezada_no_cambia_de_asistente', 'turno_guardia_empezado_no_cambia_de_asistente'), ('guardia_empezada_no_cambia_de_paciente', 'turno_guardia_empezado_no_cambia_de_paciente'), ('guardia_id', 'turno_guardia_id'), ('guardia_no_encontrada', 'turno_guardia_no_encontrado'), ('guardia_no_se_asigna', 'turno_guardia_no_se_asigna'), ('guardia_nueva_id', 'turno_guardia_nuevo_id'), ('guardia_sin_asistente', 'turno_guardia_sin_asistente'), ('guardia_sin_cerrar', 'turno_guardia_sin_cerrar'), ('guardia_ya_cubierta', 'turno_guardia_ya_cubierto'), ('guardias', 'turnos_guardia'), ('incidente_turno_sin_cubrir', 'incidente_turno_guardia_sin_cubrir'), ('incidentes_turno_sin_cubrir', 'incidentes_turno_guardia_sin_cubrir'), ('persona_autorizada_guardias', 'persona_autorizada_turnos_guardia'), ('precio_guardia_adicional', 'precio_turno_guardia_adicional'), ('puntuacion_aceptacion_guardia', 'puntuacion_aceptacion_turno_guardia'), ('reasignacion_sin_guardia', 'reasignacion_sin_turno_guardia'), ('se_extendio_el_turno', 'se_extendio_el_turno_guardia'), ('turno', 'turno_guardia'), ('turno_sin_cubrir', 'turno_guardia_sin_cubrir'), ('valor_guardia', 'valor_turno_guardia')) m(viejo, nuevo) WHERE x.evento = m.viejo;
UPDATE public.finales_turno_sin_cubrir x SET clave = m.nuevo FROM (VALUES ('alerta_temprana_guardia', 'alerta_temprana_turno_guardia'), ('alertas_tempranas_guardia', 'alertas_tempranas_turno_guardia'), ('asignaciones_de_turno', 'asignaciones_de_turno_guardia'), ('asistente_en_otro_turno', 'asistente_en_otro_turno_guardia'), ('cantidad_guardias', 'cantidad_turnos_guardia'), ('desactivacion_con_turnos_por_delante', 'desactivacion_con_turnos_guardia_por_delante'), ('el_servicio_tiene_guardias_asignadas', 'el_servicio_tiene_turnos_guardia_asignados'), ('emergencia_guardia', 'emergencia_turno_guardia'), ('emergencias_guardia', 'emergencias_turno_guardia'), ('guardia', 'turno_guardia'), ('guardia_empezada_no_cambia_de_asistente', 'turno_guardia_empezado_no_cambia_de_asistente'), ('guardia_empezada_no_cambia_de_paciente', 'turno_guardia_empezado_no_cambia_de_paciente'), ('guardia_id', 'turno_guardia_id'), ('guardia_no_encontrada', 'turno_guardia_no_encontrado'), ('guardia_no_se_asigna', 'turno_guardia_no_se_asigna'), ('guardia_nueva_id', 'turno_guardia_nuevo_id'), ('guardia_sin_asistente', 'turno_guardia_sin_asistente'), ('guardia_sin_cerrar', 'turno_guardia_sin_cerrar'), ('guardia_ya_cubierta', 'turno_guardia_ya_cubierto'), ('guardias', 'turnos_guardia'), ('incidente_turno_sin_cubrir', 'incidente_turno_guardia_sin_cubrir'), ('incidentes_turno_sin_cubrir', 'incidentes_turno_guardia_sin_cubrir'), ('persona_autorizada_guardias', 'persona_autorizada_turnos_guardia'), ('precio_guardia_adicional', 'precio_turno_guardia_adicional'), ('puntuacion_aceptacion_guardia', 'puntuacion_aceptacion_turno_guardia'), ('reasignacion_sin_guardia', 'reasignacion_sin_turno_guardia'), ('se_extendio_el_turno', 'se_extendio_el_turno_guardia'), ('turno', 'turno_guardia'), ('turno_sin_cubrir', 'turno_guardia_sin_cubrir'), ('valor_guardia', 'valor_turno_guardia')) m(viejo, nuevo) WHERE x.clave = m.viejo;
UPDATE public.motivos_resolucion x SET tabla = m.nuevo FROM (VALUES ('alerta_temprana_guardia', 'alerta_temprana_turno_guardia'), ('alertas_tempranas_guardia', 'alertas_tempranas_turno_guardia'), ('asignaciones_de_turno', 'asignaciones_de_turno_guardia'), ('asistente_en_otro_turno', 'asistente_en_otro_turno_guardia'), ('cantidad_guardias', 'cantidad_turnos_guardia'), ('desactivacion_con_turnos_por_delante', 'desactivacion_con_turnos_guardia_por_delante'), ('el_servicio_tiene_guardias_asignadas', 'el_servicio_tiene_turnos_guardia_asignados'), ('emergencia_guardia', 'emergencia_turno_guardia'), ('emergencias_guardia', 'emergencias_turno_guardia'), ('guardia', 'turno_guardia'), ('guardia_empezada_no_cambia_de_asistente', 'turno_guardia_empezado_no_cambia_de_asistente'), ('guardia_empezada_no_cambia_de_paciente', 'turno_guardia_empezado_no_cambia_de_paciente'), ('guardia_id', 'turno_guardia_id'), ('guardia_no_encontrada', 'turno_guardia_no_encontrado'), ('guardia_no_se_asigna', 'turno_guardia_no_se_asigna'), ('guardia_nueva_id', 'turno_guardia_nuevo_id'), ('guardia_sin_asistente', 'turno_guardia_sin_asistente'), ('guardia_sin_cerrar', 'turno_guardia_sin_cerrar'), ('guardia_ya_cubierta', 'turno_guardia_ya_cubierto'), ('guardias', 'turnos_guardia'), ('incidente_turno_sin_cubrir', 'incidente_turno_guardia_sin_cubrir'), ('incidentes_turno_sin_cubrir', 'incidentes_turno_guardia_sin_cubrir'), ('persona_autorizada_guardias', 'persona_autorizada_turnos_guardia'), ('precio_guardia_adicional', 'precio_turno_guardia_adicional'), ('puntuacion_aceptacion_guardia', 'puntuacion_aceptacion_turno_guardia'), ('reasignacion_sin_guardia', 'reasignacion_sin_turno_guardia'), ('se_extendio_el_turno', 'se_extendio_el_turno_guardia'), ('turno', 'turno_guardia'), ('turno_sin_cubrir', 'turno_guardia_sin_cubrir'), ('valor_guardia', 'valor_turno_guardia')) m(viejo, nuevo) WHERE x.tabla = m.viejo;
UPDATE public.permisos_personas_autorizadas x SET clave = m.nuevo FROM (VALUES ('alerta_temprana_guardia', 'alerta_temprana_turno_guardia'), ('alertas_tempranas_guardia', 'alertas_tempranas_turno_guardia'), ('asignaciones_de_turno', 'asignaciones_de_turno_guardia'), ('asistente_en_otro_turno', 'asistente_en_otro_turno_guardia'), ('cantidad_guardias', 'cantidad_turnos_guardia'), ('desactivacion_con_turnos_por_delante', 'desactivacion_con_turnos_guardia_por_delante'), ('el_servicio_tiene_guardias_asignadas', 'el_servicio_tiene_turnos_guardia_asignados'), ('emergencia_guardia', 'emergencia_turno_guardia'), ('emergencias_guardia', 'emergencias_turno_guardia'), ('guardia', 'turno_guardia'), ('guardia_empezada_no_cambia_de_asistente', 'turno_guardia_empezado_no_cambia_de_asistente'), ('guardia_empezada_no_cambia_de_paciente', 'turno_guardia_empezado_no_cambia_de_paciente'), ('guardia_id', 'turno_guardia_id'), ('guardia_no_encontrada', 'turno_guardia_no_encontrado'), ('guardia_no_se_asigna', 'turno_guardia_no_se_asigna'), ('guardia_nueva_id', 'turno_guardia_nuevo_id'), ('guardia_sin_asistente', 'turno_guardia_sin_asistente'), ('guardia_sin_cerrar', 'turno_guardia_sin_cerrar'), ('guardia_ya_cubierta', 'turno_guardia_ya_cubierto'), ('guardias', 'turnos_guardia'), ('incidente_turno_sin_cubrir', 'incidente_turno_guardia_sin_cubrir'), ('incidentes_turno_sin_cubrir', 'incidentes_turno_guardia_sin_cubrir'), ('persona_autorizada_guardias', 'persona_autorizada_turnos_guardia'), ('precio_guardia_adicional', 'precio_turno_guardia_adicional'), ('puntuacion_aceptacion_guardia', 'puntuacion_aceptacion_turno_guardia'), ('reasignacion_sin_guardia', 'reasignacion_sin_turno_guardia'), ('se_extendio_el_turno', 'se_extendio_el_turno_guardia'), ('turno', 'turno_guardia'), ('turno_sin_cubrir', 'turno_guardia_sin_cubrir'), ('valor_guardia', 'valor_turno_guardia')) m(viejo, nuevo) WHERE x.clave = m.viejo;
UPDATE public.excepciones_familiar_relevo x SET origen = m.nuevo FROM (VALUES ('alerta_temprana_guardia', 'alerta_temprana_turno_guardia'), ('alertas_tempranas_guardia', 'alertas_tempranas_turno_guardia'), ('asignaciones_de_turno', 'asignaciones_de_turno_guardia'), ('asistente_en_otro_turno', 'asistente_en_otro_turno_guardia'), ('cantidad_guardias', 'cantidad_turnos_guardia'), ('desactivacion_con_turnos_por_delante', 'desactivacion_con_turnos_guardia_por_delante'), ('el_servicio_tiene_guardias_asignadas', 'el_servicio_tiene_turnos_guardia_asignados'), ('emergencia_guardia', 'emergencia_turno_guardia'), ('emergencias_guardia', 'emergencias_turno_guardia'), ('guardia', 'turno_guardia'), ('guardia_empezada_no_cambia_de_asistente', 'turno_guardia_empezado_no_cambia_de_asistente'), ('guardia_empezada_no_cambia_de_paciente', 'turno_guardia_empezado_no_cambia_de_paciente'), ('guardia_id', 'turno_guardia_id'), ('guardia_no_encontrada', 'turno_guardia_no_encontrado'), ('guardia_no_se_asigna', 'turno_guardia_no_se_asigna'), ('guardia_nueva_id', 'turno_guardia_nuevo_id'), ('guardia_sin_asistente', 'turno_guardia_sin_asistente'), ('guardia_sin_cerrar', 'turno_guardia_sin_cerrar'), ('guardia_ya_cubierta', 'turno_guardia_ya_cubierto'), ('guardias', 'turnos_guardia'), ('incidente_turno_sin_cubrir', 'incidente_turno_guardia_sin_cubrir'), ('incidentes_turno_sin_cubrir', 'incidentes_turno_guardia_sin_cubrir'), ('persona_autorizada_guardias', 'persona_autorizada_turnos_guardia'), ('precio_guardia_adicional', 'precio_turno_guardia_adicional'), ('puntuacion_aceptacion_guardia', 'puntuacion_aceptacion_turno_guardia'), ('reasignacion_sin_guardia', 'reasignacion_sin_turno_guardia'), ('se_extendio_el_turno', 'se_extendio_el_turno_guardia'), ('turno', 'turno_guardia'), ('turno_sin_cubrir', 'turno_guardia_sin_cubrir'), ('valor_guardia', 'valor_turno_guardia')) m(viejo, nuevo) WHERE x.origen = m.viejo;
UPDATE public.facturas_cliente_items x SET unidad = m.nuevo FROM (VALUES ('alerta_temprana_guardia', 'alerta_temprana_turno_guardia'), ('alertas_tempranas_guardia', 'alertas_tempranas_turno_guardia'), ('asignaciones_de_turno', 'asignaciones_de_turno_guardia'), ('asistente_en_otro_turno', 'asistente_en_otro_turno_guardia'), ('cantidad_guardias', 'cantidad_turnos_guardia'), ('desactivacion_con_turnos_por_delante', 'desactivacion_con_turnos_guardia_por_delante'), ('el_servicio_tiene_guardias_asignadas', 'el_servicio_tiene_turnos_guardia_asignados'), ('emergencia_guardia', 'emergencia_turno_guardia'), ('emergencias_guardia', 'emergencias_turno_guardia'), ('guardia', 'turno_guardia'), ('guardia_empezada_no_cambia_de_asistente', 'turno_guardia_empezado_no_cambia_de_asistente'), ('guardia_empezada_no_cambia_de_paciente', 'turno_guardia_empezado_no_cambia_de_paciente'), ('guardia_id', 'turno_guardia_id'), ('guardia_no_encontrada', 'turno_guardia_no_encontrado'), ('guardia_no_se_asigna', 'turno_guardia_no_se_asigna'), ('guardia_nueva_id', 'turno_guardia_nuevo_id'), ('guardia_sin_asistente', 'turno_guardia_sin_asistente'), ('guardia_sin_cerrar', 'turno_guardia_sin_cerrar'), ('guardia_ya_cubierta', 'turno_guardia_ya_cubierto'), ('guardias', 'turnos_guardia'), ('incidente_turno_sin_cubrir', 'incidente_turno_guardia_sin_cubrir'), ('incidentes_turno_sin_cubrir', 'incidentes_turno_guardia_sin_cubrir'), ('persona_autorizada_guardias', 'persona_autorizada_turnos_guardia'), ('precio_guardia_adicional', 'precio_turno_guardia_adicional'), ('puntuacion_aceptacion_guardia', 'puntuacion_aceptacion_turno_guardia'), ('reasignacion_sin_guardia', 'reasignacion_sin_turno_guardia'), ('se_extendio_el_turno', 'se_extendio_el_turno_guardia'), ('turno', 'turno_guardia'), ('turno_sin_cubrir', 'turno_guardia_sin_cubrir'), ('valor_guardia', 'valor_turno_guardia')) m(viejo, nuevo) WHERE x.unidad = m.viejo;
UPDATE public.liquidaciones_asistente x SET base_unidad = m.nuevo FROM (VALUES ('alerta_temprana_guardia', 'alerta_temprana_turno_guardia'), ('alertas_tempranas_guardia', 'alertas_tempranas_turno_guardia'), ('asignaciones_de_turno', 'asignaciones_de_turno_guardia'), ('asistente_en_otro_turno', 'asistente_en_otro_turno_guardia'), ('cantidad_guardias', 'cantidad_turnos_guardia'), ('desactivacion_con_turnos_por_delante', 'desactivacion_con_turnos_guardia_por_delante'), ('el_servicio_tiene_guardias_asignadas', 'el_servicio_tiene_turnos_guardia_asignados'), ('emergencia_guardia', 'emergencia_turno_guardia'), ('emergencias_guardia', 'emergencias_turno_guardia'), ('guardia', 'turno_guardia'), ('guardia_empezada_no_cambia_de_asistente', 'turno_guardia_empezado_no_cambia_de_asistente'), ('guardia_empezada_no_cambia_de_paciente', 'turno_guardia_empezado_no_cambia_de_paciente'), ('guardia_id', 'turno_guardia_id'), ('guardia_no_encontrada', 'turno_guardia_no_encontrado'), ('guardia_no_se_asigna', 'turno_guardia_no_se_asigna'), ('guardia_nueva_id', 'turno_guardia_nuevo_id'), ('guardia_sin_asistente', 'turno_guardia_sin_asistente'), ('guardia_sin_cerrar', 'turno_guardia_sin_cerrar'), ('guardia_ya_cubierta', 'turno_guardia_ya_cubierto'), ('guardias', 'turnos_guardia'), ('incidente_turno_sin_cubrir', 'incidente_turno_guardia_sin_cubrir'), ('incidentes_turno_sin_cubrir', 'incidentes_turno_guardia_sin_cubrir'), ('persona_autorizada_guardias', 'persona_autorizada_turnos_guardia'), ('precio_guardia_adicional', 'precio_turno_guardia_adicional'), ('puntuacion_aceptacion_guardia', 'puntuacion_aceptacion_turno_guardia'), ('reasignacion_sin_guardia', 'reasignacion_sin_turno_guardia'), ('se_extendio_el_turno', 'se_extendio_el_turno_guardia'), ('turno', 'turno_guardia'), ('turno_sin_cubrir', 'turno_guardia_sin_cubrir'), ('valor_guardia', 'valor_turno_guardia')) m(viejo, nuevo) WHERE x.base_unidad = m.viejo;
UPDATE public.remuneraciones_asistente x SET unidad_medicion = m.nuevo FROM (VALUES ('alerta_temprana_guardia', 'alerta_temprana_turno_guardia'), ('alertas_tempranas_guardia', 'alertas_tempranas_turno_guardia'), ('asignaciones_de_turno', 'asignaciones_de_turno_guardia'), ('asistente_en_otro_turno', 'asistente_en_otro_turno_guardia'), ('cantidad_guardias', 'cantidad_turnos_guardia'), ('desactivacion_con_turnos_por_delante', 'desactivacion_con_turnos_guardia_por_delante'), ('el_servicio_tiene_guardias_asignadas', 'el_servicio_tiene_turnos_guardia_asignados'), ('emergencia_guardia', 'emergencia_turno_guardia'), ('emergencias_guardia', 'emergencias_turno_guardia'), ('guardia', 'turno_guardia'), ('guardia_empezada_no_cambia_de_asistente', 'turno_guardia_empezado_no_cambia_de_asistente'), ('guardia_empezada_no_cambia_de_paciente', 'turno_guardia_empezado_no_cambia_de_paciente'), ('guardia_id', 'turno_guardia_id'), ('guardia_no_encontrada', 'turno_guardia_no_encontrado'), ('guardia_no_se_asigna', 'turno_guardia_no_se_asigna'), ('guardia_nueva_id', 'turno_guardia_nuevo_id'), ('guardia_sin_asistente', 'turno_guardia_sin_asistente'), ('guardia_sin_cerrar', 'turno_guardia_sin_cerrar'), ('guardia_ya_cubierta', 'turno_guardia_ya_cubierto'), ('guardias', 'turnos_guardia'), ('incidente_turno_sin_cubrir', 'incidente_turno_guardia_sin_cubrir'), ('incidentes_turno_sin_cubrir', 'incidentes_turno_guardia_sin_cubrir'), ('persona_autorizada_guardias', 'persona_autorizada_turnos_guardia'), ('precio_guardia_adicional', 'precio_turno_guardia_adicional'), ('puntuacion_aceptacion_guardia', 'puntuacion_aceptacion_turno_guardia'), ('reasignacion_sin_guardia', 'reasignacion_sin_turno_guardia'), ('se_extendio_el_turno', 'se_extendio_el_turno_guardia'), ('turno', 'turno_guardia'), ('turno_sin_cubrir', 'turno_guardia_sin_cubrir'), ('valor_guardia', 'valor_turno_guardia')) m(viejo, nuevo) WHERE x.unidad_medicion = m.viejo;

-- Claves de los mensajes del sistema, tramo por tramo.
-- El texto propio de una Prestadora se valida contra el del producto, y en la misma sentencia
-- los dos cambian de nombre: la validación se aparta sólo mientras dura el cambio de nombre.
ALTER TABLE public.mensajes_del_sistema DISABLE TRIGGER el_texto_propio_solo_donde_el_producto_lo_admite;
UPDATE public.mensajes_del_sistema x SET clave = m.nuevo FROM (VALUES
  ('alerta_temprana_guardia_cliente.cuerpo', 'alerta_temprana_turno_guardia_cliente.cuerpo'),
  ('alerta_temprana_guardia_cliente.titulo', 'alerta_temprana_turno_guardia_cliente.titulo'),
  ('ausencia_avisada_con_tiempo.deja_turnos_uno', 'ausencia_avisada_con_tiempo.deja_turnos_guardia_uno'),
  ('ausencia_avisada_con_tiempo.deja_turnos_varios', 'ausencia_avisada_con_tiempo.deja_turnos_guardia_varios'),
  ('cambio_de_asistente.linea_turno', 'cambio_de_asistente.linea_turno_guardia'),
  ('comun.aviso_repetido_guardia', 'comun.aviso_repetido_turno_guardia'),
  ('comun.linea_guardia', 'comun.linea_turno_guardia'),
  ('emergencia_en_guardia.asunto', 'emergencia_en_turno_guardia.asunto'),
  ('emergencia_en_guardia.texto', 'emergencia_en_turno_guardia.texto'),
  ('guardia_asignada.cuerpo', 'turno_guardia_asignado.cuerpo'),
  ('guardia_asignada.titulo', 'turno_guardia_asignado.titulo'),
  ('guardia_sin_cerrar.asunto', 'turno_guardia_sin_cerrar.asunto'),
  ('guardia_sin_cerrar.salida_marcada', 'turno_guardia_sin_cerrar.salida_marcada'),
  ('guardia_sin_cerrar.salida_sin_marcar', 'turno_guardia_sin_cerrar.salida_sin_marcar'),
  ('guardia_sin_cerrar_cliente.cuerpo', 'turno_guardia_sin_cerrar_cliente.cuerpo'),
  ('guardia_sin_cerrar_cliente.titulo', 'turno_guardia_sin_cerrar_cliente.titulo'),
  ('guardia_sin_cerrar_grave.asunto', 'turno_guardia_sin_cerrar_grave.asunto'),
  ('guardia_sin_cerrar_grave.hace_falta_autoridad', 'turno_guardia_sin_cerrar_grave.hace_falta_autoridad'),
  ('guardia_sin_cerrar_grave.salida_marcada', 'turno_guardia_sin_cerrar_grave.salida_marcada'),
  ('guardia_sin_cerrar_grave.salida_sin_marcar', 'turno_guardia_sin_cerrar_grave.salida_sin_marcar'),
  ('guardia_sin_cerrar_grave_cliente.cuerpo', 'turno_guardia_sin_cerrar_grave_cliente.cuerpo'),
  ('guardia_sin_cerrar_grave_cliente.titulo', 'turno_guardia_sin_cerrar_grave_cliente.titulo'),
  ('guardia_sin_cerrar_respaldo.texto', 'turno_guardia_sin_cerrar_respaldo.texto'),
  ('guardia_sin_cerrar_respaldo.texto_uno', 'turno_guardia_sin_cerrar_respaldo.texto_uno'),
  ('guardia_sin_cubrir.asunto', 'turno_guardia_sin_cubrir.asunto'),
  ('guardia_sin_cubrir.asunto_ya_empezo', 'turno_guardia_sin_cubrir.asunto_ya_empezo'),
  ('guardia_sin_cubrir.rechazada_una_vez', 'turno_guardia_sin_cubrir.rechazada_una_vez'),
  ('guardia_sin_cubrir.rechazada_varias_veces', 'turno_guardia_sin_cubrir.rechazada_varias_veces'),
  ('guardia_sin_cubrir.sin_asignar', 'turno_guardia_sin_cubrir.sin_asignar'),
  ('guardia_sin_cubrir.sin_responder', 'turno_guardia_sin_cubrir.sin_responder'),
  ('incidente_turno_sin_cubrir.asunto', 'incidente_turno_guardia_sin_cubrir.asunto'),
  ('incidente_turno_sin_cubrir.asunto_ya_empezo', 'incidente_turno_guardia_sin_cubrir.asunto_ya_empezo'),
  ('incidente_turno_sin_cubrir.cubren_francos', 'incidente_turno_guardia_sin_cubrir.cubren_francos'),
  ('incidente_turno_sin_cubrir.equipo', 'incidente_turno_guardia_sin_cubrir.equipo'),
  ('incidente_turno_sin_cubrir.recordatorio_repetido', 'incidente_turno_guardia_sin_cubrir.recordatorio_repetido'),
  ('incidente_turno_sin_cubrir.sin_equipo', 'incidente_turno_guardia_sin_cubrir.sin_equipo'),
  ('recordatorio_de_guardia.cuerpo', 'recordatorio_de_turno_guardia.cuerpo'),
  ('recordatorio_de_guardia.titulo', 'recordatorio_de_turno_guardia.titulo'),
  ('turno_fijo_para_responder.cuerpo', 'turno_guardia_fijo_para_responder.cuerpo'),
  ('turno_fijo_para_responder.titulo', 'turno_guardia_fijo_para_responder.titulo'),
  ('turno_fijo_retirado.cuerpo', 'turno_guardia_fijo_retirado.cuerpo'),
  ('turno_fijo_retirado.titulo', 'turno_guardia_fijo_retirado.titulo'),
  ('turno_para_responder.cuerpo', 'turno_guardia_para_responder.cuerpo'),
  ('turno_para_responder.titulo', 'turno_guardia_para_responder.titulo'),
  ('turno_retirado.cuerpo', 'turno_guardia_retirado.cuerpo'),
  ('turno_retirado.titulo', 'turno_guardia_retirado.titulo')
) m(viejo, nuevo) WHERE x.clave = m.viejo;
ALTER TABLE public.mensajes_del_sistema ENABLE TRIGGER el_texto_propio_solo_donde_el_producto_lo_admite;
UPDATE public.mensajes_del_sistema SET i18n = replace(i18n::text, '{{turnos}}', '{{turnos_guardia}}')::jsonb WHERE i18n::text LIKE '%{{turnos}}%';

-- Textos de fábrica que hablan del turno de una persona. Sólo cambian si siguen iguales al original.
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('El turno de guardia del {{fecha}}, de {{horaInicio}} a {{horaFin}}, para {{pacientes}} tiene una alerta pendiente de resolver. Ante cualquier duda, puede comunicarse con el Coordinador.'::text)) WHERE prestadora_id IS NULL AND clave = 'alerta_temprana_turno_guardia_cliente.cuerpo' AND i18n->>'es-AR' = 'La guardia del {{fecha}}, de {{horaInicio}} a {{horaFin}}, para {{pacientes}} tiene una alerta pendiente de resolver. Ante cualquier duda, puede comunicarse con el Coordinador.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('The guard shift on {{fecha}}, from {{horaInicio}} to {{horaFin}}, for {{pacientes}} has an alert that is still open. If you have any questions, you can contact the coordinator.'::text)) WHERE prestadora_id IS NULL AND clave = 'alerta_temprana_turno_guardia_cliente.cuerpo' AND i18n->>'en' = 'The shift on {{fecha}}, from {{horaInicio}} to {{horaFin}}, for {{pacientes}} has an alert that is still open. If you have any questions, you can contact the coordinator.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('O turno de plantão de {{fecha}}, das {{horaInicio}} às {{horaFin}}, para {{pacientes}} tem um alerta pendente de resolver. Em caso de dúvida, pode entrar em contato com o Coordenador.'::text)) WHERE prestadora_id IS NULL AND clave = 'alerta_temprana_turno_guardia_cliente.cuerpo' AND i18n->>'pt-BR' = 'O plantão de {{fecha}}, das {{horaInicio}} às {{horaFin}}, para {{pacientes}} tem um alerta pendente de resolver. Em caso de dúvida, pode entrar em contato com o Coordenador.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Turno de guardia con una alerta pendiente'::text)) WHERE prestadora_id IS NULL AND clave = 'alerta_temprana_turno_guardia_cliente.titulo' AND i18n->>'es-AR' = 'Guardia con una alerta pendiente';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('Guard shift with an open alert'::text)) WHERE prestadora_id IS NULL AND clave = 'alerta_temprana_turno_guardia_cliente.titulo' AND i18n->>'en' = 'Shift with an open alert';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Turno de plantão com um alerta pendente'::text)) WHERE prestadora_id IS NULL AND clave = 'alerta_temprana_turno_guardia_cliente.titulo' AND i18n->>'pt-BR' = 'Plantão com um alerta pendente';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Deja {{turnos_guardia}} turno de guardia sin nadie. El primero es el del {{fecha}}, de {{horaInicio}} a {{horaFin}}, y empieza en {{horas}} h.'::text)) WHERE prestadora_id IS NULL AND clave = 'ausencia_avisada_con_tiempo.deja_turnos_guardia_uno' AND i18n->>'es-AR' = 'Deja {{turnos_guardia}} guardia sin nadie. La primera es la del {{fecha}}, de {{horaInicio}} a {{horaFin}}, y empieza en {{horas}} h.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('This leaves {{turnos_guardia}} guard shift with nobody. The first one is on {{fecha}}, from {{horaInicio}} to {{horaFin}}, and it starts in {{horas}} h.'::text)) WHERE prestadora_id IS NULL AND clave = 'ausencia_avisada_con_tiempo.deja_turnos_guardia_uno' AND i18n->>'en' = 'This leaves {{turnos_guardia}} shift with nobody. The first one is on {{fecha}}, from {{horaInicio}} to {{horaFin}}, and it starts in {{horas}} h.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Deixa {{turnos_guardia}} turno de plantão sem ninguém. O primeiro é o de {{fecha}}, das {{horaInicio}} às {{horaFin}}, e começa em {{horas}} h.'::text)) WHERE prestadora_id IS NULL AND clave = 'ausencia_avisada_con_tiempo.deja_turnos_guardia_uno' AND i18n->>'pt-BR' = 'Deixa {{turnos_guardia}} plantão sem ninguém. O primeiro é o de {{fecha}}, das {{horaInicio}} às {{horaFin}}, e começa em {{horas}} h.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Deja {{turnos_guardia}} turnos de guardia sin nadie. El primero es el del {{fecha}}, de {{horaInicio}} a {{horaFin}}, y empieza en {{horas}} h.'::text)) WHERE prestadora_id IS NULL AND clave = 'ausencia_avisada_con_tiempo.deja_turnos_guardia_varios' AND i18n->>'es-AR' = 'Deja {{turnos_guardia}} guardias sin nadie. La primera es la del {{fecha}}, de {{horaInicio}} a {{horaFin}}, y empieza en {{horas}} h.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Deixa {{turnos_guardia}} turnos de plantão sem ninguém. O primeiro é o de {{fecha}}, das {{horaInicio}} às {{horaFin}}, e começa em {{horas}} h.'::text)) WHERE prestadora_id IS NULL AND clave = 'ausencia_avisada_con_tiempo.deja_turnos_guardia_varios' AND i18n->>'pt-BR' = 'Deixa {{turnos_guardia}} plantões sem ninguém. O primeiro é o de {{fecha}}, das {{horaInicio}} às {{horaFin}}, e começa em {{horas}} h.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Además deja otro turno de guardia sin nadie.'::text)) WHERE prestadora_id IS NULL AND clave = 'ausencia_de_golpe.ademas_uno' AND i18n->>'es-AR' = 'Además deja otra guardia sin nadie.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('It also leaves one more guard shift with nobody.'::text)) WHERE prestadora_id IS NULL AND clave = 'ausencia_de_golpe.ademas_uno' AND i18n->>'en' = 'It also leaves one more shift with nobody.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Também deixa outro turno de plantão sem ninguém.'::text)) WHERE prestadora_id IS NULL AND clave = 'ausencia_de_golpe.ademas_uno' AND i18n->>'pt-BR' = 'Também deixa outro plantão sem ninguém.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Además deja otros {{otras}} turnos de guardia sin nadie.'::text)) WHERE prestadora_id IS NULL AND clave = 'ausencia_de_golpe.ademas_varios' AND i18n->>'es-AR' = 'Además deja otras {{otras}} guardias sin nadie.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Também deixa outros {{otras}} turnos de plantão sem ninguém.'::text)) WHERE prestadora_id IS NULL AND clave = 'ausencia_de_golpe.ademas_varios' AND i18n->>'pt-BR' = 'Também deixa outros {{otras}} plantões sem ninguém.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Falta un Asistente y el turno de guardia empieza enseguida'::text)) WHERE prestadora_id IS NULL AND clave = 'ausencia_de_golpe.asunto' AND i18n->>'es-AR' = 'Falta un Asistente y la guardia empieza enseguida';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('A care worker is missing and the guard shift starts shortly'::text)) WHERE prestadora_id IS NULL AND clave = 'ausencia_de_golpe.asunto' AND i18n->>'en' = 'A care worker is missing and the shift starts shortly';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Falta um Assistente e o turno de plantão começa em seguida'::text)) WHERE prestadora_id IS NULL AND clave = 'ausencia_de_golpe.asunto' AND i18n->>'pt-BR' = 'Falta um Assistente e o plantão começa em seguida';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Falta un Asistente: el turno de guardia ya tendría que haber empezado'::text)) WHERE prestadora_id IS NULL AND clave = 'ausencia_de_golpe.asunto_ya_empezo' AND i18n->>'es-AR' = 'Falta un Asistente: la guardia ya tendría que haber empezado';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('A care worker is missing: the guard shift should have started already'::text)) WHERE prestadora_id IS NULL AND clave = 'ausencia_de_golpe.asunto_ya_empezo' AND i18n->>'en' = 'A care worker is missing: the shift should have started already';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Falta um Assistente: o turno de plantão já deveria ter começado'::text)) WHERE prestadora_id IS NULL AND clave = 'ausencia_de_golpe.asunto_ya_empezo' AND i18n->>'pt-BR' = 'Falta um Assistente: o plantão já deveria ter começado';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Turno de guardia del {{fecha}} a las {{horaInicio}}. Origen: {{origen}}. Motivo: {{motivo}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'aviso_demora_asistente.texto' AND i18n->>'es-AR' = 'Guardia del {{fecha}} a las {{horaInicio}}. Origen: {{origen}}. Motivo: {{motivo}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('Guard shift on {{fecha}} at {{horaInicio}}. Source: {{origen}}. Reason: {{motivo}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'aviso_demora_asistente.texto' AND i18n->>'en' = 'Shift on {{fecha}} at {{horaInicio}}. Source: {{origen}}. Reason: {{motivo}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Turno de plantão de {{fecha}} às {{horaInicio}}. Origem: {{origen}}. Motivo: {{motivo}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'aviso_demora_asistente.texto' AND i18n->>'pt-BR' = 'Plantão de {{fecha}} às {{horaInicio}}. Origem: {{origen}}. Motivo: {{motivo}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('El turno de guardia del {{fecha}}, de {{horaInicio}} a {{horaFin}}, lo hace {{nuevo}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'cambio_de_asistente_cliente.cuerpo_uno' AND i18n->>'es-AR' = 'La guardia del {{fecha}}, de {{horaInicio}} a {{horaFin}}, la hace {{nuevo}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('The guard shift on {{fecha}}, from {{horaInicio}} to {{horaFin}}, will be covered by {{nuevo}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'cambio_de_asistente_cliente.cuerpo_uno' AND i18n->>'en' = 'The shift on {{fecha}}, from {{horaInicio}} to {{horaFin}}, will be covered by {{nuevo}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('O turno de plantão de {{fecha}}, das {{horaInicio}} às {{horaFin}}, será feito por {{nuevo}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'cambio_de_asistente_cliente.cuerpo_uno' AND i18n->>'pt-BR' = 'O plantão de {{fecha}}, das {{horaInicio}} às {{horaFin}}, será feito por {{nuevo}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('{{cuantas}} turnos de guardia, desde el del {{fecha}}, los hace {{nuevo}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'cambio_de_asistente_cliente.cuerpo_varios' AND i18n->>'es-AR' = '{{cuantas}} guardias, desde la del {{fecha}}, las hace {{nuevo}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('{{cuantas}} turnos de plantão, a partir do de {{fecha}}, serão feitos por {{nuevo}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'cambio_de_asistente_cliente.cuerpo_varios' AND i18n->>'pt-BR' = '{{cuantas}} plantões, a partir do de {{fecha}}, serão feitos por {{nuevo}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('{{nuevo}} reemplaza a {{anterior}} en el turno de guardia del {{fecha}}, de {{horaInicio}} a {{horaFin}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'cambio_de_asistente_cliente.reemplaza_uno' AND i18n->>'es-AR' = '{{nuevo}} reemplaza a {{anterior}} en la guardia del {{fecha}}, de {{horaInicio}} a {{horaFin}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('{{nuevo}} replaces {{anterior}} on the guard shift of {{fecha}}, from {{horaInicio}} to {{horaFin}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'cambio_de_asistente_cliente.reemplaza_uno' AND i18n->>'en' = '{{nuevo}} replaces {{anterior}} on the shift of {{fecha}}, from {{horaInicio}} to {{horaFin}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('{{nuevo}} substitui {{anterior}} no turno de plantão do dia {{fecha}}, das {{horaInicio}} às {{horaFin}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'cambio_de_asistente_cliente.reemplaza_uno' AND i18n->>'pt-BR' = '{{nuevo}} substitui {{anterior}} no plantão do dia {{fecha}}, das {{horaInicio}} às {{horaFin}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('{{nuevo}} reemplaza a {{anterior}} en {{cuantas}} turnos de guardia a partir del {{fecha}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'cambio_de_asistente_cliente.reemplaza_varios' AND i18n->>'es-AR' = '{{nuevo}} reemplaza a {{anterior}} en {{cuantas}} guardias a partir del {{fecha}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('{{nuevo}} substitui {{anterior}} em {{cuantas}} turnos de plantão a partir do dia {{fecha}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'cambio_de_asistente_cliente.reemplaza_varios' AND i18n->>'pt-BR' = '{{nuevo}} substitui {{anterior}} em {{cuantas}} plantões a partir do dia {{fecha}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Cambió el Asistente de un turno de guardia'::text)) WHERE prestadora_id IS NULL AND clave = 'cambio_de_asistente.asunto_uno' AND i18n->>'es-AR' = 'Cambió el Asistente de una guardia';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('The care worker on a guard shift changed'::text)) WHERE prestadora_id IS NULL AND clave = 'cambio_de_asistente.asunto_uno' AND i18n->>'en' = 'The care worker on a shift changed';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('O Assistente de um turno de plantão mudou'::text)) WHERE prestadora_id IS NULL AND clave = 'cambio_de_asistente.asunto_uno' AND i18n->>'pt-BR' = 'O Assistente de um plantão mudou';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Cambió el Asistente de varios turnos de guardia'::text)) WHERE prestadora_id IS NULL AND clave = 'cambio_de_asistente.asunto_varios' AND i18n->>'es-AR' = 'Cambió el Asistente de varias guardias';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('O Assistente de vários turnos de plantão mudou'::text)) WHERE prestadora_id IS NULL AND clave = 'cambio_de_asistente.asunto_varios' AND i18n->>'pt-BR' = 'O Assistente de vários plantões mudou';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('{{anterior}} ya no hace este turno de guardia. Ahora lo hace {{nuevo}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'cambio_de_asistente.cambio_uno' AND i18n->>'es-AR' = '{{anterior}} ya no hace esta guardia. Ahora la hace {{nuevo}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('{{anterior}} no longer covers this guard shift. {{nuevo}} covers it now.'::text)) WHERE prestadora_id IS NULL AND clave = 'cambio_de_asistente.cambio_uno' AND i18n->>'en' = '{{anterior}} no longer covers this shift. {{nuevo}} covers it now.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('{{anterior}} não faz mais este turno de plantão. Agora é feito por {{nuevo}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'cambio_de_asistente.cambio_uno' AND i18n->>'pt-BR' = '{{anterior}} não faz mais este plantão. Agora é feito por {{nuevo}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('{{anterior}} ya no hace estos turnos de guardia. Ahora los hace {{nuevo}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'cambio_de_asistente.cambio_varios' AND i18n->>'es-AR' = '{{anterior}} ya no hace estas guardias. Ahora las hace {{nuevo}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('{{anterior}} não faz mais estes turnos de plantão. Agora são feitos por {{nuevo}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'cambio_de_asistente.cambio_varios' AND i18n->>'pt-BR' = '{{anterior}} não faz mais estes plantões. Agora são feitos por {{nuevo}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Este turno de guardia pasa a {{nuevo}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'cambio_de_asistente.pasa_uno' AND i18n->>'es-AR' = 'Esta guardia pasa a {{nuevo}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('This guard shift goes to {{nuevo}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'cambio_de_asistente.pasa_uno' AND i18n->>'en' = 'This shift goes to {{nuevo}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Este turno de plantão passa para {{nuevo}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'cambio_de_asistente.pasa_uno' AND i18n->>'pt-BR' = 'Este plantão passa para {{nuevo}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Estos turnos de guardia pasan a {{nuevo}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'cambio_de_asistente.pasa_varios' AND i18n->>'es-AR' = 'Estas guardias pasan a {{nuevo}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Estes turnos de plantão passam para {{nuevo}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'cambio_de_asistente.pasa_varios' AND i18n->>'pt-BR' = 'Estes plantões passam para {{nuevo}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('{{nombre}} no puede cubrir un turno de guardia'::text)) WHERE prestadora_id IS NULL AND clave = 'cobertura_objetada.asunto' AND i18n->>'es-AR' = '{{nombre}} no puede cubrir un turno';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('{{nombre}} cannot cover a guard shift'::text)) WHERE prestadora_id IS NULL AND clave = 'cobertura_objetada.asunto' AND i18n->>'en' = '{{nombre}} cannot cover a shift';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('{{nombre}} não pode cobrir um turno de plantão'::text)) WHERE prestadora_id IS NULL AND clave = 'cobertura_objetada.asunto' AND i18n->>'pt-BR' = '{{nombre}} não pode cobrir um turno';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('{{nombre}} avisó que no puede cubrir el turno de guardia fijo que se le asignó durante una ausencia. Esos turnos de guardia volvieron a quedar sin cubrir.'::text)) WHERE prestadora_id IS NULL AND clave = 'cobertura_objetada.cuerpo' AND i18n->>'es-AR' = '{{nombre}} avisó que no puede cubrir el turno fijo que se le asignó durante una ausencia. Esas guardias volvieron a quedar sin cubrir.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('{{nombre}} reported being unable to cover the recurring guard shift assigned during an absence. Those shifts are uncovered again.'::text)) WHERE prestadora_id IS NULL AND clave = 'cobertura_objetada.cuerpo' AND i18n->>'en' = '{{nombre}} reported being unable to cover the recurring shift assigned during an absence. Those shifts are uncovered again.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('{{nombre}} avisou que não pode cobrir o turno de plantão fixo atribuído durante uma ausência. Esses turnos de plantão voltaram a ficar sem cobertura.'::text)) WHERE prestadora_id IS NULL AND clave = 'cobertura_objetada.cuerpo' AND i18n->>'pt-BR' = '{{nombre}} avisou que não pode cobrir o turno fixo atribuído durante uma ausência. Esses plantões voltaram a ficar sem cobertura.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Es el mensaje número {{veces}} de este mismo turno de guardia.'::text)) WHERE prestadora_id IS NULL AND clave = 'comun.aviso_repetido_turno_guardia' AND i18n->>'es-AR' = 'Es el mensaje número {{veces}} de esta misma guardia.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('This is message number {{veces}} for this same guard shift.'::text)) WHERE prestadora_id IS NULL AND clave = 'comun.aviso_repetido_turno_guardia' AND i18n->>'en' = 'This is message number {{veces}} for this same shift.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('É a mensagem número {{veces}} deste mesmo turno de plantão.'::text)) WHERE prestadora_id IS NULL AND clave = 'comun.aviso_repetido_turno_guardia' AND i18n->>'pt-BR' = 'É a mensagem número {{veces}} deste mesmo plantão.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Turno de guardia del {{fecha}}, de {{horaInicio}} a {{horaFin}}, para {{pacientes}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'comun.linea_turno_guardia' AND i18n->>'es-AR' = 'Guardia del {{fecha}}, de {{horaInicio}} a {{horaFin}}, para {{pacientes}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('Guard shift on {{fecha}}, from {{horaInicio}} to {{horaFin}}, for {{pacientes}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'comun.linea_turno_guardia' AND i18n->>'en' = 'Shift on {{fecha}}, from {{horaInicio}} to {{horaFin}}, for {{pacientes}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Turno de plantão de {{fecha}}, das {{horaInicio}} às {{horaFin}}, para {{pacientes}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'comun.linea_turno_guardia' AND i18n->>'pt-BR' = 'Plantão de {{fecha}}, das {{horaInicio}} às {{horaFin}}, para {{pacientes}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Se busca quién cubra un turno de guardia: {{fecha}}, de {{horaInicio}} a {{horaFin}}'::text)) WHERE prestadora_id IS NULL AND clave = 'convocatoria_de_relevo.titulo' AND i18n->>'es-AR' = 'Se busca quién cubra una guardia: {{fecha}}, de {{horaInicio}} a {{horaFin}}';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('Cover needed for a guard shift: {{fecha}}, from {{horaInicio}} to {{horaFin}}'::text)) WHERE prestadora_id IS NULL AND clave = 'convocatoria_de_relevo.titulo' AND i18n->>'en' = 'Cover needed for a shift: {{fecha}}, from {{horaInicio}} to {{horaFin}}';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Procura-se quem cubra um turno de plantão: {{fecha}}, das {{horaInicio}} às {{horaFin}}'::text)) WHERE prestadora_id IS NULL AND clave = 'convocatoria_de_relevo.titulo' AND i18n->>'pt-BR' = 'Procura-se quem cubra um plantão: {{fecha}}, das {{horaInicio}} às {{horaFin}}';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Emergencia avisada desde un turno de guardia'::text)) WHERE prestadora_id IS NULL AND clave = 'emergencia_en_turno_guardia.asunto' AND i18n->>'es-AR' = 'Emergencia avisada desde una guardia';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('Emergency reported from a guard shift'::text)) WHERE prestadora_id IS NULL AND clave = 'emergencia_en_turno_guardia.asunto' AND i18n->>'en' = 'Emergency reported from a shift';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Emergência avisada a partir de um turno de plantão'::text)) WHERE prestadora_id IS NULL AND clave = 'emergencia_en_turno_guardia.asunto' AND i18n->>'pt-BR' = 'Emergência avisada a partir de um plantão';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Turno de guardia del {{fecha}} a las {{horaInicio}}. El Asistente avisó una emergencia. El detalle está en el Panel.'::text)) WHERE prestadora_id IS NULL AND clave = 'emergencia_en_turno_guardia.texto' AND i18n->>'es-AR' = 'Guardia del {{fecha}} a las {{horaInicio}}. El Asistente avisó una emergencia. El detalle está en el Panel.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('Guard shift on {{fecha}} at {{horaInicio}}. The care worker reported an emergency. The details are in the Panel.'::text)) WHERE prestadora_id IS NULL AND clave = 'emergencia_en_turno_guardia.texto' AND i18n->>'en' = 'Shift on {{fecha}} at {{horaInicio}}. The care worker reported an emergency. The details are in the Panel.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Turno de plantão de {{fecha}} às {{horaInicio}}. O Assistente avisou uma emergência. O detalhe está no Painel.'::text)) WHERE prestadora_id IS NULL AND clave = 'emergencia_en_turno_guardia.texto' AND i18n->>'pt-BR' = 'Plantão de {{fecha}} às {{horaInicio}}. O Assistente avisou uma emergência. O detalhe está no Painel.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Hay un turno de guardia asignado el {{fecha}} a las {{horaInicio}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_asignado.cuerpo' AND i18n->>'es-AR' = 'Hay una guardia asignada el {{fecha}} a las {{horaInicio}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('A guard shift has been assigned on {{fecha}} at {{horaInicio}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_asignado.cuerpo' AND i18n->>'en' = 'A shift has been assigned on {{fecha}} at {{horaInicio}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Há um turno de plantão atribuído no dia {{fecha}} às {{horaInicio}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_asignado.cuerpo' AND i18n->>'pt-BR' = 'Há um plantão atribuído no dia {{fecha}} às {{horaInicio}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Nuevo turno de guardia asignado'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_asignado.titulo' AND i18n->>'es-AR' = 'Nueva guardia asignada';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('New guard shift assigned'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_asignado.titulo' AND i18n->>'en' = 'New shift assigned';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Novo turno de plantão atribuído'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_asignado.titulo' AND i18n->>'pt-BR' = 'Novo plantão atribuído';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('El turno de guardia del {{fecha}}, de {{horaInicio}} a {{horaFin}}, para {{pacientes}} pasó su hora de cierre y todavía figura abierto. Ante cualquier duda, puede comunicarse con su Coordinador.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cerrar_cliente.cuerpo' AND i18n->>'es-AR' = 'La guardia del {{fecha}}, de {{horaInicio}} a {{horaFin}}, para {{pacientes}} pasó su hora de cierre y todavía figura abierta. Ante cualquier duda, puede comunicarse con su Coordinador.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('The guard shift on {{fecha}}, from {{horaInicio}} to {{horaFin}}, for {{pacientes}} is past its closing time and is still open. If you have any questions, you can contact your coordinator.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cerrar_cliente.cuerpo' AND i18n->>'en' = 'The shift on {{fecha}}, from {{horaInicio}} to {{horaFin}}, for {{pacientes}} is past its closing time and is still open. If you have any questions, you can contact your coordinator.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('O turno de plantão de {{fecha}}, das {{horaInicio}} às {{horaFin}}, para {{pacientes}} passou da hora de encerramento e ainda consta aberto. Em caso de dúvida, pode entrar em contato com o seu Coordenador.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cerrar_cliente.cuerpo' AND i18n->>'pt-BR' = 'O plantão de {{fecha}}, das {{horaInicio}} às {{horaFin}}, para {{pacientes}} passou da hora de encerramento e ainda consta aberto. Em caso de dúvida, pode entrar em contato com o seu Coordenador.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Turno de guardia sin cerrar'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cerrar_cliente.titulo' AND i18n->>'es-AR' = 'Guardia sin cerrar';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('Guard shift not closed'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cerrar_cliente.titulo' AND i18n->>'en' = 'Shift not closed';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Turno de plantão sem encerrar'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cerrar_cliente.titulo' AND i18n->>'pt-BR' = 'Plantão sem encerrar';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('El turno de guardia del {{fecha}}, de {{horaInicio}} a {{horaFin}}, para {{pacientes}} sigue figurando abierto varias horas después de su hora de cierre. Ante cualquier duda, puede comunicarse con su Coordinador.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cerrar_grave_cliente.cuerpo' AND i18n->>'es-AR' = 'La guardia del {{fecha}}, de {{horaInicio}} a {{horaFin}}, para {{pacientes}} sigue figurando abierta varias horas después de su hora de cierre. Ante cualquier duda, puede comunicarse con su Coordinador.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('The guard shift on {{fecha}}, from {{horaInicio}} to {{horaFin}}, for {{pacientes}} is still open several hours after its closing time. If you have any questions, you can contact your coordinator.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cerrar_grave_cliente.cuerpo' AND i18n->>'en' = 'The shift on {{fecha}}, from {{horaInicio}} to {{horaFin}}, for {{pacientes}} is still open several hours after its closing time. If you have any questions, you can contact your coordinator.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('O turno de plantão de {{fecha}}, das {{horaInicio}} às {{horaFin}}, para {{pacientes}} continua aberto várias horas depois da hora de encerramento. Em caso de dúvida, pode entrar em contato com o seu Coordenador.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cerrar_grave_cliente.cuerpo' AND i18n->>'pt-BR' = 'O plantão de {{fecha}}, das {{horaInicio}} às {{horaFin}}, para {{pacientes}} continua aberto várias horas depois da hora de encerramento. Em caso de dúvida, pode entrar em contato com o seu Coordenador.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Turno de guardia sin cerrar'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cerrar_grave_cliente.titulo' AND i18n->>'es-AR' = 'Guardia sin cerrar';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('Guard shift not closed'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cerrar_grave_cliente.titulo' AND i18n->>'en' = 'Shift not closed';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Turno de plantão sem encerrar'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cerrar_grave_cliente.titulo' AND i18n->>'pt-BR' = 'Plantão sem encerrar';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Urgente: un turno de guardia lleva horas sin cerrarse'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cerrar_grave.asunto' AND i18n->>'es-AR' = 'Urgente: una guardia lleva horas sin cerrarse';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('Urgent: a guard shift has been open for hours'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cerrar_grave.asunto' AND i18n->>'en' = 'Urgent: a shift has been open for hours';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Urgente: um turno de plantão está há horas sem fechar'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cerrar_grave.asunto' AND i18n->>'pt-BR' = 'Urgente: um plantão está há horas sem fechar';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('El sistema avisó al Coordinador y el turno de guardia sigue sin cerrarse. Intervenga para resolverlo.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cerrar_grave.hace_falta_autoridad' AND i18n->>'es-AR' = 'El sistema avisó al Coordinador y la guardia sigue sin cerrarse. Intervenga para resolverlo.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('The system notified the Coordinator and the guard shift is still not closed. Step in to resolve it.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cerrar_grave.hace_falta_autoridad' AND i18n->>'en' = 'The system notified the Coordinator and the shift is still not closed. Step in to resolve it.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('O sistema avisou o Coordenador e o turno de plantão continua sem ser encerrado. Intervenha para resolver.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cerrar_grave.hace_falta_autoridad' AND i18n->>'pt-BR' = 'O sistema avisou o Coordenador e o plantão continua sem ser encerrado. Intervenha para resolver.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('El Asistente no marcó su salida, así que no hay constancia de que el turno de guardia haya terminado ni de quién quedó a cargo del Paciente.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cerrar_grave.salida_sin_marcar' AND i18n->>'es-AR' = 'El Asistente no marcó su salida, así que no hay constancia de que la guardia haya terminado ni de quién quedó a cargo del Paciente.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('The care worker did not clock out, so there is no record that the guard shift ended or of who was left in charge of the patient.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cerrar_grave.salida_sin_marcar' AND i18n->>'en' = 'The care worker did not clock out, so there is no record that the shift ended or of who was left in charge of the patient.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('O Assistente não registrou a saída, então não há registro de que o turno de plantão tenha terminado nem de quem ficou a cargo do Paciente.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cerrar_grave.salida_sin_marcar' AND i18n->>'pt-BR' = 'O Assistente não registrou a saída, então não há registro de que o plantão tenha terminado nem de quem ficou a cargo do Paciente.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('El turno de guardia del {{fecha}}, de {{horaInicio}} a {{horaFin}}, sigue sin cerrarse {{minutos}} minutos después del plazo.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cerrar_respaldo.texto' AND i18n->>'es-AR' = 'La guardia del {{fecha}}, de {{horaInicio}} a {{horaFin}}, sigue sin cerrarse {{minutos}} minutos después del plazo.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('The guard shift on {{fecha}}, from {{horaInicio}} to {{horaFin}}, is still open {{minutos}} minutes past the deadline.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cerrar_respaldo.texto' AND i18n->>'en' = 'The shift on {{fecha}}, from {{horaInicio}} to {{horaFin}}, is still open {{minutos}} minutes past the deadline.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('O turno de plantão de {{fecha}}, das {{horaInicio}} às {{horaFin}}, continua sem fechar {{minutos}} minutos depois do prazo.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cerrar_respaldo.texto' AND i18n->>'pt-BR' = 'O plantão de {{fecha}}, das {{horaInicio}} às {{horaFin}}, continua sem fechar {{minutos}} minutos depois do prazo.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('El turno de guardia del {{fecha}}, de {{horaInicio}} a {{horaFin}}, sigue sin cerrarse {{minutos}} minuto después del plazo.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cerrar_respaldo.texto_uno' AND i18n->>'es-AR' = 'La guardia del {{fecha}}, de {{horaInicio}} a {{horaFin}}, sigue sin cerrarse {{minutos}} minuto después del plazo.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('The guard shift on {{fecha}}, from {{horaInicio}} to {{horaFin}}, is still open {{minutos}} minute past the deadline.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cerrar_respaldo.texto_uno' AND i18n->>'en' = 'The shift on {{fecha}}, from {{horaInicio}} to {{horaFin}}, is still open {{minutos}} minute past the deadline.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('O turno de plantão de {{fecha}}, das {{horaInicio}} às {{horaFin}}, continua sem fechar {{minutos}} minuto depois do prazo.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cerrar_respaldo.texto_uno' AND i18n->>'pt-BR' = 'O plantão de {{fecha}}, das {{horaInicio}} às {{horaFin}}, continua sem fechar {{minutos}} minuto depois do prazo.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Turno de guardia terminado y todavía sin cerrar'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cerrar.asunto' AND i18n->>'es-AR' = 'Guardia terminada y todavía sin cerrar';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('Guard shift finished and still open'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cerrar.asunto' AND i18n->>'en' = 'Shift finished and still open';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Turno de plantão terminado e ainda sem fechar'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cerrar.asunto' AND i18n->>'pt-BR' = 'Plantão terminado e ainda sem fechar';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Turno de guardia sin cubrir'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cubrir.asunto' AND i18n->>'es-AR' = 'Guardia sin cubrir';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('Guard shift not covered'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cubrir.asunto' AND i18n->>'en' = 'Shift not covered';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Turno de plantão sem cobertura'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cubrir.asunto' AND i18n->>'pt-BR' = 'Plantão sem cobertura';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Turno de guardia sin cubrir: la hora de inicio ya pasó'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cubrir.asunto_ya_empezo' AND i18n->>'es-AR' = 'Guardia sin cubrir: la hora de inicio ya pasó';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('Guard shift not covered: the start time has passed'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cubrir.asunto_ya_empezo' AND i18n->>'en' = 'Shift not covered: the start time has passed';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Turno de plantão sem cobertura: o horário de início já passou'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cubrir.asunto_ya_empezo' AND i18n->>'pt-BR' = 'Plantão sem cobertura: o horário de início já passou';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Asignado a {{asistente}} (rechazado).'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cubrir.rechazada_una_vez' AND i18n->>'es-AR' = 'Asignada a {{asistente}} (rechazada).';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Atribuído a {{asistente}} (recusado).'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cubrir.rechazada_una_vez' AND i18n->>'pt-BR' = 'Atribuída a {{asistente}} (recusada).';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Asignado de forma secuencial a {{rechazos}}. Todos lo rechazaron.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cubrir.rechazada_varias_veces' AND i18n->>'es-AR' = 'Asignada de forma secuencial a {{rechazos}}. Todos la rechazaron.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Atribuído de forma sequencial a {{rechazos}}. Todos o recusaram.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cubrir.rechazada_varias_veces' AND i18n->>'pt-BR' = 'Atribuída de forma sequencial a {{rechazos}}. Todos a recusaram.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Asignado a un Asistente. Pendiente de respuesta.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cubrir.sin_responder' AND i18n->>'es-AR' = 'Asignada a un Asistente. Pendiente de respuesta.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Atribuído a um Assistente. Pendente de resposta.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_sin_cubrir.sin_responder' AND i18n->>'pt-BR' = 'Atribuída a um Assistente. Pendente de resposta.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('El turno de guardia del {{fecha}}, de {{horaInicio}} a {{horaFin}}, terminó y el relevo todavía no llegó. Ante cualquier duda, puede comunicarse con su Coordinador.'::text)) WHERE prestadora_id IS NULL AND clave = 'incidente_relevo_cliente.cuerpo' AND i18n->>'es-AR' = 'La guardia del {{fecha}}, de {{horaInicio}} a {{horaFin}}, terminó y el relevo todavía no llegó. Ante cualquier duda, puede comunicarse con su Coordinador.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('The guard shift on {{fecha}}, from {{horaInicio}} to {{horaFin}}, has ended and the relief has not arrived yet. If you have any questions, you can contact your coordinator.'::text)) WHERE prestadora_id IS NULL AND clave = 'incidente_relevo_cliente.cuerpo' AND i18n->>'en' = 'The shift on {{fecha}}, from {{horaInicio}} to {{horaFin}}, has ended and the relief has not arrived yet. If you have any questions, you can contact your coordinator.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('O turno de plantão de {{fecha}}, das {{horaInicio}} às {{horaFin}}, terminou e a rendição ainda não chegou. Em caso de dúvida, pode entrar em contato com o seu Coordenador.'::text)) WHERE prestadora_id IS NULL AND clave = 'incidente_relevo_cliente.cuerpo' AND i18n->>'pt-BR' = 'O plantão de {{fecha}}, das {{horaInicio}} às {{horaFin}}, terminou e a rendição ainda não chegou. Em caso de dúvida, pode entrar em contato com o seu Coordenador.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Se salió a buscar quién cubra el turno de guardia'::text)) WHERE prestadora_id IS NULL AND clave = 'incidente_relevo_fase_automatica.asunto' AND i18n->>'es-AR' = 'Se salió a buscar quién cubra la guardia';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('The search for someone to cover the guard shift has started'::text)) WHERE prestadora_id IS NULL AND clave = 'incidente_relevo_fase_automatica.asunto' AND i18n->>'en' = 'The search for someone to cover the shift has started';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Saiu-se à procura de quem cubra o turno de plantão'::text)) WHERE prestadora_id IS NULL AND clave = 'incidente_relevo_fase_automatica.asunto' AND i18n->>'pt-BR' = 'Saiu-se à procura de quem cubra o plantão';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('El turno de guardia sigue sin nadie asignado.'::text)) WHERE prestadora_id IS NULL AND clave = 'incidente_relevo_fase_automatica.sigue_sin_nadie' AND i18n->>'es-AR' = 'La guardia sigue sin nadie asignado.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('The guard shift still has nobody assigned.'::text)) WHERE prestadora_id IS NULL AND clave = 'incidente_relevo_fase_automatica.sigue_sin_nadie' AND i18n->>'en' = 'The shift still has nobody assigned.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('O turno de plantão continua sem ninguém atribuído.'::text)) WHERE prestadora_id IS NULL AND clave = 'incidente_relevo_fase_automatica.sigue_sin_nadie' AND i18n->>'pt-BR' = 'O plantão continua sem ninguém atribuído.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('El turno de guardia terminó y el relevo todavía no llegó'::text)) WHERE prestadora_id IS NULL AND clave = 'incidente_relevo_sin_resolver.asunto' AND i18n->>'es-AR' = 'La guardia terminó y el relevo todavía no llegó';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('The guard shift ended and the relief has not arrived'::text)) WHERE prestadora_id IS NULL AND clave = 'incidente_relevo_sin_resolver.asunto' AND i18n->>'en' = 'The shift ended and the relief has not arrived';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('O turno de plantão terminou e a rendição ainda não chegou'::text)) WHERE prestadora_id IS NULL AND clave = 'incidente_relevo_sin_resolver.asunto' AND i18n->>'pt-BR' = 'O plantão terminou e a rendição ainda não chegou';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Turno de guardia sin nadie: queda poco para que empiece'::text)) WHERE prestadora_id IS NULL AND clave = 'incidente_turno_guardia_sin_cubrir.asunto' AND i18n->>'es-AR' = 'Guardia sin nadie: queda poco para que empiece';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('Guard shift with nobody: little time left before it starts'::text)) WHERE prestadora_id IS NULL AND clave = 'incidente_turno_guardia_sin_cubrir.asunto' AND i18n->>'en' = 'Shift with nobody: little time left before it starts';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Turno de plantão sem ninguém: falta pouco para começar'::text)) WHERE prestadora_id IS NULL AND clave = 'incidente_turno_guardia_sin_cubrir.asunto' AND i18n->>'pt-BR' = 'Plantão sem ninguém: falta pouco para começar';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Turno de guardia sin nadie: ya empezó y sigue abierto'::text)) WHERE prestadora_id IS NULL AND clave = 'incidente_turno_guardia_sin_cubrir.asunto_ya_empezo' AND i18n->>'es-AR' = 'Guardia sin nadie: ya empezó y sigue abierta';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('Guard shift with nobody: it already started and is still open'::text)) WHERE prestadora_id IS NULL AND clave = 'incidente_turno_guardia_sin_cubrir.asunto_ya_empezo' AND i18n->>'en' = 'Shift with nobody: it already started and is still open';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Turno de plantão sem ninguém: já começou e continua aberto'::text)) WHERE prestadora_id IS NULL AND clave = 'incidente_turno_guardia_sin_cubrir.asunto_ya_empezo' AND i18n->>'pt-BR' = 'Plantão sem ninguém: já começou e continua aberto';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Es el recordatorio número {{veces}} de este mismo turno de guardia.'::text)) WHERE prestadora_id IS NULL AND clave = 'incidente_turno_guardia_sin_cubrir.recordatorio_repetido' AND i18n->>'es-AR' = 'Es el recordatorio número {{veces}} de esta misma guardia.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('This is reminder number {{veces}} for this same guard shift.'::text)) WHERE prestadora_id IS NULL AND clave = 'incidente_turno_guardia_sin_cubrir.recordatorio_repetido' AND i18n->>'en' = 'This is reminder number {{veces}} for this same shift.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('É o lembrete número {{veces}} deste mesmo turno de plantão.'::text)) WHERE prestadora_id IS NULL AND clave = 'incidente_turno_guardia_sin_cubrir.recordatorio_repetido' AND i18n->>'pt-BR' = 'É o lembrete número {{veces}} deste mesmo plantão.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('The period of {{dias}} days expired and {{nombre}} did not accept the recording of their location during the guard shift.'::text)) WHERE prestadora_id IS NULL AND clave = 'plazo_ubicacion_sin_aceptar.texto' AND i18n->>'en' = 'The period of {{dias}} days expired and {{nombre}} did not accept the recording of their location during the shift.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('The period of {{dias}} day expired and {{nombre}} did not accept the recording of their location during the guard shift.'::text)) WHERE prestadora_id IS NULL AND clave = 'plazo_ubicacion_sin_aceptar.texto_uno' AND i18n->>'en' = 'The period of {{dias}} day expired and {{nombre}} did not accept the recording of their location during the shift.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('El turno de guardia del {{fecha}} empieza a las {{horaInicio}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'recordatorio_de_turno_guardia.cuerpo' AND i18n->>'es-AR' = 'La guardia del {{fecha}} empieza a las {{horaInicio}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('The guard shift on {{fecha}} starts at {{horaInicio}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'recordatorio_de_turno_guardia.cuerpo' AND i18n->>'en' = 'The shift on {{fecha}} starts at {{horaInicio}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('O turno de plantão do dia {{fecha}} começa às {{horaInicio}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'recordatorio_de_turno_guardia.cuerpo' AND i18n->>'pt-BR' = 'O plantão do dia {{fecha}} começa às {{horaInicio}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Recordatorio de turno de guardia'::text)) WHERE prestadora_id IS NULL AND clave = 'recordatorio_de_turno_guardia.titulo' AND i18n->>'es-AR' = 'Recordatorio de guardia';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('Guard shift reminder'::text)) WHERE prestadora_id IS NULL AND clave = 'recordatorio_de_turno_guardia.titulo' AND i18n->>'en' = 'Shift reminder';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Lembrete de turno de plantão'::text)) WHERE prestadora_id IS NULL AND clave = 'recordatorio_de_turno_guardia.titulo' AND i18n->>'pt-BR' = 'Lembrete de plantão';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Turno de guardia del {{fecha}} de {{horaInicio}} a {{horaFin}}. El Asistente pidió un relevo de emergencia y sigue en el domicilio.'::text)) WHERE prestadora_id IS NULL AND clave = 'relevo_de_emergencia.texto' AND i18n->>'es-AR' = 'Guardia del {{fecha}} de {{horaInicio}} a {{horaFin}}. El Asistente pidió un relevo de emergencia y sigue en el domicilio.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('Guard shift on {{fecha}} from {{horaInicio}} to {{horaFin}}. The care worker requested emergency relief and is still at the home.'::text)) WHERE prestadora_id IS NULL AND clave = 'relevo_de_emergencia.texto' AND i18n->>'en' = 'Shift on {{fecha}} from {{horaInicio}} to {{horaFin}}. The care worker requested emergency relief and is still at the home.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Turno de plantão de {{fecha}} das {{horaInicio}} às {{horaFin}}. O Assistente pediu uma rendição de emergência e continua no domicílio.'::text)) WHERE prestadora_id IS NULL AND clave = 'relevo_de_emergencia.texto' AND i18n->>'pt-BR' = 'Plantão de {{fecha}} das {{horaInicio}} às {{horaFin}}. O Assistente pediu uma rendição de emergência e continua no domicílio.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Ya está listo el reporte del turno de guardia de {{paciente}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'reporte_disponible.cuerpo' AND i18n->>'es-AR' = 'Ya está listo el reporte de la guardia de {{paciente}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('The guard shift report for {{paciente}} is ready.'::text)) WHERE prestadora_id IS NULL AND clave = 'reporte_disponible.cuerpo' AND i18n->>'en' = 'The shift report for {{paciente}} is ready.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('O relatório do turno de plantão de {{paciente}} está pronto.'::text)) WHERE prestadora_id IS NULL AND clave = 'reporte_disponible.cuerpo' AND i18n->>'pt-BR' = 'O relatório do plantão de {{paciente}} está pronto.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Tiene un turno de guardia fijo asignado: {{dias}}, de {{horaInicio}} a {{horaFin}}. Acepte o rechace la propuesta.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_fijo_para_responder.cuerpo' AND i18n->>'es-AR' = 'Tiene un turno fijo asignado: {{dias}}, de {{horaInicio}} a {{horaFin}}. Acepte o rechace la propuesta.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('You have a recurring guard shift assigned: {{dias}}, from {{horaInicio}} to {{horaFin}}. Accept or decline the offer.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_fijo_para_responder.cuerpo' AND i18n->>'en' = 'You have a recurring shift assigned: {{dias}}, from {{horaInicio}} to {{horaFin}}. Accept or decline the offer.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Você tem um turno de plantão fixo atribuído: {{dias}}, das {{horaInicio}} às {{horaFin}}. Aceite ou recuse a proposta.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_fijo_para_responder.cuerpo' AND i18n->>'pt-BR' = 'Você tem um plantão fixo atribuído: {{dias}}, das {{horaInicio}} às {{horaFin}}. Aceite ou recuse a proposta.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Turno de guardia fijo asignado'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_fijo_para_responder.titulo' AND i18n->>'es-AR' = 'Turno fijo asignado';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('Recurring guard shift assigned'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_fijo_para_responder.titulo' AND i18n->>'en' = 'Recurring shift assigned';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Turno de plantão fixo atribuído'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_fijo_para_responder.titulo' AND i18n->>'pt-BR' = 'Plantão fixo atribuído';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Ya no tiene asignado el turno de guardia fijo de los {{dias}}, de {{horaInicio}} a {{horaFin}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_fijo_retirado.cuerpo' AND i18n->>'es-AR' = 'Ya no tiene asignado el turno fijo de los {{dias}}, de {{horaInicio}} a {{horaFin}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('The recurring guard shift on {{dias}}, from {{horaInicio}} to {{horaFin}}, is no longer assigned to you.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_fijo_retirado.cuerpo' AND i18n->>'en' = 'The recurring shift on {{dias}}, from {{horaInicio}} to {{horaFin}}, is no longer assigned to you.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('O turno de plantão fixo de {{dias}}, das {{horaInicio}} às {{horaFin}}, não está mais atribuído a você.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_fijo_retirado.cuerpo' AND i18n->>'pt-BR' = 'O plantão fixo de {{dias}}, das {{horaInicio}} às {{horaFin}}, não está mais atribuído a você.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Turno de guardia fijo retirado'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_fijo_retirado.titulo' AND i18n->>'es-AR' = 'Turno fijo retirado';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('Recurring guard shift withdrawn'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_fijo_retirado.titulo' AND i18n->>'en' = 'Recurring shift withdrawn';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Turno de plantão fixo retirado'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_fijo_retirado.titulo' AND i18n->>'pt-BR' = 'Plantão fixo retirado';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Tiene un turno de guardia asignado para el {{fecha}}, de {{horaInicio}} a {{horaFin}}. Acepte o rechace la propuesta.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_para_responder.cuerpo' AND i18n->>'es-AR' = 'Tiene un turno asignado para el {{fecha}}, de {{horaInicio}} a {{horaFin}}. Acepte o rechace la propuesta.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('You have a guard shift assigned for {{fecha}}, from {{horaInicio}} to {{horaFin}}. Accept or decline the offer.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_para_responder.cuerpo' AND i18n->>'en' = 'You have a shift assigned for {{fecha}}, from {{horaInicio}} to {{horaFin}}. Accept or decline the offer.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Você tem um turno de plantão atribuído para o dia {{fecha}}, das {{horaInicio}} às {{horaFin}}. Aceite ou recuse a proposta.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_para_responder.cuerpo' AND i18n->>'pt-BR' = 'Você tem um plantão atribuído para o dia {{fecha}}, das {{horaInicio}} às {{horaFin}}. Aceite ou recuse a proposta.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Turno de guardia asignado'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_para_responder.titulo' AND i18n->>'es-AR' = 'Turno asignado';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('Guard shift assigned'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_para_responder.titulo' AND i18n->>'en' = 'Shift assigned';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Turno de plantão atribuído'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_para_responder.titulo' AND i18n->>'pt-BR' = 'Plantão atribuído';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Ya no tiene asignado el turno de guardia del {{fecha}}, de {{horaInicio}} a {{horaFin}}.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_retirado.cuerpo' AND i18n->>'es-AR' = 'Ya no tiene asignado el turno del {{fecha}}, de {{horaInicio}} a {{horaFin}}.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('The guard shift on {{fecha}}, from {{horaInicio}} to {{horaFin}}, is no longer assigned to you.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_retirado.cuerpo' AND i18n->>'en' = 'The shift on {{fecha}}, from {{horaInicio}} to {{horaFin}}, is no longer assigned to you.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('O turno de plantão do dia {{fecha}}, das {{horaInicio}} às {{horaFin}}, não está mais atribuído a você.'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_retirado.cuerpo' AND i18n->>'pt-BR' = 'O plantão do dia {{fecha}}, das {{horaInicio}} às {{horaFin}}, não está mais atribuído a você.';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{es-AR}', to_jsonb('Turno de guardia retirado'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_retirado.titulo' AND i18n->>'es-AR' = 'Turno retirado';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{en}', to_jsonb('Guard shift withdrawn'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_retirado.titulo' AND i18n->>'en' = 'Shift withdrawn';
UPDATE public.mensajes_del_sistema SET i18n = jsonb_set(i18n, '{pt-BR}', to_jsonb('Turno de plantão retirado'::text)) WHERE prestadora_id IS NULL AND clave = 'turno_guardia_retirado.titulo' AND i18n->>'pt-BR' = 'Plantão retirado';

-- Descripciones de las notificaciones que siguen iguales al texto de fábrica.
UPDATE public.configuracion_notificaciones SET descripcion = 'Un turno de guardia próximo sigue sin Asistente asignado' WHERE descripcion = 'Una guardia próxima sigue sin Asistente asignado';
UPDATE public.configuracion_notificaciones SET descripcion = 'Alerta temprana de posible ausencia en un turno de guardia' WHERE descripcion = 'Alerta temprana de posible ausencia en una guardia';
UPDATE public.configuracion_notificaciones SET descripcion = 'Avisos de rutina a la Asistente (turno de guardia asignado, mensaje del coordinador, recordatorio de turno de guardia próximo)' WHERE descripcion = 'Avisos de rutina a la Asistente (guardia asignada, mensaje del coordinador, recordatorio de guardia próxima)';

-- Claves dentro del contenido de los informes a la Obra Social.
CREATE FUNCTION pg_temp.renombrar_claves(j jsonb, m jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE jsonb_typeof(j)
    WHEN 'object' THEN (SELECT coalesce(jsonb_object_agg(coalesce(m->>e.k, e.k), pg_temp.renombrar_claves(e.v, m)), '{}'::jsonb) FROM jsonb_each(j) e(k, v))
    WHEN 'array' THEN (SELECT coalesce(jsonb_agg(pg_temp.renombrar_claves(a.v, m) ORDER BY a.n), '[]'::jsonb) FROM jsonb_array_elements(j) WITH ORDINALITY a(v, n))
    ELSE j END
$f$;
UPDATE public.informes_obra_social SET contenido = pg_temp.renombrar_claves(contenido, '{"alerta_temprana_guardia": "alerta_temprana_turno_guardia", "alertas_tempranas_guardia": "alertas_tempranas_turno_guardia", "asignaciones_de_turno": "asignaciones_de_turno_guardia", "asistente_en_otro_turno": "asistente_en_otro_turno_guardia", "cantidad_guardias": "cantidad_turnos_guardia", "desactivacion_con_turnos_por_delante": "desactivacion_con_turnos_guardia_por_delante", "el_servicio_tiene_guardias_asignadas": "el_servicio_tiene_turnos_guardia_asignados", "emergencia_guardia": "emergencia_turno_guardia", "emergencias_guardia": "emergencias_turno_guardia", "guardia": "turno_guardia", "guardia_empezada_no_cambia_de_asistente": "turno_guardia_empezado_no_cambia_de_asistente", "guardia_empezada_no_cambia_de_paciente": "turno_guardia_empezado_no_cambia_de_paciente", "guardia_id": "turno_guardia_id", "guardia_no_encontrada": "turno_guardia_no_encontrado", "guardia_no_se_asigna": "turno_guardia_no_se_asigna", "guardia_nueva_id": "turno_guardia_nuevo_id", "guardia_sin_asistente": "turno_guardia_sin_asistente", "guardia_sin_cerrar": "turno_guardia_sin_cerrar", "guardia_ya_cubierta": "turno_guardia_ya_cubierto", "guardias": "turnos_guardia", "incidente_turno_sin_cubrir": "incidente_turno_guardia_sin_cubrir", "incidentes_turno_sin_cubrir": "incidentes_turno_guardia_sin_cubrir", "persona_autorizada_guardias": "persona_autorizada_turnos_guardia", "precio_guardia_adicional": "precio_turno_guardia_adicional", "puntuacion_aceptacion_guardia": "puntuacion_aceptacion_turno_guardia", "reasignacion_sin_guardia": "reasignacion_sin_turno_guardia", "se_extendio_el_turno": "se_extendio_el_turno_guardia", "turno": "turno_guardia", "turno_sin_cubrir": "turno_guardia_sin_cubrir", "valor_guardia": "valor_turno_guardia"}'::jsonb) WHERE contenido::text ~* 'guardi|turno';
DROP FUNCTION pg_temp.renombrar_claves(jsonb, jsonb);

-- 3. Las mismas restricciones de verificación, con los valores nuevos.
ALTER TABLE public.alarmas_tomadas ADD CONSTRAINT alarmas_tomadas_tipo_conocido CHECK ((tipo = ANY (ARRAY['alerta_temprana_turno_guardia'::text, 'incidente_relevo'::text, 'turno_guardia_sin_cerrar'::text, 'incidente_turno_guardia_sin_cubrir'::text, 'emergencia_turno_guardia'::text])));
ALTER TABLE public.condiciones_comerciales_servicio ADD CONSTRAINT condiciones_comerciales_medicion_conocida CHECK (((medicion IS NULL) OR (medicion = ANY (ARRAY['pactado_mas_excedente'::text, 'hora'::text, 'dia_de_guardia'::text]))));
ALTER TABLE public.escalones_de_alarma_avisados ADD CONSTRAINT escalones_de_alarma_avisados_tipo_conocido CHECK ((tipo = ANY (ARRAY['alerta_temprana_turno_guardia'::text, 'incidente_relevo'::text, 'turno_guardia_sin_cerrar'::text, 'incidente_turno_guardia_sin_cubrir'::text, 'emergencia_turno_guardia'::text])));
ALTER TABLE public.excepciones_familiar_relevo ADD CONSTRAINT excepciones_familiar_relevo_origen_conocido CHECK ((origen = ANY (ARRAY['relevo'::text, 'turno_guardia_sin_cubrir'::text, 'extension'::text])));
ALTER TABLE public.facturas_cliente_items ADD CONSTRAINT facturas_cliente_items_unidad_conocida CHECK (((unidad IS NULL) OR (unidad = ANY (ARRAY['periodo'::text, 'turno_guardia'::text, 'hora'::text, 'hora_extra'::text, 'dia_de_guardia'::text]))));
ALTER TABLE public.liquidaciones_asistente ADD CONSTRAINT liquidaciones_asistente_base_unidad_check CHECK ((base_unidad = ANY (ARRAY['valor_hora'::text, 'valor_turno_guardia'::text, 'valor_semana'::text])));
ALTER TABLE public.remuneraciones_asistente ADD CONSTRAINT remuneraciones_asistente_unidad_conocida CHECK ((unidad_medicion = ANY (ARRAY['hora'::text, 'turno_guardia'::text, 'semana'::text, 'mes'::text])));

-- 4. Nombres. Primero las funciones (sus parámetros todavía nombran las tablas viejas), al final las tablas.
ALTER FUNCTION interno.anotar_desde_cuando_se_controla_en_el_turno() RENAME TO anotar_desde_cuando_se_controla_en_el_turno_guardia;
ALTER FUNCTION interno.coordinador_alcanza_guardia(p_asistente_id uuid) RENAME TO coordinador_alcanza_turno_guardia;
ALTER FUNCTION interno.dia_en_que_termina_guardia(p_fecha date, p_hora_inicio time without time zone, p_hora_fin time without time zone, p_dias_hasta_el_fin smallint) RENAME TO dia_en_que_termina_turno_guardia;
ALTER FUNCTION interno.el_asistente_marca_solo_su_guardia() RENAME TO el_asistente_marca_solo_su_turno_guardia;
ALTER FUNCTION interno.exigir_documentos_en_guardia() RENAME TO exigir_documentos_en_turno_guardia;
ALTER FUNCTION interno.guardia_empezada_no_cambia_de_asistente() RENAME TO turno_guardia_empezado_no_cambia_de_asistente;
ALTER FUNCTION interno.guardia_empezada_no_cambia_de_paciente() RENAME TO turno_guardia_empezado_no_cambia_de_paciente;
ALTER FUNCTION interno.guardia_empezada_no_pierde_pacientes() RENAME TO turno_guardia_empezado_no_pierde_pacientes;
ALTER FUNCTION interno.guardias_a_la_vista_por_una_alarma(p_solo_las_tomadas boolean) RENAME TO turnos_guardia_a_la_vista_por_una_alarma;
ALTER FUNCTION interno.guardias_asignadas_del_servicio(p_servicio uuid) RENAME TO turnos_guardia_asignados_del_servicio;
ALTER FUNCTION interno.guardias_de_las_alarmas(p_tipo text, p_referencias uuid[]) RENAME TO turnos_guardia_de_las_alarmas;
ALTER FUNCTION interno.guardias_del_paciente(p_paciente_id uuid) RENAME TO turnos_guardia_del_paciente;
ALTER FUNCTION interno.sin_coordinador_no_hay_guardias() RENAME TO sin_coordinador_no_hay_turnos_guardia;
ALTER FUNCTION interno.sin_firma_del_pagador_no_hay_guardias() RENAME TO sin_firma_del_pagador_no_hay_turnos_guardia;
ALTER FUNCTION interno.turnos_que_traban_la_desactivacion(p_usuario uuid, p_prestadora uuid) RENAME TO turnos_guardia_que_traban_la_desactivacion;
ALTER FUNCTION interno.validar_paciente_de_guardia_del_contratante() RENAME TO validar_paciente_de_turno_guardia_del_contratante;
ALTER FUNCTION public.exigir_paciente_del_turno() RENAME TO exigir_paciente_del_turno_guardia;
ALTER FUNCTION public.fn_modalidad_de_la_guardia() RENAME TO fn_modalidad_del_turno_guardia;
ALTER FUNCTION public.sincronizar_paciente_principal_de_guardia() RENAME TO sincronizar_paciente_principal_de_turno_guardia;
ALTER FUNCTION public.turnos_que_traban_la_desactivacion(p_usuario uuid) RENAME TO turnos_guardia_que_traban_la_desactivacion;
ALTER TRIGGER guardia_empezada_no_pierde_pacientes ON public.guardia_pacientes RENAME TO turno_guardia_empezado_no_pierde_pacientes;
ALTER TRIGGER validar_contratante_guardia_pacientes ON public.guardia_pacientes RENAME TO validar_contratante_turno_guardia_pacientes;
ALTER TRIGGER asistente_marca_solo_su_guardia ON public.guardias RENAME TO asistente_marca_solo_su_turno_guardia;
ALTER TRIGGER guardia_empezada_no_cambia_de_asistente ON public.guardias RENAME TO turno_guardia_empezado_no_cambia_de_asistente;
ALTER TRIGGER guardia_empezada_no_cambia_de_paciente ON public.guardias RENAME TO turno_guardia_empezado_no_cambia_de_paciente;
ALTER TRIGGER sin_coordinador_no_hay_guardias ON public.guardias RENAME TO sin_coordinador_no_hay_turnos_guardia;
ALTER TRIGGER sin_firma_del_pagador_no_hay_guardias ON public.guardias RENAME TO sin_firma_del_pagador_no_hay_turnos_guardia;
ALTER TRIGGER trg_exigir_documentos_en_guardia ON public.guardias RENAME TO trg_exigir_documentos_en_turno_guardia;
ALTER TRIGGER trg_modalidad_en_guardia ON public.guardias RENAME TO trg_modalidad_en_turno_guardia;
ALTER TRIGGER validar_servicio_guardias ON public.guardias RENAME TO validar_servicio_turnos_guardia;
ALTER TRIGGER validar_motivo_guardias_cobertura ON public.guardias_cobertura RENAME TO validar_motivo_turnos_guardia_cobertura;
ALTER TRIGGER validar_final_incidente_turno_sin_cubrir ON public.incidentes_turno_sin_cubrir RENAME TO validar_final_incidente_turno_guardia_sin_cubrir;
ALTER TRIGGER anotar_desde_cuando_se_controla_en_el_turno ON public.prestadoras RENAME TO anotar_desde_cuando_se_controla_en_el_turno_guardia;
ALTER TRIGGER trg_reporte_paciente_del_turno ON public.reportes RENAME TO trg_reporte_paciente_del_turno_guardia;
ALTER TRIGGER sin_coordinador_no_hay_guardias ON public.series_guardias RENAME TO sin_coordinador_no_hay_turnos_guardia;
ALTER TRIGGER sin_firma_del_pagador_no_hay_guardias ON public.series_guardias RENAME TO sin_firma_del_pagador_no_hay_turnos_guardia;
ALTER TRIGGER validar_servicio_series_guardias ON public.series_guardias RENAME TO validar_servicio_series_turnos_guardia;
ALTER TRIGGER validar_cliente_series_guardias_pacientes ON public.series_guardias_pacientes RENAME TO validar_cliente_series_turnos_guardia_pacientes;
ALTER POLICY asistente_avisa_demora_en_su_guardia ON public.alertas_tempranas_guardia RENAME TO asistente_avisa_demora_en_su_turno_guardia;
ALTER POLICY coordinador_gestiona_alertas_tempranas_guardia_de_sus_servicios ON public.alertas_tempranas_guardia RENAME TO coordinador_gestiona_alertas_turno_guardia_de_sus_servicios;
ALTER POLICY panel_gestiona_alertas_tempranas_guardia ON public.alertas_tempranas_guardia RENAME TO panel_gestiona_alertas_tempranas_turno_guardia;
ALTER POLICY admin_gestiona_configuracion_aviso_guardia_sin_cubrir ON public.configuracion_aviso_guardia_sin_cubrir RENAME TO admin_gestiona_configuracion_aviso_turno_guardia_sin_cubrir;
ALTER POLICY coordinador_lee_configuracion_aviso_guardia_sin_cubrir ON public.configuracion_aviso_guardia_sin_cubrir RENAME TO coordinador_lee_configuracion_aviso_turno_guardia_sin_cubrir;
ALTER POLICY configuracion_incidentes_turno_sin_cubrir_la_escribe_la_adminis ON public.configuracion_incidentes_turno_sin_cubrir RENAME TO config_incidentes_turno_guardia_sin_cubrir_la_escribe_la_admin;
ALTER POLICY configuracion_incidentes_turno_sin_cubrir_la_lee_su_prestadora ON public.configuracion_incidentes_turno_sin_cubrir RENAME TO config_incidentes_turno_guardia_sin_cubrir_la_lee_su_prestadora;
ALTER POLICY asistente_empieza_descanso_en_su_guardia ON public.descansos_guardia RENAME TO asistente_empieza_descanso_en_su_turno_guardia;
ALTER POLICY asistente_ve_descansos_de_su_guardia ON public.descansos_guardia RENAME TO asistente_ve_descansos_de_su_turno_guardia;
ALTER POLICY panel_lee_descansos_guardia ON public.descansos_guardia RENAME TO panel_lee_descansos_turno_guardia;
ALTER POLICY asistente_avisa_emergencia_en_su_guardia ON public.emergencias_guardia RENAME TO asistente_avisa_emergencia_en_su_turno_guardia;
ALTER POLICY asistente_ve_emergencias_de_su_guardia ON public.emergencias_guardia RENAME TO asistente_ve_emergencias_de_su_turno_guardia;
ALTER POLICY panel_lee_emergencias_guardia ON public.emergencias_guardia RENAME TO panel_lee_emergencias_turno_guardia;
ALTER POLICY asistente_ve_la_extension_de_su_turno ON public.extensiones_de_turno RENAME TO asistente_ve_la_extension_de_su_turno_guardia;
ALTER POLICY coordinador_lee_extensiones_de_turno ON public.extensiones_de_turno RENAME TO coordinador_lee_extensiones_de_turno_guardia;
ALTER POLICY panel_lee_extensiones_de_turno ON public.extensiones_de_turno RENAME TO panel_lee_extensiones_de_turno_guardia;
ALTER POLICY admin_prestadora_gestiona_finales_turno_sin_cubrir ON public.finales_turno_sin_cubrir RENAME TO admin_prestadora_gestiona_finales_turno_guardia_sin_cubrir;
ALTER POLICY coordinador_lee_finales_turno_sin_cubrir ON public.finales_turno_sin_cubrir RENAME TO coordinador_lee_finales_turno_guardia_sin_cubrir;
ALTER POLICY se_ven_los_pacientes_de_una_guardia_visible ON public.guardia_pacientes RENAME TO se_ven_los_pacientes_de_un_turno_guardia_visible;
ALTER POLICY asistente_actualiza_su_guardia ON public.guardias RENAME TO asistente_actualiza_su_turno_guardia;
ALTER POLICY asistente_ve_sus_guardias ON public.guardias RENAME TO asistente_ve_sus_turnos_guardia;
ALTER POLICY coordinador_cierra_servicio_guardias ON public.guardias RENAME TO coordinador_cierra_servicio_turnos_guardia;
ALTER POLICY coordinador_gestiona_guardias_de_sus_servicios ON public.guardias RENAME TO coordinador_gestiona_turnos_guardia_de_sus_servicios;
ALTER POLICY coordinador_resuelve_la_guardia_de_una_alarma_que_tomo ON public.guardias RENAME TO coordinador_resuelve_el_turno_guardia_de_una_alarma_que_tomo;
ALTER POLICY coordinador_ve_la_guardia_de_una_alarma_que_llego_a_todos ON public.guardias RENAME TO coordinador_ve_el_turno_guardia_de_una_alarma_que_llego_a_todos;
ALTER POLICY panel_gestiona_guardias ON public.guardias RENAME TO panel_gestiona_turnos_guardia;
ALTER POLICY admin_gestiona_guardias_cobertura ON public.guardias_cobertura RENAME TO admin_gestiona_turnos_guardia_cobertura;
ALTER POLICY coordinador_gestiona_guardias_cobertura_de_su_zona ON public.guardias_cobertura RENAME TO coordinador_gestiona_turnos_guardia_cobertura_de_su_zona;
ALTER POLICY coordinador_gestiona_guardias_tracking_gps_de_sus_servicios ON public.guardias_tracking_gps RENAME TO coordinador_gestiona_turnos_guardia_gps_de_sus_servicios;
ALTER POLICY panel_gestiona_guardias_tracking_gps ON public.guardias_tracking_gps RENAME TO panel_gestiona_turnos_guardia_tracking_gps;
ALTER POLICY coordinador_gestiona_incidentes_turno_sin_cubrir ON public.incidentes_turno_sin_cubrir RENAME TO coordinador_gestiona_incidentes_turno_guardia_sin_cubrir;
ALTER POLICY panel_gestiona_incidentes_turno_sin_cubrir ON public.incidentes_turno_sin_cubrir RENAME TO panel_gestiona_incidentes_turno_guardia_sin_cubrir;
ALTER POLICY asistente_lee_pacientes_de_sus_guardias ON public.pacientes RENAME TO asistente_lee_pacientes_de_sus_turnos_guardia;
ALTER POLICY asistente_carga_reportes_de_su_guardia ON public.reportes RENAME TO asistente_carga_reportes_de_su_turno_guardia;
ALTER POLICY asistente_lee_reportes_de_su_guardia ON public.reportes RENAME TO asistente_lee_reportes_de_su_turno_guardia;
ALTER POLICY coordinador_cierra_servicio_series_guardias ON public.series_guardias RENAME TO coordinador_cierra_servicio_series_turnos_guardia;
ALTER POLICY coordinador_gestiona_series_guardias_de_sus_servicios ON public.series_guardias RENAME TO coordinador_gestiona_series_turnos_guardia_de_sus_servicios;
ALTER POLICY panel_gestiona_series_guardias ON public.series_guardias RENAME TO panel_gestiona_series_turnos_guardia;
DROP POLICY reportes_asistente_lee_fotos_de_sus_guardias ON storage.objects;
DROP POLICY reportes_asistente_sube_foto_de_su_guardia ON storage.objects;
ALTER INDEX public.idx_alertas_tempranas_guardia_guardia RENAME TO idx_alertas_tempranas_turno_guardia_turno_guardia;
ALTER INDEX public.idx_alertas_tempranas_guardia_prestadora_id RENAME TO idx_alertas_tempranas_turno_guardia_prestadora_id;
ALTER INDEX public.asignaciones_de_turno_una_sin_responder_por_ausencia RENAME TO asignaciones_de_turno_guardia_una_sin_responder_por_ausencia;
ALTER INDEX public.asignaciones_de_turno_una_sin_responder_por_serie RENAME TO asignaciones_de_turno_guardia_una_sin_responder_por_serie;
ALTER INDEX public.asignaciones_de_turno_una_sin_responder_por_turno RENAME TO asignaciones_de_turno_guardia_una_sin_responder_por_cada_uno;
ALTER INDEX public.idx_asignaciones_de_turno_por_asistente RENAME TO idx_asignaciones_de_turno_guardia_por_asistente;
ALTER INDEX public.auditoria_reasignaciones_por_emergencia_guardia_idx RENAME TO auditoria_reasignaciones_por_emergencia_turno_guardia_idx;
ALTER INDEX public.coberturas_de_ausencia_una_por_turno RENAME TO coberturas_de_ausencia_una_por_turno_guardia;
ALTER INDEX public.consentimientos_paciente_solo_por_turno RENAME TO consentimientos_paciente_solo_por_turno_guardia;
ALTER INDEX public.idx_descansos_guardia_cierre_sin_repetir RENAME TO idx_descansos_turno_guardia_cierre_sin_repetir;
ALTER INDEX public.idx_descansos_guardia_por_guardia RENAME TO idx_descansos_turno_guardia_por_turno_guardia;
ALTER INDEX public.idx_descansos_guardia_prestadora_id RENAME TO idx_descansos_turno_guardia_prestadora_id;
ALTER INDEX public.idx_descansos_guardia_sin_repetir RENAME TO idx_descansos_turno_guardia_sin_repetir;
ALTER INDEX public.idx_descansos_guardia_uno_abierto_por_guardia RENAME TO idx_descansos_turno_guardia_uno_abierto_por_turno_guardia;
ALTER INDEX public.idx_emergencias_guardia_por_guardia RENAME TO idx_emergencias_turno_guardia_por_turno_guardia;
ALTER INDEX public.idx_emergencias_guardia_sin_atender RENAME TO idx_emergencias_turno_guardia_sin_atender;
ALTER INDEX public.idx_emergencias_guardia_sin_repetir RENAME TO idx_emergencias_turno_guardia_sin_repetir;
ALTER INDEX public.excepciones_familiar_relevo_por_turno RENAME TO excepciones_familiar_relevo_por_turno_guardia;
ALTER INDEX public.excepciones_por_documentos_guardia_idx RENAME TO excepciones_por_documentos_turno_guardia_idx;
ALTER INDEX public.extensiones_de_turno_abiertas RENAME TO extensiones_de_turno_guardia_abiertas;
ALTER INDEX public.extensiones_de_turno_una_abierta_por_guardia RENAME TO extensiones_de_turno_guardia_una_abierta_por_turno_guardia;
ALTER INDEX public.finales_turno_sin_cubrir_activos RENAME TO finales_turno_guardia_sin_cubrir_activos;
ALTER INDEX public.finales_turno_sin_cubrir_clave_unica RENAME TO finales_turno_guardia_sin_cubrir_clave_unica;
ALTER INDEX public.finales_turno_sin_cubrir_nombre_unico RENAME TO finales_turno_guardia_sin_cubrir_nombre_unico;
ALTER INDEX public.idx_guardia_comprobaciones_guardia RENAME TO idx_turno_guardia_comprobaciones_turno_guardia;
ALTER INDEX public.idx_guardia_comprobaciones_pendientes RENAME TO idx_turno_guardia_comprobaciones_pendientes;
ALTER INDEX public.idx_guardia_pacientes_paciente RENAME TO idx_turno_guardia_pacientes_paciente;
ALTER INDEX public.idx_guardia_pacientes_prestadora_id RENAME TO idx_turno_guardia_pacientes_prestadora_id;
ALTER INDEX public.guardias_en_curso_por_fecha RENAME TO turnos_guardia_en_curso_por_fecha;
ALTER INDEX public.guardias_servicio_id_idx RENAME TO turnos_guardia_servicio_id_idx;
ALTER INDEX public.idx_guardias_asistente RENAME TO idx_turnos_guardia_asistente;
ALTER INDEX public.idx_guardias_canal_modalidad RENAME TO idx_turnos_guardia_canal_modalidad;
ALTER INDEX public.idx_guardias_fecha RENAME TO idx_turnos_guardia_fecha;
ALTER INDEX public.idx_guardias_paciente RENAME TO idx_turnos_guardia_paciente;
ALTER INDEX public.idx_guardias_serie RENAME TO idx_turnos_guardia_serie;
ALTER INDEX public.idx_guardias_sin_cerrar RENAME TO idx_turnos_guardia_sin_cerrar;
ALTER INDEX public.idx_guardias_sin_cubrir RENAME TO idx_turnos_guardia_sin_cubrir;
ALTER INDEX public.guardias_cobertura_de_ausencia_idx RENAME TO turnos_guardia_cobertura_de_ausencia_idx;
ALTER INDEX public.idx_guardias_cobertura_prestadora_id RENAME TO idx_turnos_guardia_cobertura_prestadora_id;
ALTER INDEX public.idx_guardias_tracking_gps_guardia RENAME TO idx_turnos_guardia_tracking_gps_turno_guardia;
ALTER INDEX public.idx_guardias_tracking_gps_prestadora_id RENAME TO idx_turnos_guardia_tracking_gps_prestadora_id;
ALTER INDEX public.incidentes_turno_sin_cubrir_abiertos RENAME TO incidentes_turno_guardia_sin_cubrir_abiertos;
ALTER INDEX public.incidentes_turno_sin_cubrir_uno_abierto_por_turno RENAME TO incidentes_turno_guardia_sin_cubrir_uno_abierto_por_cada_uno;
ALTER INDEX public.motivos_sustitucion_guardia_activos RENAME TO motivos_sustitucion_turno_guardia_activos;
ALTER INDEX public.motivos_sustitucion_guardia_clave_unica RENAME TO motivos_sustitucion_turno_guardia_clave_unica;
ALTER INDEX public.motivos_sustitucion_guardia_nombre_unico RENAME TO motivos_sustitucion_turno_guardia_nombre_unico;
ALTER INDEX public.idx_reportes_guardia RENAME TO idx_reportes_turno_guardia;
ALTER INDEX public.reportes_uno_por_paciente_y_guardia RENAME TO reportes_uno_por_paciente_y_turno_guardia;
ALTER INDEX public.idx_series_guardias_asistente RENAME TO idx_series_turnos_guardia_asistente;
ALTER INDEX public.idx_series_guardias_paciente RENAME TO idx_series_turnos_guardia_paciente;
ALTER INDEX public.idx_series_guardias_prestadora_id RENAME TO idx_series_turnos_guardia_prestadora_id;
ALTER INDEX public.series_guardias_servicio_id_idx RENAME TO series_turnos_guardia_servicio_id_idx;
ALTER INDEX public.idx_series_guardias_pacientes_paciente RENAME TO idx_series_turnos_guardia_pacientes_paciente;
ALTER INDEX public.idx_series_guardias_pacientes_prestadora_id RENAME TO idx_series_turnos_guardia_pacientes_prestadora_id;
ALTER TABLE public.alertas_tempranas_guardia RENAME CONSTRAINT alertas_tempranas_guardia_guardia_tenant_fk TO alertas_tempranas_turno_guardia_turno_guardia_tenant_fk;
ALTER TABLE public.alertas_tempranas_guardia RENAME CONSTRAINT alertas_tempranas_guardia_pkey TO alertas_tempranas_turno_guardia_pkey;
ALTER TABLE public.alertas_tempranas_guardia RENAME CONSTRAINT alertas_tempranas_guardia_prestadora_id_fkey TO alertas_tempranas_turno_guardia_prestadora_id_fkey;
ALTER TABLE public.alertas_tempranas_guardia RENAME CONSTRAINT alertas_tempranas_guardia_reportado_por_fkey TO alertas_tempranas_turno_guardia_reportado_por_fkey;
ALTER TABLE public.asignaciones_de_turno RENAME CONSTRAINT asignaciones_de_turno_apunta_a_una_sola_cosa TO asignaciones_de_turno_guardia_apunta_a_una_sola_cosa;
ALTER TABLE public.asignaciones_de_turno RENAME CONSTRAINT asignaciones_de_turno_asignado_por_fkey TO asignaciones_de_turno_guardia_asignado_por_fkey;
ALTER TABLE public.asignaciones_de_turno RENAME CONSTRAINT asignaciones_de_turno_asistente_anterior_id_fkey TO asignaciones_de_turno_guardia_asistente_anterior_id_fkey;
ALTER TABLE public.asignaciones_de_turno RENAME CONSTRAINT asignaciones_de_turno_asistente_id_fkey TO asignaciones_de_turno_guardia_asistente_id_fkey;
ALTER TABLE public.asignaciones_de_turno RENAME CONSTRAINT asignaciones_de_turno_ausencia_id_fkey TO asignaciones_de_turno_guardia_ausencia_id_fkey;
ALTER TABLE public.asignaciones_de_turno RENAME CONSTRAINT asignaciones_de_turno_estado_check TO asignaciones_de_turno_guardia_estado_check;
ALTER TABLE public.asignaciones_de_turno RENAME CONSTRAINT asignaciones_de_turno_pkey TO asignaciones_de_turno_guardia_pkey;
ALTER TABLE public.asignaciones_de_turno RENAME CONSTRAINT asignaciones_de_turno_prestadora_id_fkey TO asignaciones_de_turno_guardia_prestadora_id_fkey;
ALTER TABLE public.asignaciones_de_turno RENAME CONSTRAINT asignaciones_de_turno_respondida_check TO asignaciones_de_turno_guardia_respondida_check;
ALTER TABLE public.asignaciones_de_turno RENAME CONSTRAINT asignaciones_de_turno_retirada_check TO asignaciones_de_turno_guardia_retirada_check;
ALTER TABLE public.asignaciones_de_turno RENAME CONSTRAINT asignaciones_de_turno_retirada_por_fkey TO asignaciones_de_turno_guardia_retirada_por_fkey;
ALTER TABLE public.asignaciones_de_turno RENAME CONSTRAINT asignaciones_de_turno_serie_id_fkey TO asignaciones_de_turno_guardia_serie_id_fkey;
ALTER TABLE public.auditoria_asignaciones_con_aviso RENAME CONSTRAINT auditoria_asignaciones_con_aviso_guardia_tenant_fk TO auditoria_asignaciones_con_aviso_turno_guardia_tenant_fk;
ALTER TABLE public.calificaciones_asistente RENAME CONSTRAINT calificaciones_asistente_guardia_id_fkey TO calificaciones_asistente_turno_guardia_id_fkey;
ALTER TABLE public.configuracion_aviso_guardia_sin_cubrir RENAME CONSTRAINT configuracion_aviso_guardia_sin_cubrir_horas_antes_check TO configuracion_aviso_turno_guardia_sin_cubrir_horas_antes_check;
ALTER TABLE public.configuracion_aviso_guardia_sin_cubrir RENAME CONSTRAINT configuracion_aviso_guardia_sin_cubrir_horas_entre_avisos_check TO config_aviso_turno_guardia_sin_cubrir_horas_entre_avisos_check;
ALTER TABLE public.configuracion_aviso_guardia_sin_cubrir RENAME CONSTRAINT configuracion_aviso_guardia_sin_cubrir_pkey TO configuracion_aviso_turno_guardia_sin_cubrir_pkey;
ALTER TABLE public.configuracion_aviso_guardia_sin_cubrir RENAME CONSTRAINT configuracion_aviso_guardia_sin_cubrir_prestadora_id_fkey TO configuracion_aviso_turno_guardia_sin_cubrir_prestadora_id_fkey;
ALTER TABLE public.configuracion_escalada_coordinador RENAME CONSTRAINT minutos_gracia_cierre_guardia_razonable TO minutos_gracia_cierre_turno_guardia_razonable;
ALTER TABLE public.configuracion_incidentes_turno_sin_cubrir RENAME CONSTRAINT configuracion_incidentes_turno_sin_cubrir_pkey TO configuracion_incidentes_turno_guardia_sin_cubrir_pkey;
ALTER TABLE public.configuracion_incidentes_turno_sin_cubrir RENAME CONSTRAINT configuracion_incidentes_turno_sin_cubrir_prestadora_id_fkey TO config_incidentes_turno_guardia_sin_cubrir_prestadora_id_fkey;
ALTER TABLE public.configuracion_incidentes_turno_sin_cubrir RENAME CONSTRAINT configuracion_incidentes_turno_sin_cubrir_regla_es_objeto TO config_incidentes_turno_guardia_sin_cubrir_regla_es_objeto;
ALTER TABLE public.consentimientos_paciente_solo RENAME CONSTRAINT consentimientos_paciente_solo_guardia_tenant_fk TO consentimientos_paciente_solo_turno_guardia_tenant_fk;
ALTER TABLE public.descansos_guardia RENAME CONSTRAINT descansos_guardia_fin_despues_del_inicio TO descansos_turno_guardia_fin_despues_del_inicio;
ALTER TABLE public.descansos_guardia RENAME CONSTRAINT descansos_guardia_guardia_fkey TO descansos_turno_guardia_turno_guardia_fkey;
ALTER TABLE public.descansos_guardia RENAME CONSTRAINT descansos_guardia_pkey TO descansos_turno_guardia_pkey;
ALTER TABLE public.descansos_guardia RENAME CONSTRAINT descansos_guardia_prestadora_id_fkey TO descansos_turno_guardia_prestadora_id_fkey;
ALTER TABLE public.emergencias_guardia RENAME CONSTRAINT emergencias_guardia_detalle_check TO emergencias_turno_guardia_detalle_check;
ALTER TABLE public.emergencias_guardia RENAME CONSTRAINT emergencias_guardia_detalle_salvo_en_el_relevo TO emergencias_turno_guardia_detalle_salvo_en_el_relevo;
ALTER TABLE public.emergencias_guardia RENAME CONSTRAINT emergencias_guardia_guardia_fkey TO emergencias_turno_guardia_turno_guardia_fkey;
ALTER TABLE public.emergencias_guardia RENAME CONSTRAINT emergencias_guardia_pkey TO emergencias_turno_guardia_pkey;
ALTER TABLE public.emergencias_guardia RENAME CONSTRAINT emergencias_guardia_prestadora_id_fkey TO emergencias_turno_guardia_prestadora_id_fkey;
ALTER TABLE public.excepciones_familiar_relevo RENAME CONSTRAINT excepciones_familiar_relevo_guardia_tenant_fk TO excepciones_familiar_relevo_turno_guardia_tenant_fk;
ALTER TABLE public.excepciones_por_documentos RENAME CONSTRAINT excepciones_por_documentos_guardia_id_fkey TO excepciones_por_documentos_turno_guardia_id_fkey;
ALTER TABLE public.extensiones_de_turno RENAME CONSTRAINT extensiones_de_turno_pkey TO extensiones_de_turno_guardia_pkey;
ALTER TABLE public.extensiones_de_turno RENAME CONSTRAINT extensiones_de_turno_prestadora_id_fkey TO extensiones_de_turno_guardia_prestadora_id_fkey;
ALTER TABLE public.extensiones_de_turno RENAME CONSTRAINT extensiones_de_turno_relevo_fkey TO extensiones_de_turno_guardia_relevo_fkey;
ALTER TABLE public.extensiones_de_turno RENAME CONSTRAINT extensiones_de_turno_termina_despues TO extensiones_de_turno_guardia_termina_despues;
ALTER TABLE public.finales_turno_sin_cubrir RENAME CONSTRAINT finales_turno_sin_cubrir_los_del_sistema_no_se_apagan TO finales_turno_guardia_sin_cubrir_los_del_sistema_no_se_apagan;
ALTER TABLE public.finales_turno_sin_cubrir RENAME CONSTRAINT finales_turno_sin_cubrir_los_del_sistema_son_del_producto TO finales_turno_guardia_sin_cubrir_del_sistema_son_del_producto;
ALTER TABLE public.finales_turno_sin_cubrir RENAME CONSTRAINT finales_turno_sin_cubrir_nombre_segun_nivel TO finales_turno_guardia_sin_cubrir_nombre_segun_nivel;
ALTER TABLE public.finales_turno_sin_cubrir RENAME CONSTRAINT finales_turno_sin_cubrir_pkey TO finales_turno_guardia_sin_cubrir_pkey;
ALTER TABLE public.finales_turno_sin_cubrir RENAME CONSTRAINT finales_turno_sin_cubrir_prestadora_id_fkey TO finales_turno_guardia_sin_cubrir_prestadora_id_fkey;
ALTER TABLE public.guardia_comprobaciones RENAME CONSTRAINT guardia_comprobaciones_asistente_tenant_fk TO turno_guardia_comprobaciones_asistente_tenant_fk;
ALTER TABLE public.guardia_comprobaciones RENAME CONSTRAINT guardia_comprobaciones_autorizacion_check TO turno_guardia_comprobaciones_autorizacion_check;
ALTER TABLE public.guardia_comprobaciones RENAME CONSTRAINT guardia_comprobaciones_autorizada_por_fkey TO turno_guardia_comprobaciones_autorizada_por_fkey;
ALTER TABLE public.guardia_comprobaciones RENAME CONSTRAINT guardia_comprobaciones_coherencia_check TO turno_guardia_comprobaciones_coherencia_check;
ALTER TABLE public.guardia_comprobaciones RENAME CONSTRAINT guardia_comprobaciones_estado_check TO turno_guardia_comprobaciones_estado_check;
ALTER TABLE public.guardia_comprobaciones RENAME CONSTRAINT guardia_comprobaciones_guardia_tenant_fk TO turno_guardia_comprobaciones_turno_guardia_tenant_fk;
ALTER TABLE public.guardia_comprobaciones RENAME CONSTRAINT guardia_comprobaciones_medio_check TO turno_guardia_comprobaciones_medio_check;
ALTER TABLE public.guardia_comprobaciones RENAME CONSTRAINT guardia_comprobaciones_momento_check TO turno_guardia_comprobaciones_momento_check;
ALTER TABLE public.guardia_comprobaciones RENAME CONSTRAINT guardia_comprobaciones_momento_unico_por_guardia TO turno_guardia_comprobaciones_momento_unico_por_turno_guardia;
ALTER TABLE public.guardia_comprobaciones RENAME CONSTRAINT guardia_comprobaciones_motivo_check TO turno_guardia_comprobaciones_motivo_check;
ALTER TABLE public.guardia_comprobaciones RENAME CONSTRAINT guardia_comprobaciones_motivo_del_pedido_check TO turno_guardia_comprobaciones_motivo_del_pedido_check;
ALTER TABLE public.guardia_comprobaciones RENAME CONSTRAINT guardia_comprobaciones_pkey TO turno_guardia_comprobaciones_pkey;
ALTER TABLE public.guardia_comprobaciones RENAME CONSTRAINT guardia_comprobaciones_prestadora_id_fkey TO turno_guardia_comprobaciones_prestadora_id_fkey;
ALTER TABLE public.guardia_comprobaciones RENAME CONSTRAINT guardia_comprobaciones_sujeto_coherencia_check TO turno_guardia_comprobaciones_sujeto_coherencia_check;
ALTER TABLE public.guardia_comprobaciones RENAME CONSTRAINT guardia_comprobaciones_sujeto_tipo_check TO turno_guardia_comprobaciones_sujeto_tipo_check;
ALTER TABLE public.guardia_pacientes RENAME CONSTRAINT guardia_pacientes_guardia_tenant_fk TO turno_guardia_pacientes_turno_guardia_tenant_fk;
ALTER TABLE public.guardia_pacientes RENAME CONSTRAINT guardia_pacientes_paciente_tenant_fk TO turno_guardia_pacientes_paciente_tenant_fk;
ALTER TABLE public.guardia_pacientes RENAME CONSTRAINT guardia_pacientes_pkey TO turno_guardia_pacientes_pkey;
ALTER TABLE public.guardia_pacientes RENAME CONSTRAINT guardia_pacientes_prestadora_id_fkey TO turno_guardia_pacientes_prestadora_id_fkey;
ALTER TABLE public.guardias RENAME CONSTRAINT guardias_asistente_tenant_fk TO turnos_guardia_asistente_tenant_fk;
ALTER TABLE public.guardias RENAME CONSTRAINT guardias_canal_modalidad_check TO turnos_guardia_canal_modalidad_check;
ALTER TABLE public.guardias RENAME CONSTRAINT guardias_cancelacion_alcance_check TO turnos_guardia_cancelacion_alcance_check;
ALTER TABLE public.guardias RENAME CONSTRAINT guardias_cancelacion_check TO turnos_guardia_cancelacion_check;
ALTER TABLE public.guardias RENAME CONSTRAINT guardias_cancelacion_origen_check TO turnos_guardia_cancelacion_origen_check;
ALTER TABLE public.guardias RENAME CONSTRAINT guardias_cerrada_origen_check TO turnos_guardia_cerrado_origen_check;
ALTER TABLE public.guardias RENAME CONSTRAINT guardias_cerrada_por_fkey TO turnos_guardia_cerrado_por_fkey;
ALTER TABLE public.guardias RENAME CONSTRAINT guardias_checkout_bloqueado_requiere_excepcion TO turnos_guardia_checkout_bloqueado_requiere_excepcion;
ALTER TABLE public.guardias RENAME CONSTRAINT guardias_checkout_excepcion_autorizado_por_fkey TO turnos_guardia_checkout_excepcion_autorizado_por_fkey;
ALTER TABLE public.guardias RENAME CONSTRAINT guardias_cierre_por_el_asistente_sin_motivo TO turnos_guardia_cierre_por_el_asistente_sin_motivo;
ALTER TABLE public.guardias RENAME CONSTRAINT guardias_cierre_por_el_panel_exige_persona_y_motivo TO turnos_guardia_cierre_por_el_panel_exige_persona_y_motivo;
ALTER TABLE public.guardias RENAME CONSTRAINT guardias_cierre_rastro_completo TO turnos_guardia_cierre_rastro_completo;
ALTER TABLE public.guardias RENAME CONSTRAINT guardias_coordinador_id_fkey TO turnos_guardia_coordinador_id_fkey;
ALTER TABLE public.guardias RENAME CONSTRAINT guardias_dias_hasta_el_fin_valido TO turnos_guardia_dios_hasta_el_fin_valido;
ALTER TABLE public.guardias RENAME CONSTRAINT guardias_estado_check TO turnos_guardia_estado_check;
ALTER TABLE public.guardias RENAME CONSTRAINT guardias_horas_extra_con_motivo TO turnos_guardia_horos_extra_con_motivo;
ALTER TABLE public.guardias RENAME CONSTRAINT guardias_horas_extra_no_negativas TO turnos_guardia_horos_extra_no_negativas;
ALTER TABLE public.guardias RENAME CONSTRAINT guardias_id_prestadora_unique TO turnos_guardia_id_prestadora_unique;
ALTER TABLE public.guardias RENAME CONSTRAINT guardias_paciente_tenant_fk TO turnos_guardia_paciente_tenant_fk;
ALTER TABLE public.guardias RENAME CONSTRAINT guardias_pkey TO turnos_guardia_pkey;
ALTER TABLE public.guardias RENAME CONSTRAINT guardias_prestadora_id_fkey TO turnos_guardia_prestadora_id_fkey;
ALTER TABLE public.guardias RENAME CONSTRAINT guardias_serie_tenant_fk TO turnos_guardia_serie_tenant_fk;
ALTER TABLE public.guardias RENAME CONSTRAINT guardias_servicio_de_la_misma_prestadora TO turnos_guardia_servicio_de_la_misma_prestadora;
ALTER TABLE public.guardias RENAME CONSTRAINT guardias_sin_cubrir_estado_check TO turnos_guardia_sin_cubrir_estado_check;
ALTER TABLE public.guardias RENAME CONSTRAINT guardias_sin_cubrir_sin_marcas_check TO turnos_guardia_sin_cubrir_sin_marcas_check;
ALTER TABLE public.guardias_cobertura RENAME CONSTRAINT guardias_cobertura_asistente_sustituto_id_fkey TO turnos_guardia_cobertura_asistente_sustituto_id_fkey;
ALTER TABLE public.guardias_cobertura RENAME CONSTRAINT guardias_cobertura_asistente_titular_id_fkey TO turnos_guardia_cobertura_asistente_titular_id_fkey;
ALTER TABLE public.guardias_cobertura RENAME CONSTRAINT guardias_cobertura_ausencia_id_fkey TO turnos_guardia_cobertura_ausencia_id_fkey;
ALTER TABLE public.guardias_cobertura RENAME CONSTRAINT guardias_cobertura_cobertura_de_ausencia_id_fkey TO turnos_guardia_cobertura_cobertura_de_ausencia_id_fkey;
ALTER TABLE public.guardias_cobertura RENAME CONSTRAINT guardias_cobertura_pkey TO turnos_guardia_cobertura_pkey;
ALTER TABLE public.guardias_cobertura RENAME CONSTRAINT guardias_cobertura_prestadora_id_fkey TO turnos_guardia_cobertura_prestadora_id_fkey;
ALTER TABLE public.guardias_cobertura RENAME CONSTRAINT guardias_cobertura_titular_distinto_del_sustituto TO turnos_guardia_cobertura_titular_distinto_del_sustituto;
ALTER TABLE public.guardias_tracking_gps RENAME CONSTRAINT guardias_tracking_gps_guardia_tenant_fk TO turnos_guardia_tracking_gps_turno_guardia_tenant_fk;
ALTER TABLE public.guardias_tracking_gps RENAME CONSTRAINT guardias_tracking_gps_pkey TO turnos_guardia_tracking_gps_pkey;
ALTER TABLE public.guardias_tracking_gps RENAME CONSTRAINT guardias_tracking_gps_prestadora_id_fkey TO turnos_guardia_tracking_gps_prestadora_id_fkey;
ALTER TABLE public.incidentes_turno_sin_cubrir RENAME CONSTRAINT incidentes_turno_sin_cubrir_cerrar_es_decir_como TO incidentes_turno_guardia_sin_cubrir_cerrar_es_decir_como;
ALTER TABLE public.incidentes_turno_sin_cubrir RENAME CONSTRAINT incidentes_turno_sin_cubrir_guardia_tenant_fk TO incidentes_turno_guardia_sin_cubrir_turno_guardia_tenant_fk;
ALTER TABLE public.incidentes_turno_sin_cubrir RENAME CONSTRAINT incidentes_turno_sin_cubrir_pkey TO incidentes_turno_guardia_sin_cubrir_pkey;
ALTER TABLE public.incidentes_turno_sin_cubrir RENAME CONSTRAINT incidentes_turno_sin_cubrir_prestadora_id_fkey TO incidentes_turno_guardia_sin_cubrir_prestadora_id_fkey;
ALTER TABLE public.incidentes_turno_sin_cubrir RENAME CONSTRAINT incidentes_turno_sin_cubrir_resuelto_por_fkey TO incidentes_turno_guardia_sin_cubrir_resuelto_por_fkey;
ALTER TABLE public.motivos_aviso_previo_guardia RENAME CONSTRAINT motivos_aviso_previo_guardia_id_prestadora_id_key TO motivos_aviso_previo_turno_guardia_id_prestadora_id_key;
ALTER TABLE public.motivos_aviso_previo_guardia RENAME CONSTRAINT motivos_aviso_previo_guardia_pkey TO motivos_aviso_previo_turno_guardia_pkey;
ALTER TABLE public.motivos_aviso_previo_guardia RENAME CONSTRAINT motivos_aviso_previo_guardia_prestadora_id_fkey TO motivos_aviso_previo_turno_guardia_prestadora_id_fkey;
ALTER TABLE public.motivos_aviso_previo_guardia RENAME CONSTRAINT motivos_aviso_previo_guardia_prestadora_id_nombre_key TO motivos_aviso_previo_turno_guardia_prestadora_id_nombre_key;
ALTER TABLE public.motivos_sustitucion_guardia RENAME CONSTRAINT motivos_sustitucion_guardia_id_prestadora_id_key TO motivos_sustitucion_turno_guardia_id_prestadora_id_key;
ALTER TABLE public.motivos_sustitucion_guardia RENAME CONSTRAINT motivos_sustitucion_guardia_nombre_segun_nivel TO motivos_sustitucion_turno_guardia_nombre_segun_nivel;
ALTER TABLE public.motivos_sustitucion_guardia RENAME CONSTRAINT motivos_sustitucion_guardia_pkey TO motivos_sustitucion_turno_guardia_pkey;
ALTER TABLE public.motivos_sustitucion_guardia RENAME CONSTRAINT motivos_sustitucion_guardia_prestadora_id_fkey TO motivos_sustitucion_turno_guardia_prestadora_id_fkey;
ALTER TABLE public.prestadoras RENAME CONSTRAINT prestadoras_minutos_aviso_previo_guardia_check TO prestadoras_minutos_aviso_previo_turno_guardia_check;
ALTER TABLE public.reportes RENAME CONSTRAINT reportes_guardia_tenant_fk TO reportes_turno_guardia_tenant_fk;
ALTER TABLE public.series_guardias RENAME CONSTRAINT series_guardias_asistente_tenant_fk TO series_turnos_guardia_asistente_tenant_fk;
ALTER TABLE public.series_guardias RENAME CONSTRAINT series_guardias_canal_modalidad_check TO series_turnos_guardia_canal_modalidad_check;
ALTER TABLE public.series_guardias RENAME CONSTRAINT series_guardias_cancelacion_check TO series_turnos_guardia_cancelacion_check;
ALTER TABLE public.series_guardias RENAME CONSTRAINT series_guardias_cancelacion_origen_check TO series_turnos_guardia_cancelacion_origen_check;
ALTER TABLE public.series_guardias RENAME CONSTRAINT series_guardias_dias_hasta_el_fin_valido TO series_turnos_guardia_dias_hasta_el_fin_valido;
ALTER TABLE public.series_guardias RENAME CONSTRAINT series_guardias_estado_check TO series_turnos_guardia_estado_check;
ALTER TABLE public.series_guardias RENAME CONSTRAINT series_guardias_id_prestadora_unique TO series_turnos_guardia_id_prestadora_unique;
ALTER TABLE public.series_guardias RENAME CONSTRAINT series_guardias_paciente_tenant_fk TO series_turnos_guardia_paciente_tenant_fk;
ALTER TABLE public.series_guardias RENAME CONSTRAINT series_guardias_pkey TO series_turnos_guardia_pkey;
ALTER TABLE public.series_guardias RENAME CONSTRAINT series_guardias_prestadora_id_fkey TO series_turnos_guardia_prestadora_id_fkey;
ALTER TABLE public.series_guardias RENAME CONSTRAINT series_guardias_servicio_tenant_fk TO series_turnos_guardia_servicio_tenant_fk;
ALTER TABLE public.series_guardias_pacientes RENAME CONSTRAINT series_guardias_pacientes_paciente_tenant_fk TO series_turnos_guardia_pacientes_paciente_tenant_fk;
ALTER TABLE public.series_guardias_pacientes RENAME CONSTRAINT series_guardias_pacientes_pkey TO series_turnos_guardia_pacientes_pkey;
ALTER TABLE public.series_guardias_pacientes RENAME CONSTRAINT series_guardias_pacientes_prestadora_id_fkey TO series_turnos_guardia_pacientes_prestadora_id_fkey;
ALTER TABLE public.series_guardias_pacientes RENAME CONSTRAINT series_guardias_pacientes_serie_tenant_fk TO series_turnos_guardia_pacientes_serie_tenant_fk;
ALTER TABLE public.alertas_tempranas_guardia RENAME COLUMN guardia_id TO turno_guardia_id;
ALTER TABLE public.asignaciones_de_turno RENAME COLUMN guardia_id TO turno_guardia_id;
ALTER TABLE public.auditoria_asignaciones_con_aviso RENAME COLUMN guardia_id TO turno_guardia_id;
ALTER TABLE public.auditoria_reasignaciones_por_emergencia RENAME COLUMN guardia_id TO turno_guardia_id;
ALTER TABLE public.ausencias RENAME COLUMN guardias_afectadas TO turnos_guardia_afectados;
ALTER TABLE public.calificaciones_asistente RENAME COLUMN guardia_id TO turno_guardia_id;
ALTER TABLE public.condiciones_comerciales_servicio RENAME COLUMN cobra_guardias_adicionales TO cobra_turnos_guardia_adicionales;
ALTER TABLE public.configuracion_escalada_coordinador RENAME COLUMN minutos_gracia_cierre_guardia TO minutos_gracia_cierre_turno_guardia;
ALTER TABLE public.consentimientos_paciente_solo RENAME COLUMN guardia_id TO turno_guardia_id;
ALTER TABLE public.descansos_guardia RENAME COLUMN guardia_id TO turno_guardia_id;
ALTER TABLE public.emergencias_guardia RENAME COLUMN guardia_id TO turno_guardia_id;
ALTER TABLE public.excepciones_familiar_relevo RENAME COLUMN guardia_id TO turno_guardia_id;
ALTER TABLE public.excepciones_por_documentos RENAME COLUMN guardia_id TO turno_guardia_id;
ALTER TABLE public.extensiones_de_turno RENAME COLUMN guardia_id TO turno_guardia_id;
ALTER TABLE public.extensiones_de_turno RENAME COLUMN relevo_guardia_id TO relevo_turno_guardia_id;
ALTER TABLE public.guardia_comprobaciones RENAME COLUMN guardia_id TO turno_guardia_id;
ALTER TABLE public.guardia_pacientes RENAME COLUMN guardia_id TO turno_guardia_id;
ALTER TABLE public.guardias_cobertura RENAME COLUMN guardia_original_id TO turno_guardia_original_id;
ALTER TABLE public.guardias_tracking_gps RENAME COLUMN guardia_id TO turno_guardia_id;
ALTER TABLE public.incidentes_relevo RENAME COLUMN guardia_entrante_id TO turno_guardia_entrante_id;
ALTER TABLE public.incidentes_relevo RENAME COLUMN guardia_saliente_id TO turno_guardia_saliente_id;
ALTER TABLE public.incidentes_turno_sin_cubrir RENAME COLUMN guardia_id TO turno_guardia_id;
ALTER TABLE public.liquidaciones_asistente RENAME COLUMN guardias_contadas TO turnos_guardia_contados;
ALTER TABLE public.plazos_de_ubicacion_avisados RENAME COLUMN control_en_el_turno_desde TO control_en_el_turno_guardia_desde;
ALTER TABLE public.prestaciones RENAME COLUMN precio_guardia_adicional TO precio_turno_guardia_adicional;
ALTER TABLE public.prestadoras RENAME COLUMN control_de_ubicacion_en_el_turno TO control_de_ubicacion_en_el_turno_guardia;
ALTER TABLE public.prestadoras RENAME COLUMN control_de_ubicacion_en_el_turno_desde TO control_de_ubicacion_en_el_turno_guardia_desde;
ALTER TABLE public.prestadoras RENAME COLUMN dias_generacion_series_guardia TO dias_generacion_series_turno_guardia;
ALTER TABLE public.prestadoras RENAME COLUMN guardias_solo_con_firma_del_pagador TO turnos_guardia_solo_con_firma_del_pagador;
ALTER TABLE public.prestadoras RENAME COLUMN minutos_aviso_previo_guardia TO minutos_aviso_previo_turno_guardia;
ALTER TABLE public.prestadoras RENAME COLUMN registro_de_accesos_horas_alrededor_de_la_guardia TO registro_de_accesos_horas_alrededor_del_turno_guardia;
ALTER TABLE public.remuneraciones_asistente RENAME COLUMN valor_guardia TO valor_turno_guardia;
ALTER TABLE public.reportes RENAME COLUMN guardia_id TO turno_guardia_id;
ALTER TABLE public.textos_consentimiento RENAME COLUMN control_de_ubicacion_en_el_turno TO control_de_ubicacion_en_el_turno_guardia;
ALTER TABLE public.alertas_tempranas_guardia RENAME TO alertas_tempranas_turno_guardia;
ALTER TABLE public.asignaciones_de_turno RENAME TO asignaciones_de_turno_guardia;
ALTER TABLE public.configuracion_aviso_guardia_sin_cubrir RENAME TO configuracion_aviso_turno_guardia_sin_cubrir;
ALTER TABLE public.configuracion_incidentes_turno_sin_cubrir RENAME TO configuracion_incidentes_turno_guardia_sin_cubrir;
ALTER TABLE public.descansos_guardia RENAME TO descansos_turno_guardia;
ALTER TABLE public.emergencias_guardia RENAME TO emergencias_turno_guardia;
ALTER TABLE public.extensiones_de_turno RENAME TO extensiones_de_turno_guardia;
ALTER TABLE public.finales_turno_sin_cubrir RENAME TO finales_turno_guardia_sin_cubrir;
ALTER TABLE public.guardia_comprobaciones RENAME TO turno_guardia_comprobaciones;
ALTER TABLE public.guardia_pacientes RENAME TO turno_guardia_pacientes;
ALTER TABLE public.guardias RENAME TO turnos_guardia;
ALTER TABLE public.guardias_cobertura RENAME TO turnos_guardia_cobertura;
ALTER TABLE public.guardias_tracking_gps RENAME TO turnos_guardia_tracking_gps;
ALTER TABLE public.incidentes_turno_sin_cubrir RENAME TO incidentes_turno_guardia_sin_cubrir;
ALTER TABLE public.motivos_aviso_previo_guardia RENAME TO motivos_aviso_previo_turno_guardia;
ALTER TABLE public.motivos_sustitucion_guardia RENAME TO motivos_sustitucion_turno_guardia;
ALTER TABLE public.series_guardias RENAME TO series_turnos_guardia;
ALTER TABLE public.series_guardias_pacientes RENAME TO series_turnos_guardia_pacientes;

-- 5. Funciones cuyo cuerpo nombra algo renombrado.
-- 5a. Las que cambian parámetros o resultado no admiten reemplazo: se sueltan las políticas que las usan,
--     se sueltan y se vuelven a crear con los mismos permisos, y al final vuelven las políticas.
DROP POLICY coordinador_gestiona_alertas_turno_guardia_de_sus_servicios ON public.alertas_tempranas_turno_guardia;
DROP POLICY coordinador_lee_reasignaciones_de_lo_que_ve ON public.auditoria_reasignaciones_por_emergencia;
DROP POLICY admin_prestadora_actualiza_visibilidad ON public.calificaciones_asistente;
DROP POLICY cliente_califica_al_asistente ON public.calificaciones_asistente;
DROP POLICY prestadora_ve_calificaciones ON public.calificaciones_asistente;
DROP POLICY coordinador_gestiona_consentimientos_paciente_solo ON public.consentimientos_paciente_solo;
DROP POLICY coordinador_ve_consultas_de_relevo_de_sus_servicios ON public.consultas_de_relevo;
DROP POLICY coordinador_lee_descansos_de_sus_servicios ON public.descansos_turno_guardia;
DROP POLICY coordinador_atiende_una_emergencia_de_sus_servicios_o_tomada ON public.emergencias_turno_guardia;
DROP POLICY coordinador_lee_emergencias_de_sus_servicios ON public.emergencias_turno_guardia;
DROP POLICY la_informacion_de_salud_la_ve_quien_atiende ON public.emergencias_turno_guardia;
DROP POLICY coordinador_gestiona_excepciones_de_relevo_de_sus_servicios ON public.excepciones_familiar_relevo;
DROP POLICY coordinador_lee_extensiones_de_turno_guardia ON public.extensiones_de_turno_guardia;
DROP POLICY coordinador_gestiona_comprobaciones_de_sus_servicios ON public.turno_guardia_comprobaciones;
DROP POLICY el_panel_arma_la_lista_de_pacientes ON public.turno_guardia_pacientes;
DROP POLICY coordinador_gestiona_turnos_guardia_de_sus_servicios ON public.turnos_guardia;
DROP POLICY coordinador_gestiona_turnos_guardia_gps_de_sus_servicios ON public.turnos_guardia_tracking_gps;
DROP POLICY coordinador_gestiona_incidentes_relevo_de_sus_servicios ON public.incidentes_relevo;
DROP POLICY coordinador_gestiona_incidentes_turno_guardia_sin_cubrir ON public.incidentes_turno_guardia_sin_cubrir;
DROP POLICY coordinador_gestiona_reportes_de_sus_servicios ON public.reportes;

DROP FUNCTION interno.asistente_de_la_guardia(p_turno_guardia uuid);
CREATE OR REPLACE FUNCTION interno.asistente_del_turno_guardia(p_turno_guardia uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT g.asistente_id FROM public.turnos_guardia g
   WHERE g.id = p_turno_guardia AND g.prestadora_id = interno.prestadora_actual();
$function$;
REVOKE ALL ON FUNCTION interno.asistente_del_turno_guardia(p_turno_guardia uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION interno.asistente_del_turno_guardia(p_turno_guardia uuid) TO service_role;
GRANT EXECUTE ON FUNCTION interno.asistente_del_turno_guardia(p_turno_guardia uuid) TO authenticated;

DROP FUNCTION interno.asistente_ocupado_entre(p_asistente uuid, p_turno_guardia_excluido uuid, p_desde timestamp without time zone, p_hasta timestamp without time zone);
CREATE OR REPLACE FUNCTION interno.asistente_ocupado_entre(p_asistente uuid, p_turno_guardia_excluido uuid, p_desde timestamp without time zone, p_hasta timestamp without time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM turnos_guardia g
     WHERE g.prestadora_id = interno.prestadora_actual()
       AND g.asistente_id = p_asistente
       AND g.id <> p_turno_guardia_excluido
       AND g.estado NOT IN ('cancelada', 'ausente')
       AND (g.fecha + g.hora_inicio) < p_hasta
       AND (interno.dia_en_que_termina_turno_guardia(g.fecha, g.hora_inicio, g.hora_fin, g.dias_hasta_el_fin) + g.hora_fin) > p_desde
  );
$function$;
REVOKE ALL ON FUNCTION interno.asistente_ocupado_entre(p_asistente uuid, p_turno_guardia_excluido uuid, p_desde timestamp without time zone, p_hasta timestamp without time zone) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION interno.asistente_ocupado_entre(p_asistente uuid, p_turno_guardia_excluido uuid, p_desde timestamp without time zone, p_hasta timestamp without time zone) TO service_role;
GRANT EXECUTE ON FUNCTION interno.asistente_ocupado_entre(p_asistente uuid, p_turno_guardia_excluido uuid, p_desde timestamp without time zone, p_hasta timestamp without time zone) TO authenticated;

DROP FUNCTION interno.coordinador_alcanza_la_guardia_de(p_servicio uuid, p_paciente uuid, p_turno_guardia uuid);
CREATE OR REPLACE FUNCTION interno.coordinador_alcanza_el_turno_guardia_de(p_servicio uuid, p_paciente uuid, p_turno_guardia uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT CASE
    WHEN p_servicio IS NOT NULL THEN interno.coordina_el_servicio(p_servicio)
    ELSE (p_paciente IS NOT NULL AND interno.coordinador_ve_al_paciente(p_paciente))
      OR EXISTS (SELECT 1 FROM turno_guardia_pacientes gp
                  WHERE gp.turno_guardia_id = p_turno_guardia
                    AND interno.coordinador_ve_al_paciente(gp.paciente_id))
  END;
$function$;
REVOKE ALL ON FUNCTION interno.coordinador_alcanza_el_turno_guardia_de(p_servicio uuid, p_paciente uuid, p_turno_guardia uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION interno.coordinador_alcanza_el_turno_guardia_de(p_servicio uuid, p_paciente uuid, p_turno_guardia uuid) TO service_role;
GRANT EXECUTE ON FUNCTION interno.coordinador_alcanza_el_turno_guardia_de(p_servicio uuid, p_paciente uuid, p_turno_guardia uuid) TO authenticated;

DROP FUNCTION interno.coordinador_ve_la_guardia(p_turno_guardia uuid);
CREATE OR REPLACE FUNCTION interno.coordinador_ve_el_turno_guardia(p_turno_guardia uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT p_turno_guardia IS NOT NULL
     AND interno.es_coordinador()
     AND (EXISTS (
            SELECT 1 FROM turnos_guardia g
             WHERE g.id = p_turno_guardia
               AND g.prestadora_id = interno.prestadora_actual()
               AND interno.coordinador_alcanza_el_turno_guardia_de(g.servicio_id, g.paciente_id, g.id)
          )
          OR p_turno_guardia = ANY (interno.turnos_guardia_a_la_vista_por_una_alarma(true)));
$function$;
REVOKE ALL ON FUNCTION interno.coordinador_ve_el_turno_guardia(p_turno_guardia uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION interno.coordinador_ve_el_turno_guardia(p_turno_guardia uuid) TO service_role;
GRANT EXECUTE ON FUNCTION interno.coordinador_ve_el_turno_guardia(p_turno_guardia uuid) TO authenticated;

DROP FUNCTION interno.excepcion_por_documentos(p_prestadora_id uuid, p_turno_guardia_id uuid, p_asistente_id uuid, p_bloquean text[], p_motivo text);
CREATE OR REPLACE FUNCTION interno.excepcion_por_documentos(p_prestadora_id uuid, p_turno_guardia_id uuid, p_asistente_id uuid, p_bloquean text[], p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF cardinality(p_bloquean) = 0 THEN
    RETURN;
  END IF;

  IF btrim(COALESCE(p_motivo, '')) = '' THEN
    RAISE EXCEPTION 'documentos_bloquean:%:', array_to_string(p_bloquean, ', ')
      USING ERRCODE = '23514';
  END IF;

  IF NOT interno.tiene_permiso('asignar_con_documentos_pendientes') THEN
    RAISE EXCEPTION 'sin_permiso_para_asignar_con_documentos_pendientes' USING ERRCODE = '42501';
  END IF;

  INSERT INTO excepciones_por_documentos (prestadora_id, turno_guardia_id, asistente_id, usuario_id, motivo, documentos)
  VALUES (p_prestadora_id, p_turno_guardia_id, p_asistente_id, interno.usuario_de_la_sesion(), btrim(p_motivo), p_bloquean);
END;
$function$;
REVOKE ALL ON FUNCTION interno.excepcion_por_documentos(p_prestadora_id uuid, p_turno_guardia_id uuid, p_asistente_id uuid, p_bloquean text[], p_motivo text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION interno.excepcion_por_documentos(p_prestadora_id uuid, p_turno_guardia_id uuid, p_asistente_id uuid, p_bloquean text[], p_motivo text) TO service_role;
GRANT EXECUTE ON FUNCTION interno.excepcion_por_documentos(p_prestadora_id uuid, p_turno_guardia_id uuid, p_asistente_id uuid, p_bloquean text[], p_motivo text) TO authenticated;

DROP FUNCTION interno.hay_excepcion_por_documentos(p_turno_guardia_id uuid, p_asistente_id uuid);
CREATE OR REPLACE FUNCTION interno.hay_excepcion_por_documentos(p_turno_guardia_id uuid, p_asistente_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.excepciones_por_documentos e
      JOIN public.turnos_guardia g ON g.id = e.turno_guardia_id AND g.prestadora_id = e.prestadora_id
     WHERE e.turno_guardia_id = p_turno_guardia_id
       AND e.asistente_id = p_asistente_id);
$function$;
REVOKE ALL ON FUNCTION interno.hay_excepcion_por_documentos(p_turno_guardia_id uuid, p_asistente_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION interno.hay_excepcion_por_documentos(p_turno_guardia_id uuid, p_asistente_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION interno.hay_excepcion_por_documentos(p_turno_guardia_id uuid, p_asistente_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION interno.hay_excepcion_por_documentos(p_turno_guardia_id uuid, p_asistente_id uuid) TO trabajo_sin_persona;

DROP FUNCTION interno.pacientes_de_la_guardia(p_turno_guardia_id uuid);
CREATE OR REPLACE FUNCTION interno.pacientes_del_turno_guardia(p_turno_guardia_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT paciente_id FROM turno_guardia_pacientes WHERE turno_guardia_id = p_turno_guardia_id
$function$;
REVOKE ALL ON FUNCTION interno.pacientes_del_turno_guardia(p_turno_guardia_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION interno.pacientes_del_turno_guardia(p_turno_guardia_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION interno.pacientes_del_turno_guardia(p_turno_guardia_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION interno.pacientes_del_turno_guardia(p_turno_guardia_id uuid) TO trabajo_sin_persona;
COMMENT ON FUNCTION interno.pacientes_del_turno_guardia(p_turno_guardia_id uuid) IS 'A quiénes atiende un turno de guardia. Punto único de verdad de las reglas de acceso (CLAUDE.md §7 regla 12).';

DROP FUNCTION interno.personal_ve_la_calificacion(p_asistente uuid, p_turno_guardia uuid);
CREATE OR REPLACE FUNCTION interno.personal_ve_la_calificacion(p_asistente uuid, p_turno_guardia uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT interno.es_superadmin()
      OR interno.es_admin_prestadora()
      OR (interno.es_coordinador()
          AND ((p_asistente IS NOT NULL AND interno.coordinador_alcanza_asistente(p_asistente))
               OR (p_turno_guardia IS NOT NULL AND interno.coordinador_ve_el_turno_guardia(p_turno_guardia))));
$function$;
REVOKE ALL ON FUNCTION interno.personal_ve_la_calificacion(p_asistente uuid, p_turno_guardia uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION interno.personal_ve_la_calificacion(p_asistente uuid, p_turno_guardia uuid) TO service_role;
GRANT EXECUTE ON FUNCTION interno.personal_ve_la_calificacion(p_asistente uuid, p_turno_guardia uuid) TO authenticated;

DROP FUNCTION public.asignar_turno(p_turno_guardia_id uuid, p_asistente_id uuid, p_motivo_excepcion text);
CREATE OR REPLACE FUNCTION public.asignar_turno_guardia(p_turno_guardia_id uuid, p_asistente_id uuid, p_motivo_excepcion text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
  v_turno_guardia    public.turnos_guardia;
  v_pendiente  public.asignaciones_de_turno_guardia;
  v_anterior   uuid;
  v_nueva      uuid;
BEGIN
  IF v_prestadora IS NULL THEN
    RAISE EXCEPTION 'turno_guardia_no_encontrado';
  END IF;

  -- Primero la asignación pendiente y después el turno: es el mismo orden en que los toma
  -- `aceptar_asignacion`, así las dos nunca se esperan una a la otra.
  SELECT * INTO v_pendiente
    FROM asignaciones_de_turno_guardia
   WHERE turno_guardia_id = p_turno_guardia_id
     AND prestadora_id = v_prestadora
     AND estado = 'sin_responder'
   FOR UPDATE;

  SELECT * INTO v_turno_guardia
    FROM turnos_guardia
   WHERE id = p_turno_guardia_id
     AND prestadora_id = v_prestadora
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'turno_guardia_no_encontrado';
  END IF;

  IF v_turno_guardia.estado <> 'programada' THEN
    RAISE EXCEPTION 'turno_guardia_no_se_asigna' USING ERRCODE = '23514';
  END IF;

  -- Lo que ya está como se pide no se toca: ni se retira ni se vuelve a avisar.
  IF p_asistente_id IS NOT NULL AND v_pendiente.asistente_id = p_asistente_id THEN
    RETURN jsonb_build_object('sin_cambios', true);
  END IF;
  IF p_asistente_id IS NULL AND v_pendiente.id IS NULL AND v_turno_guardia.asistente_id IS NULL THEN
    RETURN jsonb_build_object('sin_cambios', true);
  END IF;

  v_anterior := COALESCE(v_turno_guardia.asistente_id, v_pendiente.asistente_anterior_id);

  -- Las mismas paredes que pone la base cuando el turno pasa a ser de alguien, puestas ahora,
  -- para que el Coordinador se entere al asignar y no el Asistente al aceptar.
  IF p_asistente_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM asistentes a WHERE a.id = p_asistente_id AND a.prestadora_id = v_prestadora) THEN
      RAISE EXCEPTION 'asistente_no_encontrado';
    END IF;

    -- El Coordinador asigna sólo a los Asistentes de su zona. Lo frenaría igual la política de
    -- la asignación, pero con un error que no dice qué pasó.
    IF EXISTS (SELECT 1 FROM usuarios u WHERE u.id = interno.usuario_de_la_sesion() AND u.rol = 'coordinador')
       AND NOT interno.coordinador_alcanza_asistente(p_asistente_id) THEN
      RAISE EXCEPTION 'asistente_no_encontrado';
    END IF;

    PERFORM interno.excepcion_por_documentos(
      v_prestadora,
      v_turno_guardia.id,
      p_asistente_id,
      interno.documentos_que_bloquean(
        p_asistente_id,
        interno.dia_en_que_termina_turno_guardia(v_turno_guardia.fecha, v_turno_guardia.hora_inicio, v_turno_guardia.hora_fin, v_turno_guardia.dias_hasta_el_fin),
        v_turno_guardia.paciente_id,
        v_turno_guardia.servicio_id
      ),
      p_motivo_excepcion
    );

    IF v_turno_guardia.canal_modalidad IS NOT NULL
       AND NOT interno.asistente_trabaja_en_modalidad(p_asistente_id, v_turno_guardia.canal_modalidad) THEN
      RAISE EXCEPTION 'modalidad_bloquea:%:', v_turno_guardia.canal_modalidad USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_pendiente.id IS NOT NULL THEN
    UPDATE asignaciones_de_turno_guardia SET estado = 'retirada' WHERE id = v_pendiente.id;
  END IF;

  IF v_turno_guardia.asistente_id IS NOT NULL THEN
    UPDATE turnos_guardia SET asistente_id = NULL WHERE id = v_turno_guardia.id;
  END IF;

  IF p_asistente_id IS NOT NULL THEN
    INSERT INTO asignaciones_de_turno_guardia (prestadora_id, turno_guardia_id, asistente_id, asistente_anterior_id)
    VALUES (v_prestadora, v_turno_guardia.id, p_asistente_id, v_anterior)
    RETURNING id INTO v_nueva;
  END IF;

  -- Alguien perdió el turno: la alarma se abre ya. Si había una abierta, sigue la misma.
  IF v_turno_guardia.asistente_id IS NOT NULL OR v_pendiente.id IS NOT NULL THEN
    INSERT INTO incidentes_turno_guardia_sin_cubrir (prestadora_id, turno_guardia_id)
    VALUES (v_prestadora, v_turno_guardia.id)
    ON CONFLICT (turno_guardia_id) WHERE resuelto_at IS NULL DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'sin_cambios', false,
    'asignacion_id', v_nueva,
    'titular_retirado', v_turno_guardia.asistente_id,
    'pendiente_retirado', v_pendiente.asistente_id,
    'asistente_anterior_id', v_anterior
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.asignar_turno_guardia(p_turno_guardia_id uuid, p_asistente_id uuid, p_motivo_excepcion text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.asignar_turno_guardia(p_turno_guardia_id uuid, p_asistente_id uuid, p_motivo_excepcion text) TO service_role;
GRANT EXECUTE ON FUNCTION public.asignar_turno_guardia(p_turno_guardia_id uuid, p_asistente_id uuid, p_motivo_excepcion text) TO authenticated;

DROP FUNCTION public.mover_turno_a_otro_paciente(p_turno_guardia_id uuid, p_paciente_id uuid, p_fecha date, p_hora_inicio time without time zone, p_hora_fin time without time zone);
CREATE OR REPLACE FUNCTION public.mover_turno_guardia_a_otro_paciente(p_turno_guardia_id uuid, p_paciente_id uuid, p_fecha date, p_hora_inicio time without time zone, p_hora_fin time without time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
  v_turno_guardia    public.turnos_guardia;
  v_asistente  uuid;
  v_nueva      uuid;
  v_quitar     jsonb;
  v_asignar    jsonb;
BEGIN
  IF v_prestadora IS NULL THEN
    RAISE EXCEPTION 'turno_guardia_no_encontrado';
  END IF;

  SELECT * INTO v_turno_guardia
    FROM turnos_guardia
   WHERE id = p_turno_guardia_id
     AND prestadora_id = v_prestadora;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'turno_guardia_no_encontrado';
  END IF;

  IF v_turno_guardia.estado <> 'programada' THEN
    RAISE EXCEPTION 'turno_guardia_no_se_asigna' USING ERRCODE = '23514';
  END IF;

  -- El que esperaba respuesta manda sobre el que figura: es a quien se le asignó por última vez.
  SELECT asistente_id INTO v_asistente
    FROM asignaciones_de_turno_guardia
   WHERE turno_guardia_id = p_turno_guardia_id
     AND prestadora_id = v_prestadora
     AND estado = 'sin_responder';
  v_asistente := COALESCE(v_asistente, v_turno_guardia.asistente_id);

  IF v_asistente IS NULL THEN
    RAISE EXCEPTION 'turno_guardia_sin_asistente' USING ERRCODE = '23514';
  END IF;

  -- El Paciente de destino tiene que ser de la misma Prestadora. Un identificador de otra no se
  -- distingue de uno que no existe.
  IF NOT EXISTS (SELECT 1 FROM pacientes p WHERE p.id = p_paciente_id AND p.prestadora_id = v_prestadora) THEN
    RAISE EXCEPTION 'paciente_no_encontrado';
  END IF;

  INSERT INTO turnos_guardia (
    prestadora_id, paciente_id, servicio_id, coordinador_id, fecha, hora_inicio, hora_fin,
    dias_hasta_el_fin, modalidad, canal_modalidad
  )
  VALUES (
    v_prestadora, p_paciente_id, v_turno_guardia.servicio_id, v_turno_guardia.coordinador_id,
    COALESCE(p_fecha, v_turno_guardia.fecha),
    COALESCE(p_hora_inicio, v_turno_guardia.hora_inicio),
    COALESCE(p_hora_fin, v_turno_guardia.hora_fin),
    v_turno_guardia.dias_hasta_el_fin, v_turno_guardia.modalidad, v_turno_guardia.canal_modalidad
  )
  RETURNING id INTO v_nueva;

  -- Primero se lo saca del original —que abre la alarma— y después se le ofrece el nuevo.
  v_quitar  := public.asignar_turno_guardia(p_turno_guardia_id, NULL);
  v_asignar := public.asignar_turno_guardia(v_nueva, v_asistente);

  RETURN jsonb_build_object(
    'turno_guardia_nuevo_id', v_nueva,
    'asistente_id', v_asistente,
    'titular_retirado', v_quitar->'titular_retirado',
    'pendiente_retirado', v_quitar->'pendiente_retirado'
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.mover_turno_guardia_a_otro_paciente(p_turno_guardia_id uuid, p_paciente_id uuid, p_fecha date, p_hora_inicio time without time zone, p_hora_fin time without time zone) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mover_turno_guardia_a_otro_paciente(p_turno_guardia_id uuid, p_paciente_id uuid, p_fecha date, p_hora_inicio time without time zone, p_hora_fin time without time zone) TO service_role;
GRANT EXECUTE ON FUNCTION public.mover_turno_guardia_a_otro_paciente(p_turno_guardia_id uuid, p_paciente_id uuid, p_fecha date, p_hora_inicio time without time zone, p_hora_fin time without time zone) TO authenticated;

DROP FUNCTION public.reasignar_guardia_por_emergencia(p_turno_guardia_id uuid, p_asistente_id uuid, p_motivo text, p_motivo_excepcion text);
CREATE OR REPLACE FUNCTION public.reasignar_turno_guardia_por_emergencia(p_turno_guardia_id uuid, p_asistente_id uuid, p_motivo text, p_motivo_excepcion text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid;
  v_usuario    uuid;
  v_motivo     text := btrim(COALESCE(p_motivo, ''));
  v_turno_guardia    record;
  v_tocadas    integer;
BEGIN
  -- La Prestadora y la persona salen de la sesión, nunca del pedido. Sin persona no hay a quién
  -- atribuirle el cambio, y no se hace.
  v_prestadora := interno.prestadora_actual();
  v_usuario := interno.usuario_de_la_sesion();
  IF v_prestadora IS NULL OR v_usuario IS NULL THEN
    RAISE EXCEPTION 'reasignacion_sin_sesion' USING ERRCODE = '42501';
  END IF;

  IF p_turno_guardia_id IS NULL OR p_asistente_id IS NULL OR v_motivo = '' THEN
    RAISE EXCEPTION 'reasignacion_incompleta' USING ERRCODE = '23514';
  END IF;

  -- La lectura pasa por la RLS de quien pide.
  SELECT g.id, g.asistente_id, g.estado, g.checkin_at, g.fecha, g.hora_inicio, g.hora_fin,
         g.dias_hasta_el_fin, g.paciente_id, g.servicio_id
    INTO v_turno_guardia
    FROM public.turnos_guardia g
   WHERE g.id = p_turno_guardia_id
     AND g.prestadora_id = v_prestadora
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reasignacion_sin_turno_guardia' USING ERRCODE = '42501';
  END IF;

  IF v_turno_guardia.estado <> 'ausente' OR v_turno_guardia.checkin_at IS NOT NULL
     OR v_turno_guardia.asistente_id IS NOT DISTINCT FROM p_asistente_id THEN
    RAISE EXCEPTION 'turno_guardia_empezado_no_cambia_de_asistente' USING ERRCODE = '23514';
  END IF;

  IF interno.asistente_ocupado_entre(
       p_asistente_id,
       p_turno_guardia_id,
       v_turno_guardia.fecha + v_turno_guardia.hora_inicio,
       interno.dia_en_que_termina_turno_guardia(v_turno_guardia.fecha, v_turno_guardia.hora_inicio, v_turno_guardia.hora_fin, v_turno_guardia.dias_hasta_el_fin) + v_turno_guardia.hora_fin
     ) THEN
    RAISE EXCEPTION 'asistente_en_otro_turno_guardia' USING ERRCODE = '23514';
  END IF;

  PERFORM interno.excepcion_por_documentos(
    v_prestadora,
    p_turno_guardia_id,
    p_asistente_id,
    interno.documentos_que_bloquean(
      p_asistente_id,
      interno.dia_en_que_termina_turno_guardia(v_turno_guardia.fecha, v_turno_guardia.hora_inicio, v_turno_guardia.hora_fin, v_turno_guardia.dias_hasta_el_fin),
      v_turno_guardia.paciente_id,
      v_turno_guardia.servicio_id
    ),
    p_motivo_excepcion
  );

  PERFORM set_config('careonys.reasignacion_por_emergencia', p_turno_guardia_id::text, true);

  INSERT INTO public.auditoria_reasignaciones_por_emergencia
    (prestadora_id, turno_guardia_id, usuario_id, asistente_anterior_id, asistente_nuevo_id, motivo)
  VALUES
    (v_prestadora, p_turno_guardia_id, v_usuario, v_turno_guardia.asistente_id, p_asistente_id, v_motivo);

  -- Quien la cubre entra ahora: el turno vuelve a esperar su check-in.
  UPDATE public.turnos_guardia
     SET asistente_id = p_asistente_id,
         estado = 'programada'
   WHERE id = p_turno_guardia_id
     AND prestadora_id = v_prestadora;
  GET DIAGNOSTICS v_tocadas = ROW_COUNT;

  PERFORM set_config('careonys.reasignacion_por_emergencia', '', true);

  IF v_tocadas = 0 THEN
    RAISE EXCEPTION 'reasignacion_sin_turno_guardia' USING ERRCODE = '42501';
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.reasignar_turno_guardia_por_emergencia(p_turno_guardia_id uuid, p_asistente_id uuid, p_motivo text, p_motivo_excepcion text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reasignar_turno_guardia_por_emergencia(p_turno_guardia_id uuid, p_asistente_id uuid, p_motivo text, p_motivo_excepcion text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reasignar_turno_guardia_por_emergencia(p_turno_guardia_id uuid, p_asistente_id uuid, p_motivo text, p_motivo_excepcion text) TO authenticated;

DROP FUNCTION public.turnos_asignados_sin_responder();
CREATE OR REPLACE FUNCTION public.turnos_guardia_asignados_sin_responder()
 RETURNS TABLE(asignacion_id uuid, asignado_at timestamp with time zone, tipo text, turno_guardia_id uuid, serie_id uuid, ausencia_id uuid, fecha date, hora_inicio time without time zone, hora_fin time without time zone, dias_hasta_el_fin smallint, modalidad text, dias_semana text[], desde date, hasta date, cantidad integer, barrios text[], niveles_de_complejidad text[], distancia_m integer, tareas jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  WITH yo AS (
    SELECT a.id, d.lat, d.lng, a.tipo_asistente_id
      FROM asistentes a
      LEFT JOIN domicilio_asistente d ON d.asistente_id = a.id AND d.prestadora_id = a.prestadora_id
     WHERE a.id = interno.asistente_de_la_sesion()
       AND a.prestadora_id = interno.prestadora_actual()
  ),
  mias AS (
    SELECT a.*
      FROM asignaciones_de_turno_guardia a
     WHERE a.prestadora_id = interno.prestadora_actual()
       AND a.asistente_id = interno.asistente_de_la_sesion()
       AND a.estado = 'sin_responder'
  ),
  -- Un turno suelto.
  turnos_guardia_sueltos AS (
    SELECT a.id, a.asignado_at, 'turno_guardia'::text AS tipo, g.id AS turno_guardia_id, NULL::uuid AS serie_id,
           NULL::uuid AS ausencia_id, g.fecha, g.hora_inicio, g.hora_fin, g.dias_hasta_el_fin,
           g.modalidad, NULL::text[] AS dias_semana, g.fecha AS desde, g.fecha AS hasta,
           1 AS cantidad, quienes.ids, g.fecha AS dia_del_domicilio, g.prestadora_id,
           ARRAY[g.servicio_id] AS servicios
      FROM mias a
      JOIN turnos_guardia g
        ON g.id = a.turno_guardia_id
       AND g.prestadora_id = a.prestadora_id
     CROSS JOIN LATERAL (
       SELECT CASE WHEN count(gp.paciente_id) > 0
                   THEN array_agg(gp.paciente_id)
                   ELSE array_remove(ARRAY[g.paciente_id], NULL)
              END AS ids
         FROM turno_guardia_pacientes gp
        WHERE gp.turno_guardia_id = g.id
          AND gp.prestadora_id = g.prestadora_id
     ) quienes
     WHERE g.estado = 'programada'
       AND g.asistente_id IS NULL
  ),
  -- Un turno fijo entero.
  fijos AS (
    SELECT a.id, a.asignado_at, 'serie'::text, NULL::uuid, s.id, NULL::uuid,
           NULL::date, s.hora_inicio, s.hora_fin, s.dias_hasta_el_fin, s.modalidad, s.dias_semana,
           GREATEST(s.vigente_desde, CURRENT_DATE), s.vigente_hasta, NULL::integer,
           array_remove(ARRAY[s.paciente_id], NULL)
             || ARRAY(SELECT sp.paciente_id FROM series_turnos_guardia_pacientes sp
                       WHERE sp.serie_id = s.id AND sp.prestadora_id = s.prestadora_id),
           GREATEST(s.vigente_desde, CURRENT_DATE), s.prestadora_id,
           ARRAY[s.servicio_id]
      FROM mias a
      JOIN series_turnos_guardia s
        ON s.id = a.serie_id
       AND s.prestadora_id = a.prestadora_id
     WHERE s.estado = 'activa'
       AND s.asistente_id IS NULL
  ),
  -- El reemplazo de un ausente: hasta dónde llega lo decide la misma cuenta que
  -- `hastaDondeCubrir` del backend.
  ausencias_mias AS (
    SELECT a.id, a.asignado_at, a.prestadora_id, au.id AS ausencia_id, au.asistente_id AS titular_id,
           GREATEST(au.fecha_inicio, CURRENT_DATE) AS desde,
           CASE WHEN au.fecha_vuelta_real IS NULL AND au.fecha_fin < CURRENT_DATE
                THEN CURRENT_DATE + 2
                ELSE au.fecha_fin
           END AS hasta
      FROM mias a
      JOIN ausencias au
        ON au.id = a.ausencia_id
       AND au.prestadora_id = a.prestadora_id
  ),
  turnos_guardia_del_ausente AS (
    SELECT am.id AS asignacion_id, g.id AS turno_guardia_id, g.fecha, g.paciente_id, g.prestadora_id,
           g.servicio_id
      FROM ausencias_mias am
      JOIN turnos_guardia g
        ON g.prestadora_id = am.prestadora_id
       AND g.asistente_id = am.titular_id
       AND g.estado = 'programada'
       AND g.fecha BETWEEN am.desde AND am.hasta
     WHERE EXISTS (
       SELECT 1 FROM coberturas_de_ausencia c
        WHERE c.ausencia_id = am.ausencia_id
          AND c.prestadora_id = am.prestadora_id
          AND c.asistente_sustituto_id = interno.asistente_de_la_sesion()
          AND c.aceptada_at IS NULL
          AND c.objetada_at IS NULL
          AND c.serie_id IS NOT DISTINCT FROM g.serie_id
     )
  ),
  reemplazos AS (
    SELECT am.id, am.asignado_at, 'ausencia'::text, NULL::uuid, NULL::uuid, am.ausencia_id,
           NULL::date, NULL::time, NULL::time, NULL::smallint, NULL::text, NULL::text[],
           am.desde, am.hasta,
           (SELECT count(*)::integer FROM turnos_guardia_del_ausente t WHERE t.asignacion_id = am.id),
           ARRAY(
             SELECT DISTINCT p.id
               FROM turnos_guardia_del_ausente t
               CROSS JOIN LATERAL (
                 SELECT gp.paciente_id AS id FROM turno_guardia_pacientes gp
                  WHERE gp.turno_guardia_id = t.turno_guardia_id AND gp.prestadora_id = t.prestadora_id
                 UNION
                 SELECT t.paciente_id WHERE t.paciente_id IS NOT NULL
               ) p
              WHERE t.asignacion_id = am.id
           ),
           am.desde, am.prestadora_id,
           ARRAY(SELECT DISTINCT t.servicio_id FROM turnos_guardia_del_ausente t WHERE t.asignacion_id = am.id)
      FROM ausencias_mias am
  ),
  todo AS (
    SELECT * FROM turnos_guardia_sueltos
    UNION ALL SELECT * FROM fijos
    UNION ALL SELECT * FROM reemplazos
  )
  SELECT x.id,
         x.asignado_at,
         x.tipo,
         x.turno_guardia_id,
         x.serie_id,
         x.ausencia_id,
         x.fecha,
         x.hora_inicio,
         x.hora_fin,
         x.dias_hasta_el_fin,
         x.modalidad,
         x.dias_semana,
         x.desde,
         x.hasta,
         x.cantidad,
         (SELECT array_agg(DISTINCT d.lugar ORDER BY d.lugar)
            FROM public.domicilios_de_pacientes_en(x.ids, x.dia_del_domicilio) d
           WHERE d.lugar IS NOT NULL),
         (SELECT array_agg(DISTINCT i.nivel_complejidad ORDER BY i.nivel_complejidad)
            FROM public.informacion_de_salud_del_paciente i
           WHERE i.paciente_id = ANY (x.ids)
             AND i.prestadora_id = x.prestadora_id
             AND i.nivel_complejidad IS NOT NULL),
         -- Distancia en línea recta sobre la Tierra (fórmula del semiverseno), en metros.
         (SELECT round(min(
                   2 * 6371000 * asin(sqrt(
                     power(sin(radians(d.lat - yo.lat) / 2), 2)
                     + cos(radians(yo.lat)) * cos(radians(d.lat))
                       * power(sin(radians(d.lng - yo.lng) / 2), 2)
                   ))
                 ))::integer
            FROM public.domicilios_de_pacientes_en(x.ids, x.dia_del_domicilio) d
            CROSS JOIN yo
           WHERE d.lat IS NOT NULL AND d.lng IS NOT NULL
             AND yo.lat IS NOT NULL AND yo.lng IS NOT NULL),
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
                    'id', ta.id, 'prestadora_id', ta.prestadora_id, 'clave', ta.clave,
                    'texto', ta.texto, 'descripcion', ta.descripcion)
                  ORDER BY ta.orden, ta.id)
             FROM (
               SELECT DISTINCT tt.id, tt.prestadora_id, tt.clave, tt.texto, tt.descripcion, tt.orden
                 FROM tareas_del_servicio ts
                 JOIN tareas_tipo_asistente tt ON tt.id = ts.tarea_id
                 CROSS JOIN yo
                WHERE ts.prestadora_id = x.prestadora_id
                  AND ts.servicio_id = ANY (x.servicios)
                  AND ts.tipo_asistente_id = yo.tipo_asistente_id
             ) ta
         ), '[]'::jsonb)
    FROM todo x
   ORDER BY x.asignado_at DESC
   LIMIT 50
$function$;
REVOKE ALL ON FUNCTION public.turnos_guardia_asignados_sin_responder() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.turnos_guardia_asignados_sin_responder() TO service_role;
GRANT EXECUTE ON FUNCTION public.turnos_guardia_asignados_sin_responder() TO authenticated;

-- 5b. Las demás se reemplazan con el cuerpo reescrito.
CREATE OR REPLACE FUNCTION interno.accesos_fuera_de_lo_normal_de(p_prestadora uuid, p_desde date, p_hasta date)
 RETURNS TABLE(consulta_id uuid, usuario_id uuid, persona text, paciente_id uuid, paciente text, categorias text[], momento timestamp with time zone, origen text, motivos text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  WITH configuracion AS (
    SELECT p.zona_horaria AS zona,
           p.registro_de_accesos_hora_de_inicio AS inicio,
           p.registro_de_accesos_hora_de_fin AS fin,
           p.registro_de_accesos_pacientes_por_dia AS tope,
           make_interval(hours => p.registro_de_accesos_horas_alrededor_del_turno_guardia) AS margen,
           p.registro_de_accesos_horas_alrededor_del_turno_guardia / 24 + 2 AS dias_de_margen
      FROM prestadoras p
     WHERE p.id = p_prestadora
  ),
  -- Las lecturas de personas en el período, con la hora del lugar.
  lecturas AS (
    SELECT c.id, c.usuario_id, c.paciente_id, c.categorias, c.momento, c.origen,
           (c.momento AT TIME ZONE k.zona) AS hora_local,
           k.inicio, k.fin, k.tope, k.margen
      FROM consultas_a_hce c
      CROSS JOIN configuracion k
     WHERE c.prestadora_id = p_prestadora
       AND c.usuario_id IS NOT NULL
       AND c.momento >= (p_desde::timestamp AT TIME ZONE k.zona)
       AND c.momento <  ((p_hasta + 1)::timestamp AT TIME ZONE k.zona)
  ),
  -- Las guardias que rodean el período, con su comienzo y su fin en hora del lugar. La que
  -- termina a una hora menor que la de comienzo cruza la medianoche.
  turnos_guardia_del_periodo AS (
    SELECT g.paciente_id, g.coordinador_id, a.usuario_id AS asistente_usuario_id,
           (g.fecha + g.hora_inicio) AS empieza,
           (g.fecha + g.hora_fin
             + CASE WHEN g.hora_fin <= g.hora_inicio THEN interval '1 day' ELSE interval '0' END) AS termina
      FROM turnos_guardia g
      CROSS JOIN configuracion k
      LEFT JOIN asistentes a ON a.id = g.asistente_id AND a.prestadora_id = g.prestadora_id
     WHERE g.prestadora_id = p_prestadora
       AND g.estado <> 'cancelada'
       AND g.fecha BETWEEN p_desde - k.dias_de_margen AND p_hasta + k.dias_de_margen
  ),
  -- Las personas que ese día leyeron más Pacientes distintos que el tope.
  volumen AS (
    SELECT l.usuario_id, l.hora_local::date AS dia
      FROM lecturas l
     GROUP BY l.usuario_id, l.hora_local::date
    HAVING count(DISTINCT l.paciente_id) > max(l.tope)
  ),
  marcadas AS (
    SELECT l.*,
           array_remove(ARRAY[
             CASE WHEN NOT (CASE WHEN l.inicio < l.fin
                                 THEN l.hora_local::time >= l.inicio AND l.hora_local::time < l.fin
                                 ELSE l.hora_local::time >= l.inicio OR l.hora_local::time < l.fin END)
                   AND NOT EXISTS (
                     SELECT 1 FROM turnos_guardia_del_periodo g
                      WHERE g.asistente_usuario_id = l.usuario_id
                        AND l.hora_local >= g.empieza AND l.hora_local < g.termina)
                  THEN 'fuera_del_horario' END,
             CASE WHEN NOT EXISTS (
                     SELECT 1 FROM turnos_guardia_del_periodo g
                      WHERE g.paciente_id = l.paciente_id
                        AND (g.asistente_usuario_id = l.usuario_id OR g.coordinador_id = l.usuario_id)
                        AND l.hora_local >= g.empieza - l.margen
                        AND l.hora_local <  g.termina + l.margen)
                   AND NOT EXISTS (
                     SELECT 1 FROM pacientes pa
                       JOIN servicios s ON s.prestadora_id = pa.prestadora_id
                                       AND s.cliente_id = pa.cliente_id
                      WHERE pa.id = l.paciente_id
                        AND pa.prestadora_id = p_prestadora
                        AND s.estado = 'vigente'
                        AND s.coordinador_id = l.usuario_id)
                  THEN 'sin_relacion_con_el_paciente' END,
             CASE WHEN EXISTS (
                     SELECT 1 FROM volumen v
                      WHERE v.usuario_id = l.usuario_id AND v.dia = l.hora_local::date)
                  THEN 'volumen_inusual' END
           ], NULL) AS motivos
      FROM lecturas l
  )
  SELECT m.id, m.usuario_id, u.nombre, m.paciente_id, pe.nombre_visible,
         m.categorias, m.momento, m.origen, m.motivos
    FROM marcadas m
    LEFT JOIN usuarios u ON u.id = m.usuario_id
    LEFT JOIN pacientes pa ON pa.id = m.paciente_id AND pa.prestadora_id = p_prestadora
    LEFT JOIN personas pe ON pe.id = pa.persona_id
   WHERE cardinality(m.motivos) > 0
   ORDER BY m.momento DESC;
$function$;

CREATE OR REPLACE FUNCTION interno.alarmas_a_la_vista_del_coordinador(p_tipo text)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
  v_llegaron uuid[];
  v_abiertas uuid[];
BEGIN
  IF v_prestadora IS NULL OR NOT interno.es_coordinador() THEN
    RETURN '{}';
  END IF;

  SELECT coalesce(array_agg(e.referencia_id), '{}') INTO v_llegaron
    FROM escalones_de_alarma_avisados e
   WHERE e.prestadora_id = v_prestadora
     AND e.tipo = p_tipo
     AND e.escalon = 'todos_los_coordinadores';

  IF p_tipo = 'alerta_temprana_turno_guardia' THEN
    SELECT coalesce(array_agg(x.id), '{}') INTO v_abiertas FROM alertas_tempranas_turno_guardia x
     WHERE x.id = ANY (v_llegaron) AND x.resuelto_at IS NULL;
  ELSIF p_tipo = 'incidente_relevo' THEN
    SELECT coalesce(array_agg(x.id), '{}') INTO v_abiertas FROM incidentes_relevo x
     WHERE x.id = ANY (v_llegaron) AND x.resuelto_at IS NULL;
  ELSIF p_tipo = 'incidente_turno_guardia_sin_cubrir' THEN
    SELECT coalesce(array_agg(x.id), '{}') INTO v_abiertas FROM incidentes_turno_guardia_sin_cubrir x
     WHERE x.id = ANY (v_llegaron) AND x.resuelto_at IS NULL;
  ELSIF p_tipo = 'emergencia_turno_guardia' THEN
    SELECT coalesce(array_agg(x.id), '{}') INTO v_abiertas FROM emergencias_turno_guardia x
     WHERE x.id = ANY (v_llegaron) AND x.atendida_at IS NULL;
  ELSIF p_tipo = 'turno_guardia_sin_cerrar' THEN
    SELECT coalesce(array_agg(x.id), '{}') INTO v_abiertas FROM turnos_guardia x
     WHERE x.id = ANY (v_llegaron) AND x.estado = 'activa';
  ELSE
    v_abiertas := '{}';
  END IF;

  RETURN v_abiertas || interno.alarmas_que_tengo_tomadas(p_tipo);
END;
$function$;

CREATE OR REPLACE FUNCTION interno.anotar_desde_cuando_se_controla_en_el_turno_guardia()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT NEW.control_de_ubicacion_en_el_turno_guardia THEN
    NEW.control_de_ubicacion_en_el_turno_guardia_desde := NULL;
  ELSIF TG_OP = 'INSERT' OR NOT OLD.control_de_ubicacion_en_el_turno_guardia THEN
    NEW.control_de_ubicacion_en_el_turno_guardia_desde := now();
  ELSE
    NEW.control_de_ubicacion_en_el_turno_guardia_desde := OLD.control_de_ubicacion_en_el_turno_guardia_desde;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION interno.asistentes_que_trabajan_con_el_coordinador()
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
  v_servicios uuid[];
  v_tomadas uuid[];
  v_asistentes uuid[];
BEGIN
  IF v_prestadora IS NULL OR NOT interno.es_coordinador() THEN
    RETURN '{}';
  END IF;

  SELECT coalesce(array_agg(s.id), '{}') INTO v_servicios
    FROM servicios s
   WHERE s.prestadora_id = v_prestadora
     AND s.coordinador_id = ANY (interno.coordinadores_que_represento());

  v_tomadas := interno.turnos_guardia_a_la_vista_por_una_alarma(true);

  SELECT coalesce(array_agg(DISTINCT x.asistente_id), '{}') INTO v_asistentes
    FROM (
      SELECT g.asistente_id
        FROM turnos_guardia g
       WHERE g.prestadora_id = v_prestadora
         AND g.asistente_id IS NOT NULL
         AND (g.servicio_id = ANY (v_servicios)
              OR g.id = ANY (v_tomadas)
              OR (g.servicio_id IS NULL
                  AND interno.coordinador_alcanza_el_turno_guardia_de(NULL, g.paciente_id, g.id)))
      UNION
      SELECT sg.asistente_id
        FROM series_turnos_guardia sg
       WHERE sg.prestadora_id = v_prestadora
         AND sg.asistente_id IS NOT NULL
         AND (sg.servicio_id = ANY (v_servicios)
              OR (sg.servicio_id IS NULL
                  AND interno.coordinador_alcanza_la_serie_de(NULL, sg.paciente_id, sg.id)))
      UNION
      SELECT t.asistente_id
        FROM asignaciones_de_turno_guardia t
        JOIN turnos_guardia g ON g.id = t.turno_guardia_id AND g.prestadora_id = t.prestadora_id
       WHERE t.prestadora_id = v_prestadora
         AND (g.servicio_id = ANY (v_servicios)
              OR g.id = ANY (v_tomadas)
              OR (g.servicio_id IS NULL
                  AND interno.coordinador_alcanza_el_turno_guardia_de(NULL, g.paciente_id, g.id)))
    ) x;

  RETURN v_asistentes;
END;
$function$;

CREATE OR REPLACE FUNCTION interno.atiende_al_paciente(p_paciente uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
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

         -- Quien la Prestadora sumó al equipo de uno de sus Servicios.
         OR EXISTS (
           SELECT 1
             FROM equipo_servicio e
             JOIN servicios s ON s.id = e.servicio_id
                             AND s.prestadora_id = e.prestadora_id
                             AND s.cliente_id = pac.cliente_id
                             AND s.estado = 'vigente'
            WHERE e.prestadora_id = yo.tenant
              AND e.situacion = 'sumada'
              AND (e.usuario_id = yo.uid
                   OR (yo.asistente IS NOT NULL AND e.asistente_id = yo.asistente))
         )

         -- Quien lo presta, guardia por guardia.
         OR EXISTS (
           SELECT 1
             FROM turnos_guardia g
             JOIN servicios s ON s.id = g.servicio_id
                             AND s.prestadora_id = g.prestadora_id
                             AND s.estado = 'vigente'
            WHERE g.prestadora_id = yo.tenant
              AND g.estado <> 'cancelada'
              AND yo.asistente IS NOT NULL
              AND g.asistente_id = yo.asistente
              AND (g.paciente_id = pac.id
                   OR EXISTS (SELECT 1 FROM turno_guardia_pacientes gp
                               WHERE gp.turno_guardia_id = g.id AND gp.paciente_id = pac.id))
         )

         -- Quien lo presta por una serie que sigue en pie.
         OR EXISTS (
           SELECT 1
             FROM series_turnos_guardia sg
             JOIN servicios s ON s.id = sg.servicio_id
                             AND s.prestadora_id = sg.prestadora_id
                             AND s.estado = 'vigente'
            WHERE sg.prestadora_id = yo.tenant
              AND sg.estado <> 'cancelada'
              AND yo.asistente IS NOT NULL
              AND sg.asistente_id = yo.asistente
              AND (sg.paciente_id = pac.id
                   OR EXISTS (SELECT 1 FROM series_turnos_guardia_pacientes sp
                               WHERE sp.serie_id = sg.id AND sp.paciente_id = pac.id))
         )

         -- Quien tiene tomada una alarma de una de sus guardias, mientras la tenga.
         OR EXISTS (
           SELECT 1
             FROM turnos_guardia g
            WHERE g.prestadora_id = yo.tenant
              AND g.id = ANY (interno.turnos_guardia_a_la_vista_por_una_alarma(true))
              AND (g.paciente_id = pac.id
                   OR EXISTS (SELECT 1 FROM turno_guardia_pacientes gp
                               WHERE gp.turno_guardia_id = g.id AND gp.paciente_id = pac.id))
         )
       )
  )
$function$;

CREATE OR REPLACE FUNCTION interno.condicion_del_pedido(p_tabla text, p_alias text, p_filtros jsonb, p_union text DEFAULT 'AND'::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  e        jsonb;
  v_partes text[] := '{}';
  v_col    text;
  v_op     text;
  v_valor  text;
BEGIN
  IF p_union NOT IN ('AND', 'OR') OR p_alias NOT IN ('t', 'g') THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_filtros IS NULL OR p_filtros = 'null'::jsonb THEN
    RETURN 'true';
  END IF;
  IF jsonb_typeof(p_filtros) <> 'array' THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = '22023';
  END IF;

  FOR e IN SELECT x FROM jsonb_array_elements(p_filtros) x LOOP
    IF jsonb_typeof(e) <> 'object' THEN
      RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = '22023';
    END IF;

    IF e ? 'o' THEN
      v_partes := v_partes || ('(' || interno.condicion_del_pedido(p_tabla, p_alias, e -> 'o', 'OR') || ')');
    ELSIF e ? 'y' THEN
      v_partes := v_partes || ('(' || interno.condicion_del_pedido(p_tabla, p_alias, e -> 'y', 'AND') || ')');
    ELSIF e ? 'turno_guardia' THEN
      -- Una condición sobre la guardia de la fila. La guardia se lee con los permisos de quien
      -- pide, como cualquier otra lectura suya.
      IF p_alias <> 't' THEN
        RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = '22023';
      END IF;
      PERFORM interno.columna_del_pedido(p_tabla, 'turno_guardia_id');
      v_partes := v_partes || format(
        'EXISTS (SELECT 1 FROM public.turnos_guardia g WHERE g.id = t.turno_guardia_id AND %s)',
        interno.condicion_del_pedido('turnos_guardia', 'g', e -> 'turno_guardia', 'AND'));
    ELSE
      v_col := interno.columna_del_pedido(p_tabla, e ->> 'columna');
      v_op := e ->> 'op';
      v_valor := format('(jsonb_populate_record(NULL::public.%I, %L::jsonb)).%I',
                        p_tabla, jsonb_build_object(v_col, e -> 'valor'), v_col);
      v_partes := v_partes || CASE v_op
        WHEN 'eq'       THEN format('%I.%I = %s',  p_alias, v_col, v_valor)
        WHEN 'neq'      THEN format('%I.%I <> %s', p_alias, v_col, v_valor)
        WHEN 'gt'       THEN format('%I.%I > %s',  p_alias, v_col, v_valor)
        WHEN 'gte'      THEN format('%I.%I >= %s', p_alias, v_col, v_valor)
        WHEN 'lt'       THEN format('%I.%I < %s',  p_alias, v_col, v_valor)
        WHEN 'lte'      THEN format('%I.%I <= %s', p_alias, v_col, v_valor)
        WHEN 'is_null'  THEN format('%I.%I IS NULL', p_alias, v_col)
        WHEN 'not_null' THEN format('%I.%I IS NOT NULL', p_alias, v_col)
        WHEN 'in'       THEN format(
          '%I.%I = ANY (ARRAY(SELECT (jsonb_populate_record(NULL::public.%I, jsonb_build_object(%L, x))).%I FROM jsonb_array_elements(%L::jsonb) x))',
          p_alias, v_col, p_tabla, v_col, v_col,
          CASE WHEN jsonb_typeof(e -> 'valor') = 'array' THEN e -> 'valor' END)
      END;
      IF v_partes[cardinality(v_partes)] IS NULL THEN
        RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  IF cardinality(v_partes) = 0 THEN
    RETURN CASE WHEN p_union = 'OR' THEN 'false' ELSE 'true' END;
  END IF;
  RETURN array_to_string(v_partes, ' ' || p_union || ' ');
END;
$function$;

CREATE OR REPLACE FUNCTION interno.coordinador_alcanza_turno_guardia(p_asistente_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT p_asistente_id IS NULL
      OR interno.coordinador_alcanza_asistente(p_asistente_id);
$function$;

COMMENT ON FUNCTION interno.coordinador_alcanza_turno_guardia(p_asistente_id uuid) IS 'Si un Coordinador alcanza lo que pasa por ese Asistente: comparte zona con él, o no hay Asistente todavía. La usan las políticas de turnos de guardia y de series_turnos_guardia, y es el único lugar donde está escrita esa regla.';
CREATE OR REPLACE FUNCTION interno.coordinador_alcanza_la_serie_de(p_servicio uuid, p_paciente uuid, p_serie uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT CASE
    WHEN p_servicio IS NOT NULL THEN interno.coordina_el_servicio(p_servicio)
    ELSE (p_paciente IS NOT NULL AND interno.coordinador_ve_al_paciente(p_paciente))
      OR EXISTS (SELECT 1 FROM series_turnos_guardia_pacientes sp
                  WHERE sp.serie_id = p_serie
                    AND interno.coordinador_ve_al_paciente(sp.paciente_id))
  END;
$function$;

CREATE OR REPLACE FUNCTION interno.coordinador_tiene_una_emergencia_abierta()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
BEGIN
  IF v_prestadora IS NULL OR NOT interno.es_coordinador() THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
           SELECT 1 FROM emergencias_turno_guardia e
             JOIN turnos_guardia g ON g.id = e.turno_guardia_id AND g.prestadora_id = e.prestadora_id
            WHERE e.prestadora_id = v_prestadora
              AND e.atendida_at IS NULL
              AND (e.id = ANY (interno.alarmas_a_la_vista_del_coordinador('emergencia_turno_guardia'))
                   OR interno.coordinador_alcanza_el_turno_guardia_de(g.servicio_id, g.paciente_id, g.id)))
      OR EXISTS (
           SELECT 1 FROM incidentes_turno_guardia_sin_cubrir i
             JOIN turnos_guardia g ON g.id = i.turno_guardia_id AND g.prestadora_id = i.prestadora_id
            WHERE i.prestadora_id = v_prestadora
              AND i.resuelto_at IS NULL
              AND (i.id = ANY (interno.alarmas_a_la_vista_del_coordinador('incidente_turno_guardia_sin_cubrir'))
                   OR interno.coordinador_alcanza_el_turno_guardia_de(g.servicio_id, g.paciente_id, g.id)))
      OR EXISTS (
           SELECT 1 FROM alertas_tempranas_turno_guardia a
             JOIN turnos_guardia g ON g.id = a.turno_guardia_id AND g.prestadora_id = a.prestadora_id
            WHERE a.prestadora_id = v_prestadora
              AND a.resuelto_at IS NULL
              AND (a.id = ANY (interno.alarmas_a_la_vista_del_coordinador('alerta_temprana_turno_guardia'))
                   OR interno.coordinador_alcanza_el_turno_guardia_de(g.servicio_id, g.paciente_id, g.id)));
END;
$function$;

CREATE OR REPLACE FUNCTION interno.coordinador_ve_la_serie(p_serie uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT p_serie IS NOT NULL
     AND interno.es_coordinador()
     AND EXISTS (
       SELECT 1 FROM series_turnos_guardia sg
        WHERE sg.id = p_serie
          AND sg.prestadora_id = interno.prestadora_actual()
          AND interno.coordinador_alcanza_la_serie_de(sg.servicio_id, sg.paciente_id, sg.id)
     );
$function$;

CREATE OR REPLACE FUNCTION interno.crear_y_cerrar_servicios_lo_hace_quien_puede()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_cambia_estado boolean := TG_OP = 'UPDATE' AND NEW.estado IS DISTINCT FROM OLD.estado;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF (TG_OP = 'INSERT' OR v_cambia_estado)
     AND NOT (interno.es_admin_prestadora()
              OR interno.es_superadmin()
              OR interno.tiene_permiso('gestionar_servicios')) THEN
    RAISE EXCEPTION 'crear_y_cerrar_servicios_lo_hace_quien_puede';
  END IF;

  -- Una persona cambia el estado sólo por las dos funciones, que dejan el registro.
  IF v_cambia_estado
     AND COALESCE(current_setting('careonys.cambio_de_estado_del_servicio', true), '') <> NEW.id::text THEN
    RAISE EXCEPTION 'el_estado_del_servicio_cambia_por_la_baja_o_la_reactivacion';
  END IF;

  IF v_cambia_estado AND NEW.estado = 'de_baja'
     AND interno.turnos_guardia_asignados_del_servicio(NEW.id) > 0 THEN
    RAISE EXCEPTION 'el_servicio_tiene_turnos_guardia_asignados';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION interno.dia_en_que_termina_turno_guardia(p_fecha date, p_hora_inicio time without time zone, p_hora_fin time without time zone, p_dias_hasta_el_fin smallint DEFAULT NULL::smallint)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
           -- Duración escrita: manda, y es el caso de toda guardia cargada de acá en adelante.
           WHEN p_dias_hasta_el_fin IS NOT NULL THEN p_fecha + p_dias_hasta_el_fin
           WHEN p_hora_fin IS NULL OR p_hora_inicio IS NULL THEN p_fecha
           -- Sin duración escrita se cae en la regla vieja, que sólo sabe de la guardia de noche.
           WHEN p_hora_fin <= p_hora_inicio THEN p_fecha + 1
           ELSE p_fecha
         END;
$function$;

CREATE OR REPLACE FUNCTION interno.documentos_que_bloquean(p_asistente_id uuid, p_dia date, p_paciente_id uuid DEFAULT NULL::uuid, p_servicio_id uuid DEFAULT NULL::uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prestadora_id uuid;
  v_tipo_id       uuid;
  v_tipo          record;
  v_hasta         date;
  v_vencio        date;
  v_bloquean      text[] := ARRAY[]::text[];
BEGIN
  IF p_asistente_id IS NULL THEN
    RETURN v_bloquean;
  END IF;

  SELECT a.prestadora_id, a.tipo_asistente_id INTO v_prestadora_id, v_tipo_id
    FROM public.asistentes a
   WHERE a.id = p_asistente_id;

  IF COALESCE(auth.jwt() ->> 'role', '') NOT IN ('', 'service_role')
     AND v_prestadora_id IS DISTINCT FROM interno.prestadora_actual() THEN
    RAISE EXCEPTION 'El Asistente no pertenece a la Prestadora de quien pregunta'
      USING ERRCODE = '42501';
  END IF;

  IF v_tipo_id IS NULL THEN
    RETURN v_bloquean;
  END IF;

  FOR v_tipo IN
    SELECT t.id, t.nombre
      FROM public.tipos_documento_asistente t
      JOIN public.tipos_documento_por_tipo_asistente r ON r.tipo_documento_id = t.id
     WHERE t.prestadora_id = v_prestadora_id
       AND t.activo
       AND t.impide_trabajar
       AND r.tipo_asistente_id = v_tipo_id
     ORDER BY t.nombre
  LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.documentos_asistente d
       WHERE d.asistente_id = p_asistente_id
         AND d.tipo_documento_id = v_tipo.id
         AND d.estado = 'aprobado'
         AND (d.fecha_vencimiento IS NULL OR d.fecha_vencimiento >= p_dia));

    v_hasta := interno.gracia_hasta(p_asistente_id, v_tipo.id, p_dia);

    IF v_hasta IS NOT NULL AND v_hasta >= p_dia THEN
      SELECT max(d.fecha_vencimiento) INTO v_vencio
        FROM public.documentos_asistente d
       WHERE d.asistente_id = p_asistente_id
         AND d.tipo_documento_id = v_tipo.id
         AND d.estado = 'aprobado'
         AND d.fecha_vencimiento < p_dia;

      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.turnos_guardia g
         WHERE g.asistente_id = p_asistente_id
           AND g.fecha <= v_vencio
           AND g.estado <> 'cancelada'
           AND (g.paciente_id = p_paciente_id OR g.servicio_id = p_servicio_id))
      OR EXISTS (
        SELECT 1 FROM public.series_turnos_guardia s
         WHERE s.asistente_id = p_asistente_id
           AND s.estado = 'activa'
           AND s.paciente_id = p_paciente_id);
    END IF;

    v_bloquean := v_bloquean || v_tipo.nombre;
  END LOOP;

  RETURN v_bloquean;
END;
$function$;

CREATE OR REPLACE FUNCTION interno.el_asistente_marca_solo_su_turno_guardia()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_suyas constant text[] := ARRAY[
    'salida_checkin_at', 'salida_lat', 'salida_lng', 'medio_transporte',
    'checkin_at', 'checkin_lat', 'checkin_lng',
    'checkout_at', 'checkout_lat', 'checkout_lng',
    'estado',
    'ubicacion_actual_lat', 'ubicacion_actual_lng', 'ubicacion_actual_at',
    'push_llegada_enviado_at', 'push_reporte_enviado_at'
  ];
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF interno.es_personal_de_la_prestadora() THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - v_suyas) IS DISTINCT FROM (to_jsonb(OLD) - v_suyas) THEN
    RAISE EXCEPTION 'la_persona_cambia_solo_lo_suyo' USING ERRCODE = '42501';
  END IF;

  -- La salida, la llegada y el cierre: se marcan una vez, con todo lo suyo, y no se reescriben.
  IF (NEW.salida_checkin_at, NEW.salida_lat, NEW.salida_lng, NEW.medio_transporte)
       IS DISTINCT FROM (OLD.salida_checkin_at, OLD.salida_lat, OLD.salida_lng, OLD.medio_transporte)
     AND (OLD.salida_checkin_at IS NOT NULL OR NEW.salida_checkin_at IS NULL) THEN
    RAISE EXCEPTION 'la_persona_cambia_solo_lo_suyo' USING ERRCODE = '42501';
  END IF;
  IF (NEW.checkin_at, NEW.checkin_lat, NEW.checkin_lng)
       IS DISTINCT FROM (OLD.checkin_at, OLD.checkin_lat, OLD.checkin_lng)
     AND (OLD.checkin_at IS NOT NULL OR NEW.checkin_at IS NULL OR NEW.estado IS DISTINCT FROM 'activa') THEN
    RAISE EXCEPTION 'la_persona_cambia_solo_lo_suyo' USING ERRCODE = '42501';
  END IF;
  IF (NEW.checkout_at, NEW.checkout_lat, NEW.checkout_lng)
       IS DISTINCT FROM (OLD.checkout_at, OLD.checkout_lat, OLD.checkout_lng)
     AND (OLD.checkout_at IS NOT NULL OR NEW.checkout_at IS NULL OR NEW.estado IS DISTINCT FROM 'completada') THEN
    RAISE EXCEPTION 'la_persona_cambia_solo_lo_suyo' USING ERRCODE = '42501';
  END IF;

  -- El estado: a empezada al llegar, desde una guardia que todavía no empezó y no se canceló; a
  -- terminada al cerrar, desde una empezada. Ningún otro cambio es del Asistente.
  IF NEW.estado IS DISTINCT FROM OLD.estado
     AND NOT (
       (NEW.estado = 'activa' AND OLD.estado IN ('programada', 'ausente', 'pausada')
          AND OLD.checkin_at IS NULL AND NEW.checkin_at IS NOT NULL)
       OR
       (NEW.estado = 'completada' AND OLD.estado = 'activa'
          AND OLD.checkout_at IS NULL AND NEW.checkout_at IS NOT NULL)
     ) THEN
    RAISE EXCEPTION 'la_persona_cambia_solo_lo_suyo' USING ERRCODE = '42501';
  END IF;

  -- Los avisos ya mandados no se desmarcan: desmarcarlos los volvería a mandar.
  IF (OLD.push_llegada_enviado_at IS NOT NULL AND NEW.push_llegada_enviado_at IS DISTINCT FROM OLD.push_llegada_enviado_at)
     OR (OLD.push_reporte_enviado_at IS NOT NULL AND NEW.push_reporte_enviado_at IS DISTINCT FROM OLD.push_reporte_enviado_at) THEN
    RAISE EXCEPTION 'la_persona_cambia_solo_lo_suyo' USING ERRCODE = '42501';
  END IF;

  -- La hora de cada marca es la de la base, no la que mande el teléfono.
  IF NEW.salida_checkin_at IS DISTINCT FROM OLD.salida_checkin_at THEN NEW.salida_checkin_at := now(); END IF;
  IF NEW.checkin_at IS DISTINCT FROM OLD.checkin_at THEN NEW.checkin_at := now(); END IF;
  IF NEW.checkout_at IS DISTINCT FROM OLD.checkout_at THEN NEW.checkout_at := now(); END IF;
  IF NEW.ubicacion_actual_at IS NOT NULL AND NEW.ubicacion_actual_at IS DISTINCT FROM OLD.ubicacion_actual_at THEN
    NEW.ubicacion_actual_at := now();
  END IF;
  IF NEW.push_llegada_enviado_at IS DISTINCT FROM OLD.push_llegada_enviado_at THEN NEW.push_llegada_enviado_at := now(); END IF;
  IF NEW.push_reporte_enviado_at IS DISTINCT FROM OLD.push_reporte_enviado_at THEN NEW.push_reporte_enviado_at := now(); END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION interno.el_relevo_se_resuelve_como_paso()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_asistente_del_turno_guardia uuid;
  v_llego_tarde boolean;
BEGIN
  -- Ya resuelto: queda como quedó.
  IF OLD.resuelto_at IS NOT NULL THEN
    NEW.resuelto_at := OLD.resuelto_at;
    NEW.resuelto_por_tipo := OLD.resuelto_por_tipo;
    NEW.resuelto_por_id := OLD.resuelto_por_id;
    NEW.resuelto_por_usuario := OLD.resuelto_por_usuario;
    RETURN NEW;
  END IF;

  IF NEW.resuelto_at IS NULL THEN
    NEW.resuelto_por_tipo := NULL;
    NEW.resuelto_por_id := NULL;
    NEW.resuelto_por_usuario := NULL;
    RETURN NEW;
  END IF;

  NEW.resuelto_por_usuario := interno.usuario_de_la_sesion();

  IF NEW.resuelto_por_id IS NOT NULL THEN
    SELECT g.asistente_id, g.llegada_tarde INTO v_asistente_del_turno_guardia, v_llego_tarde
      FROM turnos_guardia g
     WHERE g.id = NEW.turno_guardia_entrante_id
       AND g.prestadora_id = NEW.prestadora_id;
    IF v_asistente_del_turno_guardia IS DISTINCT FROM NEW.resuelto_por_id THEN
      RAISE EXCEPTION 'relevo_con_otro_asistente' USING ERRCODE = '23514';
    END IF;

    -- Es el titular sólo si marcó la llegada sobre la guardia ausente: quien la cubre entra sobre
    -- una guardia que la reasignación ya volvió a programada, así que nunca llega tarde por esto.
    IF NEW.resuelto_por_tipo = 'titular' THEN
      IF NOT coalesce(v_llego_tarde, false) THEN
        RAISE EXCEPTION 'relevo_con_otro_asistente' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END IF;

    NEW.resuelto_por_tipo := coalesce(
      (SELECT pe.tipo
         FROM personal_emergencia pe
        WHERE pe.asistente_id = NEW.resuelto_por_id
          AND pe.prestadora_id = NEW.prestadora_id
          AND pe.activo
        ORDER BY (pe.tipo = 'franquero') DESC
        LIMIT 1),
      'suplente');
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION interno.exigir_documentos_en_asignacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_bloquean text[];
  v_dia      date;
  v_paciente uuid;
  v_servicio uuid;
BEGIN
  IF NOT (TG_OP = 'INSERT'
          OR (NEW.estado = 'aceptada' AND OLD.estado IS DISTINCT FROM 'aceptada')) THEN
    RETURN NEW;
  END IF;

  IF NEW.turno_guardia_id IS NOT NULL THEN
    IF interno.hay_excepcion_por_documentos(NEW.turno_guardia_id, NEW.asistente_id) THEN
      RETURN NEW;
    END IF;

    SELECT interno.dia_en_que_termina_turno_guardia(g.fecha, g.hora_inicio, g.hora_fin, g.dias_hasta_el_fin),
           g.paciente_id, g.servicio_id
      INTO v_dia, v_paciente, v_servicio
      FROM public.turnos_guardia g
     WHERE g.id = NEW.turno_guardia_id;
  ELSIF NEW.serie_id IS NOT NULL THEN
    SELECT GREATEST(s.vigente_desde, CURRENT_DATE), s.paciente_id, s.servicio_id
      INTO v_dia, v_paciente, v_servicio
      FROM public.series_turnos_guardia s
     WHERE s.id = NEW.serie_id;
  END IF;

  v_bloquean := interno.documentos_que_bloquean(NEW.asistente_id, COALESCE(v_dia, CURRENT_DATE), v_paciente, v_servicio);

  IF cardinality(v_bloquean) > 0 THEN
    RAISE EXCEPTION 'documentos_bloquean:%:', array_to_string(v_bloquean, ', ')
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION interno.exigir_documentos_en_turno_guardia()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_bloquean text[];
BEGIN
  IF NEW.asistente_id IS NULL
     OR (TG_OP = 'UPDATE' AND NEW.asistente_id IS NOT DISTINCT FROM OLD.asistente_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND interno.hay_excepcion_por_documentos(NEW.id, NEW.asistente_id) THEN
    RETURN NEW;
  END IF;

  v_bloquean := interno.documentos_que_bloquean(
    NEW.asistente_id,
    interno.dia_en_que_termina_turno_guardia(NEW.fecha, NEW.hora_inicio, NEW.hora_fin, NEW.dias_hasta_el_fin),
    NEW.paciente_id,
    NEW.servicio_id
  );

  IF cardinality(v_bloquean) > 0 THEN
    RAISE EXCEPTION 'documentos_bloquean:%:', array_to_string(v_bloquean, ', ')
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION interno.exigir_final_del_catalogo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_pide_detalle boolean;
BEGIN
  -- Un expediente abierto no tiene final, y eso es lo normal: se abre sin él.
  IF NEW.resuelto_como IS NULL THEN
    RETURN NEW;
  END IF;

  -- Lo ya escrito no se revisa. Los expedientes cerrados antes de que existiera el catálogo
  -- guardan finales que no están en él, y tocarles cualquier otra columna no es motivo para
  -- rechazarlos.
  IF TG_OP = 'UPDATE' AND OLD.resuelto_como IS NOT DISTINCT FROM NEW.resuelto_como THEN
    RETURN NEW;
  END IF;

  SELECT f.pide_detalle INTO v_pide_detalle
  FROM finales_turno_guardia_sin_cubrir f
  WHERE f.prestadora_id = NEW.prestadora_id
    AND f.activo
    AND coalesce(f.clave, f.nombre) = NEW.resuelto_como
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'final_de_turno_guardia_inexistente:%', NEW.resuelto_como;
  END IF;

  IF v_pide_detalle AND coalesce(btrim(NEW.resuelto_detalle), '') = '' THEN
    RAISE EXCEPTION 'final_de_turno_guardia_pide_detalle:%', NEW.resuelto_como;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION interno.exigir_motivo_de_sustitucion_del_catalogo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_pide_detalle boolean;
BEGIN
  -- Sin causa cargada no hay nada que controlar. Es el caso de las coberturas viejas, que se
  -- anotaron cuando este catálogo no existía y no se reescriben.
  IF NEW.motivo IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT m.pide_detalle INTO v_pide_detalle
  FROM motivos_sustitucion_turno_guardia m
  WHERE m.prestadora_id = NEW.prestadora_id
    AND m.activo
    AND coalesce(m.clave, m.nombre) = NEW.motivo
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'motivo_de_sustitucion_inexistente:%', NEW.motivo;
  END IF;

  IF v_pide_detalle AND coalesce(btrim(NEW.motivo_detalle), '') = '' THEN
    RAISE EXCEPTION 'motivo_de_sustitucion_pide_detalle:%', NEW.motivo;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION interno.falta_la_firma_del_pagador(p_servicio uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM servicios s
      JOIN prestadoras p ON p.id = s.prestadora_id
     WHERE s.id = p_servicio
       AND p.turnos_guardia_solo_con_firma_del_pagador
  ) AND NOT interno.firma_del_pagador_vigente(p_servicio);
$function$;

CREATE OR REPLACE FUNCTION interno.fn_modalidad_en_asignacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_modalidad text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.turno_guardia_id IS NOT NULL THEN
    SELECT g.canal_modalidad INTO v_modalidad
      FROM public.turnos_guardia g
     WHERE g.id = NEW.turno_guardia_id;
  ELSIF NEW.serie_id IS NOT NULL THEN
    SELECT s.canal_modalidad INTO v_modalidad
      FROM public.series_turnos_guardia s
     WHERE s.id = NEW.serie_id;
  END IF;

  IF v_modalidad IS NOT NULL
     AND NOT interno.asistente_trabaja_en_modalidad(NEW.asistente_id, v_modalidad) THEN
    RAISE EXCEPTION 'modalidad_bloquea:%:', v_modalidad
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION interno.turno_guardia_empezado_no_cambia_de_asistente()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF NEW.asistente_id IS NOT DISTINCT FROM OLD.asistente_id
     AND NEW.fecha IS NOT DISTINCT FROM OLD.fecha
     AND NEW.hora_inicio IS NOT DISTINCT FROM OLD.hora_inicio
     AND NEW.hora_fin IS NOT DISTINCT FROM OLD.hora_fin THEN
    RETURN NEW;
  END IF;

  -- Todavía no empezó.
  IF COALESCE(OLD.checkin_at, NEW.checkin_at) IS NULL
     AND OLD.estado IN ('programada', 'pausada', 'cancelada') THEN
    RETURN NEW;
  END IF;

  -- La emergencia: la guardia ausente que está cubriendo la función, y sólo su Asistente.
  IF current_setting('careonys.reasignacion_por_emergencia', true) = OLD.id::text
     AND OLD.estado = 'ausente'
     AND OLD.checkin_at IS NULL
     AND NEW.checkin_at IS NULL
     AND NEW.asistente_id IS NOT NULL
     AND NEW.fecha IS NOT DISTINCT FROM OLD.fecha
     AND NEW.hora_inicio IS NOT DISTINCT FROM OLD.hora_inicio
     AND NEW.hora_fin IS NOT DISTINCT FROM OLD.hora_fin THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'turno_guardia_empezado_no_cambia_de_asistente' USING ERRCODE = '23514';
END;
$function$;

CREATE OR REPLACE FUNCTION interno.turno_guardia_empezado_no_cambia_de_paciente()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF OLD.paciente_id IS NOT NULL
     AND NEW.paciente_id IS DISTINCT FROM OLD.paciente_id
     AND COALESCE(OLD.checkin_at, NEW.checkin_at) IS NOT NULL THEN
    RAISE EXCEPTION 'turno_guardia_empezado_no_cambia_de_paciente' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION interno.turno_guardia_empezado_no_pierde_pacientes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_checkin timestamptz;
  v_existe boolean;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.turno_guardia_id = OLD.turno_guardia_id
     AND NEW.paciente_id = OLD.paciente_id THEN
    RETURN NEW;
  END IF;

  SELECT true, g.checkin_at
    INTO v_existe, v_checkin
    FROM turnos_guardia g
   WHERE g.id = OLD.turno_guardia_id;

  IF v_existe IS NULL THEN
    -- La guardia ya no está: es el borrado en cascada de la guardia entera.
    IF pg_trigger_depth() > 1 THEN
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;
    -- Una guardia que no se pudo leer no se da por no empezada.
    RAISE EXCEPTION 'turno_guardia_empezado_no_cambia_de_paciente' USING ERRCODE = '23514';
  END IF;

  IF v_checkin IS NOT NULL THEN
    RAISE EXCEPTION 'turno_guardia_empezado_no_cambia_de_paciente' USING ERRCODE = '23514';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

CREATE OR REPLACE FUNCTION interno.turnos_guardia_a_la_vista_por_una_alarma(p_solo_las_tomadas boolean)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_tipo text;
  v_turnos_guardia uuid[] := '{}';
  v_referencias uuid[];
BEGIN
  IF NOT interno.es_coordinador() THEN
    RETURN '{}';
  END IF;
  FOREACH v_tipo IN ARRAY ARRAY['alerta_temprana_turno_guardia', 'incidente_relevo', 'turno_guardia_sin_cerrar',
                                'incidente_turno_guardia_sin_cubrir', 'emergencia_turno_guardia'] LOOP
    v_referencias := CASE WHEN p_solo_las_tomadas THEN interno.alarmas_que_tengo_tomadas(v_tipo)
                          ELSE interno.alarmas_a_la_vista_del_coordinador(v_tipo) END;
    IF cardinality(v_referencias) > 0 THEN
      v_turnos_guardia := v_turnos_guardia || ARRAY(SELECT interno.turnos_guardia_de_las_alarmas(v_tipo, v_referencias));
    END IF;
  END LOOP;
  RETURN v_turnos_guardia;
END;
$function$;

CREATE OR REPLACE FUNCTION interno.turnos_guardia_asignados_del_servicio(p_servicio uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT (
    (SELECT count(*) FROM turnos_guardia g
      WHERE g.servicio_id = p_servicio
        AND g.prestadora_id = interno.prestadora_actual()
        AND g.asistente_id IS NOT NULL
        AND g.estado IN ('programada', 'activa', 'pausada'))
    +
    (SELECT count(*) FROM series_turnos_guardia sg
      WHERE sg.servicio_id = p_servicio
        AND sg.prestadora_id = interno.prestadora_actual()
        AND sg.asistente_id IS NOT NULL
        AND sg.estado = 'activa')
  )::integer;
$function$;

CREATE OR REPLACE FUNCTION interno.turnos_guardia_de_las_alarmas(p_tipo text, p_referencias uuid[])
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF p_tipo = 'alerta_temprana_turno_guardia' THEN
    RETURN QUERY SELECT x.turno_guardia_id FROM alertas_tempranas_turno_guardia x WHERE x.id = ANY (p_referencias);
  ELSIF p_tipo = 'incidente_relevo' THEN
    RETURN QUERY SELECT x.turno_guardia_entrante_id FROM incidentes_relevo x
                  WHERE x.id = ANY (p_referencias) AND x.turno_guardia_entrante_id IS NOT NULL
                 UNION
                 SELECT x.turno_guardia_saliente_id FROM incidentes_relevo x
                  WHERE x.id = ANY (p_referencias) AND x.turno_guardia_saliente_id IS NOT NULL;
  ELSIF p_tipo = 'incidente_turno_guardia_sin_cubrir' THEN
    RETURN QUERY SELECT x.turno_guardia_id FROM incidentes_turno_guardia_sin_cubrir x WHERE x.id = ANY (p_referencias);
  ELSIF p_tipo = 'emergencia_turno_guardia' THEN
    RETURN QUERY SELECT x.turno_guardia_id FROM emergencias_turno_guardia x WHERE x.id = ANY (p_referencias);
  ELSIF p_tipo = 'turno_guardia_sin_cerrar' THEN
    RETURN QUERY SELECT unnest(p_referencias);
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION interno.turnos_guardia_del_paciente(p_paciente_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT turno_guardia_id FROM turno_guardia_pacientes WHERE paciente_id = p_paciente_id
$function$;

COMMENT ON FUNCTION interno.turnos_guardia_del_paciente(p_paciente_id uuid) IS 'En qué turnos de guardia aparece un Paciente. Punto único de verdad de las reglas de acceso.';
CREATE OR REPLACE FUNCTION interno.la_alarma_esta_a_la_vista(p_tipo text, p_referencia uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_tabla text := CASE p_tipo
    WHEN 'alerta_temprana_turno_guardia' THEN 'alertas_tempranas_turno_guardia'
    WHEN 'incidente_relevo' THEN 'incidentes_relevo'
    WHEN 'incidente_turno_guardia_sin_cubrir' THEN 'incidentes_turno_guardia_sin_cubrir'
    WHEN 'emergencia_turno_guardia' THEN 'emergencias_turno_guardia'
    WHEN 'turno_guardia_sin_cerrar' THEN 'turnos_guardia'
  END;
  v_antes text := coalesce(current_setting('careonys.lectura_de_salud', true), '');
  v_la_ve boolean;
BEGIN
  IF v_tabla IS NULL OR p_referencia IS NULL THEN
    RETURN false;
  END IF;
  IF v_tabla = 'emergencias_turno_guardia' THEN
    PERFORM set_config('careonys.lectura_de_salud', 'anotada', true);
  END IF;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1)', v_tabla) INTO v_la_ve USING p_referencia;
  IF v_tabla = 'emergencias_turno_guardia' THEN
    PERFORM set_config('careonys.lectura_de_salud', v_antes, true);
  END IF;
  RETURN coalesce(v_la_ve, false);
END;
$function$;

CREATE OR REPLACE FUNCTION interno.la_alarma_la_resuelve_quien_la_tomo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_tipo text;
  v_resuelve boolean;
  v_actor uuid := interno.usuario_de_la_sesion();
  v_quien uuid;
  v_asistente uuid;
BEGIN
  IF TG_TABLE_NAME = 'alertas_tempranas_turno_guardia' THEN
    v_tipo := 'alerta_temprana_turno_guardia';
    v_resuelve := OLD.resuelto_at IS NULL AND NEW.resuelto_at IS NOT NULL;
  ELSIF TG_TABLE_NAME = 'incidentes_relevo' THEN
    v_tipo := 'incidente_relevo';
    v_resuelve := OLD.resuelto_at IS NULL AND NEW.resuelto_at IS NOT NULL;
  ELSIF TG_TABLE_NAME = 'incidentes_turno_guardia_sin_cubrir' THEN
    v_tipo := 'incidente_turno_guardia_sin_cubrir';
    v_resuelve := OLD.resuelto_at IS NULL AND NEW.resuelto_at IS NOT NULL;
  ELSIF TG_TABLE_NAME = 'emergencias_turno_guardia' THEN
    v_tipo := 'emergencia_turno_guardia';
    v_resuelve := OLD.atendida_at IS NULL AND NEW.atendida_at IS NOT NULL;
    v_actor := coalesce(v_actor, NEW.atendida_por);
  ELSIF TG_TABLE_NAME = 'turnos_guardia' THEN
    v_tipo := 'turno_guardia_sin_cerrar';
    v_resuelve := OLD.estado = 'activa' AND NEW.estado IS DISTINCT FROM 'activa';
  END IF;

  IF NOT coalesce(v_resuelve, false) OR v_actor IS NULL OR NOT interno.es_usuario_del_panel(v_actor) THEN
    RETURN NEW;
  END IF;

  v_quien := interno.quien_tiene_la_alarma(NEW.prestadora_id, v_tipo, NEW.id);
  IF v_quien IS NOT NULL AND v_quien <> v_actor THEN
    RAISE EXCEPTION 'alarma_tomada_por_otra_persona' USING ERRCODE = '42501';
  END IF;

  -- Fuera de su zona, el Coordinador atiende la emergencia sólo si la tomó. Con sesión lo exige
  -- también la política; acá queda para lo que entra sin persona, que la política no mira.
  IF TG_TABLE_NAME = 'emergencias_turno_guardia' AND v_quien IS NULL AND interno.es_coordinador_de(v_actor) THEN
    SELECT g.asistente_id INTO v_asistente FROM turnos_guardia g WHERE g.id = NEW.turno_guardia_id;
    IF NOT interno.coordinador_alcanza_asistente_de(v_actor, v_asistente) THEN
      RAISE EXCEPTION 'alarma_fuera_de_la_zona' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION interno.la_asignacion_cambia_de_estado()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF interno.usuario_de_la_sesion() IS NOT NULL THEN
      NEW.asignado_por := interno.usuario_de_la_sesion();
    END IF;
    NEW.asignado_at := now();
    NEW.respondida_at := CASE WHEN NEW.estado IN ('aceptada', 'rechazada') THEN now() END;
    NEW.retirada_at := CASE WHEN NEW.estado = 'retirada' THEN now() END;
    NEW.retirada_por := CASE WHEN NEW.estado = 'retirada' THEN interno.usuario_de_la_sesion() END;
    RETURN NEW;
  END IF;

  IF NEW.prestadora_id IS DISTINCT FROM OLD.prestadora_id
     OR NEW.turno_guardia_id IS DISTINCT FROM OLD.turno_guardia_id
     OR NEW.serie_id IS DISTINCT FROM OLD.serie_id
     OR NEW.ausencia_id IS DISTINCT FROM OLD.ausencia_id
     OR NEW.asistente_id IS DISTINCT FROM OLD.asistente_id
     OR NEW.asistente_anterior_id IS DISTINCT FROM OLD.asistente_anterior_id
     OR NEW.asignado_por IS DISTINCT FROM OLD.asignado_por
     OR NEW.asignado_at IS DISTINCT FROM OLD.asignado_at THEN
    RAISE EXCEPTION 'asignacion_no_se_modifica' USING ERRCODE = '23514';
  END IF;

  NEW.respondida_at := OLD.respondida_at;
  NEW.retirada_at := OLD.retirada_at;
  NEW.retirada_por := OLD.retirada_por;

  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
    RETURN NEW;
  END IF;

  IF OLD.estado <> 'sin_responder' THEN
    RAISE EXCEPTION 'asignacion_ya_respondida' USING ERRCODE = '23514';
  END IF;

  IF NEW.estado IN ('aceptada', 'rechazada') THEN
    NEW.respondida_at := now();
  ELSIF NEW.estado = 'retirada' THEN
    NEW.retirada_at := now();
    NEW.retirada_por := interno.usuario_de_la_sesion();
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION interno.la_persona_tiene_un_rol_que_el_coordinador_ve(p_persona uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT p_persona IS NOT NULL AND interno.es_coordinador() AND (
       EXISTS (SELECT 1 FROM clientes c
                WHERE c.contratante_persona_id = p_persona
                  AND c.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_al_cliente(c.id))
    OR ((interno.tiene_permiso('editar_condiciones_comerciales_servicio')
         OR interno.tiene_permiso('registrar_consentimiento_pagador'))
        AND (EXISTS (SELECT 1 FROM condiciones_comerciales_servicio cc
                      JOIN servicios s ON s.id = cc.servicio_id AND s.prestadora_id = cc.prestadora_id
                     WHERE cc.contratante_persona_id = p_persona
                       AND cc.prestadora_id = interno.prestadora_actual()
                       AND interno.coordinador_ve_al_cliente(s.cliente_id))
          OR EXISTS (SELECT 1 FROM pagadores_del_servicio ps
                      JOIN servicios s ON s.id = ps.servicio_id AND s.prestadora_id = ps.prestadora_id
                     WHERE ps.pagador_persona_id = p_persona
                       AND ps.prestadora_id = interno.prestadora_actual()
                       AND interno.coordinador_ve_al_cliente(s.cliente_id))))
    OR EXISTS (SELECT 1 FROM apoderados a
                WHERE a.persona_id = p_persona
                  AND a.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_al_cliente(a.cliente_id))
    OR (interno.tiene_permiso('registrar_consentimiento_pagador')
        AND EXISTS (SELECT 1 FROM consentimientos_pagador cp
                    WHERE (cp.pagador_persona_id = p_persona OR cp.firmante_persona_id = p_persona)
                      AND cp.prestadora_id = interno.prestadora_actual()
                      AND interno.coordinador_ve_al_cliente(cp.cliente_id)))
    OR EXISTS (SELECT 1 FROM personas_autorizadas pa
                WHERE pa.persona_id = p_persona
                  AND interno.coordinador_ve_al_cliente(pa.cliente_id))
    OR EXISTS (SELECT 1 FROM pacientes pac
                WHERE (pac.persona_id = p_persona OR pac.obra_social_persona_id = p_persona)
                  AND pac.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_al_paciente(pac.id))
    OR EXISTS (SELECT 1 FROM consentimientos_medicacion cm
                 JOIN indicaciones_medicacion im ON im.id = cm.indicacion_id
                WHERE cm.firmante_persona_id = p_persona
                  AND cm.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_al_paciente(im.paciente_id))
    OR EXISTS (SELECT 1 FROM excepciones_familiar_relevo e
                WHERE e.familiar_persona_id = p_persona
                  AND e.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_el_turno_guardia(e.turno_guardia_id))
  );
$function$;

CREATE OR REPLACE FUNCTION interno.pacientes_de_la_fila(p_tabla text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE p_tabla
    WHEN 'emergencias_turno_guardia' THEN 'ARRAY(SELECT interno.pacientes_del_turno_guardia(t.turno_guardia_id))'
    WHEN 'cargas_sujetas_a_aprobacion' THEN
      'CASE WHEN t.tabla = ''informacion_de_salud_del_paciente'' THEN ARRAY[t.paciente_id] ELSE ''{}''::uuid[] END'
    ELSE 'ARRAY[t.paciente_id]'
  END;
$function$;

CREATE OR REPLACE FUNCTION interno.pacientes_de_la_serie(p_serie_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT paciente_id FROM series_turnos_guardia_pacientes WHERE serie_id = p_serie_id
$function$;

COMMENT ON FUNCTION interno.pacientes_de_la_serie(p_serie_id uuid) IS 'A quiénes atiende una serie de turnos de guardia. Punto único de verdad de las reglas de acceso.';
CREATE OR REPLACE FUNCTION interno.pacientes_del_asistente()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT gp.paciente_id
    FROM turno_guardia_pacientes gp
    JOIN turnos_guardia g ON g.id = gp.turno_guardia_id
   WHERE g.asistente_id = interno.asistente_de_la_sesion()
     AND g.prestadora_id = interno.prestadora_actual()
$function$;

CREATE OR REPLACE FUNCTION interno.sin_coordinador_no_hay_turnos_guardia()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_servicio uuid := interno.servicio_a_revisar_al_programar(
    to_jsonb(NEW), CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END, TG_OP);
BEGIN
  IF v_servicio IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM servicios s
     WHERE s.id = v_servicio
       AND s.prestadora_id = NEW.prestadora_id
       AND s.coordinador_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'servicio_sin_coordinador:%', v_servicio;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION interno.sin_firma_del_pagador_no_hay_turnos_guardia()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_servicio uuid := interno.servicio_a_revisar_al_programar(
    to_jsonb(NEW), CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END, TG_OP);
BEGIN
  IF v_servicio IS NULL THEN
    RETURN NEW;
  END IF;
  IF interno.falta_la_firma_del_pagador(v_servicio) THEN
    RAISE EXCEPTION 'servicio_sin_firma_del_pagador' USING DETAIL = v_servicio::text;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION interno.tablas_de_salud()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT ARRAY[
    'alertas', 'cargas_sujetas_a_aprobacion', 'emergencias_turno_guardia', 'hospitalizaciones_paciente',
    'indicaciones_medicacion', 'informacion_de_salud_del_paciente', 'informes_obra_social',
    'rangos_referencia_vitales', 'reportes', 'versiones_registro_clinico'
  ]::text[];
$function$;

CREATE OR REPLACE FUNCTION interno.turnos_guardia_que_traban_la_desactivacion(p_usuario uuid, p_prestadora uuid)
 RETURNS TABLE(tipo text, id uuid, fecha date, hora_inicio time without time zone, hora_fin time without time zone, dias_hasta_el_fin smallint, checkin_at timestamp with time zone, cliente text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT 'turno_guardia'::text, g.id, g.fecha, g.hora_inicio, g.hora_fin, g.dias_hasta_el_fin,
         g.checkin_at, pe.nombre_visible
    FROM asistentes a
    JOIN turnos_guardia g ON g.asistente_id = a.id AND g.prestadora_id = p_prestadora
    LEFT JOIN pacientes p ON p.id = g.paciente_id
    LEFT JOIN personas pe ON pe.id = p.persona_id
   WHERE a.usuario_id = p_usuario
     AND a.prestadora_id = p_prestadora
     AND g.estado NOT IN ('cancelada', 'ausente')
     AND g.checkout_at IS NULL
     AND g.cerrada_at IS NULL
  UNION ALL
  SELECT 'serie'::text, s.id, s.vigente_desde, s.hora_inicio, s.hora_fin, s.dias_hasta_el_fin,
         NULL::timestamptz, pe.nombre_visible
    FROM asistentes a
    JOIN series_turnos_guardia s ON s.asistente_id = a.id AND s.prestadora_id = p_prestadora
    LEFT JOIN pacientes p ON p.id = s.paciente_id
    LEFT JOIN personas pe ON pe.id = p.persona_id
   WHERE a.usuario_id = p_usuario
     AND a.prestadora_id = p_prestadora
     AND s.estado IN ('activa', 'pausada')
     AND (s.vigente_hasta IS NULL OR s.vigente_hasta >= current_date - 1)
   ORDER BY 3, 4;
$function$;

CREATE OR REPLACE FUNCTION interno.validar_paciente_de_turno_guardia_del_contratante()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  servicio uuid;
BEGIN
  SELECT servicio_id INTO servicio FROM turnos_guardia WHERE id = NEW.turno_guardia_id;
  PERFORM interno.exigir_paciente_y_servicio_del_mismo_contratante(NEW.paciente_id, servicio);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.aceptar_asignacion(p_asignacion_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
  v_asistente  uuid := interno.asistente_de_la_sesion();
  v_asignacion public.asignaciones_de_turno_guardia;
  v_tomadas    integer;
BEGIN
  IF v_prestadora IS NULL OR v_asistente IS NULL THEN
    RAISE EXCEPTION 'asignacion_no_encontrada';
  END IF;

  SELECT * INTO v_asignacion
    FROM asignaciones_de_turno_guardia
   WHERE id = p_asignacion_id
     AND prestadora_id = v_prestadora
     AND asistente_id = v_asistente
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'asignacion_no_encontrada';
  END IF;

  IF v_asignacion.estado <> 'sin_responder' THEN
    RAISE EXCEPTION 'asignacion_ya_respondida';
  END IF;

  IF v_asignacion.turno_guardia_id IS NOT NULL THEN
    UPDATE turnos_guardia
       SET asistente_id = v_asistente
     WHERE id = v_asignacion.turno_guardia_id
       AND prestadora_id = v_prestadora
       AND estado = 'programada'
       AND asistente_id IS NULL;

    GET DIAGNOSTICS v_tomadas = ROW_COUNT;
    IF v_tomadas = 0 THEN
      RAISE EXCEPTION 'turno_guardia_ya_cubierto';
    END IF;

  ELSIF v_asignacion.serie_id IS NOT NULL THEN
    UPDATE series_turnos_guardia
       SET asistente_id = v_asistente
     WHERE id = v_asignacion.serie_id
       AND prestadora_id = v_prestadora
       AND estado = 'activa'
       AND asistente_id IS NULL;

    GET DIAGNOSTICS v_tomadas = ROW_COUNT;
    IF v_tomadas = 0 THEN
      RAISE EXCEPTION 'turno_guardia_ya_cubierto';
    END IF;

    -- Los turnos que vienen pasan a ser suyos: los que no tienen a nadie y los que seguía haciendo
    -- quien tenía el turno fijo antes. Los que esperan la respuesta de otro por ese día quedan como
    -- están. Ya contestó que sí: no le llega un aviso por cada día.
    UPDATE turnos_guardia g
       SET asistente_id = v_asistente,
           push_asignacion_enviado_at = now()
     WHERE g.serie_id = v_asignacion.serie_id
       AND g.prestadora_id = v_prestadora
       AND g.estado = 'programada'
       AND (g.asistente_id IS NULL OR g.asistente_id = v_asignacion.asistente_anterior_id)
       AND g.fecha >= CURRENT_DATE
       AND NOT EXISTS (
         SELECT 1 FROM asignaciones_de_turno_guardia o
          WHERE o.turno_guardia_id = g.id
            AND o.estado = 'sin_responder'
       );

  ELSE
    UPDATE coberturas_de_ausencia
       SET aceptada_at = now()
     WHERE ausencia_id = v_asignacion.ausencia_id
       AND prestadora_id = v_prestadora
       AND asistente_sustituto_id = v_asistente
       AND aceptada_at IS NULL
       AND objetada_at IS NULL;
  END IF;

  UPDATE asignaciones_de_turno_guardia
     SET estado = 'aceptada'
   WHERE id = v_asignacion.id;

  RETURN v_asignacion.turno_guardia_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.actualizar_precios_por_indice(p_desde date, p_periodo_base date, p_periodo_nuevo date, p_aplicar boolean)
 RETURNS TABLE(clase text, renglon_id bigint, renglon_nuevo_id bigint, servicio_id uuid, descripcion text, indice text, precio_actual numeric, precio_nuevo numeric, moneda text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_prestadora  uuid := interno.prestadora_actual();
  v_regla       jsonb;
  v_indice_p    text;
  v_factor      numeric;
  v_lista       public.lista_precios;
  v_prestacion  record;
  v_pendientes  jsonb;
  v_elemento    jsonb;
  v_reemplazo   bigint;
BEGIN
  IF v_prestadora IS NULL OR NOT interno.es_la_administracion_de_la_prestadora(v_prestadora) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_desde IS NULL OR p_periodo_base IS NULL OR p_periodo_nuevo IS NULL
     OR p_desde <> date_trunc('month', p_desde)::date
     OR date_trunc('month', p_periodo_nuevo) <= date_trunc('month', p_periodo_base) THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;

  SELECT c.regla INTO v_regla FROM public.configuracion_facturacion_clientes c
   WHERE c.prestadora_id = v_prestadora;
  -- Igual que `condicionDe` de `panel/src/lib/condicionesDelCliente.js`: 'ninguno' es «sin índice».
  v_indice_p := NULLIF(NULLIF(btrim(coalesce(v_regla ->> 'indice_de_actualizacion', '')), ''), 'ninguno');

  -- Las prestaciones se eligen antes de tocar la lista, con su marca de revisión de ese momento:
  -- reemplazar un renglón de la lista marca a revisar las que apuntan a él, y la que se versiona
  -- acá no tiene nada que revisar.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'servicio_id', p.servicio_id, 'tipo_servicio', p.tipo_servicio,
           'precio_final', p.precio_final, 'precio_lista_snapshot', p.precio_lista_snapshot,
           'precio_lista_id', p.precio_lista_id, 'requiere_revision', p.requiere_revision,
           'precio_turno_guardia_adicional', p.precio_turno_guardia_adicional,
           'precio_hora_adicional', p.precio_hora_adicional,
           'moneda', p.moneda, 'indice', x.indice)), '[]'::jsonb)
    INTO v_pendientes
    FROM public.prestaciones p
    LEFT JOIN public.condiciones_comerciales_servicio c ON c.servicio_id = p.servicio_id
    CROSS JOIN LATERAL (SELECT
        CASE WHEN c.indice_de_actualizacion = 'ninguno' THEN NULL
             ELSE coalesce(NULLIF(btrim(coalesce(c.indice_de_actualizacion, '')), ''), v_indice_p) END AS indice) x
   WHERE p.prestadora_id = v_prestadora
     AND p.estado = 'vigente'
     AND p.vigente_hasta IS NULL
     AND p.vigente_desde < p_desde
     AND p.servicio_id IS NOT NULL
     AND x.indice IS NOT NULL;

  -- La lista de precios de la Prestadora.
  IF v_indice_p IS NOT NULL THEN
    v_factor := public.valor_del_indice(v_indice_p, p_periodo_nuevo)
              / NULLIF(public.valor_del_indice(v_indice_p, p_periodo_base), 0);
    FOR v_lista IN
      SELECT * FROM public.lista_precios l
       WHERE l.prestadora_id = v_prestadora AND l.vigente_hasta IS NULL AND l.activo
         AND l.vigente_desde < p_desde
       ORDER BY l.tipo_servicio, l.modalidad, l.id
    LOOP
      clase := 'lista';
      renglon_id := v_lista.id;
      renglon_nuevo_id := NULL;
      servicio_id := NULL;
      descripcion := v_lista.tipo_servicio || ' — ' || v_lista.modalidad;
      indice := v_indice_p;
      precio_actual := v_lista.precio;
      precio_nuevo := round(v_lista.precio * v_factor, 2);
      moneda := v_lista.moneda;
      IF p_aplicar AND precio_nuevo IS NOT NULL THEN
        renglon_nuevo_id := public.reemplazar_precio_de_lista(v_lista.id, precio_nuevo, p_desde);
      END IF;
      RETURN NEXT;
    END LOOP;
  END IF;

  -- Las prestaciones de los Servicios que se actualizan por índice.
  FOR v_elemento IN SELECT * FROM jsonb_array_elements(v_pendientes) LOOP
    v_factor := public.valor_del_indice(v_elemento ->> 'indice', p_periodo_nuevo)
              / NULLIF(public.valor_del_indice(v_elemento ->> 'indice', p_periodo_base), 0);
    clase := 'prestacion';
    renglon_id := (v_elemento ->> 'id')::bigint;
    renglon_nuevo_id := NULL;
    servicio_id := (v_elemento ->> 'servicio_id')::uuid;
    descripcion := v_elemento ->> 'tipo_servicio';
    indice := v_elemento ->> 'indice';
    precio_actual := (v_elemento ->> 'precio_final')::numeric;
    precio_nuevo := round(precio_actual * v_factor, 2);
    moneda := v_elemento ->> 'moneda';

    IF p_aplicar AND precio_nuevo IS NOT NULL AND precio_nuevo <> precio_actual THEN
      -- Si el renglón de la lista del que salió fue reemplazado recién, la nueva apunta al nuevo.
      SELECT l.id INTO v_reemplazo FROM public.lista_precios l
       WHERE l.reemplaza_a = NULLIF(v_elemento ->> 'precio_lista_id', '')::bigint
         AND l.vigente_desde = p_desde
       ORDER BY l.id DESC LIMIT 1;

      renglon_nuevo_id := interno.copiar_renglon('public.prestaciones', renglon_id, jsonb_build_object(
        'precio_final', precio_nuevo,
        'precio_lista_snapshot', CASE WHEN v_elemento ->> 'precio_lista_snapshot' IS NULL THEN NULL
                                      ELSE round((v_elemento ->> 'precio_lista_snapshot')::numeric * v_factor, 2) END,
        'precio_turno_guardia_adicional', CASE WHEN v_elemento ->> 'precio_turno_guardia_adicional' IS NULL THEN NULL
                                         ELSE round((v_elemento ->> 'precio_turno_guardia_adicional')::numeric * v_factor, 2) END,
        'precio_hora_adicional', CASE WHEN v_elemento ->> 'precio_hora_adicional' IS NULL THEN NULL
                                      ELSE round((v_elemento ->> 'precio_hora_adicional')::numeric * v_factor, 2) END,
        'precio_lista_id', coalesce(v_reemplazo, NULLIF(v_elemento ->> 'precio_lista_id', '')::bigint),
        'vigente_desde', p_desde,
        'vigente_hasta', NULL,
        'requiere_revision', false,
        'prestacion_anterior_id', renglon_id
      ));

      UPDATE public.prestaciones
         SET vigente_hasta = p_desde - 1,
             requiere_revision = (v_elemento ->> 'requiere_revision')::boolean
       WHERE id = renglon_id;
    END IF;
    RETURN NEXT;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ajustar_precios_por_indice()
 RETURNS TABLE(aplicados integer, propuestos integer, sin_efecto integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_prest      uuid := interno.prestadora_actual();
  v_regla      jsonb;
  v            record;
  v_ancla      date;
  v_rige       date;
  v_base       date;
  v_nuevo      date;
  v_factor     numeric;
  v_precio     numeric;
  v_propuesta  uuid;
  v_nueva      bigint;
BEGIN
  IF v_prest IS NULL OR coalesce(auth.jwt() ->> 'role', '') <> 'trabajo_sin_persona' THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;

  -- Dos corridas a la vez para la misma Prestadora harían el mismo ajuste dos veces.
  PERFORM pg_advisory_xact_lock(hashtextextended('ajuste_por_indice:' || v_prest::text, 0));

  aplicados := 0;
  propuestos := 0;
  sin_efecto := 0;

  SELECT c.regla INTO v_regla FROM public.configuracion_facturacion_clientes c
   WHERE c.prestadora_id = v_prest;

  -- Las pendientes que ya no corresponden: la prestación dejó de ser la vigente, cambió su
  -- precio, o el Servicio cambió de índice o lo sacó.
  WITH vencidas AS (
    UPDATE public.propuestas_de_ajuste_por_indice pr
       SET estado = 'sin_efecto'
      FROM public.prestaciones p
      LEFT JOIN public.condiciones_comerciales_servicio c ON c.servicio_id = p.servicio_id
     WHERE pr.prestadora_id = v_prest
       AND pr.estado = 'pendiente'
       AND p.id = pr.prestacion_id
       AND (p.estado <> 'vigente'
            OR p.vigente_hasta IS NOT NULL
            OR p.precio_final <> pr.precio_actual
            OR (SELECT x.indice FROM interno.condiciones_del_ajuste_por_indice(
                  v_regla, c.indice_de_actualizacion, c.meses_entre_actualizaciones, c.ajuste_por_indice) x)
               IS DISTINCT FROM pr.indice)
    RETURNING pr.id
  )
  SELECT count(*) INTO sin_efecto FROM vencidas;

  FOR v IN
    SELECT p.id, p.servicio_id, p.vigente_desde, p.precio_final, p.precio_lista_snapshot, p.moneda,
           p.precio_turno_guardia_adicional, p.precio_hora_adicional,
           x.indice, x.meses, x.ajuste
      FROM public.prestaciones p
      LEFT JOIN public.condiciones_comerciales_servicio c ON c.servicio_id = p.servicio_id
     CROSS JOIN LATERAL interno.condiciones_del_ajuste_por_indice(
           v_regla, c.indice_de_actualizacion, c.meses_entre_actualizaciones, c.ajuste_por_indice) x
     WHERE p.prestadora_id = v_prest
       AND p.estado = 'vigente'
       AND p.vigente_hasta IS NULL
       AND p.servicio_id IS NOT NULL
       AND p.vigente_desde <= current_date
       AND p.precio_final > 0
       AND x.indice IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.propuestas_de_ajuste_por_indice pr
                        WHERE pr.prestacion_id = p.id AND pr.estado = 'pendiente')
     ORDER BY p.id
  LOOP
    SELECT greatest(date_trunc('month', v.vigente_desde)::date, max(pr.rige_desde))
      INTO v_ancla
      FROM public.propuestas_de_ajuste_por_indice pr
     WHERE pr.prestacion_id = v.id AND pr.estado = 'rechazada';

    v_rige := (v_ancla + make_interval(months => v.meses))::date;
    CONTINUE WHEN current_date < v_rige;

    v_base := (date_trunc('month', v.vigente_desde) - interval '1 month')::date;
    v_nuevo := (v_rige - interval '1 month')::date;

    v_factor := interno.valor_del_indice_de_la_prestadora(v_prest, v.indice, v_nuevo)
              / NULLIF(interno.valor_del_indice_de_la_prestadora(v_prest, v.indice, v_base), 0);
    CONTINUE WHEN v_factor IS NULL;

    v_precio := round(v.precio_final * v_factor, 2);
    CONTINUE WHEN v_precio = v.precio_final;

    -- Ya hubo un ajuste para ese mes (rechazado, por ejemplo): no se vuelve a proponer.
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.propuestas_de_ajuste_por_indice pr
                           WHERE pr.prestacion_id = v.id AND pr.rige_desde = v_rige
                             AND pr.estado <> 'sin_efecto');

    IF v.ajuste = 'automatico' THEN
      v_nueva := interno.copiar_renglon('public.prestaciones', v.id, jsonb_build_object(
        'precio_final', v_precio,
        'precio_lista_snapshot', CASE WHEN v.precio_lista_snapshot IS NULL THEN NULL
                                      ELSE round(v.precio_lista_snapshot * v_factor, 2) END,
        'precio_turno_guardia_adicional', CASE WHEN v.precio_turno_guardia_adicional IS NULL THEN NULL
                                         ELSE round(v.precio_turno_guardia_adicional * v_factor, 2) END,
        'precio_hora_adicional', CASE WHEN v.precio_hora_adicional IS NULL THEN NULL
                                      ELSE round(v.precio_hora_adicional * v_factor, 2) END,
        'vigente_desde', v_rige,
        'vigente_hasta', NULL,
        'requiere_revision', false,
        'prestacion_anterior_id', v.id
      ));

      INSERT INTO public.propuestas_de_ajuste_por_indice (
        prestadora_id, prestacion_id, servicio_id, indice, periodo_base, periodo_nuevo,
        precio_actual, precio_propuesto, moneda, rige_desde, estado, prestacion_nueva_id)
      VALUES (v_prest, v.id, v.servicio_id, v.indice, v_base, v_nuevo,
              v.precio_final, v_precio, v.moneda, v_rige, 'aplicada', v_nueva)
      RETURNING id INTO v_propuesta;

      INSERT INTO public.registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, detalle)
      VALUES (v_prest, NULL, 'ajuste_por_indice_aplicado', 'propuestas_de_ajuste_por_indice', v_propuesta,
              jsonb_build_object('prestacion_id', v.id, 'prestacion_nueva_id', v_nueva,
                                 'servicio_id', v.servicio_id, 'indice', v.indice,
                                 'precio_anterior', v.precio_final, 'precio_nuevo', v_precio,
                                 'moneda', v.moneda, 'rige_desde', v_rige));
      aplicados := aplicados + 1;
    ELSE
      INSERT INTO public.propuestas_de_ajuste_por_indice (
        prestadora_id, prestacion_id, servicio_id, indice, periodo_base, periodo_nuevo,
        precio_actual, precio_propuesto, moneda, rige_desde)
      VALUES (v_prest, v.id, v.servicio_id, v.indice, v_base, v_nuevo,
              v.precio_final, v_precio, v.moneda, v_rige);
      propuestos := propuestos + 1;
    END IF;
  END LOOP;

  RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.asignar_serie(p_serie_id uuid, p_asistente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
  v_serie      public.series_turnos_guardia;
  v_pendiente  public.asignaciones_de_turno_guardia;
  v_anterior   uuid;
  v_nueva      uuid;
  v_bloquean   text[];
BEGIN
  IF v_prestadora IS NULL THEN
    RAISE EXCEPTION 'serie_no_encontrada';
  END IF;

  SELECT * INTO v_pendiente
    FROM asignaciones_de_turno_guardia
   WHERE serie_id = p_serie_id
     AND prestadora_id = v_prestadora
     AND estado = 'sin_responder'
   FOR UPDATE;

  SELECT * INTO v_serie
    FROM series_turnos_guardia
   WHERE id = p_serie_id
     AND prestadora_id = v_prestadora
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'serie_no_encontrada';
  END IF;

  IF v_serie.estado <> 'activa' THEN
    RAISE EXCEPTION 'serie_no_se_asigna' USING ERRCODE = '23514';
  END IF;

  IF p_asistente_id IS NOT NULL AND v_pendiente.asistente_id = p_asistente_id THEN
    RETURN jsonb_build_object('sin_cambios', true);
  END IF;
  IF p_asistente_id IS NOT NULL AND v_pendiente.id IS NULL AND v_serie.asistente_id = p_asistente_id THEN
    RETURN jsonb_build_object('sin_cambios', true);
  END IF;
  IF p_asistente_id IS NULL AND v_pendiente.id IS NULL AND v_serie.asistente_id IS NULL THEN
    RETURN jsonb_build_object('sin_cambios', true);
  END IF;

  v_anterior := COALESCE(v_serie.asistente_id, v_pendiente.asistente_anterior_id);

  IF p_asistente_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM asistentes a WHERE a.id = p_asistente_id AND a.prestadora_id = v_prestadora) THEN
      RAISE EXCEPTION 'asistente_no_encontrado';
    END IF;

    IF EXISTS (SELECT 1 FROM usuarios u WHERE u.id = interno.usuario_de_la_sesion() AND u.rol = 'coordinador')
       AND NOT interno.coordinador_alcanza_asistente(p_asistente_id) THEN
      RAISE EXCEPTION 'asistente_no_encontrado';
    END IF;

    v_bloquean := interno.documentos_que_bloquean(
      p_asistente_id, GREATEST(v_serie.vigente_desde, CURRENT_DATE), v_serie.paciente_id, v_serie.servicio_id);
    IF cardinality(v_bloquean) > 0 THEN
      RAISE EXCEPTION 'documentos_bloquean:%:', array_to_string(v_bloquean, ', ') USING ERRCODE = '23514';
    END IF;

    IF v_serie.canal_modalidad IS NOT NULL
       AND NOT interno.asistente_trabaja_en_modalidad(p_asistente_id, v_serie.canal_modalidad) THEN
      RAISE EXCEPTION 'modalidad_bloquea:%:', v_serie.canal_modalidad USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_pendiente.id IS NOT NULL THEN
    UPDATE asignaciones_de_turno_guardia SET estado = 'retirada' WHERE id = v_pendiente.id;
  END IF;

  IF v_serie.asistente_id IS NOT NULL THEN
    UPDATE series_turnos_guardia SET asistente_id = NULL WHERE id = v_serie.id;
  END IF;

  IF p_asistente_id IS NOT NULL THEN
    INSERT INTO asignaciones_de_turno_guardia (prestadora_id, serie_id, asistente_id, asistente_anterior_id)
    VALUES (v_prestadora, v_serie.id, p_asistente_id, v_anterior)
    RETURNING id INTO v_nueva;
  END IF;

  RETURN jsonb_build_object(
    'sin_cambios', false,
    'asignacion_id', v_nueva,
    'titular_retirado', v_serie.asistente_id,
    'pendiente_retirado', v_pendiente.asistente_id,
    'asistente_anterior_id', v_anterior
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.asistente_asignado_a_cliente(p_asistente_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM turnos_guardia g
    JOIN pacientes p ON p.id = g.paciente_id
    WHERE g.asistente_id = p_asistente_id
      AND p.cliente_id = cliente_id_de_usuario(auth.uid())
  );
$function$;

COMMENT ON FUNCTION public.asistente_asignado_a_cliente(p_asistente_id uuid) IS 'Única fuente de verdad para saber si un Asistente atiende a un Paciente del Cliente de la sesión. Va por función y no dentro de la política para no armar una referencia circular entre asistentes y turnos de guardia.';
CREATE OR REPLACE FUNCTION public.asistentes_asignados_al_paciente(p_paciente uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT DISTINCT g.asistente_id
    FROM turno_guardia_pacientes gp
    JOIN turnos_guardia g ON g.id = gp.turno_guardia_id AND g.prestadora_id = gp.prestadora_id
   WHERE gp.paciente_id = p_paciente
     AND gp.prestadora_id = interno.prestadora_actual()
     AND interno.es_personal_de_la_prestadora()
     AND g.asistente_id IS NOT NULL
     AND g.fecha >= current_date;
$function$;

CREATE OR REPLACE FUNCTION public.cerrar_hospitalizacion(p_hospitalizacion uuid, p_fecha date)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_antes    text := coalesce(current_setting('careonys.lectura_de_salud', true), '');
  v_paciente uuid;
  v_inicio   date;
BEGIN
  PERFORM set_config('careonys.lectura_de_salud', 'anotada', true);
  UPDATE hospitalizaciones_paciente h
     SET fecha_fin = greatest(p_fecha, h.fecha_inicio)
   WHERE h.id = p_hospitalizacion
     AND h.prestadora_id = interno.prestadora_actual()
     AND h.fecha_fin IS NULL
  RETURNING h.paciente_id, h.fecha_inicio INTO v_paciente, v_inicio;
  PERFORM set_config('careonys.lectura_de_salud', v_antes, true);
  IF v_paciente IS NULL THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  PERFORM interno.anotar_lo_que_se_leyo('hospitalizaciones_paciente', ARRAY[v_paciente], 'cerrar_hospitalizacion');

  IF EXISTS (SELECT 1 FROM domicilios_temporales_paciente d WHERE d.hospitalizacion_id = p_hospitalizacion) THEN
    UPDATE domicilios_temporales_paciente d
       SET fecha_fin = greatest(p_fecha, d.fecha_inicio)
     WHERE d.hospitalizacion_id = p_hospitalizacion
       AND (d.fecha_fin IS NULL OR d.fecha_fin > greatest(p_fecha, d.fecha_inicio));
  ELSE
    UPDATE turnos_guardia SET estado = 'programada' WHERE paciente_id = v_paciente AND estado = 'pausada';
    UPDATE series_turnos_guardia SET estado = 'activa' WHERE paciente_id = v_paciente AND estado = 'pausada';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.dar_de_baja_el_servicio(p_servicio uuid, p_motivo text, p_motivo_detalle text, p_comprobaciones uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_servicio servicios%ROWTYPE;
  v_pide_detalle boolean;
  v_comprobaciones text[];
  v_faltan integer;
  v_baja uuid;
BEGIN
  SELECT * INTO v_servicio FROM servicios
   WHERE id = p_servicio AND prestadora_id = interno.prestadora_actual();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'servicio_inexistente';
  END IF;
  IF v_servicio.estado <> 'vigente' THEN
    RAISE EXCEPTION 'el_servicio_ya_esta_de_baja';
  END IF;

  IF interno.turnos_guardia_asignados_del_servicio(p_servicio) > 0 THEN
    RAISE EXCEPTION 'el_servicio_tiene_turnos_guardia_asignados';
  END IF;

  SELECT m.pide_detalle INTO v_pide_detalle
    FROM motivos_cierre_servicio m
   WHERE m.prestadora_id = v_servicio.prestadora_id
     AND m.activo
     AND coalesce(m.clave, m.nombre) = p_motivo
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'motivo_de_cierre_inexistente:%', p_motivo;
  END IF;
  IF v_pide_detalle AND coalesce(btrim(p_motivo_detalle), '') = '' THEN
    RAISE EXCEPTION 'motivo_de_cierre_pide_detalle:%', p_motivo;
  END IF;

  SELECT count(*) INTO v_faltan
    FROM lista_de_comprobacion_baja_servicio l
   WHERE l.prestadora_id = v_servicio.prestadora_id
     AND l.activo
     AND NOT (l.id = ANY (coalesce(p_comprobaciones, '{}')));
  IF v_faltan > 0 THEN
    RAISE EXCEPTION 'faltan_comprobaciones_de_la_baja';
  END IF;

  SELECT coalesce(array_agg(l.nombre ORDER BY l.orden, l.created_at), '{}') INTO v_comprobaciones
    FROM lista_de_comprobacion_baja_servicio l
   WHERE l.prestadora_id = v_servicio.prestadora_id
     AND l.activo
     AND l.id = ANY (coalesce(p_comprobaciones, '{}'));

  INSERT INTO bajas_de_servicio (prestadora_id, servicio_id, motivo, motivo_detalle, comprobaciones, dada_por)
  VALUES (v_servicio.prestadora_id, p_servicio, p_motivo,
          CASE WHEN v_pide_detalle THEN btrim(p_motivo_detalle) END,
          v_comprobaciones, interno.usuario_de_la_sesion())
  RETURNING id INTO v_baja;

  -- La fecha de fin de cada prestación la pone la base al ver la baja.
  UPDATE prestaciones SET estado = 'de_baja'
   WHERE servicio_id = p_servicio AND estado = 'vigente';
  UPDATE series_turnos_guardia
     SET estado = 'cancelada', cancelacion_origen = 'prestadora', cancelado_at = now()
   WHERE servicio_id = p_servicio AND estado = 'activa';
  UPDATE turnos_guardia
     SET estado = 'cancelada', cancelacion_origen = 'prestadora', cancelacion_alcance = 'total'
   WHERE servicio_id = p_servicio AND estado = 'programada' AND asistente_id IS NULL;

  PERFORM set_config('careonys.cambio_de_estado_del_servicio', p_servicio::text, true);
  UPDATE servicios SET estado = 'de_baja' WHERE id = p_servicio;
  PERFORM set_config('careonys.cambio_de_estado_del_servicio', '', true);

  PERFORM interno.anotar_deuda_de_la_baja(v_baja);

  RETURN v_baja;
END;
$function$;

CREATE OR REPLACE FUNCTION public.desactivar_la_cuenta(p_usuario uuid, p_motivo text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid;
  v_motivo text := btrim(coalesce(p_motivo, ''), E' \t\r\n');
BEGIN
  IF auth.jwt() ->> 'role' IS DISTINCT FROM 'trabajo_sin_persona' THEN RETURN false; END IF;
  v_prestadora := interno.prestadora_actual();
  IF v_prestadora IS NULL OR p_usuario IS NULL OR v_motivo = '' THEN RETURN false; END IF;

  -- Turnos sin terminar: se reasignan o se cierran antes, y la cuenta queda como estaba.
  IF EXISTS (SELECT 1 FROM interno.turnos_guardia_que_traban_la_desactivacion(p_usuario, v_prestadora)) THEN
    RAISE EXCEPTION 'desactivacion_con_turnos_guardia_por_delante';
  END IF;

  UPDATE usuarios
     SET desactivada_en = now(),
         motivo_de_la_desactivacion = v_motivo
   WHERE id = p_usuario
     AND prestadora_id = v_prestadora
     AND rol IN ('coordinador', 'asistente', 'cliente')
     AND desactivada_en IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;

  -- La cuenta de ingreso queda bloqueada: no entra con la clave, no renueva la sesión y no canjea
  -- ningún enlace. El bloqueo no lo levanta un cambio de clave.
  UPDATE auth.users
     SET banned_until = now() + interval '100 years',
         updated_at = now()
   WHERE id = p_usuario;

  -- Las sesiones abiertas se cierran ahora y no cuando venzan.
  DELETE FROM auth.refresh_tokens WHERE user_id = p_usuario::text;
  DELETE FROM auth.sessions WHERE user_id = p_usuario;

  -- Lo que tenía pendiente para entrar o cambiar la clave deja de servir.
  UPDATE tokens_activacion_cuenta SET usado_en = now()
   WHERE usuario_id = p_usuario AND usado_en IS NULL;
  UPDATE tokens_recuperacion_clave SET usado_en = now()
   WHERE usuario_id = p_usuario AND usado_en IS NULL;
  UPDATE cambios_de_clave_habilitados SET anulado_en = now()
   WHERE usuario_id = p_usuario AND usado_en IS NULL AND anulado_en IS NULL;
  UPDATE codigos_al_telefono SET anulado_en = now()
   WHERE usuario_id = p_usuario AND verificado_en IS NULL AND anulado_en IS NULL;
  UPDATE equipos_conocidos SET revocado_en = now()
   WHERE usuario_id = p_usuario AND revocado_en IS NULL;

  -- La responsabilidad del reclutamiento queda libre, como quedaba al borrar la cuenta.
  UPDATE configuracion_reclutamiento SET responsable_id = NULL
   WHERE responsable_id = p_usuario AND prestadora_id = v_prestadora;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.exigir_paciente_del_turno_guardia()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM turno_guardia_pacientes gp
    WHERE gp.turno_guardia_id = NEW.turno_guardia_id AND gp.paciente_id = NEW.paciente_id
  ) THEN
    RAISE EXCEPTION 'El reporte habla de un Paciente que este turno de guardia no atiende';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_modalidad_del_turno_guardia()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF NEW.asistente_id IS NULL OR NEW.canal_modalidad IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.asistente_id IS NOT DISTINCT FROM OLD.asistente_id
     AND NEW.canal_modalidad IS NOT DISTINCT FROM OLD.canal_modalidad THEN
    RETURN NEW;
  END IF;

  IF NOT interno.asistente_trabaja_en_modalidad(NEW.asistente_id, NEW.canal_modalidad) THEN
    RAISE EXCEPTION 'modalidad_bloquea:%:', NEW.canal_modalidad
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_rastro_del_cierre_por_el_asistente() IS 'Le pone la etiqueta al cierre que hace el Asistente cuando marca su salida. No cierra turnos de guardia: solo escribe quién, cuándo y desde dónde, sobre un cierre que ya está ocurriendo en esa misma operación.';
CREATE OR REPLACE FUNCTION public.fn_servicio_de_la_serie()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.servicio_id IS NULL AND NEW.serie_id IS NOT NULL THEN
    SELECT s.servicio_id INTO NEW.servicio_id
      FROM series_turnos_guardia s WHERE s.id = NEW.serie_id;
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_servicio_de_la_serie() IS 'Copia el Servicio de la serie al turno de guardia que nace de ella. Está en la base y no en el motor porque por esta puerta entran los turnos de guardia que genera el motor de noche y los que genera el Panel al crear la serie.';
CREATE OR REPLACE FUNCTION public.registrar_hospitalizacion(p_paciente uuid, p_institucion text, p_motivo text, p_fecha_inicio date, p_domicilio jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_antes      text := coalesce(current_setting('careonys.lectura_de_salud', true), '');
  v_prestadora uuid;
  v_id         uuid := gen_random_uuid();
  v_d          domicilios_temporales_paciente;
BEGIN
  SELECT p.prestadora_id INTO v_prestadora
    FROM pacientes p
   WHERE p.id = p_paciente
     AND p.prestadora_id = interno.prestadora_actual();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(coalesce(p_institucion, '')), '') IS NULL OR p_fecha_inicio IS NULL THEN
    RAISE EXCEPTION 'falta_un_dato' USING ERRCODE = '23502';
  END IF;

  -- El identificador se arma acá y no se lee de vuelta: quien no alcanza la información de salud
  -- del Paciente puede registrar la internación, pero no leerla.
  PERFORM set_config('careonys.lectura_de_salud', 'anotada', true);
  INSERT INTO hospitalizaciones_paciente
    (id, prestadora_id, paciente_id, institucion, motivo, fecha_inicio, registrado_por)
  VALUES
    (v_id, v_prestadora, p_paciente, btrim(p_institucion), nullif(btrim(coalesce(p_motivo, '')), ''),
     p_fecha_inicio, interno.usuario_de_la_sesion());
  PERFORM set_config('careonys.lectura_de_salud', v_antes, true);
  PERFORM interno.anotar_lo_que_se_leyo('hospitalizaciones_paciente', ARRAY[p_paciente], 'registrar_hospitalizacion');

  IF p_domicilio IS NULL THEN
    UPDATE turnos_guardia SET estado = 'pausada'
     WHERE paciente_id = p_paciente AND estado = 'programada' AND fecha >= p_fecha_inicio;
    UPDATE series_turnos_guardia SET estado = 'pausada'
     WHERE paciente_id = p_paciente AND estado = 'activa';
  ELSE
    v_d := jsonb_populate_record(NULL::domicilios_temporales_paciente, p_domicilio);
    INSERT INTO domicilios_temporales_paciente
      (prestadora_id, paciente_id, hospitalizacion_id, domicilio, calle, numero, piso, unidad,
       lugar_id, codigo_postal, lat, lng, motivo, fecha_inicio)
    VALUES
      (v_prestadora, p_paciente, v_id, v_d.domicilio, v_d.calle, v_d.numero, v_d.piso, v_d.unidad,
       v_d.lugar_id, v_d.codigo_postal, v_d.lat, v_d.lng, v_d.motivo, p_fecha_inicio);
  END IF;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.revisar_propuesta_de_ajuste(p_propuesta uuid, p_precio numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_prest   uuid := interno.prestadora_actual();
  v_quien   uuid := interno.usuario_de_la_sesion();
  pr        public.propuestas_de_ajuste_por_indice;
  p         public.prestaciones;
  v_precio  numeric := round(p_precio, 2);
  v_nueva   bigint;
BEGIN
  IF v_prest IS NULL OR v_quien IS NULL
     OR NOT interno.es_la_administracion_de_la_prestadora(v_prest) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF v_precio IS NULL OR v_precio <= 0 THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO pr FROM public.propuestas_de_ajuste_por_indice
   WHERE id = p_propuesta AND prestadora_id = v_prest
   FOR UPDATE;
  IF NOT FOUND OR pr.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  -- El mismo precio actual: no cambia nada.
  IF v_precio = pr.precio_actual THEN
    UPDATE public.propuestas_de_ajuste_por_indice
       SET estado = 'rechazada', revisada_por = v_quien, revisada_en = now()
     WHERE id = pr.id;

    INSERT INTO public.registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, detalle)
    VALUES (v_prest, v_quien, 'ajuste_por_indice_rechazado', 'propuestas_de_ajuste_por_indice', pr.id,
            jsonb_build_object('prestacion_id', pr.prestacion_id, 'servicio_id', pr.servicio_id,
                               'indice', pr.indice, 'precio_actual', pr.precio_actual,
                               'precio_propuesto', pr.precio_propuesto, 'moneda', pr.moneda,
                               'rige_desde', pr.rige_desde));
    RETURN;
  END IF;

  SELECT * INTO p FROM public.prestaciones
   WHERE id = pr.prestacion_id AND prestadora_id = v_prest
   FOR UPDATE;
  IF NOT FOUND OR p.estado <> 'vigente' OR p.vigente_hasta IS NOT NULL
     OR p.precio_final <> pr.precio_actual THEN
    RAISE EXCEPTION 'ya_reemplazado' USING ERRCODE = 'P0001';
  END IF;

  -- Rige desde el mes que correspondía, aunque ya haya pasado.
  v_nueva := interno.copiar_renglon('public.prestaciones', p.id, jsonb_build_object(
    'precio_final', v_precio,
    'precio_lista_snapshot', CASE WHEN p.precio_lista_snapshot IS NULL THEN NULL
                                  ELSE round(p.precio_lista_snapshot * v_precio / pr.precio_actual, 2) END,
    'precio_turno_guardia_adicional', CASE WHEN p.precio_turno_guardia_adicional IS NULL THEN NULL
                                     ELSE round(p.precio_turno_guardia_adicional * v_precio / pr.precio_actual, 2) END,
    'precio_hora_adicional', CASE WHEN p.precio_hora_adicional IS NULL THEN NULL
                                  ELSE round(p.precio_hora_adicional * v_precio / pr.precio_actual, 2) END,
    'vigente_desde', pr.rige_desde,
    'vigente_hasta', NULL,
    'requiere_revision', false,
    'prestacion_anterior_id', p.id
  ));

  UPDATE public.propuestas_de_ajuste_por_indice
     SET estado = 'aceptada', revisada_por = v_quien, revisada_en = now(), prestacion_nueva_id = v_nueva
   WHERE id = pr.id;

  INSERT INTO public.registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, detalle)
  VALUES (v_prest, v_quien, 'ajuste_por_indice_aceptado', 'propuestas_de_ajuste_por_indice', pr.id,
          jsonb_build_object('prestacion_id', p.id, 'prestacion_nueva_id', v_nueva,
                             'servicio_id', pr.servicio_id, 'indice', pr.indice,
                             'precio_anterior', pr.precio_actual, 'precio_propuesto', pr.precio_propuesto,
                             'precio_nuevo', v_precio, 'moneda', pr.moneda, 'rige_desde', pr.rige_desde));
END;
$function$;

CREATE OR REPLACE FUNCTION public.sembrar_configuracion_prestadora(p_prestadora_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tabla TEXT;
BEGIN
  IF NOT interno.le_corresponde(p_prestadora_id) THEN
    RAISE EXCEPTION 'sembrar_configuracion_prestadora: esa Prestadora no es la de quien llama';
  END IF;

  -- La fila de los datos de contacto, que ya no lleva el nombre: el de la Prestadora vive en
  -- `prestadoras.nombre_fantasia`, y uno solo.
  INSERT INTO configuracion_prestadora (prestadora_id)
  VALUES (p_prestadora_id)
  ON CONFLICT (prestadora_id) DO NOTHING;

  FOR v_tabla IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_constraint pk ON pk.conrelid = c.oid AND pk.contype = 'p'
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = pk.conkey[1]
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname LIKE 'configuracion\_%'
      AND c.relname <> 'configuracion_prestadora'
      AND array_length(pk.conkey, 1) = 1
      AND a.attname = 'prestadora_id'
    ORDER BY c.relname
  LOOP
    BEGIN
      EXECUTE format(
        'INSERT INTO public.%I (prestadora_id) VALUES ($1) ON CONFLICT DO NOTHING',
        v_tabla
      ) USING p_prestadora_id;
    EXCEPTION WHEN not_null_violation THEN
      RAISE EXCEPTION
        'No se puede sembrar la configuración de la Prestadora: la tabla % tiene una columna obligatoria sin valor de arranque. Póngale un DEFAULT a esa columna, o sáquele la forma de una fila por Prestadora.',
        v_tabla;
    END;
  END LOOP;

  -- Los motivos de cierre con los que arranca. De acá en adelante la lista es de ella: los
  -- puede sacar, apagar, y agregar los suyos.
  INSERT INTO motivos_cierre_servicio (prestadora_id, clave, pide_detalle, orden)
  VALUES
    (p_prestadora_id, 'fin_demanda',           false, 10),
    (p_prestadora_id, 'fallecimiento',         false, 20),
    (p_prestadora_id, 'internacion',           false, 30),
    (p_prestadora_id, 'baja_del_cliente',    false, 40),
    (p_prestadora_id, 'corte_de_pago',         false, 50),
    (p_prestadora_id, 'mudanza_fuera_de_zona', false, 60),
    (p_prestadora_id, 'otro',                  true,  99)
  ON CONFLICT DO NOTHING;

  -- Y las causas de sustitución, con el mismo criterio.
  INSERT INTO motivos_sustitucion_turno_guardia (prestadora_id, clave, pide_detalle, orden)
  VALUES
    (p_prestadora_id, 'emergencia', false, 10),
    (p_prestadora_id, 'otro',       true,  99)
  ON CONFLICT DO NOTHING;

  -- Y cómo puede terminar un turno que quedó sin nadie. Los dos primeros los escribe el motor
  -- cuando la base ya lo dice; los demás los elige quien coordina.
  INSERT INTO finales_turno_guardia_sin_cubrir
    (prestadora_id, clave, es_defecto_grave, pide_detalle, lo_escribe_el_sistema, orden)
  VALUES
    (p_prestadora_id, 'llego_un_relevo',               false, false, true,  10),
    (p_prestadora_id, 'ya_no_hacia_falta',             false, false, true,  20),
    (p_prestadora_id, 'lo_cubrio_la_coordinadora',     false, false, false, 30),
    (p_prestadora_id, 'se_extendio_el_turno_guardia',          false, false, false, 40),
    (p_prestadora_id, 'quedo_solo_con_consentimiento', true,  false, false, 50),
    (p_prestadora_id, 'no_fue_nadie',                  true,  false, false, 60),
    (p_prestadora_id, 'se_resolvio_de_otra_manera',    false, true,  false, 99)
  ON CONFLICT DO NOTHING;

  -- Y los motivos con los que se resuelve una postulación o una Guardia. La lista la arma
  -- `sembrar_motivos_resolucion`, que sigue siendo el punto único: acá se la llama, no se la copia.
  PERFORM sembrar_motivos_resolucion(p_prestadora_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.sembrar_motivos_resolucion(p_prestadora_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into motivos_resolucion
    (prestadora_id, tabla, estado, nombre_es_ar, nombre_en, nombre_pt_br, pide_detalle, orden)
  values
    -- Postulaciones.
    (p_prestadora_id, 'postulaciones', 'en_revision',
     'Pasa a revisión', 'Moves to review', 'Passa para análise', false, 10),
    (p_prestadora_id, 'postulaciones', 'aprobado',
     'Reúne lo que el puesto pide', 'Meets what the role requires', 'Atende ao que a vaga exige', false, 20),
    (p_prestadora_id, 'postulaciones', 'rechazado',
     'No reúne la experiencia pedida', 'Does not have the required experience', 'Não tem a experiência exigida', false, 30),
    (p_prestadora_id, 'postulaciones', 'rechazado',
     'Queda fuera de las zonas cubiertas', 'Outside the areas covered', 'Fora das áreas atendidas', false, 40),
    (p_prestadora_id, 'postulaciones', 'rechazado',
     'No se presentó a la entrevista', 'Did not attend the interview', 'Não compareceu à entrevista', false, 50),
    (p_prestadora_id, 'postulaciones', 'rechazado',
     'Pidió retirar su postulación', 'Asked to withdraw the application', 'Pediu para retirar a candidatura', false, 60),
    (p_prestadora_id, 'postulaciones', 'rechazado',
     'Otro motivo', 'Other reason', 'Outro motivo', true, 99),
    -- Guardias. Por ahora sólo las canceladas: es la decisión que se toma mirando la Guardia y que
    -- hasta hoy no dejaba rastro. La llegada y la salida las escribe el motor cuando pasan, y no
    -- se resuelven con un motivo porque no son una decisión sino un hecho.
    (p_prestadora_id, 'turnos_guardia', 'cancelada',
     'El Cliente la dio de baja', 'The Client cancelled it', 'O Cliente cancelou', false, 10),
    (p_prestadora_id, 'turnos_guardia', 'cancelada',
     'El Paciente quedó internado', 'The Patient was admitted to hospital', 'O Paciente ficou internado', false, 20),
    (p_prestadora_id, 'turnos_guardia', 'cancelada',
     'No se consiguió quién la cubriera', 'Nobody could be found to cover it', 'Não foi possível encontrar quem cobrisse', false, 30),
    (p_prestadora_id, 'turnos_guardia', 'cancelada',
     'Terminó el Servicio', 'The Service ended', 'O Serviço terminou', false, 40),
    (p_prestadora_id, 'turnos_guardia', 'cancelada',
     'Se había cargado por error', 'It had been entered by mistake', 'Tinha sido cadastrado por engano', false, 50),
    (p_prestadora_id, 'turnos_guardia', 'cancelada',
     'Otro motivo', 'Other reason', 'Outro motivo', true, 99),
    -- Por qué un Asistente rechaza el turno que se le asignó.
    (p_prestadora_id, 'asignaciones_de_turno_guardia', 'rechazada',
     'Problema de salud', 'Health problem', 'Problema de saúde', false, 10),
    (p_prestadora_id, 'asignaciones_de_turno_guardia', 'rechazada',
     'Compromiso personal o familiar', 'Personal or family commitment', 'Compromisso pessoal ou familiar', false, 20),
    (p_prestadora_id, 'asignaciones_de_turno_guardia', 'rechazada',
     'Viaje o ausencia', 'Travel or absence', 'Viagem ou ausência', false, 30),
    (p_prestadora_id, 'asignaciones_de_turno_guardia', 'rechazada',
     'Distancia al domicilio', 'Distance to the home', 'Distância até o domicílio', false, 40),
    (p_prestadora_id, 'asignaciones_de_turno_guardia', 'rechazada',
     'Otro', 'Other', 'Outro', true, 99)
  on conflict do nothing;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sincronizar_paciente_principal_de_turno_guardia()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.paciente_id IS DISTINCT FROM NEW.paciente_id THEN
    DELETE FROM turno_guardia_pacientes
    WHERE turno_guardia_id = NEW.id AND paciente_id = OLD.paciente_id;
  END IF;

  IF NEW.paciente_id IS NOT NULL THEN
    INSERT INTO turno_guardia_pacientes (turno_guardia_id, paciente_id, prestadora_id)
    VALUES (NEW.id, NEW.paciente_id, NEW.prestadora_id)
    ON CONFLICT (turno_guardia_id, paciente_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.sincronizar_paciente_principal_de_turno_guardia() IS 'Puente temporal: mantiene en turno_guardia_pacientes al Paciente escrito en la columna vieja turnos_guardia.paciente_id. Se borra junto con esa columna.';
CREATE OR REPLACE FUNCTION public.sincronizar_paciente_principal_de_serie()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.paciente_id IS DISTINCT FROM NEW.paciente_id THEN
    DELETE FROM series_turnos_guardia_pacientes
    WHERE serie_id = NEW.id AND paciente_id = OLD.paciente_id;
  END IF;

  IF NEW.paciente_id IS NOT NULL THEN
    INSERT INTO series_turnos_guardia_pacientes (serie_id, paciente_id, prestadora_id)
    VALUES (NEW.id, NEW.paciente_id, NEW.prestadora_id)
    ON CONFLICT (serie_id, paciente_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.sincronizar_paciente_principal_de_serie() IS 'Puente temporal: mantiene en series_turnos_guardia_pacientes al Paciente escrito en la columna vieja series_turnos_guardia.paciente_id. Se borra junto con esa columna.';
CREATE OR REPLACE FUNCTION public.turnos_guardia_que_traban_la_desactivacion(p_usuario uuid)
 RETURNS TABLE(tipo text, id uuid, fecha date, hora_inicio time without time zone, hora_fin time without time zone, dias_hasta_el_fin smallint, checkin_at timestamp with time zone, cliente text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid;
BEGIN
  IF auth.jwt() ->> 'role' IS DISTINCT FROM 'trabajo_sin_persona' THEN RETURN; END IF;
  v_prestadora := interno.prestadora_actual();
  IF v_prestadora IS NULL OR p_usuario IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM interno.turnos_guardia_que_traban_la_desactivacion(p_usuario, v_prestadora);
END;
$function$;

CREATE OR REPLACE FUNCTION public.validar_paciente_de_serie_mismo_cliente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cliente_de_la_serie UUID;
  cliente_del_paciente UUID;
BEGIN
  SELECT p.cliente_id INTO cliente_de_la_serie
    FROM series_turnos_guardia s JOIN pacientes p ON p.id = s.paciente_id
   WHERE s.id = NEW.serie_id;

  SELECT cliente_id INTO cliente_del_paciente FROM pacientes WHERE id = NEW.paciente_id;

  IF cliente_de_la_serie IS NULL OR cliente_del_paciente IS NULL
     OR cliente_de_la_serie <> cliente_del_paciente THEN
    RAISE EXCEPTION 'Todos los Pacientes de una serie tienen que ser de el mismo Cliente';
  END IF;

  RETURN NEW;
END;
$function$;


-- 5c. Vuelven las políticas que usaban las funciones recreadas.
CREATE POLICY coordinador_gestiona_alertas_turno_guardia_de_sus_servicios ON public.alertas_tempranas_turno_guardia AS PERMISSIVE FOR ALL TO authenticated
  USING (((prestadora_id = interno.prestadora_actual()) AND interno.coordinador_ve_el_turno_guardia(turno_guardia_id)));
CREATE POLICY coordinador_lee_reasignaciones_de_lo_que_ve ON public.auditoria_reasignaciones_por_emergencia AS PERMISSIVE FOR SELECT TO authenticated
  USING (((prestadora_id = interno.prestadora_actual()) AND interno.es_coordinador() AND interno.coordinador_ve_el_turno_guardia(turno_guardia_id)));
CREATE POLICY admin_prestadora_actualiza_visibilidad ON public.calificaciones_asistente AS PERMISSIVE FOR UPDATE TO public
  USING (((prestadora_id = interno.prestadora_actual()) AND interno.personal_ve_la_calificacion(asistente_id, turno_guardia_id)));
CREATE POLICY cliente_califica_al_asistente ON public.calificaciones_asistente AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((cliente_id = interno.cliente_id_de_usuario(auth.uid())) AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_califica_al_asistente'::text) AND (prestadora_id = interno.prestadora_actual()) AND (paciente_id IN ( SELECT interno.pacientes_del_cliente() AS pacientes_del_cliente)) AND (paciente_id IN ( SELECT interno.pacientes_del_turno_guardia(calificaciones_asistente.turno_guardia_id) AS pacientes_del_turno_guardia)) AND (asistente_id = interno.asistente_del_turno_guardia(turno_guardia_id))));
CREATE POLICY prestadora_ve_calificaciones ON public.calificaciones_asistente AS PERMISSIVE FOR SELECT TO authenticated
  USING (((prestadora_id = interno.prestadora_actual()) AND interno.personal_ve_la_calificacion(asistente_id, turno_guardia_id)));
CREATE POLICY coordinador_gestiona_consentimientos_paciente_solo ON public.consentimientos_paciente_solo AS PERMISSIVE FOR ALL TO authenticated
  USING (((prestadora_id = interno.prestadora_actual()) AND interno.coordinador_ve_el_turno_guardia(turno_guardia_id)));
CREATE POLICY coordinador_ve_consultas_de_relevo_de_sus_servicios ON public.consultas_de_relevo AS PERMISSIVE FOR SELECT TO authenticated
  USING (((prestadora_id = interno.prestadora_actual()) AND (EXISTS ( SELECT 1
   FROM incidentes_relevo i
  WHERE ((i.id = consultas_de_relevo.incidente_id) AND (interno.coordinador_ve_el_turno_guardia(i.turno_guardia_entrante_id) OR interno.coordinador_ve_el_turno_guardia(i.turno_guardia_saliente_id)))))));
CREATE POLICY coordinador_lee_descansos_de_sus_servicios ON public.descansos_turno_guardia AS PERMISSIVE FOR SELECT TO authenticated
  USING (((prestadora_id = interno.prestadora_actual()) AND interno.coordinador_ve_el_turno_guardia(turno_guardia_id)));
CREATE POLICY coordinador_atiende_una_emergencia_de_sus_servicios_o_tomada ON public.emergencias_turno_guardia AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((prestadora_id = interno.prestadora_actual()) AND interno.es_coordinador() AND (atendida_at IS NULL) AND (interno.coordinador_ve_el_turno_guardia(turno_guardia_id) OR (id = ANY (( SELECT interno.alarmas_que_tengo_tomadas('emergencia_turno_guardia'::text) AS alarmas_que_tengo_tomadas)::uuid[])))))
  WITH CHECK (((prestadora_id = interno.prestadora_actual()) AND interno.es_coordinador() AND (atendida_at IS NOT NULL) AND (atendida_por = auth.uid())));
CREATE POLICY coordinador_lee_emergencias_de_sus_servicios ON public.emergencias_turno_guardia AS PERMISSIVE FOR SELECT TO authenticated
  USING (((prestadora_id = interno.prestadora_actual()) AND interno.coordinador_ve_el_turno_guardia(turno_guardia_id)));
CREATE POLICY la_informacion_de_salud_la_ve_quien_atiende ON public.emergencias_turno_guardia AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM interno.pacientes_del_turno_guardia(emergencias_turno_guardia.turno_guardia_id) pg(paciente_id)
  WHERE interno.alcanza_la_informacion_de_salud(pg.paciente_id))) OR (id = ANY (( SELECT interno.alarmas_a_la_vista_del_coordinador('emergencia_turno_guardia'::text) AS alarmas_a_la_vista_del_coordinador)::uuid[]))));
CREATE POLICY coordinador_gestiona_excepciones_de_relevo_de_sus_servicios ON public.excepciones_familiar_relevo AS PERMISSIVE FOR ALL TO authenticated
  USING (((prestadora_id = interno.prestadora_actual()) AND interno.coordinador_ve_el_turno_guardia(turno_guardia_id)));
CREATE POLICY coordinador_lee_extensiones_de_turno_guardia ON public.extensiones_de_turno_guardia AS PERMISSIVE FOR SELECT TO authenticated
  USING (((prestadora_id = interno.prestadora_actual()) AND interno.coordinador_ve_el_turno_guardia(turno_guardia_id)));
CREATE POLICY coordinador_gestiona_comprobaciones_de_sus_servicios ON public.turno_guardia_comprobaciones AS PERMISSIVE FOR ALL TO authenticated
  USING (((prestadora_id = interno.prestadora_actual()) AND interno.coordinador_ve_el_turno_guardia(turno_guardia_id)));
CREATE POLICY el_panel_arma_la_lista_de_pacientes ON public.turno_guardia_pacientes AS PERMISSIVE FOR ALL TO authenticated
  USING (((prestadora_id = interno.prestadora_actual()) AND (interno.es_superadmin() OR interno.es_admin_prestadora() OR interno.coordinador_ve_el_turno_guardia(turno_guardia_id))))
  WITH CHECK (((prestadora_id = interno.prestadora_actual()) AND (interno.es_superadmin() OR interno.es_admin_prestadora() OR interno.coordinador_ve_el_turno_guardia(turno_guardia_id))));
CREATE POLICY coordinador_gestiona_turnos_guardia_de_sus_servicios ON public.turnos_guardia AS PERMISSIVE FOR ALL TO authenticated
  USING (((prestadora_id = interno.prestadora_actual()) AND interno.es_coordinador() AND interno.coordinador_alcanza_el_turno_guardia_de(servicio_id, paciente_id, id)));
CREATE POLICY coordinador_gestiona_turnos_guardia_gps_de_sus_servicios ON public.turnos_guardia_tracking_gps AS PERMISSIVE FOR ALL TO authenticated
  USING (((prestadora_id = interno.prestadora_actual()) AND interno.coordinador_ve_el_turno_guardia(turno_guardia_id)));
CREATE POLICY coordinador_gestiona_incidentes_relevo_de_sus_servicios ON public.incidentes_relevo AS PERMISSIVE FOR ALL TO authenticated
  USING (((prestadora_id = interno.prestadora_actual()) AND (interno.coordinador_ve_el_turno_guardia(turno_guardia_entrante_id) OR interno.coordinador_ve_el_turno_guardia(turno_guardia_saliente_id))));
CREATE POLICY coordinador_gestiona_incidentes_turno_guardia_sin_cubrir ON public.incidentes_turno_guardia_sin_cubrir AS PERMISSIVE FOR ALL TO authenticated
  USING (((prestadora_id = interno.prestadora_actual()) AND interno.coordinador_ve_el_turno_guardia(turno_guardia_id)));
CREATE POLICY coordinador_gestiona_reportes_de_sus_servicios ON public.reportes AS PERMISSIVE FOR ALL TO authenticated
  USING (((prestadora_id = interno.prestadora_actual()) AND interno.coordinador_ve_el_turno_guardia(turno_guardia_id)));
-- Políticas del depósito de archivos, con las tablas renombradas.
CREATE POLICY reportes_asistente_lee_fotos_de_sus_turnos_guardia ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING (((bucket_id = 'reportes-fotos'::text) AND ((storage.foldername(name))[1] = (interno.prestadora_actual())::text) AND (EXISTS ( SELECT 1
   FROM turnos_guardia g
  WHERE ((g.asistente_id = interno.asistente_de_la_sesion()) AND (g.prestadora_id = interno.prestadora_actual()) AND ((storage.foldername(objects.name))[2] = (g.id)::text))))));
CREATE POLICY reportes_asistente_sube_foto_de_su_turno_guardia ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'reportes-fotos'::text) AND ((storage.foldername(name))[1] = (interno.prestadora_actual())::text) AND (EXISTS ( SELECT 1
   FROM turnos_guardia g
  WHERE ((g.asistente_id = interno.asistente_de_la_sesion()) AND (g.prestadora_id = interno.prestadora_actual()) AND ((storage.foldername(objects.name))[2] = (g.id)::text))))));

-- 5d. Políticas cuya expresión compara contra un valor que cambió de nombre o guarda un nombre viejo como alias.
ALTER POLICY asistente_anota_el_envio_de_su_aviso_de_demora ON public.alertas_tempranas_turno_guardia
  USING (((prestadora_id = interno.prestadora_actual()) AND (fuente = 'aviso_demora_asistente'::text) AND (reportado_por = auth.uid()) AND (EXISTS ( SELECT 1
   FROM turnos_guardia g
  WHERE ((g.id = alertas_tempranas_turno_guardia.turno_guardia_id) AND (g.asistente_id = interno.asistente_de_la_sesion()))))))
  WITH CHECK (((prestadora_id = interno.prestadora_actual()) AND (fuente = 'aviso_demora_asistente'::text) AND (reportado_por = auth.uid()) AND (resuelto_at IS NULL) AND (EXISTS ( SELECT 1
   FROM turnos_guardia g
  WHERE ((g.id = alertas_tempranas_turno_guardia.turno_guardia_id) AND (g.asistente_id = interno.asistente_de_la_sesion()))))));
ALTER POLICY asistente_avisa_demora_en_su_turno_guardia ON public.alertas_tempranas_turno_guardia
  WITH CHECK (((prestadora_id = interno.prestadora_actual()) AND (fuente = 'aviso_demora_asistente'::text) AND (reportado_por = auth.uid()) AND (EXISTS ( SELECT 1
   FROM turnos_guardia g
  WHERE ((g.id = alertas_tempranas_turno_guardia.turno_guardia_id) AND (g.asistente_id = interno.asistente_de_la_sesion()))))));
ALTER POLICY asistente_ve_su_aviso_de_demora ON public.alertas_tempranas_turno_guardia
  USING (((prestadora_id = interno.prestadora_actual()) AND (fuente = 'aviso_demora_asistente'::text) AND (EXISTS ( SELECT 1
   FROM turnos_guardia g
  WHERE ((g.id = alertas_tempranas_turno_guardia.turno_guardia_id) AND (g.asistente_id = interno.asistente_de_la_sesion()))))));
ALTER POLICY coordinador_resuelve_la_alarma_que_tomo ON public.alertas_tempranas_turno_guardia
  USING (((prestadora_id = interno.prestadora_actual()) AND interno.es_coordinador() AND (id = ANY (( SELECT interno.alarmas_que_tengo_tomadas('alerta_temprana_turno_guardia'::text) AS alarmas_que_tengo_tomadas)::uuid[]))))
  WITH CHECK ((prestadora_id = interno.prestadora_actual()));
ALTER POLICY coordinador_ve_la_alarma_que_llego_a_todos ON public.alertas_tempranas_turno_guardia
  USING (((prestadora_id = interno.prestadora_actual()) AND (id = ANY (( SELECT interno.alarmas_a_la_vista_del_coordinador('alerta_temprana_turno_guardia'::text) AS alarmas_a_la_vista_del_coordinador)::uuid[]))));
ALTER POLICY se_anota_al_reasignar_por_emergencia ON public.auditoria_reasignaciones_por_emergencia
  WITH CHECK (((prestadora_id = interno.prestadora_actual()) AND (usuario_id = interno.usuario_de_la_sesion()) AND (current_setting('careonys.reasignacion_por_emergencia'::text, true) = (turno_guardia_id)::text)));
ALTER POLICY asistente_empieza_descanso_en_su_turno_guardia ON public.descansos_turno_guardia
  WITH CHECK (((prestadora_id = interno.prestadora_actual()) AND (registrado_por = auth.uid()) AND (fin_at IS NULL) AND (EXISTS ( SELECT 1
   FROM turnos_guardia g
  WHERE ((g.id = descansos_turno_guardia.turno_guardia_id) AND (g.asistente_id = interno.asistente_de_la_sesion()))))));
ALTER POLICY asistente_termina_su_descanso ON public.descansos_turno_guardia
  USING (((prestadora_id = interno.prestadora_actual()) AND (fin_at IS NULL) AND (EXISTS ( SELECT 1
   FROM turnos_guardia g
  WHERE ((g.id = descansos_turno_guardia.turno_guardia_id) AND (g.asistente_id = interno.asistente_de_la_sesion()))))))
  WITH CHECK (((prestadora_id = interno.prestadora_actual()) AND (EXISTS ( SELECT 1
   FROM turnos_guardia g
  WHERE ((g.id = descansos_turno_guardia.turno_guardia_id) AND (g.asistente_id = interno.asistente_de_la_sesion()))))));
ALTER POLICY asistente_ve_descansos_de_su_turno_guardia ON public.descansos_turno_guardia
  USING (((prestadora_id = interno.prestadora_actual()) AND (EXISTS ( SELECT 1
   FROM turnos_guardia g
  WHERE ((g.id = descansos_turno_guardia.turno_guardia_id) AND (g.asistente_id = interno.asistente_de_la_sesion()))))));
ALTER POLICY asistente_anota_el_envio_de_su_emergencia ON public.emergencias_turno_guardia
  USING (((prestadora_id = interno.prestadora_actual()) AND (reportado_por = auth.uid()) AND (EXISTS ( SELECT 1
   FROM turnos_guardia g
  WHERE ((g.id = emergencias_turno_guardia.turno_guardia_id) AND (g.asistente_id = interno.asistente_de_la_sesion()))))))
  WITH CHECK (((prestadora_id = interno.prestadora_actual()) AND (reportado_por = auth.uid()) AND (atendida_at IS NULL) AND (atendida_por IS NULL) AND (atendida_nota IS NULL) AND (EXISTS ( SELECT 1
   FROM turnos_guardia g
  WHERE ((g.id = emergencias_turno_guardia.turno_guardia_id) AND (g.asistente_id = interno.asistente_de_la_sesion()))))));
ALTER POLICY asistente_avisa_emergencia_en_su_turno_guardia ON public.emergencias_turno_guardia
  WITH CHECK (((prestadora_id = interno.prestadora_actual()) AND (reportado_por = auth.uid()) AND (atendida_at IS NULL) AND (atendida_por IS NULL) AND (atendida_nota IS NULL) AND (EXISTS ( SELECT 1
   FROM turnos_guardia g
  WHERE ((g.id = emergencias_turno_guardia.turno_guardia_id) AND (g.asistente_id = interno.asistente_de_la_sesion()))))));
ALTER POLICY asistente_ve_emergencias_de_su_turno_guardia ON public.emergencias_turno_guardia
  USING (((prestadora_id = interno.prestadora_actual()) AND (EXISTS ( SELECT 1
   FROM turnos_guardia g
  WHERE ((g.id = emergencias_turno_guardia.turno_guardia_id) AND (g.asistente_id = interno.asistente_de_la_sesion()))))));
ALTER POLICY coordinador_ve_la_alarma_que_llego_a_todos ON public.emergencias_turno_guardia
  USING (((prestadora_id = interno.prestadora_actual()) AND (id = ANY (( SELECT interno.alarmas_a_la_vista_del_coordinador('emergencia_turno_guardia'::text) AS alarmas_a_la_vista_del_coordinador)::uuid[]))));
ALTER POLICY coordinador_registra_lo_que_paso_en_la_alarma_que_tomo ON public.excepciones_familiar_relevo
  USING (((prestadora_id = interno.prestadora_actual()) AND (turno_guardia_id = ANY (( SELECT interno.turnos_guardia_a_la_vista_por_una_alarma(true) AS turnos_guardia_a_la_vista_por_una_alarma)::uuid[]))))
  WITH CHECK (((prestadora_id = interno.prestadora_actual()) AND (turno_guardia_id = ANY (( SELECT interno.turnos_guardia_a_la_vista_por_una_alarma(true) AS turnos_guardia_a_la_vista_por_una_alarma)::uuid[]))));
ALTER POLICY asistente_ve_la_extension_de_su_turno_guardia ON public.extensiones_de_turno_guardia
  USING (((prestadora_id = interno.prestadora_actual()) AND (EXISTS ( SELECT 1
   FROM turnos_guardia g
  WHERE ((g.id = extensiones_de_turno_guardia.turno_guardia_id) AND (g.asistente_id = interno.asistente_de_la_sesion()))))));
ALTER POLICY asistente_ve_sus_comprobaciones ON public.turno_guardia_comprobaciones
  USING (((prestadora_id = interno.prestadora_actual()) AND (EXISTS ( SELECT 1
   FROM turnos_guardia g
  WHERE ((g.id = turno_guardia_comprobaciones.turno_guardia_id) AND (g.asistente_id = interno.asistente_de_la_sesion()))))));
ALTER POLICY se_ven_los_pacientes_de_un_turno_guardia_visible ON public.turno_guardia_pacientes
  USING ((EXISTS ( SELECT 1
   FROM turnos_guardia g
  WHERE (g.id = turno_guardia_pacientes.turno_guardia_id))));
ALTER POLICY coordinador_cierra_servicio_turnos_guardia ON public.turnos_guardia
  USING (((prestadora_id = interno.prestadora_actual()) AND interno.es_coordinador() AND interno.coordina_el_servicio(servicio_id) AND (EXISTS ( SELECT 1
   FROM cierres_servicio_paciente c
  WHERE ((c.servicio_id = turnos_guardia.servicio_id) AND (c.prestadora_id = turnos_guardia.prestadora_id))))))
  WITH CHECK (((prestadora_id = interno.prestadora_actual()) AND interno.es_coordinador() AND interno.coordina_el_servicio(servicio_id) AND (EXISTS ( SELECT 1
   FROM cierres_servicio_paciente c
  WHERE ((c.servicio_id = turnos_guardia.servicio_id) AND (c.prestadora_id = turnos_guardia.prestadora_id))))));
ALTER POLICY coordinador_resuelve_el_turno_guardia_de_una_alarma_que_tomo ON public.turnos_guardia
  USING (((prestadora_id = interno.prestadora_actual()) AND (id = ANY (( SELECT interno.turnos_guardia_a_la_vista_por_una_alarma(true) AS turnos_guardia_a_la_vista_por_una_alarma)::uuid[]))))
  WITH CHECK ((prestadora_id = interno.prestadora_actual()));
ALTER POLICY coordinador_ve_el_turno_guardia_de_una_alarma_que_llego_a_todos ON public.turnos_guardia
  USING (((prestadora_id = interno.prestadora_actual()) AND (id = ANY (( SELECT interno.turnos_guardia_a_la_vista_por_una_alarma(false) AS turnos_guardia_a_la_vista_por_una_alarma)::uuid[]))));
ALTER POLICY coordinador_resuelve_la_alarma_que_tomo ON public.incidentes_turno_guardia_sin_cubrir
  USING (((prestadora_id = interno.prestadora_actual()) AND interno.es_coordinador() AND (id = ANY (( SELECT interno.alarmas_que_tengo_tomadas('incidente_turno_guardia_sin_cubrir'::text) AS alarmas_que_tengo_tomadas)::uuid[]))))
  WITH CHECK ((prestadora_id = interno.prestadora_actual()));
ALTER POLICY coordinador_ve_la_alarma_que_llego_a_todos ON public.incidentes_turno_guardia_sin_cubrir
  USING (((prestadora_id = interno.prestadora_actual()) AND (id = ANY (( SELECT interno.alarmas_a_la_vista_del_coordinador('incidente_turno_guardia_sin_cubrir'::text) AS alarmas_a_la_vista_del_coordinador)::uuid[]))));
ALTER POLICY asistente_lee_motivos_de_rechazo ON public.motivos_resolucion
  USING (((prestadora_id = interno.prestadora_actual()) AND (tabla = 'asignaciones_de_turno_guardia'::text) AND interno.es_asistente()));
ALTER POLICY asistente_carga_reportes_de_su_turno_guardia ON public.reportes
  WITH CHECK (((prestadora_id = interno.prestadora_actual()) AND (EXISTS ( SELECT 1
   FROM turnos_guardia g
  WHERE ((g.id = reportes.turno_guardia_id) AND (g.asistente_id = interno.asistente_de_la_sesion()))))));
ALTER POLICY asistente_lee_reportes_de_su_turno_guardia ON public.reportes
  USING (((prestadora_id = interno.prestadora_actual()) AND (EXISTS ( SELECT 1
   FROM turnos_guardia g
  WHERE ((g.id = reportes.turno_guardia_id) AND (g.asistente_id = interno.asistente_de_la_sesion()))))));
ALTER POLICY asistente_lee_sus_resoluciones ON public.resoluciones
  USING (((prestadora_id = interno.prestadora_actual()) AND (tabla = 'asignaciones_de_turno_guardia'::text) AND (EXISTS ( SELECT 1
   FROM asignaciones_de_turno_guardia a
  WHERE (((a.id)::text = resoluciones.fila_id) AND (a.asistente_id = interno.asistente_de_la_sesion()))))));
ALTER POLICY asistente_resuelve_su_asignacion ON public.resoluciones
  WITH CHECK (((prestadora_id = interno.prestadora_actual()) AND (tabla = 'asignaciones_de_turno_guardia'::text) AND (EXISTS ( SELECT 1
   FROM asignaciones_de_turno_guardia a
  WHERE (((a.id)::text = resoluciones.fila_id) AND (a.asistente_id = interno.asistente_de_la_sesion()))))));
ALTER POLICY coordinador_cierra_servicio_series_turnos_guardia ON public.series_turnos_guardia
  USING (((prestadora_id = interno.prestadora_actual()) AND interno.es_coordinador() AND interno.coordina_el_servicio(servicio_id) AND (EXISTS ( SELECT 1
   FROM cierres_servicio_paciente c
  WHERE ((c.servicio_id = series_turnos_guardia.servicio_id) AND (c.prestadora_id = series_turnos_guardia.prestadora_id))))))
  WITH CHECK (((prestadora_id = interno.prestadora_actual()) AND interno.es_coordinador() AND interno.coordina_el_servicio(servicio_id) AND (EXISTS ( SELECT 1
   FROM cierres_servicio_paciente c
  WHERE ((c.servicio_id = series_turnos_guardia.servicio_id) AND (c.prestadora_id = series_turnos_guardia.prestadora_id))))));
ALTER POLICY se_ven_los_pacientes_de_una_serie_visible ON public.series_turnos_guardia_pacientes
  USING ((EXISTS ( SELECT 1
   FROM series_turnos_guardia s
  WHERE (s.id = series_turnos_guardia_pacientes.serie_id))));

-- Comentarios de tablas y columnas.
COMMENT ON COLUMN public.asignaciones_de_turno_guardia.serie_id IS 'El turno de guardia fijo asignado entero. Se acepta o se rechaza una vez por todos sus días.';
COMMENT ON COLUMN public.asistentes.disponible IS 'Lo decide el Asistente desde su aplicacion, no la Prestadora. En false, el aviso automatico de relevo no le escribe y en la lista de candidatos queda con su motivo. No cambia ningun turno de guardia ya asignado. Distinto de asistentes.estado, que es la decision administrativa de la Prestadora.';
COMMENT ON COLUMN public.coberturas_de_ausencia.aceptada_at IS 'Cuándo la aceptó el sustituto. Hasta entonces no cubre ningún turno de guardia.';
COMMENT ON COLUMN public.configuracion_aviso_turno_guardia_sin_cubrir.horas_antes IS 'Con cuánta anticipación avisar. El aviso arranca cuando faltan estas horas para que empiece el turno de guardia.';
COMMENT ON COLUMN public.configuracion_escalada_coordinador.horas_antes_aviso_grave_sin_cerrar IS 'Cuántas horas después de vencido el plazo de cierre el aviso escala al evento turno_guardia_sin_cerrar_grave, que tiene su propia lista de destinatarios. Sale una sola vez por turno de guardia.';
COMMENT ON COLUMN public.excepciones_familiar_relevo.origen IS 'Por cual de los tres caminos el turno de guardia quedo sin nadie: relevo, turno_guardia_sin_cubrir o extension.';
COMMENT ON COLUMN public.extensiones_de_turno_guardia.desde_at IS 'La hora de fin de su propio turno de guardia, no cuando el sistema se dio cuenta.';
COMMENT ON COLUMN public.finales_turno_guardia_sin_cubrir.lo_escribe_el_sistema IS 'El final no se elige: lo escribe el motor cuando la base ya dice que el turno de guardia termino asi. No se ofrece para elegir y no se puede apagar.';
COMMENT ON COLUMN public.turno_guardia_comprobaciones.motivo_sin_comprobar IS 'Por qué se entró sin comprobar. El turno de guardia nunca se traba: si en la Prestadora no atiende nadie, el Asistente elige un motivo, entra a trabajar, y esto queda en la lista del Coordinador.';
COMMENT ON COLUMN public.turnos_guardia.asistente_id IS 'NULL = turno de guardia sin cubrir. Es un estado normal y esperado, no un dato faltante.';
COMMENT ON COLUMN public.turnos_guardia.aviso_sin_cerrar_grave_at IS 'Cuándo se avisó por el evento turno_guardia_sin_cerrar_grave. Nulo mientras no se haya escalado.';
COMMENT ON COLUMN public.turnos_guardia.aviso_sin_cubrir_at IS 'Última vez que se le avisó al Coordinador que este turno de guardia sigue sin cubrir. NULL = nunca se avisó.';
COMMENT ON COLUMN public.turnos_guardia.cerrada_at IS 'Cuándo se dio por terminado el turno de guardia. Es distinto de checkout_at: esa es la hora en que el Asistente marcó que se iba de la casa, y esta es la hora en que alguien confirmó que el turno de guardia quedó cerrado.';
COMMENT ON COLUMN public.turnos_guardia.cerrada_origen IS 'Desde dónde se cerró: asistente (marcó la salida en su teléfono) o panel (lo cerró una persona de la Prestadora porque quedó sin cerrar). Cuando dice panel, el turno de guardia NO tiene hora ni lugar de salida, y el informe a la Obra Social tiene que leerlo así.';
COMMENT ON COLUMN public.turnos_guardia.dias_hasta_el_fin IS 'Cuantos dias despues de fecha termina el turno de guardia: 0 el mismo dia, 1 al siguiente, 2 dos dias despues. Permite los turnos de guardia de 24, 48 y 72 horas.';
COMMENT ON COLUMN public.turnos_guardia.horas_extra IS 'Horas de mas autorizadas en este turno de guardia, anotadas cuando pasaron. No se deducen de la diferencia entre la marca de salida y la hora de fin planificada: irse tarde no es una hora extra autorizada.';
COMMENT ON COLUMN public.turnos_guardia.paciente_id IS 'EN RETIRO. Guarda a uno solo de los Pacientes del turno de guardia, el primero. La lista completa vive en turno_guardia_pacientes. Sigue acá únicamente para que las pantallas todavía sin actualizar no se rompan; se elimina cuando ninguna la lea.';
COMMENT ON COLUMN public.turnos_guardia_cobertura.asistente_titular_id IS 'A quién le tocaba ese turno de guardia antes de la sustitución. El turno de guardia en sí pasa a nombre de quien lo hace, que es el sustituto; que el titular haya faltado se ve en su ausencia, no acá. Vacío en las coberturas anotadas antes de que existiera esta columna.';
COMMENT ON COLUMN public.turnos_guardia_cobertura.costo_adicional IS 'Lo que la sustitución le cuesta de más a la Prestadora, aparte de lo que se le paga al sustituto por el turno de guardia. La remuneración del sustituto no se escribe acá: el turno de guardia quedó a su nombre, así que se liquida con su propio valor, como la de cualquiera.';
COMMENT ON COLUMN public.turnos_guardia_cobertura.motivo IS 'Causa de la sustitución: la clave o el nombre de una fila de motivos_sustitucion_turno_guardia. Vacío en las coberturas anotadas antes de que existiera el catálogo.';
COMMENT ON COLUMN public.incidentes_turno_guardia_sin_cubrir.resuelto_como IS 'Como termino el turno de guardia: la clave o el nombre de una fila de finales_turno_guardia_sin_cubrir. Si eso fue un defecto grave lo dice esa fila, no esta tabla. Los expedientes cerrados antes del catalogo guardan uno de los tres finales viejos.';
COMMENT ON COLUMN public.liquidaciones_asistente.horas_extra IS 'Horas de mas pagadas en este periodo, sumadas de los turnos de guardia. Se copian al generar y no se vuelven a mirar de donde salieron.';
COMMENT ON COLUMN public.prestaciones.precio_turno_guardia_adicional IS 'Precio pactado de cada turno de guardia adicional, en la moneda de la prestación. Vacío: la factura la valúa en proporción al precio pactado. Cambia con el precio cuando se ajusta.';
COMMENT ON COLUMN public.prestadoras.control_de_ubicacion_en_el_turno_guardia IS 'Verdadero: viaje y turno de guardia. Falso: sólo viaje. De fábrica, viaje y turno de guardia.';
COMMENT ON COLUMN public.prestadoras.control_de_ubicacion_en_el_turno_guardia_desde IS 'Desde cuándo la Prestadora tiene viaje y turno de guardia. Vacía con sólo viaje. La pone la base.';
COMMENT ON COLUMN public.prestadoras.dias_para_aceptar_la_ubicacion IS 'Días que tiene el Asistente para aceptar el registro de su ubicación durante el turno de guardia, desde que la Prestadora eligió viaje y turno de guardia. De fábrica, 30.';
COMMENT ON COLUMN public.prestadoras.turnos_guardia_solo_con_firma_del_pagador IS 'Verdadero: un Servicio programa turnos de guardia sólo con la firma vigente del Responsable de pagos. De fábrica, falso.';
COMMENT ON COLUMN public.prestadoras.minutos_aviso_previo_turno_guardia IS 'Cuántos minutos antes de que empiece el turno de guardia se le manda el recordatorio al Asistente. De fábrica, 60. El tope es un día entero; menos de cinco minutos no llegaría a tiempo de servir para nada.';
COMMENT ON COLUMN public.prestadoras.minutos_entre_controles_de_ubicacion IS 'Cada cuántos minutos se controla la ubicación durante el turno de guardia, cuando la Prestadora eligió viaje y turno de guardia. De fábrica, 5.';
COMMENT ON COLUMN public.prestadoras.registro_de_accesos_horas_alrededor_del_turno_guardia IS 'Horas antes y después de un turno de guardia en las que el Asistente todavía atiende a ese Paciente.';
COMMENT ON COLUMN public.remuneraciones_asistente.unidad_medicion IS 'Con que se mide el trabajo de esta persona: hora, turno de guardia, semana o mes. No es cada cuanto se le paga, que es otra cosa y se arregla aparte.';
COMMENT ON COLUMN public.reportes.paciente_id IS 'De qué Paciente habla este reporte. Un turno de guardia que cubre a varios tiene un reporte por cada uno.';
COMMENT ON COLUMN public.series_turnos_guardia.asistente_id IS 'NULL = serie sin Asistente fijo. Los turnos de guardia que genera nacen sin cubrir.';
COMMENT ON COLUMN public.series_turnos_guardia.dias_hasta_el_fin IS 'Cuantos dias despues del dia de inicio termina cada turno de guardia de la serie.';
COMMENT ON COLUMN public.series_turnos_guardia.paciente_id IS 'EN RETIRO. Guarda a uno solo de los Pacientes de la serie, el primero. La lista completa vive en series_turnos_guardia_pacientes. Sigue acá únicamente para que las pantallas todavía sin actualizar no se rompan.';
COMMENT ON COLUMN public.series_turnos_guardia.servicio_id IS 'De qué Servicio son los turnos de guardia de esta serie. Vacío mientras la serie no cuelgue de ninguno: hay trabajo que se hace y se factura sin Servicio armado.';
COMMENT ON COLUMN public.tipos_documento_asistente.impide_trabajar IS 'Si falta o no vale, el Asistente no recibe turnos de guardia, salvo los días de gracia y la excepción de a un turno de guardia.';
COMMENT ON TABLE public.auditoria_asignaciones_con_aviso IS 'Quien asigno un turno de guardia teniendo avisos delante, y cuales eran. Registra la decision, no el resultado: se escribe antes de asignar.';
COMMENT ON TABLE public.configuracion_ausencias IS 'Con cuanta anticipacion sobre el primer turno de guardia afectado una ausencia se considera avisada con tiempo, y cada cuanto se insiste. Solo lo que esta Prestadora corrio; los valores de fabrica y los bordes viven en panel/src/lib/avisoDeAusencia.js.';
COMMENT ON TABLE public.configuracion_aviso_turno_guardia_sin_cubrir IS 'Cuándo avisarle al Coordinador que un turno de guardia próximo sigue sin Asistente. Una fila por Prestadora; sin fila no se manda ningún aviso.';
COMMENT ON TABLE public.configuracion_equipo_paciente IS 'Con cuantos turnos de guardia y en que ventana de dias se entra solo al equipo de un Paciente. Solo lo que esta Prestadora corrio; los valores de fabrica y los bordes viven en panel/src/lib/equipoDelPaciente.js.';
COMMENT ON TABLE public.configuracion_incidentes_turno_guardia_sin_cubrir IS 'A cuantas horas de empezar un turno de guardia sin nadie abre un incidente, y cada cuanto se insiste. Solo lo que esta Prestadora corrio; los valores de fabrica y los bordes viven en panel/src/lib/incidenteTurnoGuardiaSinCubrir.js.';
COMMENT ON TABLE public.consentimientos_paciente_solo IS 'El Cliente supo y acepto que la persona atendida quedara sola durante un rato de este turno de guardia. Registra una conversacion que ya ocurrio; no cubre el turno de guardia ni lo cierra.';
COMMENT ON TABLE public.descansos_turno_guardia IS 'Los ratos de descanso que la Asistente toma adentro de un turno de guardia largo, sin dejar de estar disponible. No se descuenta de lo que se le paga, no interrumpe el turno de guardia y no la saca del turno de guardia: no es una ausencia.';
COMMENT ON TABLE public.emergencias_turno_guardia IS 'Lo que el Asistente avisa desde la Guardia Activa cuando pasa algo que no admite esperar. No es la revision automatica de reportes ni la alerta de turno de guardia sin cubrir: es un aviso de una persona, en el momento, que alguien tiene que atender.';
COMMENT ON TABLE public.excepciones_familiar_relevo IS 'Un familiar termino cuidando porque la Prestadora no mando a nadie. Es un defecto grave del servicio que no se pudo solucionar, nunca un turno de guardia cubierto: no cierra el turno de guardia ni lo cuenta como prestado.';
COMMENT ON TABLE public.excepciones_por_documentos IS 'Turnos de guardia asignados con documentos pendientes: quién, a quién, por qué y qué documentos faltaban. Vale sólo para ese turno de guardia y ese Asistente. No se borra.';
COMMENT ON TABLE public.extensiones_de_turno_guardia IS 'El rato que una Asistente se queda adentro despues de que termino su turno de guardia porque el relevo no llego. Se abre sola y se cierra cuando llega el relevo o cuando ella cierra el turno de guardia. De aca salen las horas de mas.';
COMMENT ON TABLE public.finales_turno_guardia_sin_cubrir IS 'Como puede terminar el expediente de un turno de guardia que quedo sin nadie. Cada Prestadora arma su lista: nace con los que trae el producto y a partir de ahi agrega y saca los que quiera.';
COMMENT ON TABLE public.turno_guardia_comprobaciones IS 'Cómo se comprobó que el Asistente estaba realmente en el domicilio al llegar y al irse (pendiente #113). Una fila por acto: cuando hay relevo, el turno de guardia que termina y el que empieza tienen cada uno el suyo.';
COMMENT ON TABLE public.turno_guardia_pacientes IS 'A quiénes atiende un turno de guardia. Una fila por Paciente. Un turno de guardia puede tener varias: un matrimonio en su casa, o todo un piso de un asilo.';
COMMENT ON TABLE public.incidentes_turno_guardia_sin_cubrir IS 'Un turno de guardia que llego a pocas horas de empezar sin nadie asignado. Queda abierto hasta que alguien elija como termino, de la lista que arma cada Prestadora en finales_turno_guardia_sin_cubrir.';
COMMENT ON TABLE public.motivos_sustitucion_turno_guardia IS 'Por qué un turno de guardia lo termina haciendo otra persona. Cada Prestadora arma su lista: nace con dos que trae el producto y a partir de ahí agrega y saca las que quiera.';
COMMENT ON TABLE public.plazos_de_ubicacion_avisados IS 'Asistentes cuyo plazo para aceptar la ubicación durante el turno de guardia venció y ya se le avisó a la Prestadora.';
COMMENT ON TABLE public.series_turnos_guardia_pacientes IS 'A quiénes cubre una serie de turnos de guardia. Cada turno de guardia que la serie genera nace con esta misma lista de Pacientes.';

-- Comentarios de otras funciones que nombran algo renombrado.
COMMENT ON FUNCTION interno.exigir_paciente_y_servicio_del_mismo_contratante(p_paciente_id uuid, p_servicio_id uuid) IS 'La regla de que un Servicio sólo factura Pacientes que le corresponden, escrita una sola vez. La llaman los disparadores de turnos de guardia, prestaciones y turno_guardia_pacientes.';
COMMENT ON FUNCTION interno.asistente_trabaja_en_modalidad(p_asistente_id uuid, p_modalidad text) IS 'Si este Asistente trabaja en esa modalidad. La usan las tres puertas por las que un Asistente queda a cargo: el turno de guardia, la asignación y la serie (regla 12).';

NOTIFY pgrst, 'reload schema';

COMMIT;
