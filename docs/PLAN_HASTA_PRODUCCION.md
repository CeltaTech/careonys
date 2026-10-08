# PLAN HASTA PRODUCCIÓN — Careonys

**Una sola lista, en orden.** Se hace el 1, después el 2, y así hasta el final. **Acá no se escribe
cuántos pasos son**, porque el total se corre solo con cada paso que se borra.

**Está todo acá.** Lo que falta para vender, lo que falta para que el aislamiento lo haga cumplir
la base, y lo que falta para resistir una auditoría de datos de salud. No hay otra lista.

**El orden se eligió por un criterio y no por otro:** primero lo que obliga a reescribir si se deja
para después, y al final lo que se agrega encima sin tocar nada. No se escribe algo para después
cambiarlo.

- Los pasos que empiezan con **Usted** los contesta o los hace el Desarrollador. Los demás los hago yo.
- **Un paso terminado se borra de este archivo.** No se marca como hecho: se saca.
- **No se abren pendientes nuevos.** Un problema que aparece se arregla en el momento; si no cabe en la tarea que se está haciendo, se agrega como paso en el lugar de la lista que le corresponde.
- **Nada de acá se cita por número desde afuera.** El número se corre solo con borrar un paso terminado, así que un documento que diga «paso 103» miente apenas se avanza. Desde otro documento se cita este archivo y el título de la sección.

---

## Por dónde se empieza

**La obra está en la sección «Los cimientos».** Es lo que hay que hacer antes que cualquier otra
cosa, y mientras dure **no sale ninguna pantalla nueva**.

**El plan está aprobado en su ordenamiento y en sus dos decisiones de fondo**, que ya no se
vuelven a preguntar: los datos viven en São Paulo con el código previsto para más de una
región, y el segundo nivel de aislamiento se construye ahora.

**Los pasos de «Lo que se dijo que decidió usted» no frenan la obra.** Son una conversación con el
Desarrollador, renglón por renglón, y avanzan cuando él abra un grupo. Ninguno de ellos es
condición del trabajo de los cimientos.

---

## Lo que se dijo que decidió usted

**Va primero porque condiciona todo lo demás.** Una revisión de los documentos del producto
encontró decisiones escritas como suyas que no traen ninguna cita suya. Varias ya están
construidas. Si alguna no es suya y se cambia, lo que se levante encima mientras tanto se tira.

**Salió de dos revisiones que no coincidieron entre sí**, así que la lista es la unión de las dos
y puede tener alguna de más o de menos. Las marcadas **[ya construido]** tienen código o una
migración aplicada detrás.

**1. Usted** — De cada renglón de abajo: ¿la decisión es suya o no? Si no lo es, ¿se borra, se
reescribe sin ponerle autor, o la decide ahora? **Se abre un grupo entero por vez**, en el orden en
que están, y adentro se contesta renglón por renglón.

**2.** Aplicar lo contestado. **Un grupo se aplica cuando está contestado entero**, porque adentro
de un grupo las respuestas se apoyan unas en otras. Cada renglón se borra de acá al cerrarse.

**Están agrupados por tema, y los grupos van de más grave a menos.** Adentro de un grupo las
decisiones se sostienen entre sí: contestarlas de a una, salteadas, hace que la respuesta de una
contradiga la de otra que ya se cerró. **Se contesta grupo por grupo**, y adentro de cada uno,
renglón por renglón.

### 3. Los mensajes: qué detecta el sistema solo y a quién le avisa

Los cuatro son el mismo mecanismo mirado desde documentos distintos. Qué detecta, si se puede
apagar, y por dónde sale el mensaje.

- `docs/DATA_MODEL.md:591` y `docs/PRD_04_05_App_Servicio.md:168` — **[ya construido]** que el sistema detecte las ausencias y avise temprano solo.
  **Contestado, con cambios. Se aplica cuando cierre el grupo.** El sistema junta información y
  sugiere; **decide el Coordinador**, y cada Prestadora ajusta todo a su forma de trabajar.
  - **Titular que avisa que se demora:** el GPS calcula cuánto le falta. Dentro del margen de
    espera toma el turno con llegada tarde registrada. Fuera del margen se pregunta a los
    relevos si están disponibles y cuánto tardan; el Coordinador compara y, si llega antes el
    titular, se cancela la búsqueda; si llega antes un relevo, la guardia pasa a él y al titular
    se le avisa que no vaya.
  - **Titular que no avisa:** si el GPS no lo muestra en camino a tiempo, el Coordinador recibe
    un preaviso y pone en marcha el reemplazo. Si el titular aparece tarde, esté el relevo
    trabajando o en camino, el Coordinador decide quién se queda.
  - **A los relevos se les pregunta siempre** si están disponibles y cuánto tardan, también al
    personal de emergencia. Cada uno escribe su tiempo y el GPS calcula otro; los dos son
    referencia y el Coordinador los ve juntos.
  - **Orden de llamado, configurable por Prestadora:** personal de emergencia, si lo tiene; si
    no, el franquero; después quienes cubren la misma guardia en otros días u horarios. Hoy ese
    último grupo no se puede elegir aparte: está mezclado con todos los Asistentes libres del Padrón, en el grupo
    guardado como `suplente` (`backend/src/utils/faseAutomaticaRelevo.js:38`). El nombre guardado
    queda; el visible no: hoy la configuración del orden lo muestra como «Suplente» en los tres
    idiomas (`panel/src/i18n/translations.js:638`, `:3526`, `:6375`), palabra que el glosario no
    admite. La redacción nueva la aprueba el Desarrollador.
  - **El Asistente del turno saliente se queda** hasta que lo releven.
  - **Lo anotado del Asistente y el estado de la guardia son dos cosas.** Si llega tarde y
    marca, queda «llegada tarde», aunque ya se lo hubiera marcado ausente: esa marca es
    provisoria. Si no llega nunca, «ausente». Una guardia cubierta nunca figura ausente.
  - **El pedido de relevo se cierra como resuelto** con la llegada del titular o del relevo, o
    cuando el Coordinador elige entre los dos, y deja de insistirse. Hoy sigue abierto aunque el
    titular llegue.
  - **A todos los que se les preguntó se les avisa que quedó resuelto**, hayan contestado o no.
  - **Penalizar al titular y compensar al relevo son dos opciones separadas** que cada
    Prestadora usa o no. Hoy no existen.
- `docs/PRD_04_05_App_Servicio.md:179` — que las alertas se puedan enchufar y sacar.
- `docs/PRD_06_WhatsApp_IA.md:121` — el catálogo de mensajes, los reintentos y a quién se escala.
- `docs/PRD_06_WhatsApp_IA.md:26` — que el número y la cuenta de WhatsApp sean de cada Prestadora.

Y colgada de ese último, una decisión de seguridad que sólo tiene sentido si el número es de cada
Prestadora:

- `docs/PRD_06_WhatsApp_IA.md:105` — que las credenciales de Meta queden donde ni el rol técnico las lea.

### 4. La marca, el sitio y dónde viven los archivos

Los tres se sostienen entre sí: la marca compartida obliga a que el logo de cada Prestadora se vea
en las pantallas, y de ahí sale el depósito público, que es la única excepción a «los archivos se
guardan privados».

- `docs/MARCA.md:5` y `:27` — **[ya construido]** el modelo de marca del producto: compartida con la Prestadora y no marca blanca.
- `docs/claude_history.md:123` — **[ya construido]** que el depósito de logos sea público para leer. **Se contesta junto con el paso de más abajo que pregunta si la regla admite esa excepción o si el depósito se cierra:** ahí se decide qué pasa, acá sólo si la decisión fue suya.
- `docs/PRD_01_Sitio_Web.md:195` — que la página de cada Prestadora la arme CeltaTech y no sea función de Careonys. **Se contesta antes que el paso que autoriza construir el sitio**, más abajo: si esto no es suyo, ese documento cambia antes de que se construya nada.

### 5. Documentos enteros atribuidos de una sola vez

No es una decisión sino un documento completo puesto a su nombre. Si no es suyo, lo que hay que
revisar es el documento entero, no un renglón.

- `docs/PRD_07_Modalidad_Match.md:3` — el planteo entero de la modalidad Match. **La parte de cómo se cobra el contacto no se contesta acá: ya está escrita en la sección de la modalidad Match**, más abajo.
- `docs/PRD_02_Panel_Admin.md:15` — el planteo entero del Panel.
- `docs/PRD_08_Dashboard_Modalidades.md:213` — ocho puntos de diseño del tablero, cerrados de una sola vez y con fecha.
- `docs/PLAN_CONTINUIDAD_PROVEEDORES.md:229` — qué se hace si cae un proveedor.

### 6. Cómo se elige construir, que no se ve en ninguna pantalla

Las tres deciden con qué criterio se elige, no qué se construye. Por eso van juntas: o valen las
tres o no vale ninguna.

- `docs/claude_history.md:387` — **[ya construido]** que lo propio del producto no quede atado a la plataforma de base de datos.
- `docs/claude_history.md:395` — que la arquitectura se elija pensando en que dure, no en lo más rápido de hacer.
- `docs/claude_history.md:353` — que la empresa tenga que poder operar con poca gente.
- `docs/claude_history.md:411` — que el nivel visual del producto tenga que superar al de la competencia.

### 7. Sueltas, que no se agrupan con ninguna otra

Éstas sí se contestan de a una, en cualquier orden.

- `docs/claude_history.md:324` — **[ya construido]** que una guardia pueda tener más de un Paciente. Sigue en pie con la escala que ahora tiene el glosario: vale para la guardia y también para cada turno adentro de ella, y no traba nada de lo que sigue.
- `docs/claude_history.md:225` y `:226` — **[ya construido]** que se descarte la pantalla de obra social con reglas escritas en el código, y que el informe de obra social sea sólo del Panel.
- `docs/claude_history.md:417` — **[ya construido]** que el tipo de cambio quede afuera de la regla de la moneda.

**3.** La segunda etapa: los otros dos grupos de la misma revisión. Veinticuatro renglones que sí
traen una cita suya —hay que comprobar que la cita sostenga lo que cuelga de ella— y trece donde
hay comillas pero dicen menos de lo que se les hizo decir. El caso más claro de los trece: todo el
reemplazo de la identidad visual se apoya en cuatro palabras suyas que expresan disgusto y no
dicen con qué reemplazarla.

**4.** Lo mismo en los documentos de la empresa, que tienen su propia lista y un caso aparte: el
documento del modelo comercial dice por escrito que usted delegó esas definiciones, pero otros
documentos ya citan lo que salió de ahí como decidido por usted, sin arrastrar la advertencia.

---

## Los cimientos

**Va primero, y es lo único de esta lista que no se puede reordenar.** Todo lo de acá toca las
mismas dos cosas: cómo le habla el producto a la base, y la forma de lo que queda guardado. Hecho
ahora es un trabajo; hecho después es el mismo trabajo más deshacer lo que se haya construido
encima.

**El criterio con el que se armó es del Desarrollador:** no se escribe algo para después cambiarlo.
Entonces entra acá todo lo que obligaría a volver sobre código o datos ya escritos, y queda para el
final de esta lista todo lo que se agrega encima sin tocar nada.

**Mientras dure no sale ninguna pantalla nueva.** Ese es el precio de hacerlo en este orden, y es
el que evita el enredo.

**Cada paso termina con su comprobación, y no se empieza el siguiente sin que la del anterior pase.**

### Qué hay hoy

Medido contra la base en vivo y contra el código, no contra documentos.

**Una sola llave abre todo.** El backend entra con `SUPABASE_SERVICE_ROLE_KEY`, que alcanza las 182
tablas de todas las Prestadoras y se saltea la protección por fila. Se crea en
`backend/src/db/connection.js` y la importan 135 archivos. La nombran además
`backend/src/utils/cuentasPanel.js`, que la manda a mano en una cabecera, y
`backend/src/routes/appClientes.js`.

**Lo que separa una Prestadora de otra es un filtro escrito a mano.** `acotarAPrestadora` agrega la
condición en 71 renglones. De las 886 consultas del backend, **111 no nombran la Prestadora**, y de
ésas **17 confían en un identificador que viene de afuera sin comprobar de quién es** —sólo en 1 se
verificó que la comprobación exista—. Si falta un filtro, la base contesta igual: no tiene con qué
darse cuenta.

**Los 11 depósitos de archivos tienen política**, pero el backend los sirve con la llave maestra,
que no pasa por ella, y el aislamiento real sigue siendo **comparar a mano el comienzo de la ruta
del archivo** (`panelMedicacion.js:181`, `panelVitalesAutorizacion.js:79`).

**La protección por fila está puesta y hoy no protege de nada.** Las 182 tablas la tienen encendida
y 170 tienen política, y ninguna depende de nada que aporte el backend: la Prestadora la resuelve
`interno.current_tenant()` con la cuenta de quien entró. **La base ya sabe aislar y nadie le está
preguntando.**

**Lo que no tiene persona detrás ya no usa la llave maestra**: las tareas automatizadas, la carga de
los mensajes del sistema, las entradas que llaman otros programas y las 8 puertas públicas corren
con la credencial del trabajo sin persona, de a una Prestadora por vez. Con la llave maestra
quedan la entrada con la huella (`routes/llaveDelDispositivo.js:191`), la recuperación del código
extra del personal técnico (`utils/mfaRecuperacionEmail.js:87-90`) y todo lo que pide una persona
desde las pantallas.

**Casi nadie sabe quién leyó qué.** Las lecturas de información de salud se anotan encadenadas en
`consultas_a_hce`, pero hoy sólo desde `appAsistentesMedicacion.js`; el resto se suma con el paso 9. `auditoria_de_accesos` tiene `admin_id` no
nulo, así que sólo alcanza al personal de CeltaTech, y tiene cero filas. Y no es inmutable: la
llave maestra puede borrarlo.

**El registro clínico ya no se pisa.** Cada alta, corrección o baja de `indicaciones_medicacion` y
`rangos_referencia_vitales` deja una copia en `versiones_registro_clinico`, con autor, momento y
nota aclaratoria, y ese historial no lo edita ni lo borra nadie. Mientras el backend escriba con la
llave maestra, lo que se corrige desde el Panel queda sin autor: eso se arregla con el paso 9.

**La conservación tiene dónde apoyarse y nada que la haga correr.** Existen
`pacientes.fecha_fallecimiento` y la tabla `reglas_de_conservacion`, vacía; no hay ninguna tarea que
purgue. Lo que hay es borrado lógico: un dato marcado como borrado queda para siempre.

**No hay exportación ni portabilidad.** El derecho de acceso se atiende a mano, contra la base.

**El cierre por inactividad existe sólo para el permiso de acceso de CeltaTech.** Las sesiones de la
gente de la Prestadora no se cierran. **El segundo factor está construido y apagado**:
`requiereRolPanel.js:82-85` rechaza la credencial que no llegó a `aal2`, gobernado por
`configuracion_plataforma.mfa_admin_obligatorio`, que hoy vale `false`.

**La estructura de configuración por país está hecha y vacía.** `advertencias_legales` tiene 13
filas, todas de jurisdicción `AR`, y las trece son de materia laboral o de Match: ninguna es
de protección de datos. `escalas_legales` también es sólo `AR`.

**Los datos están en São Paulo** (`sa-east-1`). Para Brasil es tratamiento local; para todos los
demás países es transferencia internacional hacia Brasil.

**Lo que sí está bien.** Los secretos de pasarelas viven en Supabase Vault, no en claro. Diez de
los once depósitos son privados y se sirven con enlace temporal. El consentimiento se registra
con texto versionado, con quién consintió, por qué medio, desde cuándo y hasta cuándo.

### Qué queda cuando esto termina

- **`SUPABASE_SERVICE_ROLE_KEY` no existe en el producto.** No está en el código, ni en el
  repositorio, ni en las variables de entorno del backend.
- **Todo pedido de una persona viaja con la credencial de esa persona**, y la base decide qué filas
  contesta. Un filtro olvidado no devuelve datos de otra Prestadora: no devuelve nada.
- **El trabajo sin persona detrás tiene su propia credencial**, acotada a sus tablas y funciones y
  de a una Prestadora por vez. Es la llave del cuarto de máquinas, no la del edificio.
- **`acotarAPrestadora` se borra.** Con la base decidiendo, un filtro en el código es una
  duplicación que puede contradecirla.
- **Cada lectura de un dato de salud deja constancia**, con la Prestadora, la persona que accedió,
  el paciente, la categoría de dato, el momento y el origen. Consultable por paciente.
- **Esa constancia no se puede alterar sin que se note.**
- **Los cuatro depósitos sin política tienen política**, y ningún archivo se autoriza comparando
  texto de una ruta.
- **Ninguna corrección clínica pisa lo anterior.**
- **El estado de la base se lee en un archivo, no en 150.**
- **Nadie puede volver a abrir la puerta sin que el automatismo lo pare.**

Y lo que queda cuando termina el resto de esta lista, que se apoya sobre lo anterior:

- **Cada dato tiene plazo, y al vencer se borra o se desasocia**, según lo que mande el país de esa
  Prestadora y la clase de registro.
- **Una persona puede pedir lo suyo y llevárselo**, y el sistema lo arma solo, dentro del plazo de
  su país.
- **Un incidente se puede acotar a las personas realmente alcanzadas y avisar en 24 horas.**
- **El sistema sabe en qué país opera cada Prestadora** y de ahí salen los plazos, los textos y los
  avisos. Ninguno está escrito en el código.
- **Existen los documentos que la auditoría pide**, y dicen la verdad porque salen del sistema.

### Los pasos

**5.** **Dónde viven los datos: São Paulo, y el código preparado para más de una región.**
Decidido. No se abre alojamiento europeo hasta que haya un cliente europeo: pagar por un mercado
que todavía no existe es gasto sin contrapartida, y esa puerta se abre el día que haga falta.
Hasta entonces **Europa no se vende**, y no por trámite: Alemania y Francia exigen que los datos
de salud estén en Europa —no necesariamente en su propio país— y con un proveedor que tenga la
certificación de salud de ese país. Eso se comprueba contra la norma de cada uno el día que se
escriba su documento legal. **Estados Unidos sí se puede vender sin mudar nada**, porque no
exige residencia: lo que pide es el contrato con el proveedor de la nube, que es dinero y no obra.

**Una región es el lugar del mundo donde viven los datos de una Prestadora, con todo lo que los
toca**: la base, los archivos, las copias de respaldo, el Backend y los servicios que reciban esos
datos. Es una copia entera del producto, con el mismo código y sin nada compartido con las demás.
Cada Prestadora vive en una sola, que no tiene por qué ser la de su país.

Lo que se construye acá es una sola cosa: **ninguna parte del código da por sentado que hay una
sola base. La Prestadora trae consigo a cuál pertenece.** Dejarlo previsto ahora no cuesta nada;
agregarlo el día que aparezca el cliente europeo es reescribir. Cuando eso pase, el identificador
de una Prestadora deja de ser único en el producto y pasa a serlo por región, y la puerta de
entrada tiene que saber a qué región mandar a cada quien. Nada más del producto se resiente:
cada Prestadora es un cajón cerrado, el banco de Asistentes es por Prestadora y la elección es por
cercanía al paciente, así que nada necesita ser único cruzando el océano.

**En el backend, el punto donde se elige la región ya existe:** `backend/src/db/regiones.js`.
Hoy hay una sola, armada con `SUPABASE_URL` y `SUPABASE_ANON_KEY`; la credencial de una persona se
manda a la región que la emitió, y una que no emitió ninguna no entra. Falta lo que
todavía no tiene de dónde sacarse: a qué región pertenece cada Prestadora y la puerta de
entrada de las pantallas.

**Y lo que no es código: las cláusulas firmadas antes del alta de la primera Prestadora real.**
Brasil no figura en la lista de países adecuados de la autoridad argentina, así que alojar en São
Paulo es una transferencia internacional. Lo que la habilita son las cláusulas contractuales tipo
que esa misma autoridad redactó y publicó: se adoptan tal como están, adentro del contrato entre
CeltaTech y la Prestadora. No hay que buscar proveedor en Argentina: la ley no obliga a alojar
dentro del país. **Cuál es esa cláusula, de dónde sale, quién la firma y qué hay que definir antes
de redactarla está en `celtatech/docs/CLAUSULA_TRANSFERENCIA_INTERNACIONAL.md`.**

Lo que obliga cada lado, que es lo que sostiene todo lo anterior:

- **Alemania.** El §393 SGB V limita el lugar de tratamiento a Alemania, el Espacio Económico
  Europeo o un tercer país con adecuación donde el proveedor tenga establecimiento nacional, y
  exige dictamen BSI C5 Tipo 2 vigente. Brasil no califica.
- **Francia.** Alojar datos de salud exige alojador certificado HDS (art. L.1111-8 del Code de la
  santé publique). Hacerlo sin certificación es delito (art. L.1115-1).
- **Unión Europea en general.** Brasil no tiene decisión de adecuación: sería transferencia del
  Capítulo V, con cláusulas y evaluación de impacto de la transferencia.
- **Estados Unidos.** No hay requisito de residencia, pero sí de contrato: el proveedor de nube es
  business associate y hace falta acuerdo firmado (45 CFR 164.308(b)(1) y 164.502(e)). Supabase lo
  ofrece sólo en nivel Team o Enterprise más complemento pago, y exige recuperación a un punto en
  el tiempo, forzado de SSL, restricciones de red y registro de conexiones siempre encendido.
- **Argentina, que es el primer mercado.** Es el caso más fácil y no es automático: Brasil no
  figura en la lista de países adecuados del art. 3 de la Disposición 60-E/2016, sustituido por la
  Resolución AAIP 34/2019. Alojar en São Paulo es transferencia del art. 12 de la Ley 25.326, y lo
  que la habilita son las cláusulas contractuales tipo del Anexo II de esa disposición, adentro del
  contrato entre CeltaTech y la Prestadora. **Tiene que estar firmado antes del alta de la primera
  Prestadora real.** La excepción de datos médicos del art. 12(2)(b) es para un intercambio
  concreto exigido por el tratamiento de un paciente y no cubre alojar el padrón: no se la invoca.
  **Y hay cuatro destinos donde no haría falta ningún instrumento, porque la lista argentina los
  declara adecuados: la Unión Europea, el Reino Unido, Suiza y Uruguay.** Uruguay es el único de la
  región y el de menor demora de conexión, y eso es dato para esta misma decisión.
- **Brasil.** Un dato brasileño alojado en Brasil no es transferencia y no necesita instrumento.
  Brasil sólo declaró adecuada a la Unión Europea (Resolución CD/ANPD 32/2026); hacia cualquier
  otro destino rigen las cláusulas-patrón del Anexo II de la Resolución CD/ANPD 19/2024, que se
  adoptan **íntegras y sin modificar** —cualquier cambio las invalida— y cuyo plazo de adaptación
  de contratos anteriores venció el 23 de agosto de 2025.
- **Latinoamérica.** Ninguno de los diez países prohíbe el destino ni obliga a alojar dentro de sus
  fronteras. Costa Rica exige consentimiento expreso que cubra específicamente la transferencia
  internacional, no el genérico de tratamiento (Ley 8968 art. 14; omitirlo es falta gravísima).
  Panamá exige informar cuál condición del art. 33 se invoca. Argentina, Brasil y Perú exigen
  cláusulas contractuales del modelo de su autoridad. Colombia no exige nada especial hacia Estados
  Unidos.
- **Tres países no llaman transferencia a esto.** **Ecuador** lo dice expresamente —art. 4 y art.
  34 de la LOPDP, y art. 23 de la Resolución SPDP-SPD-2026-0004-R: «el encargo de tratamiento no
  constituye una transferencia ni comunicación de datos personales»—, y en consecuencia las
  cláusulas iberoamericanas entre responsable y encargado **no son aplicables allá**: lo que hace
  falta es el contrato de encargo del art. 34. **Costa Rica** excluyó lo mismo al reformar la
  definición. **Uruguay** llegó al mismo lugar por otro camino: Brasil no está en su lista de
  países adecuados (Resoluciones URCDP 23/021 y 63/023), pero la URCDP declaró ajustadas a la
  normativa nacional las cláusulas contractuales de AWS (Resolución 42/022) y autorizó
  transferencias fundadas en ellas (Resolución 18/024). Eso habilita São Paulo para datos
  uruguayos.
- **Chile, que es el caso más incómodo.** Su ley entra en vigor el 1-12-2026 y **la Agencia todavía
  no está constituida**: no hay lista de países adecuados, no hay cláusulas modelo, no hay contratos
  tipo. La única vía practicable es la del art. 27 lit. b), cláusulas contractuales, y el art. 28
  pone **la carga de acreditarlo sobre la Prestadora**, que sólo puede hacerlo con documentación que
  le dé CeltaTech. Además el art. 15 bis prohíbe subencargar sin **autorización específica y por
  escrito** de cada Prestadora —el proveedor de nube es un subencargado, y la autorización hay que
  pedirla y guardarla—. Y no hay refugio geográfico: el art. 1 bis lit. b) aplica la ley chilena al
  encargado que trabaja para un responsable establecido en Chile, esté donde esté.

**Comprobación:** por cada país donde haya una Prestadora dada de alta, `docs/CUMPLIMIENTO_NORMATIVO.md`
nombra qué habilita el alojamiento y con qué instrumento. Sin eso, el alta no se aprueba.

**6.** **Lo que queda del segundo nivel de aislamiento, el que Chile exige.** La regla ya está
escrita en la base (la política `la_informacion_de_salud_la_ve_quien_atiende` y la función
`interno.alcanza_la_informacion_de_salud`),
y aplicada: la política es restrictiva, de lectura, y está en nueve tablas. Con la restricción de HCE encendida, la información de salud de un paciente la lee
sólo quien lo atiende y el Administrador de su Prestadora; donde la tabla de requerimientos legales de HCE por país la pide, como en
Chile, la restricción queda fija y no se apaga. Lo que falta:

- **Hasta el paso 9 protege sólo lo que se lee con sesión propia.** El backend entra con la llave
  de servicio, que no pasa por RLS. Cierre: el paso 9 terminado, y la prueba repetida por el
  backend con la credencial de la persona.
- **Escribir un registro clínico también pide atender al paciente** cuando se pide la fila de vuelta: la
  base rechaza un alta que devuelve una fila que quien la cargó no puede leer, y un cambio o un
  borrado no alcanza filas que no se leen. Un Coordinador que no lo atiende y carga un rango de un
  paciente recibe un rechazo; el Administrador sí lee la información de salud de todos los
  Pacientes de su Prestadora. Cierre: al llegar el paso 9, revisar cada pantalla que escribe en
  esas tablas.
- **Las columnas de salud del Paciente** —patologías, medicación habitual, nivel de
  complejidad— quedan afuera: RLS filtra filas, no columnas. Cierre: se mudan a una tabla propia
  que siga la misma regla, o se decide que no son historia clínica.
- **Una persona sacada a mano del equipo sigue atendiendo al paciente** para la base si tiene
  guardias o series suyas en un Servicio vigente: la regla no mira las exclusiones del equipo.
  Cierre: decidir si una exclusión le quita la lectura.
- **Ninguna pantalla ofrece la restricción.** Donde el país la exige es fija, y sólo CeltaTech la
  mueve, desde `requerimientos_legales_de_hce_por_pais`; donde no, es decisión de la Prestadora y
  la cambia su Administrador, cosa que la base ya permite. Cierre: la configuración de la
  Prestadora la muestra, y sólo la deja cambiar donde el país no la exige.
- **Quedan nombres viejos en lo aplicado:** `interno.el_registro_de_accesos_no_se_toca`,
  `interno.encadenar_acceso_a_datos_de_salud`, los disparadores `…_interruptor_de_salud…` y el
  mensaje «No tiene permiso para verificar el registro de accesos». Cierre: una migración nueva los
  renombra y el mensaje sale del catálogo aprobado.
- **La baja de una cuenta desde el Panel la borra**, y una cuenta es de una persona con su Legajo o su Ficha de
  Persona, que no se borran nunca (`CLAUDE.md:288`, `:294`). `panelUsuarios.js:198` llama a `borrarCuenta`, y `dar_de_baja_la_cuenta`
  borra la fila de `usuarios`; con actividad anotada, además, la base lo rechaza. Cierre: el
  Administrador desactiva la cuenta con una nota obligatoria que diga por qué, la persona se queda
  sin entrada y no se borra nada, y las dos cuentas «Prueba Inventada» de la
  Prestadora de pruebas, hoy bloqueadas, se dan de baja así. Deshacer un alta cortada por la mitad
  (`deshacerAlta`) no entra: ahí todavía no hay Legajo ni Ficha de Persona.

**9.** **La credencial de la persona en el backend, y el registro de lecturas en la misma pasada.**

**La base ya está.** `backend/src/db/connection.js` entrega **el cliente de quien está pidiendo**
con `clienteDelPedido(req)`, armado con la credencial que viene en el pedido y la clave pública de
la región. Los tres middleware de entrada (`requiereRolPanel.js`, `requiereRolCliente.js`,
`requiereRolAsistente.js`) comprueban la credencial con la clave pública y leen a la persona con su
propia credencial. La primera ruta migrada es `panelReferenciasLaborales.js`, y es el molde.

**Lo que falta son las rutas.** Siguen importando `supabase`, la llave maestra, y se pasan **por
grupos**: en cada manejador `const db = clienteDelPedido(req)`, las funciones auxiliares reciben
`db`, y `acotarAPrestadora` y los filtros por la Prestadora de la sesión salen de esas rutas; al
insertar, la Prestadora se toma de una fila que la base ya le dejó ver a la persona. El paso
termina cuando ninguna ruta de persona importa `supabase`. Ahí sale también la anotación por
pedido de `requiereRolPanel.js` para el permiso de acceso, que mientras convivan las dos formas
deja las escrituras de las rutas migradas anotadas dos veces. Quedan con la maestra, además,
`panelMfaRecuperacion.js` —que valida la credencial con `getUser` de la maestra— y las escrituras
de `utils/registroDeActividad.js` y de `auditoria_de_accesos`. El depósito `fotos-identidad` ya tiene
su política, así que `panelVerificacionIdentidad.js` pasa como las demás.

**El registro de consultas a HCE entra ruta por ruta en la misma pasada.** Hoy lo anota sólo
`appAsistentesMedicacion.js`, con `anotarConsultaAHce` de `utils/registroDeConsultas.js`; toda ruta
que devuelva información de salud de un paciente lo llama al migrarla. **Y la cadena de
`consultas_a_hce` tiene un hueco:** quien pueda borrar las últimas filas se lleva también su
resumen, y lo que queda sigue verificando bien. Cierre: el último resumen se guarda además fuera de
la base, y `verificar_cadena_de_consultas` lo compara.

**En la misma pasada salen las tres comparaciones de ruta de archivo** que todavía hace el código
(`panelMedicacion.js:181`, `panelVitalesAutorizacion.js:79` y `appAsistentesMatricula.js:192`): los
depósitos ya exigen la Prestadora al comienzo de la ruta, y con la credencial de la persona es la
base la que dice que no. **Dos disparadores lo van a sentir:** `interno.prestadora_de_la_restriccion`
e `interno.prestadora_del_estado_de_cuenta` completan la Prestadora leyendo `clientes` con los
permisos de quien inserta. **Y el historial del registro clínico pasa a tener autor** en lo que se
corrige desde el Panel, que hoy queda anotado sin persona porque lo escribe la llave maestra.

**Lo que dejó la primera pasada por todas las rutas.** Cada manejador que sigue con la maestra lleva
escrito encima por qué. Lo que queda, agrupado por lo que hay que hacer:

- **Un defecto de la base**, que hoy tapa la maestra: la política `atiende_al_paciente` de
  `reportes` pide un Servicio vigente, y `guardias.servicio_id` puede quedar vacío.
- **Políticas más estrechas que lo que hace el Panel**: dejan afuera al coordinador con permiso o al
  Superadmin (`contenidos_para_clientes`, `indicaciones_medicacion`, `prestadoras`, varias de
  cobros y de Match), y `usuarios` sólo deja leer la fila propia, así que toda lista de
  cuentas sigue con la maestra. Donde el comportamiento cambiaba, esas rutas volvieron a la
  maestra: primero se alinean las políticas y después se migran. Dos de esas políticas dicen algo
  distinto de lo que hace el Panel, y antes de alinearlas se decide cuál de los dos tiene razón: los
  Clientes y los Asistentes pendientes de conformidad, que la base oculta y el Panel factura y
  liquida; y la invitación a una guardia, que la base sólo deja ver si la guardia está marcada como
  ofrecida.
- **La zona del Coordinador, decidida.** Cada Coordinador ve lo de su trabajo diario, que es su
  zona; el Administrador ve todo. El padrón de Asistentes disponibles lo ven todos los
  Coordinadores. Una alarma que llega al escalón de todos los Coordinadores la puede ver y resolver
  cualquiera, pero primero tiene que hacerse cargo, y la base admite **una sola toma por alarma**:
  los demás ven quién la tiene y no pueden resolverla mientras esté tomada. Las emergencias entran
  en la misma escalera. Eso ya lo hace cumplir la base
  (el disparador `una_sola_toma_por_alarma` de `alarmas_tomadas`) y la emergencia insiste y
  escala (`backend/src/utils/revisarNotificacionesCoordinador.js`, `revisarEmergencias`). Mientras
  una emergencia está en el escalón de todos, cualquier Coordinador la lee entera, y quien la toma
  atiende esa guardia con toda su información mientras la tenga
  (la función `interno.guardias_a_la_vista_por_una_alarma`). La lista de
  emergencias del Panel ya lee con la credencial de quien pide (`backend/src/routes/panelEmergencias.js`);
  los nombres y marcarla atendida siguen con la maestra.
- **Funciones de la base que `authenticated` no puede ejecutar**: las de guardar los secretos de
  WhatsApp, de la conexión con software externo y de los avisos de cobranza y facturación,
  `intercambiar_orden_etapas_incorporacion` y `sembrar_configuracion_prestadora`. La de la conexión
  con software externo recibe además la Prestadora como dato: la versión que se le abra a
  `authenticated` la resuelve adentro, con `current_tenant()`, como `ausencias_que_tapan`.
- **El permiso de tabla de `authenticated` es entero en casi todas las tablas**, y lo que acota es
  la política. Donde una política le deja actualizar a una persona su propia fila, puede cambiarle
  cualquier columna si llama a la base directo con su sesión. En los avisos de demora ya está
  cerrado —el Asistente no puede darlos por resueltos—; las demás políticas de actualización de
  Asistentes y Clientes se revisan con el mismo criterio al alinearlas.
- **Las funciones de `utils/` que ya reciben la conexión todavía reciben la maestra en muchos
  llamadores**, cada uno con el motivo escrito encima: las altas y bajas de cuentas del Panel y de
  la importación, las Personas autorizadas desde el Panel, los teléfonos preferidos, las guardias al marcar
  ausente y al cubrir, la medicación del Asistente y el aviso de matrícula. Pasan a la conexión de
  la ruta cuando se alineen las políticas del renglón de arriba. Las de WhatsApp,
  `registroDeActividad` y `auditoria_de_accesos` se quedan con la maestra.
- **Quedan en `utils/` funciones con la maestra adentro que llaman rutas de persona**, entre ellas
  `pacientesDeGuardia.js`, `cuentaDeLaFicha.js` y la lectura de zonas de
  `propuestaConfiguracionInicial.js`: tienen que recibir `db` como las demás.

**Y la autorización de monitoreo de los signos vitales pasa a verla sólo quien la firmó.** Hoy el
Cliente y el Asistente de ese Paciente leen el renglón entero —quién la firmó, en qué carácter,
cuándo—, aunque no el archivo (políticas `cliente_lee_autorizaciones_de_sus_pacientes` y
`asistente_lee_autorizaciones_de_sus_pacientes`). El Asistente no es parte: sale. El Cliente la ve
sólo si quien entra es quien la firmó, y hoy eso no se puede saber, porque el firmante está
guardado como texto tecleado (`nombre_avala`, `rol_avala`) y no como una Ficha de Persona. **Pasa a ser
una Ficha de Persona elegida del Directorio de Personas**, igual que el firmante del consentimiento del Pagador. Lo que las
aplicaciones necesitan saber es si hay autorización vigente, no quién firmó: eso lo contesta una
función de `interno` que devuelve sí o no (`utils/vitalesReferencia.js:9` hoy lo lee con la llave
maestra). **Antes de construirlo se revisa la norma de cada país** sobre quién puede ver un
consentimiento firmado; la regla de `CLAUDE.md` §6 es el piso, y si una norma pide más, manda la norma.
**Del lado del Asistente falta una cosa:** su consentimiento sobre la ubicación guarda el texto que
aceptó (`appAsistentesConsentimientos.js:211`), pero la aplicación le muestra siempre el vigente.
Cuando la Prestadora lo cambia, deja de poder ver lo que firmó.
**Y el consentimiento del Pagador lo lee cualquiera con sesión en la Prestadora.** Las políticas
`consentimientos_pagador_los_lee_su_organizacion` y `documentos_pagador_los_lee_su_organizacion`
sólo miran la Prestadora, así que un Cliente o un Asistente con su credencial leen el texto armado
con los datos del Pagador de cualquier otro Cliente. Se acota al personal de la Prestadora y a
quien firmó.

**Qué ve cada rol sale de qué necesita para cumplir su función.** En la Ficha del cliente, el
coordinador:

- **Ve y usa entero:** Contacto (nombre, teléfono, correo, localidad), Pacientes, Personas
  autorizadas, Guardias activas, Historial de reportes y Alertas activas.
- **No ve:** los datos comerciales —plan, plazo de pago, quién paga—, que hoy están adentro de
  Contacto y pasan a ser una parte aparte; y la del Pagador —lo que firma y la documentación que se
  le pide—. Hoy esa parte la ve con `editar_datos_cliente`, que tiene de fábrica
  (`routes/panelCuentas.js:493`, `:584` y `:652`).
- **Lo que no ve, lo ve si el Administrador se lo habilita** en «Permisos de Coordinadores».
- **Un permiso por parte, para ver y para cargar.** No hay uno para mirar y otro para cargar.
- El backend y la base aplican el mismo corte que la pantalla.

Después, lo mismo con el Legajo del Asistente y la Ficha de Persona del Paciente.

**El registro de accesos va acá y no en un paso aparte**, porque es el mismo archivo reescrito una
sola vez en vez de dos barridos por los mismos 135. Es un registro separado del de actividad,
porque anotan cosas distintas y tienen plazos distintos. **Seis campos por evento:** la Prestadora,
la persona que accedió, el paciente, las categorías de dato alcanzadas, el momento y el origen. Los
cinco primeros son el Anexo II sección 3 del EHDS; el paciente lo piden Suecia y Países Bajos, y sin
él no se puede acotar un incidente.

Tres propiedades que no son opcionales:

- **Consultable por paciente.** Un registro que sólo se lee por fecha no contesta «quién vio lo
  mío», que es el derecho del art. 9 del EHDS, ni sirve para acotar una notificación de brecha. En
  Uruguay es derecho del paciente: el art. 12 del Decreto 122/019 obliga a registrar todo acceso a
  la historia clínica, y los arts. 13 a 17 le dan al paciente la vía para verlo.
- **Integridad demostrable.** Ninguna norma usa la palabra «inmutable»: lo que exigen es poder
  demostrar que no fue alterado. Cada entrada encadenada con la anterior alcanza, y no depende de
  ningún privilegio de base de datos.
- **Disponible para el cliente cuando lo pida** (C5 OPS-15.01AC, y Panamá con la identificación y el
  período de todas las personas que ingresaron).

**Qué operaciones se anotan lo fija Perú, que es el más preciso:** el art. 46 del DS 016-2024-JUS
enumera cuentas de usuario, hora de inicio y de fin de sesión, y las operaciones de tratamiento,
**visualización**, modificación, eliminación, importación y exportación. Brasil lo dice distinto y
pide lo mismo: el art. 13 III del Decreto 8.771/2016 exige inventario de accesos con momento,
duración, identidad del responsable y archivo alcanzado. Y Argentina, por el art. 7 de la Ley
27.706, pide que cada acción quede asociada inequívocamente a una persona. Se construye
contra el más exigente y alcanza a los tres. Y el art. 9 del Decreto 41/2012 chileno lo escribe como
requisito reglamentario fiscalizado: «Este sistema debe llevar registro de las fechas y personas que
han accedido a las fichas.»

Su conservación es por jurisdicción, con piso de tres años (EHDS art. 9), mínimo de dos y
disponibilidad inmediata por Perú, sin superar el plazo de la historia clínica de ese país, y con
un piso propio de Brasil que no es de protección de datos: seis meses de registros de acceso por el
art. 15 del Marco Civil de Internet, bajo secreto y entregables sólo por orden judicial.

**Y lo que no se construye con una lista recordada:** la norma holandesa NEN 7513 es de pago y no se
leyó. Antes de vender en Países Bajos hay que comprarla y comparar campo por campo.

**Comprobación:** las 1815 pruebas del backend, y las dos de aislamiento con dos Prestadoras con
datos cargados. Más una que hoy no existe: **quitarle el filtro a una consulta a propósito y
verificar que sigue sin traer datos de la otra Prestadora.** Si eso pasa, la base está protegiendo.
Y sobre el registro: se lee un paciente desde dos Prestadoras con dos personas distintas y contesta
las dos, por paciente, con los seis campos; se altera una entrada del medio y la cadena queda rota y
el sistema lo dice.

**10.** **Se cierra la puerta.** Sale `SUPABASE_SERVICE_ROLE_KEY` del backend y de sus variables de
entorno. Se borra `acotarAPrestadora`. Los 17 casos que confiaban en un identificador de afuera
dejan de ser un riesgo porque la base ya no les cree.

**Entrar con la huella o con la cara sigue usando la llave maestra, y queda así por ahora.** La
huella la comprueba el propio teléfono; después el producto le pide a Supabase una credencial de
entrada para esa persona, y ese pedido va con la llave maestra
(`routes/llaveDelDispositivo.js:191`). Supabase ofrece hacerlo por su cuenta, pero todavía como
prueba: se evalúa cuando esté firme.

**Queda para después recuperar el código extra que se le pide al personal técnico al entrar**
(`utils/mfaRecuperacionEmail.js:87-90`), porque esas personas no pertenecen a ninguna Prestadora.
El rol técnico se queda: es la cuenta con la que entra la persona de CeltaTech cuando le abren un
permiso de acceso, y el backend sólo busca ese permiso para ese rol
(`middleware/requiereRolPanel.js:100`).

**Comprobación:** el producto funciona sin esa variable definida. Es la única prueba que no se puede
falsear.

**13.** **Cifrado y custodia de claves.** El cifrado en reposo y en tránsito es «Addressable» en
Estados Unidos, lo que no quiere decir opcional: el 164.306(d)(3) da tres salidas y las dos últimas
exigen documento conservado seis años.

La razón de verdad para cifrar es otra: **el puerto seguro de la notificación de brechas.** La regla
alcanza sólo a datos «no asegurados» (164.402), y la guía del Secretario condiciona el amparo a que
la clave que permitiría descifrar no haya sido comprometida. De ahí el requisito de diseño:
**custodia de claves separada del depósito de datos y con alcance por Prestadora.** Una clave para
todas convierte un compromiso en brecha de todas. Va acá porque es estructural, no un agregado.

Y el cifrado no salva la notificación en Europa: el art. 34(3)(a) exime de comunicar a las personas,
nunca de notificar a la autoridad. **Frente a una falla de la aplicación o a una consulta que cruza
Prestadoras el cifrado en reposo no vale nada**, porque en ese camino el dato ya estaba descifrado.
Por eso no reemplaza a ninguno de los pasos anteriores.

**Comprobación:** las claves de una Prestadora no descifran nada de otra.

**14.** **Un solo archivo dice el estado.** Se funden las 150 migraciones en una maestra única y se
enciende el esquema declarado —`supabase/config.toml:64` ya tiene el renglón, vacío—. La maestra
vuelve a fundirse con cada migración nueva, así que siempre contiene todo el sistema.

Va al final de los cimientos porque cada semana que pasa son más migraciones para fundir.

**Comprobación:** se reconstruye la base desde cero con la maestra y se compara el esquema contra la
base de hoy. Si no son idénticos, la fundición está mal.

**15.** **Para que no vuelva.** Tres automatismos que cortan la publicación:

- **La llave maestra no entra.** Si `SUPABASE_SERVICE_ROLE_KEY` aparece en `backend/src`, el push no
  sale.
- **Ninguna tabla nace sin protección.** Una tabla en el esquema declarado sin protección por fila y
  sin al menos una política corta la publicación. Lo mismo un depósito de archivos sin política.
- **La prueba que puede fallar.** La prueba de aislamiento corre con el filtro del código quitado a
  propósito en una consulta. Si aprueba igual, es la base la que protege. Con esto, una prueba de
  aislamiento verde vuelve a significar algo.

**16.** **La documentación que queda falsa.** Se revisaron 1363 archivos. Lo que trababa el cambio
—la regla de `CLAUDE.md` que declaraba la llave maestra como decisión tomada, y el grupo de este
mismo plan que la repetía— ya salió. Quedan **127 renglones que describen el estado de hoy y
quedarán falsos**: 18 en documentación y 109 en comentarios de código. **Se corrigen en el paso
donde dejan de ser ciertos, no antes ni en un barrido aparte.**

**65 comentarios viven dentro de migraciones ya aplicadas y no se tocan.** Una migración es una
instrucción que ya se ejecutó: no manda, no se le contesta y no se la corrige. Con el esquema
declarado encendido, el estado se lee en un archivo y ninguna migración vieja se puede confundir con
el estado de hoy. Eso resuelve los 65 sin escribir nada.

Y hay una premisa caída afuera de este repositorio: `productos\Careonys-Marketplace\docs\PLAN.md:44-48`
apoya toda la etapa 2 de la fusión en que «Careonys protege por el servidor». **Ahí no se toca
nada**, así que queda señalado y se decide cuando la fusión llegue a esa etapa.

### Qué no hacen los cimientos

No cambian ninguna pantalla, ningún texto visible ni ninguna regla de negocio, y no cambian qué ve
cada rol. Nadie que use el producto nota nada, salvo que a partir de acá un error de programación no
puede filtrar datos de otra Prestadora.

---

## La maestra de migraciones se vuelve a fundir

**20.** Se vuelve a fundir la maestra de migraciones, para que ninguna migración guarde una palabra
que el glosario retiró.

**Comprobación:** buscar en las migraciones cada palabra que el glosario retiró da cero, salvo
cuando nombra al pariente.

---

## La mudanza desde Match

**Va primero, y por eso está acá arriba.** Casi todo lo que sigue se encarece si se construye
antes: cada pantalla de configuración nueva escrita a mano es una que después hay que deshacer, y
la sección de Reclutamiento está esperando justamente esto.

**Cómo se hace, y no se repite en cada paso:**

- **Allá no se borra ni se altera nada.** Match es fuente de lectura. Todo se escribe de
  este lado, contra el esquema de Careonys, que es distinto. Si algo de allá está roto o
  incompleto, se informa dónde está y se sigue: no se arregla allá.
- **Ninguna pieza viaja entera ni se descarta entera.** Antes de escribir nada, cada una se parte
  en modelo de datos, aislamiento en la base, comportamiento en pantalla, textos y chequeos
  automáticos, y cada parte se decide por separado. Lo corriente es que se quede la mitad de acá y
  viaje la otra mitad.
- **De la parte visual no viaja nada.** El aspecto del sitio público de Match está tomado
  casi literal de un competidor. Los archivos y el código son propios y se leen sin problema, pero
  la disposición, los colores, las tipografías, las imágenes y los textos de venta no vuelven a
  aparecer, ni rehechos parecidos. Si Careonys necesita un sitio público, el diseño se hace de cero
  con la identidad propia.
- **La lógica que interesa vive afuera de las pantallas**, salvo cuatro renglones sueltos que están
  señalados en el paso que los necesita.
- **El inventario de allá se usa como lista de control**, leyéndolo y sin escribir en él.
- **Las notas con la palabra vieja adentro de las migraciones ya aplicadas de Match se corrigen
  acá.** Allá no se pueden tocar —una migración aplicada no se edita— y no vale escribir una nueva
  sólo para eso. Lo que viaja se escribe de este lado con la palabra que manda el glosario, y así
  esas notas quedan atrás.

**21.** Una cuenta por Prestadora. **Un Asistente trabaja en varias Prestadoras y un Cliente
contrata con varias.** Cada una de esas es **una cuenta distinta, con su propia clave**. El mismo
correo puede estar en dos Prestadoras y son dos cuentas: usar el correo de siempre no lo obliga a
nadie a tener una sola cuenta. Adentro de una Prestadora ese correo no se repite.

**Lo que falta es la pantalla de ingreso de las dos aplicaciones de teléfono.** El modelo ya
está, la base lo impone, y en el Panel ya funciona: la Prestadora sale de
la puerta por donde se entró y nunca de lo que venga en el pedido. Las dos aplicaciones todavía
firman con el correo crudo.

**Y al entrar no se insinúa nada.** Un correo que existe en otra Prestadora se trata igual que uno
que no existe: el mismo mensaje y la misma demora. Nadie averigua dónde más trabaja una persona
probando su correo.

**Nunca en dos a la vez.** Para hacer o ver algo en la segunda Prestadora hay que salir de la
primera y entrar a la otra. No existe ninguna pantalla que muestre las dos juntas, ni una lista con
una columna que diga de cuál es cada cosa. Estando en una, la otra no existe: ni sus turnos, ni sus
pacientes, ni sus mensajes, ni sus papeles. Al cambiar se descarta todo lo que estaba cargado.

**Y no hay excepción posible.** Con una sesión abierta en una Prestadora no se entra en otra hasta
cerrar esa. Ninguna situación la habilita. Lo único que se mueve entre Organizaciones es el permiso
de acceso, que ya tiene su propia forma y tampoco alcanza dos a la vez.

**El aislamiento acá tiene que ser más duro que en el resto del producto, y por eso se prueba
aparte.** Hasta hoy una cuenta pertenece a una sola Prestadora, así que una fuga se nota; desde
este paso la misma persona tiene sesión legítima en dos, y cualquier consulta que resuelva la
Prestadora por otra vía que no sea la sesión comprobada devuelve datos de la otra sin que nada
falle a la vista. Entonces: **ninguna consulta resuelve la Prestadora por lo que venga en el
pedido**, ni por la ficha, ni por parecido de correo; **la separación la impone la base**, y los
filtros de las rutas del backend son la segunda red, no la primera. Y la prueba se hace con una
persona dada de alta en dos Prestadoras, **con datos cargados en las dos**: entrando en una ve todo
lo suyo de esa y nada de la otra, en las dos direcciones. Una consulta que devuelve vacío no prueba
nada.

**Lo que se miró y no viaja, para que no se vuelva a discutir:** las quince pantallas del sitio
público y la maqueta; los consentimientos, donde Careonys está muy por delante —texto versionado
por jurisdicción e idioma, con copia exacta de lo que la persona leyó, y con rechazo y retiro—; el
tope de alarma, que acá tiene topes por Prestadora, cuatro escalones de gravedad y escalada de la
que nadie atiende; las verificaciones; los reportes de turno; y el seguimiento de ubicación, donde
lo de acá es mejor salvo el motivo de la falla, que ya está resuelto. **Se retira** la disponibilidad horaria del Asistente: no la lee ningún programa ni
ninguna pantalla, de ninguno de los dos lados. Y los textos legales de allá no sirven: son de una
sola Prestadora, sin versión y sin dónde queden guardados.

**22. Usted** — Decidir qué secciones de Match quedan en el Panel. Match no tiene panel aparte:
sus secciones están en el mismo Panel y aparecen sólo si la Prestadora tiene habilitada la
intermediación. Son cuatro: Calificaciones, Clientes, Formas de cobro —con su detalle y los
plazos del cobro— y Auditoría legal. Clientes y Formas de cobro las ve además sólo la
administración. En el Legajo del Asistente, la pestaña de evaluaciones sigue la misma regla.

---

## El acto de armar un Servicio

**Va acá porque es la columna del producto**, y porque media docena de pasos de más abajo lo dan por
hecho sin que exista: a quién se le presenta una Asistente nueva, contra qué se asigna una guardia,
quién responde por un Servicio y qué se le factura a quién son preguntas que no se pueden contestar
mientras armar un Servicio no sea un acto con su pantalla. **Y va después de la mudanza** porque el
primer paso se dibuja desde una declaración de formulario y se sirve de las listas de opciones por
Prestadora, que es lo que quedó construido allá.

**Los ocho pasos están escritos en `docs/PLAN_EL_ACTO_DE_ARMAR_UN_SERVICIO.md`, y no se repiten
acá.** Lo que falta para arrancarlo es la aprobación de ese plan y cinco respuestas.

**Y lo que se carga son cuatro niveles que no se mezclan**, según el glosario:
`celtatech/docs/GLOSARIO_PRODUCTOS_CAREONYS.md`. El **Servicio** es el acuerdo entero; la
**Prestación**, cada cosa adentro con su precio y sus propios días y horarios; la **Guardia**, el
cuidado a cubrir con sus días y su horario, que puede ser una franja acotada o las 24 horas los 7
días; y el **turno de guardia**, la parte que cubre una Asistente hasta que le entrega las
responsabilidades a quien la releva o al Cliente. **Lo pactado se carga al nivel de la
Prestación**: un renglón puede ir de 00:00 a 24:00 y ningún turno puede. Repartir la guardia en
turnos es trabajo de quien coordina.

**Contra qué choca este acto en el resto de la lista.** Son cinco, y ninguno se ve leyendo los
títulos:

- **El aviso del hueco no es pieza nueva: entra por el catálogo de avisos que ya existe**, con su
  configuración por Prestadora. Y ese catálogo es justamente lo que quedó sin contestar más arriba
  —si las alertas se pueden enchufar y sacar, qué mensajes hay, cuántos reintentos y a quién se
  escala—. Así que contestar qué dice el aviso no alcanza: **mientras eso siga abierto, el hueco
  puede quedar siendo de los que se apagan**, y lo que usted fijó es que un hueco invisible no
  existe. Se contesta aquello antes.
- **La sugerencia de Asistentes no mira la zona.** El cálculo —`panel/src/lib/candidatos.js`— no
  nombra zonas ni lugares en ninguna línea. **Y más abajo hay otro paso sobre ese mismo archivo**,
  el del nivel de complejidad. Los dos se hacen en una sola pasada.
- **El acuerdo económico como criterio de sugerencia toca el dinero**, que es el grupo de arriba
  sin contestar: para que la sugerencia mire si la Asistente está de acuerdo con los montos y los
  plazos, esos montos tienen que estar guardados en algún lado.
- **Un coordinador de sólo lectura no puede ser el asignado.** Más abajo se pregunta cómo entra un
  Pagador que sólo consulta, y una de las salidas propuestas es un Coordinador de sólo lectura.
  Quien tiene el Servicio asignado arma el equipo: si esa salida se elige, tiene que decir que ese
  rol nunca queda como responsable de un Servicio.
- **La ventana de crear un turno hoy no sabe que existe un Servicio.** Pide la lista completa de
  Pacientes de la empresa, sin recorte de ninguna clase. Cuando el turno cuelgue del Servicio esa ventana cambia de raíz, **y es la misma
  ventana que toca la sección de carteles**, más abajo. Una sola pasada.

**23. Usted** — Aprobar ese plan, que todavía no está aprobado. Hasta que lo esté no se escribe
código de producción de ninguno de sus ocho pasos.

**24. Usted** — Las tres respuestas que ese plan espera, cada una con su situación delante en el
documento: qué dice el aviso cuando queda un horario pactado sin nadie que lo cubra; qué dice el
tercer estado de la coordinación, el de la vacante que cubre la administración mientras no haya
nadie asignado; y si «suspender» es distinto de «pausar» —una sola acción con fecha de vuelta
opcional, o dos, una por tiempo conocido y otra indefinida—.

**25. Usted** — Y dos que aparecieron al escribir la escala de cuatro niveles, las dos sobre lo
guardado:

- **La tabla `guardias` guarda turnos**, no guardias: cada fila lleva una Asistente, un día, un
  horario y su check-in y su check-out. El nivel de la guardia completa, el período que se reparte
  entre varias, **no tiene tabla**. ¿Se deja el nombre como está, entendiendo que una fila es un
  turno, o se renombra? Renombrar es una mudanza de datos sobre `guardias`, `series_guardias` y todo
  lo que las nombra, así que lo decide usted.
- **De qué es una guardia no está guardado en ninguna parte.** Un Servicio incluye varias —de
  cuidados, de enfermería, de lo que se haya acordado—, y el tipo hoy lo lleva únicamente la persona
  que la cubre, en su Legajo. Así que la guardia se deduce de quién la cubre, **y mientras no haya
  nadie asignado no dice qué hace falta ahí**. Sin eso, el aviso del hueco puede decir que falta
  cubrir un horario pero no de qué, y la sugerencia de Asistentes no tiene contra qué comparar. ¿El
  tipo pasa a la guardia?

**26. Usted** — Y una que aparece al cruzar el acto con la regla del producto: **el Pagador.** La
regla dice que quien asume la obligación de pagar queda definido recién cuando firma, y que eso
tiene que estar listo **el día que se firma con el Contratante** — que es exactamente este acto. Pero
la firma vive hoy en otra pantalla, dentro de la Ficha del cliente, con su propio estado y sus
botones de armar el consentimiento y registrar la firma; y el único requisito que este acto pone
para habilitar un Servicio es el coordinador asignado. ¿Son dos requisitos, y un Servicio sin
Pagador firmado tampoco se habilita? ¿O el acto muestra cómo está esa firma y deja seguir?

**27.** Construir los ocho pasos de ese plan, en el orden que tiene escrito.

**28.** Sacar de los tres idiomas la explicación de la coordinación que hoy acompaña al equipo del
Paciente, que dice que mientras nadie esté fijado son todos los que trabajan en la zona. Describe el
modelo que este plan reemplaza. Va junto con el paso del coordinador asignado, no antes.

En la misma pasada, **lo que ve cada uno se recorta a lo que necesita para trabajar**, y se cumple
en la base y en el backend, que hoy filtra sólo por Prestadora:

- **La Coordinadora ve sólo los Clientes y Servicios que tiene asignados**: sus Pacientes, su
  historia clínica, sus reportes y alertas, sus personas autorizadas y las Personas del Directorio
  vinculadas a ellos. Los Asistentes, las matrículas y las calificaciones, los de su zona; de cada
  Asistente, la distancia al domicilio y no el domicilio. Hoy patologías, medicación habitual y
  complejidad le llegan de todos los Pacientes por fuera de la restricción de historia clínica.
- **Una emergencia habilita a todas las Coordinadoras** a ver lo necesario para resolverla, hasta
  que la asignada retoma el problema. La que cubre una ausencia ve lo de la ausente mientras dure.
- **El Pagador, la facturación y la lista de precios quedan fuera del rol de la Coordinadora**, y
  se habilitan con un permiso.
- **El Asistente, en una oferta, ve barrio, distancia, horario, complejidad y las tareas
  especiales que pide el Paciente.** El nombre del Paciente y el domicilio exacto, recién al
  aceptar. **De las guardias pasadas ve sólo las que todavía no se le pagaron**, con fecha,
  horario, horas y estado, para poder reclamar, y ningún dato del Paciente. Hoy una guardia no
  guarda si se pagó: se deduce de que haya una liquidación pagada cuyo período la cubra. Los reportes de otros Asistentes, sólo del Servicio en curso, mientras tenga una
  guardia vigente ahí y en cantidad acotada. Deja de recibir la credencial interna de su perfil.
- **Durante la guardia, el Asistente recibe el contacto de emergencia, la obra social y el número
  de afiliado del Paciente**, que hoy no recibe.
- **El Cliente ve del Asistente nombre, foto, tipo y certificado vigente, y sólo del que tiene una
  guardia en curso o próxima.** Nunca su teléfono: se comunica con la Prestadora. Hoy lee directo de
  la base todas las columnas de cualquier Asistente que lo atendió alguna vez, sin límite de
  tiempo, porque la regla que lo habilita alcanza con una guardia de cualquier fecha. El código QR
  verifica sólo contra el Asistente con guardia hoy con ese Paciente, y hoy responde con cualquiera
  de la Prestadora.
- **El Cliente ve la ubicación del Asistente sólo en vivo y con el permiso**, y la ubicación se
  borra al cerrar la guardia. Hoy lee las de salida, llegada y cierre de todas las guardias, sin el
  permiso. Del Paciente deja de recibir lo que ninguna pantalla usa —patologías, ubicación de la
  casa—, y el domicilio y su motivo respetan el permiso de la ficha.
- **Los permisos de las personas autorizadas niegan ante la duda:** sin permisos cargados, el
  backend hoy deja pasar y la base niega; mientras cargan, la pantalla muestra todo; y la consulta
  que los decide no mira de qué Cliente es la persona.

Cierre: la prueba con dos Coordinadoras de Servicios distintos y datos cargados, donde cada una ve
lo suyo y nada de la otra, salvo durante una emergencia abierta.

**29.** Agregar el tipo «Servicio» a Ajustes › Importación, que hoy no está entre los tipos que se
pueden importar. Va después de que el acto exista: importar un Servicio sin coordinador asignado
sería dar de alta algo que el producto no habilita.

En el mismo paso, el resto de la migración. Una Prestadora que ya trabajaba migra lo que tiene
—Clientes, Asistentes, historias clínicas y lo demás— y cada dato entra por planilla o cargado a
mano de a uno: es una sola migración, con dos formas de cargarla, y no pasa por el circuito
comercial del que llega nuevo. Hoy la importación sólo admite Clientes y Asistentes, y la carga a
mano no existe para ninguno. Falta decidir cómo se llaman, en pantalla, la carga a mano y la
sección, cuyo título habla sólo de archivos. Cierre: cada cosa que se migra entra por las dos
formas, por el mismo lote y la misma revisión.

**29b. Usted** — El texto del aviso para el género de una planilla que no se entiende: hoy dice
«Género no reconocido.», que no está aprobado; la propuesta es «El género escrito no se entiende.»
(en «The gender entered cannot be read.», pt «O gênero informado não pode ser lido.»).

---

## La entrada y la recuperación de la clave

**Va acá y no antes porque se apoya en la cuenta por Prestadora, más arriba en esta lista.** Cada
Prestadora donde la persona trabaja es una cuenta con su propia clave, así que la coordinadora que
habilita un cambio de clave abre una puerta que da a su Prestadora y a ninguna otra. Con una sola
clave para las tres, esa puerta daba también a las otras dos y esto no se podía hacer.

**Lo decidido, y no se vuelve a discutir:**

- **Tres vías para recuperar la clave, iguales para todas.** Por correo, por código al teléfono
  verificado, y llamando a la coordinadora. La Prestadora no configura nada de esto: no se le
  ofrece la opción de apagarlo.
- **El código se pide en dos momentos:** al recuperar la clave y al entrar desde un equipo nuevo.
  Para todos — administración, coordinación, Asistentes y Clientes.
- **Equipo nuevo quiere decir un aparato que no tiene llave guardada y desde el que nunca se
  entró.** Nada más que eso. No hace falta reconocer el navegador ni mirar desde dónde se conecta.
- **La huella y la cara quedan afuera de la recuperación.** Son para el día a día, en el teléfono, y
  sólo donde el aparato las tiene — la aplicación ya pregunta si puede y ante la duda contesta que
  no. En el Panel no están construidas. No pueden ser requisito de nada.
- **No hay aplicación de códigos para nadie más que el rol técnico**, que ya la tiene. Obliga a
  instalar algo aparte, y quien cambia de teléfono sin guardar el respaldo queda afuera.
- **El número viaja con el chip; la llave se queda en el aparato.** Con el mismo número en un
  aparato nuevo no hay nada que habilitar, porque lo verificado es el número.
- **Un número nuevo se cambia como en cualquier software corriente.** Se pide la clave actual, llega
  un código al número nuevo, y al escribirlo el número queda verificado y sirve de llave. Al correo
  le llega un aviso, por si el cambio no lo hizo su dueño. Nadie de la oficina tiene que llamar ni
  habilitar nada. Textual del Desarrollador: *«La industria del software ya encontro soluciones a
  este problema. Utilicemos la mas sencilla y eficiente»*.
- **Nada de esto puede impedirle a nadie trabajar.** La habilitación es para que un número se vuelva
  llave, nunca para entrar.

**30.** Sacar la habilitación del número por una persona. Hoy un número verificado con su código
todavía no sirve para recuperar la clave hasta que alguien de la oficina lo habilite, y el Panel
muestra una lista de cuentas esperando esa habilitación. Esa lista además está mal: muestra a todo
el que tiene un número que nadie confirmó, aunque lo haya cargado el primer día. Con la regla de
arriba, la lista, la confirmación por la oficina y el renglón del tablero salen. Qué se hace con
los números ya confirmados guardados en la base lo decide usted antes de borrar nada. La página
Habilitar clave queda para la tercera vía, la de quien llama porque no puede entrar.

**31.** Lo mismo, en las dos aplicaciones de teléfono. Hoy un Asistente y un Cliente no tienen
nada de esto: no pueden verificar ni cambiar su número con código, entrar desde un equipo nuevo no
les pide código, y **no pueden cerrar la sesión de todos los equipos**, que es justo lo que
necesita alguien a quien le robaron el teléfono. La única puerta es el Panel, y ahí no entran.
**Acá falta backend y no sólo pantalla**, al revés que en los pasos de arriba: las piezas de fondo
—mandar el código, comprobarlo, reconocer el equipo, cerrar todas las sesiones— están escritas y
no conocen ningún rol, pero las únicas puertas que las usan exigen ser del Panel y rechazan a un
Asistente y a un Cliente. Hay que abrir las puertas equivalentes para ellos dos, y recién
después las pantallas.

**32.** Pedir el enlace de la clave nueva desde las dos aplicaciones de teléfono. Hoy no se puede:
quien se olvidó la clave llama a su Prestadora y ella se lo manda desde el Panel. El backend ya
tiene la puerta, y el Panel ya la usa.

**El trámite es de una Prestadora, y alcanza a una sola.** La Prestadora sale de la puerta por
donde se entró, igual que al ingresar, y nunca de lo que venga adentro del pedido. **Nunca se
busca el correo en las demás Organizaciones**, ni para juntar respuestas, ni para mandar un enlace
por cada una, ni para avisar que esa persona existe en otra. Quien perdió la clave en dos
Prestadoras hace el trámite dos veces, una en cada una.

**Por eso va después del paso de la cuenta por Prestadora**, que es el que le da a la pantalla de
ingreso de las dos aplicaciones de qué Prestadora se trata.

**Y contesta siempre lo mismo**, exista el correo o no: si la respuesta cambiara, cualquiera
averiguaría quién tiene cuenta preguntando de a un correo por vez.

---

## El dinero

**33.** Escribir la conexión de ida con el software de facturación de la primera Prestadora, cuando
haya una y ella lo elija. **No se escribe antes**: se miraron los cinco que más se usan en
Argentina y se conectan todos parecido pero con datos distintos, así que escribir uno a ciegas es
acertar con suerte. Lo investigado está en `docs/FACTURADORES_Y_COMO_SE_CONECTAN.md`. **Cada
software es una pieza aparte** y agregar la segunda no puede obligar a tocar la primera. Las otras
dos maneras ya están hechas y alcanzan para salir a producción: se anota factura por factura a
mano, o se baja un archivo con todo lo que falta facturar y se sube el que el software devuelve.

**Esas dos maneras indirectas se revisan antes contra la norma de protección de datos.** El
Desarrollador duda de que sean seguras: el archivo sale de Careonys, queda en la computadora de
alguien y se sube a mano a otro software, y en ese camino nadie controla por dónde anda. Se cierra
cuando está escrito, con la norma a la vista, si se pueden usar tal como están, con qué recaudos, o
si hay que sacarlas.

**34.** La pantalla de los datos bancarios del Asistente. El dato lo informa él, así que él lo
carga y él lo corrige: la base ya lo deja escribir su propia fila y ninguna otra, y el backend ya
tiene por dónde —cargar, corregir y sacar la cuenta—, con lo que entra validado y con el cambio
anotado. Falta la pantalla donde lo hace, en la aplicación del Asistente.

---

## La modalidad Match de cara al Cliente

Existe el andamiaje —base, disparadores, cobros, consentimiento—, el Cliente ya puede buscar un Asistente, ver su perfil público, escribirle por adentro de la aplicación y, activando el cobro, ver cómo llegar a él por afuera. **Todavía no puede contratarlo.**

**Cobrarle un contacto a un Cliente y facturarle el servicio son dos formas de cobro
de la misma Prestadora**, y cada Prestadora elige cómo cobra.

**Hay una sola venta de contactos construida, y es de la Prestadora al Cliente.** Un importe, sin
vencimiento, y un saldo que se descuenta de a un Asistente. Lo arma cada Prestadora con sus
valores, y el Cliente le paga a ella. Está construido acá, junto con la suscripción que se renueva
sola.

**CeltaTech vende software, y nada más.** No vende contactos. Así que del otro lado no hay ninguna
venta de contactos con la que confundir a ésta, y el producto no tiene que preguntarle nada a nadie
para dejar abrir uno.

**Y vender el acceso a una cantidad de contactos es de cada Prestadora, una por una, sin mezclarse
con ninguna otra.** Cuántos contactos trae un paquete y cuánto sale lo decide cada una para sí, y
ni el saldo, ni el estado de la suscripción, ni el contacto que se abre alcanzan jamás a otra.
**De esa regla sale directo el primer punto del paso de Match, más abajo**: hoy el saldo y el
estado de la suscripción de un Cliente se buscan sin la Prestadora.

**Y queda un renglón para sacar en el plan de Match**, que dice que el precio y el tope de los
paquetes de contactos son de CeltaTech. Nació de leer «la decisión comercial no es del producto»
como «lo vende CeltaTech», que es otra cosa: la decide cada Prestadora. Ese repositorio está en
sólo lectura, así que el renglón se saca cuando se lo toque.

**37. Usted** — Prioridad de acceso al Padrón ante una baja: el PRD la define en una línea (`docs/PRD_07_Modalidad_Match.md:225`) y de ahí salen dos productos distintos. ¿Es que el contacto del reemplazo no vuelva a costar durante una ventana —ni descuenta saldo ni pide un acceso nuevo—, o es que a ese Cliente se le avise primero cuando algún Asistente del Padrón vuelve a estar disponible? ¿O las dos? Y antes que eso: hoy el Cliente no contrata por Match, así que no hay baja que detectar. ¿Qué cuenta como baja — que el Asistente se saque de los disponibles, que el Cliente cierre el Servicio, o hay que construir antes el vínculo?

**38.** Construirla según lo contestado.

**39.** Tres puntos de Match donde la Prestadora no se aplica:

- **El saldo de contactos y el estado de la suscripción de un Cliente se buscan sin la
  Prestadora.** Una de las dos funciones la recibe y no la usa en ninguna consulta. **Es
  exactamente lo que la regla de arriba prohíbe**, y por eso éste se corrige primero.
- **Abrir el contacto de un Asistente no comprueba que sea de la misma Prestadora.** La función de
  la base etiqueta bien la fila, pero acepta el Asistente que le pasen. Hoy la única barrera es
  que la pantalla lo valide antes.
- **El catálogo de motivos de los mensajes se lee entero, sin Prestadora.** Hoy está vacío a
  propósito. El día que una Prestadora cargue una regla propia, se le aplica a todas.

---

## Los huecos del Panel

**40. Usted** — ¿Cómo se le presenta la Asistente nueva al Cliente — mensaje sin respuesta, aceptación explícita, o fuera del sistema? **Cuelga del acto de armar el Servicio**, más arriba en esta lista: sin Servicio armado no hay a qué Cliente presentarle a nadie.

**41. Usted** — Las dos observaciones de apariencia que quedan, porque las dos son decisiones de diseño: ¿con qué pantalla abre la aplicación del Cliente cuando hay más de un Paciente — hoy abre en la lista, y con uno solo ya se saltea al detalle? ¿Y cuál es la identidad visual de las dos aplicaciones, que nunca pasaron por su etapa de diseño?

El Desarrollador está preparando una maqueta orientativa de cómo tienen que verse y cómo se recorren. **La maqueta mejora lo que ya está construido: no es condición para construirlo.** Las pantallas que faltan se hacen ahora, con la apariencia que el producto ya tiene, y cuando la maqueta llegue se acomoda lo que haya que acomodar. Ningún paso de esta lista espera por ella.

**42. Usted** — Rotación y retención de Asistentes: ¿cuál es la fórmula y cuál el umbral?

**43.** Ponerlo en el tablero. Se calcula desde `ceses` y `asistentes`, sin tabla nueva.

**44.** El aislamiento del Panel, que hoy descansa entero en la base. Tres cosas:

- **Unas cuarenta consultas no llevan ningún filtro propio.** Si una política se afloja, o entra
  una tabla nueva sin la suya, esas pantallas muestran listas y números mezclados y nada en el
  código lo frena. Lo más visible serían los números del tablero y el mapa de los Asistentes.
- **Cinco pantallas guardan con la Prestadora que traía la fila que estaba en pantalla**, no con
  la de la sesión. Hoy coincide. Es un dato de aislamiento viajando por un camino que la sesión no
  controla.
- **Al lado de cada cuenta se cuenta en cuántos lugares trabaja, y suma los de otras
  Prestadoras.** Deja deducir que esa persona trabaja en otra.

**45.** La marca del equipo del Panel usa un solo casillero del navegador para todas las
Prestadoras: la última pisa a la anterior. El backend la valida contra la Prestadora, así que no
sale ningún dato; es un dato de una Organización viajando adentro del pedido de otra.

---

## El tablero de Situación operativa

**Lo decidió el Desarrollador renglón por renglón.** Cada renglón es una tarjeta, una lista o un
gráfico. Van ordenados de lo más grave a lo de rutina, un clic abre el detalle, y nada aparece dos
veces.

Los renglones, en este orden:

- **Emergencia.** Lo que un Asistente avisó con el botón de emergencia y nadie tomó todavía. Cuenta
  sólo eso; la lista de emergencias está en la sección «Las dos aplicaciones».
- **Ausencias no programadas.** Asistentes que no llegaron a su turno.
- **Ingreso/Egreso en espera.** Asistentes que están en el domicilio esperando el código para
  registrar la entrada o la salida.
- **Turnos sin asignación.** Turnos sin Asistente, incluidos los que se ofrecieron y nadie aceptó.
- **Asistente ausente.** El relevo que no llegó.
- **Salida sin registrar.** El nombre es provisorio: al Desarrollador no le gusta y no encontró uno
  mejor.
- **Estado del Paciente.** Los avisos amarillos o rojos que dejó la revisión de los informes y que
  nadie resolvió.
- **Documentación.** Matrícula y demás papeles de los Asistentes, vencidos o por vencer. Al abrirlo
  se ve qué papel tiene el problema. El mismo aviso le aparece al Asistente en su aplicación.
- **Informes.** Turnos terminados sin informe. Al hacer clic, quien coordina o administra ve de qué
  se trata.
- **Contacto, Prospecto o Cliente**, según la etapa comercial en que esté cada uno.
- **Postulante.** Personas que se postularon para trabajar. Es parte de Reclutamiento.

**Salida sin registrar, y lo mismo con la entrada.** Si el turno terminó y la salida no se
registró, a los 15 minutos aparece el aviso; cada Prestadora cambia ese plazo en su configuración.
El renglón dice sólo «Salida sin registrar»; al hacer clic
muestra las horas de entrada y salida registradas y las que faltan, del turno y del siguiente, sin
ninguna frase que las interprete. Un Asistente que se queda de más sin que lo releven hace
saltar la alarma del relevo que no llegó, salvo que sea el último turno de la guardia. La
coordinación consulta a los Asistentes involucrados: si fue un olvido, cierra el turno a mano; si
fue otra cosa, busca la solución; si no puede resolverlo, lo pasa al escalón de arriba.

**Lo que sale del tablero.** Turnos de hoy, Servicios en curso y Asistentes trabajando, porque no
piden hacer nada. Y las cuentas esperando su clave, que desaparecen con la regla del número nuevo,
en la sección «La entrada y la recuperación de la clave».

**Lo que va al Resumen del mes, en gráficos:**

- **Servicios a lo largo del tiempo**, en una línea mes por mes.
- **Prestaciones**, en una torta que las cuenta, y **Ventas**, en otra que las pondera por lo que
  se vende de cada una. Ventas la ve sólo la administración, igual que los pagos a los Asistentes.

**46.** Las tres etapas comerciales:

- **Contacto:** alguien de afuera de los clientes que mostró interés en los servicios de la
  Prestadora, porque se comunicó o porque la Prestadora lo contactó.
- **Prospecto:** tiene un presupuesto de un servicio que se está negociando, con las condiciones
  cargadas y sin firmar.
- **Cliente:** desde que se cierra el trato y se empieza a preparar el servicio, mientras dure
  —pueden ser años— y también después de terminado, aunque esté inactivo.

**La etapa no la marca nadie: sale de lo que pasa.** Cargar un presupuesto convierte al Contacto
en Prospecto; cerrar la negociación de forma positiva lo convierte en Cliente; si la negociación
fracasa, vuelve a ser Contacto con todo su historial. Es la misma Ficha de Persona del Directorio de Personas en
las tres etapas, nunca una tabla aparte. Sin presupuesto aprobado no hay Cliente, y no hay alta manual de
Cliente desde el Panel; la cartera que una Prestadora ya tenía se migra aparte (paso 29).

Contactos y Prospectos son asunto de la comercialización, que es la administración. Los Clientes
les importan a la administración y a la coordinación, y a los Asistentes involucrados en lo suyo.
En definitiva es un CRM, con todo lo que eso trae, y es OctoCRM: Careonys lo usa a través de su
API, pero los datos viven en Careonys: la persona, los presupuestos, la etapa y el historial.
OctoCRM no guarda ningún dato de ningún otro producto en sus bases, porque se vende solo y además
lo usan otros productos de CeltaTech; Careonys lo usa como si fuera propio. Falta decidir qué
muestra el tablero de los Clientes.

---

## Los carteles y el texto visible del Panel

**Todo lo de esta sección es texto que ve alguien, así que lo aprueba usted, uno por uno.** El
relevamiento completo está en `docs/CARTELES_DEL_PANEL.md`, cartel por cartel y con la pantalla
donde se ve cada uno; sus decisiones ya tomadas están en `docs/CARTELES_DEL_PANEL.docx`, que es
fuente y no se modifica.

**Va acá, pegada a los huecos del Panel, porque es el mismo ámbito.**

**Y va antes del paso que decide si los idiomas pasan a la base**, más abajo, por un motivo de
orden: los mensajes que manda el producto ya viven en la base, con su texto en los tres idiomas y
una fila propia por Prestadora; lo que sigue escrito en un archivo es el texto de las pantallas del
Panel, que es exactamente lo que barre esta sección. **No se muda lo que se va a sacar.**

**La regla de fondo:** cuantos menos carteles haya, más atención recibe cada uno — es inversamente
proporcional. Y **cuando un texto sale, sale el cartel entero**: no queda el recuadro vacío
diciendo nada.

**Contra qué choca esta revisión en el resto de la lista.** Son cuatro, y tres de ellas le sacan
trabajo:

- **El del proveedor de cobro no se puede decidir todavía.** Vive en un bloque que existe sólo con
  la modalidad Match y habla de la suscripción de los Clientes, así que depende del grupo
  del dinero, más arriba y sin contestar: puede que el bloque entero no vaya.
- **La advertencia legal del código no la contesta usted.** Por regla el aviso sale del documento
  legal de ese país, y ese documento no existe. Espera a lo del abogado, más abajo, no a una
  respuesta suya.
- **El barrido del tuteo alcanza pantallas que todavía no están escritas** —el formulario de
  postulación, lo que falta de las dos aplicaciones—. No se barre dos veces: la regla queda
  escrita y cada pantalla nueva nace cumpliéndola.
- **Un cartel ya fijó el molde del aviso del hueco.** En las guardias sin cerrar usted escribió que
  si hay algo se muestra «y si corresponde a la pantalla también cómo se solucionan». El aviso del
  hueco pactado, más arriba, es el mismo caso y sigue sin redactar: el criterio ya está dado.

**Y el texto de la sugerencia de Asistentes es el mismo trabajo que el acto**, no uno de carteles:
la pantalla dice que ordena por zona y el cálculo no la mira. Se arregla arreglando el cálculo.

**47. Usted** — Los siete carteles que esperan su texto. Tres de ellos ya tienen el texto o el
molde escrito en el `.docx` y lo único que falta es confirmarlo.

**48. Usted** — Las dos preguntas que usted dejó escritas en el `.docx` y que siguen sin
contestar: qué es un selector, y si alguna pantalla dice «La Prestadora».

**49. Usted** — El cartel que quedó parado porque no ubicó la situación. Va con la pantalla
delante.

**50. Usted** — Los tres grupos que quedaron sin autorizar: los once textos que salen por ser una
aclaración debajo de un casillero, los catorce que pasarían a formar parte de la etiqueta del
casillero, y los nueve casilleros que están mal hechos y por eso necesitaban esa aclaración.

**51. Usted** — Habilitar clave: qué carteles lleva se decide después de analizar el procedimiento
y su lógica, no antes.

**52. Usted** — El bloque del segundo factor en Configuración › Accesos, con dos frases que
nombran un rol que no existe. **Y detrás hay una decisión que no está en ninguna parte de esta
lista:** la regla del producto dice que hay un solo Administrador por Prestadora y que las personas
en las que él delega funciones propias **llevan otro nombre, que todavía no está decidido**. Sin
ese nombre, esas dos frases no se pueden reescribir.

**53. Usted** — Tres cosas que son texto visible y no se pueden decidir de mi lado: la
contradicción del certificado, donde dos textos dicen cosas distintas del mismo código; las cuatro
frases que le nombran al usuario el permiso de acceso, que la regla del producto dice que la
Prestadora no ve ni sabe que existe; y la advertencia legal escrita adentro del
código de la aplicación del Asistente, que según la regla tiene que salir del documento legal de ese
país.

**54.** Aplicar todo lo contestado.

**55.** Lo que no espera ninguna respuesta porque ya es regla escrita: sacar el tuteo y el voseo de
todo el Panel y de las dos aplicaciones, sin excepción;
quitar los textos que no se alcanzan desde ninguna pantalla; escribir la regla de que cuando un
texto sale sale el cartel entero, donde vive la regla del casillero; y pasar a las traducciones el
texto del documento de cese, que está escrito en castellano adentro de
`panel/src/lib/generarDocumentoCese.js` —incluida la línea del DNI— y sale igual en los tres
idiomas.

**56.** Relevar lo que todavía no está relevado y el propio relevamiento manda mirar: los textos al
pie de los casilleros, los avisos de que algo se guardó, las ventanas de confirmar, los carteles de
las dos aplicaciones y los de Habilitar clave.

**57.** Que el Panel nombre la modalidad sólo cuando la Prestadora tiene las dos habilitadas, y
con el nombre comercial que informa CeltaTech como dato. Hoy la nombra en tres lugares —el
recuadro de Servicios por modalidad de Estado actual, el Resumen del mes y el motivo por el que un
Asistente no puede tomar una guardia—, con «Prestación directa» y «Match» escritos en los textos
del Panel, y lo hace aunque tenga una sola.

---

## Reclutamiento

**Esta sección esperaba la fusión, y ya no.** El reclutamiento es un módulo común a las dos
modalidades y la base de Asistentes de cada Prestadora es una sola para las dos; lo que faltaba
para poder construirlo son las listas de opciones por Prestadora y los formularios declarados, y **las
dos ya están construidas** —`listas_de_opciones` y `opciones_de_lista`, con su
pantalla en `panel/src/pages/configuracion/LasListasDeOpciones.jsx`, y
`formularios_declarados`, `formulario_secciones` y `formulario_campos`—. Sigue trabada por la pregunta **«¿dónde corre un módulo y contra
qué base?»**, más abajo.

Los tres arreglos, para que estén escritos:

1. **No existe el formulario público de postulación.** Hay una ruta de backend que acepta doce campos y ninguna pantalla que la use, y en la base no hay ninguna postulación. Cuando se dibuje, pide lo mismo que el alta de un Legajo: tipo y número de documento, DNI donde el documento lo contiene, y género, todos obligatorios.
2. **Las listas de opciones nacen vacías.** Género, nacionalidad, tipo de registro ante AFIP y los cinco subgrupos de experiencia clínica se cargan por Prestadora. **La pantalla donde se cargan ya está construida** —`panel/src/pages/configuracion/LasListasDeOpciones.jsx`—, así que lo que queda es sembrar las listas de cada Prestadora: mientras estén vacías el formulario no tiene nada que ofrecer.
3. **Al incorporar un aspirante se pierden quince datos.** Lo que cargó en la postulación no llega entero al Legajo del Asistente.

**57. Usted** — ¿Dónde vive el formulario público de postulación? No va en `careonys.com`, que le vende software a las Prestadoras: quien busca trabajo de cuidador se postula en la empresa que lo va a contratar. ¿En el sitio de cada Prestadora, con dirección propia?

**58.** La pantalla del formulario, que es lo único que falta: la base y el backend ya guardan y comprueban los campos de las seis secciones de `docs/PRD_03_Reclutamiento.md`, y el backend entrega las listas de opciones en `GET /api/publico/:prestadora/postulacion-asistente/opciones`. Se dibuja desde la declaración, no a mano. Esperaba el paso anterior.

**59. Usted** — ¿Se le bloquea la asignación de guardias a quien no está inscripto en monotributo, o se avisa y decide la Prestadora? La regla del producto dice avisar, no bloquear, así que el PRD y la regla no coinciden. **Lo que se asigna es un turno de guardia**, y asignarlo supone el Servicio armado, más arriba en esta lista.

**60.** Construirlo según lo contestado.

**61. Usted** — Comparar automáticamente la foto del documento con la foto de la cara es tratamiento de dato biométrico, y hacen falta dos decisiones suyas: ¿cuál es el documento legal del que sale la advertencia al Asistente, que hoy no existe y sin la cual no hay advertencia? ¿Y qué proveedor compara las dos caras? Guardar las dos fotos y mostrarlas juntas ya está hecho: hoy las compara una persona.

**62.** Construirlo según lo contestado.

**63. Usted** — El programa de capacitación: qué contenido lleva, cuántas preguntas y qué nota se necesita para aprobar. Hoy «capacitación» es sólo el nombre de una etapa.

**64.** Construirlo.

---

## Las dos aplicaciones

**65. Usted** — Compartir el Certificado de Aptitud: ¿hacia dónde y por qué medio? Hoy se puede ver, con su estado y su fecha. Compartirlo hacia afuera exige decidir a quién se le manda, por qué canal y qué ve quien lo recibe, porque no existe ninguna verificación pública del certificado: sin eso, lo compartido sería una imagen que no prueba nada.

**66. Usted** — La alerta por salida del domicilio, dos decisiones que no puedo tomar yo. Hoy la cuenta se hace con una velocidad media única y distancia en línea recta (`backend/src/utils/llegadaEstimada.js:39-45`), se dispara recién cuando alguien marcó la salida, y mide llegada tarde, no que el Asistente siga en su casa.

- **El tiempo de viaje real sale de un servicio de mapas ajeno.** Cuál se contrata, con qué cuenta y qué se le manda en cada consulta —las coordenadas de la casa de una persona salen del producto— es decisión suya, y la credencial la pone usted.
- **Dónde vive el Asistente ya se guarda**, con su dirección escrita y sus coordenadas, y anotado como dato sensible que no sale hacia el Cliente. Las coordenadas quedan vacías mientras nadie ubique la dirección en un mapa, y completarlas depende del servicio de mapas del punto anterior. Esto **no es una decisión suya**: está tomada y construida.
- **Y exige mirar el teléfono antes de que la guardia empiece.** Hoy el GPS se lee cuando la persona aprieta un botón. Leerlo sola, mientras todavía no empezó a trabajar, es seguir a alguien fuera de su horario: hay que decidir si se hace, con qué advertencia y con qué permiso.

**67.** Con eso contestado, construirlo — incluida la lista de medios de transporte, que hoy es texto libre escrito en cada salida y por eso no hay contra qué traducirlo a una velocidad.

**68. Usted** — El botón de contacto de «Asistente Asignado»: ¿a quién llama? El PRD lo dejó abierto —«WhatsApp o chat interno» (`docs/PRD_04_05_App_Servicio.md:224`)— y las dos salidas tienen consecuencias. Darle al Cliente el teléfono del Asistente es entregar el dato personal de quien trabaja, y es exactamente lo que Match cobra por abrir: ahí el contacto va tapado hasta que alguien paga. La otra salida es que el botón lleve a la Prestadora, que es con quien el Cliente tiene el trato en prestación directa, usando el contacto que ella misma configura. Hay una tercera: el hilo interno, que hoy existe sólo para Match y con el tapado puesto.

De las especialidades de esta pantalla no queda nada por hacer: `asistentes.especialidades` está retirada por comentario de la migración y no se escribe más. Lo vigente es el tipo de Asistente, que ya se muestra, con sus Tareas de lo que corresponde y lo que no.

**69. Usted** — El PRD promete exportar el reporte a PDF en la aplicación del Cliente, y más adelante dice que el Cliente no accede al informe. ¿Cuál de las dos vale?

**70.** Cuatro puntos de las aplicaciones y de lo que sale hacia el teléfono:

- **Los mensajes al celular buscan a quién mandarlos sin la Prestadora.** Una suscripción puede
  cambiar de dueño y de Prestadora —el propio código lo anota cuando pasa—, y entonces un mensaje
  armado con datos de una sale al aparato de otra.
- **El esquema de medicación de un Paciente se pide sin la Prestadora**, y la función ni siquiera
  la admite. Es dato de salud, lo más sensible que hay acá.
- **Qué signos vitales se autorizó monitorear**: la función recibe la Prestadora y no la usa.
- **La marca de la Prestadora queda guardada en el aparato y no se borra al salir.** Un teléfono
  compartido sigue mostrando el nombre de la anterior en los mensajes hasta que llegue el primer
  perfil de la nueva.

**El molde es siempre el mismo, y es el que hay que cortar:** el aislamiento vive en quien llama,
no adentro de la función. Mientras sea así, cualquier pantalla nueva que llame a una de ésas sin
comprobar antes abre el agujero sin que nadie se entere.

**71. Usted** — La lista de emergencias de cada Prestadora. Decidido por el Desarrollador, textual: *«cada prestadora podra armar su lista de emergencias dentro de la configuracion propia. Desde Careonys podemos proponer algunas, por ejemplo "Emergencia Medica", etc y un plan de accion sugerido y hasta acciones preconfiguradas que se pueden accionar automaticamente o no ante determinada emergencia. todo ello configurable por la prestadora»*. Queda así:

- Cada Prestadora arma su lista de emergencias en su configuración: agrega, cambia y quita.
- Careonys trae una lista de fábrica como propuesta, y cada emergencia de esa lista con un plan de acción sugerido.
- Cada emergencia puede llevar acciones preparadas de antemano. Para cada acción, la Prestadora elige si se ejecuta sola o la dispara una persona.
- **El Asistente elige la emergencia de la lista al apretar el botón.** La lista trae además la opción «Otras», donde escribe qué está pasando cuando no figura. Textual: *«El Asistente, cuando dispara la emergencia ademas de la lista con las opciones tendra la opcion de "otras" donde puede escribir la naturaleza de la emergencia no listada»*.

Falta que usted conteste dos cosas:

- **Qué emergencias y qué plan de acción trae la lista de fábrica.** Los textos los aprueba usted, uno por uno.
- **Qué acciones se pueden preparar**: avisar al Cliente, llamar al servicio de emergencias médicas, mandar a otro Asistente, u otras.

**72.** Construirlo según lo contestado. El tablero del Panel cuenta como emergencia sólo lo que avisó una persona con el botón.

**73.** El Panel se instala también en el teléfono, sin dejar de ser lo que es. En la computadora sigue igual. En el teléfono se instala desde el navegador, recibe avisos aunque no esté abierto y abre primero lo urgente del día —quién no llegó, qué guardia quedó sin cubrir, a quién mandar de reemplazo—, sin perder el resto. Es el mismo programa, con la misma dirección, la misma cuenta y los mismos permisos: no es una tercera aplicación. En el iPhone los avisos llegan sólo con el Panel instalado en la pantalla de inicio, igual que en las dos aplicaciones.

---

## Configuración que todavía está escrita en el código

**75. Usted** — Nivel de complejidad: ¿qué significa cada uno de los tres? ¿Condiciona qué tipo de Asistente se admite? Hoy se carga y se edita, y el cálculo de candidatos no lo mira.

**76.** Que el cálculo de candidatos lo use.

**77. Usted** — Verificar matrícula: ¿alcanza con mirar el archivo, o hay que comprobar contra el registro del colegio profesional? La mitad técnica está construida.

**78.** Construir la verificación según lo contestado.

**79. Usted** — Accesibilidad: el código está hecho, falta la respuesta legal. `docs/legal/argentina.md` no la menciona.

**80. Usted** — El Certificado de Aptitud impreso: ¿qué lleva? Hoy la pantalla genera el código de barras y ahí termina.

**81.** Armarlo. La subida del certificado a un depósito de archivos **ya está resuelta**: el
depósito de los papeles del legajo del Asistente está construido: es `documentos-asistente`.
Hoy sólo se guardan fechas.

---

## Datos personales

**82. Usted** — Protección de datos personales: el texto lo tiene que dar el Desarrollador. `docs/legal/argentina.md` tiene ocho secciones y ninguna es de esto. Sin documento no hay advertencia.

**83.** La advertencia. Qué se hace con los datos de un Servicio cerrado hace años, que hoy no se purgan nunca, no se contesta acá: es el tramo de conservación y borrado, más abajo en esta misma lista.

**84. Usted** — La ubicación de las personas: cuatro preguntas para el profesional legal. En los 21 archivos de `docs/legal/` no aparece ni una vez «ubicación», «GPS» ni la ley 25.326. El registro del consentimiento está construido; los textos sembrados son de relleno. **Mientras no haya respuesta, el seguimiento no se enciende con nadie real.**

**85.** Sembrar los textos reales y encender el seguimiento y el mensaje de demora en el trayecto.

---

## Respaldo, continuidad y secretos

**86. Usted** — El alta del gestor de contraseñas, y completar las cinco filas en blanco de `celtatech/docs/CUENTAS.md`.

**87.** Rotar clave por clave lo que corresponda, decidiéndolo de a una. Si se rota la clave secreta de Supabase, se actualiza en Railway en el mismo acto. Entra acá la clave de servicio de Supabase que estuvo escrita en texto plano en la configuración de permisos de la máquina: los comandos que la llevaban adentro ya se borraron, pero la clave en sí se rota el día de la liberación, no antes.

**Ya no queda ninguna contraseña escrita en el repositorio.** Todas salen del entorno, y las
cuentas de la base local nacen sin clave: se la pone un programa aparte después de cada
reconstrucción. Lo que queda por hacer acá es **rotar las cuentas que nacieron con las claves que
estuvieron a la vista**: las de la Prestadora de demostración, las de la demostración de
continuidad de guardia, las de la prueba de cierre de Servicio y las que quedaron sin borrar de la
prueba del escaneo del Asistente.

Y queda además **una contraseña de prueba en texto plano dentro de la configuración de permisos de
una copia de trabajo**, que no es un archivo del repositorio y por eso el barrido no la alcanzó.

**88. Usted** — Correr `node scripts/probar_restauracion.mjs` desde `backend/`, con Docker encendido y las variables del respaldo diario más las de la base de producción cargadas en el entorno. Baja el último respaldo, lo restaura en una base efímera, compara las tablas, las filas y los archivos del espejo contra lo que hay hoy, y borra todo al terminar. Le toca a usted porque pide las llaves del bucket y de la base, que viven en la caja fuerte. La prueba anterior verificó 30 tablas de un esquema que hoy tiene 105 y no tocó ningún archivo, porque todavía no se respaldaban. **Si contesta `no_probado`, no salió mal: quiere decir que todo coincidió y no había nada cargado que comparar**, y entonces hay que repetirla con datos de prueba.

**89. Usted** — Los dominios se renovaron en julio de 2026 y vencen en julio de 2027, y esa fecha hoy no está en ningún calendario: `celtatech.com` y `careonys.com` en Cloudflare, y `celtatech.com.ar` y `celtatech.net.ar` en NIC Argentina. Poner un recordatorio un mes antes de cada uno y, donde el registrador lo permita, dejar la renovación automática encendida — NIC Argentina no la tiene, así que ésos son los dos que de verdad dependen del recordatorio. Un dominio vencido no se cae despacio: deja de resolver, y con él se van las pantallas, el correo de la empresa y la entrada a las cuentas que se registraron con ese correo.

**La base local no tiene la clave con la que se firman las credenciales de las tareas.** La base
local no carga ninguna clave de firma —en `supabase/config.toml` el renglón `signing_keys_path`
está comentado— y el entorno local del backend no tiene `CLAVE_DEL_TRABAJO_SIN_PERSONA`. Sin eso,
en la máquina de trabajo no corre ninguna tarea programada y **el Panel local ni siquiera muestra la
entrada**: para saber de qué Prestadora es la dirección, el backend usa esa misma credencial, y
contesta 500. Se cierra cuando un programa genera el par de claves de la base local, deja la
pública en la configuración de la base y la privada en el entorno local del backend, y con la base
reconstruida el Panel local muestra la entrada de Sandbox.

---

## Marca y dominio por Prestadora

**90.** Que la conversación quede guardada adentro del producto, según lo que se conteste sobre el botón de contacto de «Asistente Asignado», más arriba en esta misma lista. Hasta que el Panel no tenga un hilo de dos puntas, lo que se hablan el Cliente y el Asistente en prestación directa se va a WhatsApp y no queda adentro de ningún lado. El chat interno ya está construido entero —hilos, mensajes, tapado del contacto, pantallas en las dos aplicaciones, mensaje al celular y videollamada—, pero **sólo funciona donde la Prestadora pone Asistentes disponibles para que el Cliente elija**: exige un Cliente y un Asistente que se hayan encontrado ahí. En prestación directa no hay hilo, y hacia la Prestadora tampoco: el único canal con el Panel va en un solo sentido, del Panel al Asistente, y no hay dónde guardar lo que contesta.

---

## Módulos

**91.** Pasar a `careonys` los cinco nombres de afuera que todavía no lo llevan: el nombre del
proyecto local, el servicio donde corre el backend con su dirección, y los dos depósitos de
respaldo. El repositorio ya se llama `careonys`.

**92. Usted** — ¿Dónde corre un módulo y contra qué base? Hoy `Modulos\` está vacía. **Facturación y créditos y cobranzas ya están decididas como software aparte del que Careonys se sirve**, así que esto no decide si salen, sino dónde corren el día que existan.

**93.** Sacar la facturación y la cobranza a un módulo, cuando haya dónde correrlo. **Y que Match
cobre igual que la prestación directa**, sin que ninguna de las dos pierda nada. Hoy Match lleva
la cuenta del Cliente por su cuenta —arma cada período, cuenta los días gratis y la gracia, y corta
el acceso solo—, y eso es créditos y cobranzas, que no le toca a Careonys. Se separan tres
trabajos, iguales para las dos modalidades:

- **Llevar la cuenta del Cliente** —cuánto debe, si está atrasado, si hay que restringirle algo—
  es de la Prestadora. Con software de cobranzas conectado lo lleva ese software y Careonys muestra
  lo que recibe; sin ninguno, Careonys guarda lo que la Prestadora registra.
- **Las plataformas de pago quedan como una forma más de pagar**, para las dos modalidades y
  optativa. El Cliente paga desde su aplicación y el dinero va directo a la cuenta de la
  Prestadora. En Match el acceso se abre apenas la plataforma confirma, y el saldo de contactos se
  carga en ese momento, como hoy.
- **El pago que confirma la plataforma se anota** con su origen y, si hay software conectado, se
  le pasa, para que la cuenta del Cliente quede entera en un solo lugar.

**Sin software conectado, el corte de Match por falta de pago lo configura la Prestadora**:
cuántos días de gracia da y qué pasa después, y Careonys ejecuta lo que ella configuró. Con
software conectado, el corte lo ordena ese software.

---

## Decisiones que no traban nada empezado

**94. Usted** — Empresas subcontratadas o tercerizadas: son un recurso dentro de la prestación directa, como el Padrón propio, y no una modalidad. Todavía no hay dónde cargarlas ni cómo encargarles una prestación. La precondición era no construirlo hasta que una Prestadora real lo pida. ¿Sigue valiendo?

**95. Usted** — Un tercero que sólo mira: ¿cómo entra un Pagador que sólo consulta? Un cuarto rol, un Coordinador de sólo lectura desde el catálogo de permisos, o no se hace.

**96. Usted** — ¿Careonys va a atender establecimientos donde conviven Pacientes de Clientes distintos — una residencia, un geriátrico? Si es más adelante, alcanza con dejarlo dicho.

**97. Usted** — ¿Diez pedidos por minuto y por persona es el número? El contador compartido hace falta el día que el backend se reparta en varios servicios; hoy corre en uno solo.

**98. Usted** — ¿Los idiomas siguen en un archivo o pasan a la base? De esto depende si sumar un
idioma es una publicación o una carga de datos. **Y está contestado a medias sin que nadie lo
anotara**, así que la pregunta es más chica de lo que parece:

- **Las listas de opciones ya viven en la base**, con la traducción adentro de cada opción.
- **Los mensajes que manda el producto también**, en `mensajes_del_sistema`, con su columna de
  traducciones y una fila propia por Prestadora más la del producto.
- **Lo que sigue en un archivo es el texto de las pantallas del Panel** —`panel/src/i18n/translations.js`—, que ningún archivo de `panel/src/` reemplazó todavía por la tabla.

Así que lo único que esto decide es ese último resto. **Y se contesta después de la sección de los
carteles**, más arriba: es justamente ese archivo el que se barre ahí, y no tiene sentido mudar
texto que va a salir.

**99. Usted** — El puntaje interno de calidad del Asistente, que sólo ve el Admin: ¿sigue en pie ahora que existen las estrellas que pone el Cliente? Si sigue, faltan dos respuestas: qué lo compone, y la garantía de que ninguna acción automática dependa de él. El lugar donde iría ya está hecho (`datos_reservados_asistente` y su permiso).

**100. Usted** — El alta y la baja de Prestadoras: Match expone una puerta firmada para que CeltaTech dé de alta y de baja clientes; Careonys no tiene nada parecido. ¿Se construye la misma, o se siguen dando de alta a mano?

**Usted — para analizar, no para resolver ahora.** Un registro de cambios general: qué dato
cambió, de qué valor a qué valor, quién y cuándo, para cualquier tabla que lo necesite. Hoy no
existe: cada cambio que se registra tiene su tabla propia (`auditoria_*`, el historial del registro
clínico). El primero que lo va a necesitar es el cambio de la fecha prevista de vuelta de una
ausencia; si el general se decide antes de construirlo, ese cambio se anota ahí.

**101.** **Por esa misma puerta tiene que entrar qué tiene habilitado cada Prestadora, y hoy no
entra nada.** CeltaTech le vende un plan, y ese plan dice qué puede usar. Eso se lo informa al
producto. **Y ahí termina: CeltaTech no tiene injerencia, bajo ninguna circunstancia, en el
negocio de ninguna Prestadora.** Le habilita funciones del software y nada más; qué cobra, a
quién, cuánto y con qué condiciones lo decide ella sola.

**Son tres niveles, uno arriba del otro, y falta el primero:**

- **Lo que CeltaTech le habilita**, según el plan que contrató. **No existe.**
- **Lo que la Prestadora decide usar**, adentro de eso, desde su Configuración. Existe.
- **Lo que el Legajo de cada Asistente permite**, adentro de lo que la Prestadora usa. Existe.

Como falta el primero, el de la Prestadora quedó siendo el único, y por eso hoy se habilita Match
sola. Del lado de CeltaTech el mecanismo ya está construido —un catálogo de capacidades que cada
producto declara, asignadas a planes y resueltas por suscripción, guardadas como texto que no
interpreta—. Lo que no existe es el canal por donde eso llegue acá.

**Y no es sólo al dar el alta: después también llega la orden de deshabilitar**, la aplicación
entera o una parte. **Por qué, Careonys no lo sabe ni lo pregunta**: recibe la orden y la ejecuta.
**Es un apagado distinto del de la Prestadora, aunque hoy los dos se dirían igual:**

- **El de la Prestadora** es una decisión de negocio de ella: deja de operar con una modalidad.
  Hoy el sistema no la deja apagar si quedan Asistentes trabajando o Clientes con acceso abierto,
  y está bien que no la deje.
- **La orden que llega no se puede bloquear.** Con esa misma comprobación, alcanzaría con tener un
  Asistente trabajando para que la orden nunca se cumpla.

**102. Usted** — Qué hace Careonys de su lado cuando recibe esa orden y adentro quedan Asistentes
trabajando y Clientes con acceso abierto. Cortar el acceso y dejarlo todo en su lugar no es lo
mismo que darlo de baja.

**103.** Construirlo, todo de este lado: recibir qué tiene habilitado cada Prestadora y que su
Configuración ofrezca solamente eso; y recibir la orden de deshabilitar, sin la comprobación que
lleva el apagado de ella, haciendo con lo que quede en curso lo que se conteste arriba. **La lista
de capacidades la declara este producto**, que es el que sabe qué significan; del otro lado son
texto opaco. Lo que cada Prestadora tenga hoy en uso se conserva.

**104. Usted** — El acompañamiento online: ¿prestación más, o guardia sin domicilio? Si es guardia, hay que decidir qué reemplaza al check-in por ubicación. **Las dos palabras son ahora dos niveles distintos del glosario**, así que la pregunta elige entre uno y el otro: una Prestación con su precio y sus horarios, o una guardia que se reparte en turnos. Y lo que reemplaza al check-in por ubicación es del turno, no de la guardia.

**105. Usted** — El «Gestor del cuidado»: ¿rol nuevo, variante de Coordinador, o entrada en el catálogo de permisos por Prestadora? La tercera no rompe la regla de los tres roles de Panel; las dos primeras sí.

**Se contesta después del acto de armar el Servicio**, más arriba en esta lista, por dos motivos. El
primero es que **la premisa con la que estaba escrita esta pregunta no es cierta**: decía que hoy el
Coordinador se asigna por guardia, y no se asigna en ninguna parte — la columna del coordinador en la
guardia no la escribe ninguna línea del Panel ni del backend, sólo la siembra `supabase/seed.sql`, y
lo que hay en pantalla es una lista deducida de las zonas en `panel/src/lib/equipoDelPaciente.js`. El
segundo es que ese acto cambia el modelo: **una sola persona coordina todo el Servicio, se la asigna
al acordarlo, y sin ella el Servicio no se habilita.** Con eso construido, la pregunta es si hace
falta alguien más además de esa persona, que es otra pregunta.

**106. Usted** — Cursos para Clientes: ¿va o no va?

**107. Usted** — La regla de los archivos dice «nunca público» y hay un depósito público construido (`marca-prestadoras`); los otros cinco son privados. ¿La regla admite la excepción, o se cierra el depósito?

**108. Usted** — La categoría de convenio del Asistente se teclea a mano, y de ella depende su
remuneración básica. El convenio tiene sus categorías definidas y no las inventa la Prestadora,
así que tecleadas quedan escritas distinto en cada Legajo: no se puede saber cuántos Asistentes hay
en cada una, ni aplicarle un cambio de escala a todos los de una categoría de una sola vez, y un
error de tipeo sale impreso en el documento de cese. El campo viene de la aplicación vieja y nunca
se discutió. **Qué hay que analizar:** si pasa a ser una lista que la Prestadora carga —porque las
categorías de otro país son otras y no pueden venir escritas en el código—, y qué se hace con las
liquidaciones que ya salieron. **El mecanismo para que sea una lista ya está construido**, con las
listas de opciones por Prestadora y su pantalla de carga; lo que falta decidir es si corresponde y
qué pasa con lo ya liquidado.

---

## El sitio web

**109. Usted** — ¿Se autoriza construir `careonys.com` según `docs/PRD_01_Sitio_Web.md`? El PRD ya está entero. Hoy `sitio-web/` es una página que dice «En construcción». **El diseño se hace de cero**: del sitio público de Match no viaja nada visual.

**110.** Construirlo.

---

## El cumplimiento que se agrega encima

**Va al final porque nada de esto obliga a reescribir lo anterior.** Son piezas que se apoyan sobre
lo que dejaron los cimientos y se suman sin tocarlo. Hacerlas antes no ahorra nada y demora el MVP;
hacerlas después cuesta lo mismo.

**Lo que sí es condición:** antes de dar de alta una Prestadora real de un país, ese país tiene que
tener cargado lo suyo. La lista por país, con artículo, está en `docs/CUMPLIMIENTO_NORMATIVO.md`.

**111.** **La revisión del registro de accesos, que es lo que casi nadie hace.** El 45 CFR
164.308(a)(1)(ii)(D) es «Required», no «Addressable»: hay que **revisar** los registros, con
constancia fechada y revisor con nombre. Un registro que nadie mira incumple aunque sea perfecto.

Se construye como trabajo del sistema, no como formulario: el sistema junta lo que se sale de lo
normal —accesos fuera de horario, a pacientes sin relación de cuidado con quien accede, en volumen
inusual— y se lo presenta a quien revisa. Quien revisa firma que revisó, y esa firma es la
evidencia.

El acceso a un paciente sin relación de cuidado es la regla sueca —Patientdatalagen 4 kap. 2 §— y
es la más fina del conjunto: no alcanza con pertenecer a la Prestadora. Chile la escribió como
requisito de arquitectura, y por eso su parte está en los cimientos y no acá.

**Comprobación:** la constancia de revisión existe, tiene fecha y nombre, y se puede mostrar para
cualquier mes.

**112.** **El motor de conservación y borrado.** Las columnas y la tabla de reglas ya existen desde
los cimientos; acá se carga y se construye lo que decide.

**Antes de construirlo se contesta:** qué clases de registro existen, porque la tabla las guarda
como texto libre; quién carga las reglas, que hoy sólo entran por migración; si la fecha de
fallecimiento se muda a la Ficha de Persona cuando el Paciente pase a citar una; si su cambio se audita; cómo se
borra lo vencido del historial del registro clínico, que hoy no lo puede borrar nadie; y qué otras
tablas son clínicas y se versionan, además de las dos que ya lo hacen.

Lo que la tabla tiene que poder expresar, porque hay un país que obliga a cada forma:

- Un plazo que corre **desde la muerte del paciente** (Panamá, 20 años). Sin fecha de fallecimiento
  no hay vencimiento que calcular y la purga queda bloqueada. Lo único que deja destruir antes es
  lo que no sea relevante para la asistencia, a los dos años de la última atención, y eso excluye el
  núcleo documental del art. 50 de la Ley 68.
- **Dos plazos encadenados que la norma suma** (Perú: 5 años de archivo activo más 15 de pasivo, 20
  en total desde la última atención, y 40 años para el cáncer de origen ocupacional). El reloj se
  reinicia con cada atención, la eliminación la autoriza el Archivo General de la Nación, y de la
  historia electrónica no se borra ningún dato.
- **Un piso de guarda que no autoriza a borrar cuando se cumple** (México, 5 años desde el último
  acto médico). Dice hasta cuándo hay que guardar; no dice que después se pueda tirar.
- **Un vencimiento independiente del clínico** (Costa Rica, art. 11 del reglamento: diez años desde
  que terminó el objeto del tratamiento).
- Un plazo que corre **desde el último ingreso de información** (Chile, 15 años, art. 11 del
  Decreto 41/2012). Cualquier anotación posterior reinicia el reloj de toda la historia clínica.
- **Dos plazos encadenados** (Colombia: 5 de gestión más 10 de archivo central, 15 en total desde la
  última atención; 30 si el paciente fue víctima de violaciones a los derechos humanos, y guarda
  permanente si la historia integra un proceso por delitos de lesa humanidad).
- **Un vencimiento que no habilita a borrar solo.** Brasil dice 20 años desde el último registro,
  pero los prontuários «podrán» ser eliminados, previa revisión de una comisión y con registro del
  destino final; Colombia exige acta de eliminación firmada y remitida a dos organismos; Chile dice
  que vencidos los 15 años el prestador **podrá** eliminar, y si lo hace necesita acta
  protocolizada ante notario. **Vencido el plazo el sistema avisa y espera, nunca borra.** Y hay una
  norma del consejo médico brasileño que sigue diciendo guarda permanente y que nunca fue revocada
  expresamente: por las dudas, el defecto no elimina.
- **Desasociar en vez de borrar** al vencer (Costa Rica, 10 años desde el hecho registrado).
- **Seudonimizar el dato derivado**, no al vencer (Ecuador, LOPDP art. 31 numeral 2). Sobre el dato
  operativo no es posible —identificar al paciente es la finalidad del producto—, pero sí sobre
  tableros, estadísticas, reportes agregados, entornos de prueba, respaldos analíticos y el registro
  de actividad. **Se seudonimiza y no se anonimiza, y es deliberado:** el numeral 3 exige
  autorización previa de la autoridad, protocolo técnico e informe del ministerio de salud para
  tratar datos de salud **anonimizados**, y no menciona la seudonimización.
- **Un vencimiento donde lo correcto es no borrar** (Uruguay). Los cinco años del Decreto 355/982
  son una facultad de destruir, pensada para el papel. Y el art. 13 del Decreto 242/017 va al revés.

**El plazo de Ecuador está sin verificar** y se carga como dato el día que aparezca la fuente
oficial, sin tocar código.

El borrado tiene que alcanzar los respaldos, o hay que documentar por escrito que no puede: el
borrado incompleto en entorno de varios clientes está nombrado como amenaza en el Apéndice C de
NIST SP 800-66r2, lo que lo convierte en amenaza razonablemente anticipada del 164.306(a)(2).

**Y el borrado es por dato, no por cuenta.** El art. 17(3) del GDPR dice «en la medida en que»: que
la historia clínica deba conservarse no hace inborrables las preferencias de comunicación, los
perfiles opcionales, las notas no clínicas ni las copias analíticas. Acá se contesta qué pasa con
los datos de un Servicio cerrado hace años.

**Comprobación:** con dos Prestadoras de países distintos y las mismas fechas cargadas, el motor
decide distinto en cada una y lo explica citando la regla que aplicó.

**113.** **Los derechos de la persona.** Exportación de lo propio, en formato que se pueda leer en
otro lado: el Anexo II sección 2 del EHDS lo convierte en deber duro contra el encierro en el
proveedor, y la portabilidad está en casi todas las leyes latinoamericanas.

Plazo de respuesta por jurisdicción: Costa Rica cinco días hábiles, Panamá diez para responder y
cinco para modificar, Argentina cuarenta y ocho horas para la copia de la historia clínica. Sale de
la configuración del país, con aviso a quien tiene que contestar antes de que venza. Y quién hereda
el derecho al fallecer cambia por país: en Costa Rica pasa a sucesores o herederos.

**Comprobación:** un pedido de acceso cargado en una Prestadora de Costa Rica vence a los cinco días
hábiles y avisa antes; el mismo pedido en Panamá vence a los diez.

**114.** **Las brechas, construidas para 24 horas.** Hay cinco relojes y manda el más corto. Europa:
NIS2 exige aviso temprano a las 24 horas, y el art. 33(2) del GDPR obliga al encargado a avisarle al
responsable sin dilación indebida, sin umbral y sin derecho a filtrar. Estados Unidos: el 164.410 da
60 días al proveedor, pero **la regla no le da al cliente 60 días nuevos**, así que un proveedor que
consuma los suyos deja a su cliente en infracción automática. Latinoamérica: Costa Rica cinco días
hábiles **contados desde que ocurrió**, no desde que se supo, avisando al titular **y** a la
autoridad; Perú 48 horas; Brasil tres días hábiles; Panamá y Uruguay 72 horas; Ecuador cinco días
hábiles a la autoridad de datos **y a la de telecomunicaciones**, con el encargado obligado a
avisarle al responsable en dos, y tres días al titular contados desde cuando se conoció el riesgo;
Chile no pone plazo en horas y dice «sin dilaciones indebidas», que es peor porque no da margen.

**Dos relojes distintos en el mismo expediente es lo normal.** De ahí la decisión de diseño: el
sistema anota **los dos momentos** —cuándo ocurrió y cuándo se supo— en todo incidente, y cada país
calcula con el que le corresponde. Guardar uno solo obliga a elegir a cuál país incumplirle.

Lo que se construye: poder decir por evento qué Prestadora y qué pacientes —sin eso cualquier
incidente se vuelve notificación masiva—; registro de todos los incidentes, notificados o no (art.
33(5) del GDPR, art. 38 del Decreto 285 panameño); la evaluación de cuatro factores del 164.402(2),
porque allá todo acceso no permitido se presume brecha salvo que se demuestre baja probabilidad de
compromiso y la carga de la prueba es de la empresa; y plantillas de aviso por jurisdicción, con el
contenido mínimo de cada una —el 164.404(c) pide cinco elementos—.

**Comprobación:** un incidente de prueba sobre una Prestadora produce la lista de pacientes
alcanzados, el texto de aviso del país de esa Prestadora y la cuenta regresiva correcta.

**115.** **Quién entra y cómo.**

- **Segundo factor obligatorio.** Está construido y apagado: `requiereRolPanel.js:82-85`, gobernado
  por `configuracion_plataforma.mfa_admin_obligatorio`. Encenderlo es cambiar un dato. Ninguna norma
  vigente de Estados Unidos lo exige —el 164.312(d) es un estándar desnudo—, pero ningún comprador
  grande compra sin él.
- **Ninguna cuenta compartida.** El 164.312(a)(2)(i) exige identificación única por persona y está
  marcado «Required»: una cuenta compartida es incumplimiento liso y llano.
- **Acceso de emergencia.** El 164.312(a)(2)(ii) también es «Required» y hoy no existe: una vía
  definida para llegar al dato cuando la normal no está, registrada y revisada como cualquier otra.
- **Cierre por inactividad para todos**, no sólo para el permiso de acceso de CeltaTech.
- **El acceso del personal propio.** C5 OPS-30.01B cubre la separación cliente-de-cliente **y**
  cliente-del-proveedor: el camino por el que el personal de CeltaTech alcanza los datos está dentro
  del alcance de la auditoría. La forma ya está escrita en `..\..\CLAUDE.md` §6 —una Organización
  por vez, acotado, con corte por inactividad, todo auditado— y lo que faltaba era que no exista
  ninguna credencial permanente que alcance a varias, que es lo que resuelven los cimientos.

**Comprobación:** con el segundo factor obligatorio encendido, una cuenta sin él no entra a ninguna
pantalla del Panel.

**116.** **Respaldos que se probaron.** El 164.308(a)(7)(ii)(A), (B) y (C) son «Required»: copia
exacta y recuperable, restauración y modo de emergencia. El Decreto 41/2012 chileno lo escribe como
requisito de la historia clínica, y en Francia la copia de respaldo es una de las actividades
certificables del référentiel HDS.

**Y hay un país que fija frecuencia:** el art. 51 del DS 016-2024-JUS peruano exige copias
**semanales** con verificación de integridad. Es el único plazo numérico del relevamiento, así que
manda.

Se construye la restauración probada **y con constancia**, no la promesa de que se puede. La prueba
en sí es la que ya está más arriba en esta lista; lo que falta acá es que deje constancia, que se
repita sola y que quede atada a la frecuencia peruana.

**Comprobación:** una restauración completa a un entorno aparte, con constancia de fecha y de qué
se verificó.

**117.** **La configuración por país, cargada.** La estructura existe y está vacía de esta materia.
Se carga, por jurisdicción: plazos de conservación con su hecho de inicio, plazo de brecha con su
destinatario y desde cuándo corre, plazo de respuesta a los derechos, mecanismo de transferencia
internacional, contacto del delegado u oficial de protección de datos donde sea obligatorio, y el
texto de consentimiento que cubra específicamente la transferencia internacional donde haga falta.

Vale la regla de la empresa: **el producto avisa, no bloquea**, y el aviso sale del documento legal
de ese país. Si el país no tiene documento, no hay aviso, y sin documento no se vende ahí.

**Y los documentos legales de `docs/legal/` hay que ampliarlos, empezando por Argentina.** Los 21
archivos existen, pero el de Argentina —el único desarrollado— cubre riesgo laboral. La materia de
protección de datos de salud, conservación del expediente y notificación de brechas no está escrita
en ninguno.

**Comprobación:** ningún plazo de estos aparece escrito en el código.

**118. Usted** — **Las designaciones que no son programación.** Representante legal en Perú y en
Ecuador, y delegado de protección de datos en Ecuador y en Uruguay. Son designaciones de CeltaTech
y condición para vender en esos países.

**119.** **Los documentos que pide la auditoría.** Son entregables, y sin ellos lo construido no
cuenta.

- **Análisis de riesgos que nombre expresamente el acceso entre Prestadoras como amenaza**, citando
  el Apéndice C de NIST SP 800-66r2, que lo enumera en tres eventos. Sin esto, nada más ayuda.
- **Evaluación de impacto.** Obligatoria y previa al tratamiento: concurren el art. 35(3)(b) del
  GDPR y cuatro de los nueve criterios de la guía WP248 contra un umbral de dos, y los ficheros de
  pacientes están en las listas de Francia y España. El encargado no la hace, pero el art. 28(3)(f)
  lo obliga a asistir: es un entregable del producto. Brasil, Perú, Uruguay, Ecuador y Panamá piden
  su equivalente.
- **Registro de actividades del art. 30(2).** La exención del 30(5) no sirve: tratar datos del
  art. 9 la derriba.
- **La prueba de aislamiento repetible**, más **una prueba de penetración de tercero dirigida al
  acceso entre Prestadoras.** C5 la pide como evidencia cuando la separación no se puede demostrar
  internamente, y el art. 32(1)(d) del GDPR convierte la verificación periódica en obligación legal.
- **La documentación de cada «Addressable» que no se implemente**, conservada seis años
  (164.316(b)(2)(i)).
- **La constancia de prácticas de seguridad reconocidas.** El 42 U.S.C. §17941 obliga al regulador a
  considerarlas, pero exige acreditar **no menos de los doce meses anteriores**: lo adoptado después
  del incidente no vale nada. Es la única palanca real que existe, y hay que empezar a acumularla
  temprano.
- **`docs/CUMPLIMIENTO_NORMATIVO.md`** se mantiene al día con cada paso.

**Comprobación:** cada documento existe y lo que afirma se puede verificar en el sistema.

**120.** **Lo que no se hace nunca.**

- **No se entrenan modelos con datos de las Prestadoras.** Prohibido por tres vías: el art. 28(10)
  del GDPR convierte al encargado en responsable, el EHDS haría del producto titular de datos
  sanitarios y su art. 54 lo prohíbe expresamente, y el art. 11 §4º de la LGPD brasileña prohíbe
  compartir datos de salud con fines de ventaja económica.
- **Nada de riesgo alto del AI Act sin saberlo.** La exposición no está en la vía clínica sino en el
  Anexo III punto 4(b): la IA que asigna tareas según comportamiento o rasgos personales o evalúa
  desempeño. Un emparejamiento o una planificación de Asistentes que los puntúa **es alto riesgo**,
  y la salida del art. 6(3) queda cerrada por el perfilado. Rige desde el 2 de diciembre de 2027,
  con autoevaluación, pero no hay norma armonizada y tampoco presunción de conformidad. **La
  transparencia del art. 50 no se aplazó y rige desde el 2 de agosto de 2026.**

**Comprobación:** un automatismo que corte la publicación si aparece una llamada de entrenamiento
con datos de producción.

### Lo que no hay que construir

Cada renglón es un ahorro, y está verificado.

- **No hace falta una base de datos por Prestadora.** Ninguna norma prohíbe la base compartida ni
  prescribe esquema, base o instancia por cliente. C5 admite expresamente recursos compartidos y
  dice que la separación criptográfica no es obligatoria en todos.
- **No hace falta que el control de acceso viva fuera de la aplicación.** Lo que exigen es poder
  demostrar la separación, que es distinto.
- **No hace falta certificarse en HIPAA: no existe esa certificación.** Todo sello que diga lo
  contrario es autoafirmación y no sirve como defensa.
- **No existe «estar certificado en GDPR».** Los arts. 42 y 43 certifican operaciones concretas, no
  organizaciones, y el 42(4) dice que no reducen la responsabilidad.
- **SOC 2 no es una certificación** y no contiene ninguna regla que diga «aísle a sus clientes».
  Sirve igual, porque es el sustituto de mercado del derecho de auditoría que HIPAA no da.
- **C5 no es una certificación**, es un dictamen de auditor. Pero el §393 SGB V lo vuelve condición
  legal en Alemania.
- **ISO 27799 no se certifica**, y 27017 y 27018 no se certifican por separado.
- **No hace falta construir el proyecto estadounidense de 2025.** No es ley y está en acciones de
  largo plazo con fecha proyectada en julio de 2027.
- **El producto no es una DiGA alemana.**
- **El Reglamento de ciberresiliencia no alcanza al software como servicio.**
- **El esquema nacional de seguridad español no aplica** salvo que se venda al sector público.
- **HIPAA no exige inventario de activos, ni mapa de red, ni auditoría anual, ni prueba de
  restauración, ni prueba de penetración.** Varias están igual en esta lista, pero porque las piden
  C5, el mercado o la prueba del aislamiento.

### Lo que quedó sin verificar y no se completó de memoria

- **El référentiel HDS francés no se pudo leer.** Es donde estaría la exigencia francesa de
  compartimentación entre clientes. Se pide al organismo certificador cuando se abra esa
  conversación.
- **La norma holandesa NEN 7513:2018 es de pago.** Su lista de campos y su plazo son desconocidos.
- **El plazo de conservación de Ecuador** no se pudo confirmar en fuente oficial.
- **El precio del complemento de Supabase para datos de salud estadounidenses** no está publicado.
- **Los importes de sanción ajustados del año en curso** no se consultaron.
- **Italia, Bélgica, Polonia, Dinamarca, Noruega y Finlandia** no se relevaron. El de Finlandia es
  el que más importa: clasifica los sistemas en clase A o B con evaluación de conformidad por
  organismos aprobados.
- En Latinoamérica quedaron sin verificar los regímenes sancionatorios de casi todos los países y
  varios plazos de respuesta a derechos.

### Lo que esta lista no hace

**No construye interoperabilidad nacional.** Uruguay obliga a intercambiar por la plataforma HCEN,
Colombia a interoperar la historia clínica electrónica, Perú a declarar al RENHICE, y México exige
que el sistema de expediente electrónico esté certificado ante la Dirección General de Información
en Salud antes de vender —y la NOM-024-SSA3-2012 numeral 1.2 pone esa obligación sobre el
desarrollador, o sea CeltaTech—. Son cuatro obras propias, cada una con su plan, y ninguna es
condición para las demás.

**No reemplaza a un abogado de cada país.** Todo esto es relevamiento de fuentes públicas.

---

## Todo lo del abogado, junto y después del MVP

Las consultas legales se hacen **todas juntas, una vez que el MVP funcione**. No se van a hacer de
a una, porque cada una es una consulta profesional aparte.

Y una cosa que cambia cómo se construye: **ninguna de estas respuestas es una regla fija.** Están
vivas, cambian cuando haga falta y las veces que haga falta. Así que nada de esto entra en el
código: entra como configuración por jurisdicción, con su fecha de vigencia, y un cálculo viejo
tiene que seguir dando el mismo número que dio el día que se hizo. Eso ya es regla de la empresa
—*los cálculos legales y económicos van parametrizados por jurisdicción, y a la escala vigente a la
fecha del hecho*—, y acá se confirma.

Las que ya están identificadas, cada una con su paso propio en esta lista: la advertencia para el
tratamiento de dato biométrico, la accesibilidad, la protección de datos personales, y las cuatro
preguntas sobre la ubicación de las personas. Los pasos que dependen de ellas dicen qué se
construye igual mientras tanto.

**Y hay una tanda que no espera al MVP, porque no es consulta sino contrato:** las cláusulas
contractuales tipo que habilitan alojar en São Paulo los datos de una Prestadora argentina tienen
que estar firmadas antes del alta de la primera Prestadora real. Eso está en «Los cimientos», y por
eso está ahí y no acá. El material para esa consulta —cuál es la cláusula, cuáles son las dos vías
vigentes y qué hay que definir antes de redactar— está en
`celtatech/docs/CLAUSULA_TRANSFERENCIA_INTERNACIONAL.md`.

**121. Usted** — Las escalas legales: la validación, y los dos valores que el código usa y no
existen (`piso_minimo_indemnizacion` y `fraccion_computable_antiguedad`). En el mismo viaje va el
texto de la advertencia sobre el abandono de persona: ninguno de los veintiún documentos de `docs/legal/`
lo menciona —lo único parecido es el abandono de *trabajo*, art. 244 LCT, en
`docs/legal/argentina.md:147`, que es otra cosa—, y la regla del producto prohíbe improvisarlo. Sin
documento no hay advertencia; la mecánica se construye igual, porque no depende de ninguna ley.

---

## Cierre

**122. Usted** — El documento de roles generado desde la base: ¿para quién es, interno de CeltaTech o manual para la Prestadora?

**123.** Generarlo.

**124.** Correr las pruebas y publicar.
