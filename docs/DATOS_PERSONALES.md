# Datos personales

Este documento repasa cada dato de una persona que Careonys guarda. Para cada uno dice para qué se guarda, quién lo lee y si hace falta. Después dice qué datos salen hacia otras empresas y si los registros de actividad y de errores guardan datos de personas. Al final hay una lista de datos que no tienen uso. Sacarlos es borrar datos, y eso lo decide el Desarrollador: la lista es una propuesta, no está aplicada.

La revisión se hizo contra el código escrito y contra la base en la nube. De la base se tomaron sólo cantidades, nunca el contenido de un dato. Las cantidades son las de la base de desarrollo, que tiene sólo datos inventados.

## Datos del Asistente

Hay 46 Asistentes cargados.

- **Nombre, apellido y género.** Sirven para mostrarlo en el Panel, en la aplicación del Cliente y en los avisos. Hacen falta.
- **Documento y CUIL.** Sirven para identificarlo y para no cargar dos veces a la misma persona. Los 46 Asistentes tienen documento. Hacen falta.
- **Número de DNI aparte.** Se saca del CUIL de forma automática. Repite un dato que ya está en el documento, pero el buscador lo usa para encontrar rápido a la persona. Hace falta mientras el buscador lo use.
- **Teléfono y correo.** Sirven para avisarle por WhatsApp, por correo y por la aplicación. 41 Asistentes tienen teléfono y 45 tienen correo. Hacen falta. El correo se repite en la cuenta de la persona y el sistema mantiene las dos copias iguales.
- **Código para mostrar en la puerta.** Es el código que el Cliente lee con el teléfono para confirmar que el Asistente es quien dice ser. Lo tienen los 46. Hace falta.
- **Foto.** Sirve para que el Cliente reconozca a la persona. Hoy ningún Asistente tiene foto cargada. Hace falta cuando se carguen.
- **Domicilio, datos bancarios y referencias laborales.** Se guardan aparte, con acceso más cerrado. Sirven para pagarle y para el legajo. Hoy no hay ninguno cargado. Hacen falta.
- **Disponibilidad.** Sirve para sugerir quién cubre un turno. Hoy no hay ninguna cargada. Hace falta.

## Datos de la Persona que recibe el cuidado

Hay 40 Personas cargadas.

- **Nombre, apellido, género, documento y fecha de nacimiento.** Sirven para identificarla en el Panel, en los reportes y en los consentimientos. 40 tienen documento y 17 tienen fecha de nacimiento. Hacen falta.
- **Número de DNI aparte.** Igual que en el Asistente: repite el documento y lo usa el buscador. 38 Personas lo tienen.
- **Domicilio y su ubicación en el mapa.** Sirven para mandar al Asistente a la casa y para comprobar la llegada. 18 tienen calle y 15 tienen ubicación en el mapa. Hacen falta.
- **Correo.** Sirve para avisos al Cliente. 18 Personas lo tienen. Hace falta.
- **Notas.** Es un casillero libre que el Panel muestra. Hoy está vacío en las 40 Personas. Ver la propuesta al final.
- **Datos de salud.** Diagnósticos, medicación habitual, alergias e indicaciones. Los lee el Asistente durante la guardia y los usan los reportes y las alertas tempranas. Hacen falta.

## Datos de la cuenta de cada persona

Hay 67 cuentas.

- **Nombre de usuario y contraseña.** Sirven para entrar. Hacen falta.
- **Nombre y correo.** Los 67 tienen nombre y 64 tienen correo. Sirven para mostrar quién hizo algo y para avisos. Hacen falta.
- **Teléfono.** 6 cuentas lo tienen. Sirve para el código de entrada por mensaje de texto, que hoy está preparado y apagado porque falta elegir el proveedor. Hace falta cuando se encienda.
- **Teléfonos confirmados por la Prestadora.** No se guarda el número: se guarda un identificador de verificación, que permite comprobar un número sin guardarlo. Hace falta.
- **Avisos de correo cambiado y códigos enviados al teléfono.** Hoy no hay ninguno. Se borran solos al vencer. Hacen falta.
- **Datos del navegador en los avisos de la aplicación.** Al activar los avisos se guarda qué navegador usa la persona. Hay 1 caso. El sistema lo escribe y nadie lo lee nunca. Ver la propuesta al final.

## Datos de la guardia y de la ubicación

Hay 151 guardias.

- **Lugar de entrada a la casa.** 105 guardias lo tienen. Sirve para comprobar que el Asistente llegó. Hace falta.
- **Lugar de salida de la casa.** 90 guardias lo tienen. Sirve para comprobar que el Asistente se fue al terminar. Hace falta.
- **Ubicación actual, salida y comprobaciones durante la guardia.** El código los usa, pero hoy están vacíos en las 151 guardias. Esperan el consentimiento de ubicación del paso del plan sobre ese tema. Hacen falta cuando se encienda.
- **Recorrido del Asistente punto por punto.** Existe un lugar para guardarlo. Ninguna parte del código lo lee ni lo escribe, y está vacío. Ver la propuesta al final.
- **Persona atendida dentro de la guardia.** Hay un dato que repite quién es la Persona. Ya está marcado para retirar, porque ahora se saca del Servicio. Ver la propuesta al final.

## Reportes, alertas y consentimientos

- **Texto libre del reporte diario.** Lo dicta o escribe el Asistente. Hay 2 reportes con texto. Es dato de salud. Lo leen la Prestadora y el Cliente, y lo usa el modelo de IA. Hace falta.
- **Consentimiento de quien paga y consentimiento de medicación.** Hay 2 consentimientos de quien paga. Guardan el nombre de quien firmó tal como estaba el día de la firma. Repite un dato de la cuenta, pero a propósito: un consentimiento tiene que mostrar quién firmó aunque después la persona cambie su nombre. Hace falta.
- **Personas autorizadas.** Son los familiares que el Cliente autoriza a ver datos. Hoy ninguna tiene correo cargado. Hace falta.

## Postulaciones

Hoy no hay ninguna postulación cargada. Ninguna parte del código guarda postulaciones: el reclutamiento espera la mudanza a Careonys Match. Pero el lugar donde se guardarían tiene muchos datos personales que nadie lee: fecha de nacimiento, domicilio y su ubicación en el mapa, localidad, nacionalidad, foto, situación ante el organismo de recaudación, obra social, estudios, experiencia laboral y clínica, distancia máxima, y tres datos de disponibilidad. La pretensión de honorarios sólo la usa un filtro. Ningún control compara la fecha de nacimiento con la edad mínima para trabajar. También repite el DNI dentro del CUIL y la situación ante el organismo de recaudación en dos lugares. Ver la propuesta al final.

## Mensajes y conversaciones

- **Conversaciones de WhatsApp.** Hoy no hay ninguna. Guardan el número y el texto. Sirven para responder y para el seguimiento del aviso. Hacen falta.
- **Importaciones de planillas.** Hay 4. Guardan, de cada renglón que falló, el número de renglón, el motivo y las localidades posibles. No guardan el contenido del renglón. Hace falta.

## Qué datos salen hacia otras empresas

- **Modelo de IA de Anthropic.**
  - Al importar una planilla se le mandan los primeros 8.000 caracteres del archivo tal como llegó, más 5 renglones de muestra. Eso incluye nombres, documentos y teléfonos de personas. Es lo que más datos personales saca hacia afuera.
  - Cuando un género o una localidad no se reconocen, se le manda ese valor suelto.
  - El reporte diario manda el texto que dictó el Asistente. Es dato de salud.
  - Las alertas tempranas mandan diagnósticos, medicación habitual y reportes. Es dato de salud.
  - La sugerencia del motivo de un aviso manda lo que la persona escribió en el aviso.
  - La redacción de plantillas de WhatsApp no manda ningún dato de personas. Su instrucción lo prohíbe.
- **WhatsApp, de Meta.** Recibe el número de teléfono y el texto de cada mensaje.
- **Resend, el servicio de correo.** Recibe el correo de la persona y el texto del mensaje.
- **Servicio de direcciones del Estado argentino.** Recibe la dirección escrita, para devolver su ubicación en el mapa. No recibe el nombre de la persona.
- **Avisos de la aplicación.** El servicio del navegador recibe el título y el texto del aviso.
- **Copias de seguridad.** Salen a Cloudflare y a Backblaze, cifradas por Prestadora antes de salir. Esas empresas no pueden leerlas.
- **Videollamadas.** Van a la dirección que configura cada Prestadora.
- **Mensajes de texto.** Hoy no sale ninguno: falta elegir el proveedor.

## Registros de actividad y de errores

- **Registro de actividad.** Guarda qué dato se cambió, pero nunca el valor viejo ni el nuevo.
- **Registro de accesos.** Guarda quién entró, cuándo y a qué, sin contenido.
- **Consultas a la historia clínica.** Guardan la dirección consultada sin los parámetros de búsqueda.
- **Mensajes de errores del servidor.** Se revisaron las 324 líneas que escriben en el registro del servidor. Ninguna escribe un teléfono, un correo ni un nombre. El control que frena los pedidos repetidos anota un identificador de quien llama, no un dato personal. Los errores del modelo de IA no anotan el texto que se le mandó.

## Propuesta: datos sin uso

Ninguno de estos cambios está aplicado. Sacar un dato es borrarlo, y lo decide el Desarrollador.

1. **Recorrido del Asistente punto por punto.** Nadie lo lee ni lo escribe, y está vacío. Propuesta: sacarlo. Se pierde: nada.
2. **Datos personales de las postulaciones que nadie lee.** Son los de la lista de la sección Postulaciones. Hoy no hay ninguna postulación. Propuesta: sacarlos y decidirlos de nuevo en la mudanza a Careonys Match. Se pierde: nada, porque no hay ninguna cargada.
3. **Datos del navegador en los avisos de la aplicación.** Se escriben en dos lugares y nadie los lee. Hay 1 caso. Propuesta: dejar de guardarlos y sacarlos. Se pierde: el nombre del navegador de 1 cuenta de prueba.
4. **Persona atendida dentro de la guardia.** Ya está marcada para retirar. Propuesta: terminar de sacarla. Se pierde: nada, porque el mismo dato está en el Servicio.
5. **Notas de la Persona.** El Panel la muestra pero hoy está vacía en las 40 Personas. Propuesta: preguntarle al Desarrollador si queda. Un casillero libre junta datos de salud sin control.

## Para quien programa

Nombres en la base, por sección:

- Asistente: `asistentes` (`nombre`, `apellido`, `genero`, `documento_numero`, `cuil`, `dni`, `telefono`, `email`, `qr_token`, `foto_url`, `disponibilidad`); `datos_reservados_asistente` (domicilio, banco, referencias), leído desde `panel/src/lib/datosAparteDelAsistente.js`.
- Persona: `personas` (`dni` derivado en `interno.identidad_validada` desde los dígitos 3 a 10 del CUIL cuando el catálogo tiene `contiene_dni`; `fecha_nacimiento`, `calle`, `lat`, `lng`, `email`, `notas`).
- Cuenta: `usuarios` (`nombre`, `email`, `telefono`); `telefonos_confirmados_por_la_prestadora` (sólo identificador de verificación, usada por funciones y disparadores de la base, no por el backend); `push_subscriptions.user_agent` y `auditoria_cambio_dueno_push.user_agent` (escritas en `backend/src/utils/suscripcionesPush.js`, nunca leídas).
- Correo repetido en `usuarios`, `asistentes`, `personas` y `personas_autorizadas`, sincronizado por disparadores.
- Guardia: `turnos_guardia` (`ubicacion_actual`, salida, punto de entrada y de salida de la casa, `paciente_id` marcado «EN RETIRO»); `turno_guardia_comprobaciones`; `turnos_guardia_tracking_gps` (sin uso, 0 filas).
- Consentimientos: `consentimientos_pagador.pagador_nombre` y `firmante_nombre`; `consentimientos_medicacion.firmante_nombre`.
- Postulaciones: `postulaciones` (sin código que escriba). Columnas sin lectura: `fecha_nacimiento`, `domicilio`, `lat`, `lng`, `localidad`, `nacionalidad`, `foto_perfil_url`, `tipo_registro_afip`, `obra_social`, `estudios`, `experiencia_laboral`, `experiencia_clinica`, `distancia_maxima_km`, `disponible_urgencias`, `disponible_con_retiro`, `disponible_sin_retiro`, `moneda`. `honorario_pretendido` sólo en un filtro. Duplicados: `cuil`/`dni`, `situacion_fiscal`/`tipo_registro_afip`.
- Registros: `registro_actividad` (sólo nombres de columnas), `auditoria_de_accesos`, `consultas_a_hce` (ruta sin parámetros), `importaciones.errores`.
- Servicios externos: `backend/src/utils/importacionIA.js`, `reporteIA.js`, `alertasIA.js`, `iaPlantillasWhatsapp.js`, `motivoSugeridoDelAviso.js` (modelo en `backend/src/config/modeloIA.js`); `mensajeDeTexto.js` (apagado); `copiaDeLosArchivos.js` (R2 y B2, cifrado); `videollamada.js`; `backend/src/geocodificacion/georefAr.js`; `backend/src/utils/push.js`.
