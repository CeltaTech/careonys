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

**La obra arranca por la sección «Los cimientos», y adentro por «La credencial del trabajo sin
persona».** Es lo que hay que hacer antes que cualquier otra cosa, y mientras dure **no sale
ninguna pantalla nueva**. Lo que construye «Dónde viven los datos» —que el código no dé por
sentado que hay una sola base— va en la misma pasada que «El pase de la persona en el backend»,
porque los dos reescriben el mismo archivo de conexión.

**El plan está aprobado en su ordenamiento y en sus dos decisiones de fondo**, que ya no se
vuelven a preguntar: los datos viven en São Paulo con el código previsto para más de una
instalación, y el segundo nivel de aislamiento se construye ahora.

**Los pasos de «Lo que se dijo que decidió usted» no frenan la obra.** Son una conversación con el
Desarrollador, renglón por renglón, y avanzan cuando él abra un grupo. Ninguno de ellos es
condición del trabajo de los cimientos.

**Lo único que quedó sin contestar, y se contesta recién al escribir esa política:** si en Chile el
segundo nivel va clavado sin interruptor, o si el interruptor existe y apagarlo avisa y queda
registrado quién lo hizo. Está planteado en el paso que le corresponde.

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

### 1. Quién decide qué filas ve una consulta

Esto ya no se contesta acá: está resuelto y es la sección «Los cimientos» de esta misma lista. La
llave que alcanza todas las Prestadoras sale del producto y el aislamiento lo hace cumplir la base.
Queda un solo renglón de este tema sin decidir:

- `CLAUDE.md:310` — **[ya construido]** que no se convierta en dueño lo que dispara un cambio en la base.

### 2. Cómo entra cada persona, y quién tiene más poder que nadie

**Este grupo traba el primer paso que se construye.** La cuenta por Prestadora y toda la sección de
la clave, más abajo en esta misma lista, se apoyan en esto. Si acá cambia algo, cambian las dos.

- `docs/PLAN_HASTA_PRODUCCION.md`, «La entrada y la recuperación de la clave» — el bloque entero titulado «Lo decidido, y no se vuelve a discutir»: las tres vías, cuándo se pide el código, qué es un equipo nuevo, la huella y la cara afuera, y la aplicación de códigos sólo para el rol técnico.
- `docs/PRD_04_05_App_Servicio.md:34` y `:204` — **[ya construido]** que el Asistente y la Familia entren con clave escrita y no con un enlace al correo.
- `docs/PRD_04_05_App_Servicio.md:231` — **[ya construido]** que al Asistente se lo confirme escaneando adentro de la aplicación, y que se elimine la ficha pública con código de barras.
- `docs/claude_history.md:375` — **[ya construido]** la creación del rol técnico, por encima de la administración de la Prestadora.

### 3. Cómo le cobra una Prestadora a sus Clientes, en todas sus modalidades

**Es el grupo más grande, el que más código tiene detrás, y el que menos se puede contestar
salteado.** Si la cobranza sí fuera función de Careonys, cambian el padrón, los tres papeles de una
contratación y el estado de cuenta. Y al revés. **Una respuesta suelta acá rompe las demás.**

**Y se analiza entero, con las dos modalidades a la vista.** Hoy hay dos formas de cobrarle a un
Cliente y están construidas por separado: en prestación directa se factura el servicio con un
software de afuera, y en Match se cobra el contacto con un saldo y una suscripción, con pasarela
propia. **Las dos son la misma Prestadora cobrándole a sus Clientes**, así que las decisiones de
una no se pueden cerrar sin mirar la otra. El cobro del contacto está tratado más abajo, en la
sección de la modalidad Match; **lo que se decida acá manda sobre aquello.**

**Hay una sola venta de contactos construida, y es de la Prestadora a la Familia.** Un importe, sin
vencimiento, y un saldo que se descuenta de a un Asistente. Lo arma cada Prestadora con sus
valores, y la Familia le paga a ella. Está construido acá, junto con la suscripción que se renueva
sola.

**CeltaTech vende software, y nada más.** No vende contactos. Así que del otro lado no hay ninguna
venta de contactos con la que confundir a ésta, y el producto no tiene que preguntarle nada a nadie
para dejar abrir uno.

**Y vender el acceso a una cantidad de contactos es de cada Prestadora, una por una, sin mezclarse
con ninguna otra.** Cuántos contactos trae un paquete y cuánto sale lo decide cada una para sí, y
ni el saldo, ni el estado de la suscripción, ni el contacto que se abre alcanzan jamás a otra.
**De esa regla sale directo el primer punto del paso de Match, más abajo**: hoy el saldo y el
estado de la suscripción de una Familia se buscan sin la Prestadora.

**Y queda un renglón para sacar en el plan de Match**, que dice que el precio y el tope de los
paquetes de contactos son de CeltaTech. Nació de leer «la decisión comercial no es del producto»
como «lo vende CeltaTech», que es otra cosa: la decide cada Prestadora. Ese repositorio está en
sólo lectura, así que el renglón se saca cuando se lo toque.

- `docs/claude_history.md:453` — **[ya construido]** que la cobranza no sea una función de Careonys.
- `CLAUDE.md:198` — que Careonys no asuma facturación ni cobranzas.
- `docs/claude_history.md:429` — **[ya construido]** que Careonys guarde el comprobante que emitió otro y no emita ninguno.
- `docs/claude_history.md:447` — **[ya construido]** que haya tres formas fijas de conectar con la facturación de cada Prestadora.
- `docs/claude_history.md:435` — que la cobranza se configure distinto en cada Prestadora.
- `CLAUDE.md:233` — **[ya construido]** que hacia afuera se entregue y no se traiga.
- `docs/claude_history.md:459` — **[ya construido]** que haya un padrón único de Clientes. En ese mismo renglón hay una admisión escrita: la regla anterior la escribí yo y usted nunca la pidió. La reemplaza por ésta, también sin cita.
- `docs/claude_history.md:465` — **[ya construido]** que una contratación se separe en tres papeles distintos.
- `CLAUDE.md:259` — **[ya construido]** que un Legajo no se borre nunca.
- `CLAUDE.md:279` — **[ya construido]** que el número de Legajo no se muestre.
- `CLAUDE.md:265` — que la palabra rol nunca signifique permisos.

### 4. Los mensajes: qué detecta el sistema solo y a quién le avisa

Los cuatro son el mismo mecanismo mirado desde documentos distintos. Qué detecta, si se puede
apagar, y por dónde sale el mensaje.

- `docs/DATA_MODEL.md:591` y `docs/PRD_04_05_App_Servicio.md:168` — **[ya construido]** que el sistema detecte las ausencias y avise temprano solo.
- `docs/PRD_04_05_App_Servicio.md:179` — que las alertas se puedan enchufar y sacar.
- `docs/PRD_06_WhatsApp_IA.md:121` — el catálogo de mensajes, los reintentos y a quién se escala.
- `docs/PRD_06_WhatsApp_IA.md:26` — que el número y la cuenta de WhatsApp sean de cada Prestadora.

Y colgada de ese último, una decisión de seguridad que sólo tiene sentido si el número es de cada
Prestadora:

- `docs/PRD_06_WhatsApp_IA.md:105` — que las credenciales de Meta queden donde ni el rol técnico las lea.

### 5. La marca, el sitio y dónde viven los archivos

Los tres se sostienen entre sí: la marca compartida obliga a que el logo de cada Prestadora se vea
en las pantallas, y de ahí sale el depósito público, que es la única excepción a «los archivos se
guardan privados».

- `docs/MARCA.md:5` y `:27` — **[ya construido]** el modelo de marca del producto: compartida con la Prestadora y no marca blanca.
- `docs/claude_history.md:123` — **[ya construido]** que el depósito de logos sea público para leer. **Se contesta junto con el paso de más abajo que pregunta si la regla admite esa excepción o si el depósito se cierra:** ahí se decide qué pasa, acá sólo si la decisión fue suya.
- `docs/PRD_01_Sitio_Web.md:195` — que la página de cada Prestadora la arme CeltaTech y no sea función de Careonys. **Se contesta antes que el paso que autoriza construir el sitio**, más abajo: si esto no es suyo, ese documento cambia antes de que se construya nada.

### 6. Documentos enteros atribuidos de una sola vez

No es una decisión sino un documento completo puesto a su nombre. Si no es suyo, lo que hay que
revisar es el documento entero, no un renglón.

- `docs/PRD_07_Modalidad_Marketplace.md:3` — el planteo entero de la modalidad Match. **La parte de cómo se cobra el contacto no se contesta acá: va con el grupo del cobro**, más arriba, junto con la facturación de prestación directa.
- `docs/PRD_02_Panel_Admin.md:15` — el planteo entero del Panel.
- `docs/PRD_08_Dashboard_Modalidades.md:213` — ocho puntos de diseño del tablero, cerrados de una sola vez y con fecha.
- `docs/PLAN_CONTINUIDAD_PROVEEDORES.md:229` — qué se hace si cae un proveedor.

### 7. Cómo se elige construir, que no se ve en ninguna pantalla

Las tres deciden con qué criterio se elige, no qué se construye. Por eso van juntas: o valen las
tres o no vale ninguna.

- `docs/claude_history.md:387` — **[ya construido]** que lo propio del producto no quede atado a la plataforma de base de datos.
- `docs/claude_history.md:395` — que la arquitectura se elija pensando en que dure, no en lo más rápido de hacer.
- `docs/claude_history.md:353` — que la empresa tenga que poder operar con poca gente.
- `docs/claude_history.md:411` — que el nivel visual del producto tenga que superar al de la competencia.

### 8. Sueltas, que no se agrupan con ninguna otra

Éstas sí se contestan de a una, en cualquier orden.

- `docs/claude_history.md:324` — **[ya construido]** que una guardia pueda tener más de un Paciente. Sigue en pie con la escala que ahora tiene el glosario: vale para la guardia y también para cada turno adentro de ella, y no traba nada de lo que sigue.
- `docs/claude_history.md:225` y `:226` — **[ya construido]** que se descarte la pantalla de obra social con reglas escritas en el código, y que el informe de obra social sea sólo del Panel.
- `docs/claude_history.md:417` — **[ya construido]** que el tipo de cambio quede afuera de la regla de la moneda.
- `CLAUDE.md:137` y `docs/claude_history.md:423` — **[ya construido]** que el nombre interno viejo no se toque por ahora. **Queda sin efecto si el paso de más abajo lo saca**, que es lo que hoy dice el plan: si se saca, esta atribución se borra sola.

### 9. Los nombres, todos juntos y de una sola vez

Acá lo más probable es que la decisión sí sea suya y lo que falte sea la cita. **Se contestan los
cinco de un saque**, con un sí o un no: no hay nada que decidir de a uno.

- `docs/claude_history.md:162` — **[ya construido]** que el producto se llame Careonys.
- `docs/claude_history.md:171` — **[ya construido]** que la empresa se llame CeltaTech.
- `docs/claude_history.md:208` — **[ya construido]** que la sección se llame Documentación.
- `docs/claude_history.md:267` — **[ya construido]** que se diga Estado actual.
- `docs/claude_history.md:85` — **[ya construido]** que la pantalla de ajustes se llame Interruptores.

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
`backend/src/routes/appFamilias.js`.

**Lo que separa una Prestadora de otra es un filtro escrito a mano.** `acotarAPrestadora` agrega la
condición en 71 renglones. De las 886 consultas del backend, **111 no nombran la Prestadora**, y de
ésas **17 confían en un identificador que viene de afuera sin comprobar de quién es** —sólo en 1 se
verificó que la comprobación exista—. Si falta un filtro, la base contesta igual: no tiene con qué
darse cuenta.

**Los archivos más sensibles son los peor protegidos.** De los 11 depósitos, cuatro no tienen
ninguna política: `certificados-medicos`, `autorizaciones-monitoreo`, `documentos-cese` y
`fotos-identidad`. Ahí están los certificados médicos y las fotos de identidad. Los sirve el backend
con la llave maestra, y el aislamiento son **22 lugares donde se compara a mano el comienzo de la
ruta del archivo** (`panelMedicacion.js:181`, `panelVitalesAutorizacion.js:79`).

**La protección por fila está puesta y hoy no protege de nada.** Las 182 tablas la tienen encendida
y 170 tienen política, y ninguna depende de nada que aporte el backend: la Prestadora la resuelve
`interno.current_tenant()` con la cuenta de quien entró. **La base ya sabe aislar y nadie le está
preguntando.**

**Hay trabajo que hoy no podría hacerse sin la llave maestra**, porque no tiene ninguna persona
detrás: 17 tareas programadas, 4 entradas que llaman terceros, 8 puertas públicas y lo que el
backend sigue haciendo después de contestar. Y hay operaciones sobre cuentas que hoy sólo se hacen
con la llave maestra. El detalle está en el paso de la credencial del trabajo sin persona.

**Nadie sabe quién leyó qué.** `registro_actividad` anota once acciones y todas son escrituras o
entradas al Panel: ninguna lectura queda registrada. `auditoria_de_accesos` tiene `admin_id` no
nulo, así que sólo alcanza al personal de CeltaTech, y tiene cero filas. Y no es inmutable: la
llave maestra puede borrarlo.

**El registro clínico se sobreescribe.** `indicaciones_medicacion` y `rangos_referencia_vitales`
tienen `updated_at` y ningún historial: corregir pisa lo anterior.

**No hay fecha de fallecimiento** en ninguna columna de ninguna tabla, y no existe nada de
conservación: cero apariciones de `anonimiz`, `purga`, `retencion`, `conservacion` y
`derecho_al_olvido`. Lo que hay es borrado lógico: un dato marcado como borrado queda para siempre.

**No hay exportación ni portabilidad.** El derecho de acceso se atiende a mano, contra la base.

**El cierre por inactividad existe sólo para el permiso de acceso de CeltaTech.** Las sesiones de la
gente de la Prestadora no se cierran. **El segundo factor está construido y apagado**:
`requiereRolPanel.js:82-85` rechaza el pase que no llegó a `aal2`, gobernado por
`configuracion_plataforma.mfa_admin_obligatorio`, que hoy vale `false`.

**La estructura de configuración por país está hecha y vacía.** `advertencias_legales` tiene 13
filas, todas de jurisdicción `AR`, y las trece son de materia laboral o del Marketplace: ninguna es
de protección de datos. `escalas_legales` también es sólo `AR`.

**Los datos están en São Paulo** (`sa-east-1`). Para Brasil es tratamiento local; para todos los
demás países es transferencia internacional hacia Brasil.

**Lo que sí está bien.** Los secretos de pasarelas viven en Supabase Vault, no en claro. Diez de
los once depósitos son privados y se sirven con dirección firmada. El consentimiento se registra
con texto versionado, con quién consintió, por qué medio, desde cuándo y hasta cuándo.

### Qué queda cuando esto termina

- **`SUPABASE_SERVICE_ROLE_KEY` no existe en el producto.** No está en el código, ni en el
  repositorio, ni en las variables de entorno del backend.
- **Todo pedido de una persona viaja con el pase de esa persona**, y la base decide qué filas
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

**5.** **Dónde viven los datos: São Paulo, y el código preparado para más de una instalación.**
Decidido. No se abre alojamiento europeo hasta que haya un cliente europeo: pagar por un mercado
que todavía no existe es gasto sin contrapartida, y esa puerta se abre el día que haga falta.
Hasta entonces **Europa no se vende**, y no por trámite: Alemania y Francia exigen que los datos
de salud estén alojados allá. **Estados Unidos sí se puede vender sin mudar nada**, porque no
exige residencia: lo que pide es el contrato con el proveedor de la nube, que es dinero y no obra.

Lo que se construye acá es una sola cosa: **ninguna parte del código da por sentado que hay una
sola base. La Prestadora trae consigo a cuál pertenece.** Dejarlo previsto ahora no cuesta nada;
agregarlo el día que aparezca el cliente europeo es reescribir. Cuando eso pase, el identificador
de una Prestadora deja de ser único en el producto y pasa a serlo por instalación, y la puerta de
entrada tiene que saber a qué instalación mandar a cada quien. Nada más del producto se resiente:
cada Prestadora es un cajón cerrado, el banco de Asistentes es por Prestadora y la elección es por
cercanía al paciente, así que nada necesita ser único cruzando el océano.

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

**6.** **El segundo nivel de aislamiento, el que Chile exige.** El art. 13 de la Ley
20.584 prohíbe ver la historia de una persona a quien no está vinculado a su atención, y aclara que
eso **incluye al personal de salud y administrativo de la propia Prestadora**. El art. 9 del Decreto
41/2012 obliga a tomar medidas para impedirlo. Es un segundo nivel: no por rol, sino por vínculo con
esa persona. Hoy quien tiene un rol que alcanza a toda su Prestadora ve la información de salud de
cualquier paciente de ella, atienda a esa persona o no: eso cumple la regla de la empresa y **no**
cumple la ley chilena.

**De qué se habla y de qué no.** Lo que se restringe es **la información de salud**: la historia
clínica, las indicaciones, los registros de lo que se le hizo a esa persona. El Padrón —quién es
el Cliente, cómo se lo ubica, sus datos fiscales— no entra acá y queda como está, porque quien
administra lo necesita para trabajar y ahí no hay ningún dato de salud.

**Se construye ahora, y va en la misma pasada que el resto de estos pasos** —es una condición más
en una política—. Diferirlo sería reescribir permisos después.

**Encendido siempre en Chile, y elegible en el resto.** Donde la ley lo exige no hay interruptor.
Donde no lo exige, cada Prestadora decide si lo usa, porque es forma de trabajo suya: una empresa
chica donde las mismas personas atienden a todos los pacientes trabaja de una manera y una grande
de otra.
**Nace encendido**, y quien lo apaga lo hace a propósito. Que en un país no esté exigido no lo
vuelve mala idea: es lo correcto con datos de salud en cualquier lado.

**Qué país es cada Prestadora ya está en la base** —`prestadoras.pais`—, así que de ahí sale si el
interruptor se ofrece o no. Que sea obligatorio en Chile no se escribe en el código: sale de la
configuración por país, igual que las advertencias legales.

**Con el interruptor encendido, la regla es una sola: la información de salud de un paciente la
alcanza quien está vinculado a su atención, y nadie más.** No hay rol que se salve por ser el más
alto: un Administrador que no atiende a esa persona tampoco la ve. El vínculo se prueba con lo que
ya está en la base —a quién se le está prestando el Servicio y quién lo presta—, no con una lista
aparte que alguien tenga que mantener.

**7.** **La credencial del trabajo sin persona.** Es lo primero que se construye porque hasta que
exista, quitar la llave maestra rompe la mitad del producto.

**Qué es trabajo sin persona**, medido contra el código y contra la base en vivo:

- **17 tareas programadas.** Las 16 de `backend/src/server.js:194-322` y la carga de
  `mensajes_del_sistema` al arrancar (`server.js:345`).
- **4 entradas que llaman terceros:** pasarelas, WhatsApp, aviso de cobranza y aviso de
  facturación. Las cuatro traen la Prestadora en la dirección y la confirman con el secreto de ella.
- **8 puertas públicas:** las cuatro de `/api/publico/:prestadora/`, la activación de la cuenta, la
  recuperación de la clave, la entrevista y la entrada con la llave del dispositivo.
- **Lo que el backend sigue haciendo después de contestar:** `appAsistentes.js:851`, `:877`,
  `:1499` y `:1510-1528` —este último escribe datos clínicos: alertas y pacientes—, y
  `conversacionMarketplace.js:217`.

**Lo que tocan:** 81 tablas, 11 funciones y un depósito, `comprobantes-familia`. De las tablas, 11
no tienen ninguna política y 16 sólo le contestan a `authenticated`. Ninguna tiene la protección
forzada para su dueño.

**Por qué hoy no se puede sin la llave maestra:** `interno.current_tenant()` saca la Prestadora de
dos fuentes y las dos son `auth.uid()`. Sin sesión no devuelve nada, y todas las políticas de esas
81 tablas pasan por ahí.

**Lo que hoy cruza Prestadoras, y se corrige en este paso:**

- `avisoPrevioAlCobro.js:61-70` lee de una vez los accesos vigentes de todas.
- `cargarMensajesDelSistema.js:32-43` junta los textos de todas en una memoria común.
- `plazosDeCobroMarketplace.js:95-101` calcula un máximo sobre todas.
- El código de activación (`activacionCuenta.js:107`), el de recuperación
  (`recuperacionDeClave.js:137`), la llave pública de la entrevista
  (`entrevistaDePostulacion.js:339`) y la llave del dispositivo
  (`routes/llaveDelDispositivo.js:59-98` y `:169-171`) se buscan sin saber la Prestadora, y el desafío de la llave nace sin ella. **La Prestadora
  sale de la puerta por donde se entró**, como en todo el producto, y la búsqueda se hace adentro de
  ella.
- La política `superadmin_ve_todos_los_envios_de_correo` de `envios_de_correo` no pide Prestadora.

**Las operaciones sobre cuentas.** Hoy pasan por la administración de cuentas de Supabase, que sólo
funciona con la llave maestra. Sin sesión: la clave al activar (`activacionCuenta.js:146`), la clave
al recuperar (`recuperacionDeClave.js:253`) y la entrada con la llave del dispositivo
(`routes/llaveDelDispositivo.js:234`). Desde el Panel: crear, buscar y borrar cuentas
(`cuentasPanel.js:107-111`, `:157`, `:196`, `:207`, `:228`, `:288`) y cerrar la sesión en todos los
equipos (`equiposConocidos.js:112`). **Con la cuenta por Prestadora, cada cuenta es de una sola
Prestadora**, así que cada una de estas operaciones se hace adentro de la Prestadora dueña de la
cuenta y se comprueba contra ella. **La llave maestra no se conserva para ninguna:** la pieza que
sólo funciona con ella se reemplaza.

**Dar de alta a una persona, ponerle la clave y darla de baja lo hace la base de datos.** Hoy lo
hace el programa pidiéndoselo a Supabase —el servicio que guarda las cuentas con que la gente
entra—, y para pedírselo usa la llave maestra. Pero esas cuentas están guardadas en la misma base
de datos que todo lo demás, así que la base puede hacerlo sola, sin llave maestra. Lo hace con tres
procedimientos propios, uno por operación. Cada uno sabe para qué Prestadora trabaja por quién se
lo pidió, nunca por un dato escrito en el pedido, y no puede tocar la cuenta de otra Prestadora.

- **Dar de alta.** Lo pide el Administrador desde el Panel, con su propia sesión. Se crea la cuenta
  de la persona y, en el mismo momento, se anota a qué Prestadora pertenece y qué rol tiene. Se
  hacen las dos cosas o ninguna: nunca queda una cuenta a medio crear.
- **Poner o cambiar la clave.** Pasa cuando la persona activa su cuenta por primera vez o cuando
  olvidó la clave. Todavía no tiene sesión, así que lo que la autoriza es el código de un solo uso
  que recibió. Ese código se busca sólo dentro de la Prestadora por la que la persona
  entró, y queda anulado en el mismo momento en que se cambia la clave.
- **Dar de baja.** Lo pide el Administrador desde el Panel, con su propia sesión. Se borran juntas
  la cuenta y la anotación de a qué Prestadora pertenece.

Nadie que no haya entrado al sistema puede usar estos procedimientos. Dar de alta y dar de baja
sólo los pide alguien con sesión abierta; poner la clave, sólo las pantallas de activación y de
recuperación.

**Todos los días se prueba que esto siga andando**, porque Supabase puede cambiar cómo guarda las
cuentas y, si eso los rompe, nadie puede entrar. Una tarea corre sola una vez por día, sin depender
de que se publique una versión nueva: en el Sandbox da de alta a una persona inventada, le pone
clave, entra con ella y la da de baja. Si algo falla, ese mismo día le llega a CeltaTech un mensaje
del sistema.

**El producto no crea las cuentas de los Administradores ni la del Superadmin.** Hoy el Panel
permite crearlas y recuperarles la clave: las dos cosas se sacan. El producto se queda con las
cuentas que cada Administrador le da a su gente: coordinadores, Asistentes, Familias y círculo
familiar.

**Queda para después recuperar el código extra que se le pide al personal técnico al entrar**,
porque esas personas no pertenecen a ninguna Prestadora. Se resuelve cuando usted conteste qué pasa
con ese rol, en «Lo que se dijo que decidió usted».

**Y dos disparadores lo van a sentir:** `interno.prestadora_de_la_restriccion` e
`interno.prestadora_del_estado_de_cuenta` completan la Prestadora leyendo `familias` con los
permisos de quien inserta.

Se crea en la base un rol propio —`tarea_de_fondo`— con permiso **sólo** sobre lo que ese trabajo
toca, según la lista de arriba. Nada más. El backend no
guarda una credencial de ese rol: **firma un pase corto, para una Prestadora y para un trabajo.**

`interno.current_tenant()` suma una tercera fuente después de las dos que ya tiene: cuando quien
consulta es `tarea_de_fondo`, la Prestadora sale del pase firmado. Un pase sin Prestadora no
resuelve nada y la base niega todo: falla cerrado, igual que hoy.

Las 4 entradas que llaman terceros traen la Prestadora en la dirección. Primero se confirma con la
firma del mensaje —que ya se verifica—, y recién con ese dato se firma el pase. Leer el secreto de firma es lo único que pasa por una función que resuelve la Prestadora
adentro.

**Comprobación:** con el pase de una Prestadora se lee lo suyo y se pide algo de la otra; lo segundo
falla. Y con ese pase se pide una tabla que no está en la lista: también falla. Se arma a mano
un pedido con la sesión de un Administrador de una Prestadora para dar de alta y dar de baja a una
persona de la otra, y se usa un código de activación de una Prestadora entrando por la otra: la
base rechaza las tres cosas. Y se hace fallar a
propósito una vez la prueba diaria, para ver que el mensaje del sistema le llega a CeltaTech.

**8.** **Los archivos.** Los cuatro depósitos sin política reciben política, con la Prestadora en
el comienzo de la ruta exigida por la base. Los 22 lugares donde el código compara texto de ruta se
borran. Los archivos se siguen sirviendo con dirección firmada y vencimiento.

**Comprobación:** con el pase de una persona de una Prestadora se pide un archivo de la otra, con la
ruta correcta y todo. Tiene que fallar en la base, no en el código.

**9.** **El pase de la persona en el backend, y el registro de lecturas en la misma pasada.**

`connection.js` deja de exportar un cliente y pasa a entregar **el cliente de quien está pidiendo**,
armado con el pase que viene en el pedido. Los 135 archivos cambian de qué importan, no de qué
hacen. `requiereRolPanel.js` deja de validar el pase con la llave maestra y lo valida con la clave
pública, que es para lo que está; y deja de leer `usuarios` sin filtro, porque con el pase de la
persona la base ya le contesta una sola fila. Se hace **por grupos de rutas**, y al terminar cada
grupo `acotarAPrestadora` sale de esas rutas.

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

**Comprobación:** las 1798 pruebas del backend, y las dos de aislamiento con dos Prestadoras con
datos cargados. Más una que hoy no existe: **quitarle el filtro a una consulta a propósito y
verificar que sigue sin traer datos de la otra Prestadora.** Si eso pasa, la base está protegiendo.
Y sobre el registro: se lee un paciente desde dos Prestadoras con dos personas distintas y contesta
las dos, por paciente, con los seis campos; se altera una entrada del medio y la cadena queda rota y
el sistema lo dice.

**10.** **Se cierra la puerta.** Sale `SUPABASE_SERVICE_ROLE_KEY` del backend y de sus variables de
entorno. Se borra `acotarAPrestadora`. Los 17 casos que confiaban en un identificador de afuera
dejan de ser un riesgo porque la base ya no les cree.

**Comprobación:** el producto funciona sin esa variable definida. Es la única prueba que no se puede
falsear.

**11.** **El registro clínico no se pisa.** Versionado con nota aclaratoria: la corrección se
agrega, la anterior queda, las dos con fecha, hora y autor. Alcanza a `indicaciones_medicacion`,
`rangos_referencia_vitales` y toda tabla clínica nueva.

Va acá y no más abajo porque es un cambio del modelo de datos: hacerlo antes es una migración,
hacerlo después es una migración más lo que ya se perdió, que no se recupera.

Lo exigen el art. 32 del Reglamento del Expediente de Salud de la CCSS de Costa Rica —prohibidos
correctores, tachaduras y sobreescritura— y su art. 17, que dice que los registros incorporados no
pueden excluirse. Brasil pide irrefutabilidad del prontuário; Argentina, historia clínica
cronológica, foliada y completa; y el art. 13 del Decreto 242/017 uruguayo dice que la información
no puede alterarse ni eliminarse sin que quede registrada la modificación, y que la corrección
agrega el dato nuevo sin suprimir lo corregido.

**Comprobación:** se corrige una indicación y quedan las dos versiones, cada una con su autor y su
momento.

**12.** **Las columnas que la conservación necesita.** Sólo las columnas y la tabla de reglas
vacía: el motor que decide y avisa va al final de esta lista, donde no cuesta más hacerlo después.
Van acá porque agregar columnas a una base cargada de datos reales de salud es otro orden de
trabajo.

Hace falta la **fecha de fallecimiento**, que hoy no existe en ninguna columna. Es un dato que llega
de afuera y puede no llegar nunca: el sistema no se entera solo de que alguien murió. De ahí que en
Panamá la regla sea al revés de lo que parece —el plazo corre desde la muerte, así que **mientras
ese dato falte no hay vencimiento que calcular y la purga automática queda bloqueada.**

Y hace falta la tabla de reglas de retención, por jurisdicción y por clase de registro, porque cada
país cuenta desde un hecho distinto y el art. 9(4) del GDPR deja los plazos a la ley nacional.
Ninguno de esos plazos puede estar escrito en el código.

**Comprobación:** la columna existe, admite estar vacía, y ninguna tarea de purga corre sobre una
fila que no la tiene cargada.

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

**17.** Una cuenta por Prestadora. **Un Asistente trabaja en varias Prestadoras y una Familia
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
responsabilidades a quien la releva o a la Familia. **Lo pactado se carga al nivel de la
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
- **La sugerencia de Asistentes ya promete por escrito lo que no hace.** La ventana de una
  Solicitud dice «Ordenados por zona, especialidad y disponibilidad», y el cálculo
  —`panel/src/lib/candidatos.js`— no nombra zonas ni lugares en ninguna línea. Sumarle la zona no
  es agregar una función: es cumplir lo que la pantalla afirma. **Y más abajo hay otro paso sobre
  ese mismo archivo**, el del nivel de complejidad. Los dos se hacen en una sola pasada.
- **El acuerdo económico como criterio de sugerencia toca el dinero**, que es el grupo de arriba
  sin contestar: para que la sugerencia mire si la Asistente está de acuerdo con los montos y los
  plazos, esos montos tienen que estar guardados en algún lado.
- **Un coordinador de sólo lectura no puede ser el asignado.** Más abajo se pregunta cómo entra un
  financiador que sólo consulta, y una de las salidas propuestas es un Coordinador de sólo lectura.
  Quien tiene el Servicio asignado arma el equipo: si esa salida se elige, tiene que decir que ese
  rol nunca queda como responsable de un Servicio.
- **La ventana de crear un turno hoy no sabe que existe un Servicio.** Pide la lista completa de
  Pacientes de la empresa, sin recorte de ninguna clase, y se llega a ella también desde una
  Solicitud. Cuando el turno cuelgue del Servicio esa ventana cambia de raíz, **y es la misma
  ventana que toca la sección de carteles**, más abajo. Una sola pasada.

**18. Usted** — Aprobar ese plan, que todavía no está aprobado. Hasta que lo esté no se escribe
código de producción de ninguno de sus ocho pasos.

**19. Usted** — Las tres respuestas que ese plan espera, cada una con su situación delante en el
documento: qué dice el aviso cuando queda un horario pactado sin nadie que lo cubra; qué dice el
tercer estado de la coordinación, el de la vacante que cubre la administración mientras no haya
nadie asignado; y si «suspender» es distinto de «pausar» —una sola acción con fecha de vuelta
opcional, o dos, una por tiempo conocido y otra indefinida—.

**20. Usted** — Y dos que aparecieron al escribir la escala de cuatro niveles, las dos sobre lo
guardado:

- **La tabla `guardias` guarda turnos**, no guardias: cada fila lleva una Asistente, un día, un
  horario y su check-in y su check-out. El nivel de la guardia completa, el período que se reparte
  entre varias, **no tiene tabla**. ¿Se deja el nombre como está, entendiendo que una fila es un
  turno, o se renombra? Renombrar es una mudanza de datos sobre `guardias`, `series_guardias` y todo
  lo que las nombra, así que lo decide usted.
- **De qué es una guardia no está guardado en ninguna parte.** Un Servicio incluye varias —de
  cuidados, de enfermería, de lo que se haya acordado—, y el tipo hoy lo lleva únicamente la persona
  que la cubre, en su ficha. Así que la guardia se deduce de quién la cubre, **y mientras no haya
  nadie asignado no dice qué hace falta ahí**. Sin eso, el aviso del hueco puede decir que falta
  cubrir un horario pero no de qué, y la sugerencia de Asistentes no tiene contra qué comparar. ¿El
  tipo pasa a la guardia?

**21. Usted** — Y una que aparece al cruzar el acto con la regla del producto: **el Pagador.** La
regla dice que quien asume la obligación de pagar queda definido recién cuando firma, y que eso
tiene que estar listo **el día que se firma con la Familia** — que es exactamente este acto. Pero
la firma vive hoy en otra pantalla, dentro de la ficha de la Familia, con su propio estado y sus
botones de armar el consentimiento y registrar la firma; y el único requisito que este acto pone
para habilitar un Servicio es el coordinador asignado. ¿Son dos requisitos, y un Servicio sin
Pagador firmado tampoco se habilita? ¿O el acto muestra cómo está esa firma y deja seguir?

**22.** Construir los ocho pasos de ese plan, en el orden que tiene escrito.

**23.** Sacar de los tres idiomas la explicación de la coordinación que hoy acompaña al equipo del
Paciente, que dice que mientras nadie esté fijado son todos los que trabajan en la zona. Describe el
modelo que este plan reemplaza. Va junto con el paso del coordinador asignado, no antes.

**24.** Agregar el tipo «Servicio» a Ajustes › Importación, que hoy no está entre los tipos que se
pueden importar. Va después de que el acto exista: importar un Servicio sin coordinador asignado
sería dar de alta algo que el producto no habilita.

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
  Para todos — administración, coordinación, Asistentes y Familias.
- **Equipo nuevo quiere decir un aparato que no tiene llave guardada y desde el que nunca se
  entró.** Nada más que eso. No hace falta reconocer el navegador ni mirar desde dónde se conecta.
- **La huella y la cara quedan afuera de la recuperación.** Son para el día a día, en el teléfono, y
  sólo donde el aparato las tiene — la aplicación ya pregunta si puede y ante la duda contesta que
  no. En el Panel no están construidas. No pueden ser requisito de nada.
- **No hay aplicación de códigos para nadie más que el rol técnico**, que ya la tiene. Obliga a
  instalar algo aparte, y quien cambia de teléfono sin guardar el respaldo queda afuera.
- **El número viaja con el chip; la llave se queda en el aparato.** Con el mismo número en un
  aparato nuevo no hay nada que habilitar, porque lo verificado es el número. Con un número nuevo,
  ese número no sirve para recuperar la clave hasta que lo habilite quien corresponde.
- **Nada de esto puede impedirle a nadie trabajar.** La habilitación es para que un número se vuelva
  llave, nunca para entrar.

**25.** Lo mismo, en las dos aplicaciones de teléfono. Hoy un Asistente y una Familia no tienen
nada de esto: no pueden verificar ni cambiar su número con código, entrar desde un equipo nuevo no
les pide código, y **no pueden cerrar la sesión de todos los equipos**, que es justo lo que
necesita alguien a quien le robaron el teléfono. La única puerta es el Panel, y ahí no entran.
**Acá falta backend y no sólo pantalla**, al revés que en los pasos de arriba: las piezas de fondo
—mandar el código, comprobarlo, reconocer el equipo, cerrar todas las sesiones— están escritas y
no conocen ningún rol, pero las únicas puertas que las usan exigen ser del Panel y rechazan a un
Asistente y a una Familia. Hay que abrir las puertas equivalentes para ellos dos, y recién
después las pantallas.

**26.** Pedir el enlace de la clave nueva desde las dos aplicaciones de teléfono. Hoy no se puede:
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

**27.** Escribir la conexión de ida con el software de facturación de la primera Prestadora, cuando
haya una y ella lo elija. **No se escribe antes**: se miraron los cinco que más se usan en
Argentina y se conectan todos parecido pero con datos distintos, así que escribir uno a ciegas es
acertar con suerte. Lo investigado está en `docs/FACTURADORES_Y_COMO_SE_CONECTAN.md`. **Cada
software es una pieza aparte** y agregar la segunda no puede obligar a tocar la primera. Las otras
dos maneras ya están hechas y alcanzan para salir a producción: se anota factura por factura a
mano, o se baja un archivo con todo lo que falta facturar y se sube el que el software devuelve.

**28.** La pantalla de los datos bancarios del Asistente. El dato lo informa él, así que él lo
carga y él lo corrige: la base ya lo deja escribir su propia fila y ninguna otra, y el backend ya
tiene por dónde —cargar, corregir y sacar la cuenta—, con lo que entra validado y con el cambio
anotado. Falta la pantalla donde lo hace, en la aplicación del Asistente.

---

## La modalidad Match de cara a la Familia

Existe el andamiaje —base, disparadores, cobros, consentimiento—, la Familia ya puede buscar un Asistente, ver su perfil público, escribirle por adentro de la aplicación y, activando el cobro, ver cómo llegar a él por afuera. **Todavía no puede contratarlo.**

**El cobro del contacto no se decide en esta sección.** Cobrarle un contacto a una Familia y
facturarle el servicio a un Cliente son dos formas de cobro de la misma Prestadora, y se analizan
juntas, arriba de todo, en el grupo del cobro. Acá queda lo que es propio de la modalidad.

**Y la modalidad se llama Match, no Marketplace.** El nombre viejo sigue escrito en unos ciento
cuarenta archivos de este producto. Se saca en tres tandas, y no son la misma cosa:

- **Lo visible y lo escrito** —pantallas, traducciones y documentos, incluido el nombre del
  documento de la modalidad—. Eso se cambia entero, porque es marca.
- **Lo guardado** —tablas, columnas, restricciones, reglas de la base—. Unas veinte cosas llevan el
  nombre adentro. **Eso no se renombra**, porque lo que se guarda se nombra por lo que hace y
  renombrarlo convierte un cambio de marca en una mudanza de datos. Queda como está.
- **Los nombres de archivo y de función del código.** No son marca ni son dato guardado, así que
  acá sí hay una decisión: se dejan o se cambian con la tanda visible.

**29. Usted** — La tercera tanda: ¿los archivos y funciones que llevan el nombre viejo se cambian
o se dejan?

**30.** Sacar el nombre viejo de lo visible y de lo escrito, y aplicar lo contestado sobre el
código. Lo guardado no se toca. **Va en una sola pasada con el barrido de tuteo y voseo** de la
sección de los carteles, más abajo: los dos reescriben las traducciones del Panel en los tres
idiomas, y hacerlo dos veces es tocar el mismo archivo dos veces.

**31. Usted** — Prioridad de acceso al plantel ante una baja: el PRD la define en una línea (`docs/PRD_07_Modalidad_Marketplace.md:225`) y de ahí salen dos productos distintos. ¿Es que el contacto del reemplazo no vuelva a costar durante una ventana —ni descuenta saldo ni pide un acceso nuevo—, o es que a esa Familia se le avise primero cuando alguien del plantel vuelve a estar disponible? ¿O las dos? Y antes que eso: hoy la Familia no contrata por Match, así que no hay baja que detectar. ¿Qué cuenta como baja — que el Asistente se saque de los disponibles, que la Familia cierre el Servicio, o hay que construir antes el vínculo?

**32.** Construirla según lo contestado.

**33.** Tres puntos de Match donde la Prestadora no se aplica:

- **El saldo de contactos y el estado de la suscripción de una Familia se buscan sin la
  Prestadora.** Una de las dos funciones la recibe y no la usa en ninguna consulta. **Es
  exactamente lo que la regla de arriba prohíbe**, y por eso éste se corrige primero.
- **Abrir el contacto de un Asistente no comprueba que sea de la misma Prestadora.** La función de
  la base etiqueta bien la fila, pero acepta el Asistente que le pasen. Hoy la única barrera es
  que la pantalla lo valide antes.
- **El catálogo de motivos de los mensajes se lee entero, sin Prestadora.** Hoy está vacío a
  propósito. El día que una Prestadora cargue una regla propia, se le aplica a todas.

---

## Los huecos del Panel

**34. Usted** — De la Solicitud: ¿cómo se le presenta la Asistente nueva a la Familia — mensaje sin respuesta, aceptación explícita, o fuera del sistema? **Cuelga del acto de armar el Servicio**, más arriba en esta lista: sin Servicio armado no hay a qué Familia presentarle a nadie.

**35. Usted** — Las dos observaciones de apariencia que quedan, porque las dos son decisiones de diseño: ¿con qué pantalla abre la aplicación de Familia cuando hay más de un Paciente — hoy abre en la lista, y con uno solo ya se saltea al detalle? ¿Y cuál es la identidad visual de las dos aplicaciones, que nunca pasaron por su etapa de diseño?

El Desarrollador está preparando una maqueta orientativa de cómo tienen que verse y cómo se recorren. **La maqueta mejora lo que ya está construido: no es condición para construirlo.** Las pantallas que faltan se hacen ahora, con la apariencia que el producto ya tiene, y cuando la maqueta llegue se acomoda lo que haya que acomodar. Ningún paso de esta lista espera por ella.

**36. Usted** — Rotación y retención de Asistentes: ¿cuál es la fórmula y cuál el umbral?

**37.** Ponerlo en el tablero. Se calcula desde `ceses` y `asistentes`, sin tabla nueva.

**38.** El aislamiento del Panel, que hoy descansa entero en la base. Tres cosas:

- **Unas cuarenta consultas no llevan ningún filtro propio.** Si una política se afloja, o entra
  una tabla nueva sin la suya, esas pantallas muestran listas y números mezclados y nada en el
  código lo frena. Lo más visible serían los números del tablero y el mapa del plantel.
- **Cinco pantallas guardan con la Prestadora que traía la fila que estaba en pantalla**, no con
  la de la sesión. Hoy coincide. Es un dato de aislamiento viajando por un camino que la sesión no
  controla.
- **Al lado de cada cuenta se cuenta en cuántos lugares trabaja, y suma los de otras
  Prestadoras.** Deja deducir que esa persona trabaja en otra.

**39.** La marca del equipo del Panel usa un solo casillero del navegador para todas las
Prestadoras: la última pisa a la anterior. El backend la valida contra la Prestadora, así que no
sale ningún dato; es un dato de una Organización viajando adentro del pedido de otra.

---

## Los carteles y el texto visible del Panel

**Todo lo de esta sección es texto que ve alguien, así que lo aprueba usted, uno por uno.** El
relevamiento completo está en `docs/CARTELES_DEL_PANEL.md`, cartel por cartel y con la pantalla
donde se ve cada uno; sus decisiones ya tomadas están en `docs/CARTELES_DEL_PANEL.docx`, que es
fuente y no se modifica.

**Va acá, pegada a los huecos del Panel, porque es el mismo ámbito**, y sobre todo porque **comparte
pasada con el paso que saca el nombre viejo de lo visible**, más arriba: los dos reescriben las
traducciones del Panel en los tres idiomas, y eso se hace una vez, no dos.

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
  la modalidad de marketplace y habla de la suscripción de las Familias, así que depende del grupo
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

**40. Usted** — Los siete carteles que esperan su texto. Tres de ellos ya tienen el texto o el
molde escrito en el `.docx` y lo único que falta es confirmarlo.

**41. Usted** — Las dos preguntas que usted dejó escritas en el `.docx` y que siguen sin
contestar: qué es un selector, y si alguna pantalla dice «La Prestadora».

**42. Usted** — El cartel que quedó parado porque no ubicó la situación. Va con la pantalla
delante.

**43. Usted** — Los tres grupos que quedaron sin autorizar: los once textos que salen por ser una
aclaración debajo de un casillero, los catorce que pasarían a formar parte de la etiqueta del
casillero, y los nueve casilleros que están mal hechos y por eso necesitaban esa aclaración.

**44. Usted** — Habilitar clave: qué carteles lleva se decide después de analizar el procedimiento
y su lógica, no antes.

**45. Usted** — El bloque del segundo factor en Configuración › Accesos, con dos frases que
nombran un rol que no existe. **Y detrás hay una decisión que no está en ninguna parte de esta
lista:** la regla del producto dice que hay un solo Administrador por Prestadora y que las personas
en las que él delega funciones propias **llevan otro nombre, que todavía no está decidido**. Sin
ese nombre, esas dos frases no se pueden reescribir.

**46. Usted** — Tres cosas que son texto visible y no se pueden decidir de mi lado: la
contradicción del certificado, donde dos textos dicen cosas distintas del mismo código; las cuatro
frases que le nombran al usuario el permiso de acceso, que la regla del producto dice que la
Prestadora no ve ni sabe que existe; y la advertencia legal escrita adentro del
código de la aplicación del Asistente, que según la regla tiene que salir del documento legal de ese
país.

**47.** Aplicar todo lo contestado, y lo que ya está autorizado: el cambio de «Círculo de cuidado»
a «Personas autorizadas», que es grande y no lleva ningún mensaje.

**48.** Lo que no espera ninguna respuesta porque ya es regla escrita: sacar el tuteo y el voseo de
todo el Panel y de las dos aplicaciones, sin excepción —va en la misma pasada que el nombre viejo—;
quitar los textos que no se alcanzan desde ninguna pantalla; y escribir la regla de que cuando un
texto sale sale el cartel entero, donde vive la regla del casillero.

**49.** Relevar lo que todavía no está relevado y el propio relevamiento manda mirar: los textos al
pie de los casilleros, los avisos de que algo se guardó, las ventanas de confirmar, los carteles de
las dos aplicaciones y los de Habilitar clave.

---

## Reclutamiento

**Esta sección esperaba la fusión, y ya no.** El reclutamiento es un módulo común a las dos
modalidades y la base de Asistentes de cada Prestadora es una sola para las dos; lo que faltaba
para poder construirlo son las listas de opciones por Prestadora y los formularios declarados, y **las
dos ya están construidas** —`supabase/migrations/20261001150000_las_listas_de_opciones.sql` con su
pantalla en `panel/src/pages/configuracion/LasListasDeOpciones.jsx`, y
`supabase/migrations/20261001170000_los_formularios_se_declaran.sql`—. Sigue trabada por la pregunta **«¿dónde corre un módulo y contra
qué base?»**, más abajo.

Los tres arreglos, para que estén escritos:

1. **No existe el formulario público de postulación.** Hay una ruta de backend que acepta doce campos y ninguna pantalla que la use.
2. **Las listas de opciones nacen vacías.** Género, nacionalidad, tipo de registro ante AFIP y los cinco subgrupos de experiencia clínica se cargan por Prestadora. **La pantalla donde se cargan ya está construida** —`panel/src/pages/configuracion/LasListasDeOpciones.jsx`—, así que lo que queda es sembrar las listas de cada Prestadora: mientras estén vacías el formulario no tiene nada que ofrecer.
3. **Al incorporar un aspirante se pierden quince datos.** Lo que cargó en la postulación no llega entero a su ficha de Asistente.

**50. Usted** — ¿Dónde vive el formulario público de postulación? No va en `careonys.com`, que le vende software a las Prestadoras: quien busca trabajo de cuidador se postula en la empresa que lo va a contratar. ¿En el sitio de cada Prestadora, con dirección propia?

**51.** La pantalla del formulario, que es lo único que falta: la base y el backend ya guardan y comprueban los campos de las seis secciones de `docs/PRD_03_Reclutamiento.md`, y el backend entrega las listas de opciones en `GET /api/publico/:prestadora/postulacion-asistente/opciones`. Se dibuja desde la declaración, no a mano. Esperaba el paso anterior.

**52. Usted** — ¿Se le bloquea la asignación de guardias a quien no está inscripto en monotributo, o se avisa y decide la Prestadora? La regla del producto dice avisar, no bloquear, así que el PRD y la regla no coinciden. **Lo que se asigna es un turno de guardia**, y asignarlo supone el Servicio armado, más arriba en esta lista.

**53.** Construirlo según lo contestado.

**54. Usted** — Comparar automáticamente la foto del documento con la foto de la cara es tratamiento de dato biométrico, y hacen falta dos decisiones suyas: ¿cuál es el documento legal del que sale la advertencia al Asistente, que hoy no existe y sin la cual no hay advertencia? ¿Y qué proveedor compara las dos caras? Guardar las dos fotos y mostrarlas juntas ya está hecho: hoy las compara una persona.

**55.** Construirlo según lo contestado.

**56. Usted** — El programa de capacitación: qué contenido lleva, cuántas preguntas y qué nota se necesita para aprobar. Hoy «capacitación» es sólo el nombre de una etapa.

**57.** Construirlo.

---

## Las dos aplicaciones

**58. Usted** — Compartir el Certificado de Aptitud: ¿hacia dónde y por qué medio? Hoy se puede ver, con su estado y su fecha. Compartirlo hacia afuera exige decidir a quién se le manda, por qué canal y qué ve quien lo recibe, porque no existe ninguna verificación pública del certificado: sin eso, lo compartido sería una imagen que no prueba nada.

**59. Usted** — La alerta por salida del domicilio, dos decisiones que no puedo tomar yo. Hoy la cuenta se hace con una velocidad media única y distancia en línea recta (`backend/src/utils/llegadaEstimada.js:39-45`), se dispara recién cuando alguien marcó la salida, y mide llegada tarde, no que el Asistente siga en su casa.

- **El tiempo de viaje real sale de un servicio de mapas ajeno.** Cuál se contrata, con qué cuenta y qué se le manda en cada consulta —las coordenadas de la casa de una persona salen del producto— es decisión suya, y la credencial la pone usted.
- **Dónde vive el Asistente ya se guarda**, con su dirección escrita y sus coordenadas, y anotado como dato sensible que no sale hacia la Familia. Las coordenadas quedan vacías mientras nadie ubique la dirección en un mapa, y completarlas depende del servicio de mapas del punto anterior. Esto **no es una decisión suya**: está tomada y construida.
- **Y exige mirar el teléfono antes de que la guardia empiece.** Hoy el GPS se lee cuando la persona aprieta un botón. Leerlo sola, mientras todavía no empezó a trabajar, es seguir a alguien fuera de su horario: hay que decidir si se hace, con qué advertencia y con qué permiso.

**60.** Con eso contestado, construirlo — incluida la lista de medios de transporte, que hoy es texto libre escrito en cada salida y por eso no hay contra qué traducirlo a una velocidad.

**61. Usted** — El botón de contacto de «Asistente Asignado»: ¿a quién llama? El PRD lo dejó abierto —«WhatsApp o chat interno» (`docs/PRD_04_05_App_Servicio.md:224`)— y las dos salidas tienen consecuencias. Darle a la Familia el teléfono del Asistente es entregar el dato personal de quien trabaja, y es exactamente lo que Match cobra por abrir: ahí el contacto va tapado hasta que alguien paga. La otra salida es que el botón lleve a la Prestadora, que es con quien la Familia tiene el trato en prestación directa, usando el contacto que ella misma configura. Hay una tercera: el hilo interno, que hoy existe sólo para Match y con el tapado puesto.

De las especialidades de esta pantalla no queda nada por hacer: `asistentes.especialidades` está retirada por comentario de la migración y no se escribe más. Lo vigente es el tipo de Asistente, que ya se muestra, con sus Tareas de lo que corresponde y lo que no.

**62. Usted** — El PRD promete exportar el reporte a PDF en la aplicación de la Familia, y más adelante dice que la Familia no accede al informe. ¿Cuál de las dos vale?

**63.** Cuatro puntos de las aplicaciones y de lo que sale hacia el teléfono:

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

---

## Configuración que todavía está escrita en el código

**64. Usted** — ¿Cooperativa como tercera modalidad de vínculo?

**65.** Construirla: migración que abra tres CHECK, filas de conceptos y fórmulas de cese.

**66. Usted** — Nivel de complejidad: ¿qué significa cada uno de los tres? ¿Condiciona qué tipo de Asistente se admite? Hoy se carga y se edita, y el cálculo de candidatos no lo mira.

**67.** Que el cálculo de candidatos lo use.

**68. Usted** — Verificar matrícula: ¿alcanza con mirar el archivo, o hay que comprobar contra el registro del colegio profesional? La mitad técnica está construida.

**69.** Construir la verificación según lo contestado.

**70. Usted** — Accesibilidad: el código está hecho, falta la respuesta legal. `docs/legal/argentina.md` no la menciona.

**71. Usted** — El Certificado de Aptitud impreso: ¿qué lleva? Hoy la pantalla genera el código de barras y ahí termina.

**72.** Armarlo. La subida del certificado a un depósito de archivos **ya está resuelta**: el
depósito de los papeles del legajo del Asistente está construido, en
`supabase/migrations/20260929100000_los_papeles_del_legajo_del_asistente_tienen_donde_vivir.sql`.
Hoy sólo se guardan fechas.

---

## Datos personales

**73. Usted** — Protección de datos personales: el texto lo tiene que dar el Desarrollador. `docs/legal/argentina.md` tiene ocho secciones y ninguna es de esto. Sin documento no hay advertencia.

**74.** La advertencia. Qué se hace con los datos de un Servicio cerrado hace años, que hoy no se purgan nunca, no se contesta acá: es el tramo de conservación y borrado, más abajo en esta misma lista.

**75. Usted** — La ubicación de las personas: cuatro preguntas para el profesional legal. En los 21 archivos de `docs/legal/` no aparece ni una vez «ubicación», «GPS» ni la ley 25.326. El registro del consentimiento está construido; los textos sembrados son de relleno. **Mientras no haya respuesta, el seguimiento no se enciende con nadie real.**

**76.** Sembrar los textos reales y encender el seguimiento y el mensaje de demora en el trayecto.

---

## Respaldo, continuidad y secretos

**77. Usted** — El alta del gestor de contraseñas, y completar las cinco filas en blanco de `celtatech/docs/CUENTAS.md`.

**78.** Rotar clave por clave lo que corresponda, decidiéndolo de a una. Si se rota la clave secreta de Supabase, se actualiza en Railway en el mismo acto. Entra acá la clave de servicio de Supabase que estuvo escrita en texto plano en la configuración de permisos de la máquina: los comandos que la llevaban adentro ya se borraron, pero la clave en sí se rota el día de la liberación, no antes.

**Ya no queda ninguna contraseña escrita en el repositorio.** Todas salen del entorno, y las
cuentas de la base local nacen sin clave: se la pone un programa aparte después de cada
reconstrucción. Lo que queda por hacer acá es **rotar las cuentas que nacieron con las claves que
estuvieron a la vista**: las de la Prestadora de demostración, las de la demostración de
continuidad de guardia, las de la prueba de cierre de Servicio y las que quedaron sin borrar de la
prueba del escaneo del Asistente.

Y queda además **una contraseña de prueba en texto plano dentro de la configuración de permisos de
una copia de trabajo**, que no es un archivo del repositorio y por eso el barrido no la alcanzó.

**79. Usted** — Correr `node scripts/probar_restauracion.mjs` desde `backend/`, con Docker encendido y las variables del respaldo diario más las de la base de producción cargadas en el entorno. Baja el último respaldo, lo restaura en una base efímera, compara las tablas, las filas y los archivos del espejo contra lo que hay hoy, y borra todo al terminar. Le toca a usted porque pide las llaves del bucket y de la base, que viven en la caja fuerte. La prueba anterior verificó 30 tablas de un esquema que hoy tiene 105 y no tocó ningún archivo, porque todavía no se respaldaban. **Si contesta `no_probado`, no salió mal: quiere decir que todo coincidió y no había nada cargado que comparar**, y entonces hay que repetirla con datos de prueba.

**80. Usted** — Los dominios se renovaron en julio de 2026 y vencen en julio de 2027, y esa fecha hoy no está en ningún calendario: `celtatech.com` y `careonys.com` en Cloudflare, y `celtatech.com.ar` y `celtatech.net.ar` en NIC Argentina. Poner un recordatorio un mes antes de cada uno y, donde el registrador lo permita, dejar la renovación automática encendida — NIC Argentina no la tiene, así que ésos son los dos que de verdad dependen del recordatorio. Un dominio vencido no se cae despacio: deja de resolver, y con él se van las pantallas, el correo de la empresa y la entrada a las cuentas que se registraron con ese correo.

---

## Marca y dominio por Prestadora

**81.** Que la conversación quede guardada adentro del producto, según lo que se conteste sobre el botón de contacto de «Asistente Asignado», más arriba en esta misma lista. Hasta que el Panel no tenga un hilo de dos puntas, lo que se hablan la Familia y el Asistente en prestación directa se va a WhatsApp y no queda adentro de ningún lado. El chat interno ya está construido entero —hilos, mensajes, tapado del contacto, pantallas en las dos aplicaciones, mensaje al celular y videollamada—, pero **sólo funciona donde la Prestadora pone Asistentes disponibles para que la Familia elija**: exige una Familia y un Asistente que se hayan encontrado ahí. En prestación directa no hay hilo, y hacia la Prestadora tampoco: el único canal con el Panel va en un solo sentido, del Panel al Asistente, y no hay dónde guardar lo que contesta.

---

## Módulos

**82.** Sacar el nombre viejo `aurevia` de adentro del producto. **Se decide y se hace con la
mudanza ya encima**, que es cuando hay que tocar la base de todos modos. Está medido y no se
pierde: nadie usó nunca la aplicación y todos los datos cargados son inventados, así que
reconstruir la base los reescribe sin mudanza. Lo que cuesta igual, se haga cuando se haga, son
cinco nombres de afuera: el nombre del proyecto local, el servicio donde corre el backend con su
dirección, y los dos depósitos de respaldo. El repositorio ya se llama `careonys`.

**83. Usted** — ¿Dónde corre un módulo y contra qué base? Hoy `Modulos\` está vacía. **Facturación y créditos y cobranzas ya están decididas como software aparte del que Careonys se sirve**, así que esto no decide si salen, sino dónde corren el día que existan. También decide si con eso se cierran sin construir los adaptadores de pasarela.

**84.** Sacar la facturación y la cobranza a un módulo, cuando haya dónde correrlo.

---

## Decisiones que no traban nada empezado

**85. Usted** — Subcontratación: no existe ninguna tabla de Empresa subcontratada y el Panel no la ofrece a propósito. La precondición era no abrirla hasta que una Prestadora real lo pida. ¿Sigue valiendo?

**86. Usted** — Un tercero que sólo mira: ¿cómo entra un financiador que sólo consulta? Un cuarto rol, un Coordinador de sólo lectura desde el catálogo de permisos, o no se hace.

**87. Usted** — ¿Careonys va a atender establecimientos donde conviven Pacientes de Familias distintas — una residencia, un geriátrico? Si es más adelante, alcanza con dejarlo dicho.

**88. Usted** — ¿Diez pedidos por minuto y por persona es el número? El contador compartido hace falta el día que el backend se reparta en varios servicios; hoy corre en uno solo.

**89. Usted** — ¿Los idiomas siguen en un archivo o pasan a la base? De esto depende si sumar un
idioma es una publicación o una carga de datos. **Y está contestado a medias sin que nadie lo
anotara**, así que la pregunta es más chica de lo que parece:

- **Las listas de opciones ya viven en la base**, con la traducción adentro de cada opción.
- **Los mensajes que manda el producto también**, en `mensajes_del_sistema`, con su columna de
  traducciones y una fila propia por Prestadora más la del producto.
- **Lo que sigue en un archivo es el texto de las pantallas del Panel** —`panel/src/i18n/translations.js`—, que ningún archivo de `panel/src/` reemplazó todavía por la tabla.

Así que lo único que esto decide es ese último resto. **Y se contesta después de la sección de los
carteles**, más arriba: es justamente ese archivo el que se barre ahí, y no tiene sentido mudar
texto que va a salir.

**90. Usted** — El puntaje interno de calidad del Asistente, que sólo ve el Admin: ¿sigue en pie ahora que existen las estrellas que pone la Familia? Si sigue, faltan dos respuestas: qué lo compone, y la garantía de que ninguna acción automática dependa de él. El lugar donde iría ya está hecho (`datos_reservados_asistente` y su permiso).

**91. Usted** — El alta y la baja de Prestadoras: Match expone una puerta firmada para que CeltaTech dé de alta y de baja clientes; Careonys no tiene nada parecido. ¿Se construye la misma, o se siguen dando de alta a mano?

**92.** **Por esa misma puerta tiene que entrar qué tiene habilitado cada Prestadora, y hoy no
entra nada.** CeltaTech le vende un plan, y ese plan dice qué puede usar. Eso se lo informa al
producto. **Y ahí termina: CeltaTech no tiene injerencia, bajo ninguna circunstancia, en el
negocio de ninguna Prestadora.** Le habilita funciones del software y nada más; qué cobra, a
quién, cuánto y con qué condiciones lo decide ella sola.

**Son tres niveles, uno arriba del otro, y falta el primero:**

- **Lo que CeltaTech le habilita**, según el plan que contrató. **No existe.**
- **Lo que la Prestadora decide usar**, adentro de eso, desde su Configuración. Existe.
- **Lo que la ficha de cada Asistente permite**, adentro de lo que la Prestadora usa. Existe.

Como falta el primero, el de la Prestadora quedó siendo el único, y por eso hoy se habilita Match
sola. Del lado de CeltaTech el mecanismo ya está construido —un catálogo de capacidades que cada
producto declara, asignadas a planes y resueltas por suscripción, guardadas como texto que no
interpreta—. Lo que no existe es el canal por donde eso llegue acá.

**Y no es sólo al dar el alta: después también llega la orden de deshabilitar**, la aplicación
entera o una parte. **Por qué, Careonys no lo sabe ni lo pregunta**: recibe la orden y la ejecuta.
**Es un apagado distinto del de la Prestadora, aunque hoy los dos se dirían igual:**

- **El de la Prestadora** es una decisión de negocio de ella: deja de operar con una modalidad.
  Hoy el sistema no la deja apagar si quedan Asistentes trabajando o Familias con acceso abierto,
  y está bien que no la deje.
- **La orden que llega no se puede bloquear.** Con esa misma comprobación, alcanzaría con tener un
  Asistente trabajando para que la orden nunca se cumpla.

**93. Usted** — Qué hace Careonys de su lado cuando recibe esa orden y adentro quedan Asistentes
trabajando y Familias con acceso abierto. Cortar el acceso y dejarlo todo en su lugar no es lo
mismo que darlo de baja.

**94.** Construirlo, todo de este lado: recibir qué tiene habilitado cada Prestadora y que su
Configuración ofrezca solamente eso; y recibir la orden de deshabilitar, sin la comprobación que
lleva el apagado de ella, haciendo con lo que quede en curso lo que se conteste arriba. **La lista
de capacidades la declara este producto**, que es el que sabe qué significan; del otro lado son
texto opaco. Lo que cada Prestadora tenga hoy en uso se conserva.

**95. Usted** — El acompañamiento online: ¿prestación más, o guardia sin domicilio? Si es guardia, hay que decidir qué reemplaza al check-in por ubicación. **Las dos palabras son ahora dos niveles distintos del glosario**, así que la pregunta elige entre uno y el otro: una Prestación con su precio y sus horarios, o una guardia que se reparte en turnos. Y lo que reemplaza al check-in por ubicación es del turno, no de la guardia.

**96. Usted** — El «Gestor del cuidado»: ¿rol nuevo, variante de Coordinador, o entrada en el catálogo de permisos por Prestadora? La tercera no rompe la regla de los tres roles de Panel; las dos primeras sí.

**Se contesta después del acto de armar el Servicio**, más arriba en esta lista, por dos motivos. El
primero es que **la premisa con la que estaba escrita esta pregunta no es cierta**: decía que hoy el
Coordinador se asigna por guardia, y no se asigna en ninguna parte — la columna del coordinador en la
guardia no la escribe ninguna línea del Panel ni del backend, sólo la siembra `supabase/seed.sql`, y
lo que hay en pantalla es una lista deducida de las zonas en `panel/src/lib/equipoDelPaciente.js`. El
segundo es que ese acto cambia el modelo: **una sola persona coordina todo el Servicio, se la asigna
al acordarlo, y sin ella el Servicio no se habilita.** Con eso construido, la pregunta es si hace
falta alguien más además de esa persona, que es otra pregunta.

**97. Usted** — Cursos para familias: ¿va o no va?

**98. Usted** — La regla de los archivos dice «nunca público» y hay un depósito público construido (`marca-prestadoras`); los otros cinco son privados. ¿La regla admite la excepción, o se cierra el depósito?

**99. Usted** — La categoría de convenio del Asistente se teclea a mano, y de ella depende su
remuneración básica. El convenio tiene sus categorías definidas y no las inventa la Prestadora,
así que tecleadas quedan escritas distinto en cada ficha: no se puede saber cuántos Asistentes hay
en cada una, ni aplicarle un cambio de escala a todos los de una categoría de una sola vez, y un
error de tipeo sale impreso en el documento de cese. El campo viene de la aplicación vieja y nunca
se discutió. **Qué hay que analizar:** si pasa a ser una lista que la Prestadora carga —porque las
categorías de otro país son otras y no pueden venir escritas en el código—, y qué se hace con las
liquidaciones que ya salieron. **El mecanismo para que sea una lista ya está construido**, con las
listas de opciones por Prestadora y su pantalla de carga; lo que falta decidir es si corresponde y
qué pasa con lo ya liquidado.

---

## El sitio web

**100. Usted** — ¿Se autoriza construir `careonys.com` según `docs/PRD_01_Sitio_Web.md`? El PRD ya está entero. Hoy `sitio-web/` es una página que dice «En construcción». **El diseño se hace de cero**: del sitio público de Match no viaja nada visual.

**101.** Construirlo.

---

## El cumplimiento que se agrega encima

**Va al final porque nada de esto obliga a reescribir lo anterior.** Son piezas que se apoyan sobre
lo que dejaron los cimientos y se suman sin tocarlo. Hacerlas antes no ahorra nada y demora el MVP;
hacerlas después cuesta lo mismo.

**Lo que sí es condición:** antes de dar de alta una Prestadora real de un país, ese país tiene que
tener cargado lo suyo. La lista por país, con artículo, está en `docs/CUMPLIMIENTO_NORMATIVO.md`.

**102.** **La revisión del registro de accesos, que es lo que casi nadie hace.** El 45 CFR
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

**103.** **El motor de conservación y borrado.** Las columnas y la tabla de reglas ya existen desde
los cimientos; acá se carga y se construye lo que decide.

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
  Decreto 41/2012). Cualquier anotación posterior reinicia el reloj de toda la ficha.
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

**104.** **Los derechos de la persona.** Exportación de lo propio, en formato que se pueda leer en
otro lado: el Anexo II sección 2 del EHDS lo convierte en deber duro contra el encierro en el
proveedor, y la portabilidad está en casi todas las leyes latinoamericanas.

Plazo de respuesta por jurisdicción: Costa Rica cinco días hábiles, Panamá diez para responder y
cinco para modificar, Argentina cuarenta y ocho horas para la copia de la historia clínica. Sale de
la configuración del país, con aviso a quien tiene que contestar antes de que venza. Y quién hereda
el derecho al fallecer cambia por país: en Costa Rica pasa a sucesores o herederos.

**Comprobación:** un pedido de acceso cargado en una Prestadora de Costa Rica vence a los cinco días
hábiles y avisa antes; el mismo pedido en Panamá vence a los diez.

**105.** **Las brechas, construidas para 24 horas.** Hay cinco relojes y manda el más corto. Europa:
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

**106.** **Quién entra y cómo.**

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

**107.** **Respaldos que se probaron.** El 164.308(a)(7)(ii)(A), (B) y (C) son «Required»: copia
exacta y recuperable, restauración y modo de emergencia. El Decreto 41/2012 chileno lo escribe como
requisito de la ficha clínica, y en Francia la copia de respaldo es una de las actividades
certificables del référentiel HDS.

**Y hay un país que fija frecuencia:** el art. 51 del DS 016-2024-JUS peruano exige copias
**semanales** con verificación de integridad. Es el único plazo numérico del relevamiento, así que
manda.

Se construye la restauración probada **y con constancia**, no la promesa de que se puede. La prueba
en sí es la que ya está más arriba en esta lista; lo que falta acá es que deje constancia, que se
repita sola y que quede atada a la frecuencia peruana.

**Comprobación:** una restauración completa a un entorno aparte, con constancia de fecha y de qué
se verificó.

**108.** **La configuración por país, cargada.** La estructura existe y está vacía de esta materia.
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

**109. Usted** — **Las designaciones que no son programación.** Representante legal en Perú y en
Ecuador, y delegado de protección de datos en Ecuador y en Uruguay. Son designaciones de CeltaTech
y condición para vender en esos países.

**110.** **Los documentos que pide la auditoría.** Son entregables, y sin ellos lo construido no
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

**111.** **Lo que no se hace nunca.**

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

**112. Usted** — Las escalas legales: la validación, y los dos valores que el código usa y no
existen (`piso_minimo_indemnizacion` y `fraccion_computable_antiguedad`). En el mismo viaje va el
texto de la advertencia sobre el abandono de persona: ninguno de los veintiún documentos de `docs/legal/`
lo menciona —lo único parecido es el abandono de *trabajo*, art. 244 LCT, en
`docs/legal/argentina.md:147`, que es otra cosa—, y la regla del producto prohíbe improvisarlo. Sin
documento no hay advertencia; la mecánica se construye igual, porque no depende de ninguna ley.

---

## Cierre

**113. Usted** — El documento de roles generado desde la base: ¿para quién es, interno de CeltaTech o manual para la Prestadora?

**114.** Generarlo.

**115.** Correr las pruebas y publicar.
