# PLAN HASTA PRODUCCIÓN — Careonys

**Una sola lista, en orden.** Se hace el 1, después el 2, y así hasta el final. **Acá no se escribe
cuántos pasos son**, porque el total se corre solo con cada paso que se borra.

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

### 1. El backend entra a la base con la llave maestra

Es lo más pesado de todo. Está construido, es de seguridad, y además **cierra la discusión por
escrito**: dice que la alternativa se evaluó y se descartó, y que quien la vuelva a proponer tiene
que refutar la objeción antes de hablar. Si esa decisión no es suya, lo que hay es una puerta
cerrada con llave por alguien que no tenía la llave.

- `CLAUDE.md:325` — **[ya construido]** que pasar el backend al pase de cada persona «se evaluó y se descartó», con fecha y con su nombre, y que quien lo reproponga tiene que refutar la objeción antes.
- `CLAUDE.md:319` — **[ya construido]** que el backend entre a la base con la llave maestra es una decisión y no un olvido.
- `CLAUDE.md:310` — **[ya construido]** que no se convierta en dueño lo que dispara un cambio en la base.

### 2. Cómo entra cada persona, y quién tiene más poder que nadie

**Este grupo traba el primer paso que se construye.** La cuenta por Prestadora y toda la sección de
la clave, más abajo en esta misma lista, se apoyan en esto. Si acá cambia algo, cambian las dos.

- `docs/PLAN_HASTA_PRODUCCION.md`, «La entrada y la recuperación de la clave» — el bloque entero titulado «Lo decidido, y no se vuelve a discutir»: las tres vías, cuándo se pide el código, qué es un equipo nuevo, la huella y la cara afuera, y la aplicación de códigos sólo para el rol técnico.
- `docs/PRD_04_05_App_Servicio.md:34` y `:204` — **[ya construido]** que el Asistente y el Cliente entren con clave escrita y no con un enlace al correo.
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

- `docs/PRD_07_Modalidad_Match.md:3` — el planteo entero de la modalidad Match. **La parte de cómo se cobra el contacto no se contesta acá: va con el grupo del cobro**, más arriba, junto con la facturación de prestación directa.
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

**5.** Una cuenta por Prestadora. **Un Asistente trabaja en varias Prestadoras y un Cliente
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
cerrar esa. Ninguna situación la habilita. Lo único que se mueve entre Organizaciones es la sesión
de soporte técnico, que ya tiene su propia forma y tampoco alcanza dos a la vez.

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
responsabilidades a quien la releva o al Cliente. **Lo pactado se carga al nivel de la
Prestación**: un renglón puede ir de 00:00 a 24:00 y ningún turno puede. Repartir la guardia en
turnos es trabajo de quien coordina.

**6. Usted** — Aprobar ese plan, que todavía no está aprobado. Hasta que lo esté no se escribe
código de producción de ninguno de sus ocho pasos.

**7. Usted** — Las tres respuestas que ese plan espera, cada una con su situación delante en el
documento: qué dice el aviso cuando queda un horario pactado sin nadie que lo cubra; qué dice el
tercer estado de la coordinación, el de la vacante que cubre la administración mientras no haya
nadie asignado; y si «suspender» es distinto de «pausar» —una sola acción con fecha de vuelta
opcional, o dos, una por tiempo conocido y otra indefinida—.

**8. Usted** — Y dos que aparecieron al escribir la escala de cuatro niveles, las dos sobre lo
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

**9.** Construir los ocho pasos de ese plan, en el orden que tiene escrito.

**10.** Sacar de los tres idiomas la explicación de la coordinación que hoy acompaña al equipo del
Paciente, que dice que mientras nadie esté fijado son todos los que trabajan en la zona. Describe el
modelo que este plan reemplaza. Va junto con el paso del coordinador asignado, no antes.

**11.** Agregar el tipo «Servicio» a Ajustes › Importación, que hoy no está entre los tipos que se
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
  Para todos — administración, coordinación, Asistentes y Clientes.
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

**12.** Lo mismo, en las dos aplicaciones de teléfono. Hoy un Asistente y un Cliente no tienen
nada de esto: no pueden verificar ni cambiar su número con código, entrar desde un equipo nuevo no
les pide código, y **no pueden cerrar la sesión de todos los equipos**, que es justo lo que
necesita alguien a quien le robaron el teléfono. La única puerta es el Panel, y ahí no entran.
**Acá falta backend y no sólo pantalla**, al revés que en los pasos de arriba: las piezas de fondo
—mandar el código, comprobarlo, reconocer el equipo, cerrar todas las sesiones— están escritas y
no conocen ningún rol, pero las únicas puertas que las usan exigen ser del Panel y rechazan a un
Asistente y a un Cliente. Hay que abrir las puertas equivalentes para ellos dos, y recién
después las pantallas.

**13.** Pedir el enlace de la clave nueva desde las dos aplicaciones de teléfono. Hoy no se puede:
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

**14.** Dos puntos de la entrada que buscan por la persona y no por la Prestadora, ahora que la
misma persona puede tener ficha en dos. **La foto**, al habilitarle la clave desde el Panel, puede
salir de la ficha de la otra Prestadora, o desaparecer sin explicación si tiene dos. **Y la lista
de llaves del aparato** mira todas las Prestadoras: es la misma persona viendo lo suyo, pero
delata que tiene cuenta en otra. Los otros tres puntos del mismo archivo sí la ponen.

---

## El dinero

**15.** Escribir la conexión de ida con el software de facturación de la primera Prestadora, cuando
haya una y ella lo elija. **No se escribe antes**: se miraron los cinco que más se usan en
Argentina y se conectan todos parecido pero con datos distintos, así que escribir uno a ciegas es
acertar con suerte. Lo investigado está en `docs/FACTURADORES_Y_COMO_SE_CONECTAN.md`. **Cada
software es una pieza aparte** y agregar la segunda no puede obligar a tocar la primera. Las otras
dos maneras ya están hechas y alcanzan para salir a producción: se anota factura por factura a
mano, o se baja un archivo con todo lo que falta facturar y se sube el que el software devuelve.

**16.** Terminar de acomodar la pantalla del Cliente al hueco que deja el saldo. El backend ya no
lo calcula ni lo entrega cuando la cobranza la lleva otro software —ni en el Panel ni en la
ventanilla del Cliente—, y las dos pantallas de facturas de esa aplicación dejan de dibujar lo
que no viene: la lista se queda sin el renglón del saldo y del estado, y el desglose sin tres de
sus siete renglones.

**17.** La pantalla de los datos bancarios del Asistente. El dato lo informa él, así que él lo
carga y él lo corrige: la base ya lo deja escribir su propia fila y ninguna otra, y el backend ya
tiene por dónde —cargar, corregir y sacar la cuenta—, con lo que entra validado y con el cambio
anotado. Falta la pantalla donde lo hace, en la aplicación del Asistente.

---

## La modalidad Match de cara al Cliente

Existe el andamiaje —base, disparadores, cobros, consentimiento—, el Cliente ya puede buscar un Asistente, ver su perfil público, escribirle por adentro de la aplicación y, activando el cobro, ver cómo llegar a él por afuera. **Todavía no puede contratarlo.**

**El cobro del contacto no se decide en esta sección.** Cobrarle un contacto a un Cliente y
facturarle el servicio a un Cliente son dos formas de cobro de la misma Prestadora, y se analizan
juntas, arriba de todo, en el grupo del cobro. Acá queda lo que es propio de la modalidad.

**Y la modalidad se llama Match, no Match.** El nombre viejo sigue escrito en unos ciento
cuarenta archivos de este producto. Se saca en tres tandas, y no son la misma cosa:

- **Lo visible y lo escrito** —pantallas, traducciones y documentos, incluido el nombre del
  documento de la modalidad—. Eso se cambia entero, porque es marca.
- **Lo guardado** —tablas, columnas, restricciones, reglas de la base—. Unas veinte cosas llevan el
  nombre adentro. **Eso no se renombra**, porque lo que se guarda se nombra por lo que hace y
  renombrarlo convierte un cambio de marca en una mudanza de datos. Queda como está.
- **Los nombres de archivo y de función del código.** No son marca ni son dato guardado, así que
  acá sí hay una decisión: se dejan o se cambian con la tanda visible.

**18. Usted** — La tercera tanda: ¿los archivos y funciones que llevan el nombre viejo se cambian
o se dejan?

**19.** Sacar el nombre viejo de lo visible y de lo escrito, y aplicar lo contestado sobre el
código. Lo guardado no se toca. **Va en una sola pasada con el barrido de tuteo y voseo** de la
sección de los carteles, más abajo: los dos reescriben las traducciones del Panel en los tres
idiomas, y hacerlo dos veces es tocar el mismo archivo dos veces.

**20. Usted** — Prioridad de acceso al plantel ante una baja: el PRD la define en una línea (`docs/PRD_07_Modalidad_Match.md:225`) y de ahí salen dos productos distintos. ¿Es que el contacto del reemplazo no vuelva a costar durante una ventana —ni descuenta saldo ni pide un acceso nuevo—, o es que a esa Cliente se le avise primero cuando alguien del plantel vuelve a estar disponible? ¿O las dos? Y antes que eso: hoy el Cliente no contrata por Match, así que no hay baja que detectar. ¿Qué cuenta como baja — que el Asistente se saque de los disponibles, que el Cliente cierre el Servicio, o hay que construir antes el vínculo?

**21.** Construirla según lo contestado.

**22.** Tres puntos de Match donde la Prestadora no se aplica:

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

**23. Usted** — De la Solicitud: ¿cómo se le presenta la Asistente nueva al Cliente — mensaje sin respuesta, aceptación explícita, o fuera del sistema? **Cuelga del acto de armar el Servicio**, más arriba en esta lista: sin Servicio armado no hay a qué Cliente presentarle a nadie.

**24. Usted** — Las dos observaciones de apariencia que quedan, porque las dos son decisiones de diseño: ¿con qué pantalla abre la aplicación de Cliente cuando hay más de un Paciente — hoy abre en la lista, y con uno solo ya se saltea al detalle? ¿Y cuál es la identidad visual de las dos aplicaciones, que nunca pasaron por su etapa de diseño?

El Desarrollador está preparando una maqueta orientativa de cómo tienen que verse y cómo se recorren. **La maqueta mejora lo que ya está construido: no es condición para construirlo.** Las pantallas que faltan se hacen ahora, con la apariencia que el producto ya tiene, y cuando la maqueta llegue se acomoda lo que haya que acomodar. Ningún paso de esta lista espera por ella.

**25. Usted** — Rotación y retención de Asistentes: ¿cuál es la fórmula y cuál el umbral?

**26.** Ponerlo en el tablero. Se calcula desde `ceses` y `asistentes`, sin tabla nueva.

**27.** El aislamiento del Panel, que hoy descansa entero en la base. Cuatro cosas:

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

**28.** La marca del equipo del Panel usa un solo casillero del navegador para todas las
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

**29. Usted** — Los siete carteles que esperan su texto. Tres de ellos ya tienen el texto o el
molde escrito en el `.docx` y lo único que falta es confirmarlo.

**30. Usted** — Las dos preguntas que usted dejó escritas en el `.docx` y que siguen sin
contestar: qué es un selector, y si alguna pantalla dice «La Prestadora».

**31. Usted** — El cartel que quedó parado porque no ubicó la situación. Va con la pantalla
delante.

**32. Usted** — Los tres grupos que quedaron sin autorizar: los once textos que salen por ser una
aclaración debajo de un casillero, los catorce que pasarían a formar parte de la etiqueta del
casillero, y los nueve casilleros que están mal hechos y por eso necesitaban esa aclaración.

**33. Usted** — Habilitar clave: qué carteles lleva se decide después de analizar el procedimiento
y su lógica, no antes.

**34. Usted** — El bloque del segundo factor en Configuración › Accesos, con dos frases que
nombran un rol que no existe.

**35. Usted** — Tres cosas que son texto visible y no se pueden decidir de mi lado: la
contradicción del certificado, donde dos textos dicen cosas distintas del mismo código; las siete
claves que le nombran al usuario la sesión de soporte y la organización de pruebas, que la regla del
producto dice que la Prestadora no ve ni sabe que existen; y la advertencia legal escrita adentro del
código de la aplicación del Asistente, que según la regla tiene que salir del documento legal de ese
país.

**36.** Aplicar todo lo contestado, y lo que ya está autorizado: el cambio de «Personas autorizadas»
a «Personas autorizadas», que es grande y no lleva ningún mensaje.

**37.** Lo que no espera ninguna respuesta porque ya es regla escrita: sacar el tuteo y el voseo de
todo el Panel y de las dos aplicaciones, sin excepción —va en la misma pasada que el nombre viejo—;
quitar los textos que no se alcanzan desde ninguna pantalla; y escribir la regla de que cuando un
texto sale sale el cartel entero, donde vive la regla del casillero.

**38.** Relevar lo que todavía no está relevado y el propio relevamiento manda mirar: los textos al
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

**39. Usted** — ¿Dónde vive el formulario público de postulación? No va en `careonys.com`, que le vende software a las Prestadoras: quien busca trabajo de cuidador se postula en la empresa que lo va a contratar. ¿En el sitio de cada Prestadora, con dirección propia?

**40.** La pantalla del formulario, que es lo único que falta: la base y el backend ya guardan y comprueban los campos de las seis secciones de `docs/PRD_03_Reclutamiento.md`, y el backend entrega las listas de opciones en `GET /api/publico/:prestadora/postulacion-asistente/opciones`. Se dibuja desde la declaración, no a mano. Esperaba el paso anterior.

**41. Usted** — ¿Se le bloquea la asignación de guardias a quien no está inscripto en monotributo, o se avisa y decide la Prestadora? La regla del producto dice avisar, no bloquear, así que el PRD y la regla no coinciden. **Lo que se asigna es un turno de guardia**, y asignarlo supone el Servicio armado, más arriba en esta lista.

**42.** Construirlo según lo contestado.

**43. Usted** — Comparar automáticamente la foto del documento con la foto de la cara es tratamiento de dato biométrico, y hacen falta dos decisiones suyas: ¿cuál es el documento legal del que sale la advertencia al Asistente, que hoy no existe y sin la cual no hay advertencia? ¿Y qué proveedor compara las dos caras? Guardar las dos fotos y mostrarlas juntas ya está hecho: hoy las compara una persona.

**44.** Construirlo según lo contestado.

**45. Usted** — El programa de capacitación: qué contenido lleva, cuántas preguntas y qué nota se necesita para aprobar. Hoy «capacitación» es sólo el nombre de una etapa.

**46.** Construirlo.

---

## Las dos aplicaciones

**47. Usted** — Compartir el Certificado de Aptitud: ¿hacia dónde y por qué medio? Hoy se puede ver, con su estado y su fecha. Compartirlo hacia afuera exige decidir a quién se le manda, por qué canal y qué ve quien lo recibe, porque no existe ninguna verificación pública del certificado: sin eso, lo compartido sería una imagen que no prueba nada.

**48. Usted** — La alerta por salida del domicilio, dos decisiones que no puedo tomar yo. Hoy la cuenta se hace con una velocidad media única y distancia en línea recta (`backend/src/utils/llegadaEstimada.js:39-45`), se dispara recién cuando alguien marcó la salida, y mide llegada tarde, no que el Asistente siga en su casa.

- **El tiempo de viaje real sale de un servicio de mapas ajeno.** Cuál se contrata, con qué cuenta y qué se le manda en cada consulta —las coordenadas de la casa de una persona salen del producto— es decisión suya, y la credencial la pone usted.
- **Dónde vive el Asistente ya se guarda**, con su dirección escrita y sus coordenadas, y anotado como dato sensible que no sale hacia el Cliente. Las coordenadas quedan vacías mientras nadie ubique la dirección en un mapa, y completarlas depende del servicio de mapas del punto anterior. Esto **no es una decisión suya**: está tomada y construida.
- **Y exige mirar el teléfono antes de que la guardia empiece.** Hoy el GPS se lee cuando la persona aprieta un botón. Leerlo sola, mientras todavía no empezó a trabajar, es seguir a alguien fuera de su horario: hay que decidir si se hace, con qué advertencia y con qué permiso.

**49.** Con eso contestado, construirlo — incluida la lista de medios de transporte, que hoy es texto libre escrito en cada salida y por eso no hay contra qué traducirlo a una velocidad.

**50. Usted** — El botón de contacto de «Asistente Asignado»: ¿a quién llama? El PRD lo dejó abierto —«WhatsApp o chat interno» (`docs/PRD_04_05_App_Servicio.md:224`)— y las dos salidas tienen consecuencias. Darle al Cliente el teléfono del Asistente es entregar el dato personal de quien trabaja, y es exactamente lo que Match cobra por abrir: ahí el contacto va tapado hasta que alguien paga. La otra salida es que el botón lleve a la Prestadora, que es con quien el Cliente tiene el trato en prestación directa, usando el contacto que ella misma configura. Hay una tercera: el hilo interno, que hoy existe sólo para Match y con el tapado puesto.

De las especialidades de esta pantalla no queda nada por hacer: `asistentes.especialidades` está retirada por comentario de la migración y no se escribe más. Lo vigente es el tipo de Asistente, que ya se muestra, con sus Tareas de lo que corresponde y lo que no.

**51. Usted** — El PRD promete exportar el reporte a PDF en la aplicación del Cliente, y más adelante dice que el Cliente no accede al informe. ¿Cuál de las dos vale?

**52.** Cuatro puntos de las aplicaciones y de lo que sale hacia el teléfono:

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

**53. Usted** — ¿Cooperativa como tercera modalidad de vínculo?

**54.** Construirla: migración que abra tres CHECK, filas de conceptos y fórmulas de cese.

**55. Usted** — Nivel de complejidad: ¿qué significa cada uno de los tres? ¿Condiciona qué tipo de Asistente se admite? Hoy se carga y se edita, y el cálculo de candidatos no lo mira.

**56.** Que el cálculo de candidatos lo use.

**57. Usted** — Verificar matrícula: ¿alcanza con mirar el archivo, o hay que comprobar contra el registro del colegio profesional? La mitad técnica está construida.

**58.** Construir la verificación según lo contestado.

**59. Usted** — Accesibilidad: el código está hecho, falta la respuesta legal. `docs/legal/argentina.md` no la menciona.

**60. Usted** — El Certificado de Aptitud impreso: ¿qué lleva? Hoy la pantalla genera el código de barras y ahí termina.

**61.** Armarlo. La subida del certificado a un depósito de archivos **ya está resuelta**: el
depósito de los papeles del legajo del Asistente está construido, en
`supabase/migrations/20260929100000_los_papeles_del_legajo_del_asistente_tienen_donde_vivir.sql`.
Hoy sólo se guardan fechas.

---

## Datos personales

**62. Usted** — Protección de datos personales: el texto lo tiene que dar el Desarrollador. `docs/legal/argentina.md` tiene ocho secciones y ninguna es de esto. Sin documento no hay advertencia.

**63.** La advertencia, y qué se hace con los datos de un Servicio cerrado hace años, que hoy no se purgan nunca.

**64. Usted** — La ubicación de las personas: cuatro preguntas para el profesional legal. En los 21 archivos de `docs/legal/` no aparece ni una vez «ubicación», «GPS» ni la ley 25.326. El registro del consentimiento está construido; los textos sembrados son de relleno. **Mientras no haya respuesta, el seguimiento no se enciende con nadie real.**

**65.** Sembrar los textos reales y encender el seguimiento y el mensaje de demora en el trayecto.

---

## Respaldo, continuidad y secretos

**66. Usted** — El alta del gestor de contraseñas, y completar las cinco filas en blanco de `celtatech/docs/CUENTAS.md`.

**67.** Rotar clave por clave lo que corresponda, decidiéndolo de a una. Si se rota la clave secreta de Supabase, se actualiza en Railway en el mismo acto. Entra acá la clave de servicio de Supabase que estuvo escrita en texto plano en la configuración de permisos de la máquina: los comandos que la llevaban adentro ya se borraron, pero la clave en sí se rota el día de la liberación, no antes.

**Ya no queda ninguna contraseña escrita en el repositorio.** Todas salen del entorno, y las
cuentas de la base local nacen sin clave: se la pone un programa aparte después de cada
reconstrucción. Lo que queda por hacer acá es **rotar las cuentas que nacieron con las claves que
estuvieron a la vista**: las de la Prestadora de demostración, las de la demostración de
continuidad de guardia, las de la prueba de cierre de Servicio y las que quedaron sin borrar de la
prueba del escaneo del Asistente.

Y queda además **una contraseña de prueba en texto plano dentro de la configuración de permisos de
una copia de trabajo**, que no es un archivo del repositorio y por eso el barrido no la alcanzó.

**68. Usted** — Correr `node scripts/probar_restauracion.mjs` desde `backend/`, con Docker encendido y las variables del respaldo diario más las de la base de producción cargadas en el entorno. Baja el último respaldo, lo restaura en una base efímera, compara las tablas, las filas y los archivos del espejo contra lo que hay hoy, y borra todo al terminar. Le toca a usted porque pide las llaves del bucket y de la base, que viven en la caja fuerte. La prueba anterior verificó 30 tablas de un esquema que hoy tiene 105 y no tocó ningún archivo, porque todavía no se respaldaban. **Si contesta `no_probado`, no salió mal: quiere decir que todo coincidió y no había nada cargado que comparar**, y entonces hay que repetirla con datos de prueba.

**69. Usted** — Los dominios se renovaron en julio de 2026 y vencen en julio de 2027, y esa fecha hoy no está en ningún calendario: `celtatech.com` y `careonys.com` en Cloudflare, y `celtatech.com.ar` y `celtatech.net.ar` en NIC Argentina. Poner un recordatorio un mes antes de cada uno y, donde el registrador lo permita, dejar la renovación automática encendida — NIC Argentina no la tiene, así que ésos son los dos que de verdad dependen del recordatorio. Un dominio vencido no se cae despacio: deja de resolver, y con él se van las pantallas, el correo de la empresa y la entrada a las cuentas que se registraron con ese correo.

---

## Marca y dominio por Prestadora

**70.** Que la conversación quede guardada adentro del producto, según lo que se conteste sobre el botón de contacto de «Asistente Asignado», más arriba en esta misma lista. Hasta que el Panel no tenga un hilo de dos puntas, lo que se hablan el Cliente y el Asistente en prestación directa se va a WhatsApp y no queda adentro de ningún lado. El chat interno ya está construido entero —hilos, mensajes, tapado del contacto, pantallas en las dos aplicaciones, mensaje al celular y videollamada—, pero **sólo funciona donde la Prestadora pone Asistentes disponibles para que el Cliente elija**: exige un Cliente y un Asistente que se hayan encontrado ahí. En prestación directa no hay hilo, y hacia la Prestadora tampoco: el único canal con el Panel va en un solo sentido, del Panel al Asistente, y no hay dónde guardar lo que contesta.

---

## Módulos

**71.** Sacar el nombre viejo `careonys` de adentro del producto. **Se decide y se hace con la
mudanza ya encima**, que es cuando hay que tocar la base de todos modos. Está medido y no se
pierde: nadie usó nunca la aplicación y todos los datos cargados son inventados, así que
reconstruir la base los reescribe sin mudanza. Lo que cuesta igual, se haga cuando se haga, son
cinco nombres de afuera: el nombre del proyecto local, el servicio donde corre el backend con su
dirección, y los dos depósitos de respaldo. El repositorio ya se llama `careonys`.

**72. Usted** — ¿Dónde corre un módulo y contra qué base? Hoy `Modulos\` está vacía. **Facturación y créditos y cobranzas ya están decididas como software aparte del que Careonys se sirve**, así que esto no decide si salen, sino dónde corren el día que existan. También decide si con eso se cierran sin construir los adaptadores de pasarela.

**73.** Sacar la facturación y la cobranza a un módulo, cuando haya dónde correrlo.

---

## Decisiones que no traban nada empezado

**74. Usted** — Subcontratación: no existe ninguna tabla de Empresa subcontratada y el Panel no la ofrece a propósito. La precondición era no abrirla hasta que una Prestadora real lo pida. ¿Sigue valiendo?

**75. Usted** — Un tercero que sólo mira: ¿cómo entra un financiador que sólo consulta? Un cuarto rol, un Coordinador de sólo lectura desde el catálogo de permisos, o no se hace.

**76. Usted** — ¿Careonys va a atender establecimientos donde conviven Pacientes de Clientes distintas — una residencia, un geriátrico? Si es más adelante, alcanza con dejarlo dicho.

**77. Usted** — ¿Diez pedidos por minuto y por persona es el número? El contador compartido hace falta el día que el backend se reparta en varios servicios; hoy corre en uno solo.

**78. Usted** — ¿Los idiomas siguen en un archivo o pasan a la base? De esto depende si sumar un
idioma es una publicación o una carga de datos. **Y está contestado a medias sin que nadie lo
anotara**, así que la pregunta es más chica de lo que parece:

- **Las listas de opciones ya viven en la base**, con la traducción adentro de cada opción.
- **Los mensajes que manda el producto también**, en `mensajes_del_sistema`, con su columna de
  traducciones y una fila propia por Prestadora más la del producto.
- **Lo que sigue en un archivo es el texto de las pantallas del Panel** —`panel/src/i18n/translations.js`—, que ningún archivo de `panel/src/` reemplazó todavía por la tabla.

Así que lo único que esto decide es ese último resto. **Y se contesta después de la sección de los
carteles**, más arriba: es justamente ese archivo el que se barre ahí, y no tiene sentido mudar
texto que va a salir.

**79. Usted** — El puntaje interno de calidad del Asistente, que sólo ve el Admin: ¿sigue en pie ahora que existen las estrellas que pone el Cliente? Si sigue, faltan dos respuestas: qué lo compone, y la garantía de que ninguna acción automática dependa de él. El lugar donde iría ya está hecho (`datos_reservados_asistente` y su permiso).

**80. Usted** — El alta y la baja de Prestadoras: Match expone una puerta firmada para que CeltaTech dé de alta y de baja clientes; Careonys no tiene nada parecido. ¿Se construye la misma, o se siguen dando de alta a mano?

**81.** **Por esa misma puerta tiene que entrar qué tiene habilitado cada Prestadora, y hoy no
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
  Hoy el sistema no la deja apagar si quedan Asistentes trabajando o Clientes con acceso abierto,
  y está bien que no la deje.
- **La orden que llega no se puede bloquear.** Con esa misma comprobación, alcanzaría con tener un
  Asistente trabajando para que la orden nunca se cumpla.

**82. Usted** — Qué hace Careonys de su lado cuando recibe esa orden y adentro quedan Asistentes
trabajando y Clientes con acceso abierto. Cortar el acceso y dejarlo todo en su lugar no es lo
mismo que darlo de baja.

**83.** Construirlo, todo de este lado: recibir qué tiene habilitado cada Prestadora y que su
Configuración ofrezca solamente eso; y recibir la orden de deshabilitar, sin la comprobación que
lleva el apagado de ella, haciendo con lo que quede en curso lo que se conteste arriba. **La lista
de capacidades la declara este producto**, que es el que sabe qué significan; del otro lado son
texto opaco. Lo que cada Prestadora tenga hoy en uso se conserva.

**84. Usted** — El acompañamiento online: ¿prestación más, o guardia sin domicilio? Si es guardia, hay que decidir qué reemplaza al check-in por ubicación. **Las dos palabras son ahora dos niveles distintos del glosario**, así que la pregunta elige entre uno y el otro: una Prestación con su precio y sus horarios, o una guardia que se reparte en turnos. Y lo que reemplaza al check-in por ubicación es del turno, no de la guardia.

**85. Usted** — El «Gestor del cuidado»: ¿rol nuevo, variante de Coordinador, o entrada en el catálogo de permisos por Prestadora? La tercera no rompe la regla de los tres roles de Panel; las dos primeras sí.

**Se contesta después del acto de armar el Servicio**, más arriba en esta lista, por dos motivos. El
primero es que **la premisa con la que estaba escrita esta pregunta no es cierta**: decía que hoy el
Coordinador se asigna por guardia, y no se asigna en ninguna parte — la columna del coordinador en la
guardia no la escribe ninguna línea del Panel ni del backend, sólo la siembra `supabase/seed.sql`, y
lo que hay en pantalla es una lista deducida de las zonas en `panel/src/lib/equipoDelPaciente.js`. El
segundo es que ese acto cambia el modelo: **una sola persona coordina todo el Servicio, se la asigna
al acordarlo, y sin ella el Servicio no se habilita.** Con eso construido, la pregunta es si hace
falta alguien más además de esa persona, que es otra pregunta.

**86. Usted** — Cursos para clientes: ¿va o no va?

**87. Usted** — La regla de los archivos dice «nunca público» y hay un depósito público construido (`marca-prestadoras`); los otros cinco son privados. ¿La regla admite la excepción, o se cierra el depósito?

**88. Usted** — La categoría de convenio del Asistente se teclea a mano, y de ella depende su
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

**89. Usted** — ¿Se autoriza construir `careonys.com` según `docs/PRD_01_Sitio_Web.md`? El PRD ya está entero. Hoy `sitio-web/` es una página que dice «En construcción». **El diseño se hace de cero**: del sitio público de Match no viaja nada visual.

**90.** Construirlo.

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

Las que ya están identificadas, cada una con su paso propio más adelante en esta lista: la advertencia
para el tratamiento de dato biométrico, la accesibilidad, la protección de datos personales, y las
cuatro preguntas sobre la ubicación de las personas. Los pasos que dependen de ellas dicen qué se
construye igual mientras tanto.

**91. Usted** — Las escalas legales: la validación, y los dos valores que el código usa y no
existen (`piso_minimo_indemnizacion` y `fraccion_computable_antiguedad`). En el mismo viaje va el
texto de la advertencia sobre el abandono de persona: ninguno de los veintiún documentos de `docs/legal/`
lo menciona —lo único parecido es el abandono de *trabajo*, art. 244 LCT, en
`docs/legal/argentina.md:147`, que es otra cosa—, y la regla del producto prohíbe improvisarlo. Sin
documento no hay advertencia; la mecánica se construye igual, porque no depende de ninguna ley.

---

## Cierre

**92. Usted** — El documento de roles generado desde la base: ¿para quién es, interno de CeltaTech o manual para la Prestadora?

**93.** Generarlo.

**94.** Correr las pruebas y publicar.
