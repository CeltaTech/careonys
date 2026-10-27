# Legislación — Brasil

> **La sección «Riesgo laboral — sin investigar todavía» está vacía de contenido real:** no se
> investigó todavía la legislación laboral de Brasil. **Mientras esa sección no tenga la tabla de
> advertencias completa, el sistema no muestra ninguna advertencia laboral para Prestadoras de
> esta jurisdicción**: sin documento no hay aviso, y no se improvisa (`celtatech/CLAUDE.md`,
> sección «El riesgo legal», y `celtatech/docs/REGLAS_PRODUCTOS_CAREONYS.md`, sección «Riesgo
> legal»).
>
> La sección «Protección de datos e historia clínica» sí tiene contenido.

## Riesgo laboral — sin investigar todavía

### Qué falta completar acá

Antes de dar de alta la primera Prestadora real de Brasil, completar:

1. **Marco de referencia** — la norma laboral local equivalente al art. 23 de la LCT
   argentina (presunción de relación de dependencia laboral cuando hay prestación de
   servicios, salvo prueba en contrario), o el mecanismo legal que determine en esta
   jurisdicción cuándo una relación de prestación de servicios se reclasifica como relación
   de dependencia.
2. **Tabla de advertencias** (jurisdicción → función → texto), una fila por cada función de
   gestión de Asistentes que enumera `celtatech/docs/REGLAS_PRODUCTOS_CAREONYS.md`, sección
   «Riesgo legal»: penalización de inasistencias o inconductas, rankings, puntuaciones por
   aceptación de guardia, puntuaciones por calificación de Cliente/Paciente, límite de
   oportunidades futuras por rechazos, niveles/categorías/jerarquías por servicio, horarios
   fijos — y cualquier otra que se agregue después.
3. Idealmente, revisión de un abogado laboralista local antes de considerarlo definitivo —
   ver la misma salvedad en `docs/legal/argentina.md`.

### Disparador para completar esta sección

En el momento en que se detecte la primera Prestadora real con jurisdicción
Brasil (no Sandbox, no datos de prueba), esta sección deja de ser opcional — hay que
completarla antes de habilitar esa Prestadora: antes de vender en un país nuevo, ese país tiene
que tener su documento (`celtatech/CLAUDE.md`, sección «El riesgo legal»).

## Protección de datos e historia clínica

> Los estados —**Cumple**,
> **En obra** con su paso de `docs/PLAN_HASTA_PRODUCCION.md`, y **No alcanza**— significan lo que
> dice la introducción de `docs/CUMPLIMIENTO_NORMATIVO.md`. Lo que comparten los diez países
> relevados se queda allá.

### Las normas

- **Norma de datos:** LGPD 13.709/2018 — ANPD, hoy agencia reguladora por Lei 15.352/2026. Arts.
  5º II, 11, 42 §1º, 46, 48, 41. Res. CD/ANPD 15/2024 y 19/2024.
- **Historia clínica:** Res. CFM 1.821/2007; Lei 13.787/2018; Lei 14.510/2022; Res. CFM 2.314/2022;
  RDC ANVISA 11/2006.
- **Conservación:** **20 años desde el último registro, cualquier soporte** (Lei 13.787/2018 art.
  6º §5).
- **Brecha:** 3 días hábiles, a la autoridad y al titular.

### Lo que comparte con los otros nueve países

De las cinco exigencias que los diez comparten, listadas en `docs/CUMPLIMIENTO_NORMATIVO.md`,
Brasil figura en dos:

- **Consentimiento expreso para datos de salud** (LGPD art. 11). **Cumple** la estructura; **en
  obra** los textos por país — paso 127.
- **Corrección por nota aclaratoria, nunca por sobreescritura.** **Cumple** en `indicaciones_medicacion`, `rangos_referencia_vitales` y
  `domicilios_temporales_paciente`: cada corrección deja su versión con nota aclaratoria, y nadie
  la edita ni la borra. Lo corregido desde el Panel todavía queda sin autor — **en obra**, paso 9.

### Las obligaciones particulares

- **Brasil, art. 11 §4º de la LGPD.** Prohíbe compartir datos de salud con fines de ventaja
  económica. Cierra cualquier monetización, incluso agregada. **Cumple** — paso 130.
- **Brasil, art. 42 §1º I de la LGPD.** Quien trata datos por cuenta de otro responde
  **solidariamente y queda equiparado al responsable** cuando incumple la ley o se aparta de las
  instrucciones recibidas. Un aislamiento que falle es exactamente ese supuesto, y abre el catálogo
  entero del art. 52: multa, suspensión de la base hasta seis meses y prohibición de tratar. Es, con
  el art. 11(4) argentino, la razón legal del aislamiento entre Organizaciones. **En obra** — sección «Los cimientos»
  de `docs/PLAN_HASTA_PRODUCCION.md`.

### Transferencia internacional

Brasil exige instrumento de transferencia aun para entregarle los datos al encargado, con las
cláusulas del modelo de su autoridad, igual que Argentina y Perú. **En obra** — pasos 5 y 127.

**Para Brasil, estar en São Paulo no es un problema: es la solución.** Un dato brasileño alojado en
Brasil no es transferencia y no necesita instrumento alguno. Lo que sí hay que mirar es que las
cláusulas-patrón del Anexo II de la Resolución CD/ANPD 19/2024 se adoptan **íntegras y sin
modificar** —cualquier cambio las invalida— y que el plazo para adaptar contratos anteriores venció
el 23 de agosto de 2025. Brasil reconoció adecuada únicamente a la Unión Europea, por Resolución
CD/ANPD 32/2026. Estados Unidos no está en ninguna de las dos listas, ni la brasileña ni la
argentina.

### Registro de bases ante la autoridad

Brasil no tiene registro de bases.

### Lo que no se verificó

- **Si el proveedor de nube en Brasil cuenta como «agente de tratamento brasileiro»** a los efectos
  del art. 4º IV de la LGPD, y si Argentina «proporciona grado de protección adecuado» a esos mismos
  efectos. De esas dos respuestas depende que los datos de una Prestadora argentina alojados en São
  Paulo queden o no fuera de la ley brasileña. Son preguntas para abogado brasileño.
- **Ninguna resolución de la autoridad brasileña se pudo comprobar contra el diario oficial**, que
  estuvo caído; se leyeron de copias de terceros. Tampoco se leyó el manual de certificación SBIS
  ni las portarias de consolidación del sistema público brasileño, y **las normas de la agencia de
  planes de salud brasileña no se relevaron**.
