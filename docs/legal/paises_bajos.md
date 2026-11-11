# Legislación — Países Bajos

Este documento cita las normas propias de los Países Bajos que alcanzan a Careonys y dice para cada
una en qué estado está el sistema. Además de lo que está acá, a los Países Bajos les alcanza todo lo
de `docs/legal/union_europea.md`. Los tres estados posibles («Cumple», «En obra», «No alcanza») y
qué significa cada uno están explicados en la introducción de `docs/CUMPLIMIENTO_NORMATIVO.md`.

## Registro de accesos

**NEN 7513:2018** rige el registro de accesos a la información de salud en Países Bajos. Es una
norma de pago, con licencia de uso individual. **Se leyó completa.** La copia está fuera de todo
repositorio, en `F:\proyectos\celtatech\normas\paises_bajos\NEN 7513_2018 nl.pdf`, porque la
licencia no permite publicarla ni compartirla. Lo que sigue la resume con palabras propias; para el
texto exacto se abre esa copia.

**Estado: En obra.**

### Qué pide, por sección

- **1 — Alcance.** Se anota el hecho de que alguien accedió, nunca el dato al que accedió. La puesta
  en marcha empieza por un análisis de riesgo.
- **3.1 y 7.2.2 — Tipos de acción.** Cada fila dice si se creó, se leyó, se modificó, se borró o se
  ejecutó algo.
- **5.1 — Datos mínimos.** Qué pasó, cuándo, sobre qué paciente, quién lo hizo y quién responde por
  quien lo hizo.
- **5.2 — El paciente.** Puede ver quién entró a sus datos —personal, otras organizaciones y él
  mismo— y también quién miró el registro de sus accesos. Cada fila dice qué parte de los datos se
  tocó, con qué regla de autorización y con qué consentimiento. Si no hubo regla ni consentimiento
  aplicable, la fila lo dice en vez de quedar vacía.
- **5.3 — Uso sin consentimiento.** El uso para investigación sin consentimiento también se anota.
- **5.4 — Autoridad de control.** Ve todo lo que su facultad legal le permite.
- **6.2.1 — Qué acciones sobre los datos se anotan.** Crear una historia y darle su número; cargar,
  agregar, borrar y leer datos; copiar e imprimir; unir y separar historias; transferir, también a
  un medio portátil; y las búsquedas.
- **6.2.2 — Hechos especiales.** El acceso de emergencia, y el acceso directo a los archivos por
  fuera de los controles habituales.
- **6.3 — Cambios en las reglas de acceso.** Cambios de roles, de grupos de datos, de permisos, de
  reglas de autorización, y cada alta, confirmación, cambio y retiro de un consentimiento.
- **6.4 — El registro mismo.** Se anota encenderlo o apagarlo; todo acceso al registro se anota y
  eso no se puede apagar; cambiar o borrar filas del registro se anota con su motivo.
- **7.1 — Formato.** Sigue RFC 3881, DICOM PS3.15 e IHE ATNA. Un país o un sector puede volver
  obligatorio un campo optativo, nunca al revés. Todo campo codificado dice qué catálogo de códigos
  usa.
- **7.2 — El hecho.** Obligatorios: código del hecho, tipo de acción, y momento en UTC, en formato
  ISO 8601 y al menos al segundo, contado desde que empezó. Resultado: bien, rechazado o error. Y,
  cuando corresponde, qué controles se pasaron: autorización, relación de cuidado, consentimiento y
  emergencia.
- **7.3 — Quién.** Obligatorios: identificador y rol funcional (ISO 21298). Cuando corresponde, el
  identificador y el rol de quien responde. Optativos: nombre, si fue quien inició la acción, y
  desde dónde entró (equipo, dirección IP, teléfono).
- **7.4 — Sobre qué.** Obligatorios: qué clase de identificador y cuál. En las acciones sobre datos
  de salud, también la regla de autorización, la de relación de cuidado y el consentimiento.
  Optativos, entre otros: lo delicado del dato y el texto de la búsqueda.
- **7.5 — Desde qué sistema.** Obligatorio el identificador del sistema que anotó.
- **8.1 — Seguridad del registro.** Al menos tan protegido como los datos, con entrada en dos pasos.
  Además (NEN 7510-2): relojes sincronizados, revisión periódica del registro y registro de lo que
  hacen los administradores.
- **8.2 y 8.3 — Responsabilidad.** La responsable es la institución de salud, que nombra a quien
  administra el registro, y lo sigue siendo aunque lo tercerice. El registro sobrevive a una
  migración, a un cambio de proveedor, al fin del contrato, a una fusión o a una compra.
- **8.4 — Quién ve el registro.** Sólo con autorización explícita y estricta; ni siquiera quien lo
  administra lo ve todo. El paciente ve primero quién responde; el nombre de la persona que entró,
  sólo si lo pide con motivo y después de sopesar los intereses de los dos.
- **8.5 — Conservación.** Entre 2 y 15 años. Ante una queja, el registro de ese paciente se congela
  y se guarda aparte hasta 10 años.
- **8.6 — Exportación.** Se puede bajar en el formato del capítulo 7.
- **9.1 y 9.2 — Vistas.** El paciente lo consulta a distancia, en la organización o con ayuda: en
  orden de fecha, con filtro de período y con las filas iguales del mismo día juntadas. La
  institución lo ve por persona del personal y en resumen: cuántas historias distintas vio o
  exportó cada uno, cuántos accesos de emergencia y qué organizaciones de afuera entraron.
- **Anexo A.** La lectura que el paciente hace de su propio registro también se anota. Un informe
  diario ayuda a detectar patrones sospechosos.

### Qué hay hoy y qué falta

Comparado con el código y la base en vivo.

**Ya está:**

- Cada lectura de información de salud se anota en el registro de accesos, con quién, sobre qué
  paciente, qué categorías de datos y cuándo, y el momento se guarda con zona horaria, convertible
  a UTC.
- Las filas no se pueden modificar ni borrar a mano, y están encadenadas: si se altera una, la
  cadena se rompe y se detecta.
- El vencimiento por plazo existe, con preaviso y notificación antes de borrar, y el año que vence
  se puede bajar antes de que se borre.
- En la Ficha de cada Cliente, la administración ve quién accedió a su información de salud y lo
  baja como planilla para entregárselo (5.2, 8.6, en parte).
- Cada alta, corrección o baja en cuatro de las tablas de información de salud deja una copia con autor,
  momento y nota en el historial del registro clínico, que nadie edita ni borra (6.2.1, en parte).
- Los cambios de cuentas, de permisos y de membresías se anotan en la Auditoría (6.3, en parte).
- Cada Prestadora ve sólo su registro.

**Falta, de lo que la norma exige:**

1. **El tipo de acción en el registro de accesos.** Ahí sólo se anotan lecturas. Las altas,
   correcciones y bajas quedan en el historial del registro clínico, que es otra lista y no
   alcanza a toda la información de salud (3.1, 6.2.1).
2. **Anotar quién mira el registro.** La consulta del registro, desde la Auditoría o desde la Ficha,
   no deja fila (6.4).
3. **Entrada en dos pasos para ver el registro.** No se exige en ningún lado (8.1). La pieza para
   volver a ponerla está guardada en `Codigos-utiles`; el plan la pide en «Quién entra y cómo».
4. **El resultado.** Sólo se anota lo que salió bien; un intento rechazado no deja rastro (7.2).
5. **Quién responde por quien accedió**, y la regla de autorización y el consentimiento aplicados
   en cada fila (5.1, 7.3, 7.4).
6. **Desde qué equipo se entró** (7.3, optativo). El Panel ya lleva los equipos conocidos de cada
   cuenta; a cada fila le alcanza con señalar cuál se usó, sin guardar ningún dato nuevo.
7. **La impresión y la exportación** de información de salud no se distinguen de una lectura
   (6.2.1).
8. **La vista del paciente.** El paciente y su familia no pueden verlo por su cuenta: dependen de
   que la Prestadora les entregue la planilla (5.2, 9.1).
9. **El congelamiento ante una queja** (8.5).
10. **La exportación del registro en el formato de la norma.** La planilla existe, pero no en ese
   formato (8.6).

### Lo que la norma sugiere más allá de Países Bajos

Ideas que fortalecerían el sistema en cualquier país:

- **El acceso de emergencia como hecho aparte**, visible en el resumen (6.2.2). El plan ya lo pide
  por la norma de Estados Unidos, en «Quién entra y cómo».
- **El resumen por persona**: cuántas historias distintas vio cada uno en un período. Es la forma
  más simple de detectar a quien mira lo que no le corresponde (9.2, Anexo A). Encaja en la
  revisión del registro de accesos que el plan ya pide.
- **Juntar las filas iguales del mismo día** al mostrarlas, para que el registro se pueda leer
  (9.2).
- **Que el registro sobreviva al fin de la relación** con la Prestadora: que pueda llevárselo
  (8.2, 8.3).
- **Anotar el texto de las búsquedas** sobre pacientes (7.4).

## Lo que no se verificó

Se declara para que nadie lo tome por cumplido.

- No se leyeron NEN 7510 ni NEN 7512, que la NEN 7513 cita para la seguridad general y para el
  intercambio de datos entre organizaciones.
- No se leyeron los catálogos de códigos que pide el capítulo 7 (ISO 21298 para los roles,
  RFC 3881 y DICOM para los hechos).
