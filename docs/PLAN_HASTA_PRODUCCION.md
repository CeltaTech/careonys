# PLAN HASTA PRODUCCIÓN — Careonys

**Una sola lista, del 1 al 80, en orden.** Se hace el 1, después el 2, y así hasta el final.

- Los pasos que empiezan con **Usted** los contesta o los hace el Desarrollador. Los demás los hago yo.
- **Un paso terminado se borra de este archivo.** No se marca como hecho: se saca.
- **No se abren pendientes nuevos.** Un problema que aparece se arregla en el momento; si no cabe en la tarea que se está haciendo, se agrega como paso en el lugar de la lista que le corresponde.
- **Nada de acá se cita por número desde afuera.** El número se corre solo con borrar un paso terminado, así que un documento que diga «paso 103» miente apenas se avanza. Desde otro documento se cita este archivo y el título de la sección.

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

### 1. El motor entra a la base con la llave maestra

Es lo más pesado de todo. Está construido, es de seguridad, y además **cierra la discusión por
escrito**: dice que la alternativa se evaluó y se descartó, y que quien la vuelva a proponer tiene
que refutar la objeción antes de hablar. Si esa decisión no es suya, lo que hay es una puerta
cerrada con llave por alguien que no tenía la llave.

- `CLAUDE.md:325` — **[ya construido]** que pasar el motor al pase de cada persona «se evaluó y se descartó», con fecha y con su nombre, y que quien lo reproponga tiene que refutar la objeción antes.
- `CLAUDE.md:319` — **[ya construido]** que el motor entre a la base con la llave maestra es una decisión y no un olvido.
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

### 4. Los avisos: qué detecta el sistema solo y a quién le avisa

Los cuatro son el mismo mecanismo mirado desde documentos distintos. Qué detecta, si se puede
apagar, y por dónde sale el aviso.

- `docs/DATA_MODEL.md:591` y `docs/PRD_04_05_App_Servicio.md:168` — **[ya construido]** que el sistema detecte las ausencias y avise temprano solo.
- `docs/PRD_04_05_App_Servicio.md:179` — que las alertas se puedan enchufar y sacar.
- `docs/PRD_06_WhatsApp_IA.md:121` — el catálogo de avisos, los reintentos y a quién se escala.
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

- `docs/claude_history.md:324` — **[ya construido]** que una guardia pueda tener más de un Paciente.
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

## El aislamiento que se puede usar hoy

**Va acá, y sólo con dos cosas.** Los demás hallazgos de la misma revisión están repartidos más
abajo, cada uno en su sección, porque hoy los tapa quien los llama. Estos dos no: funcionan.

**5.** El tope de códigos que se mandan al teléfono cuenta entre todas las Prestadoras. Un
número tiene un solo contador para todo el producto. **Eso deja hacer dos cosas.** Alguien de una
Prestadora agota los pedidos de un número y deja a esa misma persona sin segundo factor en la
otra. Y quien controle un número averigua si está en uso en otra Organización, mirando cuándo se
le acaban. **El tope de la clave ya se corrigió así y éste quedó a medio camino:** uno lleva la
Prestadora adentro, el otro no.

**6.** Sumar a alguien al círculo familiar recibe la Prestadora y no comprueba que esa Familia
sea suya. Hoy lo tapa la pantalla que lo llama. Sus dos hermanas —borrar una cuenta y deshacer un
alta— sí comprueban por dentro. **Ésta escribe**, no lee: quien entra por ahí queda viendo los
datos de ese Paciente.

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

**7.** Una cuenta por Prestadora. **Un Asistente trabaja en varias Prestadoras y una Familia
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
pacientes, ni sus avisos, ni sus papeles. Al cambiar se descarta todo lo que estaba cargado.

**Y no hay excepción posible.** Con una sesión abierta en una Prestadora no se entra en otra hasta
cerrar esa. Ninguna situación la habilita. Lo único que se mueve entre Organizaciones es la sesión
de soporte técnico, que ya tiene su propia forma y tampoco alcanza dos a la vez.

**El aislamiento acá tiene que ser más duro que en el resto del producto, y por eso se prueba
aparte.** Hasta hoy una cuenta pertenece a una sola Prestadora, así que una fuga se nota; desde
este paso la misma persona tiene sesión legítima en dos, y cualquier consulta que resuelva la
Prestadora por otra vía que no sea la sesión comprobada devuelve datos de la otra sin que nada
falle a la vista. Entonces: **ninguna consulta resuelve la Prestadora por lo que venga en el
pedido**, ni por la ficha, ni por parecido de correo; **la separación la impone la base**, y los
filtros de las rutas del motor son la segunda red, no la primera. Y la prueba se hace con una
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

**8.** Lo mismo, en las dos aplicaciones de teléfono. Hoy un Asistente y una Familia no tienen
nada de esto: no pueden verificar ni cambiar su número con código, entrar desde un equipo nuevo no
les pide código, y **no pueden cerrar la sesión de todos los equipos**, que es justo lo que
necesita alguien a quien le robaron el teléfono. La única puerta es el Panel, y ahí no entran.
**Acá falta motor y no sólo pantalla**, al revés que en los pasos de arriba: las piezas de fondo
—mandar el código, comprobarlo, reconocer el equipo, cerrar todas las sesiones— están escritas y
no conocen ningún rol, pero las únicas puertas que las usan exigen ser del Panel y rechazan a un
Asistente y a una Familia. Hay que abrir las puertas equivalentes para ellos dos, y recién
después las pantallas.

**9.** Pedir el enlace de la clave nueva desde las dos aplicaciones de teléfono. Hoy no se puede:
quien se olvidó la clave llama a su Prestadora y ella se lo manda desde el Panel. El motor ya
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

**10.** Dos puntos de la entrada que buscan por la persona y no por la Prestadora, ahora que la
misma persona puede tener ficha en dos. **La foto**, al habilitarle la clave desde el Panel, puede
salir de la ficha de la otra Prestadora, o desaparecer sin explicación si tiene dos. **Y la lista
de llaves del aparato** mira todas las Prestadoras: es la misma persona viendo lo suyo, pero
delata que tiene cuenta en otra. Los otros tres puntos del mismo archivo sí la ponen.

---

## El dinero

**11.** Escribir la conexión de ida con el software de facturación de la primera Prestadora, cuando
haya una y ella lo elija. **No se escribe antes**: se miraron los cinco que más se usan en
Argentina y se conectan todos parecido pero con datos distintos, así que escribir uno a ciegas es
acertar con suerte. Lo investigado está en `docs/FACTURADORES_Y_COMO_SE_CONECTAN.md`. **Cada
software es una pieza aparte** y agregar la segunda no puede obligar a tocar la primera. Las otras
dos maneras ya están hechas y alcanzan para salir a producción: se anota factura por factura a
mano, o se baja un archivo con todo lo que falta facturar y se sube el que el software devuelve.

**12.** Terminar de acomodar la pantalla de la Familia al hueco que deja el saldo. El motor ya no
lo calcula ni lo entrega cuando la cobranza la lleva otro software —ni en el Panel ni en la
ventanilla de la Familia—, y las dos pantallas de facturas de esa aplicación dejan de dibujar lo
que no viene: la lista se queda sin el renglón del saldo y del estado, y el desglose sin tres de
sus siete renglones.

**13.** La pantalla de los datos bancarios del Asistente. El dato lo informa él, así que él lo
carga y él lo corrige: la base ya lo deja escribir su propia fila y ninguna otra, y el motor ya
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

**14. Usted** — La tercera tanda: ¿los archivos y funciones que llevan el nombre viejo se cambian
o se dejan?

**15.** Sacar el nombre viejo de lo visible y de lo escrito, y aplicar lo contestado sobre el
código. Lo guardado no se toca.

**16. Usted** — Prioridad de acceso al plantel ante una baja: el PRD la define en una línea (`docs/PRD_07_Modalidad_Marketplace.md:225`) y de ahí salen dos productos distintos. ¿Es que el contacto del reemplazo no vuelva a costar durante una ventana —ni descuenta saldo ni pide un acceso nuevo—, o es que a esa Familia se le avise primero cuando alguien del plantel vuelve a estar disponible? ¿O las dos? Y antes que eso: hoy la Familia no contrata por Match, así que no hay baja que detectar. ¿Qué cuenta como baja — que el Asistente se saque de los disponibles, que la Familia cierre el Servicio, o hay que construir antes el vínculo?

**17.** Construirla según lo contestado.

**18.** Tres puntos de Match donde la Prestadora no se aplica:

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

**19. Usted** — De la Solicitud: ¿cómo se le presenta la Asistente nueva a la Familia — aviso sin respuesta, aceptación explícita, o fuera del sistema?

**20. Usted** — Las dos observaciones de apariencia que quedan, porque las dos son decisiones de diseño: ¿con qué pantalla abre la aplicación de Familia cuando hay más de un Paciente — hoy abre en la lista, y con uno solo ya se saltea al detalle? ¿Y cuál es la identidad visual de las dos aplicaciones, que nunca pasaron por su etapa de diseño?

El Desarrollador está preparando una maqueta orientativa de cómo tienen que verse y cómo se recorren. **La maqueta mejora lo que ya está construido: no es condición para construirlo.** Las pantallas que faltan se hacen ahora, con la apariencia que el producto ya tiene, y cuando la maqueta llegue se acomoda lo que haya que acomodar. Ningún paso de esta lista espera por ella.

**21. Usted** — Rotación y retención de Asistentes: ¿cuál es la fórmula y cuál el umbral?

**22.** Ponerlo en el tablero. Se calcula desde `ceses` y `asistentes`, sin tabla nueva.

**23.** El aislamiento del Panel, que hoy descansa entero en la base. Cuatro cosas:

- **Unas cuarenta consultas no llevan ningún filtro propio.** Si una política se afloja, o entra
  una tabla nueva sin la suya, esas pantallas muestran listas y números mezclados y nada en el
  código lo frena. Lo más visible serían los números del tablero y el mapa del plantel.
- **Cinco pantallas guardan con la Prestadora que traía la fila que estaba en pantalla**, no con
  la de la sesión. Hoy coincide. Es un dato de aislamiento viajando por un camino que la sesión no
  controla.
- **Al lado de cada cuenta se cuenta en cuántos lugares trabaja, y suma los de otras
  Prestadoras.** Deja deducir que esa persona trabaja en otra.
- **El contador de correos enviados suma toda la plataforma.** Lo ve sólo el rol técnico, y no
  queda auditado. Hay que decidir si se acota, o si queda escrito que es una medida de plataforma
  a propósito.

**24.** La marca del equipo del Panel usa un solo casillero del navegador para todas las
Prestadoras: la última pisa a la anterior. El motor la valida contra la Prestadora, así que no
sale ningún dato; es un dato de una Organización viajando adentro del pedido de otra.

---

## Reclutamiento

**Esta sección esperaba la fusión, y ya no.** El reclutamiento es un módulo común a las dos
modalidades y la base de Asistentes de cada Prestadora es una sola para las dos; lo que faltaba
para poder construirlo son las listas de opciones por Prestadora y los formularios declarados, que
están arriba en esta misma lista. Sigue trabada por la pregunta **«¿dónde corre un módulo y contra
qué base?»**, más abajo.

Los tres arreglos, para que estén escritos:

1. **No existe el formulario público de postulación.** Hay una ruta de motor que acepta doce campos y ninguna pantalla que la use.
2. **Las listas de opciones nacen vacías.** Género, nacionalidad, tipo de registro ante AFIP y los cinco subgrupos de experiencia clínica se cargan por Prestadora, y no hay pantalla donde cargarlos: sin eso el formulario no tiene nada que ofrecer. **Lo resuelve el paso de las listas de opciones por Prestadora.**
3. **Al incorporar un aspirante se pierden quince datos.** Lo que cargó en la postulación no llega entero a su ficha de Asistente.

**25. Usted** — ¿Dónde vive el formulario público de postulación? No va en `careonys.com`, que le vende software a las Prestadoras: quien busca trabajo de cuidador se postula en la empresa que lo va a contratar. ¿En el sitio de cada Prestadora, con dirección propia?

**26.** La pantalla del formulario, que es lo único que falta: la base y el motor ya guardan y comprueban los campos de las seis secciones de `docs/PRD_03_Reclutamiento.md`, y el motor entrega las listas de opciones en `GET /api/publico/:prestadora/postulacion-asistente/opciones`. Se dibuja desde la declaración, no a mano. Esperaba el paso anterior.

**27. Usted** — ¿Se le bloquea la asignación de guardias a quien no está inscripto en monotributo, o se avisa y decide la Prestadora? La regla del producto dice avisar, no bloquear, así que el PRD y la regla no coinciden.

**28.** Construirlo según lo contestado.

**29. Usted** — Comparar automáticamente la foto del documento con la foto de la cara es tratamiento de dato biométrico, y hacen falta dos decisiones suyas: ¿cuál es el documento legal del que sale el aviso al Asistente, que hoy no existe y sin el cual no hay aviso? ¿Y qué proveedor compara las dos caras? Guardar las dos fotos y mostrarlas juntas ya está hecho: hoy las compara una persona.

**30.** Construirlo según lo contestado.

**31. Usted** — El programa de capacitación: qué contenido lleva, cuántas preguntas y qué nota se necesita para aprobar. Hoy «capacitación» es sólo el nombre de una etapa.

**32.** Construirlo.

---

## Las dos aplicaciones

**33. Usted** — Compartir el Certificado de Aptitud: ¿hacia dónde y por qué medio? Hoy se puede ver, con su estado y su fecha. Compartirlo hacia afuera exige decidir a quién se le manda, por qué canal y qué ve quien lo recibe, porque no existe ninguna verificación pública del certificado: sin eso, lo compartido sería una imagen que no prueba nada.

**34. Usted** — La alerta por salida del domicilio, dos decisiones que no puedo tomar yo. Hoy la cuenta se hace con una velocidad media única y distancia en línea recta (`backend/src/utils/llegadaEstimada.js:39-45`), se dispara recién cuando alguien marcó la salida, y mide llegada tarde, no que el Asistente siga en su casa.

- **El tiempo de viaje real sale de un servicio de mapas ajeno.** Cuál se contrata, con qué cuenta y qué se le manda en cada consulta —las coordenadas de la casa de una persona salen del producto— es decisión suya, y la credencial la pone usted.
- **Dónde vive el Asistente ya se guarda**, con su dirección escrita y sus coordenadas, y anotado como dato sensible que no sale hacia la Familia. Las coordenadas quedan vacías mientras nadie ubique la dirección en un mapa, y completarlas depende del servicio de mapas del punto anterior. Esto **no es una decisión suya**: está tomada y construida.
- **Y exige mirar el teléfono antes de que la guardia empiece.** Hoy el GPS se lee cuando la persona aprieta un botón. Leerlo sola, mientras todavía no empezó a trabajar, es seguir a alguien fuera de su horario: hay que decidir si se hace, con qué aviso y con qué permiso.

**35.** Con eso contestado, construirlo — incluida la lista de medios de transporte, que hoy es texto libre escrito en cada salida y por eso no hay contra qué traducirlo a una velocidad.

**36. Usted** — El botón de contacto de «Asistente Asignado»: ¿a quién llama? El PRD lo dejó abierto —«WhatsApp o chat interno» (`docs/PRD_04_05_App_Servicio.md:224`)— y las dos salidas tienen consecuencias. Darle a la Familia el teléfono del Asistente es entregar el dato personal de quien trabaja, y es exactamente lo que Match cobra por abrir: ahí el contacto va tapado hasta que alguien paga. La otra salida es que el botón lleve a la Prestadora, que es con quien la Familia tiene el trato en prestación directa, usando el contacto que ella misma configura. Hay una tercera: el hilo interno, que hoy existe sólo para Match y con el tapado puesto.

De las especialidades de esta pantalla no queda nada por hacer: `asistentes.especialidades` está retirada por comentario de la migración y no se escribe más. Lo vigente es el tipo de Asistente, que ya se muestra, con sus Tareas de lo que corresponde y lo que no.

**37. Usted** — El PRD promete exportar el reporte a PDF en la aplicación de la Familia, y más adelante dice que la Familia no accede al informe. ¿Cuál de las dos vale?

**38.** Cuatro puntos de las aplicaciones y de lo que sale hacia el teléfono:

- **Los avisos al celular buscan a quién mandarlos sin la Prestadora.** Una suscripción puede
  cambiar de dueño y de Prestadora —el propio código lo anota cuando pasa—, y entonces un aviso
  armado con datos de una sale al aparato de otra.
- **El esquema de medicación de un Paciente se pide sin la Prestadora**, y la función ni siquiera
  la admite. Es dato de salud, lo más sensible que hay acá.
- **Qué signos vitales se autorizó monitorear**: la función recibe la Prestadora y no la usa.
- **La marca de la Prestadora queda guardada en el aparato y no se borra al salir.** Un teléfono
  compartido sigue mostrando el nombre de la anterior en los avisos hasta que llegue el primer
  perfil de la nueva.

**El molde es siempre el mismo, y es el que hay que cortar:** el aislamiento vive en quien llama,
no adentro de la función. Mientras sea así, cualquier pantalla nueva que llame a una de ésas sin
comprobar antes abre el agujero sin que nadie se entere.

---

## Configuración que todavía está escrita en el código

**39. Usted** — ¿Cooperativa como tercera modalidad de vínculo?

**40.** Construirla: migración que abra tres CHECK, filas de conceptos y fórmulas de cese.

**41. Usted** — Nivel de complejidad: ¿qué significa cada uno de los tres? ¿Condiciona qué tipo de Asistente se admite? Hoy se carga y se edita, y el cálculo de candidatos no lo mira.

**42.** Que el cálculo de candidatos lo use.

**43. Usted** — Verificar matrícula: ¿alcanza con mirar el archivo, o hay que comprobar contra el registro del colegio profesional? La mitad técnica está construida.

**44.** Construir la verificación según lo contestado.

**45. Usted** — Accesibilidad: el código está hecho, falta la respuesta legal. `docs/legal/argentina.md` no la menciona.

**46. Usted** — El Certificado de Aptitud impreso: ¿qué lleva? Hoy la pantalla genera el código de barras y ahí termina.

**47.** Armarlo. La subida del certificado a un depósito de archivos ya quedó resuelta con el
depósito de los papeles del legajo, más arriba en esta lista; hoy sólo se guardan fechas.

---

## Datos personales

**48. Usted** — Protección de datos personales: el texto lo tiene que dar el Desarrollador. `docs/legal/argentina.md` tiene ocho secciones y ninguna es de esto. Sin documento no hay aviso.

**49.** El aviso, y qué se hace con los datos de un Servicio cerrado hace años, que hoy no se purgan nunca.

**50. Usted** — La ubicación de las personas: cuatro preguntas para el profesional legal. En los 21 archivos de `docs/legal/` no aparece ni una vez «ubicación», «GPS» ni la ley 25.326. El registro del consentimiento está construido; los textos sembrados son de relleno. **Mientras no haya respuesta, el seguimiento no se enciende con nadie real.**

**51.** Sembrar los textos reales y encender el seguimiento y el aviso de demora en el trayecto.

---

## Respaldo, continuidad y secretos

**52. Usted** — El alta del gestor de contraseñas, y completar las cinco filas en blanco de `celtatech/docs/CUENTAS.md`.

**53.** Rotar clave por clave lo que corresponda, decidiéndolo de a una. Si se rota la clave secreta de Supabase, se actualiza en Railway en el mismo acto. Entra acá la clave de servicio de Supabase que estuvo escrita en texto plano en la configuración de permisos de la máquina: los comandos que la llevaban adentro ya se borraron, pero la clave en sí se rota el día de la liberación, no antes.

**Ya no queda ninguna contraseña escrita en el repositorio.** Todas salen del entorno, y las
cuentas de la base local nacen sin clave: se la pone un programa aparte después de cada
reconstrucción. Lo que queda por hacer acá es **rotar las cuentas que nacieron con las claves que
estuvieron a la vista**: las de la Prestadora de demostración, las de la demostración de
continuidad de guardia, las de la prueba de cierre de Servicio y las que quedaron sin borrar de la
prueba del escaneo del Asistente.

Y queda además **una contraseña de prueba en texto plano dentro de la configuración de permisos de
una copia de trabajo**, que no es un archivo del repositorio y por eso el barrido no la alcanzó.

**54. Usted** — Correr `node scripts/probar_restauracion.mjs` desde `backend/`, con Docker encendido y las variables del respaldo diario más las de la base de producción cargadas en el entorno. Baja el último respaldo, lo restaura en una base efímera, compara las tablas, las filas y los archivos del espejo contra lo que hay hoy, y borra todo al terminar. Le toca a usted porque pide las llaves del bucket y de la base, que viven en la caja fuerte. La prueba anterior verificó 30 tablas de un esquema que hoy tiene 105 y no tocó ningún archivo, porque todavía no se respaldaban. **Si contesta `no_probado`, no salió mal: quiere decir que todo coincidió y no había nada cargado que comparar**, y entonces hay que repetirla con datos de prueba.

**55. Usted** — Los dominios se renovaron en julio de 2026 y vencen en julio de 2027, y esa fecha hoy no está en ningún calendario: `celtatech.com` y `careonys.com` en Cloudflare, y `celtatech.com.ar` y `celtatech.net.ar` en NIC Argentina. Poner un recordatorio un mes antes de cada uno y, donde el registrador lo permita, dejar la renovación automática encendida — NIC Argentina no la tiene, así que ésos son los dos que de verdad dependen del recordatorio. Un dominio vencido no se cae despacio: deja de resolver, y con él se van las pantallas, el correo de la empresa y la entrada a las cuentas que se registraron con ese correo.

---

## Marca y dominio por Prestadora

**56.** Que la conversación quede guardada adentro del producto, según lo que se conteste sobre el botón de contacto de «Asistente Asignado», más arriba en esta misma lista. Hasta que el Panel no tenga un hilo de dos puntas, lo que se hablan la Familia y el Asistente en prestación directa se va a WhatsApp y no queda adentro de ningún lado. El chat interno ya está construido entero —hilos, mensajes, tapado del contacto, pantallas en las dos aplicaciones, aviso al celular y videollamada—, pero **sólo funciona donde la Prestadora pone Asistentes disponibles para que la Familia elija**: exige una Familia y un Asistente que se hayan encontrado ahí. En prestación directa no hay hilo, y hacia la Prestadora tampoco: el único canal con el Panel va en un solo sentido, del Panel al Asistente, y no hay dónde guardar lo que contesta.

---

## Módulos

**57.** Sacar el nombre viejo `aurevia` de adentro del producto. **Se decide y se hace con la
mudanza ya encima**, que es cuando hay que tocar la base de todos modos. Está medido y no se
pierde: nadie usó nunca la aplicación y todos los datos cargados son inventados, así que
reconstruir la base los reescribe sin mudanza. Lo que cuesta igual, se haga cuando se haga, son
cinco nombres de afuera: el nombre del proyecto local, el servicio donde corre el motor con su
dirección, y los dos depósitos de respaldo. El repositorio ya se llama `careonys`.

**58. Usted** — ¿Dónde corre un módulo y contra qué base? Hoy `Modulos\` está vacía. **Facturación y créditos y cobranzas ya están decididas como software aparte del que Careonys se sirve**, así que esto no decide si salen, sino dónde corren el día que existan. También decide si con eso se cierran sin construir los adaptadores de pasarela.

**59.** Sacar la facturación y la cobranza a un módulo, cuando haya dónde correrlo.

---

## Decisiones que no traban nada empezado

**60. Usted** — Subcontratación: no existe ninguna tabla de Empresa subcontratada y el Panel no la ofrece a propósito. La precondición era no abrirla hasta que una Prestadora real lo pida. ¿Sigue valiendo?

**61. Usted** — Un tercero que sólo mira: ¿cómo entra un financiador que sólo consulta? Un cuarto rol, un Coordinador de sólo lectura desde el catálogo de permisos, o no se hace.

**62. Usted** — ¿Careonys va a atender establecimientos donde conviven Pacientes de Familias distintas — una residencia, un geriátrico? Si es más adelante, alcanza con dejarlo dicho.

**63. Usted** — ¿Diez pedidos por minuto y por persona es el número? El contador compartido hace falta el día que el motor se reparta en varios servicios; hoy corre en uno solo.

**64. Usted** — ¿Los idiomas siguen en un archivo o pasan a la base? De esto depende si sumar un idioma es una publicación o una carga de datos. **Para las listas de opciones ya está contestado** por el paso de las listas por Prestadora, donde la traducción viaja adentro de cada opción; esto decide qué pasa con el resto del texto visible.

**65. Usted** — El puntaje interno de calidad del Asistente, que sólo ve el Admin: ¿sigue en pie ahora que existen las estrellas que pone la Familia? Si sigue, faltan dos respuestas: qué lo compone, y la garantía de que ninguna acción automática dependa de él. El lugar donde iría ya está hecho (`datos_reservados_asistente` y su permiso).

**66. Usted** — El alta y la baja de Prestadoras: Match expone una puerta firmada para que CeltaTech dé de alta y de baja clientes; Careonys no tiene nada parecido. ¿Se construye la misma, o se siguen dando de alta a mano?

**67.** **Por esa misma puerta tiene que entrar qué tiene habilitado cada Prestadora, y hoy no
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

**68. Usted** — Qué hace Careonys de su lado cuando recibe esa orden y adentro quedan Asistentes
trabajando y Familias con acceso abierto. Cortar el acceso y dejarlo todo en su lugar no es lo
mismo que darlo de baja.

**69.** Construirlo, todo de este lado: recibir qué tiene habilitado cada Prestadora y que su
Configuración ofrezca solamente eso; y recibir la orden de deshabilitar, sin la comprobación que
lleva el apagado de ella, haciendo con lo que quede en curso lo que se conteste arriba. **La lista
de capacidades la declara este producto**, que es el que sabe qué significan; del otro lado son
texto opaco. Lo que cada Prestadora tenga hoy en uso se conserva.

**70. Usted** — El acompañamiento online: ¿prestación más, o guardia sin domicilio? Si es guardia, hay que decidir qué reemplaza al check-in por ubicación.

**71. Usted** — El «Gestor del cuidado»: ¿rol nuevo, variante de Coordinador, o entrada en el catálogo de permisos por Prestadora? La tercera no rompe la regla de los tres roles de Panel; las dos primeras sí. Hoy el Coordinador se asigna por guardia, no por Familia.

**72. Usted** — Cursos para familias: ¿va o no va?

**73. Usted** — La regla de los archivos dice «nunca público» y hay un depósito público construido (`marca-prestadoras`); los otros cinco son privados. ¿La regla admite la excepción, o se cierra el depósito?

**74. Usted** — La categoría de convenio del Asistente se teclea a mano, y de ella depende su
remuneración básica. El convenio tiene sus categorías definidas y no las inventa la Prestadora,
así que tecleadas quedan escritas distinto en cada ficha: no se puede saber cuántos Asistentes hay
en cada una, ni aplicarle un cambio de escala a todos los de una categoría de una sola vez, y un
error de tipeo sale impreso en el documento de cese. El campo viene de la aplicación vieja y nunca
se discutió. **Qué hay que analizar:** si pasa a ser una lista que la Prestadora carga —porque las
categorías de otro país son otras y no pueden venir escritas en el código—, y qué se hace con las
liquidaciones que ya salieron. **El mecanismo para que sea una lista ya está**, con el paso de las
listas de opciones por Prestadora; lo que falta decidir es si corresponde y qué pasa con lo ya
liquidado.

---

## El sitio web

**75. Usted** — ¿Se autoriza construir `careonys.com` según `docs/PRD_01_Sitio_Web.md`? El PRD ya está entero. Hoy `sitio-web/` es una página que dice «En construcción». **El diseño se hace de cero**: del sitio público de Match no viaja nada visual.

**76.** Construirlo.

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

Las que ya están identificadas, cada una con su paso propio más adelante en esta lista: el aviso
para el tratamiento de dato biométrico, la accesibilidad, la protección de datos personales, y las
cuatro preguntas sobre la ubicación de las personas. Los pasos que dependen de ellas dicen qué se
construye igual mientras tanto.

**77. Usted** — Las escalas legales: la validación, y los dos valores que el código usa y no
existen (`piso_minimo_indemnizacion` y `fraccion_computable_antiguedad`). En el mismo viaje va el
texto del aviso sobre el abandono de persona: ninguno de los veintiún documentos de `docs/legal/`
lo menciona —lo único parecido es el abandono de *trabajo*, art. 244 LCT, en
`docs/legal/argentina.md:147`, que es otra cosa—, y la regla del producto prohíbe improvisarlo. Sin
documento no hay aviso; la mecánica se construye igual, porque no depende de ninguna ley.

---

## Cierre

**78. Usted** — El documento de roles generado desde la base: ¿para quién es, interno de CeltaTech o manual para la Prestadora?

**79.** Generarlo.

**80.** Correr las pruebas y publicar.
