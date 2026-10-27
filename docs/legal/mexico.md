# Legislación — México

## Protección de datos e historia clínica

Los estados —**Cumple**, **En obra** con su paso de `docs/PLAN_HASTA_PRODUCCION.md`, y **No
alcanza**— son los que define la introducción de `docs/CUMPLIMIENTO_NORMATIVO.md`. Cuando el
texto compara con «los diez países», son los diez de Latinoamérica relevados en ese documento.

### Las normas

- **Norma de datos.** LFPDPPP de 2025, vigente desde el 21-03-2025, que abrogó la de 2010; el
  reglamento de 2011 sigue en pie y nadie lo reemplazó. Arts. 2, 7, 8, 9, 18, 19, 20, 35, 36;
  reglamento arts. 2, 4, 50-55, 57-66, 67-76. Autoridad: **Secretaría Anticorrupción y Buen
  Gobierno**, por su Dirección General de Datos Personales en el Sector Privado.
- **Historia clínica.** NOM-004-SSA3-2012 num. 5.4, 5.10 y 5.12; **NOM-024-SSA3-2012**, que obliga
  también al desarrollador; Ley General de Salud, Capítulo VI BIS de salud digital, vigente desde
  el 16-01-2026.
- **Conservación.** **5 años desde la fecha del último acto médico** (NOM-004 num. 5.4). Es un piso
  de guarda: cumplido, **la norma no autoriza borrar**.
- **Brecha.** **De inmediato, sólo al titular** (ley art. 19). No hay plazo en horas y **no se
  notifica a la autoridad**.

### Las obligaciones particulares

- **México: la norma de la historia clínica electrónica obliga al que hace el software, no sólo al
  que lo usa.** El numeral 1.2 de la NOM-024-SSA3-2012 alcanza a «las personas físicas o morales
  que tengan los derechos de propiedad, uso, autoría, distribución y comercialización» del sistema.
  Es el único de los diez países donde CeltaTech es destinataria directa de una norma sanitaria, y
  lo que exige es sustantivo: sistema de gestión de seguridad de la información (6.6.1), documentos
  inalterables (6.6.2), **firma electrónica avanzada con no repudio** (6.6.3 a 6.6.6),
  **intercambio en HL7 CDA / HL7 V3 / XML** (6.1.3.1), catálogos obligatorios con **CIE-10** (6.4.2
  y Apéndice A) y **certificación ante la DGIS** (capítulo 7), que sigue operativa. **No alcanza** —
  es obra propia, y tiene que estar antes de vender en México. Y hay una modificación en curso,
  todavía sin publicar, cuyo sentido declarado es apretar sobre el envío de información a la DGIS.
- **México: mandar los datos a São Paulo no es transferencia, es remisión.** El art. 53 del
  Reglamento: «Las remisiones nacionales e internacionales de datos personales entre un responsable
  y un encargado **no requerirán ser informadas al titular ni contar con su consentimiento**». La
  exclusión no depende de que el reglamento de 2011 siga vigente, porque la propia ley de 2025 la
  ancla en tres lugares (arts. 2 fracc. XII, 2 fracc. XX y 35). México tampoco tiene lista de países
  adecuados —evalúa la relación contractual, no el país (reglamento arts. 74 y 75)—, ni obligación
  de alojar en el país, ni registro de bases, ni representante local. **Pero el art. 53 fracc. I
  convierte automáticamente al encargado en responsable si usa los datos para una finalidad
  propia**: entrenar modelos o hacer estadística comercial con ellos sería exactamente eso.
- **México: el consentimiento para datos de salud tiene que ser expreso y por escrito.** El art. 8
  de la ley no admite el consentimiento tácito, y acepta firma autógrafa, firma electrónica o
  cualquier mecanismo de autenticación; **la carga de probarlo es del responsable** (reglamento art.
  20). Los datos patrimoniales no son sensibles, pero también exigen consentimiento expreso (art. 7,
  párrafo quinto). La excepción sanitaria del art. 9 fracc. VI **no sirve como base de operación**:
  tiene dos candados que se acumulan —sólo mientras el titular esté impedido de consentir, y sólo
  por persona sujeta a secreto—. **En obra** — paso 127.

### Transferencia internacional

México es uno de los cuatro países que dicen que entregarle los datos al encargado no es
transferencia. Lo llama **remisión** y no transferencia. El art. 53 del Reglamento la exime
de consentimiento y de aviso al titular, y la ley de 2025 ancla la exclusión en los arts. 2 fracc.
XII, 2 fracc. XX y 35. Lo que sí hace falta es el contrato del art. 52 del Reglamento, que es la
norma de cabecera del cómputo en la nube, y la autorización de subcontratación de los arts. 54 y
55 —que puede darse anticipada en el propio contrato, y si el contrato calla hay que pedirla caso
por caso, con la carga de acreditarla sobre el encargado—.

**Y una advertencia que vale para los países que no llaman transferencia al encargo:** que no
haya que firmar cláusulas de transferencia no alivia nada. El contrato de encargo sigue siendo
obligatorio, con contenido mínimo, y las medidas de seguridad son las mismas. Lo único que
desaparece es un trámite.

### Registro de bases ante la autoridad

México no tiene registro.

### Integración nacional obligatoria

La certificación NOM-024-SSA3-2012 mexicana es del producto y hay que obtenerla antes de vender en
México. Es obra propia, que el plan no construye.

### Lo que no se verificó

- **Dos leyes mexicanas quedaron sin leer en su texto.** El art. 4 de la LFPDPPP, porque las fuentes
  discrepan sobre una reforma de noviembre de 2025 con entrada en vigor diferida; y el art. 52 del
  Reglamento, que es la norma de cabecera del contrato de cómputo en la nube y **sólo se leyó
  parafraseado**. Hay que leerlo literal antes de redactar ninguna cláusula. Además, **nadie abrogó
  ni confirmó el Reglamento de 2011**: que siga rigiendo «en lo que no se oponga» es inferencia, no
  texto leído, y sus remisiones internas quedaron corridas un número.
- **La autoridad mexicana está a medio armar.** No hay formulario ni trámite publicado para ejercer
  derechos contra un particular, ni resoluciones del sector privado publicadas, así que hoy **no hay
  dirección de trámite verificable que citar en un aviso de privacidad mexicano**. Y los
  Lineamientos del Aviso de Privacidad de 2013 perdieron su base legal: los firmó una Secretaría que
  la ley nueva no menciona ni una vez. El contenido mínimo del aviso se toma del art. 15 de la ley.

## Riesgo laboral — sin investigar todavía

> **Esta sección falta.** No se investigó todavía la legislación laboral de México. Mientras esta
> sección no tenga la tabla de advertencias completa, el sistema no muestra ninguna advertencia
> laboral para Prestadoras de esta jurisdicción. Es la regla del riesgo legal
> (`celtatech/docs/REGLAS_PRODUCTOS_CAREONYS.md`, sección «Riesgo legal», y `celtatech/CLAUDE.md`,
> sección «El riesgo legal»): «Si el país no tiene documento, no hay aviso.»

### Qué falta completar acá

Antes de dar de alta la primera Prestadora real de México, completar:

1. **Marco de referencia** — la norma laboral local equivalente al art. 23 de la LCT
   argentina (presunción de relación de dependencia laboral cuando hay prestación de
   servicios, salvo prueba en contrario), o el mecanismo legal que determine en esta
   jurisdicción cuándo una relación de prestación de servicios se reclasifica como relación
   de dependencia.
2. **Tabla de advertencias** (jurisdicción → función → texto), una fila por cada función de
   gestión de Asistentes de `celtatech/docs/REGLAS_PRODUCTOS_CAREONYS.md`, sección «Riesgo
   legal»: penalización de inasistencias o inconductas, rankings, puntuaciones por aceptación de
   guardia, puntuaciones por calificación de Cliente/Paciente, límite de oportunidades futuras
   por rechazos, niveles/categorías/jerarquías por servicio, horarios fijos — y cualquier otra
   que se agregue después.
3. Idealmente, revisión de un abogado laboralista local antes de considerarlo definitivo —
   ver la misma salvedad en `docs/legal/argentina.md`.

### Disparador para completar esta sección

En el momento en que se detecte la primera Prestadora real con jurisdicción
México (no Sandbox, no datos de prueba), esta sección deja de ser opcional — hay que
completarla antes de habilitar esa Prestadora, según la regla del riesgo legal
(`celtatech/docs/REGLAS_PRODUCTOS_CAREONYS.md`, sección «Riesgo legal», y `celtatech/CLAUDE.md`,
sección «El riesgo legal»): «Antes de vender en un país nuevo, ese país tiene que tener su
documento, aunque sea corto.»
