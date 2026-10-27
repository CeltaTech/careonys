# Legislación — Panamá

## Protección de datos e historia clínica

Los estados —**Cumple**, **En obra** con su paso de `docs/PLAN_HASTA_PRODUCCION.md`, y **No
alcanza**— son los que define la introducción de `docs/CUMPLIMIENTO_NORMATIVO.md`. Cuando el
texto compara con «los diez países», son los de Latinoamérica relevados en ese documento.

### Las normas

- **Norma de datos.** Ley 81 de 2019 —vigente desde el 29-03-2021— y Decreto 285 de 2021, **sin
  reformas ni reglamento posterior** — ANTAI, por su Dirección de Protección de Datos Personales.
  **Panamá no dice «encargado»: dice «custodio de la base de datos»** (Ley art. 4 num. 5). Arts. 4,
  7, 8, 13, 31, 47-50, 59; decreto arts. 8, 35, 36, 37, 38, 48, 53.
- **Historia clínica.** Ley 68 de 2003 **arts. 49 y 50**; telesalud Ley 203 de 2021, que impone
  **HL7 obligatorio**.
- **Conservación.** **20 años desde la muerte del paciente** (Ley 68 art. 49), y el mismo plazo
  para el núcleo documental tasado del art. 50. Lo que no sea relevante para la asistencia puede
  destruirse a los **2 años de la última atención**, y nada más.
- **Brecha.** **72 horas desde que se conoce el incidente**, a la autoridad **y a los titulares en
  el mismo acto**, sin umbral de riesgo y sin excepción por cifrado (decreto art. 37). El custodio
  avisa al responsable **«de manera inmediata»**.

### Lo que Panamá comparte con los demás países

- **Consentimiento expreso para datos de salud** (art. 8). **Cumple** la estructura; **en obra**
  los textos por país — paso 127.
- **Acceso limitado a lo necesario.** La norma panameña no dice «mínimo privilegio»: el art. 8 del
  Decreto 285 se titula **principio de proporcionalidad**, y su párrafo final impone tres límites
  que se acumulan — **quién** accede (sólo quien lo necesita para su función), **cuánta**
  información recibe y **por cuánto tiempo** conserva ese acceso. El tercero es el que casi
  siempre falta. Y el deber recae expresamente sobre el custodio, no sólo sobre la Prestadora.
  **En obra** — plan de aislamiento.
- **Registro de accesos con identidad y período de todas las personas que ingresaron** (Decreto
  285 art. 35 num. 12). La norma panameña pide sólo dos datos: quién ingresó y en qué período; no
  exige anotar la operación ni el registro tocado. Aun así conviene anotar la operación, porque el
  art. 38 obliga a documentar «los hechos y efectos» de toda violación y sin eso es imposible.
  **En obra** — paso 9. Hoy no se cumple: el registro anota escrituras, no lecturas.
- **Plazo de conservación y anonimización al vencer** (Decreto art. 7). **En obra** — paso 122.

### Las obligaciones particulares

- **Panamá castiga penalmente la falla de aislamiento.** La Ley 203 de 2021 reformó el art. 291 del
  Código Penal para agravar la intrusión contra bases de datos que contienen información médica. Es
  el único de los diez países donde el riesgo deja de ser administrativo. **En obra** — plan de
  aislamiento.
- **Panamá: para salud el consentimiento es «previo, irrefutable y expreso».** El párrafo final del
  art. 8 de la Ley 81 usa esa palabra, y lo que agrega no es una formalidad sino una carga de
  prueba: hay que poder mostrar **qué texto** se consintió, **en qué versión** y **en qué momento**.
  Una casilla marcada no lo satisface. Y el num. 7 de ese artículo, que exime en caso de urgencia
  médica, **no cubre la prestación programada**: un servicio de cuidados contratado no es una
  urgencia. **En obra** — paso 127.
- **Panamá: ANTAI fiscaliza directamente al custodio.** El art. 59 del Decreto 285 somete a
  fiscalización tanto al responsable como al custodio de la base. CeltaTech no queda detrás de la
  Prestadora: responde por sí misma ante la autoridad.
- **Panamá: un incidente que toque a varias Prestadoras se notifica por separado a cada una.** El
  art. 37 del Decreto 285 obliga al custodio a informarle al responsable «de manera inmediata», y
  cada responsable sólo puede ser informado de lo suyo. De ahí sale una exigencia de arquitectura
  que no es opcional: la detección tiene que poder contestar **a qué Prestadoras alcanzó el
  incidente**, o cumplir con una obliga a filtrarle datos de otra. **En obra** — paso 124 y plan de
  aislamiento.
- **Panamá: el reloj de la conservación arranca con un hecho que el sistema puede no enterarse
  nunca.** El art. 49 de la Ley 68 cuenta los veinte años **desde la muerte del paciente**, y no fija
  ningún plazo autónomo para pacientes vivos. Purgar por antigüedad de la última atención sería
  ilícito para el núcleo del art. 50. De ahí salen dos exigencias de producto que no se deducen de
  ningún otro país: **un dato de fallecimiento que dispare el cómputo**, y **el bloqueo de toda purga
  automática** mientras ese dato no exista. **En obra** — paso 122.
- **Panamá: subcontratar el alojamiento necesita autorización previa y escrita, con el proveedor
  nombrado.** El art. 49 del Decreto 285. Es la misma exigencia que el art. 15 bis chileno, y alcanza
  al proveedor de nube de São Paulo. **En obra** — paso 5.
- **Panamá: las multas alcanzan directamente al custodio.** El art. 36 de la Ley 81 fija de 1.000 a
  10.000 balboas —a la par del dólar, sin indexación—, y los arts. 38 a 41 gradúan: son **muy graves**
  no observar las regulaciones sobre datos sensibles (art. 41 num. 2) y el almacenamiento o la
  transferencia internacional ilícitos (num. 4), que es exactamente este caso. El art. 43 suma cierre
  y suspensión. Y el art. 62 num. 10 del Decreto 285 cuenta como **atenuante** tener registrado al
  oficial de protección de datos, registro que para el sector privado es optativo (art. 42).
- **Panamá: hay que revelar el uso de inteligencia artificial.** El art. 8.2 de la Ley 203 de 2021
  obliga a informarlo y a identificar al responsable de la plataforma; el art. 5.5 exige un acuerdo
  escrito con el proveedor de tecnología, exhibible; el art. 6, consentimiento informado firmado
  **dentro del expediente clínico**; y el art. 13, que toda actividad de telemedicina quede asentada
  en la historia clínica. Es el único de los diez países que legisla sobre revelar la inteligencia
  artificial. **En obra** — paso 127.

### Transferencia internacional

**Panamá** aprobó las cláusulas de la Red Iberoamericana por Resolución ANTAI-DG-003-2026, firmada
el 26 de marzo de 2026 y **vigente desde su publicación en la Gaceta Oficial 30541-A, el 8 de junio
de 2026**, sin período de transición. Usarlas es **voluntario** —el art. 53 num. 1 del Decreto 285
ya admitía cláusulas propias—, no hace falta autorización previa de la ANTAI, y **el texto no se
puede modificar**: sólo se completa donde el propio modelo lo prevé, y sólo admite garantías
adicionales que no lo contradigan ni bajen la protección. Trae dos modelos —entre responsables, y
entre responsable y encargado— y un tercer anexo de terminología que **equipara expresamente
«encargado del tratamiento» a «custodio de la base de datos»**. Aun así, para datos de salud el
art. 13 de la Ley 81 vuelve prácticamente ineludible el consentimiento explícito. **En obra** —
pasos 5 y 127.

### Registro de bases ante la autoridad

Panamá no tiene registro.

### Integración nacional obligatoria

**Panamá es la más exigente en lo técnico** de las integraciones nacionales obligatorias que el
plan no construye, y es obra propia: la Ley 203 de 2021 impone **HL7 obligatorio**, clasificación
internacional de enfermedades e interoperabilidad con los sistemas públicos, más un convenio
escrito entre la Prestadora y el proveedor tecnológico que hay que poder exhibir ante la autoridad
sanitaria. Y esa misma ley reformó el art. 291 del Código Penal para **agravar penalmente la
intrusión contra bases con datos médicos**: en Panamá una falla de aislamiento no termina en multa
administrativa.

## Riesgo laboral — sin investigar todavía

> **Esta sección falta.** No se investigó todavía la legislación laboral de Panamá. Mientras esta
> sección no tenga la tabla de advertencias completa, el sistema no muestra ninguna advertencia
> laboral para Prestadoras de esta jurisdicción. Es la regla del riesgo legal
> (`celtatech/docs/REGLAS_PRODUCTOS_CAREONYS.md`, sección «Riesgo legal», y `celtatech/CLAUDE.md`,
> sección «El riesgo legal»): «Si el país no tiene documento, no hay aviso.»

### Qué falta completar acá

Antes de dar de alta la primera Prestadora real de Panamá, completar:

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
Panamá (no Sandbox, no datos de prueba), esta sección deja de ser opcional — hay que
completarla antes de habilitar esa Prestadora, según la regla del riesgo legal
(`celtatech/docs/REGLAS_PRODUCTOS_CAREONYS.md`, sección «Riesgo legal», y `celtatech/CLAUDE.md`,
sección «El riesgo legal»): «Antes de vender en un país nuevo, ese país tiene que tener su
documento, aunque sea corto.»
