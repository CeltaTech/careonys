# Frases para aprobar

Relevamiento de los textos en es-AR que tienen una construcción dubitativa o que hablan de «invitación», para que el Desarrollador decida la redacción de cada uno.

**Total: 121 fichas** — Panel 73, aplicación del Asistente 27, aplicación del Cliente 19, base 2.

## Panel (73)

### 1. `errores.sesion_vencida` — `panel/src/i18n/translations.js:23`

> Pasó demasiado tiempo sin actividad. Hace falta volver a entrar.

- **Dónde se ve:** panel/src/lib/errores.js (mensajeDeError), en cualquier pantalla del Panel que muestre un error
- **Qué lo dispara:** Una respuesta 401, o los códigos PGRST301 a PGRST303, o «JWT expired»: la sesión venció
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 2. `errores.dato_invalido` — `panel/src/i18n/translations.js:28`

> Hay un dato mal cargado. Conviene revisar lo que se escribió.

- **Dónde se ve:** panel/src/lib/errores.js (mensajeDeError), en cualquier pantalla del Panel que muestre un error
- **Qué lo dispara:** Una respuesta 400 o 422, o los códigos de Postgres 23502, 23514, 22P02, 22001, 22007 o P0001, cuando el Backend no manda un motivo propio
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 3. `errores.motivos.correo_de_esta_prestadora` — `panel/src/i18n/translations.js:38`

> Ese correo ya tiene una cuenta en esta Prestadora. Conviene buscarla en la lista antes de crear una nueva.

- **Dónde se ve:** Alta de una cuenta del Panel (backend/src/utils/cuentasPanel.js:95)
- **Qué lo dispara:** Al crear una cuenta con un correo que ya tiene cuenta en esa Prestadora
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 4. `errores.motivos.correo_de_otra_cuenta` — `panel/src/i18n/translations.js:39`

> Ese correo ya está en uso. Hace falta indicar otro.

- **Dónde se ve:** No se ve en ninguna pantalla
- **Qué lo dispara:** Ningún código del Backend lo emite: sólo figura en la tabla de estados de backend/src/utils/errorConMotivo.js:35; sólo aparece además en pruebas
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 5. `errores.motivos.nombre_de_prestadora_repetido` — `panel/src/i18n/translations.js:57`

> Ya hay una Prestadora con ese nombre. Hace falta usar otro: de ese nombre sale la dirección desde la que manda sus mensajes.

- **Dónde se ve:** No se ve en ninguna pantalla
- **Qué lo dispara:** Ningún código del Backend lo emite: sólo figura en la tabla de estados de backend/src/utils/errorConMotivo.js:145-150 (alta de una Prestadora)
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 6. `errores.motivos.pais_sin_moneda` — `panel/src/i18n/translations.js:58`

> Todavía no está cargado en qué moneda trabaja ese país, así que no se puede dar de alta una Prestadora ahí. Hace falta agregarlo antes.

- **Dónde se ve:** No se ve en ninguna pantalla
- **Qué lo dispara:** Ningún código del Backend lo emite: sólo figura en la tabla de estados de backend/src/utils/errorConMotivo.js:145-150 (alta de una Prestadora)
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 7. `errores.motivos.direccion_de_prestadora_no_disponible` — `panel/src/i18n/translations.js:59`

> No se pudo darle una dirección propia de ingreso a esa Prestadora. Hace falta usar otro nombre.

- **Dónde se ve:** No se ve en ninguna pantalla
- **Qué lo dispara:** Ningún código del Backend lo emite: sólo figura en la tabla de estados de backend/src/utils/errorConMotivo.js:145-150 (alta de una Prestadora)
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 8. `errores.motivos.moneda_desconocida` — `panel/src/i18n/translations.js:60`

> Esa moneda no está entre las que se pueden elegir. Conviene recargar la pantalla y elegir una de la lista.

- **Dónde se ve:** panel/src/pages/configuracion/LaMoneda.jsx:63
- **Qué lo dispara:** Guardar una moneda que no está en el catálogo (PATCH /configuracion/moneda, backend/src/routes/panelConfiguracion.js:217)
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 9. `errores.motivos.software_desconocido` — `panel/src/i18n/translations.js:61`

> Ese software no está entre los que se pueden elegir. Conviene recargar la pantalla y elegir uno de la lista.

- **Dónde se ve:** panel/src/pages/configuracion/ElSoftwareDeAfuera.jsx:81
- **Qué lo dispara:** Guardar un software externo que no está en el catálogo (PUT /configuracion/software-externo/:clase, panelConfiguracion.js:1404)
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 10. `errores.motivos.domicilio_temporal_pisado` — `panel/src/i18n/translations.js:68`

> Ya hay un domicilio temporal cargado para este Paciente en esas fechas. Un Paciente no puede estar en dos lugares el mismo día: conviene revisar el período ya cargado antes de agregar otro.

- **Dónde se ve:** panel/src/pages/clientes/DomiciliosTemporalesPaciente.jsx:56 (traducido en panel/src/lib/domiciliosTemporales.js:19)
- **Qué lo dispara:** La base rechaza un domicilio temporal que se superpone en fechas con otro del mismo Paciente
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 11. `errores.motivos.ya_resuelta` — `panel/src/i18n/translations.js:73`

> Ese pedido ya lo resolvió otra persona. Conviene recargar la lista para ver cómo quedó.

- **Dónde se ve:** panel/src/pages/EmergenciasEnGuardia.jsx:171 y panel/src/pages/PaseDeGuardia.jsx:134
- **Qué lo dispara:** Atender una emergencia que otra persona ya atendió (backend/src/routes/panelEmergencias.js:166), o emitir un código de llegada para un pedido ya resuelto (backend/src/utils/comprobacionDePresencia.js:441)
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 12. `errores.motivos.ya_cerrada` — `panel/src/i18n/translations.js:74`

> Esa llegada ya está cerrada. Conviene recargar la lista.

- **Dónde se ve:** panel/src/pages/PaseDeGuardia.jsx:63 y panel/src/pages/clientes/AccesosDePersonasAutorizadasModal.jsx:102 y :239
- **Qué lo dispara:** Cerrar una llegada sin comprobar que ya estaba cerrada (comprobacionDePresencia.js:512). El mismo motivo lo emite backend/src/utils/instruccionesPersonasAutorizadas.js:363 para una instrucción ya cerrada, y ahí el texto habla de una «llegada»
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 13. `errores.motivos.medio_de_pago_fuera_de_la_modalidad` — `panel/src/i18n/translations.js:78`

> Ese medio de pago no se usa en la modalidad de trabajo que paga esta liquidación. Hace falta elegir otro de la lista.

- **Dónde se ve:** panel/src/pages/PagosAsistentes.jsx:417
- **Qué lo dispara:** Pagar una liquidación con un medio de pago que esa modalidad no usa (POST /liquidaciones/:id/pagar, backend/src/routes/panelLiquidaciones.js:690)
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 14. `errores.motivos.persona_no_autorizada` — `panel/src/i18n/translations.js:80`

> Esa persona no figura entre las personas autorizadas de este Cliente, así que no hay nada que quitar. Conviene recargar la lista para ver cómo quedó.

- **Dónde se ve:** No se ve en ninguna pantalla
- **Qué lo dispara:** Ningún código del Backend lo emite
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 15. `errores.motivos.paciente_no_encontrado` — `panel/src/i18n/translations.js:81`

> No se encontró ese Paciente. Conviene recargar la lista.

- **Dónde se ve:** panel/src/lib/avisarCambioDeAsistente.js:18 y panel/src/pages/InformesObraSocial.jsx
- **Qué lo dispara:** El Paciente pedido no existe: aviso de cambio de Asistente (backend/src/routes/panelGuardias.js:196) o vista previa y generación de un informe para la obra social (backend/src/routes/panelInformesObraSocial.js:75)
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 16. `errores.motivos.acceso_inexistente` — `panel/src/i18n/translations.js:85`

> No se encontró ese acceso. Conviene recargar la lista.

- **Dónde se ve:** panel/src/pages/intermediacion/Clientes.jsx:109
- **Qué lo dispara:** Dar de alta en la pasarela de cobro un acceso que no existe (POST /intermediacion/accesos/:id/alta-en-pasarela, backend/src/utils/altaEnPasarela.js)
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 17. `errores.motivos.varias_pasarelas_conectadas` — `panel/src/i18n/translations.js:88`

> Esta Prestadora tiene más de una pasarela de cobro conectada. Hace falta elegir con cuál se va a cobrar este acceso.

- **Dónde se ve:** panel/src/pages/intermediacion/Clientes.jsx:109
- **Qué lo dispara:** Dar de alta un acceso en la pasarela cuando la Prestadora tiene más de una conectada (backend/src/utils/altaEnPasarela.js)
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 18. `errores.motivos.proveedor_desconocido` — `panel/src/i18n/translations.js:90`

> Esa pasarela de cobro no está disponible. Conviene recargar la pantalla y elegir una de la lista.

- **Dónde se ve:** panel/src/pages/intermediacion/Clientes.jsx:109
- **Qué lo dispara:** Dar de alta un acceso con una pasarela que no está en el catálogo (backend/src/utils/altaEnPasarela.js y bajaDelAcceso.js)
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 19. `errores.motivos.nombre_de_forma_repetido` — `panel/src/i18n/translations.js:98`

> Ya hay otra forma de cobro con ese nombre. Conviene ponerle uno que se distinga.

- **Dónde se ve:** panel/src/pages/intermediacion/FormaDeCobroDetalle.jsx:58
- **Qué lo dispara:** Guardar una forma de cobro con un nombre ya usado (POST/PATCH /intermediacion/formas-de-cobro)
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 20. `errores.motivos.unidad_de_periodo_desconocida` — `panel/src/i18n/translations.js:102`

> Esa unidad de tiempo no está disponible. Conviene recargar la pantalla y elegir una de la lista.

- **Dónde se ve:** panel/src/pages/intermediacion/FormaDeCobroDetalle.jsx:58
- **Qué lo dispara:** Guardar una forma de cobro con una unidad de período fuera del catálogo
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 21. `errores.motivos.renovacion_sin_periodo` — `panel/src/i18n/translations.js:105`

> Una forma que se cobra una sola vez no se puede renovar sola. Hace falta cargarle un período, o dejarla sin renovación.

- **Dónde se ve:** panel/src/pages/intermediacion/FormaDeCobroDetalle.jsx:58
- **Qué lo dispara:** Guardar una forma de cobro de pago único marcada para renovarse sola
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 22. `errores.motivos.plantilla_ya_enviada` — `panel/src/i18n/translations.js:109`

> Esa plantilla ya salió hacia Meta, así que no se manda de nuevo. Conviene recargar la lista para ver cómo quedó.

- **Dónde se ve:** panel/src/pages/configuracion/Avisos.jsx:1065
- **Qué lo dispara:** Mandar a Meta una plantilla de WhatsApp que ya se mandó (POST /configuracion/whatsapp/plantillas/:id/enviar-a-meta)
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 23. `errores.motivos.titulo_de_contenido_repetido` — `panel/src/i18n/translations.js:117`

> Ya hay otra pieza de contenido con ese título. Conviene ponerle uno que se distinga.

- **Dónde se ve:** panel/src/pages/contenidos/ContenidoDetalle.jsx:124 (guardar)
- **Qué lo dispara:** Guardar una pieza de contenido con un título ya usado (backend/src/routes/panelContenidos.js:124)
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 24. `errores.motivos.cese_no_encontrado` — `panel/src/i18n/translations.js:124`

> No se encontró ese cese. Conviene recargar la lista.

- **Dónde se ve:** panel/src/lib/documentosGuardados.js:39 y :44
- **Qué lo dispara:** Subir o abrir el documento de un cese que no existe (POST /ceses/:id/documento, GET /ceses/:id/documento-url)
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 25. `errores.motivos.fecha_invalida` — `panel/src/i18n/translations.js:128`

> Esa fecha no se entiende. Conviene elegir el día y la hora de nuevo.

- **Dónde se ve:** panel/src/components/EntrevistaDePostulacion.jsx:32
- **Qué lo dispara:** Agendar o mover una entrevista con una fecha que no se puede leer (backend/src/utils/entrevistaDePostulacion.js)
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 26. `errores.motivos.entrevista_ya_cerrada` — `panel/src/i18n/translations.js:131`

> Esa entrevista ya está cerrada. Conviene recargar para ver cómo quedó.

- **Dónde se ve:** panel/src/components/EntrevistaDePostulacion.jsx:32
- **Qué lo dispara:** Operar sobre una entrevista que ya está cerrada (backend/src/utils/entrevistaDePostulacion.js)
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 27. `errores.motivos.ya_cerrado` — `panel/src/i18n/translations.js:135`

> Ese consentimiento ya no está esperando firma. Conviene recargar para ver cómo quedó.

- **Dónde se ve:** panel/src/pages/Medicacion.jsx:100 y panel/src/pages/clientes/EstadoDelPagador.jsx:76 y :373
- **Qué lo dispara:** Operar sobre un consentimiento que ya no espera firma: subir el papel firmado de una medicación (POST /medicacion/:id/papel-firmado, backend/src/routes/panelMedicacion.js:276 y :298) o consentimiento del Pagador (backend/src/utils/consentimientoPagador.js:190 y :220)
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 28. `comun.reenviar_invitacion` — `panel/src/i18n/translations.js:198`

> Reenviar invitación

- **Dónde se ve:** Botón en panel/src/pages/asistentes/PerfilTab.jsx:760 y panel/src/pages/clientes/ClienteDetalle.jsx:287 y :526
- **Qué lo dispara:** Se ve en la ficha de un Asistente o de un Cliente cuya cuenta todavía no se activó
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 29. `comun.invitacion_reenviada` — `panel/src/i18n/translations.js:200`

> Invitación reenviada.

- **Dónde se ve:** panel/src/pages/asistentes/PerfilTab.jsx:435 y panel/src/pages/clientes/ClienteDetalle.jsx:203
- **Qué lo dispara:** Mensaje después de reenviar la invitación sin error
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 30. `comun.reenviar_invitacion_error` — `panel/src/i18n/translations.js:201`

> No se pudo reenviar la invitación.

- **Dónde se ve:** panel/src/pages/asistentes/PerfilTab.jsx:437 y panel/src/pages/clientes/ClienteDetalle.jsx:205
- **Qué lo dispara:** El reenvío de la invitación falló
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 31. `auth.mfa_explicacion_enrolar` — `panel/src/i18n/translations.js:323`

> Hace falta escanear este código con Google Authenticator, Authy u otra app similar, y escribir el código de 6 dígitos que muestra para confirmar.

- **Dónde se ve:** panel/src/pages/Mfa.jsx:211
- **Qué lo dispara:** Al entrar por primera vez con verificación en dos pasos exigida y sin aplicación generadora registrada
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 32. `auth.mfa_recuperacion_codigo_enviado` — `panel/src/i18n/translations.js:334`

> Enviamos un código al email registrado. Hace falta revisar la bandeja de entrada (vence en 10 minutos).

- **Dónde se ve:** panel/src/pages/Mfa.jsx:170
- **Qué lo dispara:** Después de pedir el código de recuperación por correo en la verificación en dos pasos
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 33. `auth.activar_token_invalido` — `panel/src/i18n/translations.js:345`

> Este enlace no sirve. Conviene pedir uno nuevo a quien creó la cuenta.

- **Dónde se ve:** panel/src/pages/ActivarCuenta.jsx:128 y panel/src/pages/ClaveNueva.jsx:112
- **Qué lo dispara:** El enlace de activación de la cuenta, o el de contraseña nueva, no es válido
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 34. `configuracion.seguridad_mfa_confirmar_item_preparacion` — `panel/src/i18n/translations.js:528`

> Conviene asegurarse de que cada persona con una de esas cuentas ya tenga instalada una app generadora de códigos (Google Authenticator, Authy u otra) antes de confirmar, para poder enrolarse en el próximo login.

- **Dónde se ve:** panel/src/pages/configuracion/Accesos.jsx:374
- **Qué lo dispara:** Confirmación al exigir verificación en dos pasos a un grupo de cuentas
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 35. `configuracion.calculo_tope_proporcion_horas_para_avisar` — `panel/src/i18n/translations.js:856`

> Desde qué parte del tope semanal ya conviene avisar (0 a 1)

- **Dónde se ve:** panel/src/pages/configuracion/ElCalculoDeCandidatos.jsx:156 (clave armada como calculo_tope_${clave})
- **Qué lo dispara:** Etiqueta de un casillero de la configuración del cálculo de candidatos
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 36. `importacion.falta_archivo` — `panel/src/i18n/translations.js:904`

> Hace falta elegir un archivo antes de analizar

- **Dónde se ve:** panel/src/pages/Importacion.jsx:96
- **Qué lo dispara:** Apretar analizar sin haber elegido archivo
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 37. `guia_primeros_pasos.paso_equipo_titulo` — `panel/src/i18n/translations.js:1052`

> Invitar a otro usuario del equipo

- **Dónde se ve:** panel/src/components/estado-actual/GuiaPrimerosPasos.jsx:83 (clave armada como paso_${clave}_titulo; el paso «equipo» sale de panel/src/context/PuestaEnMarchaContext.jsx:82)
- **Qué lo dispara:** Paso de la guía de primeros pasos que lleva a /usuarios-panel
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 38. `guia_primeros_pasos.paso_equipo_cta` — `panel/src/i18n/translations.js:1053`

> Invitar usuario

- **Dónde se ve:** panel/src/components/estado-actual/GuiaPrimerosPasos.jsx:95 (clave armada como paso_${clave}_cta)
- **Qué lo dispara:** Botón del mismo paso de la guía de primeros pasos
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 39. `guia_primeros_pasos.planilla_falta_archivo` — `panel/src/i18n/translations.js:1064`

> Hace falta elegir una planilla.

- **Dónde se ve:** panel/src/components/estado-actual/PropuestaDesdePlanilla.jsx:61
- **Qué lo dispara:** Pedir la propuesta sin haber elegido una planilla
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 40. `entrevistaPublica.no_encontrada_texto` — `panel/src/i18n/translations.js:1148`

> Puede que la entrevista se haya cancelado o que el enlace esté incompleto. Si le queda alguna duda, conviene responder el correo con el que se la citó.

- **Dónde se ve:** panel/src/pages/EntrevistaPublica.jsx:76
- **Qué lo dispara:** Página pública de la entrevista, cuando el enlace no lleva a ninguna entrevista
- **Quién lo lee:** Postulante a Asistente (página pública, sin sesión)
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 41. `entrevistaPublica.todavia_no_texto` — `panel/src/i18n/translations.js:1150`

> La sala se abre unos minutos antes. Conviene volver a entrar por este mismo enlace el día y la hora de la cita.

- **Dónde se ve:** panel/src/pages/EntrevistaPublica.jsx:126
- **Qué lo dispara:** Página pública de la entrevista, antes de que se abra la sala
- **Quién lo lee:** Postulante a Asistente (página pública, sin sesión)
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 42. `entrevistaPublica.ya_paso_texto` — `panel/src/i18n/translations.js:1152`

> Si hace falta una fecha nueva, la Prestadora va a avisar por correo.

- **Dónde se ve:** panel/src/pages/EntrevistaPublica.jsx:121
- **Qué lo dispara:** Página pública de la entrevista, cuando la hora ya pasó
- **Quién lo lee:** Postulante a Asistente (página pública, sin sesión)
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 43. `modalidades.falta_elegir` — `panel/src/i18n/translations.js:1323`

> Hace falta marcar al menos una forma de recibir el trabajo.

- **Dónde se ve:** panel/src/pages/asistentes/NuevoAsistenteModal.jsx:135 y panel/src/pages/asistentes/PerfilTab.jsx:313
- **Qué lo dispara:** Guardar un Asistente sin ninguna modalidad marcada
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 44. `matricula.que_hacer_sin_matricula` — `panel/src/i18n/translations.js:1332`

> Hace falta cargar la matrícula en el Padrón de Asistentes, en la solapa Matrículas.

- **Dónde se ve:** panel/src/pages/asistentes/MatriculasTab.jsx:175 y panel/src/lib/matricula.js:238 (clave armada como que_hacer_${motivo})
- **Qué lo dispara:** Un Asistente sin matrícula cargada para una tarea que la exige
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 45. `matricula.que_hacer_vencida` — `panel/src/i18n/translations.js:1333`

> Hace falta cargar la matrícula renovada en el Padrón de Asistentes, en la solapa Matrículas.

- **Dónde se ve:** panel/src/pages/asistentes/MatriculasTab.jsx:193
- **Qué lo dispara:** La matrícula del Asistente está vencida
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 46. `asistentes.vacio_texto` — `panel/src/i18n/translations.js:1366`

> Todavía no hay ningún Asistente cargado. Hace falta sumar el primero para empezar a armar guardias.

- **Dónde se ve:** panel/src/pages/Asistentes.jsx:183
- **Qué lo dispara:** Padrón de Asistentes vacío
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 47. `asistentes.certificado.requiere_activo` — `panel/src/i18n/translations.js:1531`

> Este Asistente todavía no está en estado Activo. Hace falta cambiarlo en la pestaña Perfil antes de emitir el certificado.

- **Dónde se ve:** panel/src/pages/asistentes/CertificadoTab.jsx:92
- **Qué lo dispara:** Emitir el certificado de un Asistente que no está Activo
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 48. `clientes.vacio_texto` — `panel/src/i18n/translations.js:1740`

> Todavía no hay ningún Cliente cargado. Hace falta sumar el primero para empezar a registrar Pacientes.

- **Dónde se ve:** panel/src/pages/Clientes.jsx:173
- **Qué lo dispara:** Directorio de Clientes vacío
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 49. `clientes.pagador.firmado_por_otro` — `panel/src/i18n/translations.js:1787`

> El consentimiento firmado que está guardado lo firmó otra persona, no quien figura hoy como Pagador. Conviene revisarlo.

- **Dónde se ve:** panel/src/pages/clientes/EstadoDelPagador.jsx:138
- **Qué lo dispara:** El consentimiento guardado lo firmó alguien distinto del Pagador actual
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 50. `clientes.personas_autorizadas.agregar` — `panel/src/i18n/translations.js:1849`

> Invitar a alguien

- **Dónde se ve:** Botón en panel/src/pages/clientes/ClienteDetalle.jsx:476
- **Qué lo dispara:** Siempre visible en la sección Personas autorizadas de la ficha del Cliente
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 51. `clientes.personas_autorizadas.invitando` — `panel/src/i18n/translations.js:1854`

> Invitando…

- **Dónde se ve:** panel/src/pages/clientes/InvitarPersonaAutorizadaModal.jsx:62
- **Qué lo dispara:** Texto del botón mientras se guarda una persona autorizada nueva
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 52. `comunicacion.seleccionar_conversacion` — `panel/src/i18n/translations.js:1900`

> Hace falta elegir una conversación de la lista.

- **Dónde se ve:** panel/src/pages/Comunicacion.jsx:202
- **Qué lo dispara:** Pantalla de comunicación sin ninguna conversación elegida
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 53. `guardias.seleccion.confirmar_cancelar` — `panel/src/i18n/translations.js:2078`

> Se van a cancelar {n} guardias. Desde acá no se deshace: cada una habría que volver a crearla. ¿Confirma?

- **Dónde se ve:** panel/src/pages/guardias/BarraAccionesMasivas.jsx:167
- **Qué lo dispara:** Confirmación antes de cancelar varias guardias seleccionadas
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 54. `guardias.avisos.titulo` — `panel/src/i18n/translations.js:2129`

> Antes de asignar, conviene mirar esto

- **Dónde se ve:** No se usa en ninguna pantalla
- **Qué lo dispara:** panel/src/lib/avisosAsignacion.js sólo lo consume panel/src/lib/candidatos.js; las claves hermanas asignar_igual y volver tampoco se usan
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 55. `guardias.nueva_guardia.error_sin_pacientes` — `panel/src/i18n/translations.js:2145`

> Hace falta marcar al menos un Paciente.

- **Dónde se ve:** panel/src/pages/guardias/NuevaGuardiaModal.jsx:163
- **Qué lo dispara:** Guardar una guardia nueva sin Paciente
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 56. `guardias.nueva_guardia.error_sin_servicio` — `panel/src/i18n/translations.js:2147`

> Hace falta elegir el Servicio.

- **Dónde se ve:** panel/src/pages/guardias/NuevaGuardiaModal.jsx:171
- **Qué lo dispara:** Guardar una guardia nueva sin Servicio
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 57. `guardias.nueva_guardia.error_dias_semana` — `panel/src/i18n/translations.js:2172`

> Hace falta elegir al menos un día de la semana.

- **Dónde se ve:** panel/src/pages/guardias/NuevaGuardiaModal.jsx:176
- **Qué lo dispara:** Guardar una guardia repetida sin día de la semana
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 58. `facturacion.falta_vencimiento` — `panel/src/i18n/translations.js:2344`

> Hace falta indicar hasta qué día tienen para pagar antes de generar los saldos.

- **Dónde se ve:** No se usa en ninguna pantalla
- **Qué lo dispara:** —
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 59. `facturacion.falta_motivo` — `panel/src/i18n/translations.js:2362`

> Hace falta decir por qué se anula el cobro.

- **Dónde se ve:** panel/src/pages/Facturacion.jsx:888
- **Qué lo dispara:** Anular un cobro sin escribir el motivo
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 60. `facturacion.falta_facturado` — `panel/src/i18n/translations.js:2386`

> Hace falta el importe del comprobante y cómo se llama.

- **Dónde se ve:** No se usa en ninguna pantalla
- **Qué lo dispara:** —
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 61. `facturacion.falta_correccion` — `panel/src/i18n/translations.js:2399`

> Hace falta el importe, cómo se llama el comprobante y por qué se corrige.

- **Dónde se ve:** No se usa en ninguna pantalla
- **Qué lo dispara:** —
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 62. `reportes.aviso_tope` — `panel/src/i18n/translations.js:2520`

> Se muestran los reportes más recientes del período. Si hace falta ver más, conviene achicar el rango de fechas.

- **Dónde se ve:** panel/src/pages/Reportes.jsx:135
- **Qué lo dispara:** La búsqueda de reportes llegó al tope de resultados
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 63. `prestaciones.seleccionar_servicio` — `panel/src/i18n/translations.js:2715`

> Hace falta elegir el Servicio.

- **Dónde se ve:** panel/src/pages/clientes/PrestacionesPaciente.jsx:222 y :293
- **Qué lo dispara:** Guardar una prestación sin Servicio
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 64. `prestaciones.seleccionar_precio_lista` — `panel/src/i18n/translations.js:2717`

> Hace falta elegir un servicio de la Lista de Precios.

- **Dónde se ve:** panel/src/pages/clientes/PrestacionesPaciente.jsx:227
- **Qué lo dispara:** Guardar una prestación sin elegir el renglón de la Lista de Precios
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 65. `prestaciones.paquete_datos_incompletos` — `panel/src/i18n/translations.js:2736`

> Hace falta elegir al menos dos Prestaciones y cargar un precio para el paquete.

- **Dónde se ve:** panel/src/pages/clientes/PrestacionesPaciente.jsx:559
- **Qué lo dispara:** Armar un paquete con menos de dos Prestaciones o sin precio
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 66. `prestaciones.cierre_servicio_motivo_fin_demanda` — `panel/src/i18n/translations.js:2742`

> Ya no hace falta el cuidado

- **Dónde se ve:** Opción de motivo de cierre en panel/src/pages/clientes/PrestacionesPaciente.jsx (alrededor de :987) y en la lista del catálogo de panel/src/pages/configuracion/ElCuidado.jsx; la clave se arma en panel/src/lib/motivoDeCierre.js
- **Qué lo dispara:** Es el nombre del motivo de fábrica «fin_demanda» al cerrar un Servicio
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 67. `prestaciones.cierre_servicio_falta_motivo` — `panel/src/i18n/translations.js:2750`

> Hace falta elegir el motivo del cierre.

- **Dónde se ve:** panel/src/pages/clientes/PrestacionesPaciente.jsx:297
- **Qué lo dispara:** Cerrar un Servicio sin elegir motivo
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 68. `prestaciones.hospitalizacion_contingencia_alerta` — `panel/src/i18n/translations.js:2765`

> {paciente} convive con este Paciente y está hospitalizado — conviene evaluar si hace falta reforzar su cobertura.

- **Dónde se ve:** panel/src/pages/clientes/PrestacionesPaciente.jsx:887
- **Qué lo dispara:** Un conviviente del Paciente está hospitalizado
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 69. `vitales_autorizacion.form_incompleto` — `panel/src/i18n/translations.js:2791`

> Hace falta completar nombre, fecha y archivo antes de guardar.

- **Dónde se ve:** panel/src/pages/clientes/MonitoreoVitalesPaciente.jsx:87
- **Qué lo dispara:** Guardar la autorización de monitoreo de signos vitales con datos faltantes
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 70. `domicilios_temporales.form_incompleto` — `panel/src/i18n/translations.js:2832`

> Hace falta completar el domicilio, las coordenadas, el motivo y la fecha de inicio antes de guardar.

- **Dónde se ve:** panel/src/pages/clientes/DomiciliosTemporalesPaciente.jsx:104
- **Qué lo dispara:** Guardar un domicilio temporal con datos faltantes
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 71. `domicilios_temporales.confirmar_borrado` — `panel/src/i18n/translations.js:2835`

> Se va a borrar este domicilio temporal y no va a quedar constancia de que el Paciente estuvo ahí. Es para lo que se cargó por error: un período que ya pasó conviene terminarlo, no borrarlo. ¿Confirma el borrado?

- **Dónde se ve:** panel/src/pages/clientes/DomiciliosTemporalesPaciente.jsx:164
- **Qué lo dispara:** Confirmación antes de borrar un domicilio temporal
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 72. `contenidos.borrar_confirmar` — `panel/src/i18n/translations.js:2925`

> Se va a borrar esta pieza de contenido, y no se puede deshacer. Sus destinatarios dejan de verla. Para dejarla como está, conviene cancelar.

- **Dónde se ve:** panel/src/pages/contenidos/ContenidoDetalle.jsx:299
- **Qué lo dispara:** Confirmación antes de borrar una pieza de contenido
- **Quién lo lee:** Coordinación de la Prestadora
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 73. `panel/src/pages/Muestra.jsx:209`

> Un dato que conviene saber.

- **Dónde se ve:** panel/src/pages/Muestra.jsx:209, página de muestra de componentes
- **Qué lo dispara:** Siempre visible en esa página: es el ejemplo de la alerta informativa
- **Quién lo lee:** Coordinación de la Prestadora (si llega a esa página)
- **Otros idiomas:** No tiene: está escrito en el código, fuera del catálogo de textos.

Decisión: ____

## Aplicación del Asistente (27)

### 1. `errores.sesion_vencida` — `pwa-asistentes/src/i18n/translations.js:8`

> Pasó demasiado tiempo sin actividad. Hace falta volver a entrar.

- **Dónde se ve:** pwa-asistentes/src/lib/errores.js (mensajeDeError), en cualquier pantalla de la aplicación que muestre un error
- **Qué lo dispara:** Una respuesta 401, o los códigos PGRST301 a PGRST303, o «JWT expired»: la sesión venció
- **Quién lo lee:** Asistente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 2. `errores.dato_invalido` — `pwa-asistentes/src/i18n/translations.js:13`

> Hay un dato mal cargado. Hace falta revisar lo que se escribió.

- **Dónde se ve:** pwa-asistentes/src/lib/errores.js (mensajeDeError), en cualquier pantalla de la aplicación que muestre un error
- **Qué lo dispara:** Una respuesta 400 o 422, o los códigos de Postgres 23502, 23514, 22P02, 22001, 22007 o P0001, cuando el Backend no manda un motivo propio
- **Quién lo lee:** Asistente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 3. `errores.motivos.falta_paciente` — `pwa-asistentes/src/i18n/translations.js:28`

> Falta saber de qué Paciente habla este Reporte Diario. Conviene volver a la guardia y entrar por el Paciente que corresponde.

- **Dónde se ve:** Confirmación del Reporte Diario (llamada en pwa-asistentes/src/lib/api.js:113)
- **Qué lo dispara:** Confirmar un Reporte Diario sin Paciente (POST /guardias/:id/reporte/confirmar, backend/src/routes/appAsistentes.js:1632)
- **Quién lo lee:** Asistente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 4. `errores.motivos.continuidad` — `pwa-asistentes/src/i18n/translations.js:31`

> Todavía no se puede cerrar esta guardia: no está permitido retirarse sin que llegue el relevo. Si hay una urgencia, hace falta avisarle al Coordinador para que lo autorice.

- **Dónde se ve:** pwa-asistentes/src/pages/GuardiaActiva.jsx:583, y por mensajeDeError
- **Qué lo dispara:** Cerrar la guardia sin que llegó el relevo (salida, backend/src/routes/appAsistentes.js:1781)
- **Quién lo lee:** Asistente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 5. `errores.motivos.faltan_datos` — `pwa-asistentes/src/i18n/translations.js:37`

> Faltan datos para activar la cuenta. Hace falta volver a abrir el enlace del correo y escribir la contraseña de nuevo.

- **Dónde se ve:** pwa-asistentes/src/pages/ActivarCuenta.jsx:62 por mensajeDeError, y en cualquier otra pantalla que reciba el mismo motivo
- **Qué lo dispara:** Activar la cuenta sin datos completos (backend/src/routes/activarCuenta.js:37 y :71). El Backend emite el mismo motivo desde muchas otras rutas que no tienen que ver con activar una cuenta
- **Quién lo lee:** Asistente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 6. `errores.motivos.token_invalido` — `pwa-asistentes/src/i18n/translations.js:39`

> Este enlace de activación no es válido. Conviene abrirlo de nuevo desde el correo, o pedir que reenvíen la invitación.

- **Dónde se ve:** pwa-asistentes/src/pages/ActivarCuenta.jsx:12 y pwa-asistentes/src/pages/ClaveNueva.jsx:11
- **Qué lo dispara:** Enlace de activación, o de contraseña nueva, que no es válido (activacionCuenta.js y recuperacionDeClave.js). En la contraseña nueva el texto habla igual de «activación» e «invitación»
- **Quién lo lee:** Asistente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 7. `errores.motivos.token_vencido` — `pwa-asistentes/src/i18n/translations.js:41`

> Este enlace de activación venció. Hace falta pedir que reenvíen la invitación.

- **Dónde se ve:** pwa-asistentes/src/pages/ActivarCuenta.jsx:12 y pwa-asistentes/src/pages/ClaveNueva.jsx:11
- **Qué lo dispara:** Enlace de activación, o de contraseña nueva, vencido. En la contraseña nueva el texto habla igual de «activación» e «invitación»
- **Quién lo lee:** Asistente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 8. `errores.motivos.matricula_sin_matricula` — `pwa-asistentes/src/i18n/translations.js:50`

> Para tomar esta guardia hace falta tener la matrícula cargada. Se carga desde Perfil.

- **Dónde se ve:** Al tomar una guardia, por mensajeDeError
- **Qué lo dispara:** Tomar una guardia que exige matrícula sin tenerla cargada (backend/src/routes/appAsistentesAsignaciones.js:57, motivo armado como matricula_${x})
- **Quién lo lee:** Asistente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 9. `errores.motivos.matricula_vencida` — `pwa-asistentes/src/i18n/translations.js:51`

> La matrícula no está vigente el día de esta guardia. Hace falta cargar la renovación desde Perfil.

- **Dónde se ve:** Al tomar una guardia, por mensajeDeError
- **Qué lo dispara:** Tomar una guardia con la matrícula vencida ese día (appAsistentesAsignaciones.js:57)
- **Quién lo lee:** Asistente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 10. `errores.motivos.modalidad_no_habilitada` — `pwa-asistentes/src/i18n/translations.js:53`

> Esta guardia es de una modalidad de trabajo que no está habilitada en este perfil. Hace falta hablarlo con la Prestadora.

- **Dónde se ve:** Al tomar una guardia, por mensajeDeError
- **Qué lo dispara:** Tomar una guardia de una modalidad no habilitada en el perfil (appAsistentesAsignaciones.js:59)
- **Quién lo lee:** Asistente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 11. `errores.motivos.codigo_incorrecto` — `pwa-asistentes/src/i18n/translations.js:57`

> Ese código no es el de esta guardia. Conviene pedir que lo muestren de nuevo, porque se renueva solo cada pocos segundos.

- **Dónde se ve:** pwa-asistentes/src/pages/GuardiaActiva.jsx:188 (MOTIVOS_DEL_CODIGO)
- **Qué lo dispara:** Código de llegada que no es el de la guardia (backend/src/utils/comprobacionDePresencia.js)
- **Quién lo lee:** Asistente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 12. `errores.motivos.codigo_vencido` — `pwa-asistentes/src/i18n/translations.js:58`

> Ese código ya venció. Hace falta pedir que muestren el nuevo.

- **Dónde se ve:** pwa-asistentes/src/pages/GuardiaActiva.jsx:188
- **Qué lo dispara:** Código de llegada vencido
- **Quién lo lee:** Asistente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 13. `errores.motivos.demasiados_intentos` — `pwa-asistentes/src/i18n/translations.js:62`

> Se probaron demasiados códigos seguidos. Soltar uno nuevo ya no devuelve intentos: hace falta entrar igual eligiendo un motivo.

- **Dónde se ve:** pwa-asistentes/src/pages/GuardiaActiva.jsx:188
- **Qué lo dispara:** Demasiados códigos de llegada probados seguidos
- **Quién lo lee:** Asistente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 14. `errores.motivos.demasiados_pedidos` — `pwa-asistentes/src/i18n/translations.js:63`

> Se hicieron demasiados pedidos en poco tiempo. Conviene esperar un minuto y volver a probar, o entrar igual eligiendo un motivo.

- **Dónde se ve:** pwa-asistentes/src/pages/GuardiaActiva.jsx:188, y por mensajeDeError en cualquier otra
- **Qué lo dispara:** Tope de pedidos por minuto (backend/src/middleware/topeDePedidos.js); el texto habla de «entrar eligiendo un motivo» aunque el tope alcanza a otras rutas
- **Quién lo lee:** Asistente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 15. `errores.motivos.descargo_vacio` — `pwa-asistentes/src/i18n/translations.js:67`

> El descargo está vacío. Hace falta escribir algo antes de dejarlo.

- **Dónde se ve:** Descargo de una calificación, por mensajeDeError
- **Qué lo dispara:** Guardar un descargo vacío (PATCH /calificaciones/:id/descargo, backend/src/routes/appAsistentes.js:2051)
- **Quién lo lee:** Asistente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 16. `errores.motivos.guardia_de_cobertura_sin_sustituto` — `pwa-asistentes/src/i18n/translations.js:72`

> Esta guardia está anotada dentro de una licencia y todavía no tiene un Asistente sustituto asignado, así que no se puede empezar. Conviene avisarle al Coordinador.

- **Dónde se ve:** Al empezar la guardia, por mensajeDeError
- **Qué lo dispara:** Empezar una guardia de una licencia sin sustituto asignado (backend/src/utils/guardiaSinSustituto.js:32, usado en appAsistentes.js:833)
- **Quién lo lee:** Asistente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 17. `auth.activar_token_invalido` — `pwa-asistentes/src/i18n/translations.js:178`

> Este enlace de activación no es válido o ya venció. Hace falta pedir que reenvíen la invitación.

- **Dónde se ve:** pwa-asistentes/src/pages/ActivarCuenta.jsx:74
- **Qué lo dispara:** Enlace de activación no válido o vencido
- **Quién lo lee:** Asistente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 18. `auth.clave_nueva_token_invalido` — `pwa-asistentes/src/i18n/translations.js:187`

> Este enlace no sirve o ya venció. Hace falta pedir uno nuevo.

- **Dónde se ve:** pwa-asistentes/src/pages/ClaveNueva.jsx:111
- **Qué lo dispara:** Enlace de contraseña nueva no válido o vencido
- **Quién lo lee:** Asistente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 19. `guardia_activa.cerrar_falta_reporte` — `pwa-asistentes/src/i18n/translations.js:288`

> Antes de cerrar la guardia hace falta cargar el Reporte Diario.

- **Dónde se ve:** pwa-asistentes/src/pages/GuardiaActiva.jsx:412 y :566
- **Qué lo dispara:** Cerrar la guardia sin Reporte Diario
- **Quién lo lee:** Asistente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 20. `guardia_activa.un_reporte_por_paciente` — `pwa-asistentes/src/i18n/translations.js:305`

> Cada persona lleva su propio Reporte Diario. Hace falta cargar uno por cada una antes de cerrar la guardia.

- **Dónde se ve:** pwa-asistentes/src/pages/GuardiaActiva.jsx:566
- **Qué lo dispara:** Cerrar una guardia de varios Pacientes sin un Reporte Diario por cada uno
- **Quién lo lee:** Asistente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 21. `emergencia.explicacion` — `pwa-asistentes/src/i18n/translations.js:356`

> Esto le llega a la Prestadora en el momento. Si hace falta atención médica o de seguridad, llame primero al número que corresponda: este aviso no reemplaza esa llamada.

- **Dónde se ve:** pwa-asistentes/src/components/EmergenciaEnGuardia.jsx:110
- **Qué lo dispara:** Al abrir el aviso de emergencia durante la guardia
- **Quién lo lee:** Asistente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 22. `consentimientos.texto_cambio` — `pwa-asistentes/src/i18n/translations.js:690`

> El texto cambió desde la última vez. Hace falta leerlo de nuevo y volver a decidir.

- **Dónde se ve:** pwa-asistentes/src/components/Consentimientos.jsx:110
- **Qué lo dispara:** Un consentimiento ya respondido cambió de texto
- **Quién lo lee:** Asistente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 23. `matricula.que_hacer_sin_verificar` — `pwa-asistentes/src/i18n/translations.js:706`

> No hace falta hacer nada más: la Prestadora la va a mirar.

- **Dónde se ve:** pwa-asistentes/src/components/Matricula.jsx:143 (clave armada como que_hacer_${motivo})
- **Qué lo dispara:** Matrícula cargada que la Prestadora todavía no verificó
- **Quién lo lee:** Asistente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 24. `matricula.carga_la_prestadora` — `pwa-asistentes/src/i18n/translations.js:709`

> En esta Prestadora las matrículas las carga la oficina: hace falta acercarles el papel o el archivo para que lo suban.

- **Dónde se ve:** pwa-asistentes/src/components/Matricula.jsx:143
- **Qué lo dispara:** La Prestadora carga las matrículas desde la oficina
- **Quién lo lee:** Asistente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 25. `matricula.renovar_con_la_prestadora` — `pwa-asistentes/src/i18n/translations.js:710`

> Hace falta acercarle la renovación a la Prestadora antes de esa fecha para no quedarse sin guardias.

- **Dónde se ve:** pwa-asistentes/src/components/Matricula.jsx:154
- **Qué lo dispara:** Matrícula por vencer, en una Prestadora que las carga desde la oficina
- **Quién lo lee:** Asistente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 26. `matricula.renovar_a_tiempo` — `pwa-asistentes/src/i18n/translations.js:715`

> Hace falta cargar la renovación antes de esa fecha para no quedarse sin guardias.

- **Dónde se ve:** pwa-asistentes/src/components/Matricula.jsx:154
- **Qué lo dispara:** Matrícula por vencer, en una Prestadora donde la carga el Asistente
- **Quién lo lee:** Asistente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 27. `papeles.resumen_por_vencer` — `pwa-asistentes/src/i18n/translations.js:736`

> Hay algún papel por vencer. Conviene renovarlo antes de la fecha.

- **Dónde se ve:** pwa-asistentes/src/components/CarpetaDePapeles.jsx:98 (clave armada como resumen_${carpeta.resumen})
- **Qué lo dispara:** Algún papel de la carpeta está por vencer
- **Quién lo lee:** Asistente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

## Aplicación del Cliente (19)

### 1. `errores.sesion_vencida` — `pwa-clientes/src/i18n/translations.js:8`

> Pasó demasiado tiempo sin actividad. Hace falta volver a entrar.

- **Dónde se ve:** pwa-clientes/src/lib/errores.js (mensajeDeError), en cualquier pantalla de la aplicación que muestre un error
- **Qué lo dispara:** Una respuesta 401, o los códigos PGRST301 a PGRST303, o «JWT expired»: la sesión venció
- **Quién lo lee:** Cliente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 2. `errores.dato_invalido` — `pwa-clientes/src/i18n/translations.js:13`

> Hay un dato mal cargado. Conviene revisar lo que se escribió.

- **Dónde se ve:** pwa-clientes/src/lib/errores.js (mensajeDeError), en cualquier pantalla de la aplicación que muestre un error
- **Qué lo dispara:** Una respuesta 400 o 422, o los códigos de Postgres 23502, 23514, 22P02, 22001, 22007 o P0001, cuando el Backend no manda un motivo propio
- **Quién lo lee:** Cliente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 3. `errores.motivos.codigo_incorrecto` — `pwa-clientes/src/i18n/translations.js:37`

> Ese código no es correcto. Conviene revisarlo y escribirlo de nuevo.

- **Dónde se ve:** Confirmación de una instrucción con código, por mensajeDeError
- **Qué lo dispara:** Código incorrecto al confirmar una instrucción (POST /instruccion/:id/confirmar, backend/src/routes/appClientes.js:242; backend/src/utils/instruccionesPersonasAutorizadas.js)
- **Quién lo lee:** Cliente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 4. `errores.motivos.vencido` — `pwa-clientes/src/i18n/translations.js:38`

> Ese código venció. Hace falta pedir uno nuevo.

- **Dónde se ve:** Confirmación de una instrucción con código, por mensajeDeError
- **Qué lo dispara:** Código vencido al confirmar una instrucción
- **Quién lo lee:** Cliente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 5. `errores.motivos.demasiados_intentos` — `pwa-clientes/src/i18n/translations.js:42`

> Se probó demasiadas veces con esta instrucción. Pedir un código nuevo ya no devuelve intentos: hace falta que la Prestadora la cargue de nuevo, o firmarla en papel.

- **Dónde se ve:** Confirmación de una instrucción con código, por mensajeDeError
- **Qué lo dispara:** Demasiados intentos al confirmar una instrucción
- **Quién lo lee:** Cliente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 6. `errores.motivos.sin_codigo` — `pwa-clientes/src/i18n/translations.js:44`

> Todavía no se pidió ningún código. Hace falta pedirlo primero.

- **Dónde se ve:** Confirmación de una instrucción con código, por mensajeDeError
- **Qué lo dispara:** Confirmar una instrucción sin haber pedido código
- **Quién lo lee:** Cliente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 7. `errores.motivos.no_encontrado` — `pwa-clientes/src/i18n/translations.js:46`

> No se encontró esa instrucción. Conviene volver a abrir la pantalla.

- **Dónde se ve:** Por mensajeDeError, en cualquier pantalla
- **Qué lo dispara:** Instrucción inexistente. El Backend emite el mismo motivo desde muchas otras rutas que no tienen que ver con instrucciones
- **Quién lo lee:** Cliente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 8. `errores.motivos.acceso_inexistente` — `pwa-clientes/src/i18n/translations.js:50`

> No se encontró ese acceso. Conviene volver a abrir la pantalla.

- **Dónde se ve:** pwa-clientes/src/pages/PerfilPublicoAsistente.jsx:177
- **Qué lo dispara:** Ver el contacto de un Asistente con un acceso que no existe
- **Quién lo lee:** Cliente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 9. `errores.motivos.sin_acceso_de_intermediacion` — `pwa-clientes/src/i18n/translations.js:59`

> Para ver cómo llegar a esta persona hace falta tener contratado el servicio con la Prestadora.

- **Dónde se ve:** pwa-clientes/src/pages/PerfilPublicoAsistente.jsx:177
- **Qué lo dispara:** Ver el contacto de un Asistente sin servicio contratado (backend/src/utils/contactoDelAsistente.js:55)
- **Quién lo lee:** Cliente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 10. `errores.motivos.acceso_no_vigente` — `pwa-clientes/src/i18n/translations.js:60`

> El servicio contratado no está vigente. Para ver estos datos hace falta renovarlo con la Prestadora.

- **Dónde se ve:** pwa-clientes/src/pages/PerfilPublicoAsistente.jsx:177
- **Qué lo dispara:** Ver el contacto con el servicio vencido (backend/src/utils/contactosIntermediacion.js)
- **Quién lo lee:** Cliente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 11. `errores.motivos.saldo_agotado` — `pwa-clientes/src/i18n/translations.js:61`

> Ya se usaron todos los contactos incluidos. Para ver uno más hace falta pedirle otro paquete a la Prestadora.

- **Dónde se ve:** pwa-clientes/src/pages/PerfilPublicoAsistente.jsx:177
- **Qué lo dispara:** Ver un contacto más con el paquete agotado (backend/src/utils/contactosIntermediacion.js)
- **Quién lo lee:** Cliente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 12. `errores.motivos.faltan_datos` — `pwa-clientes/src/i18n/translations.js:66`

> Faltan datos para activar la cuenta. Hace falta volver a abrir el enlace del correo y escribir la contraseña de nuevo.

- **Dónde se ve:** pwa-clientes/src/pages/ActivarCuenta.jsx:66 por mensajeDeError, y en cualquier otra pantalla que reciba el mismo motivo
- **Qué lo dispara:** Activar la cuenta sin datos completos. El Backend emite el mismo motivo desde muchas otras rutas
- **Quién lo lee:** Cliente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 13. `errores.motivos.token_invalido` — `pwa-clientes/src/i18n/translations.js:68`

> Este enlace de activación no es válido. Conviene abrirlo de nuevo desde el correo, o pedir que reenvíen la invitación.

- **Dónde se ve:** pwa-clientes/src/pages/ActivarCuenta.jsx:12 y pwa-clientes/src/pages/ClaveNueva.jsx:11
- **Qué lo dispara:** Enlace de activación, o de contraseña nueva, no válido. En la contraseña nueva el texto habla igual de «activación» e «invitación»
- **Quién lo lee:** Cliente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 14. `errores.motivos.token_vencido` — `pwa-clientes/src/i18n/translations.js:70`

> Este enlace de activación venció. Hace falta pedir que reenvíen la invitación.

- **Dónde se ve:** pwa-clientes/src/pages/ActivarCuenta.jsx:12 y pwa-clientes/src/pages/ClaveNueva.jsx:11
- **Qué lo dispara:** Enlace de activación, o de contraseña nueva, vencido. En la contraseña nueva el texto habla igual de «activación» e «invitación»
- **Quién lo lee:** Cliente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 15. `comun.campo_obligatorio` — `pwa-clientes/src/i18n/translations.js:87`

> Hace falta completar este campo.

- **Dónde se ve:** pwa-clientes/src/pages/Medicacion.jsx:141
- **Qué lo dispara:** Texto al pie de un campo obligatorio vacío al guardar
- **Quién lo lee:** Cliente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 16. `auth.activar_token_invalido` — `pwa-clientes/src/i18n/translations.js:150`

> Este enlace de activación no es válido o ya venció. Hace falta pedir que reenvíen la invitación.

- **Dónde se ve:** pwa-clientes/src/pages/ActivarCuenta.jsx:78
- **Qué lo dispara:** Enlace de activación no válido o vencido
- **Quién lo lee:** Cliente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 17. `auth.clave_nueva_token_invalido` — `pwa-clientes/src/i18n/translations.js:159`

> Este enlace no sirve o ya venció. Hace falta pedir uno nuevo.

- **Dónde se ve:** pwa-clientes/src/pages/ClaveNueva.jsx:112
- **Qué lo dispara:** Enlace de contraseña nueva no válido o vencido
- **Quién lo lee:** Cliente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 18. `acceso.qr_vencido` — `pwa-clientes/src/i18n/translations.js:512`

> Este código venció. Hace falta generar uno nuevo.

- **Dónde se ve:** pwa-clientes/src/pages/AccesoIntermediacion.jsx:137
- **Qué lo dispara:** El código QR del acceso venció
- **Quién lo lee:** Cliente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

### 19. `medicacion.error_campos_obligatorios` — `pwa-clientes/src/i18n/translations.js:596`

> Hace falta completar medicamento, dosis, frecuencia, vía y fecha desde.

- **Dónde se ve:** pwa-clientes/src/pages/Medicacion.jsx:147
- **Qué lo dispara:** Guardar una medicación con datos faltantes
- **Quién lo lee:** Cliente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR`.

Decisión: ____

## Base (2)

Ninguna fila de `mensajes_del_sistema` dice «invitación» (consulta de solo lectura sobre la base en vivo, 177 filas). Dos claves llevan «invitacion» en el nombre pero no en el texto: `activacion_cuenta.invitacion_al_enlace` («Se activa acá:») y `recuperacion_clave.invitacion_al_enlace` («Se elige acá:»). Las dos fichas de abajo no salen del criterio de «invitación»: aparecieron en la misma consulta y tienen una construcción dubitativa.

### 1. `mensajes_del_sistema · entrevista_agendada.cuerpo`

> Su entrevista quedó agendada para el {{cuando}}.
> 
> El día de la entrevista, entre por acá:
> {{enlace}}
> 
> La puerta se abre {{anticipo}} minutos antes de la hora. No hace falta instalar nada ni crear ninguna cuenta.

- **Dónde se ve:** Correo al postulante (backend/src/i18n/avisos.js:671)
- **Qué lo dispara:** Agendar una entrevista desde el Panel (backend/src/utils/entrevistaDePostulacion.js:211)
- **Quién lo lee:** Postulante a Asistente
- **Otros idiomas:** Existen las versiones `en` y `pt-BR` en la misma fila. Es texto de fábrica que cada Prestadora puede reemplazar.

Decisión: ____

### 2. `mensajes_del_sistema · guardia_sin_cerrar_grave.hace_falta_autoridad`

> Ya se avisó al Coordinador y la guardia sigue sin cerrarse. Hace falta que intervenga alguien con autoridad para resolverlo.

- **Dónde se ve:** Aviso del evento guardia_sin_cerrar_grave (backend/src/i18n/avisos.js:204)
- **Qué lo dispara:** Tercer escalón de una guardia que sigue abierta horas después de terminar (backend/src/utils/revisarNotificacionesCoordinador.js:238)
- **Quién lo lee:** Coordinación de la Prestadora y los destinatarios de ese evento
- **Otros idiomas:** Existen las versiones `en` y `pt-BR` en la misma fila. Es texto de fábrica que cada Prestadora puede reemplazar.

Decisión: ____
