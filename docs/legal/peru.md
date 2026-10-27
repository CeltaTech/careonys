# Legislación — Perú

## Protección de datos e historia clínica

Los estados —**Cumple**, **En obra** con su paso de `docs/PLAN_HASTA_PRODUCCION.md`, y **No
alcanza**— son los que define la introducción de `docs/CUMPLIMIENTO_NORMATIVO.md`. Cuando el
texto compara con «los diez países» o «los otros nueve», son los de Latinoamérica relevados en ese
documento.

### Las normas

- **Norma de datos.** Ley 29733 y **DS 016-2024-JUS, vigente desde el 30-03-2025**. Arts. 34, 37,
  46, 51, 52; 132-134.
- **Historia clínica.** NTS 139-MINSA/2018/DGAIN (RM 214-2018), que alcanza a los establecimientos
  **públicos, privados y mixtos** (numeral II); RENHICE (Ley 30024 y **DS 039-2015-SA**).
- **Conservación.** **20 años desde la última atención**: 5 de archivo activo + 15 de pasivo, y la
  propia norma hace la suma (5.3.1 num. 6 lit. e y num. 7 lit. f). **Cáncer ocupacional: 40 años**.
- **Brecha.** **48 horas**, a la autoridad **y al titular**.

### Consentimiento expreso para datos de salud

Perú está entre los países que exigen consentimiento expreso para datos de salud. **Cumple** la
estructura; **en obra** los textos por país — paso 127.

### Las obligaciones particulares

- **Perú: los ingresos económicos del Cliente de la Prestadora son dato sensible.** El art. 2.5 de
  la Ley 29733 pone «ingresos económicos» en la misma categoría que la salud. Es el único de los
  diez que lo hace, y significa que en Perú la facturación entra en la categoría más protegida:
  consentimiento **por escrito con firma** —manuscrita, digital o electrónica—, y las mismas
  medidas que el dato clínico. **En obra** — pasos 122, 125 y 127.
- **Perú: el registro de accesos se conserva dos años y tiene que estar disponible de inmediato.**
  El art. 46 del DS 016-2024-JUS lo dice con esa palabra, y enumera qué anotar: cuentas, hora de
  inicio y de fin de sesión, y las operaciones de tratamiento, **visualización**, modificación,
  eliminación, importación y exportación. Es la exigencia más precisa de los diez países y fija el
  piso del paso 9. El art. 51 agrega respaldos **semanales** con verificación de integridad, y el
  52 exige cifrado en toda transferencia externa. **En obra** — pasos 9, 13 y 126.
- **Perú exige representante en el país a quien opera desde afuera.** Art. VII del Título Preliminar
  del DS 016-2024-JUS. Es obligación de CeltaTech, no del producto, y es societaria: hay que
  resolverla antes de vender ahí. Ninguno de los otros nueve países la tiene. **No alcanza** — no
  es materia de este plan.

### Transferencia internacional

Perú es de los países que sí exigen la transferencia al entregarle los datos al encargado, con las
cláusulas del modelo de su autoridad.

### Registro de bases ante la autoridad

Perú inscribe todo banco de datos en el Registro Nacional, sin umbral y de forma gratuita.

### Integración nacional obligatoria

El RENHICE peruano es una integración nacional obligatoria que el plan no construye, y es obra
propia.

### Lo que no se verificó

- **Los valores de las unidades con que se calculan las multas** —UIT peruana— no se consultaron
  para 2026.

## Riesgo laboral — sin investigar todavía

> **Esta sección falta.** No se investigó todavía la legislación laboral de Perú. Mientras esta
> sección no tenga la tabla de advertencias completa, el sistema no muestra ninguna advertencia
> laboral para Prestadoras de esta jurisdicción. Es la regla del riesgo legal
> (`celtatech/docs/REGLAS_PRODUCTOS_CAREONYS.md`, sección «Riesgo legal», y `celtatech/CLAUDE.md`,
> sección «El riesgo legal»): «Si el país no tiene documento, no hay aviso.»

### Qué falta completar acá

Antes de dar de alta la primera Prestadora real de Perú, completar:

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
Perú (no Sandbox, no datos de prueba), esta sección deja de ser opcional — hay que
completarla antes de habilitar esa Prestadora, según la regla del riesgo legal
(`celtatech/docs/REGLAS_PRODUCTOS_CAREONYS.md`, sección «Riesgo legal», y `celtatech/CLAUDE.md`,
sección «El riesgo legal»): «Antes de vender en un país nuevo, ese país tiene que tener su
documento, aunque sea corto.»
