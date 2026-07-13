# PRD_06 — WhatsApp Business (Meta) + agente de IA asistiendo

> ⚠️ **ESTADO: EN DISCUSIÓN — NO IMPLEMENTAR TODAVÍA.** Este documento registra el diseño tal
> como se fue acordando en la conversación del 2026-07-11, pero varios puntos centrales
> (alcance exacto del agente de IA, mecanismo de aprobación de plantillas ante Meta,
> almacenamiento de credenciales) siguen abiertos y necesitan más discusión y decisión
> explícita del Desarrollador antes de que Claude Code escriba una sola línea de código. No
> asumir que lo escrito acá es un plan cerrado — es el punto de partida de la discusión, no
> el final. Ver pendiente #9 de `docs/PENDIENTES.md`, que remite acá.

## Por qué existe este documento

Cierra (cuando se apruebe) el pendiente #9: "proveedor de WhatsApp Business API, o decisión
explícita de posponer la mensajería automática". La decisión de fondo ya tomada es **no usar
un intermediario/BSP (Twilio, 360dialog, MessageBird)** — se integra directo contra la **Meta
Cloud API de WhatsApp Business**, con un agente de IA ayudando en el proceso. Comparación de
proveedores considerada y descartada: ver el intercambio del 2026-07-11 (no repetido acá,
consultar el historial de la conversación si hace falta el detalle de precios/tradeoffs).

## Decisiones ya tomadas (no rediscutir sin motivo nuevo)

1. **Integración directa con Meta Cloud API**, no con un BSP intermediario.
2. **El número de WhatsApp Business y la cuenta de Meta deben ser de cada prestadora
   licenciataria, nunca de PLM Systems ni de prestadora-original como plataforma central.** Dos motivos,
   ambos explícitos del Desarrollador (2026-07-11):
   - Operativo: quien manda y recibe respuestas tiene que ser la propia prestadora, no un
     número compartido entre licenciatarias.
   - Legal: cualquier decisión tomada en esa conversación (con un suplente, un franquero, un
     familiar) es responsabilidad exclusiva de la prestadora — **PLM Systems no debe tener
     ninguna responsabilidad legal sobre el contenido de esas conversaciones**, consistente
     con su rol de licenciante de software, no de operador del servicio de cuidado.
   - Consecuencia técnica directa: credenciales de Meta (WABA ID, phone number ID, token de
     acceso) son un dato **por-`prestadora_id`**, nunca una credencial compartida a nivel de
     plataforma — mismo patrón multi-tenant que el resto del sistema, pero con una capa extra
     de cuidado por tratarse de credenciales de una cuenta externa de terceros con costo real
     asociado (Regla 7/8 de `CLAUDE.md` aplican con el mismo peso que a datos sensibles).
   - **Costo del envío de mensajes lo paga la prestadora**, no PLM Systems ni prestadora-original como
     plataforma — cada licenciataria factura directo con Meta desde su propia cuenta.
3. **La configuración vive dentro de la pestaña "Servicios" del Módulo 8 (Configuración),
   extendiendo la tabla/pestaña "Notificaciones" ya existente** (patrón evento → canal →
   destinatarios que ya usa `configuracion_notificaciones` para email) — no una sección nueva
   separada. Cada prestadora define, por evento, si además de (o en vez de) email quiere
   WhatsApp saliente.
4. **El agente de IA asiste, pero la decisión final siempre queda en manos del
   licenciatario** — no actúa de forma autónoma en un canal con peso legal. El Desarrollador
   pidió expresamente (2026-07-11) que el agente ayude en las tres tareas siguientes,
   "salvaguardando siempre las decisiones del licenciatario/prestador de servicios":
   - Redactar/proponer el texto de las plantillas de mensaje.
   - Gestionar (o guiar paso a paso) el trámite de aprobación de esas plantillas ante Meta.
   - Participar en las respuestas de conversaciones entrantes (del suplente, franquero,
     personal de emergencia, familiar) — siempre con el licenciatario en control de qué se
     manda finalmente.

## Puntos todavía sin resolver — necesitan discusión antes de diseñar la implementación

Esta es la parte central de por qué el documento está marcado "en discusión". Ninguno de
estos puntos tiene todavía un cierre real:

### A. Restricción de Meta sobre plantillas pre-aprobadas

Meta exige que cualquier mensaje que **inicia el negocio** (no una respuesta dentro de las
24hs de que la otra persona escribió primero) use una plantilla pre-aprobada por Meta — no
texto 100% libre generado en el momento. Un mensaje de escalada de relevo es, casi siempre,
un mensaje que inicia el negocio (nadie del lado del suplente/franquero escribió primero).
Falta decidir en detalle:
- Cómo se integra el trámite de aprobación de Meta al flujo del Panel (¿el agente de IA
  arma el paquete y el licenciatario solo confirma? ¿hay un estado "pendiente de aprobación
  de Meta" visible en la pestaña Servicios?).
- Qué pasa mientras una plantilla nueva está en trámite de aprobación (¿se usa una plantilla
  genérica de respaldo? ¿se degrada a otro canal, como ya prevé el diseño de
  `configuracion_escalada_relevo` para cuando `personal_emergencia` está vacío,
  `docs/PRD_02_Panel_Admin.md:92-94`?).
- Qué variables expone cada plantilla (nombre del Asistente ausente, Paciente, horario,
  nivel de escalada) y cómo se mapean a los parámetros que Meta permite dentro de una
  plantilla aprobada.

### B. Alcance exacto y límites de autonomía del agente de IA

El Desarrollador pidió las tres tareas (redacción, trámite de aprobación, participación en
respuestas entrantes) "y cualquier otra en la que pueda colaborar" — alcance deliberadamente
abierto, pero eso es justamente lo que hay que acotar antes de construir algo. Falta definir,
como mínimo:
- Para la participación en respuestas entrantes: ¿el agente redacta una respuesta sugerida
  que el licenciatario aprueba/edita antes de mandar (como un borrador), o puede responder
  sin intervención humana en algunos casos (¿cuáles?) y no en otros?
- Qué pasa si el agente no tiene claro qué responder — ¿escala a un humano siempre, nunca
  decide "no sé" de forma silenciosa?
- Cómo queda registrado en el sistema qué fue obra del agente vs. qué escribió/aprobó una
  persona — por el mismo motivo por el que el reporte diario ya se documenta como "el
  instrumento de defensa más poderoso ante cualquier demanda" (ver
  `docs/Investigacion_Competencia Match.md:10-12`): una conversación de WhatsApp real,
  con terceros, en un contexto de guardias de cuidado domiciliario, tiene el mismo peso de
  evidencia y el mismo riesgo si algo sale mal.
- Motor de IA a usar (¿mismo proveedor que Niveles 1-2, Anthropic/Claude, ya documentado en
  `docs/CONTEXT.md:158`? ¿o algo específico para manejo de conversación en tiempo real?).

### C. Almacenamiento de credenciales de Meta por prestadora

Token de acceso, WABA ID y phone number ID de cada prestadora son credenciales de una cuenta
externa con costo real y capacidad de enviar mensajes en su nombre — de sensibilidad
comparable a una clave de API de pago. Falta decidir:
- Dónde se guardan (¿tabla nueva `configuracion_whatsapp_prestadora` con columnas cifradas?
  ¿un secreto gestionado fuera de la base, tipo vault?).
- Quién puede verlas/editarlas en el Panel (¿solo `admin_prestadora`? ¿ni siquiera
  `superadmin` debería poder leer el token en texto plano una vez guardado, similar a cómo
  no se loguean sueldos ni certificados médicos, Regla 7 de `CLAUDE.md`?).
- Cómo se verifica que la cuenta de Meta ingresada es realmente de esa prestadora (¿algún
  paso de verificación, o se confía en que el propio licenciatario cargó su cuenta
  correctamente?).

### D. Catálogo inicial de eventos con WhatsApp saliente

Hoy el único evento con lógica de negocio real que podría disparar un mensaje es la escalada
de relevo (`configuracion_escalada_relevo`) — y la lógica de escalada en sí (Parte 2 de
Módulo 6) todavía no está construida, solo el CRUD de configuración (pendiente #8, ya
resuelto). Falta acordar si el catálogo de "circunstancias" arranca solo con ese evento, o si
se agregan otros ya en esta primera vuelta (ej. eventos de `configuracion_notificaciones`
que hoy son solo-email: vencimientos de documentación, alertas de Módulo 7, etc.).

## Qué NO se decide en este documento

- No se elige todavía el motor de IA específico para el agente conversacional (más allá de
  la referencia a Anthropic/Claude ya usada en Niveles 1-2).
- No se diseña la tabla de datos definitiva ni las rutas de backend — eso es trabajo de
  implementación, posterior a que se cierren los puntos A-D de arriba.
- No se estima costo ni estimación de tiempo — depende directamente de qué tan grande termine
  siendo el alcance del agente de IA (punto B).

## Cómo se relaciona con el resto del proyecto

- Pendiente #9 (`docs/PENDIENTES.md`) — remite acá para su cierre.
- Pestaña "Servicios" del Módulo 8, ya construida (pendiente #8, resuelto) — este documento
  extiende la pestaña "Notificaciones" del mismo módulo, no crea una pestaña nueva.
- `docs/PRD_02_Panel_Admin.md:91-94` (Continuidad de guardia, Parte 2 de Módulo 6) — el caso
  de uso principal que dispara el primer evento de WhatsApp saliente.
- Pendiente #16 (`docs/PENDIENTES.md`) — auditoría de qué otras políticas deberían
  parametrizarse por prestadora; este documento es un ejemplo puntual de ese mismo principio
  aplicado a un canal de mensajería.
- Memoria de sesión `project_ia_oportunidades` y `feedback_tres_relaciones_distintas` — este
  caso vive en la relación "Asistente durante el trabajo" (punto 2 de esa nota), no en
  reclutamiento ni en la relación con Clientes — las reglas de riesgo legal de `CLAUDE.md`
  sobre subordinación aplican con todo su peso acá.
