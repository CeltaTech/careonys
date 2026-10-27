# Legislación — Costa Rica

## Protección de datos e historia clínica

Los estados —**Cumple**, **En obra** con su paso de `docs/PLAN_HASTA_PRODUCCION.md`, y **No
alcanza**— son los que define la introducción de `docs/CUMPLIMIENTO_NORMATIVO.md`. Cuando el
texto compara con «los diez países», son los de Latinoamérica relevados en ese documento.

### Las normas

- **Norma de datos.** Ley 8968 —**sin ninguna reforma desde 2011**— y Decreto 37554-JP, hoy en su
  tercera versión tras los decretos 40008-JP y 41582 — PRODHAB. Arts. 3, 5, 6, 9, 11, 14, 21, 28;
  reglamento arts. 21, 29, 32, 33, 35, 36, 37, 40, 47.
- **Historia clínica.** Sin norma de plazo verificada para un prestador privado: el Reglamento del
  Expediente de Salud de la CCSS rige la Caja, que es una institución autónoma.
- **Conservación.** **10 años desde la fecha de cada hecho registrado**, contados asiento por
  asiento y no por expediente; al vencer, **suprimir o desasociar** (Ley art. 6.1).
- **Brecha.** **5 días hábiles desde que ocurrió el hecho**, no desde que se conoce (reglamento
  art. 38), **al titular y a la autoridad** (art. 39).

### Lo que Costa Rica comparte con los demás países

- **Consentimiento expreso para datos de salud** (art. 5). **Cumple** la estructura; **en obra**
  los textos por país — paso 127.
- **Registro de accesos con identidad y período de todas las personas que ingresaron** (reglamento
  art. 47). **En obra** — paso 9. Hoy no se cumple: el registro anota escrituras, no lecturas.
- **Plazo de conservación y anonimización al vencer** (Ley art. 6.1). **En obra** — paso 122.

### Las obligaciones particulares

- **Costa Rica cuenta el plazo de brecha desde el hecho, no desde que se descubre.** El art. 38 del
  reglamento: «cinco días hábiles a partir del momento en que ocurrió la vulnerabilidad». Es el
  reloj más hostil de los diez, porque puede empezar a correr antes de que nadie sepa que hay algo
  que informar, y el art. 39 obliga a avisarle al titular **y** a la autoridad. De acá sale por qué
  el paso 124 se construye contra detección y no contra aviso. **En obra** — paso 124.
- **Costa Rica, art. 9.1.d de la Ley 8968.** Tratar datos de salud exige que lo haga personal
  sanitario sujeto a secreto profesional «**o por otra persona sujeta, asimismo, a una obligación
  equivalente de secreto**». La ley no define esa frase, pero la llenan el art. 11 —que impone el
  secreto a «quienes intervengan en cualquier fase del tratamiento» y lo mantiene después de
  terminada la relación—, el art. 3.f y el art. 2.m del reglamento, que alcanza a «toda persona que
  tenga participación en el tratamiento o almacenamiento». De ahí se sigue que **el personal
  técnico del proveedor ya está alcanzado por la ley, y que el contrato no lo obliga sino que lo
  vuelve demostrable.** La norma **no** exige que sea personal sanitario. Tratar sin ese recaudo es
  falta gravísima. **En obra** — paso 125.
- **Costa Rica: la condición socioeconómica es dato sensible.** El art. 3.e de la Ley 8968 la
  incluye en la definición, y el art. 31.a convierte en **falta gravísima** tratar datos sensibles
  fuera de la ley. Lo que el Cliente de la Prestadora paga y su capacidad de pago entran por ahí. El
  art. 9.4, sobre comportamiento crediticio, es categoría aparte y rige para el Sistema Financiero
  Nacional: no aplica. Es el tercer país que protege el dato económico, con Perú y Chile. **En
  obra** — pasos 122, 125 y 127.
- **Costa Rica: transmitir «por medio de mecanismos inseguros» es falta, sin que haga falta daño.**
  El art. 29.b del reglamento tipifica como falta leve recolectar, almacenar y transmitir así. Es
  el enganche directo entre una debilidad del software y la responsabilidad de la Prestadora, y no
  espera a que se filtre nada. **En obra** — sección «Los cimientos» de `docs/PLAN_HASTA_PRODUCCION.md`.
- **Costa Rica no tiene niveles de seguridad: tiene un modelo de riesgo.** No existen los niveles
  básico, medio y alto. El art. 35 del reglamento enumera siete factores de riesgo y el art. 36
  siete acciones, entre ellas —inciso c— **poder declarar el motor de base de datos y su versión**.
  A eso se suman el análisis de riesgo, el riesgo residual y el plan de trabajo. Las medidas son
  información no divulgada y PRODHAB sólo las revisa in situ ante denuncia. Y el art. 37, último
  párrafo, fija la **única periodicidad obligatoria del régimen: con datos sensibles, las medidas
  se revisan al menos una vez al año.** **En obra** — pasos 125 y 126.
- **Costa Rica: el protocolo de actuación es obligatorio y se le entrega al encargado.** La Ley
  dice «podrán» (art. 12), pero el art. 32 del reglamento dice **deberán**, fija su contenido
  mínimo —incluido el inciso e, mantener un historial de los datos durante su tratamiento— y obliga
  a transmitírselo al encargado. Es el país donde la documentación que CeltaTech le entrega a cada
  Prestadora deja de ser cortesía. **En obra** — paso 127.
- **Costa Rica: la base clínica de una Prestadora no se inscribe, y eso no exime de nada.** El art.
  21 de la Ley con el art. 2 del reglamento sólo obliga a inscribir la base «administrada con fines
  de distribución, difusión o comercialización»; el párrafo final del art. 44, agregado por el
  Decreto 40008-JP, deja afuera a la base interna. Se inscribe el responsable, nunca el encargado.
  Y la obligación de entregarle un «superusuario» a PRODHAB **está derogada**: quien lo haya
  facilitado tiene que desactivarlo.
- **Costa Rica: derecho al olvido a los diez años.** El art. 11 del reglamento, reformado en 2016,
  obliga a suprimir el dato a los diez años de terminado el objeto del tratamiento, salvo acuerdo de
  partes, relación continuada o interés público. Complementa el art. 6.1 de la Ley, que cuenta desde
  cada hecho registrado. **En obra** — paso 122.

### Transferencia internacional

Costa Rica es uno de los cuatro países que dicen que entregarle los datos al encargado no es
transferencia, **con una salvedad.** El art. 40 del reglamento, reformado por el Decreto 40008-JP,
dice que «no se considera transferencia el traslado de datos del responsable a un encargado,
proveedor de servicios o intermediario tecnológico». Pero la Ley 8968 no recoge esa exclusión, y
su art. 31.f sanciona como falta gravísima transferir sin consentimiento. Un reglamento no puede
angostar la ley que reglamenta, así que **esto no se da por resuelto**.

**Costa Rica** exige consentimiento expreso que cubra específicamente la transferencia, sin
régimen de adecuación ni lista de países adecuados: ese concepto no existe en su derecho, y
transferir sin consentimiento es falta gravísima (Ley art. 31.f). El art. 40 del reglamento dice
que entregarle los datos a un encargado no es transferencia, pero la Ley no recoge esa exclusión
—**es una tensión de rango que decide un abogado**, y mientras tanto lo prudente es que el
consentimiento mencione el alojamiento y dónde está. **En obra** — pasos 5 y 127.

**Y una advertencia que vale para los países que no llaman transferencia al encargo:** que no
haya que firmar cláusulas de transferencia no alivia nada. El contrato de encargo sigue siendo
obligatorio, con contenido mínimo, y las medidas de seguridad son las mismas. Lo único que
desaparece es un trámite.

### Registro de bases ante la autoridad

Costa Rica inscribe sólo si la base se administra «con fines de distribución, difusión o
comercialización» (Ley art. 21 y reglamento art. 2), con un canon anual fijo de **200 dólares**
—así, en dólares: no se calcula en salarios base ni en colones— del art. 33 del reglamento; **la
base clínica de una Prestadora es base interna y no se inscribe** (reglamento art. 44, párrafo
final), y el encargado nunca se inscribe.

## Riesgo laboral — sin investigar todavía

> **Esta sección falta.** No se investigó todavía la legislación laboral de Costa Rica. Mientras
> esta sección no tenga la tabla de advertencias completa, el sistema no muestra ninguna
> advertencia laboral para Prestadoras de esta jurisdicción. Es la regla del riesgo legal
> (`celtatech/docs/REGLAS_PRODUCTOS_CAREONYS.md`, sección «Riesgo legal», y `celtatech/CLAUDE.md`,
> sección «El riesgo legal»): «Si el país no tiene documento, no hay aviso.»

### Qué falta completar acá

Antes de dar de alta la primera Prestadora real de Costa Rica, completar:

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
Costa Rica (no Sandbox, no datos de prueba), esta sección deja de ser opcional — hay que
completarla antes de habilitar esa Prestadora, según la regla del riesgo legal
(`celtatech/docs/REGLAS_PRODUCTOS_CAREONYS.md`, sección «Riesgo legal», y `celtatech/CLAUDE.md`,
sección «El riesgo legal»): «Antes de vender en un país nuevo, ese país tiene que tener su
documento, aunque sea corto.»
