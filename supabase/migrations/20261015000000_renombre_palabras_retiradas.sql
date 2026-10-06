-- Renombre de las palabras retiradas en toda la base.
--
-- El glosario cambió: quien recibe el servicio de la Prestadora es el Cliente, la modalidad
-- se llama Match, las personas que el titular habilita son las Personas autorizadas, y el
-- producto es Careonys. Una palabra retirada que queda guardada vuelve a usarse, así que sale
-- también de lo guardado: tablas, columnas, funciones, políticas, restricciones, disparadores,
-- depósitos de archivos, claves de catálogo, valores cerrados, textos sembrados y comentarios.
--
-- Postgres actualiza solo las políticas, vistas y claves foráneas cuando cambia el nombre de
-- una tabla o columna; lo que lleva el nombre escrito como texto —cuerpos de funciones,
-- valores entre comillas, argumentos de disparadores, restricciones de valores— se rehace.
-- Los depósitos de archivos no se pueden renombrar: se crean con el nombre nuevo y los viejos,
-- que están vacíos, se borran.

begin;

-- 1. Políticas que nombran lo viejo: se sacan y se vuelven a escribir al final
drop policy cliente_ve_certificado_asistente_asignado on public.certificados;
drop policy admin_gestiona_clientes on public.clientes;
drop policy coordinador_edita_clientes on public.clientes;
drop policy coordinador_lee_clientes on public.clientes;
drop policy cliente_ve_su_propia_fila on public.clientes;
drop policy cliente_lee_domicilios_temporales on public.domicilios_temporales_paciente;
drop policy panel_gestiona_permisos_personas_autorizadas on public.permisos_personas_autorizadas;
drop policy titular_lee_los_permisos_de_su_personas_autorizadas on public.permisos_personas_autorizadas;
drop policy cliente_ve_su_acceso_match on public.accesos_match;
drop policy prestadora_ve_accesos_match on public.accesos_match;
drop policy cliente_ve_los_contactos_que_abrio on public.contactos_vistos_match;
drop policy cliente_ve_alertas_de_sus_pacientes on public.alertas;
drop policy cliente_ve_sus_facturas on public.facturas_cliente;
drop policy panel_gestiona_facturas_cliente on public.facturas_cliente;
drop policy cliente_gestiona_sus_push_subscriptions on public.push_subscriptions;
drop policy cliente_lee_asistente_asignado on public.asistentes;
drop policy cliente_ve_hospitalizaciones_de_su_paciente on public.hospitalizaciones_paciente;
drop policy cliente_ve_sus_servicios on public.servicios;
drop policy cliente_ve_items_de_sus_facturas on public.facturas_cliente_items;
drop policy panel_gestiona_facturas_cliente_items on public.facturas_cliente_items;
drop policy cliente_lee_rangos_de_sus_pacientes on public.rangos_referencia_vitales;
drop policy admin_gestiona_personas autorizadas_cliente on public.miembros_cliente;
drop policy coordinador_gestiona_personas autorizadas_cliente on public.miembros_cliente;
drop policy trabajo_sin_persona_de_esta_prestadora on public.miembros_cliente;
drop policy cliente_lee_autorizaciones_de_sus_pacientes on public.autorizaciones_monitoreo_paciente;
drop policy cliente_carga_indicaciones_de_sus_pacientes on public.indicaciones_medicacion;
drop policy cliente_lee_indicaciones_de_sus_pacientes on public.indicaciones_medicacion;
drop policy cliente_genera_su_qr_cobro on public.qr_cobro_efectivo;
drop policy cliente_ve_su_qr_cobro on public.qr_cobro_efectivo;
drop policy prestadora_ve_qr_cobro on public.qr_cobro_efectivo;
drop policy cliente_gestiona_sus_calificaciones on public.calificaciones_asistente;
drop policy cliente_ve_sus_cobros on public.cobros_cliente;
drop policy panel_gestiona_cobros_cliente on public.cobros_cliente;
drop policy asistente_o_cliente_lee_config_matricula_via on public.configuracion_matricula_via_medicacion;
drop policy cliente_ve_el_contenido_publicado on public.contenidos_para_clientes;
drop policy persona_agrega_su_llave on public.llaves_de_dispositivo;
drop policy persona_pide_desafio_de_alta on public.desafios_de_llave;
drop policy cliente_ve_guardias_de_sus_pacientes on public.guardias;
drop policy cliente_ve_sus_correcciones on public.correcciones_factura_cliente;
drop policy panel_lee_correcciones_factura_cliente on public.correcciones_factura_cliente;
drop policy configuracion_facturacion_clientes_la_escribe_la_administracion on public.configuracion_facturacion_clientes;
drop policy configuracion_facturacion_clientes_la_lee_la_administracion on public.configuracion_facturacion_clientes;
drop policy panel_lee_estados_de_cuenta_externos on public.estados_de_cuenta_externos;
drop policy cliente_ve_sus_pacientes on public.pacientes;
drop policy asistente_o_cliente_lee_su_prestadora on public.prestadoras;
drop policy panel_gestiona_instrucciones_acceso_personas_autorizadas on public.instrucciones_acceso_personas_autorizadas;
drop policy titular_lee_sus_instrucciones_acceso_personas_autorizadas on public.instrucciones_acceso_personas_autorizadas;
drop policy admin_prestadora_gestiona_cobro_match on public.configuracion_cobro_match;
drop policy coordinador_lee_cobro_match on public.configuracion_cobro_match;
drop policy cliente_ve_reportes_de_sus_pacientes on public.reportes;
drop policy cliente_ve_los_cobros_de_su_acceso on public.cobros_match;
drop policy prestadora_ve_cobros_match on public.cobros_match;
drop policy cliente_ve_las_formas_ofrecidas on public.formas_de_cobro_match;
drop policy el_hilo_propio_se_lee on public.conversaciones_match;
drop policy los_mensajes_del_hilo_propio_se_leen on public.mensajes_match;
drop policy panel_lee_catalogo_funciones_match on public.catalogo_funciones_match;
drop policy superadmin_gestiona_catalogo_funciones_match on public.catalogo_funciones_match;
drop policy admin_prestadora_gestiona_funciones_match on public.configuracion_funciones_match;
drop policy coordinador_lee_funciones_match on public.configuracion_funciones_match;
drop policy asistente_o_cliente_lee_visibilidad_app on public.configuracion_visibilidad_app;
drop policy el_comprobante_lo_gestiona_quien_administra on storage.objects;
drop policy instrucciones_personas autorizadas_panel_lee on storage.objects;
drop policy instrucciones_personas autorizadas_panel_sube on storage.objects;
drop policy instrucciones_personas autorizadas_titular_lee on storage.objects;
drop policy prescripciones_cliente_lee_la_de_su_paciente on storage.objects;
drop policy prescripciones_cliente_sube_la_de_su_paciente on storage.objects;
drop policy reportes_cliente_lee_fotos_de_sus_pacientes on storage.objects;
drop policy trabajo_sin_persona_de_esta_prestadora on storage.objects;

-- Disparadores cuyos argumentos nombran lo viejo
drop trigger trg_completar_moneda on public.facturas_cliente_items;
drop trigger trg_completar_moneda on public.cobros_cliente;
drop trigger trg_completar_prestadora on public.facturas_cliente_items;
drop trigger el_medio_del_cobro_sale_del_catalogo on public.cobros_cliente;

-- Claves foráneas sobre claves que cambian de valor
alter table public.permisos_prestadora drop constraint permisos_prestadora_accion_fkey;
alter table public.configuracion_funciones_match drop constraint configuracion_funciones_match_funcion_clave_fkey;

-- Restricciones de valores cerrados
alter table public.clientes drop constraint clientes_financiador_conocido;
alter table public.series_guardias drop constraint series_guardias_canal_modalidad_check;
alter table public.series_guardias drop constraint series_guardias_cancelacion_origen_check;
alter table public.facturas_cliente drop constraint facturas_cliente_financiador_conocido;
alter table public.push_subscriptions drop constraint push_subscriptions_una_audiencia;
alter table public.asistentes drop constraint asistentes_canales_valido;
alter table public.codigos_de_presencia drop constraint codigos_de_presencia_sujeto_tipo_check;
alter table public.guardia_comprobaciones drop constraint guardia_comprobaciones_medio_check;
alter table public.guardia_comprobaciones drop constraint guardia_comprobaciones_sujeto_coherencia_check;
alter table public.guardia_comprobaciones drop constraint guardia_comprobaciones_sujeto_tipo_check;
alter table public.auditoria_cambio_dueno_push drop constraint auditoria_cambio_dueno_push_rol_anterior_check;
alter table public.auditoria_cambio_dueno_push drop constraint auditoria_cambio_dueno_push_rol_nuevo_check;
alter table public.llaves_de_dispositivo drop constraint llaves_de_dispositivo_rol_check;
alter table public.desafios_de_llave drop constraint desafios_de_llave_rol_check;
alter table public.guardias drop constraint guardias_canal_modalidad_check;
alter table public.guardias drop constraint guardias_cancelacion_origen_check;
alter table public.importaciones_prestadora drop constraint importaciones_prestadora_tipo_check;
alter table public.prestadora_modalidades drop constraint prestadora_modalidades_modalidad_check;
alter table public.mensajes_match drop constraint mensajes_match_lado_check;
alter table public.opciones_de_lista drop constraint opciones_de_lista_modalidades_check;
alter table public.usuarios drop constraint usuarios_rol_check;
alter table public.formularios_declarados drop constraint formularios_declarados_ambito_check;

-- 2. Datos guardados
alter table public.catalogo_acciones_permisos disable trigger user;
alter table public.advertencias_legales disable trigger user;
alter table public.asistentes disable trigger user;
alter table public.servicios disable trigger user;
alter table public.formulas_cese disable trigger user;
alter table public.guardias disable trigger user;
alter table public.motivos_cierre_servicio disable trigger user;
alter table public.importaciones_prestadora disable trigger user;
alter table public.prestadora_modalidades disable trigger user;
alter table public.motivos_resolucion disable trigger user;
alter table public.textos_consentimiento disable trigger user;
alter table public.catalogo_funciones_match disable trigger user;
alter table public.listas_de_opciones disable trigger user;
alter table public.usuarios disable trigger user;
alter table public.mensajes_del_sistema disable trigger user;
alter table public.direcciones_reservadas disable trigger user;
update public.catalogo_acciones_permisos set accion = $r$alta_manual_cliente$r$::text where accion = $r$alta_manual_cliente$r$::text;
update public.catalogo_acciones_permisos set accion = $r$configurar_accesos_de_personas_autorizadas$r$::text where accion = $r$configurar_accesos_del_personas_autorizadas$r$::text;
update public.catalogo_acciones_permisos set accion = $r$editar_datos_cliente$r$::text where accion = $r$editar_datos_cliente$r$::text;
update public.catalogo_acciones_permisos set accion = $r$escribir_contenido_para_clientes$r$::text where accion = $r$escribir_contenido_para_clientes$r$::text;
update public.catalogo_acciones_permisos set accion = $r$ver_estado_de_cuenta_cliente$r$::text where accion = $r$ver_estado_de_cuenta_cliente$r$::text;
update public.advertencias_legales set funcion_clave = $r$exclusividad_match$r$::text where funcion_clave = $r$exclusividad_match$r$::text;
update public.advertencias_legales set funcion_clave = $r$mediacion_conflictos_match$r$::text where funcion_clave = $r$mediacion_conflictos_match$r$::text;
update public.advertencias_legales set funcion_clave = $r$puntuacion_calificacion_cliente$r$::text where funcion_clave = $r$puntuacion_calificacion_cliente$r$::text;
update public.advertencias_legales set texto_advertencia = $r$Atar una exclusión automática a la calificación agregada convierte la opinión de los Clientes en una decisión algorítmica de la plataforma sobre el Asistente, un indicio de subordinación bajo el art. 23 de la LCT.$r$::text where texto_advertencia = $r$Atar una exclusión automática a la calificación agregada convierte la opinión de los Clientes en una decisión algorítmica de la plataforma sobre el Asistente, un indicio de subordinación bajo el art. 23 de la LCT.$r$::text;
update public.advertencias_legales set texto_advertencia = $r$Fijar precio u horario de forma centralizada, en vez de que cada Cliente lo acuerde con su Asistente, es un indicio fuerte de subordinación bajo el art. 23 de la LCT.$r$::text where texto_advertencia = $r$Fijar precio u horario de forma centralizada, en vez de que cada Cliente lo acuerde con su Asistente, es un indicio fuerte de subordinación bajo el art. 23 de la LCT.$r$::text;
update public.advertencias_legales set texto_advertencia = $r$Mediar activamente en conflictos entre Cliente y Asistente puede interpretarse como dirección del vínculo, un indicio de subordinación bajo el art. 23 de la LCT.$r$::text where texto_advertencia = $r$Mediar activamente en conflictos entre Cliente y Asistente puede interpretarse como dirección del vínculo, un indicio de subordinación bajo el art. 23 de la LCT.$r$::text;
update public.advertencias_legales set texto_advertencia = $r$Un ranking calculado por la plataforma que condiciona si el Asistente sigue visible para cualquier Cliente puede interpretarse como la plataforma decidiendo su acceso al trabajo en general, un indicio de subordinación bajo el art. 23 de la LCT — mismo hecho que pesó en contra de Uber en el caso Aslam (Reino Unido, 2021).$r$::text where texto_advertencia = $r$Un ranking calculado por la plataforma que condiciona si el Asistente sigue visible para cualquier Cliente puede interpretarse como la plataforma decidiendo su acceso al trabajo en general, un indicio de subordinación bajo el art. 23 de la LCT — mismo hecho que pesó en contra de Uber en el caso Aslam (Reino Unido, 2021).$r$::text;
update public.asistentes set canales = $r${directa,match}$r$::text[] where canales = $r${directa,match}$r$::text[];
update public.asistentes set canales = $r${match}$r$::text[] where canales = $r${match}$r$::text[];
update public.servicios set tipo_contratante = $r$cliente$r$::text where tipo_contratante = $r$cliente$r$::text;
update public.formulas_cese set definicion = $r${"pasos": [{"id": "antiguedad", "tipo": "indemnizacion_por_anio_con_tope_y_piso", "parametros": {"escala_tope": {"tipo": "tope_indemnizatorio", "categoria": "general"}, "escala_piso_meses": {"tipo": "piso_minimo_indemnizacion", "categoria": "meses"}, "escala_meses_por_anio": {"tipo": "indemnizacion_antiguedad", "categoria": "meses_por_anio"}, "escala_umbral_fraccion": {"tipo": "fraccion_computable_antiguedad", "categoria": "general"}}}, {"id": "mitad", "tipo": "mitad_de_componente", "parametros": {"referencia": "antiguedad"}}], "combinar": {"paso": "mitad", "operacion": "usar_paso"}, "requiere_revision_abogado": true, "advertencia_si_no_dependencia": "Esta causal solo aplica cuando el empleador es el Cliente directamente (vínculo por dependencia), no a la prestadora."}$r$::jsonb where definicion = $r${"pasos": [{"id": "antiguedad", "tipo": "indemnizacion_por_anio_con_tope_y_piso", "parametros": {"escala_tope": {"tipo": "tope_indemnizatorio", "categoria": "general"}, "escala_piso_meses": {"tipo": "piso_minimo_indemnizacion", "categoria": "meses"}, "escala_meses_por_anio": {"tipo": "indemnizacion_antiguedad", "categoria": "meses_por_anio"}, "escala_umbral_fraccion": {"tipo": "fraccion_computable_antiguedad", "categoria": "general"}}}, {"id": "mitad", "tipo": "mitad_de_componente", "parametros": {"referencia": "antiguedad"}}], "combinar": {"paso": "mitad", "operacion": "usar_paso"}, "requiere_revision_abogado": true, "advertencia_si_no_dependencia": "Esta causal solo aplica cuando el empleador es el cliente directamente (vínculo por dependencia), no a la prestadora."}$r$::jsonb;
update public.guardias set cancelacion_origen = $r$cliente$r$::text where cancelacion_origen = $r$cliente$r$::text;
update public.motivos_cierre_servicio set clave = $r$baja_del_cliente$r$::text where clave = $r$baja_de_la_cliente$r$::text;
update public.importaciones_prestadora set tipo = $r$cliente$r$::text where tipo = $r$cliente$r$::text;
update public.prestadora_modalidades set modalidad = $r$match$r$::text where modalidad = $r$match$r$::text;
update public.motivos_resolucion set nombre_es_ar = $r$Desistió$r$::text where nombre_es_ar = $r$El Cliente desistió$r$::text;
update public.motivos_resolucion set nombre_es_ar = $r$El Cliente la dio de baja$r$::text where nombre_es_ar = $r$El Cliente la dio de baja$r$::text;
update public.textos_consentimiento set cuerpo = $r$ESTE TEXTO ES DE RELLENO Y NO TIENE VALIDEZ LEGAL. Está acá para poder construir y probar la pantalla mientras se consigue la redacción profesional.

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Esta sección va a explicar, en palabras simples, qué se registra del recorrido hacia una guardia y para qué se usa ese dato.

Sed do eiusmod tempor incididunt ut labore. Acá va a ir la finalidad concreta: saber con tiempo si una guardia se va a poder cubrir, y nada más que eso.

Ut enim ad minim veniam, quis nostrud exercitation. Acá va a ir qué NO se hace con el dato: no se comparte con el Cliente, no se usa fuera del horario del trayecto, no se guarda para siempre.

Duis aute irure dolor in reprehenderit in voluptate velit esse. Acá va a ir cómo se retira este consentimiento y qué pasa cuando se retira.$r$::text where replace(cuerpo::text, E'\r', '') = replace($r$ESTE TEXTO ES DE RELLENO Y NO TIENE VALIDEZ LEGAL. Está acá para poder construir y probar la pantalla mientras se consigue la redacción profesional.

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Esta sección va a explicar, en palabras simples, qué se registra del recorrido hacia una guardia y para qué se usa ese dato.

Sed do eiusmod tempor incididunt ut labore. Acá va a ir la finalidad concreta: saber con tiempo si una guardia se va a poder cubrir, y nada más que eso.

Ut enim ad minim veniam, quis nostrud exercitation. Acá va a ir qué NO se hace con el dato: no se comparte con el Cliente, no se usa fuera del horario del trayecto, no se guarda para siempre.

Duis aute irure dolor in reprehenderit in voluptate velit esse. Acá va a ir cómo se retira este consentimiento y qué pasa cuando se retira.$r$, E'\r', '');
update public.textos_consentimiento set puntos_clave = $r${"PROVISORIO — Qué se registra: solo el recorrido hacia la guardia.","PROVISORIO — Cuándo empieza: al avisar la salida. Cuándo termina: al llegar.","PROVISORIO — Quién lo ve: la Prestadora. El Cliente ve solo la hora estimada de llegada, nunca el lugar exacto.","PROVISORIO — Cuánto se guarda: [pendiente de definir con el abogado].","PROVISORIO — Se puede retirar en cualquier momento, desde Mi Perfil."}$r$::text[] where puntos_clave = $r${"PROVISORIO — Qué se registra: solo el recorrido hacia la guardia.","PROVISORIO — Cuándo empieza: al avisar la salida. Cuándo termina: al llegar.","PROVISORIO — Quién lo ve: la Prestadora. El Cliente ve solo la hora estimada de llegada, nunca el lugar exacto.","PROVISORIO — Cuánto se guarda: [pendiente de definir con el abogado].","PROVISORIO — Se puede retirar en cualquier momento, desde Mi Perfil."}$r$::text[];
update public.catalogo_funciones_match set clave = $r$exclusividad_match$r$::text where clave = $r$exclusividad_match$r$::text;
update public.catalogo_funciones_match set clave = $r$mediacion_conflictos_match$r$::text where clave = $r$mediacion_conflictos_match$r$::text;
update public.listas_de_opciones set clave = $r$medios_de_pago_del_cliente$r$::text where clave = $r$medios_de_pago_de_la_cliente$r$::text;
update public.listas_de_opciones set i18n = $r${"en": "Client payment methods", "es-AR": "Medios de pago del Cliente", "pt-BR": "Meios de pagamento do Cliente"}$r$::jsonb where i18n = $r${"en": "Family payment methods", "es-AR": "Medios de pago del Cliente", "pt-BR": "Meios de pagamento da Família"}$r$::jsonb;
update public.usuarios set rol = $r$cliente$r$::text where rol = $r$cliente$r$::text;
update public.mensajes_del_sistema set clave = $r$alerta_ia_cliente.cuerpo_amarilla$r$::text where clave = $r$alerta_ia_cliente.cuerpo_amarilla$r$::text;
update public.mensajes_del_sistema set clave = $r$cambio_de_asistente_cliente.otro_asistente$r$::text where clave = $r$cambio_de_asistente_cliente.otro_asistente$r$::text;
update public.mensajes_del_sistema set clave = $r$guardia_sin_cerrar_cliente.titulo$r$::text where clave = $r$guardia_sin_cerrar_cliente.titulo$r$::text;
update public.mensajes_del_sistema set clave = $r$alerta_ia_cliente.cuerpo_roja$r$::text where clave = $r$alerta_ia_cliente.cuerpo_roja$r$::text;
update public.mensajes_del_sistema set clave = $r$cambio_de_asistente_cliente.titulo$r$::text where clave = $r$cambio_de_asistente_cliente.titulo$r$::text;
update public.mensajes_del_sistema set clave = $r$codigo_instruccion_personas_autorizadas.texto$r$::text where clave = $r$codigo_instruccion_personas_autorizadas.texto$r$::text;
update public.mensajes_del_sistema set clave = $r$alerta_ia_cliente.titulo_roja$r$::text where clave = $r$alerta_ia_cliente.titulo_roja$r$::text;
update public.mensajes_del_sistema set clave = $r$alerta_temprana_guardia_cliente.cuerpo$r$::text where clave = $r$alerta_temprana_guardia_cliente.cuerpo$r$::text;
update public.mensajes_del_sistema set clave = $r$alerta_temprana_guardia_cliente.titulo$r$::text where clave = $r$alerta_temprana_guardia_cliente.titulo$r$::text;
update public.mensajes_del_sistema set clave = $r$incidente_relevo_cliente.cuerpo$r$::text where clave = $r$incidente_relevo_cliente.cuerpo$r$::text;
update public.mensajes_del_sistema set clave = $r$incidente_relevo_cliente.titulo$r$::text where clave = $r$incidente_relevo_cliente.titulo$r$::text;
update public.mensajes_del_sistema set clave = $r$guardia_sin_cerrar_grave_cliente.titulo$r$::text where clave = $r$guardia_sin_cerrar_grave_cliente.titulo$r$::text;
update public.mensajes_del_sistema set clave = $r$guardia_sin_cerrar_grave_cliente.cuerpo$r$::text where clave = $r$guardia_sin_cerrar_grave_cliente.cuerpo$r$::text;
update public.mensajes_del_sistema set clave = $r$guardia_sin_cerrar_cliente.cuerpo$r$::text where clave = $r$guardia_sin_cerrar_cliente.cuerpo$r$::text;
update public.mensajes_del_sistema set clave = $r$alerta_ia_cliente.titulo_amarilla$r$::text where clave = $r$alerta_ia_cliente.titulo_amarilla$r$::text;
update public.mensajes_del_sistema set clave = $r$cambio_de_asistente_cliente.cuerpo_uno$r$::text where clave = $r$cambio_de_asistente_cliente.cuerpo_uno$r$::text;
update public.mensajes_del_sistema set clave = $r$codigo_instruccion_personas_autorizadas.asunto$r$::text where clave = $r$codigo_instruccion_personas_autorizadas.asunto$r$::text;
update public.mensajes_del_sistema set clave = $r$cambio_de_asistente_cliente.cuerpo_varios$r$::text where clave = $r$cambio_de_asistente_cliente.cuerpo_varios$r$::text;
update public.direcciones_reservadas set direccion = $r$clientes$r$::text where direccion = $r$clientes$r$::text;
update public.usuarios set nombre = replace(nombre, 'Cliente', 'Cliente') where nombre ~ 'Cliente(?!r)';

-- Cuentas de prueba: la dirección de entrada
update auth.users set email = replace(email, 'cliente', 'cliente') where email ~ 'cliente(?!r)';
update auth.identities set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(replace(identity_data->>'email', 'cliente', 'cliente')))
  where identity_data->>'email' ~ 'cliente(?!r)';
update auth.identities set provider_id = replace(provider_id, 'cliente', 'cliente') where provider_id ~ 'cliente(?!r)';
alter table public.catalogo_acciones_permisos enable trigger user;
alter table public.advertencias_legales enable trigger user;
alter table public.asistentes enable trigger user;
alter table public.servicios enable trigger user;
alter table public.formulas_cese enable trigger user;
alter table public.guardias enable trigger user;
alter table public.motivos_cierre_servicio enable trigger user;
alter table public.importaciones_prestadora enable trigger user;
alter table public.prestadora_modalidades enable trigger user;
alter table public.motivos_resolucion enable trigger user;
alter table public.textos_consentimiento enable trigger user;
alter table public.catalogo_funciones_match enable trigger user;
alter table public.listas_de_opciones enable trigger user;
alter table public.usuarios enable trigger user;
alter table public.mensajes_del_sistema enable trigger user;
alter table public.direcciones_reservadas enable trigger user;

-- 3. Disparadores con nombre viejo
alter trigger validar_cliente_series_guardias_pacientes on public.series_guardias_pacientes rename to validar_cliente_series_guardias_pacientes;
alter trigger asignar_numero_clientes on public.clientes rename to asignar_numero_clientes;

-- Restricciones con nombre viejo
alter table public.solicitudes rename constraint solicitudes_cliente_id_fkey to solicitudes_cliente_id_fkey;
alter table public.clientes rename constraint clientes_dias_hasta_el_vencimiento_check to clientes_dias_hasta_el_vencimiento_check;
alter table public.clientes rename constraint clientes_id_prestadora_unico to clientes_id_prestadora_unico;
alter table public.clientes rename constraint clientes_importacion_id_fkey to clientes_importacion_id_fkey;
alter table public.clientes rename constraint clientes_numero_cliente_unico_por_prestadora to clientes_numero_cliente_unico_por_prestadora;
alter table public.clientes rename constraint clientes_pagador_legajo_de_la_misma_prestadora to clientes_pagador_legajo_de_la_misma_prestadora;
alter table public.clientes rename constraint clientes_pkey to clientes_pkey;
alter table public.clientes rename constraint clientes_prestadora_id_fkey to clientes_prestadora_id_fkey;
alter table public.clientes rename constraint clientes_solicitud_id_fkey to clientes_solicitud_id_fkey;
alter table public.clientes rename constraint clientes_una_ficha_por_cuenta_y_prestadora to clientes_una_ficha_por_cuenta_y_prestadora;
alter table public.clientes rename constraint clientes_usuario_id_fkey to clientes_usuario_id_fkey;
alter table public.permisos_personas_autorizadas rename constraint permisos_personas_autorizadas_cliente_id_fkey to permisos_personas_autorizadas_cliente_id_fkey;
alter table public.permisos_personas_autorizadas rename constraint permisos_personas_autorizadas_instruccion_id_fkey to permisos_personas_autorizadas_instruccion_id_fkey;
alter table public.permisos_personas_autorizadas rename constraint permisos_personas_autorizadas_pkey to permisos_personas_autorizadas_pkey;
alter table public.permisos_personas_autorizadas rename constraint permisos_personas_autorizadas_usuario_id_fkey to permisos_personas_autorizadas_usuario_id_fkey;
alter table public.accesos_match rename constraint accesos_match_asistente_id_fkey to accesos_match_asistente_id_fkey;
alter table public.accesos_match rename constraint accesos_match_estado_check to accesos_match_estado_check;
alter table public.accesos_match rename constraint accesos_match_cliente_id_fkey to accesos_match_cliente_id_fkey;
alter table public.accesos_match rename constraint accesos_match_forma_de_cobro_id_fkey to accesos_match_forma_de_cobro_id_fkey;
alter table public.accesos_match rename constraint accesos_match_paciente_id_fkey to accesos_match_paciente_id_fkey;
alter table public.accesos_match rename constraint accesos_match_pkey to accesos_match_pkey;
alter table public.accesos_match rename constraint accesos_match_prestadora_id_fkey to accesos_match_prestadora_id_fkey;
alter table public.accesos_match rename constraint accesos_match_saldo_no_negativo to accesos_match_saldo_no_negativo;
alter table public.accesos_match rename constraint accesos_match_un_acceso_por_asistente to accesos_match_un_acceso_por_asistente;
alter table public.contactos_vistos_match rename constraint contactos_vistos_match_acceso_id_fkey to contactos_vistos_match_acceso_id_fkey;
alter table public.contactos_vistos_match rename constraint contactos_vistos_match_asistente_id_fkey to contactos_vistos_match_asistente_id_fkey;
alter table public.contactos_vistos_match rename constraint contactos_vistos_match_cliente_id_fkey to contactos_vistos_match_cliente_id_fkey;
alter table public.contactos_vistos_match rename constraint contactos_vistos_match_pkey to contactos_vistos_match_pkey;
alter table public.contactos_vistos_match rename constraint contactos_vistos_match_prestadora_id_fkey to contactos_vistos_match_prestadora_id_fkey;
alter table public.contactos_vistos_match rename constraint contactos_vistos_mkt_una_vez_por_asistente to contactos_vistos_match_una_vez_por_asistente;
alter table public.facturas_cliente rename constraint facturas_cliente_estado_check to facturas_cliente_estado_check;
alter table public.facturas_cliente rename constraint facturas_cliente_cliente_id_fkey to facturas_cliente_cliente_id_fkey;
alter table public.facturas_cliente rename constraint facturas_cliente_cliente_id_periodo_key to facturas_cliente_cliente_id_periodo_key;
alter table public.facturas_cliente rename constraint facturas_cliente_id_prestadora_key to facturas_cliente_id_prestadora_key;
alter table public.facturas_cliente rename constraint facturas_cliente_monto_facturado_check to facturas_cliente_monto_facturado_check;
alter table public.facturas_cliente rename constraint facturas_cliente_pkey to facturas_cliente_pkey;
alter table public.facturas_cliente rename constraint facturas_cliente_prestadora_id_fkey to facturas_cliente_prestadora_id_fkey;
alter table public.push_subscriptions rename constraint push_subscriptions_cliente_id_fkey to push_subscriptions_cliente_id_fkey;
alter table public.facturas_cliente_items rename constraint facturas_cliente_items_factura_de_la_misma_prestadora to facturas_cliente_items_factura_de_la_misma_prestadora;
alter table public.facturas_cliente_items rename constraint facturas_cliente_items_paciente_id_fkey to facturas_cliente_items_paciente_id_fkey;
alter table public.facturas_cliente_items rename constraint facturas_cliente_items_pkey to facturas_cliente_items_pkey;
alter table public.facturas_cliente_items rename constraint facturas_cliente_items_prestadora_id_fkey to facturas_cliente_items_prestadora_id_fkey;
alter table public.facturas_cliente_items rename constraint facturas_cliente_items_servicio_de_la_misma_prestadora to facturas_cliente_items_servicio_de_la_misma_prestadora;
alter table public.informes_obra_social rename constraint informes_obra_social_cliente_id_fkey to informes_obra_social_cliente_id_fkey;
alter table public.miembros_cliente rename constraint miembros_cliente_creado_por_fkey to personas_autorizadas_creado_por_fkey;
alter table public.miembros_cliente rename constraint miembros_cliente_cliente_id_fkey to personas_autorizadas_cliente_id_fkey;
alter table public.miembros_cliente rename constraint miembros_cliente_pkey to personas_autorizadas_pkey;
alter table public.miembros_cliente rename constraint miembros_cliente_usuario_id_fkey to personas_autorizadas_usuario_id_fkey;
alter table public.indicaciones_medicacion rename constraint indicaciones_medicacion_cliente_id_fkey to indicaciones_medicacion_cliente_id_fkey;
alter table public.qr_cobro_efectivo rename constraint qr_cobro_efectivo_cliente_id_fkey to qr_cobro_efectivo_cliente_id_fkey;
alter table public.calificaciones_asistente rename constraint calificaciones_asistente_cliente_id_fkey to calificaciones_asistente_cliente_id_fkey;
alter table public.cobros_cliente rename constraint cobros_cliente_anulado_con_fecha to cobros_cliente_anulado_con_fecha;
alter table public.cobros_cliente rename constraint cobros_cliente_anulado_con_motivo to cobros_cliente_anulado_con_motivo;
alter table public.cobros_cliente rename constraint cobros_cliente_anulado_por_fkey to cobros_cliente_anulado_por_fkey;
alter table public.cobros_cliente rename constraint cobros_cliente_estado_check to cobros_cliente_estado_check;
alter table public.cobros_cliente rename constraint cobros_cliente_factura_de_la_misma_prestadora to cobros_cliente_factura_de_la_misma_prestadora;
alter table public.cobros_cliente rename constraint cobros_cliente_monto_check to cobros_cliente_monto_check;
alter table public.cobros_cliente rename constraint cobros_cliente_origen_check to cobros_cliente_origen_check;
alter table public.cobros_cliente rename constraint cobros_cliente_pkey to cobros_cliente_pkey;
alter table public.cobros_cliente rename constraint cobros_cliente_prestadora_id_fkey to cobros_cliente_prestadora_id_fkey;
alter table public.cobros_cliente rename constraint cobros_cliente_registrado_por_fkey to cobros_cliente_registrado_por_fkey;
alter table public.contenidos_para_clientes rename constraint contenidos_para_clientes_creado_por_fkey to contenidos_para_clientes_creado_por_fkey;
alter table public.contenidos_para_clientes rename constraint contenidos_para_clientes_cuerpo_con_texto to contenidos_para_clientes_cuerpo_con_texto;
alter table public.contenidos_para_clientes rename constraint contenidos_para_clientes_enlace_es_https to contenidos_para_clientes_enlace_es_https;
alter table public.contenidos_para_clientes rename constraint contenidos_para_clientes_id_prestadora to contenidos_para_clientes_id_prestadora;
alter table public.contenidos_para_clientes rename constraint contenidos_para_clientes_pkey to contenidos_para_clientes_pkey;
alter table public.contenidos_para_clientes rename constraint contenidos_para_clientes_prestadora_id_fkey to contenidos_para_clientes_prestadora_id_fkey;
alter table public.contenidos_para_clientes rename constraint contenidos_para_clientes_titulo_con_texto to contenidos_para_clientes_titulo_con_texto;
alter table public.consentimientos_paciente_solo rename constraint consentimientos_paciente_solo_cliente_id_fkey to consentimientos_paciente_solo_cliente_id_fkey;
alter table public.correcciones_factura_cliente rename constraint correcciones_factura_cliente_comprobante_tipo_check to correcciones_factura_cliente_comprobante_tipo_check;
alter table public.correcciones_factura_cliente rename constraint correcciones_factura_cliente_factura_id_fkey to correcciones_factura_cliente_factura_id_fkey;
alter table public.correcciones_factura_cliente rename constraint correcciones_factura_cliente_monto_check to correcciones_factura_cliente_monto_check;
alter table public.correcciones_factura_cliente rename constraint correcciones_factura_cliente_motivo_check to correcciones_factura_cliente_motivo_check;
alter table public.correcciones_factura_cliente rename constraint correcciones_factura_cliente_pkey to correcciones_factura_cliente_pkey;
alter table public.correcciones_factura_cliente rename constraint correcciones_factura_cliente_prestadora_id_fkey to correcciones_factura_cliente_prestadora_id_fkey;
alter table public.correcciones_factura_cliente rename constraint correcciones_factura_cliente_sentido_check to correcciones_factura_cliente_sentido_check;
alter table public.configuracion_facturacion_clientes rename constraint configuracion_facturacion_clientes_pkey to configuracion_facturacion_clientes_pkey;
alter table public.configuracion_facturacion_clientes rename constraint configuracion_facturacion_clientes_prestadora_id_fkey to configuracion_facturacion_clientes_prestadora_id_fkey;
alter table public.configuracion_facturacion_clientes rename constraint configuracion_facturacion_clientes_regla_es_objeto to configuracion_facturacion_clientes_regla_es_objeto;
alter table public.estados_de_cuenta_externos rename constraint estados_de_cuenta_externos_cliente_id_fkey to estados_de_cuenta_externos_cliente_id_fkey;
alter table public.restricciones_de_cobranza rename constraint restricciones_de_cobranza_cliente_id_fkey to restricciones_de_cobranza_cliente_id_fkey;
alter table public.pacientes rename constraint pacientes_cliente_id_fkey to pacientes_cliente_id_fkey;
alter table public.instrucciones_acceso_personas_autorizadas rename constraint instrucciones_acceso_personas autorizadas_cargada_por_fkey to instrucciones_acceso_personas_autorizadas_cargada_por_fkey;
alter table public.instrucciones_acceso_personas_autorizadas rename constraint instrucciones_acceso_personas autorizadas_cerrada_como_check to instrucciones_acceso_personas_autorizadas_cerrada_como_check;
alter table public.instrucciones_acceso_personas_autorizadas rename constraint instrucciones_acceso_personas autorizadas_dada_por_fkey to instrucciones_acceso_personas_autorizadas_dada_por_fkey;
alter table public.instrucciones_acceso_personas_autorizadas rename constraint instrucciones_acceso_personas autorizadas_estado_check to instrucciones_acceso_personas_autorizadas_estado_check;
alter table public.instrucciones_acceso_personas_autorizadas rename constraint instrucciones_acceso_personas autorizadas_cliente_id_fkey to instrucciones_acceso_personas_autorizadas_id_fkey;
alter table public.instrucciones_acceso_personas_autorizadas rename constraint instrucciones_acceso_personas autorizadas_pkey to instrucciones_acceso_personas_autorizadas_pkey;
alter table public.instrucciones_acceso_personas_autorizadas rename constraint instrucciones_acceso_personas autorizadas_prestadora_id_fkey to instrucciones_acceso_personas_autorizadas_prestadora_id_fkey;
alter table public.documentos_pagador rename constraint documentos_pagador_cliente_id_fkey to documentos_pagador_cliente_id_fkey;
alter table public.documentos_pagador rename constraint documentos_pagador_cliente_tenant_fk to documentos_pagador_cliente_tenant_fk;
alter table public.consentimientos_pagador rename constraint consentimientos_pagador_cliente_id_fkey to consentimientos_pagador_cliente_id_fkey;
alter table public.consentimientos_pagador rename constraint consentimientos_pagador_cliente_tenant_fk to consentimientos_pagador_cliente_tenant_fk;
alter table public.configuracion_cobro_match rename constraint configuracion_cobro_match_aviso_al_menos_un_dia to configuracion_cobro_match_aviso_al_menos_un_dia;
alter table public.configuracion_cobro_match rename constraint configuracion_cobro_match_cupon_al_menos_un_dia to configuracion_cobro_match_cupon_al_menos_un_dia;
alter table public.configuracion_cobro_match rename constraint configuracion_cobro_match_gracia_al_menos_un_dia to configuracion_cobro_match_gracia_al_menos_un_dia;
alter table public.configuracion_cobro_match rename constraint configuracion_cobro_match_pkey to configuracion_cobro_match_pkey;
alter table public.configuracion_cobro_match rename constraint configuracion_cobro_match_prestadora_id_fkey to configuracion_cobro_match_prestadora_id_fkey;
alter table public.cobros_match rename constraint cobros_match_acceso_id_fkey to cobros_match_acceso_id_fkey;
alter table public.cobros_match rename constraint cobros_match_estado_cobro_check to cobros_match_estado_cobro_check;
alter table public.cobros_match rename constraint cobros_match_pkey to cobros_match_pkey;
alter table public.cobros_match rename constraint cobros_match_prestadora_id_fkey to cobros_match_prestadora_id_fkey;
alter table public.cobros_match rename constraint cobros_match_registrado_por_fkey to cobros_match_registrado_por_fkey;
alter table public.formas_de_cobro_match rename constraint formas_cobro_mkt_contactos_positivos to formas_cobro_match_contactos_positivos;
alter table public.formas_de_cobro_match rename constraint formas_cobro_mkt_dias_gratis_no_negativos to formas_cobro_match_dias_gratis_no_negativos;
alter table public.formas_de_cobro_match rename constraint formas_cobro_mkt_importe_no_negativo to formas_cobro_match_importe_no_negativo;
alter table public.formas_de_cobro_match rename constraint formas_cobro_mkt_nombre_por_prestadora to formas_cobro_match_nombre_por_prestadora;
alter table public.formas_de_cobro_match rename constraint formas_cobro_mkt_periodo_entero to formas_cobro_match_periodo_entero;
alter table public.formas_de_cobro_match rename constraint formas_cobro_mkt_periodo_positivo to formas_cobro_match_periodo_positivo;
alter table public.formas_de_cobro_match rename constraint formas_cobro_mkt_renueva_con_periodo to formas_cobro_match_renueva_con_periodo;
alter table public.formas_de_cobro_match rename constraint formas_cobro_mkt_unidad_del_catalogo to formas_cobro_match_unidad_del_catalogo;
alter table public.formas_de_cobro_match rename constraint formas_de_cobro_match_pkey to formas_de_cobro_match_pkey;
alter table public.formas_de_cobro_match rename constraint formas_de_cobro_match_prestadora_id_fkey to formas_de_cobro_match_prestadora_id_fkey;
alter table public.conversaciones_match rename constraint conversaciones_match_pkey to conversaciones_match_pkey;
alter table public.conversaciones_match rename constraint conversaciones_match_prestadora_id_fkey to conversaciones_match_prestadora_id_fkey;
alter table public.conversaciones_match rename constraint conversaciones_mkt_asistente_prestadora_fk to conversaciones_match_asistente_prestadora_fk;
alter table public.conversaciones_match rename constraint conversaciones_mkt_cliente_prestadora_fk to conversaciones_match_cliente_prestadora_fk;
alter table public.conversaciones_match rename constraint conversaciones_mkt_id_prestadora_unico to conversaciones_match_id_prestadora_unico;
alter table public.conversaciones_match rename constraint conversaciones_mkt_una_por_pareja to conversaciones_match_una_por_pareja;
alter table public.mensajes_match rename constraint mensajes_match_cuerpo_check to mensajes_match_cuerpo_check;
alter table public.mensajes_match rename constraint mensajes_match_pkey to mensajes_match_pkey;
alter table public.mensajes_match rename constraint mensajes_match_prestadora_id_fkey to mensajes_match_prestadora_id_fkey;
alter table public.mensajes_match rename constraint mensajes_mkt_conversacion_prestadora_fk to mensajes_match_conversacion_prestadora_fk;
alter table public.catalogo_funciones_match rename constraint catalogo_funciones_match_pkey to catalogo_funciones_match_pkey;
alter table public.configuracion_funciones_match rename constraint configuracion_funciones_match_advertida_por_fkey to configuracion_funciones_match_advertida_por_fkey;
alter table public.configuracion_funciones_match rename constraint configuracion_funciones_match_pkey to configuracion_funciones_match_pkey;
alter table public.configuracion_funciones_match rename constraint configuracion_funciones_match_prestadora_id_fkey to configuracion_funciones_match_prestadora_id_fkey;
alter table public.configuracion_funciones_match rename constraint configuracion_funciones_match_una_por_prestadora to configuracion_funciones_match_una_por_prestadora;

-- Columnas
alter table public.configuracion_notificaciones rename column notificar_cliente to notificar_cliente;
alter table public.solicitudes rename column cliente_id to cliente_id;
alter table public.permisos_personas_autorizadas rename column cliente_id to cliente_id;
alter table public.datos_reservados_asistente rename column motivo_exclusion_match to motivo_exclusion_match;
alter table public.accesos_match rename column cliente_id to cliente_id;
alter table public.contactos_vistos_match rename column cliente_id to cliente_id;
alter table public.configuracion_alertas_ia rename column roja_avisa_cliente to roja_avisa_cliente;
alter table public.configuracion_alertas_ia rename column amarilla_avisa_cliente to amarilla_avisa_cliente;
alter table public.facturas_cliente rename column cliente_id to cliente_id;
alter table public.push_subscriptions rename column cliente_id to cliente_id;
alter table public.informes_obra_social rename column cliente_id to cliente_id;
alter table public.miembros_cliente rename column cliente_id to cliente_id;
alter table public.indicaciones_medicacion rename column cliente_id to cliente_id;
alter table public.qr_cobro_efectivo rename column cliente_id to cliente_id;
alter table public.calificaciones_asistente rename column cliente_id to cliente_id;
alter table public.consentimientos_paciente_solo rename column cliente_id to cliente_id;
alter table public.estados_de_cuenta_externos rename column cliente_id to cliente_id;
alter table public.restricciones_de_cobranza rename column cliente_id to cliente_id;
alter table public.saldos_cliente rename column cliente_id to cliente_id;
alter table public.estado_de_cuenta_externo_vigente rename column cliente_id to cliente_id;
alter table public.pacientes rename column cliente_id to cliente_id;
alter table public.instrucciones_acceso_personas_autorizadas rename column cliente_id to cliente_id;
alter table public.documentos_pagador rename column cliente_id to cliente_id;
alter table public.consentimientos_pagador rename column cliente_id to cliente_id;
alter table public.conversaciones_match rename column cliente_id to cliente_id;

-- Tablas, vista, índices y secuencias
alter index public.instrucciones_acceso_personas autorizadas_una_pendiente_por_cliente rename to instrucciones_acceso_personas_autorizadas_una_pendiente_por_cliente;
alter index public.idx_push_subscriptions_cliente rename to idx_push_subscriptions_cliente;
alter index public.idx_accesos_match_prestadora rename to idx_accesos_match_prestadora;
alter index public.idx_facturas_cliente_items_prestadora rename to idx_facturas_cliente_items_prestadora;
alter index public.contenidos_para_clientes_por_orden rename to contenidos_para_clientes_por_orden;
alter index public.idx_formas_cobro_mkt_prestadora rename to idx_formas_cobro_match_prestadora;
alter index public.idx_configuracion_funciones_match_prestadora rename to idx_configuracion_funciones_match_prestadora;
alter index public.idx_contactos_vistos_mkt_prestadora rename to idx_contactos_vistos_match_prestadora;
alter index public.idx_clientes_pagador_legajo rename to idx_clientes_pagador_legajo;
alter index public.idx_mensajes_mkt_conversacion rename to idx_mensajes_match_conversacion;
alter index public.idx_instrucciones_acceso_personas autorizadas_prestadora_id rename to idx_instrucciones_acceso_personas_autorizadas_prestadora_id;
alter index public.idx_accesos_match_cliente rename to idx_accesos_match_cliente;
alter index public.idx_instrucciones_acceso_personas autorizadas_cliente rename to idx_instrucciones_acceso_personas_autorizadas;
alter index public.idx_correcciones_factura_cliente_prestadora rename to idx_correcciones_factura_cliente_prestadora;
alter index public.idx_cobros_cliente_prestadora rename to idx_cobros_cliente_prestadora;
alter index public.idx_mensajes_mkt_prestadora rename to idx_mensajes_match_prestadora;
alter index public.idx_conversaciones_mkt_prestadora rename to idx_conversaciones_match_prestadora;
alter index public.idx_permisos_personas_autorizadas_usuario rename to idx_permisos_personas_autorizadas_usuario;
alter index public.idx_conversaciones_mkt_cliente rename to idx_conversaciones_match_cliente;
alter index public.idx_cobros_match_acceso rename to idx_cobros_match_acceso;
alter index public.idx_estados_de_cuenta_externos_cliente rename to idx_estados_de_cuenta_externos_cliente;
alter index public.idx_contactos_vistos_mkt_acceso rename to idx_contactos_vistos_match_acceso;
alter index public.idx_conversaciones_mkt_asistente rename to idx_conversaciones_match_asistente;
alter index public.uq_cobros_match_periodo_pendiente rename to uq_cobros_match_periodo_pendiente;
alter index public.idx_cobros_cliente_referencia_externa rename to idx_cobros_cliente_referencia_externa;
alter index public.idx_cobros_cliente_factura rename to idx_cobros_cliente_factura;
alter index public.idx_accesos_match_en_gracia rename to idx_accesos_match_en_gracia;
alter index public.contenidos_para_clientes_titulo_unico rename to contenidos_para_clientes_titulo_unico;
alter index public.idx_correcciones_factura_cliente_factura rename to idx_correcciones_factura_cliente_factura;
alter index public.idx_cobros_match_prestadora rename to idx_cobros_match_prestadora;
alter index public.consentimientos_pagador_por_cliente rename to consentimientos_pagador_por_cliente;
alter index public.idx_restricciones_de_cobranza_cliente rename to idx_restricciones_de_cobranza_cliente;
alter index public.clientes_por_usuario rename to clientes_por_usuario;
alter index public.idx_accesos_match_por_cobrar rename to idx_accesos_match_por_cobrar;
alter index public.idx_miembros_cliente_cliente rename to idx_personas_autorizadas_cliente;
alter index public.consentimientos_pagador_uno_pendiente_por_cliente rename to consentimientos_pagador_uno_pendiente_por_cliente;
alter index public.idx_accesos_match_referencia rename to idx_accesos_match_referencia;
alter index public.idx_facturas_cliente_prestadora rename to idx_facturas_cliente_prestadora;
alter index public.idx_cobros_match_referencia rename to idx_cobros_match_referencia;
alter view public.saldos_cliente rename to saldos_cliente;
alter table public.cobros_cliente rename to cobros_cliente;
alter table public.conversaciones_match rename to conversaciones_match;
alter table public.permisos_personas_autorizadas rename to permisos_personas_autorizadas;
alter table public.instrucciones_acceso_personas_autorizadas rename to instrucciones_acceso_personas_autorizadas;
alter table public.cobros_match rename to cobros_match;
alter table public.configuracion_facturacion_clientes rename to configuracion_facturacion_clientes;
alter table public.mensajes_match rename to mensajes_match;
alter table public.miembros_cliente rename to personas_autorizadas;
alter table public.contactos_vistos_match rename to contactos_vistos_match;
alter table public.configuracion_cobro_match rename to configuracion_cobro_match;
alter table public.contenidos_para_clientes rename to contenidos_para_clientes;
alter table public.formas_de_cobro_match rename to formas_de_cobro_match;
alter table public.facturas_cliente rename to facturas_cliente;
alter table public.facturas_cliente_items rename to facturas_cliente_items;
alter table public.correcciones_factura_cliente rename to correcciones_factura_cliente;
alter table public.accesos_match rename to accesos_match;
alter table public.clientes rename to clientes;
alter table public.configuracion_funciones_match rename to configuracion_funciones_match;
alter table public.catalogo_funciones_match rename to catalogo_funciones_match;

-- 4. Funciones
alter function interno.conversacion_match_es_propia(p_conversacion_id uuid) rename to conversacion_match_es_propia;
alter function public.fn_completar_moneda_desde_cliente() rename to fn_completar_moneda_desde_cliente;
alter function interno.cliente_id_de_usuario(p_usuario_id uuid) rename to cliente_id_de_usuario;
alter function public.asistente_asignado_a_cliente(p_asistente_id uuid) rename to asistente_asignado_a_cliente;
alter function public.validar_paciente_de_serie_misma_cliente() rename to validar_paciente_de_serie_mismo_cliente;
alter function interno.pacientes_de_la_cliente() rename to pacientes_del_cliente;
alter function interno.es_cliente() rename to es_cliente;
alter function interno.puede_configurar_accesos_del_personas_autorizadas() rename to puede_configurar_accesos_de_personas_autorizadas;
alter function interno.persona_autorizada_puede(p_usuario uuid, p_clave text) rename to persona_autorizada_puede;
alter function public.consumir_contacto_match(p_acceso_id uuid, p_asistente_id uuid) rename to consumir_contacto_match;
drop function interno.asistente_atiende_a_la_cliente(p_asistente_id uuid, p_cliente_id uuid);
CREATE OR REPLACE FUNCTION public.sumar_intento_de_codigo(p_tabla text, p_id uuid, p_prestadora_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_intentos integer;
BEGIN
  -- Falla cerrado: sin Prestadora no se cuenta nada.
  IF p_prestadora_id IS NULL THEN
    RAISE EXCEPTION 'sumar_intento_de_codigo: falta la Prestadora';
  END IF;

  IF p_tabla = 'instrucciones_acceso_personas_autorizadas' THEN
    UPDATE public.instrucciones_acceso_personas_autorizadas
       SET codigo_intentos = codigo_intentos + 1
     WHERE id = p_id
       AND prestadora_id = p_prestadora_id
    RETURNING codigo_intentos INTO v_intentos;

  ELSIF p_tabla = 'guardia_comprobaciones' THEN
    UPDATE public.guardia_comprobaciones
       SET codigo_intentos = codigo_intentos + 1,
           updated_at = now()
     WHERE id = p_id
       AND prestadora_id = p_prestadora_id
    RETURNING codigo_intentos INTO v_intentos;

  ELSIF p_tabla = 'codigos_al_telefono' THEN
    UPDATE public.codigos_al_telefono
       SET codigo_intentos = codigo_intentos + 1
     WHERE id = p_id
       AND prestadora_id = p_prestadora_id
    RETURNING codigo_intentos INTO v_intentos;

  ELSE
    RAISE EXCEPTION 'sumar_intento_de_codigo: esa tabla no lleva cuenta de intentos';
  END IF;

  -- Si no se actualizó ninguna fila, `v_intentos` queda nulo. Se devuelve así a propósito: quien
  -- llama trata el nulo como "se agotaron", que es lo que corresponde cuando no se pudo contar.
  RETURN v_intentos;
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

  -- La única que no se llena sola: `nombre` es obligatorio y no tiene valor de arranque
  -- posible: sale del nombre de fantasía con el que se dio de alta la Prestadora.
  INSERT INTO configuracion_prestadora (prestadora_id, nombre)
  SELECT p.id, p.nombre_fantasia
  FROM prestadoras p
  WHERE p.id = p_prestadora_id
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
  INSERT INTO motivos_sustitucion_guardia (prestadora_id, clave, pide_detalle, orden)
  VALUES
    (p_prestadora_id, 'emergencia', false, 10),
    (p_prestadora_id, 'otro',       true,  99)
  ON CONFLICT DO NOTHING;

  -- Y cómo puede terminar un turno que quedó sin nadie. Los dos primeros los escribe el motor
  -- cuando la base ya lo dice; los demás los elige quien coordina.
  INSERT INTO finales_turno_sin_cubrir
    (prestadora_id, clave, es_defecto_grave, pide_detalle, lo_escribe_el_sistema, orden)
  VALUES
    (p_prestadora_id, 'llego_un_relevo',               false, false, true,  10),
    (p_prestadora_id, 'ya_no_hacia_falta',             false, false, true,  20),
    (p_prestadora_id, 'lo_cubrio_la_coordinadora',     false, false, false, 30),
    (p_prestadora_id, 'se_extendio_el_turno',          false, false, false, 40),
    (p_prestadora_id, 'quedo_solo_con_consentimiento', true,  false, false, 50),
    (p_prestadora_id, 'no_fue_nadie',                  true,  false, false, 60),
    (p_prestadora_id, 'se_resolvio_de_otra_manera',    false, true,  false, 99)
  ON CONFLICT DO NOTHING;

  -- Y los motivos con los que se resuelve una postulación o una solicitud. La lista la arma
  -- `sembrar_motivos_resolucion`, que sigue siendo el punto único: acá se la llama, no se la copia.
  PERFORM sembrar_motivos_resolucion(p_prestadora_id);
END;
$function$;
CREATE OR REPLACE FUNCTION public.correcciones_de_factura(p_factura_id uuid)
 RETURNS TABLE(neto numeric, correcciones_contadas integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(SUM(CASE WHEN c.sentido = 'resta' THEN -c.monto ELSE c.monto END), 0)::numeric(12, 2),
    COUNT(*)::integer
  FROM public.correcciones_factura_cliente c
  WHERE c.factura_id = p_factura_id;
$function$;
CREATE OR REPLACE FUNCTION public.fn_refrescar_factura_de_una_correccion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    UPDATE public.facturas_cliente SET updated_at = now() WHERE id = OLD.factura_id;
  END IF;

  IF TG_OP <> 'DELETE' AND (TG_OP = 'INSERT' OR NEW.factura_id IS DISTINCT FROM OLD.factura_id) THEN
    UPDATE public.facturas_cliente SET updated_at = now() WHERE id = NEW.factura_id;
  END IF;

  RETURN NULL;
END;
$function$;
CREATE OR REPLACE FUNCTION interno.prestadora_de_la_restriccion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid;
BEGIN
  SELECT prestadora_id INTO v_prestadora FROM public.clientes WHERE id = NEW.cliente_id;
  IF v_prestadora IS NULL THEN
    RAISE EXCEPTION 'El Cliente del aviso no existe';
  END IF;
  NEW.prestadora_id := v_prestadora;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.guardar_secreto_del_aviso_de_cobranza(p_prestadora_id uuid, p_secreto text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
DECLARE
  v_secret_id UUID;
BEGIN
  SELECT secreto_del_aviso_secret_id INTO v_secret_id
  FROM configuracion_facturacion_clientes
  WHERE prestadora_id = p_prestadora_id;

  IF v_secret_id IS NULL THEN
    v_secret_id := vault.create_secret(p_secreto, 'aviso_de_cobranza_' || p_prestadora_id::text);
    INSERT INTO configuracion_facturacion_clientes (prestadora_id, secreto_del_aviso_secret_id)
    VALUES (p_prestadora_id, v_secret_id)
    ON CONFLICT (prestadora_id)
    DO UPDATE SET secreto_del_aviso_secret_id = EXCLUDED.secreto_del_aviso_secret_id, updated_at = NOW();
  ELSE
    PERFORM vault.update_secret(v_secret_id, p_secreto);
    UPDATE configuracion_facturacion_clientes SET updated_at = NOW()
    WHERE prestadora_id = p_prestadora_id;
  END IF;

  RETURN v_secret_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.leer_secreto_del_aviso_de_cobranza(p_prestadora_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
DECLARE v_secret_id UUID; v_secreto TEXT;
BEGIN
  IF NOT interno.le_corresponde(p_prestadora_id) THEN RETURN NULL; END IF;
  SELECT secreto_del_aviso_secret_id INTO v_secret_id
    FROM configuracion_facturacion_clientes WHERE prestadora_id = p_prestadora_id;
  IF v_secret_id IS NULL THEN RETURN NULL; END IF;
  SELECT decrypted_secret INTO v_secreto FROM vault.decrypted_secrets WHERE id = v_secret_id;
  RETURN v_secreto;
END;
$function$;
CREATE OR REPLACE FUNCTION public.guardar_secreto_del_aviso_de_facturacion(p_prestadora_id uuid, p_secreto text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
DECLARE
  v_secret_id UUID;
BEGIN
  SELECT secreto_del_aviso_de_facturacion_secret_id INTO v_secret_id
  FROM configuracion_facturacion_clientes
  WHERE prestadora_id = p_prestadora_id;

  IF v_secret_id IS NULL THEN
    v_secret_id := vault.create_secret(p_secreto, 'aviso_de_facturacion_' || p_prestadora_id::text);
    INSERT INTO configuracion_facturacion_clientes (prestadora_id, secreto_del_aviso_de_facturacion_secret_id)
    VALUES (p_prestadora_id, v_secret_id)
    ON CONFLICT (prestadora_id)
    DO UPDATE SET secreto_del_aviso_de_facturacion_secret_id = EXCLUDED.secreto_del_aviso_de_facturacion_secret_id,
                  updated_at = NOW();
  ELSE
    PERFORM vault.update_secret(v_secret_id, p_secreto);
    UPDATE configuracion_facturacion_clientes SET updated_at = NOW()
    WHERE prestadora_id = p_prestadora_id;
  END IF;

  RETURN v_secret_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.leer_secreto_del_aviso_de_facturacion(p_prestadora_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
DECLARE v_secret_id UUID; v_secreto TEXT;
BEGIN
  IF NOT interno.le_corresponde(p_prestadora_id) THEN RETURN NULL; END IF;
  SELECT secreto_del_aviso_de_facturacion_secret_id INTO v_secret_id
    FROM configuracion_facturacion_clientes WHERE prestadora_id = p_prestadora_id;
  IF v_secret_id IS NULL THEN RETURN NULL; END IF;
  SELECT decrypted_secret INTO v_secreto FROM vault.decrypted_secrets WHERE id = v_secret_id;
  RETURN v_secreto;
END;
$function$;
CREATE OR REPLACE FUNCTION interno.prestadora_del_estado_de_cuenta()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid;
BEGIN
  SELECT prestadora_id INTO v_prestadora FROM public.clientes WHERE id = NEW.cliente_id;
  IF v_prestadora IS NULL THEN
    RAISE EXCEPTION 'El Cliente del aviso no existe';
  END IF;
  NEW.prestadora_id := v_prestadora;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION interno.exigir_paciente_y_servicio_del_mismo_contratante(p_paciente_id uuid, p_servicio_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  tipo text;
  contratante uuid;
  prestadora_servicio uuid;
  cliente_paciente uuid;
  prestadora_paciente uuid;
BEGIN
  -- Sin Servicio no hay nada que comparar: hay Guardias y prestaciones que todavía no cuelgan
  -- de ninguno, y esta regla no es la que las obliga.
  IF p_servicio_id IS NULL THEN
    RETURN;
  END IF;

  SELECT tipo_contratante, contratante_id, prestadora_id
    INTO tipo, contratante, prestadora_servicio
    FROM servicios WHERE id = p_servicio_id;

  IF tipo IS NULL THEN
    RAISE EXCEPTION 'servicio_inexistente:%', p_servicio_id;
  END IF;

  SELECT cliente_id, prestadora_id
    INTO cliente_paciente, prestadora_paciente
    FROM pacientes WHERE id = p_paciente_id;

  IF prestadora_paciente IS NULL THEN
    RAISE EXCEPTION 'paciente_inexistente:%', p_paciente_id;
  END IF;

  -- Esto vale sea quien sea el Cliente, y antes no se controlaba en ningún lado: las claves
  -- compuestas del `20260910100000` amarran la Guardia con su Servicio, pero nada amarraba al
  -- Paciente con el Servicio que lo factura.
  IF prestadora_paciente <> prestadora_servicio THEN
    RAISE EXCEPTION 'paciente_de_otra_prestadora:%', p_paciente_id;
  END IF;

  -- Y esto sólo cuando el contratante es un Cliente, que es el caso donde la pregunta tiene
  -- sentido. Con otro tipo de Cliente el vínculo entre el Paciente y quien contrata todavía no
  -- existe en la base, y no se inventa uno acá.
  IF tipo = 'cliente' AND (cliente_paciente IS NULL OR cliente_paciente <> contratante) THEN
    RAISE EXCEPTION 'paciente_fuera_del_contratante:%:%', p_paciente_id, p_servicio_id;
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION interno.modalidades_habilitadas_de_prestadora(p_prestadora_id uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    NULLIF(
      ARRAY(
        SELECT pm.modalidad
          FROM public.prestadora_modalidades pm
         WHERE pm.prestadora_id = p_prestadora_id
           AND pm.activa
           AND pm.modalidad IN ('directa', 'match')
         ORDER BY pm.modalidad
      ),
      ARRAY[]::text[]
    ),
    ARRAY['directa']::text[]
  );
$function$;
CREATE OR REPLACE FUNCTION interno.exigir_contratante_del_servicio()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  prestadora_del_contratante uuid;
BEGIN
  -- Una rama por tipo. El `ELSE` es el que hace que falle cerrado: un tipo que esta versión no
  -- conoce se rechaza, en vez de guardarse apuntando a la nada.
  IF NEW.tipo_contratante = 'cliente' THEN
    SELECT prestadora_id INTO prestadora_del_contratante
      FROM clientes WHERE id = NEW.contratante_id;
  ELSE
    RAISE EXCEPTION 'contratante_de_tipo_desconocido:%', NEW.tipo_contratante;
  END IF;

  IF prestadora_del_contratante IS NULL THEN
    RAISE EXCEPTION 'contratante_inexistente:%:%', NEW.tipo_contratante, NEW.contratante_id;
  END IF;

  IF prestadora_del_contratante <> NEW.prestadora_id THEN
    RAISE EXCEPTION 'contratante_de_otra_prestadora:%', NEW.contratante_id;
  END IF;

  -- Quién firmó la contratación se exige desde hoy, en el alta. Las filas viejas no lo tienen y no
  -- se las inventa: por eso se mira el alta y no la modificación.
  IF TG_OP = 'INSERT' AND NEW.contratante_legajo_id IS NULL THEN
    RAISE EXCEPTION 'servicio_sin_contratante_en_el_padron';
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.poner_clave_con_codigo(p_uso text, p_codigo text, p_clave text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid;
  v_usuario uuid;
BEGIN
  IF auth.jwt() ->> 'role' IS DISTINCT FROM 'trabajo_sin_persona' THEN RETURN NULL; END IF;
  v_prestadora := interno.current_tenant();
  IF v_prestadora IS NULL OR coalesce(p_codigo, '') = '' OR coalesce(p_clave, '') = '' THEN
    RETURN NULL;
  END IF;

  IF p_uso = 'activacion' THEN
    UPDATE tokens_activacion_cuenta t SET usado_en = now()
      FROM usuarios u
     WHERE t.token = p_codigo AND t.usado_en IS NULL AND t.expira_en > now()
       AND u.id = t.usuario_id AND u.prestadora_id = v_prestadora
       AND u.rol IN ('coordinador', 'asistente', 'cliente')
    RETURNING t.usuario_id INTO v_usuario;
  ELSIF p_uso = 'recuperacion' THEN
    UPDATE tokens_recuperacion_clave t SET usado_en = now()
      FROM usuarios u
     WHERE t.token = p_codigo AND t.usado_en IS NULL AND t.expira_en > now()
       AND u.id = t.usuario_id AND u.prestadora_id = v_prestadora
       AND u.rol IN ('coordinador', 'asistente', 'cliente')
    RETURNING t.usuario_id INTO v_usuario;
  ELSE
    RETURN NULL;
  END IF;

  IF v_usuario IS NULL THEN RETURN NULL; END IF;

  UPDATE auth.users
     SET encrypted_password = extensions.crypt(p_clave, extensions.gen_salt('bf', 10)),
         updated_at = now()
   WHERE id = v_usuario;
  -- Sin cuenta de ingreso no queda ninguna clave puesta, y el código tampoco se gasta.
  IF NOT FOUND THEN RAISE EXCEPTION 'poner_clave_con_codigo: la cuenta no tiene ingreso'; END IF;

  RETURN v_usuario;
END;
$function$;
CREATE OR REPLACE FUNCTION interno.conversacion_match_es_propia(p_conversacion_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM conversaciones_match c
     WHERE c.id = p_conversacion_id
       -- Primero la Prestadora, que sale de la cuenta con la que se entró y de ningún otro lado.
       AND c.prestadora_id = interno.current_tenant()
       -- Y después una de las dos puntas. Quien no es ninguna de las dos no resuelve nada:
       -- comparar contra una ficha que no existe da desconocido, y desconocido no deja pasar.
       AND (
            c.cliente_id = interno.cliente_id_de_usuario(auth.uid())
         OR c.asistente_id = interno.asistente_de_la_sesion()
       )
  )
$function$;
CREATE OR REPLACE FUNCTION public.fn_completar_moneda_desde_cliente()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF NEW.moneda IS NULL THEN
    SELECT interno.moneda_de_prestadora(f.prestadora_id) INTO NEW.moneda
    FROM public.clientes f WHERE f.id = NEW.cliente_id;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_refrescar_factura_de_un_cobro()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    UPDATE public.facturas_cliente SET updated_at = now() WHERE id = OLD.factura_id;
  END IF;

  IF TG_OP <> 'DELETE' AND (TG_OP = 'INSERT' OR NEW.factura_id IS DISTINCT FROM OLD.factura_id) THEN
    UPDATE public.facturas_cliente SET updated_at = now() WHERE id = NEW.factura_id;
  END IF;

  RETURN NULL;
END;
$function$;
CREATE OR REPLACE FUNCTION interno.cliente_id_de_usuario(p_usuario_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT COALESCE(
    (SELECT f.id FROM clientes f
      WHERE f.usuario_id = p_usuario_id
        AND f.prestadora_id = interno.current_tenant()
      LIMIT 1),
    (SELECT m.cliente_id FROM personas_autorizadas m
      WHERE m.usuario_id = p_usuario_id
      LIMIT 1)
  )
$function$;
CREATE OR REPLACE FUNCTION interno.escalon_del_rol(p_rol text)
 RETURNS smallint
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE p_rol
    WHEN 'superadmin' THEN 4::smallint
    WHEN 'admin_prestadora' THEN 3::smallint
    WHEN 'coordinador' THEN 2::smallint
    WHEN 'asistente' THEN 1::smallint
    WHEN 'cliente' THEN 1::smallint
    -- Sin escalón. No es el más alto ni el más bajo: no hay ninguno, y por eso no se lo puede
    -- comparar con nadie.
    ELSE NULL::smallint
  END
$function$;
CREATE OR REPLACE FUNCTION interno.atiende_al_paciente(p_paciente uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  WITH yo AS (
    SELECT auth.uid()                       AS uid,
           interno.current_tenant()         AS tenant,
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
              AND (g.paciente_id = pac.id
                   OR EXISTS (SELECT 1 FROM guardia_pacientes gp
                               WHERE gp.guardia_id = g.id AND gp.paciente_id = pac.id))
              AND ((yo.asistente IS NOT NULL AND g.asistente_id = yo.asistente)
                   OR g.coordinador_id = yo.uid
                   OR (g.asistente_id IS NOT NULL
                       AND interno.coordinador_alcanza_asistente(g.asistente_id)))
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
              AND (sg.paciente_id = pac.id
                   OR EXISTS (SELECT 1 FROM series_guardias_pacientes sp
                               WHERE sp.serie_id = sg.id AND sp.paciente_id = pac.id))
              AND ((yo.asistente IS NOT NULL AND sg.asistente_id = yo.asistente)
                   OR (sg.asistente_id IS NOT NULL
                       AND interno.coordinador_alcanza_asistente(sg.asistente_id)))
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
CREATE OR REPLACE FUNCTION public.asistente_asignado_a_cliente(p_asistente_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM guardias g
    JOIN pacientes p ON p.id = g.paciente_id
    WHERE g.asistente_id = p_asistente_id
      AND p.cliente_id = cliente_id_de_usuario(auth.uid())
  );
$function$;
CREATE OR REPLACE FUNCTION public.sembrar_motivos_resolucion(p_prestadora_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO motivos_resolucion
    (prestadora_id, tabla, estado, nombre_es_ar, nombre_en, nombre_pt_br, pide_detalle, orden)
  VALUES
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
    -- Solicitudes.
    (p_prestadora_id, 'solicitudes', 'en_gestion',
     'Se toma para gestionar', 'Taken up for handling', 'Assumida para tratamento', false, 10),
    (p_prestadora_id, 'solicitudes', 'asignada',
     'Se arma la Guardia con un Asistente', 'The Shift is set up with an Assistant', 'O Plantão foi montado com um Assistente', false, 20),
    (p_prestadora_id, 'solicitudes', 'completada',
     'El Servicio quedó en marcha', 'The Service is up and running', 'O Serviço está em andamento', false, 30),
    (p_prestadora_id, 'solicitudes', 'cancelada',
     'Desistió', 'Withdrew', 'Desistiu', false, 40),
    (p_prestadora_id, 'solicitudes', 'cancelada',
     'Queda fuera de las zonas cubiertas', 'Outside the areas covered', 'Fora das áreas atendidas', false, 50),
    (p_prestadora_id, 'solicitudes', 'cancelada',
     'No se pudo ubicar a quien llamó', 'The caller could not be reached', 'Não foi possível localizar quem entrou em contato', false, 60),
    (p_prestadora_id, 'solicitudes', 'cancelada',
     'Otro motivo', 'Other reason', 'Outro motivo', true, 99),
    -- Guardias. Por ahora sólo las canceladas: es la decisión que se toma mirando la Guardia y que
    -- hasta hoy no dejaba rastro. La llegada y la salida las escribe el motor cuando pasan, y no
    -- se resuelven con un motivo porque no son una decisión sino un hecho.
    (p_prestadora_id, 'guardias', 'cancelada',
     'El Cliente la dio de baja', 'The Client cancelled it', 'O Cliente cancelou', false, 10),
    (p_prestadora_id, 'guardias', 'cancelada',
     'El Paciente quedó internado', 'The Patient was admitted to hospital', 'O Paciente ficou internado', false, 20),
    (p_prestadora_id, 'guardias', 'cancelada',
     'No se consiguió quién la cubriera', 'Nobody could be found to cover it', 'Não foi possível encontrar quem cobrisse', false, 30),
    (p_prestadora_id, 'guardias', 'cancelada',
     'Terminó el Servicio', 'The Service ended', 'O Serviço terminou', false, 40),
    (p_prestadora_id, 'guardias', 'cancelada',
     'Se había cargado por error', 'It had been entered by mistake', 'Tinha sido cadastrado por engano', false, 50),
    (p_prestadora_id, 'guardias', 'cancelada',
     'Otro motivo', 'Other reason', 'Outro motivo', true, 99)
  ON CONFLICT DO NOTHING;
END;
$function$;
CREATE OR REPLACE FUNCTION interno.el_numero_de_cliente_no_cambia()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF NEW.numero_cliente IS DISTINCT FROM OLD.numero_cliente THEN
    RAISE EXCEPTION 'numero_de_cliente_no_cambia';
  END IF;
  IF NEW.prestadora_id IS DISTINCT FROM OLD.prestadora_id THEN
    RAISE EXCEPTION 'cliente_no_cambia_de_organizacion';
  END IF;
  RETURN NEW;
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
    FROM series_guardias s JOIN pacientes p ON p.id = s.paciente_id
   WHERE s.id = NEW.serie_id;

  SELECT cliente_id INTO cliente_del_paciente FROM pacientes WHERE id = NEW.paciente_id;

  IF cliente_de_la_serie IS NULL OR cliente_del_paciente IS NULL
     OR cliente_de_la_serie <> cliente_del_paciente THEN
    RAISE EXCEPTION 'Todos los Pacientes de una serie tienen que ser de el mismo Cliente';
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION interno.asignar_numero_de_cliente()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF NEW.numero_cliente IS NOT NULL THEN
    RAISE EXCEPTION 'numero_de_cliente_no_se_elige';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('clientes:' || NEW.prestadora_id::text));

  SELECT COALESCE(max(numero_cliente), 0) + 1
    INTO NEW.numero_cliente
    FROM public.clientes
   WHERE prestadora_id = NEW.prestadora_id;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION interno.asistente_atiende_al_cliente(p_asistente_id uuid, p_cliente_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM guardia_pacientes gp
    JOIN guardias g ON g.id = gp.guardia_id
    JOIN pacientes p ON p.id = gp.paciente_id
    WHERE g.asistente_id = p_asistente_id
      AND p.cliente_id = p_cliente_id
  )
$function$;
revoke all on function interno.asistente_atiende_al_cliente(p_asistente_id uuid, p_cliente_id uuid) from public, anon, authenticated, service_role;
grant execute on function interno.asistente_atiende_al_cliente(p_asistente_id uuid, p_cliente_id uuid) to authenticated;
grant execute on function interno.asistente_atiende_al_cliente(p_asistente_id uuid, p_cliente_id uuid) to service_role;
grant execute on function interno.asistente_atiende_al_cliente(p_asistente_id uuid, p_cliente_id uuid) to trabajo_sin_persona;
CREATE OR REPLACE FUNCTION public.dar_de_alta_la_cuenta(p_email text, p_clave text, p_rol text, p_nombre text, p_telefono text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid;
  v_correo text;
  v_ingreso text;
  v_existente uuid;
  v_usuario uuid := gen_random_uuid();
BEGIN
  IF auth.jwt() ->> 'role' IS DISTINCT FROM 'trabajo_sin_persona' THEN
    RAISE EXCEPTION 'sin_permiso';
  END IF;
  v_prestadora := interno.current_tenant();
  IF v_prestadora IS NULL THEN RAISE EXCEPTION 'sin_permiso'; END IF;
  IF p_rol IS NULL OR p_rol NOT IN ('coordinador', 'asistente', 'cliente') THEN
    RAISE EXCEPTION 'sin_permiso';
  END IF;

  v_correo := lower(btrim(coalesce(p_email, ''), E' \t\r\n'));
  IF v_correo = '' OR coalesce(p_clave, '') = '' THEN RAISE EXCEPTION 'faltan_datos'; END IF;

  v_ingreso := encode(extensions.digest(lower(v_prestadora::text) || ':' || v_correo, 'sha256'), 'hex')
               || '@acceso.careonys.invalid';

  -- Si ya hay una cuenta de ingreso con ese correo, se mira qué tiene detrás. Sin fila en
  -- `usuarios` es lo que dejó un alta anterior cortada por la mitad: no le sirve a nadie y se
  -- borra. Con fila, esa persona ya tiene cuenta en esta Prestadora: el correo lleva la
  -- Prestadora adentro, así que no puede ser de otra.
  SELECT id INTO v_existente FROM auth.users WHERE email = v_ingreso;
  IF v_existente IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM usuarios WHERE id = v_existente) THEN
      RAISE EXCEPTION 'correo_de_esta_prestadora';
    END IF;
    DELETE FROM auth.users WHERE id = v_existente;
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  VALUES (
    '00000000-0000-0000-0000-000000000000', v_usuario, 'authenticated', 'authenticated',
    v_ingreso, extensions.crypt(p_clave, extensions.gen_salt('bf', 10)), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', '', '', '', '', '');

  INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (
    v_usuario::text, v_usuario,
    jsonb_build_object('sub', v_usuario::text, 'email', v_ingreso, 'email_verified', true),
    'email', NULL, now(), now());

  -- El correo de verdad va acá y no del lado del ingreso, guardado comparable, que es como se busca.
  INSERT INTO usuarios (id, rol, nombre, telefono, email, prestadora_id)
  VALUES (v_usuario, p_rol, p_nombre, nullif(btrim(coalesce(p_telefono, '')), ''), v_correo, v_prestadora);

  RETURN v_usuario;
END;
$function$;
CREATE OR REPLACE FUNCTION public.dar_de_baja_la_cuenta(p_usuario uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid;
BEGIN
  IF auth.jwt() ->> 'role' IS DISTINCT FROM 'trabajo_sin_persona' THEN RETURN false; END IF;
  v_prestadora := interno.current_tenant();
  IF v_prestadora IS NULL OR p_usuario IS NULL THEN RETURN false; END IF;

  DELETE FROM usuarios
   WHERE id = p_usuario
     AND prestadora_id = v_prestadora
     AND rol IN ('coordinador', 'asistente', 'cliente');
  IF NOT FOUND THEN RETURN false; END IF;

  DELETE FROM auth.users WHERE id = p_usuario;
  RETURN true;
END;
$function$;
CREATE OR REPLACE FUNCTION interno.pacientes_del_cliente()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT p.id
  FROM pacientes p
  WHERE p.prestadora_id = interno.current_tenant()
    AND p.cliente_id = interno.cliente_id_de_usuario(auth.uid())
$function$;
CREATE OR REPLACE FUNCTION interno.es_cliente()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT interno.cliente_id_de_usuario(auth.uid()) IS NOT NULL
$function$;
CREATE OR REPLACE FUNCTION public.resumen_cobros_de_factura(p_factura_id uuid)
 RETURNS TABLE(cobrado numeric, cobros_contados integer, ultimo_cobro_fecha date, origenes text[])
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(SUM(c.monto), 0)::numeric(12, 2),
    COUNT(*)::integer,
    MAX(c.fecha_cobro),
    COALESCE(ARRAY_AGG(DISTINCT c.origen ORDER BY c.origen), ARRAY[]::text[])
  FROM public.cobros_cliente c
  WHERE c.factura_id = p_factura_id
    AND c.estado = 'registrado';
$function$;
CREATE OR REPLACE FUNCTION interno.puede_configurar_accesos_de_personas_autorizadas()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT interno.es_superadmin()
      OR (
        EXISTS (
          SELECT 1 FROM usuarios u
           WHERE u.id = auth.uid()
             AND u.rol IN ('admin_prestadora', 'coordinador')
        )
        AND interno.tiene_permiso('configurar_accesos_de_personas_autorizadas')
      )
$function$;
CREATE OR REPLACE FUNCTION interno.persona_autorizada_puede(p_usuario uuid, p_clave text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT CASE
    WHEN p_usuario IS NULL THEN false
    WHEN EXISTS (
      SELECT 1 FROM clientes f
       WHERE f.usuario_id = p_usuario
         AND f.prestadora_id = interno.current_tenant()
    ) THEN true
    ELSE COALESCE(
      (SELECT p.permitido
         FROM permisos_personas_autorizadas p
        WHERE p.usuario_id = p_usuario
          AND p.clave = p_clave),
      false
    )
  END
$function$;
CREATE OR REPLACE FUNCTION public.fn_modalidades_de_asistente_nuevo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  -- Solo cuando no vinieron elegidas. Si el alta las mandó, mandan las que mandó:
  -- el valor por omisión de la columna no distingue una cosa de la otra.
  IF NEW.prestadora_id IS NOT NULL
     AND (NEW.canales IS NULL
          OR NEW.canales = ARRAY['directa'::text, 'match'::text]) THEN
    NEW.canales := interno.modalidades_habilitadas_de_prestadora(NEW.prestadora_id);
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.sumar_contactos_al_saldo(p_acceso_id uuid, p_cuantos integer)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_saldo integer;
BEGIN
  IF p_cuantos IS NULL OR p_cuantos <= 0 THEN
    RAISE EXCEPTION 'sumar_contactos_al_saldo: se suman contactos, no cero ni menos';
  END IF;

  -- En una sola sentencia. Un saldo vacío es un acceso que todavía no se sostenía por saldo: la
  -- primera carga lo estrena, y de ahí en más se le suma lo de cada compra.
  UPDATE public.accesos_match
     SET saldo_contactos = COALESCE(saldo_contactos, 0) + p_cuantos,
         updated_at = now()
   WHERE id = p_acceso_id
  RETURNING saldo_contactos INTO v_saldo;

  -- Sin fila, queda nulo. Se devuelve así: quien llama tiene que poder distinguir «no había qué
  -- cargar» de «quedó en cero», que no son lo mismo.
  RETURN v_saldo;
END;
$function$;
CREATE OR REPLACE FUNCTION public.consumir_contacto_match(p_acceso_id uuid, p_asistente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_acceso public.accesos_match%ROWTYPE;
  v_ya_estaba boolean;
  v_saldo integer;
BEGIN
  -- Tomada la fila del acceso, el que llegue segundo espera acá. Sin esto, dos pedidos leen el
  -- mismo saldo y los dos descuentan sobre ese número: de dos contactos se cobra uno.
  SELECT * INTO v_acceso
    FROM public.accesos_match
   WHERE id = p_acceso_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'acceso_inexistente');
  END IF;

  -- Falla cerrado: un acceso vencido o dado de baja no abre nada, aunque le haya quedado saldo.
  IF v_acceso.estado <> 'vigente' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'acceso_no_vigente');
  END IF;

  -- Ya abierto antes: se contesta que sí y no se cobra de nuevo. El contacto de un Asistente se
  -- paga una sola vez por Cliente, y mirarlo otra vez no es un contacto nuevo.
  SELECT EXISTS (
    SELECT 1 FROM public.contactos_vistos_match
     WHERE cliente_id = v_acceso.cliente_id AND asistente_id = p_asistente_id
  ) INTO v_ya_estaba;

  IF v_ya_estaba THEN
    RETURN jsonb_build_object(
      'ok', true, 'ya_estaba', true, 'saldo_contactos', v_acceso.saldo_contactos
    );
  END IF;

  IF v_acceso.saldo_contactos IS NOT NULL AND v_acceso.saldo_contactos <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'saldo_agotado', 'saldo_contactos', 0);
  END IF;

  -- Se anota primero y se descuenta después, en ese orden y no al revés: así el candado de la
  -- tabla es el que decide, y no queda ninguna forma de descontar sin haber anotado. La misma
  -- Cliente con dos paquetes abriendo el mismo Asistente a la vez llega hasta acá por dos filas
  -- de acceso distintas, que el candado de más arriba no cruza; el segundo choca contra éste.
  BEGIN
    INSERT INTO public.contactos_vistos_match
      (prestadora_id, cliente_id, asistente_id, acceso_id)
    VALUES
      (v_acceso.prestadora_id, v_acceso.cliente_id, p_asistente_id, p_acceso_id);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'ok', true, 'ya_estaba', true, 'saldo_contactos', v_acceso.saldo_contactos
    );
  END;

  -- El que se sostiene por fecha no tiene qué descontar: queda anotado y el saldo sigue vacío.
  IF v_acceso.saldo_contactos IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'ya_estaba', false, 'saldo_contactos', NULL);
  END IF;

  UPDATE public.accesos_match
     SET saldo_contactos = saldo_contactos - 1,
         updated_at = now()
   WHERE id = p_acceso_id
  RETURNING saldo_contactos INTO v_saldo;

  RETURN jsonb_build_object('ok', true, 'ya_estaba', false, 'saldo_contactos', v_saldo);
END;
$function$;
comment on function interno.conversacion_match_es_propia(p_conversacion_id uuid) is $r$Si el hilo de Match es de quien esta consultando: de su Prestadora, y con el como una de las dos puntas. Lo consultan las politicas de conversaciones_match y de mensajes_match, y es el unico lugar donde esa pregunta esta escrita.$r$;
comment on function public.asistente_asignado_a_cliente(p_asistente_id uuid) is $r$Única fuente de verdad para saber si un Asistente atiende a un Paciente del Cliente de la sesión. Va por función y no dentro de la política para no armar una referencia circular entre asistentes y guardias.$r$;
comment on function interno.el_numero_de_cliente_no_cambia() is $r$El numero de cliente es con lo que se nombra a ese Cliente en papeles que ya salieron de aca.$r$;
comment on function interno.asignar_numero_de_cliente() is $r$El numero de cliente, uno mas que el mayor de esa Prestadora. No se reasigna porque ningún Cliente se borra de la tabla.$r$;
comment on function interno.asistente_atiende_al_cliente(p_asistente_id uuid, p_cliente_id uuid) is $r$Si un Asistente tiene alguna guardia con algún Paciente de ese Cliente.$r$;

-- 5. Restricciones de valores cerrados, con los valores nuevos
alter table public.clientes add constraint clientes_financiador_conocido CHECK (((financiador_tipo IS NULL) OR (financiador_tipo = ANY (ARRAY['cliente'::text, 'obra_social'::text, 'otro'::text]))));
alter table public.series_guardias add constraint series_guardias_canal_modalidad_check CHECK ((canal_modalidad = ANY (ARRAY['directa'::text, 'match'::text, 'subcontratacion'::text])));
alter table public.series_guardias add constraint series_guardias_cancelacion_origen_check CHECK ((cancelacion_origen = ANY (ARRAY['cliente'::text, 'prestadora'::text])));
alter table public.facturas_cliente add constraint facturas_cliente_financiador_conocido CHECK (((financiador_tipo IS NULL) OR (financiador_tipo = ANY (ARRAY['cliente'::text, 'obra_social'::text, 'otro'::text]))));
alter table public.push_subscriptions add constraint push_subscriptions_una_audiencia CHECK (((asistente_id IS NOT NULL) <> (cliente_id IS NOT NULL)));
alter table public.asistentes add constraint asistentes_canales_valido CHECK (((canales <@ ARRAY['directa'::text, 'match'::text]) AND (array_length(canales, 1) > 0)));
alter table public.codigos_de_presencia add constraint codigos_de_presencia_sujeto_tipo_check CHECK ((sujeto_tipo = ANY (ARRAY['cliente'::text, 'asistente'::text])));
alter table public.guardia_comprobaciones add constraint guardia_comprobaciones_medio_check CHECK (((medio IS NULL) OR (medio = ANY (ARRAY['codigo_cliente'::text, 'codigo_asistente_saliente'::text, 'codigo_prestadora'::text]))));
alter table public.guardia_comprobaciones add constraint guardia_comprobaciones_sujeto_coherencia_check CHECK ((((medio = ANY (ARRAY['codigo_cliente'::text, 'codigo_asistente_saliente'::text])) AND (sujeto_tipo IS NOT NULL) AND (sujeto_id IS NOT NULL)) OR ((medio = 'codigo_prestadora'::text) AND (sujeto_tipo IS NULL) AND (sujeto_id IS NULL)) OR (medio IS NULL)));
alter table public.guardia_comprobaciones add constraint guardia_comprobaciones_sujeto_tipo_check CHECK (((sujeto_tipo IS NULL) OR (sujeto_tipo = ANY (ARRAY['cliente'::text, 'asistente'::text]))));
alter table public.auditoria_cambio_dueno_push add constraint auditoria_cambio_dueno_push_rol_anterior_check CHECK ((rol_anterior = ANY (ARRAY['asistente'::text, 'cliente'::text])));
alter table public.auditoria_cambio_dueno_push add constraint auditoria_cambio_dueno_push_rol_nuevo_check CHECK ((rol_nuevo = ANY (ARRAY['asistente'::text, 'cliente'::text])));
alter table public.llaves_de_dispositivo add constraint llaves_de_dispositivo_rol_check CHECK ((rol = ANY (ARRAY['asistente'::text, 'cliente'::text])));
alter table public.desafios_de_llave add constraint desafios_de_llave_rol_check CHECK ((rol = ANY (ARRAY['asistente'::text, 'cliente'::text])));
alter table public.guardias add constraint guardias_canal_modalidad_check CHECK ((canal_modalidad = ANY (ARRAY['directa'::text, 'match'::text, 'subcontratacion'::text])));
alter table public.guardias add constraint guardias_cancelacion_origen_check CHECK ((cancelacion_origen = ANY (ARRAY['cliente'::text, 'prestadora'::text])));
alter table public.importaciones_prestadora add constraint importaciones_prestadora_tipo_check CHECK ((tipo = ANY (ARRAY['asistente'::text, 'cliente'::text])));
alter table public.prestadora_modalidades add constraint prestadora_modalidades_modalidad_check CHECK ((modalidad = ANY (ARRAY['directa'::text, 'match'::text, 'subcontratacion'::text])));
alter table public.mensajes_match add constraint mensajes_match_lado_check CHECK ((lado = ANY (ARRAY['cliente'::text, 'asistente'::text])));
alter table public.opciones_de_lista add constraint opciones_de_lista_modalidades_check CHECK (((modalidades IS NULL) OR ((array_length(modalidades, 1) >= 1) AND (modalidades <@ ARRAY['directa'::text, 'match'::text, 'subcontratacion'::text]))));
alter table public.usuarios add constraint usuarios_rol_check CHECK ((rol = ANY (ARRAY['admin_prestadora'::text, 'coordinador'::text, 'asistente'::text, 'cliente'::text, 'superadmin'::text])));
alter table public.formularios_declarados add constraint formularios_declarados_ambito_check CHECK ((ambito = ANY (ARRAY['asistente'::text, 'paciente'::text, 'cliente'::text, 'servicio'::text])));

-- Claves foráneas
alter table public.permisos_prestadora add constraint permisos_prestadora_accion_fkey FOREIGN KEY (accion) REFERENCES catalogo_acciones_permisos(accion);
alter table public.configuracion_funciones_match add constraint configuracion_funciones_match_funcion_clave_fkey FOREIGN KEY (funcion_clave) REFERENCES catalogo_funciones_match(clave);

-- Valores de fábrica
alter table public.asistentes alter column canales set default ARRAY['directa'::text, 'match'::text];

-- Disparadores
CREATE TRIGGER trg_completar_moneda BEFORE INSERT ON public.facturas_cliente_items FOR EACH ROW EXECUTE FUNCTION fn_completar_moneda_desde_padre('facturas_cliente', 'factura_id');
CREATE TRIGGER trg_completar_moneda BEFORE INSERT ON public.cobros_cliente FOR EACH ROW EXECUTE FUNCTION fn_completar_moneda_desde_padre('facturas_cliente', 'factura_id');
CREATE TRIGGER trg_completar_prestadora BEFORE INSERT ON public.facturas_cliente_items FOR EACH ROW EXECUTE FUNCTION fn_completar_prestadora_desde_padre('facturas_cliente', 'factura_id');
CREATE TRIGGER el_medio_del_cobro_sale_del_catalogo BEFORE INSERT OR UPDATE OF medio ON public.cobros_cliente FOR EACH ROW EXECUTE FUNCTION interno.el_medio_de_pago_sale_del_catalogo('medio', 'medios_de_pago_del_cliente');

-- 6. Depósitos de archivos: se crean con el nombre nuevo
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('instrucciones-acceso-personas-autorizadas', 'instrucciones-acceso-personas-autorizadas', false, null, null);
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('comprobantes-cliente', 'comprobantes-cliente', false, 5242880, array['application/pdf']);

-- 7. Políticas
create policy cliente_ve_certificado_asistente_asignado on public.certificados as permissive for select to public
  using (interno.asistente_atiende_al_cliente(asistente_id, interno.cliente_id_de_usuario(auth.uid())));
create policy admin_gestiona_clientes on public.clientes as permissive for all to public
  using (((interno.es_superadmin() AND (prestadora_id = interno.current_tenant())) OR ((prestadora_id = interno.current_tenant()) AND (EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = auth.uid()) AND (u.rol = 'admin_prestadora'::text)))))));
create policy coordinador_edita_clientes on public.clientes as permissive for update to public
  using (((prestadora_id = interno.current_tenant()) AND (EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = auth.uid()) AND (u.rol = 'coordinador'::text)))) AND interno.tiene_permiso('editar_datos_cliente'::text)));
create policy coordinador_lee_clientes on public.clientes as permissive for select to public
  using (((prestadora_id = interno.current_tenant()) AND (EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = auth.uid()) AND (u.rol = 'coordinador'::text))))));
create policy cliente_ve_su_propia_fila on public.clientes as permissive for select to public
  using ((id = interno.cliente_id_de_usuario(auth.uid())));
create policy cliente_lee_domicilios_temporales on public.domicilios_temporales_paciente as permissive for select to public
  using (((prestadora_id = interno.current_tenant()) AND (EXISTS ( SELECT 1
   FROM pacientes p
  WHERE ((p.id = domicilios_temporales_paciente.paciente_id) AND (p.cliente_id = interno.cliente_id_de_usuario(auth.uid())))))));
create policy panel_gestiona_permisos_personas_autorizadas on public.permisos_personas_autorizadas as permissive for all to public
  using (((EXISTS ( SELECT 1
   FROM clientes f
  WHERE ((f.id = permisos_personas_autorizadas.cliente_id) AND (f.prestadora_id = interno.current_tenant())))) AND interno.puede_configurar_accesos_de_personas_autorizadas()))
  with check (((EXISTS ( SELECT 1
   FROM clientes f
  WHERE ((f.id = permisos_personas_autorizadas.cliente_id) AND (f.prestadora_id = interno.current_tenant())))) AND interno.puede_configurar_accesos_de_personas_autorizadas()));
create policy titular_lee_los_permisos_de_sus_personas_autorizadas on public.permisos_personas_autorizadas as permissive for select to public
  using ((cliente_id = interno.cliente_id_de_usuario(auth.uid())));
create policy cliente_ve_su_acceso_match on public.accesos_match as permissive for select to public
  using (((cliente_id = interno.cliente_id_de_usuario(auth.uid())) AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_dinero'::text)));
create policy prestadora_ve_accesos_match on public.accesos_match as permissive for select to public
  using (((prestadora_id = interno.current_tenant()) AND (EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = auth.uid()) AND (u.rol = ANY (ARRAY['admin_prestadora'::text, 'coordinador'::text])))))));
create policy cliente_ve_los_contactos_que_abrio on public.contactos_vistos_match as permissive for select to public
  using (((cliente_id = interno.cliente_id_de_usuario(auth.uid())) AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_dinero'::text)));
create policy cliente_ve_alertas_de_sus_pacientes on public.alertas as permissive for select to public
  using (((EXISTS ( SELECT 1
   FROM pacientes p
  WHERE ((p.id = alertas.paciente_id) AND (p.cliente_id = interno.cliente_id_de_usuario(auth.uid()))))) AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_alertas'::text)));
create policy cliente_ve_sus_facturas on public.facturas_cliente as permissive for select to public
  using (((cliente_id = interno.cliente_id_de_usuario(auth.uid())) AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_dinero'::text)));
create policy panel_gestiona_facturas_cliente on public.facturas_cliente as permissive for all to public
  using (((prestadora_id = interno.current_tenant()) AND interno.gestiona_la_facturacion()))
  with check (((prestadora_id = interno.current_tenant()) AND interno.gestiona_la_facturacion()));
create policy cliente_gestiona_sus_push_subscriptions on public.push_subscriptions as permissive for all to public
  using ((cliente_id = interno.cliente_id_de_usuario(auth.uid())))
  with check ((cliente_id = interno.cliente_id_de_usuario(auth.uid())));
create policy cliente_lee_asistente_asignado on public.asistentes as permissive for select to authenticated
  using (((prestadora_id = interno.current_tenant()) AND interno.asistente_atiende_al_cliente(id, interno.cliente_id_de_usuario(auth.uid()))));
create policy cliente_ve_hospitalizaciones_de_su_paciente on public.hospitalizaciones_paciente as permissive for select to public
  using (((EXISTS ( SELECT 1
   FROM pacientes p
  WHERE ((p.id = hospitalizaciones_paciente.paciente_id) AND (p.cliente_id = interno.cliente_id_de_usuario(auth.uid()))))) AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_internaciones'::text)));
create policy cliente_ve_sus_servicios on public.servicios as permissive for select to public
  using (((prestadora_id = interno.current_tenant()) AND (tipo_contratante = 'cliente'::text) AND (contratante_id = interno.cliente_id_de_usuario(auth.uid()))));
create policy cliente_ve_items_de_sus_facturas on public.facturas_cliente_items as permissive for select to public
  using (((EXISTS ( SELECT 1
   FROM facturas_cliente f
  WHERE ((f.id = facturas_cliente_items.factura_id) AND (f.cliente_id = interno.cliente_id_de_usuario(auth.uid()))))) AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_dinero'::text)));
create policy panel_gestiona_facturas_cliente_items on public.facturas_cliente_items as permissive for all to public
  using ((EXISTS ( SELECT 1
   FROM facturas_cliente f
  WHERE ((f.id = facturas_cliente_items.factura_id) AND ((interno.es_superadmin() AND (f.prestadora_id = interno.current_tenant())) OR ((f.prestadora_id = interno.current_tenant()) AND (EXISTS ( SELECT 1
           FROM usuarios u
          WHERE ((u.id = auth.uid()) AND (u.rol = ANY (ARRAY['admin_prestadora'::text, 'coordinador'::text])))))))))));
create policy cliente_lee_rangos_de_sus_pacientes on public.rangos_referencia_vitales as permissive for select to authenticated
  using (((prestadora_id = interno.current_tenant()) AND (paciente_id IN ( SELECT interno.pacientes_del_cliente() AS pacientes_del_cliente))));
create policy admin_gestiona_personas_autorizadas on public.personas_autorizadas as permissive for all to public
  using (((interno.es_superadmin() AND (EXISTS ( SELECT 1
   FROM clientes f
  WHERE ((f.id = personas_autorizadas.cliente_id) AND (f.prestadora_id = interno.current_tenant()))))) OR (EXISTS ( SELECT 1
   FROM clientes f
  WHERE ((f.id = personas_autorizadas.cliente_id) AND (f.prestadora_id = interno.current_tenant()) AND (EXISTS ( SELECT 1
           FROM usuarios u
          WHERE ((u.id = auth.uid()) AND (u.rol = 'admin_prestadora'::text)))))))));
create policy coordinador_gestiona_personas_autorizadas on public.personas_autorizadas as permissive for all to public
  using (((EXISTS ( SELECT 1
   FROM clientes f
  WHERE ((f.id = personas_autorizadas.cliente_id) AND (f.prestadora_id = interno.current_tenant()) AND (EXISTS ( SELECT 1
           FROM usuarios u
          WHERE ((u.id = auth.uid()) AND (u.rol = 'coordinador'::text))))))) AND interno.tiene_permiso('editar_datos_cliente'::text)));
create policy trabajo_sin_persona_de_esta_prestadora on public.personas_autorizadas as permissive for select to trabajo_sin_persona
  using ((cliente_id IN ( SELECT f.id
   FROM clientes f
  WHERE (f.prestadora_id = interno.current_tenant()))));
create policy cliente_lee_autorizaciones_de_sus_pacientes on public.autorizaciones_monitoreo_paciente as permissive for select to authenticated
  using (((prestadora_id = interno.current_tenant()) AND (paciente_id IN ( SELECT interno.pacientes_del_cliente() AS pacientes_del_cliente))));
create policy cliente_carga_indicaciones_de_sus_pacientes on public.indicaciones_medicacion as permissive for insert to public
  with check (((prestadora_id = interno.current_tenant()) AND (paciente_id IN ( SELECT interno.pacientes_del_cliente() AS pacientes_del_cliente)) AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_pide_medicacion'::text)));
create policy cliente_lee_indicaciones_de_sus_pacientes on public.indicaciones_medicacion as permissive for select to public
  using (((prestadora_id = interno.current_tenant()) AND (paciente_id IN ( SELECT interno.pacientes_del_cliente() AS pacientes_del_cliente)) AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_medicacion'::text)));
create policy cliente_genera_su_qr_cobro on public.qr_cobro_efectivo as permissive for insert to public
  with check (((cliente_id = interno.cliente_id_de_usuario(auth.uid())) AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_dinero'::text) AND (EXISTS ( SELECT 1
   FROM accesos_match s
  WHERE ((s.id = qr_cobro_efectivo.acceso_id) AND (s.cliente_id = interno.cliente_id_de_usuario(auth.uid())))))));
create policy cliente_ve_su_qr_cobro on public.qr_cobro_efectivo as permissive for select to public
  using (((cliente_id = interno.cliente_id_de_usuario(auth.uid())) AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_dinero'::text)));
create policy prestadora_ve_qr_cobro on public.qr_cobro_efectivo as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM accesos_match s
  WHERE ((s.id = qr_cobro_efectivo.acceso_id) AND (s.prestadora_id = interno.current_tenant()) AND (EXISTS ( SELECT 1
           FROM usuarios u
          WHERE ((u.id = auth.uid()) AND (u.rol = ANY (ARRAY['admin_prestadora'::text, 'coordinador'::text])))))))));
create policy cliente_gestiona_sus_calificaciones on public.calificaciones_asistente as permissive for all to public
  using (((cliente_id = interno.cliente_id_de_usuario(auth.uid())) OR (EXISTS ( SELECT 1
   FROM pacientes p
  WHERE ((p.id = calificaciones_asistente.paciente_id) AND (p.cliente_id = interno.cliente_id_de_usuario(auth.uid())))))))
  with check (((cliente_id = interno.cliente_id_de_usuario(auth.uid())) AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_califica_al_asistente'::text)));
create policy cliente_ve_sus_cobros on public.cobros_cliente as permissive for select to public
  using (((EXISTS ( SELECT 1
   FROM facturas_cliente f
  WHERE ((f.id = cobros_cliente.factura_id) AND (f.cliente_id = interno.cliente_id_de_usuario(auth.uid()))))) AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_dinero'::text)));
create policy panel_gestiona_cobros_cliente on public.cobros_cliente as permissive for all to public
  using (((prestadora_id = interno.current_tenant()) AND interno.gestiona_la_facturacion()))
  with check (((prestadora_id = interno.current_tenant()) AND interno.gestiona_la_facturacion()));
create policy asistente_o_cliente_lee_config_matricula_via on public.configuracion_matricula_via_medicacion as permissive for select to authenticated
  using (((prestadora_id = interno.current_tenant()) AND (interno.es_asistente() OR interno.es_cliente())));
create policy cliente_ve_el_contenido_publicado on public.contenidos_para_clientes as permissive for select to public
  using ((publicado AND (prestadora_id = ( SELECT f.prestadora_id
   FROM clientes f
  WHERE (f.id = interno.cliente_id_de_usuario(auth.uid()))))));
create policy persona_agrega_su_llave on public.llaves_de_dispositivo as permissive for insert to authenticated
  with check (((prestadora_id = interno.current_tenant()) AND (usuario_id = auth.uid()) AND (revocada_en IS NULL) AND (((rol = 'asistente'::text) AND interno.es_asistente()) OR ((rol = 'cliente'::text) AND interno.es_cliente()))));
create policy persona_pide_desafio_de_alta on public.desafios_de_llave as permissive for insert to authenticated
  with check (((prestadora_id = interno.current_tenant()) AND (usuario_id = auth.uid()) AND (para = 'alta'::text) AND (usado_en IS NULL) AND (((rol = 'asistente'::text) AND interno.es_asistente()) OR ((rol = 'cliente'::text) AND interno.es_cliente()))));
create policy cliente_ve_guardias_de_sus_pacientes on public.guardias as permissive for select to public
  using (((prestadora_id = interno.current_tenant()) AND (EXISTS ( SELECT 1
   FROM pacientes p
  WHERE ((p.id IN ( SELECT interno.pacientes_de_la_guardia(guardias.id) AS pacientes_de_la_guardia)) AND (p.cliente_id = interno.cliente_id_de_usuario(auth.uid()))))) AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_guardias'::text)));
create policy cliente_ve_sus_correcciones on public.correcciones_factura_cliente as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM facturas_cliente f
  WHERE ((f.id = correcciones_factura_cliente.factura_id) AND (f.cliente_id = interno.cliente_id_de_usuario(auth.uid()))))));
create policy panel_lee_correcciones_factura_cliente on public.correcciones_factura_cliente as permissive for select to public
  using ((prestadora_id = interno.current_tenant()));
create policy configuracion_facturacion_clientes_la_escribe_la_administracion on public.configuracion_facturacion_clientes as permissive for all to authenticated
  using (interno.es_la_administracion_de_la_prestadora(prestadora_id))
  with check (interno.es_la_administracion_de_la_prestadora(prestadora_id));
create policy configuracion_facturacion_clientes_la_lee_la_administracion on public.configuracion_facturacion_clientes as permissive for select to authenticated
  using (interno.es_la_administracion_de_la_prestadora(prestadora_id));
create policy panel_lee_estados_de_cuenta_externos on public.estados_de_cuenta_externos as permissive for select to public
  using (((prestadora_id = interno.current_tenant()) AND interno.tiene_permiso('ver_estado_de_cuenta_cliente'::text)));
create policy cliente_ve_sus_pacientes on public.pacientes as permissive for select to public
  using (((prestadora_id = interno.current_tenant()) AND (cliente_id = interno.cliente_id_de_usuario(auth.uid()))));
create policy asistente_o_cliente_lee_su_prestadora on public.prestadoras as permissive for select to authenticated
  using (((id = interno.current_tenant()) AND (interno.es_asistente() OR interno.es_cliente())));
create policy panel_gestiona_instrucciones_acceso_personas_autorizadas on public.instrucciones_acceso_personas_autorizadas as permissive for all to public
  using (((prestadora_id = interno.current_tenant()) AND interno.puede_configurar_accesos_de_personas_autorizadas()))
  with check (((prestadora_id = interno.current_tenant()) AND interno.puede_configurar_accesos_de_personas_autorizadas()));
create policy titular_lee_sus_instrucciones_acceso_personas_autorizadas on public.instrucciones_acceso_personas_autorizadas as permissive for select to public
  using ((cliente_id = interno.cliente_id_de_usuario(auth.uid())));
create policy admin_prestadora_gestiona_cobro_match on public.configuracion_cobro_match as permissive for all to authenticated
  using (((prestadora_id = interno.current_tenant()) AND (interno.es_superadmin() OR (EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = auth.uid()) AND (u.rol = 'admin_prestadora'::text)))))))
  with check (((prestadora_id = interno.current_tenant()) AND (interno.es_superadmin() OR (EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = auth.uid()) AND (u.rol = 'admin_prestadora'::text)))))));
create policy coordinador_lee_cobro_match on public.configuracion_cobro_match as permissive for select to authenticated
  using (((prestadora_id = interno.current_tenant()) AND (EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = auth.uid()) AND (u.rol = 'coordinador'::text))))));
create policy cliente_ve_reportes_de_sus_pacientes on public.reportes as permissive for select to public
  using (((EXISTS ( SELECT 1
   FROM pacientes p
  WHERE ((p.id = reportes.paciente_id) AND (p.cliente_id = interno.cliente_id_de_usuario(auth.uid()))))) AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_reportes'::text)));
create policy cliente_ve_los_cobros_de_su_acceso on public.cobros_match as permissive for select to public
  using (((EXISTS ( SELECT 1
   FROM accesos_match s
  WHERE ((s.id = cobros_match.acceso_id) AND (s.cliente_id = interno.cliente_id_de_usuario(auth.uid()))))) AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_dinero'::text)));
create policy prestadora_ve_cobros_match on public.cobros_match as permissive for select to public
  using (((prestadora_id = interno.current_tenant()) AND (EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = auth.uid()) AND (u.rol = ANY (ARRAY['admin_prestadora'::text, 'coordinador'::text])))))));
create policy cliente_ve_las_formas_ofrecidas on public.formas_de_cobro_match as permissive for select to public
  using ((ofrecida AND (prestadora_id = ( SELECT f.prestadora_id
   FROM clientes f
  WHERE (f.id = interno.cliente_id_de_usuario(auth.uid()))))));
create policy el_hilo_propio_se_lee on public.conversaciones_match as permissive for select to authenticated
  using (interno.conversacion_match_es_propia(id));
create policy los_mensajes_del_hilo_propio_se_leen on public.mensajes_match as permissive for select to authenticated
  using (interno.conversacion_match_es_propia(conversacion_id));
create policy panel_lee_catalogo_funciones_match on public.catalogo_funciones_match as permissive for select to authenticated
  using ((interno.es_superadmin() OR (EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = auth.uid()) AND (u.rol = ANY (ARRAY['admin_prestadora'::text, 'coordinador'::text])))))));
create policy superadmin_gestiona_catalogo_funciones_match on public.catalogo_funciones_match as permissive for all to public
  using (interno.es_superadmin());
create policy admin_prestadora_gestiona_funciones_match on public.configuracion_funciones_match as permissive for all to authenticated
  using (((prestadora_id = interno.current_tenant()) AND (interno.es_superadmin() OR (EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = auth.uid()) AND (u.rol = 'admin_prestadora'::text)))))))
  with check (((prestadora_id = interno.current_tenant()) AND (interno.es_superadmin() OR (EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = auth.uid()) AND (u.rol = 'admin_prestadora'::text)))))));
create policy coordinador_lee_funciones_match on public.configuracion_funciones_match as permissive for select to authenticated
  using (((prestadora_id = interno.current_tenant()) AND (EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = auth.uid()) AND (u.rol = 'coordinador'::text))))));
create policy asistente_o_cliente_lee_visibilidad_app on public.configuracion_visibilidad_app as permissive for select to authenticated
  using (((prestadora_id = interno.current_tenant()) AND (interno.es_asistente() OR interno.es_cliente())));
create policy el_comprobante_lo_gestiona_quien_administra on storage.objects as permissive for all to authenticated
  using (((bucket_id = 'comprobantes-cliente'::text) AND ((storage.foldername(name))[1] = (interno.current_tenant())::text) AND (interno.es_admin_prestadora() OR interno.es_superadmin())))
  with check (((bucket_id = 'comprobantes-cliente'::text) AND ((storage.foldername(name))[1] = (interno.current_tenant())::text) AND (interno.es_admin_prestadora() OR interno.es_superadmin())));
create policy instrucciones_personas_autorizadas_panel_lee on storage.objects as permissive for select to public
  using (((bucket_id = 'instrucciones-acceso-personas-autorizadas'::text) AND ((storage.foldername(name))[1] = (interno.current_tenant())::text) AND interno.puede_configurar_accesos_de_personas_autorizadas()));
create policy instrucciones_personas_autorizadas_panel_sube on storage.objects as permissive for insert to public
  with check (((bucket_id = 'instrucciones-acceso-personas-autorizadas'::text) AND ((storage.foldername(name))[1] = (interno.current_tenant())::text) AND interno.puede_configurar_accesos_de_personas_autorizadas()));
create policy instrucciones_personas_autorizadas_titular_lee on storage.objects as permissive for select to authenticated
  using (((bucket_id = 'instrucciones-acceso-personas-autorizadas'::text) AND ((storage.foldername(name))[1] = (interno.current_tenant())::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)));
create policy prescripciones_cliente_lee_la_de_su_paciente on storage.objects as permissive for select to authenticated
  using (((bucket_id = 'prescripciones-medicacion'::text) AND ((storage.foldername(name))[1] = (interno.current_tenant())::text) AND ((storage.foldername(name))[2] IN ( SELECT (interno.pacientes_del_cliente())::text AS pacientes_del_cliente))));
create policy prescripciones_cliente_sube_la_de_su_paciente on storage.objects as permissive for insert to authenticated
  with check (((bucket_id = 'prescripciones-medicacion'::text) AND ((storage.foldername(name))[1] = (interno.current_tenant())::text) AND ((storage.foldername(name))[2] IN ( SELECT (interno.pacientes_del_cliente())::text AS pacientes_del_cliente))));
create policy reportes_cliente_lee_fotos_de_sus_pacientes on storage.objects as permissive for select to authenticated
  using (((bucket_id = 'reportes-fotos'::text) AND ((storage.foldername(name))[1] = (interno.current_tenant())::text) AND (EXISTS ( SELECT 1
   FROM guardia_pacientes gp
  WHERE ((gp.paciente_id IN ( SELECT interno.pacientes_del_cliente() AS pacientes_del_cliente)) AND ((storage.foldername(objects.name))[2] = (gp.guardia_id)::text))))));
create policy trabajo_sin_persona_de_esta_prestadora on storage.objects as permissive for all to trabajo_sin_persona
  using (((bucket_id = 'comprobantes-cliente'::text) AND ((storage.foldername(name))[1] = (interno.current_tenant())::text)))
  with check (((bucket_id = 'comprobantes-cliente'::text) AND ((storage.foldername(name))[1] = (interno.current_tenant())::text)));

-- Los depósitos viejos, vacíos, se borran
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.buckets where id = 'instrucciones-acceso-personas autorizadas';
delete from storage.buckets where id = 'comprobantes-cliente';

-- 8. Comentarios
comment on column public.asistentes.canales is $r$En qué modalidades de trabajo está este Asistente: directa, match, o las dos. Nunca subcontratacion: esa gente no es nuestra. Tiene que estar dentro de lo que la Prestadora tenga habilitado. El nombre de la columna quedó de antes y no se renombra (regla 13); la palabra del producto es modalidad de trabajo.$r$;
comment on column public.asistentes.domicilio is $r$Dónde vive el Asistente, escrito para que lo lea una persona. Dato sensible: no sale en URLs, ni en registros, ni al Cliente (CLAUDE.md §6).$r$;
comment on column public.clientes.dias_hasta_el_vencimiento is $r$Cuantos dias tiene este Cliente para pagar, desde que se emite la factura. Vacio hereda el plazo de la Prestadora.$r$;
comment on column public.clientes.financiador_tipo is $r$A quien se le reclama lo que se le factura a este Cliente: cliente, obra_social u otro. Vacio quiere decir que se le reclama al Cliente, que es lo corriente. Cada factura se lleva este dato copiado el dia que se genera.$r$;
comment on column public.clientes.pagador_legajo_id is $r$Cuál Legajo paga lo que se le factura a este Cliente. Vacío quiere decir que paga el Cliente por sí mismo. Cuando el contrato lo dice, la responsabilidad legal y comercial también es suya.$r$;
comment on column public.clientes.usuario_id is $r$De qué cuenta cuelga esta ficha. Es la cuenta del titular; las demás personas autorizadas cuelgan de `personas_autorizadas`.$r$;
comment on column public.clientes.numero_cliente is $r$Unico adentro de la Prestadora. Lo asigna el disparador, no se elige y no se reasigna nunca. Es lo que usan el sistema y los documentos; el nombre visible del Cliente se calcula aparte y es para la pantalla.$r$;
comment on column public.prestadoras.logo_url is $r$Dirección del logo de la Prestadora, la marca que ven el Cliente y el Asistente. Vacío significa que todavía no lo subió: en ese caso las pantallas muestran nombre_fantasia escrito. Los archivos viven en el depósito marca-prestadoras, en la carpeta de esa Prestadora.$r$;
comment on column public.configuracion_ausencia_automatica.segundos_codigo_en_pantalla is $r$Cada cuántos segundos se renueva el código que el Cliente —o el Asistente que se va— muestra en la pantalla de su teléfono para que lo lea el Asistente que llega. Decisión de cada Prestadora.$r$;
comment on column public.facturas_cliente.financiador_tipo is $r$A quien se le reclama esta factura: cliente, obra_social u otro. Vacio quiere decir que se le reclama al Cliente, que es lo corriente.$r$;
comment on column public.facturas_cliente.financiador_nombre is $r$Como se llama quien paga, cuando no es el Cliente. Texto, porque el padron de obras sociales cambia de pais en pais.$r$;
comment on column public.configuracion_alertas_ia.roja_avisa_cliente is $r$Si una alerta roja —lo urgente— también le llega al Cliente del Paciente. De fábrica, sí. Al Coordinador le llega siempre, eso no se configura.$r$;
comment on column public.configuracion_alertas_ia.amarilla_avisa_cliente is $r$Si una alerta amarilla —lo que conviene mirar, sin urgencia— también le llega al Cliente. De fábrica, no: la amarilla es material de trabajo de la Prestadora, no una noticia para dar.$r$;
comment on column public.servicios.tipo_contratante is $r$De qué clase es el Cliente que contrató este Servicio. Hoy el único que resuelve es «cliente»; el disparador exigir_contratante_del_servicio rechaza cualquier otro.$r$;
comment on table public.accesos_match is $r$El acceso a los datos de contacto que un Cliente tiene habilitado, y bajo qué forma de cobro. Termina por una fecha o por un saldo, los dos guardados. docs/PRD_07_Modalidad_Match.md §3.$r$;
comment on column public.accesos_match.aviso_previo_en is $r$Cuándo se le avisó al Cliente que el período gratuito estaba por terminar y que venía el primer cobro. Nulo mientras no se avisó. Lo escribe el motor una sola vez por acceso.$r$;
comment on column public.cobros_match.url_accion is $r$Dirección del QR con el que el Cliente paga este período, en los rieles que la devuelven.$r$;
comment on column public.cobros_match.codigo_cupon is $r$Código del cupón con el que el Cliente paga este período, en los rieles de cobranza en efectivo.$r$;
comment on table public.tareas_tipo_asistente is $r$Qué HACE y qué NO HACE cada tipo de Asistente. Dos listas separadas a propósito: la segunda es la que evita la confusión con los Clientes.$r$;
comment on column public.tareas_tipo_asistente.clase is $r$corresponde = le toca hacerlo. no_corresponde = no le toca, y conviene que el Cliente lo sepa antes de pedirlo.$r$;
comment on table public.configuracion_visibilidad_app is $r$Qué muestran las aplicaciones del Cliente y del Asistente en cada Prestadora. Solo guarda lo que se cambió respecto del valor de fábrica; la lista de claves posibles vive en backend/src/utils/catalogoVisibilidad.js.$r$;
comment on column public.liquidaciones_asistente.forma_pago is $r$Con que medio se le pago al Asistente. Es una opcion de la lista «medios_de_pago_al_asistente», que es otra que la del cobro del Cliente porque no son los mismos medios.$r$;
comment on table public.cobros_cliente is $r$Cada entrada de plata contra una factura de un Cliente. Varias filas por factura: así se representa el cobro parcial. No es un comprobante fiscal.$r$;
comment on column public.cobros_cliente.medio is $r$Con que medio pago el Cliente. Es una opcion de la lista «medios_de_pago_del_cliente»: las que trae el producto y las que agrego esta Prestadora.$r$;
comment on column public.codigos_de_presencia.sujeto_tipo is $r$Quién muestra el código: cliente (cualquiera de las personas autorizadas) o asistente (el que se va, cuando hay relevo). El Paciente no tiene cuenta en el producto y por eso no figura acá.$r$;
comment on column public.guardia_comprobaciones.medio is $r$Con qué se comprobó: el código del Cliente, el del Asistente que se iba, o el que soltó la Prestadora. Es lo que decide si al Cliente se le avisa: se le avisa cuando él no participó de la comprobación.$r$;
comment on table public.catalogo_funciones_match is $r$Las funciones de la modalidad Match que tienen riesgo legal conocido. Es el catálogo de la plataforma: qué se puede encender. Si esa función tiene advertencia escrita para la jurisdicción de la Prestadora, encenderla la muestra y la deja auditada.$r$;
comment on table public.configuracion_funciones_match is $r$Qué funciones de riesgo legal de Match tiene encendidas cada Prestadora. Sin fila, apagada. Nada acá bloquea nada: encender muestra el aviso de la jurisdicción, si lo hay, y lo deja auditado.$r$;
comment on table public.formas_de_cobro_match is $r$Cómo cobra cada Prestadora el acceso a los datos de contacto. Las piezas, no los tipos: la forma sale de cómo se combinen. docs/PRD_07_Modalidad_Match.md §3.$r$;
comment on table public.contactos_vistos_match is $r$Qué Asistentes tiene ya abiertos un Cliente, y con qué acceso los pagó. Es lo que hace que el saldo del paquete se descuente de a un Asistente y no de a una mirada. docs/PRD_07_Modalidad_Match.md §3.3.$r$;
comment on table public.conversaciones_match is $r$El hilo entre un Cliente y un Asistente de Match, antes de contratarlo. Una por pareja. El chat es libre; lo que se cobra es el dato de contacto, que viaja tapado hasta que ese contacto se abre.$r$;
comment on table public.mensajes_match is $r$Los mensajes de un hilo de Match. Se guardan ya tapados: lo que no puede viajar en un mensaje no queda escrito en ningun lado, asi que llegar al dato por otra via no lo muestra.$r$;
comment on table public.contenidos_para_clientes is $r$La biblioteca que cada Prestadora escribe para los Clientes de su Organización: contenido y recursos para quien cuida en su casa. Sin siembra de fábrica y sin traducción: lo escribe la Prestadora.$r$;
comment on column public.contenidos_para_clientes.publicado is $r$Si el Cliente lo ve. Lo mueve la Prestadora; sin publicar, la pieza existe solamente para ella.$r$;
comment on column public.llaves_de_dispositivo.rol is $r$En cual de las dos aplicaciones nacio la llave. Una llave del Asistente no sirve para entrar a la del Cliente: son dos aplicaciones con permisos distintos.$r$;
comment on table public.consentimientos_paciente_solo is $r$El Cliente supo y acepto que la persona atendida quedara sola durante un rato de este turno. Registra una conversacion que ya ocurrio; no cubre el turno ni lo cierra.$r$;
comment on column public.consentimientos_paciente_solo.quien_consintio is $r$Nombre de la persona del Cliente con la que se hablo. La cuenta es de todas; quien dijo que si es una.$r$;
comment on table public.configuracion_facturacion_clientes is $r$Como factura y como cobra esta Prestadora lo que no depende de un Cliente sola: el plazo de pago acordado y si el seguimiento de la cobranza es suyo o de otro software. Solo lo que corrio respecto de fabrica; los bordes viven en panel/src/lib/facturacionDeClientes.js.$r$;
comment on view public.saldos_cliente is $r$El saldo de cada factura de Cliente: lo que se le reclama menos lo cobrado, con el estado calculado, a quien se le reclama, de que origenes salio el dato y cuando se actualizo. Unico punto de verdad de esa resta.$r$;
comment on table public.restricciones_de_cobranza is $r$Los avisos de que a un Cliente hay que ponerle alguna restriccion por falta de pago. Informacion, no decision: nada se corta ni se bloquea por esto.$r$;
comment on column public.restricciones_de_cobranza.restringida is $r$Verdadero abre la restriccion y falso la levanta. El estado de hoy es el aviso mas nuevo de ese Cliente.$r$;
comment on table public.estados_de_cuenta_externos is $r$Lo que el software de creditos y cobranzas de la Prestadora informo sobre la cuenta de un Cliente. Informacion, no decision: nada se corta ni se bloquea por esto, y este sistema no lo recalcula.$r$;
comment on column public.estados_de_cuenta_externos.saldo is $r$Cuanto debe ese Cliente segun quien lleva la cobranza. Negativo es saldo a favor. No se calcula aca: se guarda tal como llego.$r$;
comment on column public.estados_de_cuenta_externos.atrasado is $r$Si quien lleva la cobranza considera que ese Cliente esta atrasado. Lo decide el, no este sistema.$r$;
comment on view public.estado_de_cuenta_externo_vigente is $r$El ultimo estado de cuenta informado de cada Cliente, que es el que rige. Los anteriores quedan guardados en estados_de_cuenta_externos.$r$;
comment on table public.documentos_pagador is $r$Los papeles que el financiador exigio para esta contratacion, cargados. Uno por Cliente y por tipo.$r$;
comment on table public.configuracion_cobro_match is $r$Los plazos comerciales del cobro de Match, elegidos por cada Prestadora. Una fila por Prestadora, sembrada al darla de alta.$r$;
comment on constraint conversaciones_match_cliente_prestadora_fk on public.conversaciones_match is $r$El Cliente del hilo es de la misma Prestadora que el hilo. Con las dos columnas, un hilo entre dos Prestadoras no se puede guardar.$r$;

commit;

notify pgrst, 'reload schema';
