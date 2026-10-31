# Legislación — Unión Europea

Este documento cita, con artículo, las normas de la Unión Europea que alcanzan a Careonys en
cualquier país miembro —el Reglamento General de Protección de Datos, la Directiva NIS2, el Espacio
Europeo de Datos Sanitarios y el Reglamento de Inteligencia Artificial— y dice para cada una en qué
estado está el sistema. Lo particular de cada país miembro está en su propio archivo de
`docs/legal/`. Los tres estados posibles («Cumple», «En obra», «No alcanza») y qué significa cada
uno están explicados en la introducción de `docs/CUMPLIMIENTO_NORMATIVO.md`.

## Reglamento General de Protección de Datos — 2016/679

| Artículo | Qué exige | Estado |
|---|---|---|
| **9(1) y 9(2)(h)** | Los datos de salud están prohibidos salvo excepción; la de asistencia sanitaria exige además el art. 9(3) | **Cumple** la estructura de consentimiento con texto versionado. **En obra** el secreto profesional del art. 9(3) — paso 125 |
| **28(3)** | Contrato con el encargado, con contenido obligatorio | Es del contrato entre CeltaTech y el Cliente |
| **28(3)(f)** | El encargado asiste al responsable en la evaluación de impacto | **En obra** — paso 129 |
| **28(10)** | Si el encargado determina fines propios, pasa a ser responsable | **Cumple**: no se entrenan modelos con datos de los Clientes — paso 130 |
| **30(2)** | Registro de actividades del encargado. La exención del 30(5) no aplica porque se tratan datos del art. 9 | **En obra** — paso 129 |
| **32(1)(b)** | Confidencialidad, integridad, disponibilidad y resiliencia permanentes | **En obra** — sección «Los cimientos» de `docs/PLAN_HASTA_PRODUCCION.md` |
| **32(1)(d)** | **Verificar periódicamente la eficacia** de las medidas | **En obra** — paso 129. Es lo que convierte la prueba de aislamiento en obligación legal |
| **33(2)** | El encargado avisa al responsable sin dilación indebida, **sin umbral** | **En obra** — paso 124 |
| **33(5)** | Documentar toda violación, se notifique o no | **En obra** — paso 124 |
| **34(3)(a)** | El cifrado exime de comunicar a las personas, **nunca** de notificar a la autoridad | **En obra** — paso 13 |
| **35** | Evaluación de impacto obligatoria y **previa**: concurren el 35(3)(b) y cuatro criterios de la guía WP248 rev.01 contra un umbral de dos | **En obra** — paso 129 |
| **15, 16, 17, 20** | Acceso, rectificación, supresión y portabilidad | **En obra** — paso 123 |
| **17(3)** | El borrado es **por dato**, no por cuenta: «en la medida en que» | **En obra** — paso 122 |
| **9(4)** | Los plazos de conservación de datos de salud los fija la ley nacional | **En obra** — pasos 122 y 127 |
| **Capítulo V** | Transferencia internacional. Brasil no tiene decisión de adecuación | **Para la siguiente versión** — `docs/LEGAJO_PARA_EL_FUTURO.md`, «Más de una región» |

## Directiva NIS2 — 2022/2555

Aviso temprano a las **24 horas**, notificación a las 72 y informe final al mes. Es el reloj más
corto del conjunto y por eso el sistema se construye para 24 horas. **En obra** — paso 124.

## Espacio Europeo de Datos Sanitarios — 2025/327

No obliga todavía. Autocertificación desde el 26 de marzo de 2029 y ampliación en 2031, sin
organismo notificado. El art. 26(2) considera puesto en servicio el software ofrecido como servicio,
así que alcanzará al producto.

- **Anexo II sección 3** — cinco campos por evento de acceso. **En obra** — paso 9.
- **Art. 9** — el paciente puede saber quién accedió a lo suyo, con tres años de disponibilidad.
  **En obra** — paso 9.
- **Anexo II sección 2** — exportación en formato interoperable. **En obra** — paso 123.
- **Art. 54** — prohíbe el uso de los datos para entrenar modelos. **Cumple** — paso 130.

## Reglamento de Inteligencia Artificial — 2024/1689

- **Art. 50** — transparencia. **Rige desde el 2 de agosto de 2026**, sin aplazamiento.
- **Anexo III punto 4(b)** — alto riesgo: sistemas que asignan tareas según comportamiento o rasgos
  personales, o evalúan desempeño. Un emparejamiento o una planificación de Asistentes con
  puntuación cae acá. Rige desde el **2 de diciembre de 2027**, con autoevaluación. **En obra** —
  paso 130.
- **No es alto riesgo por la vía sanitaria** del Anexo III punto 5(a), que requiere que lo use una
  autoridad pública.
- **El Reglamento de ciberresiliencia (2024/2847) no alcanza al software como servicio**; entraría
  por la aplicación de teléfono y su servidor.
