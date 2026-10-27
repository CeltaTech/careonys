# PRD_04_05 — PWA de Servicio (Asistentes y Clientes)

> Fuente: documento único original de especificación, Parte O. Cubre la PWA de Asistentes y la
> PWA de Clientes.

## Objetivo

La PWA de servicio es donde se hace real la propuesta de valor: reporte diario con IA, GPS
en tiempo real, Certificado de Aptitud en el perfil, alertas inteligentes. La usan Asistentes durante la guardia y
Clientes para seguir el servicio.

## Stack

```
Framework:  React 18 + Vite + Vite PWA Plugin
Auth:       Supabase Auth (usuario y contraseña)
DB:         Supabase (PostgreSQL + RLS + Realtime)
Storage:    Supabase Storage (fotos de reportes, documentos)
GPS:        navigator.geolocation API (browser nativo)
Cámara:     MediaDevices API (browser nativo)
IA Nivel 1 y 2: Anthropic API — modelo configurable en backend/src/config/modeloIA.js (ver AI_PROMPTS.md)
Push:       Web Push API + Service Worker (Android) / Apple Push (iOS 16.4+)
Informe Obra Social: sin librería de PDF — informe virtual dentro del Panel, impresión vía window.print() + @media print
```

Limitación conocida: notificaciones push en Safari/iOS son limitadas incluso desde iOS 16.4.
No es un bug a resolver en el MVP — está documentado como limitación de la estrategia
PWA-first, monitorear en producción antes de considerar migrar a app nativa con Capacitor.

## PWA del Asistente

### Login
Usuario y contraseña (`src/context/AuthContext.jsx`): se entra con el nombre de usuario, único
en todo el sistema. Con opción de identificación biométrica (huella o rostro vía WebAuthn, si el
dispositivo lo permite) una vez que el usuario ya inició sesión con contraseña al menos una vez:
el acceso guardado (`src/lib/accesoGuardado.js`). Primer login: completar perfil si faltan datos.
Sesión persistente — no pedir login en cada visita.

### Guardias (pantalla principal)
Lista de guardias asignadas (próximas + historial). Cada card: paciente, dirección, fecha,
hora, modalidad, estado. Botón prominente "CHECK-IN" en la guardia activa o próxima.

### Flujo de Check-in

1. El Asistente toca "CHECK-IN" al llegar al domicilio.
2. La app pide permiso de geolocalización si no lo tiene.
3. Registra `checkin_lat`/`checkin_lng`/`checkin_at` en `guardias`.
4. Valida distancia contra el domicilio del paciente:
   - Dentro del rango → check-in exitoso, guardia pasa a `activa`.
   - Fuera del rango → el check-in se registra igual y queda una nota automática para el
     coordinador (`mensajes_asistente`): la distancia nunca bloquea el check-in, porque el
     Asistente puede tener razones legítimas. La tolerancia en metros es configuración de cada
     Prestadora.
5. Notificación push al Cliente: "Llegó el Asistente: [nombre] llegó al domicilio de [Paciente]".

### Guardia Activa
Timer desde el check-in. Datos del paciente (nombre, patologías, medicación habitual, notas
del coordinador). Botón "Ver reportes anteriores". Botón "Reporte de emergencia" (formulario
simplificado + alerta inmediata al coordinador, separado del flujo normal de check-out).
Botón "Check-out" habilitado recién después de las horas mínimas de la modalidad.

### El botón de emergencia — cómo quedó construido

**La palabra no aparece escrita en ninguna línea de la aplicación.** El botón, el formulario y los
mensajes salen de `pwa-asistentes/src/i18n/translations.js` en los tres idiomas, como todo el resto.

Se aprieta desde la Guardia Activa (`pwa-asistentes/src/components/EmergenciaEnGuardia.jsx`).
**Hoy no tiene lista de tipos para elegir**: se escribe qué está pasando y se manda. **La lista la
arma cada Prestadora en su configuración**, sobre una propuesta de fábrica de Careonys con un plan
de acción sugerido y acciones preparadas que corren solas o no, según elija ella. El Asistente
elige de esa lista al apretar el botón, y si no figura usa «Otras» y escribe qué pasa. Qué falta
contestar y construir está en `docs/PLAN_HASTA_PRODUCCION.md`, sección «Las dos aplicaciones».

**Sale aunque no haya señal.** Es un tipo más de la cola sin conexión
(`pwa-asistentes/src/lib/colaOffline.js`), y por eso el backend acepta acá —y sólo acá— el momento
que marca el teléfono: un aviso que estuvo media hora esperando red guardado con la hora de la
sincronización contaría mal lo que pasó. Se acepta hacia atrás nada más; una hora futura es un
reloj mal puesto.

**Se guarda primero y se avisa después.** La fila queda en `emergencias_guardia`
(`backend/src/routes/appAsistentes.js`, `POST /guardias/:id/emergencia`) y recién entonces sale el
mensaje al Coordinador, adentro de un `try`: si el envío falla, quien reportó igual recibe que salió
bien —su acto ya está guardado— y la fila queda sin marca de notificada.

**El evento no se puede apagar.** Está en `backend/src/utils/catalogoAvisos.js` con
`se_puede_apagar: false`: la Prestadora elige por qué canal sale y a qué dirección, nunca si sale.

**El detalle no viaja por el canal público.** El mensaje inmediato dice que hay una emergencia, de
qué guardia y de cuándo; el texto que escribió el Asistente es información sensible
(`celtatech/CLAUDE.md`, «Seguridad, privacidad y auditoría») y se lee entrando al Panel, en «Emergencias»
(`panel/src/pages/EmergenciasEnGuardia.jsx`, `backend/src/routes/panelEmergencias.js`). Ahí se
marca atendida con una nota de qué se hizo, y queda con nombre y hora.

**Está afuera de la bandeja de alertas y de la de alertas tempranas**, y no es un descuido: esas
dos las deduce un programa, y ésta la apretó una persona que está adentro de una casa.

### Flujo de Reporte Diario (dispara IA Nivel 1 al hacer check-out)

1. **Dictado o escritura libre** — textarea grande + botón de micrófono, placeholder
   invitando a hablar en lenguaje natural.
2. **Revisión del reporte estructurado** — la IA devuelve el JSON de `AI_PROMPTS.md`
   (Nivel 1) en campos editables: alimentación, medicación, signos vitales, estado de ánimo,
   incidentes, observaciones. El Asistente corrige antes de confirmar — **nunca guardar sin
   este paso** (regla ya fijada en `AI_PROMPTS.md`).
3. **Foto opcional** — cámara → sube a Supabase Storage, referencia en `reportes.foto_url`.
4. **Confirmar y enviar** — persiste el reporte, hace el check-out (lat/lng/timestamp),
   notifica push al Cliente, guardia pasa a `completada`.

### El micrófono — cómo quedó construido

**Lo dicta el propio teléfono.** Se usa el reconocimiento de voz que ya trae el navegador, que en
Android y en iPhone es el mismo que usa el teclado. **El audio no viaja hasta ningún servidor del
producto, no se graba ningún archivo y no hace falta ninguna credencial nueva.** Lo que se dice
adentro de la casa de una persona no sale de ahí, y no hubo que elegir proveedor de transcripción
ni sumarle un costo por minuto a la Prestadora.

**Donde el navegador no lo tiene, el botón no se dibuja.** No aparece apagado ni con una
explicación: la caja de texto sigue estando y quien quiera dictar tiene el micrófono de su propio
teclado. Nada de lo que se podía hacer deja de poderse.

**Lo dictado cae en la misma caja donde se escribe a mano**, no en una ventana aparte con su
propia confirmación. El dictado es otra forma de escribir: lo que el teléfono entendió mal se
corrige ahí mismo antes de mandarlo, y lo que ya venía escrito no se pisa —el texto nuevo se suma
al final.

**Está en las tres cajas largas**: el relato libre y, en la revisión, incidentes y observaciones.
Las dos últimas importan sobre todo cuando la Prestadora no usa la ayuda para redactar, porque
entonces son las únicas donde hay algo que contar.

**Sigue escuchando entre frase y frase**, y muestra aparte lo que va oyendo antes de darlo por
firme. Quien cuenta cómo pasó el día hace pausas; cortar en la primera obligaría a apretar el
botón diez veces. Lo provisorio se muestra y no se guarda.

**Y se apaga solo al salir de la pantalla.** Un teléfono escuchando adentro de la casa de otra
persona no queda encendido porque se tocó «volver».

### Perfil
Foto, datos personales, tipo de vínculo, matrícula, la carpeta de papeles con el Certificado de
Aptitud, y el historial de evaluaciones recibidas.

**La carpeta de papeles se mira, no se carga.** Los papeles del Asistente los recibe la Prestadora
y los carga ella desde el Panel; el teléfono los muestra para que la persona sepa qué tiene, qué
está por vencerse y qué le falta. Al pie lo dice con todas las letras, para que nadie espere un
botón de subir que no está.

**Acá sí va el nombre de cada papel, y eso la diferencia de lo que ve el Cliente.** Al Cliente se
le dan cuentas y nunca el nombre de un papel, porque el nombre puede ser dato de salud. El dueño de
la carpeta es otra cosa: si no se le dice cuál le falta, no sabe qué ir a buscar.

**Lo exigido y nunca cargado aparece igual**, como un renglón más de la lista. Una lista armada
desde lo que está cargado dejaría afuera justo lo que más importa ver, y se vería toda en verde.
La lista va ordenada por gravedad —vencido, sin cargar, falta la fecha, por vencer, vigente—, así
lo que hay que resolver queda arriba sin tener que buscarlo.

**El resumen es el mismo que ve el otro lado del producto.** Lo calcula la misma función que
alimenta al Panel de la Prestadora y al Cliente, con la ventana de preaviso que configuró esa
Prestadora. Si cada pantalla contara por su cuenta, el teléfono diría «al día» y el Panel «falta un
papel», cada uno con razón según su propia cuenta.

**El Certificado de Aptitud se muestra con su estado y su fecha de emisión.** No tenerlo no es
tenerlo vencido, y se dice distinto. La baja que le da la Prestadora gana sobre el calendario: un
certificado dado de baja aparece así aunque la fecha no haya llegado.

## Alertas tempranas de ausencia

Dos reglas de fondo:

1. **Detección automática de ausencia** — la ausencia se marca sola cuando no se registra el
   check-in dentro del margen que configura cada Prestadora después del inicio de la guardia
   (`configuracion_ausencia_automatica`): un trabajo programado la revisa cada cinco minutos,
   marca la guardia ausente y abre el incidente (`backend/src/utils/ausenciaAutomatica.js`). El
   botón manual ("marcar ausente") queda como excepción para casos que el sistema no detectó
   solo, no como el mecanismo principal.
2. **Cadena de alertas tempranas, previa a que la ausencia se concrete** — para gestionar un
   relevo con tiempo y minimizar el impacto en el Paciente, en vez de reaccionar recién cuando
   la ausencia ya es un hecho. Las fuentes de alerta son **enchufables**, no una lista cerrada
   de casos: cada alerta queda en `alertas_tempranas_guardia` con su fuente, y las fuentes viven
   en un solo lugar (`backend/src/utils/fuentesAlertaTemprana.js`). Hoy son cuatro:
   - **Aviso telefónico previo**: el Coordinador registra que el Asistente llamó avisando que no
     va a concurrir, con el motivo elegido de una lista (`motivos_aviso_previo_guardia`) y no
     texto libre; la IA sugiere el motivo a partir de lo que se anotó
     (`backend/src/utils/motivoSugeridoDelAviso.js`).
   - **Aviso de demora del propio Asistente**, desde su aplicación.
   - **Llegada tardía calculada** y **sin aviso ni salida**: las detecta solas
     `backend/src/utils/revisarLlegadasDemoradas.js` a partir de la salida marcada y del tiempo
     de viaje estimado.

   Ante cualquier alerta temprana, el Coordinador recibe la notificación y se le insiste según la
   premura, con un coordinador de respaldo si no responde, todo configurable por Prestadora
   (`backend/src/utils/revisarNotificacionesCoordinador.js`, `configuracion_escalada_coordinador`).
   Intervención humana minimizada al máximo, no eliminada: el Coordinador siempre puede
   intervenir en la resolución.

   **Falta** el seguimiento por GPS de que el Asistente sigue en su domicilio y el medio de
   transporte habitual de cada Asistente hacia cada Paciente: hoy el tiempo de viaje se estima
   con una velocidad media única y en línea recta. Son decisiones abiertas del paso 74 de
   `docs/PLAN_HASTA_PRODUCCION.md`.

### Notificaciones
Nueva guardia asignada, mensajes del coordinador, recordatorios.

## PWA del Cliente

### Login
Igual que en la PWA de Asistentes de arriba: usuario y contraseña, con la opción del acceso
guardado (huella o rostro vía WebAuthn, si el dispositivo lo permite). Sesión persistente.

### Pacientes
Un solo paciente → va directo a su pantalla. Varios → lista con estado actual de cada uno.

### Pantalla del Paciente
Guardia actual: si hay una activa, muestra Asistente + mapa con ubicación en tiempo real
(Supabase Realtime); si no, próxima guardia programada. Botón "Ver al Asistente en el mapa".
Alertas activas (ROJA/AMARILLA) con descripción.

### Reportes
Lista por fecha (más reciente primero) — fecha, Asistente, resumen breve. Al abrir: campos
estructurados completos + foto si la hay.

### Asistente Asignado
Foto, nombre, especialidades y el Certificado de Aptitud con su estado y su fecha: que esté
cargado en el perfil es prueba suficiente, sin certificado impreso ni código para escanear.
Evaluaciones anteriores con este Cliente. Botón de contacto (WhatsApp o chat
interno).

### Alertas
Lista de alertas del paciente (activas + historial resuelto), descripción generada por IA,
reportes que la originaron (con links), y al pie el botón para hablar con la Prestadora.

**El botón no lleva a una persona, lleva a la Prestadora.** En prestación directa el Cliente
contrató a la Prestadora, no a un Coordinador: el teléfono personal de quien coordina ese día es
el dato de contacto de alguien que trabaja ahí, y además rota. Lo que se ofrece son los canales
que la propia Prestadora cargó en Configuración › La Prestadora —teléfono, WhatsApp y correo—, y
dónde suenan lo decide ella. El teléfono o el correo de un Asistente no aparece acá nunca: cómo
llegar a un Asistente del Padrón es lo que la modalidad Match abre a pedido y con el contacto
tapado hasta entonces.

**Sin ningún canal cargado no hay botón.** Uno que no lleva a ningún lado hace creer que del otro
lado hay alguien esperando. Y por la dirección no viaja nada escrito: ni el nombre del Paciente,
ni la alerta, ni su nivel. Quien llama cuenta lo que quiere contar.

## Lógica de alertas IA Nivel 2

Ver `AI_PROMPTS.md` para el prompt de sistema exacto y las reglas de persistencia/
notificación — no repetir acá para que no diverjan las dos fuentes.

## Informe para Obra Social

Se construye exclusivamente en el Panel de Administración (no en esta PWA, el Cliente no
participa del proceso ni accede al informe). Es un informe virtual dentro del Panel, con impresión vía `window.print()` +
`@media print` — sin librería de PDF y sin asumir una única obra social: cada Paciente
registra la suya como una Ficha del Directorio de Personas (`pacientes.obra_social_persona_id`)
y su `numero_afiliado`.

**Planilla de asistencia**: nombre del Paciente, obra social y número de afiliado, mes de
prestación, nombre del Asistente por guardia, campo de firma del Asistente, campo de firma
del afiliado/familiar (manual — firma digital queda para una etapa futura, no implementada).

**Resumen mensual**: consolidado de guardias del período, totales agrupados por el valor
real de `guardias.modalidad` que la Prestadora haya usado — sin catálogo cerrado de códigos
(S4/F6/etc.), decisión explícita para no hardcodear una convención de una obra social en
particular («Nunca hardcodear», en «Las reglas de desarrollo» de `celtatech/CLAUDE.md`).

El informe solo puede guardarse/imprimirse después de que un usuario de la Prestadora con el
permiso `validar_informe_obra_social` (backend de `permisos_prestadora`) lo valide. Al validar,
queda congelado como snapshot inmutable en `informes_obra_social.contenido` (JSONB) — nunca
se edita después; solo se anula (con motivo y auditoría) y se genera uno nuevo. Ver
`backend/src/routes/panelInformesObraSocial.js` y `panel/src/pages/InformesObraSocial.jsx`.

## Datos y RLS

Tablas `usuarios`, `asistentes`, `clientes`, `pacientes`, `guardias`, `reportes`, `alertas`,
`certificados`, con su esquema y sus políticas RLS en la base en vivo — no reproducir el SQL acá, esta PWA solo lee/escribe esas tablas ya definidas.
