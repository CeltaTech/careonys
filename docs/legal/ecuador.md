# Legislación — Ecuador

## Protección de datos e historia clínica

Los estados —**Cumple**, **En obra** con su paso de `docs/PLAN_HASTA_PRODUCCION.md`, y **No
alcanza**— son los que define la introducción de `docs/CUMPLIMIENTO_NORMATIVO.md`. Cuando el
texto compara con «los diez países», son los de Latinoamérica relevados en ese documento.

### Las normas

- **Norma de datos.** LOPDP de 2021 y Reglamento — SPDP. **Art. 31: los datos de salud se
  seudonimizan «siempre que sea posible»**. Arts. 3, 34, 42, 43, 46, 47, 48, 51. Res.
  SPDP-SPD-2026-0004-R y **Res. SPDP-SPD-2026-0005-R, que declara gran escala a todo tratamiento
  de salud**.
- **Historia clínica.** Ley Orgánica de Salud art. 7 lit. f) y h); Reglamento de la HCU **AM
  00115-2021** (RO 378, 26-01-2021); Reglamento de la Historia Clínica **Electrónica** AM 0009 (RO
  968, 2017); **Norma Técnica de Telesalud AM 00044-2025** (RO 2º Supl. 153, 28-10-2025); permiso
  ACESS por AM 00032-2020.
- **Conservación.** ⚠️ **Sin verificar.** La única cifra hallada es un manual del MSP que habla de
  10 o 15 años —5 de archivo activo más 5 o 10 de pasivo— **desde la última atención**, y **10
  años desde el fallecimiento**; la tabla que decide cuál de los dos no pudo leerse.
- **Brecha.** **5 días hábiles** a la SPDP **y a ARCOTEL** (art. 43); el encargado avisa al
  responsable en **2 días**; al titular, **3 días desde que se conoció el riesgo** (art. 46).

### Lo que Ecuador comparte con los demás países

- **Consentimiento expreso para datos de salud.** **Cumple** la estructura; **en obra** los textos
  por país — paso 127.
- **Corrección por nota aclaratoria, nunca por sobreescritura.** **Cumple** en `indicaciones_medicacion`, `rangos_referencia_vitales` y
  `domicilios_temporales_paciente`: cada corrección deja su versión con nota aclaratoria, y nadie
  la edita ni la borra. Lo corregido desde el Panel todavía queda sin autor — **en obra**, paso 9.
- **Plazo de conservación y anonimización al vencer** (art. 31). **En obra** — paso 122.

### Las obligaciones particulares

- **Ecuador: seudonimizar sí, anonimizar no.** El art. 31 numeral 2 manda seudonimizar o anonimizar
  los datos de salud «siempre que sea posible». Sobre el dato operativo no se activa —identificar al
  paciente es la finalidad misma del producto—, pero sí sobre todo lo derivado: tableros,
  estadísticas, reportes agregados, entornos de desarrollo y prueba, respaldos analíticos y
  registros de actividad. Y hay una trampa en el numeral 3: **todo tratamiento de datos de salud
  anonimizados necesita autorización previa de la autoridad**, con protocolo técnico e informe
  favorable de la autoridad sanitaria. **No menciona la seudonimización.** De ahí sale la regla del
  producto: se seudonimiza, no se anonimiza. **En obra** — paso 122.
- **Ecuador exige representante local, y alcanza al encargado.** Art. 3 de la LOPDP y del
  Reglamento: quien no está establecido en Ecuador designa apoderado especial con residencia en el
  país, con poder apostillado. La única excepción —tratamiento ocasional, sin gran escala de
  categorías especiales, sin riesgo— no aplica a un producto de salud por ninguno de los tres
  filtros. Y el art. 6 de la Resolución SPDP-SPDP-2024-0002-R obliga además a **entregarle a la
  autoridad** el acuerdo de encargo, el registro de actividades de tratamiento, el análisis de
  riesgo, el flujo de datos y el detalle de las medidas de seguridad. Es el segundo país con
  representante local, después de Perú. **No alcanza** — es obligación societaria de CeltaTech.
- **Ecuador exige delegado de protección de datos, y alcanza al encargado.** Por el art. 48 de la
  LOPDP —gran escala de categorías especiales— con el art. 47 in fine extendiendo las obligaciones
  al encargado, y con requisitos de persona: título de tercer nivel en Derecho, Comunicación o
  Tecnologías y cinco años de experiencia mínima. **No alcanza** — es obligación societaria de
  CeltaTech, no del producto.
- **Ecuador: un producto de salud es «gran escala» por definición, sin contar titulares.** El art.
  14.1 de la Resolución SPDP-SPD-2026-0005-R califica directamente como gran escala los
  tratamientos de salud hechos en el marco de sistemas asistenciales o de gestión de historiales
  clínicos. No se aplica el modelo de cálculo por puntaje de los arts. 7 a 11: la calificación es
  automática aunque haya un solo paciente. Eso dispara **delegado de protección de datos
  obligatorio, evaluación de impacto previa, registro de actividades reforzado (art. 15), auditoría
  cada doce meses (art. 17) e informe anual de cumplimiento (art. 18), todo conservado cinco
  años**. Es la carga formal más pesada de los diez países. **No alcanza** en su parte societaria;
  **en obra** — pasos 126 y 127.
- **Ecuador: la telesalud tiene norma propia y es la más nueva del relevamiento.** El Acuerdo
  Ministerial 00044-2025 exige **dos consentimientos separados** —uno para usar medios telemáticos y
  otro para tratar los datos—, cifrado en la transmisión, cumplimiento del Esquema Gubernamental de
  Seguridad de la Información, un registro de trazabilidad de los servicios prestados y estándares de
  interoperabilidad **DICOM, HL7, FHIR, LOINC y SNOMED-CT**. Sólo se activa si el producto presta
  teleconsulta, teleseguimiento o telemonitoreo. **En obra** — pasos 13 y 127.
- **Ecuador: la empresa prestadora necesita permiso anual de ACESS.** Arts. 8 y 9 del Acuerdo
  Ministerial 00032-2020, con una excepción expresa: el profesional en libre ejercicio que atiende a
  domicilio **sin establecimiento** no lo requiere. La normativa sanitaria propia de la atención
  domiciliaria fue derogada en 2020 y no se reemplazó: hoy la atención domiciliaria queda absorbida
  en la definición general de establecimiento de salud. **No alcanza** — es trámite de la Prestadora,
  y el producto se lo avisa.

### Transferencia internacional

Ecuador es uno de los cuatro países que dicen que entregarle los datos al encargado no es
transferencia. El art. 4 de la LOPDP define la transferencia como la que se hace «a una persona
**distinta al titular, responsable o encargado**», y el art. 34 agrega que el acceso del encargado
no constituye transferencia ni comunicación. El art. 23 de la Resolución SPDP-SPD-2026-0004-R lo
dice sin rodeos: «el encargo de tratamiento no constituye una transferencia ni comunicación de
datos personales. En consecuencia, las CCM entre responsables y encargados, emitidas por la RIPD,
no son aplicables en la República del Ecuador.» Lo que sí exige es el **contrato de encargo** del
art. 34 y las medidas de los arts. 37-42.

**Y una advertencia que vale para los países que no llaman transferencia al encargo:** que no
haya que firmar cláusulas de transferencia no alivia nada. El contrato de encargo sigue siendo
obligatorio, con contenido mínimo, y las medidas de seguridad son las mismas. Lo único que
desaparece es un trámite.

### Registro de bases ante la autoridad

**Ecuador no registra bases de datos**: el art. 51 de la LOPDP crea el Registro Nacional, pero lo
que el portal de la autoridad efectivamente inscribe son delegados de protección de datos,
apoderados, certificados, vulneraciones y denuncias —el registro del delegado es gratuito—, y
ninguno de sus trámites publicados es la inscripción de una base.

### Lo que no se verificó

- **El plazo de conservación de la historia clínica ecuatoriana.** Es el hueco más importante que
  quedó abierto. El articulado de archivo y custodia del AM 00115-2021 no se pudo leer —los dos
  ejemplares localizados son imágenes escaneadas sin texto—, y la tabla del manual del Ministerio
  que decidiría entre diez y quince años vive en un servidor inalcanzable. Tampoco se pudo leer el
  articulado del AM 0009, que es donde estarían las reglas ecuatorianas de seguridad, respaldo,
  registro de accesos y firma electrónica de la historia clínica electrónica: **es el documento que
  más le falta a este relevamiento**. Queda sin resolver si el AM 0457 de 2006 sigue vigente, y si
  un prestador privado está obligado a integrarse al RDACAA o a la plataforma PRAS.
- **La ley ecuatoriana de personas adultas mayores y su reglamento.** Sólo se pudo leer un artículo
  suelto. Queda sin confirmar si un prestador domiciliario de personas adultas mayores necesita,
  además del permiso sanitario, una autorización de la autoridad de inclusión social. **Son dos
  habilitaciones de autoridades distintas si se confirma.**

## Riesgo laboral — sin investigar todavía

> **Esta sección falta.** No se investigó todavía la legislación laboral de Ecuador. Mientras esta
> sección no tenga la tabla de advertencias completa, el sistema no muestra ninguna advertencia
> laboral para Prestadoras de esta jurisdicción. Es la regla del riesgo legal
> (`celtatech/docs/REGLAS_PRODUCTOS_CAREONYS.md`, sección «Riesgo legal», y `celtatech/CLAUDE.md`,
> sección «El riesgo legal»): «Si el país no tiene documento, no hay aviso.»

### Qué falta completar acá

Antes de dar de alta la primera Prestadora real de Ecuador, completar:

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
Ecuador (no Sandbox, no datos de prueba), esta sección deja de ser opcional — hay que
completarla antes de habilitar esa Prestadora, según la regla del riesgo legal
(`celtatech/docs/REGLAS_PRODUCTOS_CAREONYS.md`, sección «Riesgo legal», y `celtatech/CLAUDE.md`,
sección «El riesgo legal»): «Antes de vender en un país nuevo, ese país tiene que tener su
documento, aunque sea corto.»
