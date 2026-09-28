# El sistema tiene que poder demostrar lo que hace

Plan para que Careonys resista la auditoría más rigurosa de Estados Unidos, Europa y Latinoamérica.

Se apoya en el plan de aislamiento —`docs/PLAN_AISLAMIENTO_DE_RAIZ.md`—, que es su condición previa:
casi todo lo de acá se vuelve indemostrable mientras exista una credencial que alcance a todas las
Prestadoras. Lo que este plan agrega es lo que ninguna base de datos hace sola.

Las normas, con su artículo, están en `docs/CUMPLIMIENTO_NORMATIVO.md`. Acá va qué hay que construir.

---

## 1. Qué hay hoy

Medido contra la base en vivo y contra el código.

**Los datos están en São Paulo.** El proyecto corre en `sa-east-1`. Para Brasil el tratamiento es
local; para todos los demás países es transferencia internacional **hacia Brasil**, y Brasil no
tiene decisión de adecuación europea. La pregunta de cada país no es «¿podemos alojar en Estados
Unidos?» sino «¿qué habilita a alojar en Brasil los datos de salud de este país?».

**Nadie sabe quién leyó qué.** `registro_actividad` anota once acciones y todas son escrituras o
entradas al Panel. Ninguna lectura queda registrada. `auditoria_de_accesos` tiene `admin_id` no
nulo, así que sólo alcanza al personal de CeltaTech, y tiene cero filas. Y el registro no es
inmutable: su única política es de lectura, pero la llave maestra se saltea la protección por fila
y puede borrarlo.

**No existe conservación, ni borrado, ni anonimización.** Cero apariciones de `anonimiz`, `purga`,
`retencion`, `conservacion` y `derecho_al_olvido` en el backend y en las funciones. Lo que hay es
borrado lógico: un dato marcado como borrado queda para siempre.

**No hay fecha de fallecimiento** en ninguna columna de ninguna tabla. En Panamá el plazo de
conservación del expediente clínico corre desde la muerte del paciente: hoy el sistema no puede
calcular su propio plazo allá.

**No hay exportación ni portabilidad.** El derecho de acceso se atiende a mano, contra la base.

**El registro clínico se sobreescribe.** `indicaciones_medicacion` y `rangos_referencia_vitales`
tienen `updated_at` y ningún historial: corregir pisa lo anterior.

**El cierre por inactividad existe sólo para el permiso de acceso de CeltaTech.** Las sesiones de
la gente de la Prestadora no se cierran.

**El segundo factor está construido y apagado.** `requiereRolPanel.js:82-85` rechaza el pase que no
llegó a `aal2`, gobernado por `configuracion_plataforma.mfa_admin_obligatorio`, que hoy vale
`false`.

**La estructura de configuración por país está hecha y vacía.** `advertencias_legales` tiene 13
filas, todas de jurisdicción `AR`, y las trece son de materia laboral o del Match. Ninguna es
de protección de datos. `escalas_legales` también es sólo `AR`.

**Lo que sí está bien.** Los secretos de pasarelas viven en Supabase Vault, no en claro. Diez de los
once depósitos de archivos son privados y se sirven con enlace temporal. El consentimiento se
registra con texto versionado, con quién consintió, por qué medio, desde cuándo y hasta cuándo.

---

## 2. Qué queda cuando esto termina

- **Cada lectura de un dato de salud deja constancia**, con la Prestadora, la persona que accedió,
  el paciente, la categoría de dato, el momento y el origen. Consultable por paciente, no sólo por
  fecha.
- **Esa constancia no se puede alterar sin que se note.**
- **Cada dato tiene plazo, y al vencer se borra o se desasocia**, según lo que mande el país de esa
  Prestadora y la clase de registro.
- **Una persona puede pedir lo suyo y llevárselo**, y el sistema lo arma solo, dentro del plazo de
  su país.
- **Un incidente se puede acotar a las personas realmente alcanzadas y avisar en 24 horas.**
- **Ninguna corrección clínica pisa lo anterior.**
- **El sistema sabe en qué país opera cada Prestadora** y de ahí salen los plazos, los textos y los
  avisos. Ninguno está escrito en el código.
- **Existen los documentos que la auditoría pide**, y dicen la verdad porque salen del sistema.

---

## 3. Los tramos, en orden

Cada tramo termina con su comprobación. El orden es de dependencia, no de importancia.

### Tramo 1 — Dónde viven los datos

Es el primero porque condiciona todo lo demás y porque no es una decisión de programación.

Hoy hay una sola región. Lo que las normas obligan:

- **Alemania.** El §393 SGB V limita el lugar de tratamiento a Alemania, el Espacio Económico
  Europeo o un tercer país con adecuación donde el proveedor tenga establecimiento nacional, y exige
  dictamen BSI C5 Tipo 2 vigente. Brasil no califica.
- **Francia.** Alojar datos de salud exige alojador certificado HDS (art. L.1111-8 del Code de la
  santé publique). Hacerlo sin certificación es delito (art. L.1115-1).
- **Unión Europea en general.** Brasil no tiene decisión de adecuación, así que sería transferencia
  del Capítulo V con cláusulas y evaluación de impacto de la transferencia.
- **Estados Unidos.** No hay requisito de residencia, pero sí de contrato: el proveedor de nube es
  business associate y hace falta acuerdo firmado (45 CFR 164.308(b)(1) y 164.502(e)). Supabase lo
  ofrece sólo en nivel Team o Enterprise más complemento pago, y exige recuperación a un punto en el
  tiempo, forzado de SSL, restricciones de red y registro de conexiones siempre encendido.
- **Argentina, que es el primer mercado.** Es el caso más fácil, pero no es automático: **Brasil no
  figura en la lista de países con legislación adecuada** del art. 3 de la Disposición 60-E/2016,
  sustituido por la Resolución AAIP 34/2019. Alojar en São Paulo es transferencia del art. 12 de la
  Ley 25.326, y lo que la habilita son **las cláusulas contractuales tipo del Anexo II de esa misma
  disposición**, incorporadas al contrato entre CeltaTech y la Prestadora. Es trabajo de contrato,
  no de código, y tiene que estar firmado antes del alta de la primera Prestadora real. La excepción
  de datos médicos del art. 12(2)(b) es para un intercambio concreto exigido por el tratamiento del
  paciente y no cubre alojar el padrón: no se la invoca. **Y hay cuatro destinos donde no haría
  falta ningún instrumento porque la lista argentina los declara adecuados: la Unión Europea, el
  Reino Unido, Suiza y Uruguay.** Uruguay es el único de la región y el de menor demora de
  conexión. Es dato para la decisión de región, que sigue sin tomarse.
- **Brasil, donde São Paulo deja de ser un problema.** Un dato brasileño alojado en Brasil no es
  transferencia y no necesita instrumento. Brasil sólo declaró adecuada a la Unión Europea
  (Resolución CD/ANPD 32/2026); hacia cualquier otro destino rigen las cláusulas-patrón del Anexo
  II de la Resolución CD/ANPD 19/2024, que se adoptan **íntegras y sin modificar** —cualquier cambio
  las invalida— y cuyo plazo de adaptación de contratos anteriores venció el 23 de agosto de 2025.
- **Latinoamérica.** Ninguno de los diez países prohíbe el destino. Costa Rica exige consentimiento
  expreso que cubra específicamente la transferencia internacional, no el genérico de tratamiento
  (Ley 8968 art. 14; omitirlo es falta gravísima). Panamá exige informar cuál condición del art. 33
  se invoca. Argentina, Brasil, Perú, Uruguay y Ecuador exigen cláusulas contractuales del modelo de
  su autoridad. Colombia no exige nada especial hacia Estados Unidos.

**Lo que hay que decidir, y es del Desarrollador:** si el producto se queda en una sola región y se
vende sólo donde esa región habilita, o si pasa a tener **una instalación por mercado** —Brasil para
Latinoamérica, Unión Europea para Europa, Estados Unidos para Estados Unidos—, con la Prestadora
alojada en la que su país permite.

La consecuencia técnica de la segunda opción no es menor y conviene dejarla escrita ahora: el
identificador de una Prestadora deja de ser único en el producto y pasa a ser único por instalación,
y ninguna consulta puede cruzar instalaciones. Eso no rompe nada del diseño actual —la regla ya dice
que ninguna consulta cruza Prestadoras—, pero sí obliga a que la puerta de entrada sepa a qué
instalación mandar a cada quien.

**Mientras no se decida, Europa y Estados Unidos no se pueden vender**, y eso no es una limitación
del plan: es el estado de hecho de hoy.

**Comprobación:** por cada país donde haya una Prestadora dada de alta, el documento de cumplimiento
nombra qué habilita el alojamiento y con qué instrumento. Sin eso, el alta no se aprueba.

### Tramo 2 — El registro de accesos

Depende del plan de aislamiento: mientras el backend entre con la llave maestra, la base no sabe
quién está leyendo y el registro tendría que creerle al código.

Se crea un registro de accesos separado del registro de actividad, porque anotan cosas distintas y
tienen plazos distintos. Cinco campos por evento, que es exactamente lo que pide el Anexo II sección
3 del EHDS: **la Prestadora, la persona que accedió, las categorías de dato alcanzadas, el momento,
y el origen del dato.** Más el paciente, que lo piden Suecia y Países Bajos y sin el cual no se
puede acotar un incidente.

Tres propiedades que no son opcionales:

- **Consultable por paciente.** Un registro que sólo se puede leer por fecha no sirve para contestar
  «quién vio lo mío», que es el derecho del art. 9 del EHDS, ni para acotar una notificación de
  brecha.
- **Integridad demostrable.** Ninguna norma usa la palabra «inmutable»: lo que exigen es poder
  demostrar que no fue alterado. Cada entrada encadenada con la anterior alcanza, y no depende de
  ningún privilegio de base de datos.
- **Disponible para el cliente cuando lo pida.** C5 OPS-15.01AC. Y por Panamá, con la identificación
  y el período de todas las personas que ingresaron.

**Qué operaciones se anotan lo fija Perú, que es el país más preciso de todos.** El art. 46 del
DS 016-2024-JUS enumera: cuentas de usuario, **hora de inicio y de fin de sesión**, y las
operaciones de tratamiento, **visualización**, modificación, eliminación, importación y exportación.
Brasil lo dice distinto y pide lo mismo: el art. 13 III del Decreto 8.771/2016 exige inventario de
accesos con momento, duración, identidad del responsable y archivo alcanzado. Argentina, por la Ley
27.706 art. 7, pide que cada acción quede asociada inequívocamente a una persona. Se construye
contra el más exigente de los tres y alcanza a los tres.

Conservación: por jurisdicción, con piso de tres años (EHDS art. 9), **mínimo de dos años y
disponibilidad inmediata por Perú** (art. 46, que usa esa palabra), y sin superar el plazo de la
historia clínica de ese país. A eso se suma un piso propio de Brasil que no es de protección de
datos: el art. 15 del Marco Civil de Internet obliga a guardar **seis meses** de registros de acceso
a la aplicación, bajo secreto y entregables sólo por orden judicial. Es obligación de quien opera el
producto, no de la Prestadora.

Y lo que no se construye con una lista recordada: **la norma holandesa NEN 7513 es de pago y no se
leyó.** Antes de vender en Países Bajos hay que comprarla y comparar campo por campo.

**Comprobación:** se lee un paciente desde dos Prestadoras distintas con dos personas distintas y
el registro contesta las dos, por paciente, con los seis campos. Y se intenta alterar una entrada
del medio: la cadena tiene que quedar rota y el sistema decirlo.

### Tramo 3 — La revisión del registro, que es lo que casi nadie hace

El 45 CFR 164.308(a)(1)(ii)(D) es «Required», no «Addressable»: hay que **revisar** los registros,
con constancia fechada y revisor con nombre. Un registro que nadie mira incumple aunque sea perfecto.

Se construye la revisión como trabajo del sistema, no como formulario: el sistema junta lo que se
sale de lo normal —accesos fuera de horario, a pacientes sin relación de cuidado con quien accede,
en volumen inusual— y se lo presenta a quien revisa. Quien revisa firma que revisó. Esa firma es la
evidencia.

El acceso a un paciente sin relación de cuidado es la regla sueca —Patientdatalagen 4 kap. 2 §— y es
la más fina del conjunto: no alcanza con pertenecer a la Prestadora.

**Comprobación:** la constancia de revisión existe, tiene fecha y nombre, y se puede mostrar para
cualquier mes.

### Tramo 4 — Conservación, borrado y anonimización

Una tabla de reglas de retención, por jurisdicción y por clase de registro. No una constante en el
código: el art. 9(4) del GDPR deja los plazos a la ley nacional, y en Latinoamérica cada país cuenta
desde un hecho distinto.

Lo que la tabla tiene que poder expresar, porque hay un país que lo obliga:

- Un plazo que corre **desde la muerte del paciente** (Panamá, 20 años).
- Una **fórmula por edad** (Chile: 15 años, o hasta que el paciente cumpla 34 si es más largo).
- **Dos plazos encadenados** (Colombia: 5 años de gestión más 10 de archivo central, 15 en total
  desde la última atención; 30 si el paciente fue víctima de violaciones a los derechos humanos, y
  guarda permanente si la historia integra un proceso por delitos de lesa humanidad).
- **Un vencimiento que no habilita a borrar solo.** Brasil dice 20 años desde el último registro,
  para cualquier soporte, pero la ley dice que los prontuários **«podrán» ser eliminados**, previa
  revisión de una comisión y con registro del destino final; Colombia exige un acta de eliminación
  firmada y remitida a dos organismos. Vencido el plazo el sistema **avisa y espera**, nunca borra.
  Y hay una norma del consejo médico brasileño que sigue diciendo guarda permanente y que nunca fue
  revocada expresamente: por las dudas, el defecto no elimina.
- **Desasociar en vez de borrar** al vencer (Costa Rica, 10 años desde el hecho registrado).
- **Anonimizar o pseudonimizar el dato vivo**, no al vencer (Ecuador, LOPDP art. 31). Es la única
  norma del relevamiento que pide una técnica concreta sobre el dato de salud mientras se usa, y si
  se aplica en serio toca el diseño de las tablas y de los informes.

Hace falta además la **fecha de fallecimiento**, que hoy no existe en ninguna columna.

Y el borrado tiene que alcanzar los respaldos, o hay que documentar por escrito que no puede: el
borrado incompleto en entorno de varios clientes está nombrado como amenaza en el Apéndice C de NIST
SP 800-66r2, lo que lo convierte en amenaza razonablemente anticipada del 164.306(a)(2).

**El borrado es por dato, no por cuenta.** El art. 17(3) del GDPR dice «en la medida en que»: que la
historia clínica tenga que conservarse no hace inborrables las preferencias de comunicación, los
perfiles opcionales, las notas no clínicas ni las copias analíticas.

**Comprobación:** con dos Prestadoras de países distintos y las mismas fechas cargadas, el motor de
retención decide distinto en cada una, y lo explica citando la regla que aplicó.

### Tramo 5 — Los derechos de la persona

Exportación de lo propio, en formato que se pueda leer en otro lado. El Anexo II sección 2 del EHDS
lo convierte en deber duro contra el encierro en el proveedor, y la portabilidad está en casi todas
las leyes latinoamericanas.

Plazo de respuesta por jurisdicción: Costa Rica cinco días hábiles, Panamá diez para responder y
cinco para modificar, Argentina cuarenta y ocho horas para la copia de la historia clínica. Sale de
la configuración del país, con aviso a quien tiene que contestar antes de que venza.

Y quién hereda el derecho al fallecer cambia por país: en Costa Rica pasa a sucesores o herederos.

**Comprobación:** un pedido de acceso cargado en una Prestadora de Costa Rica vence a los cinco días
hábiles y avisa antes; el mismo pedido en Panamá vence a los diez.

### Tramo 6 — Las brechas, construidas para 24 horas

Hay cinco relojes y manda el más corto. Europa: NIS2 exige aviso temprano a las 24 horas, y el GDPR
art. 33(2) obliga al encargado a avisarle al responsable «sin dilación indebida», sin umbral y sin
derecho a filtrar. Estados Unidos: el 164.410 da 60 días al proveedor, pero **la regla no le da al
cliente 60 días nuevos**, así que un proveedor que consuma los suyos deja a su cliente en infracción
automática. Latinoamérica: Costa Rica cinco días hábiles **contados desde que ocurrió**, no desde
que se supo; Perú 48 horas; Brasil tres días hábiles; Panamá, Chile y Uruguay 72 horas.

Lo que se construye:

- **Poder decir, por evento, qué Prestadora y qué pacientes.** Sin eso cualquier incidente se vuelve
  notificación masiva. Depende del tramo 2.
- **Registro de incidentes**, todos, notificados o no: lo exige el art. 33(5) del GDPR y el art. 38
  del Decreto 285 panameño.
- **La evaluación de cuatro factores del 164.402(2)**, porque en Estados Unidos todo acceso no
  permitido se presume brecha salvo que se demuestre baja probabilidad de compromiso, y la carga de
  la prueba es de la empresa.
- **Plantillas de aviso por jurisdicción**, con el contenido mínimo de cada una. El
  164.404(c) pide cinco elementos; Costa Rica y Panamá piden los suyos.

**Comprobación:** un incidente de prueba sobre una Prestadora produce la lista de pacientes
alcanzados, el texto de aviso del país de esa Prestadora y la cuenta regresiva correcta.

### Tramo 7 — El registro clínico no se pisa

Versionado con nota aclaratoria: la corrección se agrega, la anterior queda, las dos con fecha, hora
y autor. Lo exige el art. 32 del Reglamento del Expediente de Salud de la CCSS de Costa Rica
—prohibidos correctores, tachaduras y sobreescritura— y el art. 17 del mismo reglamento dice que los
registros incorporados no pueden excluirse. Brasil pide irrefutabilidad del prontuário; Argentina,
historia clínica cronológica, foliada y completa.

Alcanza a `indicaciones_medicacion` y `rangos_referencia_vitales`, y a toda tabla clínica nueva.

**Comprobación:** se corrige una indicación y quedan las dos versiones, cada una con su autor y su
momento.

### Tramo 8 — Quién entra y cómo

- **Segundo factor obligatorio.** Está construido y apagado. Encenderlo es cambiar un dato. Ninguna
  norma vigente de Estados Unidos lo exige —el 164.312(d) es un estándar desnudo—, pero el proyecto
  de 2025 lo pediría y ningún comprador grande compra sin él.
- **Ninguna cuenta compartida.** El 164.312(a)(2)(i) exige identificación única por persona y está
  marcado «Required»: una cuenta compartida es incumplimiento liso y llano, sin evaluación de riesgo
  que valga.
- **Acceso de emergencia.** El 164.312(a)(2)(ii) también es «Required» y hoy no existe: hace falta
  una vía definida para llegar al dato cuando la vía normal no está, registrada y revisada como
  cualquier otra.
- **Cierre por inactividad para todos**, no sólo para el permiso de CeltaTech.
- **El acceso del personal propio.** C5 OPS-30.01B cubre la separación cliente-de-cliente **y**
  cliente-del-proveedor: el camino por el que el personal de CeltaTech alcanza los datos está dentro
  del alcance de la auditoría. La forma ya está escrita en `..\..\CLAUDE.md` §6 —una Organización por
  vez, acotado, con corte por inactividad, todo auditado—, y lo que falta es que no exista ninguna
  credencial permanente que alcance a varias: eso lo resuelve el plan de aislamiento.

**Comprobación:** con el segundo factor obligatorio encendido, una cuenta sin él no entra a ninguna
pantalla del Panel.

### Tramo 9 — Cifrado y custodia de claves

El cifrado en reposo y en tránsito es «Addressable» en Estados Unidos, lo que no quiere decir
opcional: el 164.306(d)(3) da tres salidas y las dos últimas exigen documento conservado seis años.

La razón de verdad para cifrar es otra: **el puerto seguro de la notificación de brechas.** La regla
alcanza sólo a datos «no asegurados» (164.402), y la guía del Secretario condiciona el amparo a que
la clave que permitiría descifrar no haya sido comprometida. De ahí sale el requisito de diseño:
**custodia de claves separada del depósito de datos y con alcance por Prestadora.** Una clave para
todas convierte un compromiso en brecha de todas.

Y el cifrado no salva la notificación en Europa: el art. 34(3)(a) exime de comunicar a las personas,
nunca de notificar a la autoridad. Frente a una falla de la aplicación o de una consulta que cruza
Prestadoras el cifrado en reposo no vale nada, porque en ese camino el dato estaba descifrado.

**Comprobación:** las claves de una Prestadora no descifran nada de otra.

### Tramo 10 — Respaldos que se probaron

El 164.308(a)(7)(ii)(A), (B) y (C) son «Required»: copia exacta y recuperable, restauración y modo
de emergencia. Probar el plan es «Addressable», y el Decreto 41/2012 chileno lo escribe como
requisito de la ficha clínica: respaldos, medidas contra accesos no autorizados y capacidad de
restaurar el servicio. En Francia la copia de respaldo es una de las actividades certificables del
référentiel HDS.

**Y hay un país que fija frecuencia.** El art. 51 del DS 016-2024-JUS peruano exige copias de
respaldo **semanales** con verificación de integridad. Es el único plazo numérico del relevamiento,
así que manda: si el respaldo diario que hoy corre se detuviera, la falta empezaría a contarse a la
semana.

Se construye la restauración probada y con constancia, no la promesa de que se puede.

**Comprobación:** una restauración completa a un entorno aparte, con constancia de fecha y de qué se
verificó.

### Tramo 11 — La configuración por país, cargada

La estructura existe y está vacía de esta materia. Se carga, por jurisdicción: plazos de
conservación con su hecho de inicio, plazo de brecha con su destinatario y desde cuándo corre, plazo
de respuesta a los derechos, mecanismo de transferencia internacional, contacto del delegado u
oficial de protección de datos donde sea obligatorio, y el texto de consentimiento que cubra
específicamente la transferencia internacional donde haga falta.

Vale la regla de la empresa: **el producto avisa, no bloquea**, y el aviso sale del documento legal
de ese país. Si el país no tiene documento, no hay aviso, y sin documento no se vende ahí.

**Y los documentos legales de `docs/legal/` hay que ampliarlos, empezando por Argentina.** Los 21
archivos de país existen, pero el de Argentina —el único desarrollado— cubre riesgo laboral:
penalización de inasistencias, rankings, puntuaciones. La materia de protección de datos de salud,
conservación del expediente y notificación de brechas todavía no está escrita en ninguno.

**Comprobación:** ningún plazo de estos aparece escrito en el código.

### Tramo 12 — Los documentos que pide la auditoría

Son entregables, y sin ellos lo construido no cuenta.

- **Análisis de riesgos que nombre expresamente el acceso entre Prestadoras como amenaza**, citando
  el Apéndice C de NIST SP 800-66r2, que lo enumera en tres eventos. Sin esto, nada más ayuda.
- **Evaluación de impacto.** Obligatoria y previa al tratamiento: concurren el art. 35(3)(b) del
  GDPR y cuatro de los nueve criterios de la guía WP248 contra un umbral de dos, y los ficheros de
  pacientes están en las listas de Francia y España. El encargado no la hace, pero el art. 28(3)(f)
  lo obliga a asistir: es un entregable del producto. Brasil, Perú, Uruguay, Ecuador y Panamá piden
  su equivalente.
- **Registro de actividades del art. 30(2).** La exención del 30(5) no sirve: tratar datos del art. 9
  la derriba.
- **La prueba de aislamiento repetible** del plan de aislamiento, más **una prueba de penetración de
  tercero dirigida al acceso entre Prestadoras.** C5 la pide como evidencia cuando la separación no
  se puede demostrar internamente con suficiente seguridad, y el art. 32(1)(d) del GDPR convierte la
  verificación periódica en obligación legal.
- **La documentación de cada «Addressable» que no se implemente**, conservada seis años
  (164.316(b)(2)(i)).
- **La constancia de prácticas de seguridad reconocidas.** El 42 U.S.C. §17941 obliga al regulador a
  considerarlas, pero exige acreditar **no menos de los doce meses anteriores**: lo adoptado después
  del incidente no vale nada. Es la única palanca real que existe, y es la que hay que empezar a
  acumular temprano.
- **`docs/CUMPLIMIENTO_NORMATIVO.md`**, que es el documento que cita a qué da cumplimiento el
  sistema, y que se mantiene al día con cada tramo.

**Comprobación:** cada documento existe y lo que afirma se puede verificar en el sistema.

### Tramo 13 — Lo que no se hace nunca

- **No se entrenan modelos con datos de las Prestadoras.** Prohibido por tres vías: el art. 28(10)
  del GDPR convierte al encargado en responsable, el EHDS haría del producto titular de datos
  sanitarios, y su art. 54 lo prohíbe expresamente. Y el art. 11 §4º de la LGPD brasileña prohíbe
  compartir datos de salud con fines de ventaja económica.
- **Nada de riesgo alto del AI Act sin saberlo.** La exposición no está en la vía clínica sino en el
  Anexo III punto 4(b): la IA que asigna tareas según comportamiento o rasgos personales o evalúa
  desempeño. Un emparejamiento o una planificación de Asistentes que los puntúa **es alto riesgo**, y
  la salida del art. 6(3) queda cerrada por el perfilado. Rige desde el 2 de diciembre de 2027, con
  autoevaluación —no hace falta organismo notificado—, pero no hay norma armonizada, así que tampoco
  hay presunción de conformidad. **La transparencia del art. 50 no se aplazó y rige desde el 2 de
  agosto de 2026.**

**Comprobación:** un automatismo que corte la publicación si aparece una llamada de entrenamiento
con datos de producción.

---

## 4. Lo que no hay que construir

Cada renglón es un ahorro, y está verificado.

- **No hace falta una base de datos por Prestadora.** Ninguna norma prohíbe la base compartida, ni
  prescribe esquema, base o instancia por cliente. C5 admite expresamente recursos compartidos y
  dice que la separación criptográfica no es obligatoria en todos.
- **No hace falta que el control de acceso viva fuera de la aplicación.** Se buscó en todas las
  fuentes y no existe la exigencia. Lo que exigen es poder demostrar la separación, que es distinto
  y más difícil.
- **No hace falta certificarse en HIPAA: no existe esa certificación.** Ni oficial, ni acreditada.
  Todo sello que diga lo contrario es autoafirmación y no sirve como defensa.
- **No existe «estar certificado en GDPR».** Los arts. 42 y 43 certifican operaciones concretas, no
  organizaciones, y el 42(4) dice que no reducen la responsabilidad.
- **SOC 2 no es una certificación** y no contiene ninguna regla que diga «aísle a sus clientes»: los
  controles los define la empresa y el auditor prueba los que ella definió. Sirve igual, porque es
  el sustituto de mercado del derecho de auditoría que HIPAA no da.
- **C5 no es una certificación**, es un dictamen de auditor. Pero el §393 SGB V lo vuelve condición
  legal en Alemania.
- **ISO 27799 no se certifica**, y 27017 y 27018 no se certifican por separado: se auditan junto con
  ISO/IEC 27001.
- **No hace falta construir el proyecto estadounidense de 2025.** No es ley, está en acciones de
  largo plazo con fecha proyectada en julio de 2027, y el propio regulador estimó su costo en 9.000
  millones de dólares el primer año.
- **El producto no es una DiGA alemana** y no hay que perseguir esa inscripción.
- **El Reglamento de ciberresiliencia no alcanza al software como servicio.** Entraría sólo por la
  aplicación de teléfono con su servidor.
- **El esquema nacional de seguridad español no aplica** salvo que se venda al sector público.
- **HIPAA no exige inventario de activos, ni mapa de red, ni auditoría anual, ni prueba de
  restauración, ni prueba de penetración.** Varias de esas cosas están igual en este plan, pero
  porque las piden C5, el mercado o la prueba del aislamiento, no HIPAA.

---

## 5. Lo que quedó sin verificar y no se completó de memoria

- **El référentiel HDS francés no se pudo leer.** Es donde estaría la exigencia francesa de
  compartimentación entre clientes. Se pide al organismo certificador cuando se abra esa
  conversación.
- **La norma holandesa NEN 7513:2018 es de pago.** Su lista de campos y su plazo son desconocidos:
  el registro de accesos no se diseña para Países Bajos sin comprarla.
- **El precio del complemento de Supabase para datos de salud estadounidenses** es dato de tercero,
  no publicado.
- **Los importes de sanción ajustados del año en curso** no se consultaron. Ninguna cifra de multa
  se usa sin buscar la tabla vigente.
- **Italia, Bélgica, Polonia, Dinamarca, Noruega y Finlandia** no se relevaron. El de Finlandia es
  el que más importa: su ley clasifica los sistemas en clase A o B con evaluación de conformidad por
  organismos aprobados.
- En Latinoamérica quedaron sin verificar los regímenes sancionatorios de casi todos los países y
  varios plazos de respuesta a derechos. Están listados país por país en el relevamiento.

---

## 6. Qué no hace este plan

No construye interoperabilidad nacional. Uruguay obliga a intercambiar por la plataforma HCEN,
Colombia a interoperar la historia clínica electrónica, Perú a declarar al RENHICE, y México exige
que el sistema de expediente electrónico esté certificado ante la Dirección General de Información
en Salud antes de vender. Son cuatro obras propias, cada una con su plan, y ninguna es condición
para las demás.

No decide la región. El tramo 1 pone la decisión sobre la mesa con sus consecuencias; tomarla es del
Desarrollador.

No reemplaza a un abogado de cada país. Todo esto es relevamiento de fuentes públicas.
