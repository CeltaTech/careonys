# PRD_06 — WhatsApp Business (Meta) + agente de IA asistiendo

> ✅ **ESTADO: construido.** El backend y el Panel tienen la conexión con WhatsApp de cada
> Prestadora, las plantillas de mensaje con su trámite ante Meta, las notificaciones por evento,
> la insistencia al Coordinador y la respuesta automática a los mensajes que entran. La puerta
> por la que Meta deja los mensajes (`backend/src/routes/whatsappWebhook.js`) comprueba la firma
> de Meta con el secreto de la aplicación de cada Prestadora, y sin ese secreto no acepta nada.

## Por qué existe este documento

Fija cómo usa Careonys WhatsApp Business. La decisión de fondo es **no usar un
intermediario/BSP (Twilio, 360dialog, MessageBird)** — se integra directo contra la **Meta
Cloud API de WhatsApp Business**. La IA ayuda a redactar y corregir las plantillas; los mensajes
que entran los contesta una regla fija, sin IA (punto B).

## Decisiones ya tomadas (no rediscutir sin motivo nuevo)

1. **Integración directa con Meta Cloud API**, no con un BSP intermediario.
2. **El número de WhatsApp Business y la cuenta de Meta deben ser de cada
   Prestadora, nunca de CeltaTech como plataforma central.** Dos motivos,
   ambos explícitos del Desarrollador (2026-07-11):
   - Operativo: quien manda y recibe respuestas tiene que ser la propia prestadora, no un
     número compartido entre Prestadoras.
   - Legal: cualquier decisión tomada en esa conversación (con un suplente, un franquero, un
     familiar) es responsabilidad exclusiva de la prestadora — **CeltaTech no debe tener
     ninguna responsabilidad legal sobre el contenido de esas conversaciones**, consistente
     con su rol de licenciante de software, no de operador del servicio de cuidado.
   - Consecuencia técnica directa: credenciales de Meta (WABA ID, phone number ID, token de
     acceso) son un dato **por-`prestadora_id`**, nunca una credencial compartida a nivel de
     plataforma — mismo patrón multi-tenant que el resto del sistema, pero con una capa extra
     de cuidado por tratarse de credenciales de una cuenta externa de terceros con costo real
     asociado (las reglas de `celtatech/CLAUDE.md`, sección «Seguridad, privacidad y auditoría», aplican con el mismo peso que a datos sensibles).
   - **Costo del envío de mensajes lo paga la prestadora**, no CeltaTech como
     plataforma — cada Prestadora factura directo con Meta desde su propia cuenta.
3. **La configuración vive en el Panel, en Configuración → «Mensajes», en la tarjeta
   «Notificaciones»** (patrón evento → canal → destinatarios de `configuracion_notificaciones`)
   — no una sección nueva separada. Cada Prestadora define, por evento, si el aviso sale por
   WhatsApp o por mensaje de texto; si esas vías están apagadas o fallan, sale por correo
   (`notificarCoordinador`, en `backend/src/utils/whatsapp.js`).
4. **El agente de IA asiste, pero la decisión final siempre queda en manos de la
   Prestadora** — no actúa de forma autónoma en un canal con peso legal. El Desarrollador
   pidió expresamente (2026-07-11) que el agente ayude en las tres tareas siguientes,
   "salvaguardando siempre las decisiones del licenciatario/prestador de servicios":
   - Redactar/proponer el texto de las plantillas de mensaje.
   - Gestionar (o guiar paso a paso) el trámite de aprobación de esas plantillas ante Meta.
   - Las respuestas a las conversaciones entrantes (del suplente, franquero, personal de
     emergencia, familiar) no las da la IA: las da una regla fija con textos que la Prestadora
     aprobó (punto B).

## Puntos A-E — decididos 2026-07-13

Los cinco puntos que mantenían este documento "en discusión" ya tienen decisión explícita
del Desarrollador. Se conserva el planteo original de cada uno (para contexto) seguido de
la **decisión tomada**.

### A. Restricción de Meta sobre plantillas pre-aprobadas

Meta exige que cualquier mensaje que **inicia el negocio** (no una respuesta dentro de las
24hs de que la otra persona escribió primero) use una plantilla pre-aprobada por Meta — no
texto 100% libre generado en el momento. Un mensaje de escalada de relevo es, casi siempre,
un mensaje que inicia el negocio (nadie del lado del suplente/franquero escribió primero).

**Decisión (2026-07-13):**
- La IA arma el borrador de la plantilla (texto + variables); la Prestadora lo revisa/
  edita y confirma; recién ahí se envía a Meta para aprobación. Estado visible en el Panel
  (Configuración → «Mensajes» → «Plantillas de mensaje») por plantilla: Borrador → Enviada a
  Meta → Aprobada / Rechazada. Si Meta rechaza, la IA propone una corrección según el motivo del rechazo.
- **Si un evento todavía no tiene ninguna plantilla aprobada, el mensaje se manda por la vía
  siguiente que esté disponible (mensaje de texto o correo) y la responsabilidad de tomar
  acción pasa al Coordinador — el sistema y la IA tienen la responsabilidad de garantizar
  que ese mensaje efectivamente le llegue** (nunca queda silenciosamente sin canal ni sin
  avisar a nadie mientras se espera la aprobación de Meta).
- Variables de cada plantilla (nombre del Asistente ausente, Paciente, horario, nivel de
  escalada) se mapean a los parámetros que Meta permite dentro de una plantilla aprobada —
  detalle de implementación, no bloquea el diseño.

### B. Alcance exacto y límites de autonomía del agente de IA

El Desarrollador pidió las tres tareas (redacción, trámite de aprobación, participación en
respuestas entrantes) "y cualquier otra en la que pueda colaborar" — alcance deliberadamente
abierto, pero eso es justamente lo que había que acotar antes de construir algo.

**Decisión:** ningún mensaje entrante queda sin atender, y la IA no contesta. Contesta una
regla fija (`backend/src/utils/respuestaAutomaticaWhatsapp.js`) que manda, letra por letra, sólo
los textos que la Prestadora escribió y aprobó en el Panel, en Configuración → «Mensajes» →
«Respuestas preparadas», y nunca redacta. Lo que toca la salud, quien pide hablar con una persona,
la conversación que ya atiende una persona y el mensaje sin respuesta aprobada pasan a una
persona; una emergencia, además, se avisa al servicio de emergencias de esa jurisdicción. Ante la
duda no contesta y deriva. La pieza que le pedía a la IA proponer respuestas está en el estante,
en `celtatech/Codigos-utiles/respuestas-de-whatsapp-propuestas-por-ia/`.

### C. Almacenamiento de credenciales de Meta por prestadora

Token de acceso, WABA ID y phone number ID de cada prestadora son credenciales de una cuenta
externa con costo real y capacidad de enviar mensajes en su nombre — de sensibilidad
comparable a una clave de API de pago.

**Decisión (2026-07-13): Supabase Vault** (el mecanismo de secretos cifrados ya integrado en
Supabase, en vez de una tabla propia con cifrado manual o un servicio externo nuevo) — un
secreto de Vault por prestadora. El Panel nunca muestra el valor real una vez guardado (solo
"configurado ✓" / botón "reemplazar", como un campo de contraseña). Solo el backend puede
pedir el valor descifrado, y solo en el momento de mandar un mensaje — **ni siquiera
`superadmin` puede leerlo en texto plano desde el Panel**, mismo criterio que sueldos/
certificados médicos (`celtatech/CLAUDE.md`, sección «Seguridad, privacidad y auditoría»). Acceso para cargar/reemplazar el secreto
acotado a `admin_prestadora` de esa prestadora únicamente.

### D. Catálogo inicial de eventos con WhatsApp saliente

El primer evento con lógica de negocio que dispara un mensaje es la escalada de relevo
(`configuracion_escalada_relevo`, que recorre `backend/src/utils/faseAutomaticaRelevo.js`).

**Decisión:** el catálogo de eventos vive en `backend/src/utils/catalogoAvisos.js` e incluye
la escalada de relevo y los **vencimientos de documentación** (`vencimiento_documento_asistente`,
que emite `revisarVencimientos` en `backend/src/utils/vencimientos.js` por `notificarCoordinador`).

### E. Insistencia si el Coordinador no responde a la notificación de una alerta temprana/incidente

El aviso previo de una ausencia y el incidente que abre la detección automática de ausencia le
llegan al Coordinador por `notificarCoordinador` (`backend/src/utils/whatsapp.js`): WhatsApp,
mensaje de texto o correo, en ese orden, según lo que la Prestadora encendió. Si no responde a
la primera notificación, recibe una insistencia, con estas condiciones del Desarrollador:

- **El intervalo de reintento es configurable por prestadora** — nunca un número fijo en el
  código (regla «Nunca hardcodear», `celtatech/CLAUDE.md`), consistente con el resto de `configuracion_escalada_relevo`.
- **El intervalo no es constante: se acorta a medida que se reduce el tiempo que falta para
  que la guardia quede sin Asistente cubriendo.** Es decir, la urgencia de la insistencia
  aumenta cuanto más cerca está el momento en que el Paciente queda sin cobertura, no es un
  simple "cada X minutos" parejo durante todo el proceso.

**Estructura en dos fases** (no reutiliza `configuracion_escalada_relevo`: son dos fases
secuenciales, no el mismo mecanismo):

1. **Fase de notificación/reacción humana:** se avisa al Coordinador (con la insistencia de
   intervalo variable descripta arriba) y se le da la oportunidad de resolver él mismo.
2. **Fase automática, opcional por prestadora:** si pasa el tiempo configurado y el
   Coordinador no reaccionó, **y solo si la prestadora activó esta opción**, recién ahí
   entran solas las fases ya previstas en `configuracion_escalada_relevo` (Suplente →
   Franquero → Personal de emergencia → Familiar). Si la prestadora no activó la
   automatización, el sistema no toma ninguna acción por su cuenta — queda todo en manos del
   Coordinador.

**Coordinador alternativo (backup):** cada prestadora
tiene que poder configurar, opcionalmente, un segundo Coordinador al que se le empiecen a
mandar las notificaciones si el primero no respondió dentro del plazo configurado — antes de
(o en paralelo a) que entre la fase automática del punto 2.

**Decisión sobre el orden:** el orden exacto entre "insistirle más al
Coordinador 1", "pasar al Coordinador 2" y "entrar en fase automática" **depende de la
premura de la situación** (cuánto tiempo falta para que el Paciente quede sin cobertura), y
ese criterio de premura es a su vez **configurable por prestadora** — no un orden fijo igual
para todas.

**Cómo quedó implementado.** La premura es la cantidad de minutos que lleva el incidente sin
resolverse, y cada escalón tiene su propio umbral en `configuracion_escalada_coordinador`:
la insistencia arranca con el incidente y usa los tramos de `umbrales_premura`, el respaldo
entra en `minutos_antes_backup` y la búsqueda automática en `minutos_antes_fase_automatica`.
O sea que el orden no se elige de una lista: lo arman esos números, y una Prestadora que quiera
salir a buscar antes de pasar al respaldo sólo tiene que ponerle menos minutos. El backend no
recorre ninguna secuencia —cada escalón mira su umbral y marca su propia fecha, en
`backend/src/utils/revisarNotificacionesCoordinador.js`—, y el Panel muestra el orden
resultante mientras se configura (`panel/src/lib/ordenDeLaEscalada.js`).

**¿Es útil la IA en esta fase?** Recomendación de Claude Code, no una decisión tomada:
- **Sí, para redactar el contenido de la notificación con contexto útil** (no solo "hay un
  problema", sino algo como "Guardia de [Paciente] sin cobertura en 40 min, sin Asistente
  saliente, este Asistente ya avisó por temas de salud dos veces este mes"). Hoy la
  notificación no la redacta la IA: sale de los textos del sistema.
- **Sí, más adelante, para sugerir el mejor suplente disponible** en la fase automática en vez
  de seguir siempre el orden fijo de prioridad — pero esto depende de tener datos históricos
  suficientes.
- **No, para decidir si/cuándo pasar de una fase a la otra** (Coordinador 1 → Coordinador 2 →
  fase automática) — esto tiene que seguir siendo una regla determinística por tiempo, igual
  que ya hace `backend/src/utils/ausenciaAutomatica.js`, no un juicio de un modelo de IA: hay
  un Paciente que puede quedar solo de por medio, y cualquier reclamo futuro necesita poder
  explicarse con una regla clara de tiempo, no con "el modelo decidió esto en el momento".

## Cómo se relaciona con el resto del proyecto

- Configuración → «Mensajes» del Panel — este documento vive en sus tarjetas «Notificaciones»,
  «Plantillas de mensaje», «Respuestas preparadas» y «Escalada a Coordinador».
- Continuidad de guardia (`panel/src/pages/Continuidad.jsx`,
  `backend/src/utils/ausenciaAutomatica.js`) — el caso
  de uso principal que dispara el primer evento de WhatsApp saliente.
- `docs/PLAN_HASTA_PRODUCCION.md`, sección «Configuración que todavía está escrita en el
  código» — lo que falta parametrizar por Prestadora; este documento aplica ese mismo principio
  a un canal de mensajería.
- Este caso vive en la relación con el Asistente durante el trabajo, no en el reclutamiento ni
  en la relación con Clientes — las reglas de riesgo legal sobre subordinación
  (`celtatech/docs/REGLAS_PRODUCTOS_CAREONYS.md`, sección «Riesgo legal») aplican con todo su
  peso acá.
