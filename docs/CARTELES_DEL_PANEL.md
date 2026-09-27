# Los carteles del Panel, uno por uno

Este documento existe para que se pueda mirar el Panel abierto, pantalla por pantalla, y ver con
los ojos cada cartel que el sistema pone por su cuenta. Cada ficha arranca diciendo **cómo se
llega a esa pantalla** —el camino por el menú, los clics— y qué hay que hacer para que ese cartel
aparezca.

**Son veintiséis.** Están ordenados por el camino del menú, de arriba abajo, para que se puedan ir
viendo uno atrás del otro sin saltar de un lado al otro del Panel.

**Qué se cuenta acá como cartel.** Todo texto que el Panel dice por su cuenta, sin que sea un dato
cargado por nadie: los carteles que ocupan el lugar de una lista cuando esa lista está vacía, los
avisos de que falta configurar algo, y los renglones que se muestran en lugar de un valor. No
entran las etiquetas de los casilleros, ni los títulos de pantalla, ni los datos.

**Qué NO está en este documento.** Los textos al pie de los casilleros cuando un dato está mal
cargado, los mensajes de «se guardó» y las ventanas de confirmar. Esos no están puestos esperando:
aparecen cuando alguien aprieta algo y se van solos. Y las dos aplicaciones de teléfono —la de las
Clientes y la de los Asistentes— van en documento aparte. **Eso lo decidí yo y se puede rechazar:
si tienen que entrar, entran.**

**Cada ficha tiene ocho apartados, siempre los mismos y en este orden:** cómo llegar, qué es esa
pantalla, qué se ve de arriba abajo, el cartel textual, cuándo aparece, qué tapa mientras está
puesto, qué quedaría si se lo saca, y los problemas que se ven ahí.

**Los problemas que figuran al final de cada ficha son observaciones, no decisiones.** Nada de esto
se tocó ni se va a tocar sin orden.

---

# PARTE I — Los dos carteles de fábrica

Estos dos no pertenecen a ninguna pantalla: los escribe una sola pieza del Panel, la que dibuja
todas las listas, y por eso aparecen en decenas de lugares con las mismas palabras. Van primero
porque son los que más veces se ven.

## 1. El cartel genérico de lista vacía

**Cómo llegar.** No tiene un camino propio: aparece en cualquier lista del Panel que no traiga un
cartel escrito para ella. Los lugares donde hoy se lo ve sin hacer nada especial son **Clientes →
Solicitudes de Servicio**, **Plantel → Postulaciones**, **Cumplimiento → Verificación de
Guardias**, **Plantel → Documentación**, y la solapa **«Proceso de Incorporación»** dentro de la
ficha de un Asistente.

**Qué es esa pantalla y para qué se usa.** No es una pantalla, es el texto de fábrica. Todas las
listas del Panel las dibuja una misma pieza, que sabe mostrar cuatro situaciones: que está
cargando, que falló la carga, que no hay nada, y la lista hecha. Cuando no hay nada y la pantalla
no aportó un texto propio, sale éste.

**Qué se ve en pantalla, de arriba abajo.** Depende de la pantalla. Lo constante es que el cartel
ocupa exactamente el lugar donde iría la tabla: el título de la pantalla y sus filtros quedan
arriba, y el cartel abajo, centrado, donde estaría la primera fila.

**El cartel, textual.**
Primer renglón: «Todavía no hay nada acá»
Segundo renglón: «Cuando se cargue el primer registro va a aparecer en esta lista.»

**Cuándo aparece.** Cuando la lista volvió sin ni un renglón, no hay ningún filtro puesto, y la
pantalla no escribió un cartel propio.

**Qué desaparece mientras el cartel está puesto.** La tabla entera de esa pantalla, con todas sus
columnas y todos los botones que viven en cada fila.

**Qué queda alrededor si el cartel se saca.** El título de la pantalla, los filtros si los hay, y
un blanco donde iría la tabla.

**Problemas que se ven acá.** Cuatro.

El primero es que en tres de los cinco lugares donde se lo ve, el texto cuenta mal el hecho: dice
«cuando se cargue el primer registro», y en **Solicitudes de Servicio**, **Postulaciones** y
**Verificación de Guardias** nadie carga nada desde el Panel. Lo que hace aparecer una fila ahí es
algo que pasa afuera —un Cliente que pide un servicio, una persona que se postula, una guardia que
se cumple—, y eso el cartel no lo nombra.

El segundo es **Documentación**, y es el más serio de los cuatro: esa pantalla abre ya filtrada a
«Vencidos y por vencer», y ese valor de arranque no cuenta como filtro puesto. Entonces, cuando no
hay ningún documento vencido ni por vencer —que es la buena noticia— la pantalla lo dice con
«Todavía no hay nada acá», como si no hubiera ni un documento cargado en toda la empresa.

El tercero es que es un callejón sin salida en todos los lugares donde no hay un botón de agregar
al lado: dice que no hay nada y no dice qué hacer ni adónde ir.

El cuarto es que el segundo renglón describe cómo funciona el programa —que hay una lista, que se
cargan registros, que los registros aparecen— en vez de decirle a quien lee qué le toca hacer.

---

## 2. El cartel de filtro sin resultados

**Cómo llegar.** En cualquier pantalla del Panel que tenga buscador o filtros: escribir algo en el
buscador, o elegir una opción en un desplegable de filtro, que no coincida con nada. El cartel
reemplaza a la tabla.

**Qué es esa pantalla y para qué se usa.** Es el otro texto de fábrica de la misma pieza que dibuja
las listas. Se usa cuando la lista quedó vacía **y hay algún filtro puesto**, para distinguir «no
hay nada cargado» de «hay cosas, pero ninguna coincide».

**Qué se ve en pantalla, de arriba abajo.** El título de la pantalla, la tarjeta de filtros con lo
que se haya tecleado o elegido —que queda a la vista—, y debajo el cartel en el lugar de la tabla.

**El cartel, textual.**
Primer renglón: «El filtro no encontró nada»
Segundo renglón: «Hay registros cargados, pero ninguno coincide con lo que se buscó.»
Y debajo, un botón: «Sacar los filtros».

**Cuándo aparece.** Cuando la lista volvió sin ni un renglón y hay al menos un filtro puesto.

**Qué desaparece mientras el cartel está puesto.** La tabla entera.

**Qué queda alrededor si el cartel se saca.** El título, los filtros con lo tecleado adentro, y un
blanco. El botón de sacar los filtros se iría con el cartel, que es el único lugar donde está.

**Problemas que se ven acá.** Tres.

El primero es que afirma un hecho que no comprobó. Dice «Hay registros cargados», y eso no se
miró: lo único que se sabe es que la consulta con filtro volvió vacía. En el Padrón sin ni un
Legajo, basta teclear una letra en el buscador para que la pantalla diga que hay registros
cargados, que es exactamente lo contrario de la verdad.

El segundo es que «lo que se buscó» nombra solamente al buscador, y la mayoría de estas pantallas
filtran además por desplegable —un estado, una zona, un rango de fechas—. Quien tecleó nada y sólo
eligió un estado lee una frase que no habla de lo que hizo.

El tercero es que hay pantallas que nunca llegan a este cartel aunque tengan filtros: Documentación
es una, porque su filtro de arranque no cuenta como filtro y la manda siempre al cartel genérico.

---

# PARTE II — Los carteles propios de cada pantalla

# Clientes → Padrón

## 3. Cuando no hay ningún Legajo cargado

**Cómo llegar.** Menú lateral → grupo **Clientes** → **Padrón**. El cartel ocupa el lugar de la
tabla y se ve ni bien se entra, sin apretar nada, mientras no haya ni un Legajo.

**Qué es esa pantalla y para qué se usa.** El Padrón es el único lugar donde vive la información de
los Clientes de la Prestadora. Un Cliente, una obra social, una prepaga o quien sea se carga ahí
una sola vez, con todo lo que se sabe de esa persona o entidad, y desde cualquier otra pantalla se
la nombra citándola, nunca copiando sus datos. Es también el único lugar donde se da de alta: los
casilleros que eligen del Padrón sólo eligen.

**Qué se ve en pantalla, de arriba abajo.**
- Título de la pantalla: «Padrón»
- La tarjeta de filtros, con el buscador y los desplegables.
- El botón «Nuevo Legajo», cuando quien mira tiene permiso de editar.
- Y ahí abajo la tabla de Legajos, o el cartel cuando no hay ninguno.

**El cartel, textual.**
Primer renglón: «Todavía no hay ningún Legajo cargado»
Segundo renglón: «Cada persona o entidad se carga una sola vez, y después se la nombra desde donde
haga falta.»
Y debajo, el botón «Nuevo Legajo».

**Cuándo aparece.** Cuando no hay ni un Legajo cargado y no hay ningún filtro puesto. Es el estado
de una Prestadora que recién empieza.

**Qué desaparece mientras el cartel está puesto.** La tabla de Legajos entera, con sus columnas y
con los botones de cada fila.

**Qué queda alrededor si el cartel se saca.** El título, la tarjeta de filtros —vacía y sin nada que
filtrar—, y un blanco. El botón «Nuevo Legajo» quedaría igual, porque está arriba y no dentro del
cartel.

**Problemas que se ven acá.** Tres.

El primero es que basta teclear una letra en el buscador para que este cartel se vaya y entre el de
filtro sin resultados, que dice «Hay registros cargados» cuando no hay ninguno. La pantalla pasa de
decir la verdad a decir lo contrario con una tecla.

El segundo es que cuando quien mira no tiene permiso de editar, el cartel queda sin botón: dice que
no hay nada, no ofrece cargar nada, y no dice a quién pedírselo.

El tercero es que el segundo renglón explica la regla del Padrón —que cada uno se carga una sola vez
y después se lo cita— en vez de decir qué hacer ahora. Es una buena regla y está bien que exista;
el lugar donde está escrita es el que no corresponde.

---

## 4. El casillero que elige del Padrón, cuando el Padrón está vacío

**Cómo llegar.** En cualquier pantalla que tenga un casillero que elige del Padrón, con el Padrón
sin ningún Legajo. Los casilleros donde se lo ve son **«Apoderado»**, **«Obra Social»**, **«Quién
paga»** y **«Quién se quedó cuidando»**, que aparecen en la ficha de un Cliente y en las ventanas
de contratación. El texto está debajo del desplegable.

**Qué es eso y para qué se usa.** No es un cartel de lista vacía: es un renglón de explicación
puesto debajo de un casillero. El casillero es un desplegable con buscador que ofrece los Legajos
del Padrón para elegir uno.

**Qué se ve en pantalla, de arriba abajo.**
- La etiqueta del casillero —«Apoderado», «Obra Social», «Quién paga» o «Quién se quedó cuidando»—.
- El desplegable, que con el Padrón vacío muestra «Sin elegir» y se abre sin ninguna opción adentro.
- Debajo, este renglón.

**El texto, textual.**
Un solo renglón: «Todavía no hay ningún Legajo cargado. Se puede agregar el primero desde acá.»

**Cuándo aparece.** Cuando la lista de Legajos que ese casillero ofrece vuelve vacía. En los
casilleros que están acotados a una clase —el que pide una obra social, por ejemplo— vuelve vacía
también cuando hay Legajos cargados pero ninguno de esa clase.

**Qué desaparece mientras el texto está puesto.** Nada. Este renglón no reemplaza a la lista: el
desplegable sigue ahí, con el mismo aspecto de siempre, mostrando «Sin elegir».

**Qué queda alrededor si el texto se saca.** La etiqueta y el desplegable, tal cual, vacío.

**Problemas que se ven acá.** Cuatro, y el primero es el más grave de los seis carteles del Padrón y
sus casilleros.

El primero es que **promete algo que no puede cumplir**. Dice «Se puede agregar el primero desde
acá», y desde ahí no se agrega nada: un casillero que elige del Padrón sólo elige, y el alta se hace
en el Padrón con el botón que lo dice. Quien lea esa frase va a buscar en ese desplegable una forma
de cargar un Legajo que no existe.

El segundo es que cuenta mal el hecho en los casilleros acotados a una clase: en el que pide una
obra social dice que no hay ningún Legajo cargado, cuando puede haber doscientos y lo que falta es
una obra social entre ellos.

El tercero es que es una explicación debajo de un casillero, que es justo lo que no se pone.

El cuarto es que el desplegable queda con aspecto de estar usable —se abre, tiene buscador, dice
«Sin elegir»— cuando adentro no hay ni una opción.

---

## 5. Los teléfonos de la ficha de un Legajo

**Cómo llegar.** Menú lateral → grupo **Clientes** → **Padrón** → clic en un Legajo para corregirlo
→ bajar hasta el bloque de **teléfonos**. Este bloque sólo existe al corregir un Legajo ya cargado;
al dar de alta uno nuevo no está.

**Qué es eso y para qué se usa.** Es el bloque donde se cargan los teléfonos de ese Legajo. Son
varios a propósito: el fijo de la casa y los celulares de quienes atienden.

**Qué se ve en pantalla, de arriba abajo.**
- El título del bloque, de teléfonos.
- La lista de teléfonos cargados, o este cartel cuando no hay ninguno.
- El casillero «Teléfono» y el botón «Agregar teléfono».

**El cartel, textual.**
Primer renglón: «Todavía no hay ningún teléfono cargado»
Segundo renglón: «Se pueden cargar todos los que haga falta: el fijo de la casa y los celulares de
quienes atienden.»

**Cuándo aparece.** Cuando ese Legajo no tiene ni un teléfono cargado.

**Qué desaparece mientras el cartel está puesto.** La lista de teléfonos, con cada número y los
botones de cada renglón.

**Qué queda alrededor si el cartel se saca.** El título del bloque, un blanco, y debajo el casillero
«Teléfono» con el botón «Agregar teléfono», que siguen ahí y alcanzan para entender qué hay que
hacer.

**Problemas que se ven acá.** Dos.

El primero es que es una explicación debajo de un control que explica lo obvio: el casillero se
llama «Teléfono» y el botón dice «Agregar teléfono». Nadie necesita que le cuenten que se pueden
cargar varios; el botón lo demuestra apretándolo.

El segundo es que el bloque sólo existe al corregir un Legajo, nunca al darlo de alta, así que quien
lee este cartel ya cargó a esa persona entera y no es su primera vez en la pantalla.

---

# Clientes → Clientes → un Cliente

## 6. Cuando el financiador no tiene cargada ninguna documentación exigible

**Cómo llegar.** Menú lateral → grupo **Clientes** → **Clientes** → clic en un Cliente de la lista.
Dentro de la ficha, bajar hasta la subsección **«Documentación que pide el financiador»**, que está
debajo de todo lo de la firma del Pagador.

**Qué es esa pantalla y para qué se usa.** Es la parte de la ficha de un Cliente donde se responde
una sola pregunta: quién paga esto y si eso ya está cerrado. Elegir a alguien del Padrón no alcanza:
queda definido como Pagador recién cuando firmó que asume la obligación de pagar. Ahí mismo se ve si
esa firma está, se arma el documento para que la firme, se registra que llegó firmado, y —abajo de
todo eso— se lleva la cuenta de los papeles que exige quien financia el servicio: cuáles están,
cuáles faltan, cuáles se vencieron. Nada de eso frena la contratación; avisa nada más, en el momento
en que se elige a la persona y no el día que hay que cobrarle.

**Qué se ve en pantalla, de arriba abajo.**
- Título de la pantalla: el nombre del Cliente.
- Título de sección: «Contacto», con los casilleros de nombre, teléfono, correo, localidad y plan.
- El casillero donde se elige del Padrón, rotulado «Quién paga».
- Título de la subsección: «Quién paga».
- Debajo, la explicación: «Elegir el Legajo no alcanza: el Pagador queda definido cuando firma que
  asume la obligación de pagar. Acá se ve si esa firma está y qué documentación pide el financiador.
  Nada de esto frena la contratación.»
- Un cartel de estado, que dice «El Pagador está definido: firmó que asume la obligación de pagar.»
  o «El Pagador todavía no firmó que asume la obligación de pagar.»
- Una lista de dos renglones: «Quién paga» con el nombre, y «Firma en su representación» con el
  nombre de quien firma, si lo hay.
- Los botones de «Armar el consentimiento», «Ver el documento», «Registrar la firma» y «Anular»,
  según en qué punto esté la firma.
- Título de la subsección siguiente: «Documentación que pide el financiador».
- Y ahí abajo va la tabla de papeles, o el cartel cuando no hay nada.

**El cartel, textual.**
Un solo renglón: «Esta Prestadora todavía no cargó qué documentación pide. Se configura en
Configuración.»

**Cuándo aparece.** Cuando la lista de papeles exigibles vuelve vacía, es decir, cuando nadie dejó
escrito en ningún lado qué documentación hay que pedirle a quien paga. No depende de esta Cliente ni
de este Pagador: es una definición que se hace una sola vez para toda la empresa, y mientras no se
haga, este cartel va a estar en todas los Clientes por igual.

**Qué desaparece mientras el cartel está puesto.** La tabla entera de papeles, con sus cuatro
columnas —«Documento», «Situación», «Vence» y «Acciones»—, con el estado de cada renglón, que puede
ser «Falta», «Cargado» o «Vencido», y con los botones de «Ver», «Cargar» y «Reemplazar». Desaparece
también el aviso que resume la situación arriba de la tabla, el que dice «Falta cargar tantos
documentos.» y «Hay tantos documentos vencidos.»

**Qué queda alrededor si el cartel se saca.** Todo lo de la firma queda intacto: el estado del
Pagador, quién paga, quién firma en su representación, la fecha en que se firmó y los botones de
armar, ver y registrar. Lo único que queda es el título «Documentación que pide el financiador» con
un blanco debajo, y el botón de guardar los datos de contacto más abajo.

**Problemas que se ven acá.** Son tres. El primero es que el título y el cartel se contradicen sobre
quién exige los papeles: el título dice que la documentación la pide el financiador, y el cartel dice
que la Prestadora «todavía no cargó qué documentación pide», como si fuera ella la que exige. Leídos
uno atrás del otro, no se entiende de quién es la exigencia. El segundo es que en esta misma pantalla
la frase «Quién paga» aparece tres veces seguidas y con tres significados distintos: es el rótulo del
casillero donde se elige, es el título de la subsección entera, y es el renglón que muestra el nombre
elegido. El tercero es que la frase «Se configura en Configuración» dice la misma palabra dos veces
en cinco palabras, y aun así no dice en qué parte de esa pantalla hay que buscar.

---

## 7. Cuando las personas autorizadas no tiene instrucción firmada

**Cómo llegar.** Menú lateral → grupo **Clientes** → **Clientes** → clic en un Cliente → bajar
hasta la sección **«Personas autorizadas»**, que está debajo de «Pacientes». El texto está al pie de
esa sección, después de la lista de personas de las personas autorizadas.

**Qué es eso y para qué se usa.** Las personas autorizadas es la gente allegada al Paciente que además
del cuidado formal participa: un hijo, una vecina, un sobrino. La instrucción firmada es el
documento donde el Cliente deja dicho qué puede hacer cada uno de ellos y qué no. El texto no es un
cartel de lista vacía sino un párrafo que avisa que ese documento no está.

**Qué se ve en pantalla, de arriba abajo.**
- El nombre del Cliente, arriba.
- Las secciones anteriores: «Contacto» y «Pacientes».
- Título de sección: «Personas autorizadas»
- Debajo, la explicación de la sección, de tres renglones, sobre qué es las personas autorizadas y para qué sirve
  la instrucción firmada.
- La lista de las personas de las personas autorizadas, con sus botones —entre ellos el que abre la ventana
  «Accesos»—.
- Al pie, este párrafo cuando no hay instrucción firmada.
- Más abajo, las secciones de «Guardias activas», «Historial de reportes» y «Alertas activas».

**El texto, textual.**
Un solo párrafo: «Todavía no hay ninguna instrucción firmada para este personas autorizadas.»

**Cuándo aparece.** Con tres condiciones a la vez, y una de ellas es la que lo vuelve raro: que la
lista de las personas autorizadas haya cargado bien, que no exista ninguna instrucción firmada, y **que haya al
menos una persona en las personas autorizadas**. Con las personas autorizadas vacío este texto no sale.

**Qué desaparece mientras el texto está puesto.** El bloque de la instrucción firmada: la fecha en
que se firmó, quién la firmó y el enlace para abrir el documento.

**Qué queda alrededor si el texto se saca.** El título de la sección, su explicación de tres
renglones, la lista de las personas de las personas autorizadas con sus botones, y un blanco al pie: nada que
indique que la instrucción falta.

**Problemas que se ven acá. Es el más serio de los doce que no estaban en este documento.**

El primero es que es un callejón sin salida sin ninguna indicación. El único camino para armar esa
instrucción está escondido dentro de la ventana «Accesos» de una de las personas de las personas autorizadas, en un
botón que dice «Guardar y armar el documento». Quien lea este párrafo no tiene manera de deducir
eso: el texto no nombra la ventana, no nombra el botón y no dice que haya que entrar en la ficha de
alguien.

El segundo es que **describe una situación que no debería poder existir y la cuenta como si fuera
una lista vacía normal**. Hay gente anotada en las personas autorizadas —ésa es una de las tres condiciones— y no
hay ningún documento que diga qué puede hacer cada uno. Eso no es «todavía no se cargó nada»: es
que se empezó por el final.

El tercero es que no se distingue de la explicación de la sección, que está tres renglones más
arriba y también habla de la instrucción firmada. Puestos uno debajo del otro, el segundo se lee
como continuación del primero y no como un aviso.

El cuarto es que si la lista de las personas autorizadas falla al cargar, este texto no sale —porque una de sus tres
condiciones es que la lista haya cargado bien—, y la sección queda muda sobre la firma: no dice que
está ni que falta.

---

## 8. Cuando el Cliente no tiene guardias por delante

**Cómo llegar.** Menú lateral → grupo **Clientes** → **Clientes** → clic en un Cliente → bajar
hasta la sección **«Guardias activas»**, que está después de las personas autorizadas.

**Qué es eso y para qué se usa.** Es la parte de la ficha donde se ven los turnos que vienen para
los Pacientes de esa Cliente. La lista descarta lo cancelado y lo ya terminado, y muestra hasta
cincuenta turnos.

**Qué se ve en pantalla, de arriba abajo.**
- El nombre del Cliente, y las secciones anteriores.
- Título de sección: «Guardias activas»
- Debajo, la tabla de turnos, o el cartel cuando no hay ninguno.
- Más abajo, las secciones de «Historial de reportes» y «Alertas activas».

**El cartel, textual.**
Primer renglón: «No hay guardias por delante»
Segundo renglón: «Las guardias que se programen para los Pacientes de esta Cliente van a aparecer
acá.»

**Cuándo aparece.** Cuando ningún Paciente de esa Cliente tiene un turno que no esté cancelado ni
terminado.

**Qué desaparece mientras el cartel está puesto.** La tabla de turnos, con la fecha, el horario, el
Paciente, quién lo toma y en qué situación está cada uno.

**Qué queda alrededor si el cartel se saca.** El título «Guardias activas» y un blanco debajo, con
las secciones de reportes y alertas siguiendo más abajo.

**Problemas que se ven acá.** Tres.

El primero es que el encabezado de la sección dice «Guardias activas» y el cartel dice «por
delante», que no es lo mismo: un turno que está ocurriendo ahora mismo es activo y no está por
delante. Las dos palabras conviven en dos renglones seguidos sin que nada las concilie.

El segundo es que un Cliente que todavía no tiene ningún Paciente cargado recibe esta respuesta
—que no hay guardias programadas— en vez de la verdadera, que es que no hay a quién programarle
nada. Son dos situaciones distintas con el mismo cartel.

El tercero es que el segundo renglón promete de más: dice que las guardias que se programen van a
aparecer acá, y la lista muestra hasta cincuenta y descarta lo cancelado y lo terminado.

---

## 9. Cuando el Cliente no tiene reportes

**Cómo llegar.** El mismo camino: **Clientes → Clientes → un Cliente**, y bajar hasta la sección
**«Historial de reportes»**, que está justo debajo de las guardias activas.

**Qué es eso y para qué se usa.** Cada guardia deja un reporte al terminar, escrito por quien la
trabajó. Esta sección junta los de los Pacientes de esa Cliente, hasta treinta, sin rango de fechas
para elegir.

**Qué se ve en pantalla, de arriba abajo.**
- El nombre del Cliente, y las secciones anteriores.
- Título de sección: «Historial de reportes»
- Debajo, la tabla de reportes, o el cartel cuando no hay ninguno.
- Más abajo, la sección de «Alertas activas».

**El cartel, textual.**
Primer renglón: «Todavía no hay reportes»
Segundo renglón: «Cada guardia deja su reporte al terminar, y acá se ven los de los Pacientes de
esta Cliente.»

**Cuándo aparece.** Cuando ningún Paciente de esa Cliente tiene ni un reporte cargado.

**Qué desaparece mientras el cartel está puesto.** La tabla de reportes, con la fecha, el Paciente,
quién lo escribió, y la señal que dice si quedó «Sin confirmar».

**Qué queda alrededor si el cartel se saca.** El título «Historial de reportes» y un blanco debajo.

**Problemas que se ven acá.** Cuatro.

El primero es que cuenta como hecho algo que no siempre pasa: dice que «cada guardia deja su reporte
al terminar», y la propia tabla tiene una señal para los reportes que quedaron «Sin confirmar», que
existe justamente porque el reporte puede no quedar cerrado. La frase presenta como automático algo
que la misma pantalla muestra que falla.

El segundo es que tapa dos situaciones distintas con el mismo texto: que no hubo ninguna guardia
todavía, y que hubo guardias y ninguna dejó reporte. La segunda es un problema y se lee igual que la
primera.

El tercero es la misma confusión de la sección anterior: un Cliente sin Pacientes recibe este
cartel en vez de que se le diga que no tiene a quién atenderle.

El cuarto es que no nombra la pantalla de Reportes diarios, que es donde se ven todos y donde se
resuelve lo que quedó sin confirmar.

---

## 10. Cuando el Cliente no tiene alertas sin resolver

**Cómo llegar.** El mismo camino: **Clientes → Clientes → un Cliente**, y bajar del todo, hasta la
sección **«Alertas activas»**, que es la última de la ficha.

**Qué es eso y para qué se usa.** Es donde se ven las alertas abiertas de los Pacientes de esa
Cliente. No tiene tope ni filtros, a propósito: una alerta abierta no se esconde detrás de una
paginación.

**Qué se ve en pantalla, de arriba abajo.**
- El nombre del Cliente, y todas las secciones anteriores.
- Título de sección: «Alertas activas»
- Debajo, la lista de alertas, o el cartel cuando no hay ninguna.

**El cartel, textual.**
Primer renglón: «No hay alertas sin resolver»
Segundo renglón: «Acá aparecen las alertas abiertas de los Pacientes de esta Cliente. Las ya
resueltas se ven en la pantalla de Alertas.»

**Cuándo aparece.** Cuando ningún Paciente de esa Cliente tiene una alerta abierta.

**Qué desaparece mientras el cartel está puesto.** La lista de alertas, con qué pasó, sobre qué
Paciente, cuándo y en qué situación quedó cada una.

**Qué queda alrededor si el cartel se saca.** El título «Alertas activas» y un blanco al pie de la
ficha.

**Problemas que se ven acá.** Tres. **Es, de los veintiséis, el mejor escrito: el único que nombra
adónde ir a ver lo que no se muestra acá.**

El primero es que la misma cosa lleva tres nombres en cuatro renglones: el título dice «activas», el
primer renglón dice «sin resolver» y el segundo dice «abiertas». Son el mismo estado.

El segundo es que la primera mitad del segundo renglón repite lo que ya dijeron el título y el
primer renglón. Lo que aporta está en la segunda mitad.

El tercero es la misma confusión de las dos secciones anteriores con el Cliente sin Pacientes.

---

## 11. Cuando no figura nadie coordinando a esa persona

**Este cartel salió de esta revisión y pasó al plan del Servicio**, en
`docs/PLAN_EL_ACTO_DE_ARMAR_UN_SERVICIO.md`, paso 7.

Llegó acá como un cartel —«Nadie por ahora.», en la sección **«Quién coordina»** de la ventana del
equipo de un Paciente—, y la revisión mostró que lo que tiene no es un problema de redacción: el
vacío es la señal de que falta asignar quién coordina, y eso se resuelve donde el Servicio se arma.
La baja del cartel está ejecutada —la sección entera queda oculta mientras la lista está vacía—, y
**si ese ocultamiento se revierte lo decide el Desarrollador en el plan del Servicio**, no acá. Por
eso las dos claves de traducción de esa sección no se borraron.

El número 11 se conserva vacío a propósito: los carteles se nombran por su número y renumerarlos
dejaría sin sentido todo lo ya decidido sobre los demás.

---

# Cobertura → Guardias

## 12. Cuando no quedó ninguna guardia abierta de días anteriores

**Cómo llegar.** Menú lateral → grupo **Cobertura** → **Guardias**. El cartel está arriba de todo,
antes de los filtros y de la grilla de turnos, en la sección **«Guardias sin cerrar»**. Se ve ni
bien se entra a la pantalla, sin apretar nada.

**Qué es esa pantalla y para qué se usa.** Arriba de todo, en la pantalla de Guardias, hay una
franja que hace una pregunta que ninguna otra hace: qué turnos de días que ya pasaron siguen
figurando en curso porque nadie marcó la salida. Es el turno que terminó de verdad, en la casa,
pero que en el sistema quedó abierto y envejece sin que nadie lo vea, porque la grilla de abajo
mira de hoy en adelante y el tablero de estado mira apenas unos días para atrás. Esta franja mira
hacia atrás sin límite y no obedece a ningún filtro de los de abajo. Desde cada renglón se puede
cerrar el turno a mano —de a uno, escribiendo por qué, y confirmando— o avisar que alguien ya se
está ocupando de averiguar qué pasó, para que el aviso deje de llegarle a los demás mientras tanto.
El cierre a mano no inventa una hora de salida: deja el turno cerrado y anota quién lo cerró,
cuándo y que fue desde el Panel, y a propósito no escribe hora ni lugar, para que después se pueda
distinguir de una salida marcada de verdad.

**Qué se ve en pantalla, de arriba abajo.**
- Título de la pantalla: «Guardias»
- Título de sección: «Guardias sin cerrar»
- Debajo del título, el subtítulo: «Guardias de días que ya pasaron y siguen figurando en curso:
  terminaron y nadie las cerró. Aparecen todas, sin importar cuánto tiempo haya pasado.»
- Y ahí va la tabla, o el cartel cuando no hay nada.
- Más abajo, ya fuera de esta franja, la tarjeta de filtros de la pantalla de Guardias —desde,
  hasta, estado, buscador, y la casilla de ver sólo los huecos— y la grilla de turnos.

**El cartel, textual.**
Primer renglón: «No quedó ninguna guardia sin cerrar»
Segundo renglón: «Todas las guardias de días anteriores están cerradas.»

**Cuándo aparece.** Cuando ningún turno de una fecha anterior a hoy quedó figurando en curso sin
salida marcada. Es el estado sano y, en una empresa ordenada, el habitual: lo que hay que mirar es
cuando aparece algo.

**Qué desaparece mientras el cartel está puesto.** La tabla entera, con sus seis columnas: «Fecha»,
«Horario», «Asistente», «Paciente», «Abierta hace» y «Acción». Con ella se va el distintivo de cada
renglón que dice hace cuánto está abierta —«1 día», o «tantos días»—, el botón de cerrar y el botón
para avisar que alguien ya se está ocupando.

**Qué queda alrededor si el cartel se saca.** El título de la pantalla, el título de la sección y su
subtítulo largo, y debajo un blanco. Más abajo, la tarjeta de filtros y la grilla de turnos, que no
tienen nada que ver con esta franja y siguen funcionando igual.

**Problemas que se ven acá.** Dos. El primero es que el segundo renglón cuenta mal el hecho:
afirma que todas las guardias de días anteriores están cerradas, y eso no es lo que se comprobó. Lo
único que se miró son los turnos que habían arrancado y quedaron en curso; un turno de la semana
pasada que nunca empezó, o que quedó cancelado a medias, no entra en la cuenta y sin embargo
tampoco está cerrado. Quien lee esa frase se queda tranquilo sobre algo más grande de lo que
realmente se revisó. El segundo es que los dos renglones dicen la misma cosa dos veces, una en
negativo y otra en positivo, y ninguno agrega nada: el segundo renglón es el lugar donde
normalmente va qué hacer o qué va a hacer aparecer algo acá, y acá se usa para repetir.

---

## 13. Cuando hay que armar un turno y no figura ninguna persona a atender

**Cómo llegar.** Menú lateral → grupo **Cobertura** → **Guardias** → botón para crear una guardia
nueva. Se abre una ventana encima de la pantalla. El cartel está en el medio de esa ventana, en el
lugar donde iría la lista de personas para marcar. También se llega a la misma ventana desde
**Clientes → Solicitudes de Servicio → abrir una Solicitud**.

**Qué es esa pantalla y para qué se usa.** Es la ventana donde se crea un turno de trabajo. Ahí se
define todo: si es un turno suelto o uno que se repite semana a semana, quién lo toma —se puede
dejar sin nadie y asignarlo después—, a qué personas se atiende, de qué servicio contratado se
descuenta, en qué modalidad, a qué hora empieza, a qué hora termina, si termina el mismo día o uno,
dos o tres días más tarde, y en qué fecha. A quiénes se atiende es una lista para marcar y no un
desplegable, porque un mismo turno puede cubrir a varias personas: un matrimonio en su casa, o un
grupo en una residencia.

**Qué se ve en pantalla, de arriba abajo.**
- Título de la ventana: «Nueva guardia»
- Una casilla para marcar: «Es una guardia recurrente (serie)»
- El desplegable «Asistente», que arranca en «Todavía sin asignar», y debajo la aclaración «Se puede
  crear la guardia sin Asistente y asignarla después. Va a aparecer como un hueco en la grilla.»
- El rótulo «A quiénes atiende», con el asterisco que indica que es obligatorio.
- Debajo de ese rótulo va la lista de personas para marcar, o el cartel cuando no hay nadie.
- Después, siempre, la aclaración: «Hace falta marcar a todas las personas que se atienden en este
  turno. Una guardia puede cubrir a más de una: un matrimonio en su casa, o un grupo en un asilo.
  Es un solo turno, no uno por persona.»
- Y más abajo el resto del formulario: «Servicio», «Modalidad», «Hora de inicio», «Hora de fin»,
  «Termina», «Fecha», y los botones «Cancelar» y «Crear».

**El cartel, textual.**
Un solo renglón: «No hay Pacientes cargados todavía.»

**Cuándo aparece.** Cuando no figura ni una persona a atender en toda la empresa. No es que estén
filtradas ni escondidas: la ventana pide la lista completa, sin ningún recorte por zona, por cliente
ni por nada, y vuelve vacía.

**Qué desaparece mientras el cartel está puesto.** La lista para marcar entera. Cada renglón de esa
lista trae una casilla, el nombre de la persona y, abajo en letra chica, su domicilio —que está
justamente para que se note cuándo dos personas viven en la misma casa y un mismo turno las cubre a
las dos—.

**Qué queda alrededor si el cartel se saca.** Todo el formulario, entero y usable, salvo que no se va
a poder terminar: el rótulo «A quiénes atiende» con su asterisco, un blanco, y debajo la aclaración
larga de que hace falta marcar a todas las personas que se atienden. El desplegable de servicio
queda vacío, porque qué servicios se pueden ofrecer depende de a quién se atiende. Y el botón
«Crear» queda apagado, porque exige un servicio elegido.

**Problemas que se ven acá.** Dos. El primero es que el cartel deja a quien lo lee en un callejón
sin salida y no lo dice: no ofrece ninguna forma de cargar a la primera persona ni indica dónde se
hace, y el formulario sigue ahí, aparentemente lleno de cosas para completar, cuando en realidad no
hay manera de llegar al final. La aclaración que va justo debajo —«Hace falta marcar a todas las
personas que se atienden en este turno»— pide algo imposible en ese momento y no se calla nunca. El
segundo es que el cartel cuenta mal el hecho cuando dice «todavía»: la lista deja afuera a las
personas dadas de baja, así que una empresa que tuvo Pacientes y cerró la atención de todos ellos va
a leer que no cargó ninguno todavía, que es exactamente lo contrario de lo que pasó.

---

# Cumplimiento → Pase de guardia

## 14. Cuando nadie está esperando que le suelten un código de llegada

**Cómo llegar.** Menú lateral → grupo **Cumplimiento** → **Pase de guardia**. El cartel está en la
mitad de arriba de la pantalla, en la sección **«Esperando un código»**. Se ve ni bien se entra.
En el menú, este enlace lleva al lado un contador con cuánta gente está esperando: cuando ese
contador está en cero, adentro se ve este cartel.

**Qué es esa pantalla y para qué se usa.** Es la pantalla donde se atiende lo que el sistema de
llegadas y salidas no pudo resolver solo. Al llegar a la casa y al irse, quien trabaja lee con el
teléfono un código que le muestra alguien de la casa; eso es lo que deja constancia de que estuvo.
Cuando no hay nadie que pueda mostrarle ese código, queda parado en la puerta y pide uno desde su
teléfono, escribiendo con sus palabras qué está pasando. Esa solicitud cae acá, en la lista de
arriba, que se refresca sola. Quien está de turno averigua como la empresa acostumbre —un llamado a
la casa, una videollamada, lo que corresponda— y recién ahí le suelta el código. El código se
muestra una sola vez y nunca más: de lo guardado queda el rastro, no el número, así que hay que
dictárselo en ese mismo momento. Si se perdió, se suelta otro y el anterior deja de valer. Abajo,
en otra lista aparte, está lo que ya ocurrió sin poder comprobarse.

**Qué se ve en pantalla, de arriba abajo.**
- Título de la pantalla: «Pase de guardia»
- Debajo, la explicación general: «Al llegar y al irse, el Asistente lee un código que le muestra en
  su teléfono quien está en la casa. Acá se atiende lo que esa lectura no pudo resolver sola.»
- Título de sección: «Esperando un código»
- Debajo, la explicación de la sección: «El Asistente llegó al domicilio y no tiene a quién pedirle
  el código. Averigüe como su Prestadora acostumbre —un llamado a la casa, una videollamada, lo que
  corresponda— y recién entonces suelte el código.»
- Y ahí van las tarjetas de quienes están esperando, o el cartel cuando no hay nadie.
- Más abajo, la otra sección: «Llegadas y salidas sin comprobar», con su propia explicación y su
  propia lista.

**El cartel, textual.**
Primer renglón: «No hay nadie esperando un código»
Segundo renglón: «Cuando un Asistente pida uno, va a aparecer acá solo.»

**Cuándo aparece.** Cuando nadie pidió un código y quedó sin respuesta. Es el estado normal: la
lista existe justamente para los ratos en que alguien está parado en una puerta, y el resto del
tiempo está vacía.

**Qué desaparece mientras el cartel está puesto.** Las tarjetas de quienes esperan, con todo lo que
traen adentro: el nombre de la persona, un distintivo que dice si es una «Llegada» o una «Salida»,
la fecha y el horario del turno, el renglón «Pidió a las» con la hora exacta, lo que esa persona
escribió —o la frase «No escribió nada.» cuando no escribió—, el aviso «Ya se soltó un código a las
tal hora. Si suelta otro, el anterior deja de valer.» cuando corresponde, y el botón «Soltar el
código». Desaparece también el lugar donde se muestra el código una vez soltado, con su aclaración
de cuántos minutos vale y con la advertencia «Dígaselo ahora: esta pantalla no lo va a poder volver
a mostrar.»

**Qué queda alrededor si el cartel se saca.** El título de la pantalla con su explicación, el título
de la sección con su explicación, y debajo un blanco. Más abajo, entera, la segunda sección de
llegadas y salidas sin comprobar.

**Problemas que se ven acá.** Dos. El primero es que la palabra «solo» del segundo renglón se lee de
dos maneras opuestas y nada la desambigua: puede entenderse como que la solicitud va a aparecer por
sí misma, sin que nadie recargue la pantalla —que es lo que efectivamente pasa—, o como que va a
aparecer solamente acá y en ningún otro lado. Es el dato importante de esa frase y queda librado a
la suerte. El segundo es que la explicación de la sección queda puesta arriba del cartel y está
escrita como una orden a cumplir ahora —averigüe, y recién entonces suelte el código—, cuando abajo
dice que no hay nadie a quien atender. Las dos frases juntas se leen mal.

---

## 15. Cuando no quedó ninguna llegada o salida pendiente de revisar

**Cómo llegar.** Menú lateral → grupo **Cumplimiento** → **Pase de guardia**, y bajar hasta la
segunda mitad de la pantalla: la sección **«Llegadas y salidas sin comprobar»**. Es la misma
pantalla del cartel anterior, otra sección.

**Qué es esa pantalla y para qué se usa.** Es la segunda lista de la misma pantalla de pases, y tiene
el ritmo contrario a la de arriba. Acá no hay nadie esperando: son llegadas y salidas que ya
ocurrieron sin que se pudiera comprobar el código. La regla es que el trabajo nunca se traba por
esto, así que la persona entró igual y dejó dicho por qué —no había nadie que pudiera mostrar el
código, pidió a la empresa y no le contestaron, el teléfono no pudo usar la cámara, el teléfono
estaba sin conexión, u otro motivo—. Como ya pasó, no hay nada que apurar: queda en la lista hasta
que alguien la mire y la cierre. Cerrar no es aprobar ni rechazar, es dejar dicho que alguien la
miró; lo que se haya averiguado va en una nota opcional, y la fila queda con quién la cerró y
cuándo. No existe botón de rechazar porque la llegada ya ocurrió y negarla después no la borra.

**Qué se ve en pantalla, de arriba abajo.**
- Título de la pantalla: «Pase de guardia»
- Debajo, la explicación general: «Al llegar y al irse, el Asistente lee un código que le muestra en
  su teléfono quien está en la casa. Acá se atiende lo que esa lectura no pudo resolver sola.»
- Arriba de todo, la sección «Esperando un código», con su explicación y su lista.
- Título de esta sección: «Llegadas y salidas sin comprobar»
- Debajo, la explicación de la sección: «La guardia nunca se traba: cuando no se pudo comprobar el
  pase, el Asistente entró igual y dejó dicho por qué. Ya ocurrió, así que acá no hay nada que
  apurar; queda en la lista hasta que alguien la mire y la cierre.»
- Y ahí van las tarjetas, o el cartel cuando no hay nada.

**El cartel, textual.**
Primer renglón: «No quedó ninguna sin comprobar»
Segundo renglón: «Todas las llegadas y salidas se pudieron comprobar en el momento.»

**Cuándo aparece.** Cuando ninguna llegada o salida sin comprobar quedó abierta: o porque no hubo
ninguna, o porque las que hubo ya fueron miradas y cerradas por alguien. La lista muestra solamente
lo que sigue pendiente de revisión; lo cerrado sale de ella.

**Qué desaparece mientras el cartel está puesto.** Las tarjetas, con el nombre de la persona, el
distintivo que dice si fue una «Llegada» o una «Salida», la fecha y el horario del turno, el renglón
«Ocurrió a las» con la hora, el renglón «Motivo» con el motivo elegido escrito en palabras, el
detalle que esa persona haya dejado escrito, y el botón «Cerrar» que abre la ventana «Cerrar la
revisión» con su casillero «Nota (opcional)».

**Qué queda alrededor si el cartel se saca.** Toda la mitad de arriba de la pantalla, intacta, con la
lista de quienes esperan un código. Y de esta sección, el título y su explicación, con un blanco
debajo.

**Problemas que se ven acá.** Dos. El primero, y es el más serio, es que el segundo renglón afirma un
hecho falso en el caso más común. Dice que todas las llegadas y salidas se pudieron comprobar en el
momento, y lo dice también cuando pasó exactamente lo contrario: hubo varias que no se pudieron
comprobar, y están todas cerradas porque alguien ya las miró. La lista se vacía por las dos razones
y el cartel sólo cuenta una. Leído tal cual, borra de la vista un problema que sí existió. El
segundo es que el primer renglón nunca dice ninguna qué: «No quedó ninguna sin comprobar», suelto,
no nombra el sujeto, y hay que subir hasta el título de la sección para saber que se está hablando
de llegadas y salidas.

---

# Cumplimiento → Medicación

## 16. Cuando no hay ninguna indicación de medicación esperando revisión

**Cómo llegar.** Menú lateral → grupo **Cumplimiento** → **Medicación**. El cartel ocupa
prácticamente toda la pantalla: se ve ni bien se entra, sin apretar nada. Este enlace del menú sólo
aparece con la modalidad de prestación directa.

**Qué es esa pantalla y para qué se usa.** Es donde se revisan, una por una, las indicaciones de
medicación que pidieron los clientes. De cada una se ve la persona a la que corresponde, el
medicamento, la dosis, la frecuencia, por qué vía se administra, desde y hasta cuándo rige, y —si la
adjuntaron— la receta, que se abre aparte. Sobre cada indicación se toman dos decisiones posibles:
aceptarla, o rechazarla escribiendo el motivo. Cuando ninguna de las personas asignadas a ese
Paciente tiene hoy la matrícula que esa vía exige, se avisa antes de aceptar, pero no se bloquea: el
aviso advierte del riesgo y la decisión sigue siendo de quien la toma. Aceptada o rechazada, la
indicación sale de esta lista.

**Qué se ve en pantalla, de arriba abajo.**
- Título de la pantalla: «Medicación»
- Debajo, la explicación: «Indicaciones de medicación solicitadas por los Clientes, pendientes de
  revisión. Aceptar no bloquea aunque ningún Asistente asignado tenga la matrícula requerida — solo
  advierte del riesgo.»
- Y ahí va la lista de tarjetas, o el cartel cuando no hay nada.

**El cartel, textual.**
Primer renglón: «No hay indicaciones pendientes de revisión.»
Segundo renglón: «Cuando se cargue el primer registro va a aparecer en esta lista.»

Ese segundo renglón no lo escribe esta pantalla. Esta pantalla aporta únicamente el primero; el
segundo es el texto de fábrica que traen todas las listas del sistema cuando ninguna otra cosa lo
reemplaza, y acá cae tal cual, sin adaptarse.

**Cuándo aparece.** Cuando ninguna indicación quedó pendiente de revisar: o porque no llegó ninguna,
o porque todas las que llegaron ya fueron aceptadas o rechazadas. Es el estado normal y el deseable.

**Qué desaparece mientras el cartel está puesto.** Las tarjetas de cada indicación, con el nombre de
la persona en negrita, el medicamento, la dosis, la frecuencia y la vía; el renglón de «Desde» y
«Hasta»; el botón «Ver prescripción» cuando hay receta adjunta; el aviso «Ningún Asistente asignado
a este Paciente tiene hoy la matrícula requerida para esta vía.» cuando corresponde; y los botones
«Aceptar» y «Rechazar», con el casillero «Motivo del rechazo» y el botón «Confirmar rechazo» que
aparecen al elegir rechazar.

**Qué queda alrededor si el cartel se saca.** Muy poco: el título de la pantalla y su explicación, y
debajo un blanco. Esta pantalla no tiene filtros, ni buscador, ni ninguna otra sección. Vacía, queda
prácticamente en blanco.

**Problemas que se ven acá.** Dos, y los dos vienen del segundo renglón heredado. Uno es que cuenta
mal el hecho: dice que va a aparecer algo cuando «se cargue el primer registro», y acá nadie carga
nada desde adentro; lo que hace aparecer una fila es que un cliente pida una indicación desde su
aplicación, que es algo que pasa afuera de esta pantalla y no se nombra. El otro es que ese renglón
está escrito para listas donde el vacío significa que falta empezar a cargar cosas, y acá el vacío
significa justamente lo contrario: que no quedó nada por revisar, que es la buena noticia. Además
dice «el primer registro» como si nunca hubiera habido ninguna, cuando lo más probable es que
hubiera muchas y ya estén todas resueltas.

---

# Plantel → Plantel de Asistentes → una persona

## 17. Cuando esa persona no tiene guardias trabajadas

**Cómo llegar.** Menú lateral → grupo **Plantel** → **Plantel de Asistentes** → clic en una persona
→ solapa **«Guardias trabajadas»**.

**Qué es esa pantalla y para qué se usa.** Es la solapa de la ficha donde se ve el historial de
turnos de esa persona: hasta cincuenta, con la fecha, el horario, a quién atendió, su llegada y su
salida, y en qué situación quedó cada turno.

**Qué se ve en pantalla, de arriba abajo.**
- El nombre de la persona, arriba, y la fila de solapas de su ficha.
- La solapa «Guardias trabajadas» abierta.
- La tabla de turnos, con las columnas «Fecha», «Horario», «Paciente», «Llegada y salida» y
  «Situación», o el cartel cuando no hay ninguno.
- Cuando hay filas, un renglón al pie que manda a la pantalla de Guardias a ver el resto.

**El cartel, textual.**
Primer renglón: «Todavía no trabajó ninguna guardia.»
Segundo renglón: «Cuando termine su primer turno va a aparecer acá.»

**Cuándo aparece.** Cuando esa persona no tiene ni un turno en la lista.

**Qué desaparece mientras el cartel está puesto.** La tabla entera con sus cinco columnas, y el
renglón del pie que manda a la pantalla de Guardias.

**Qué queda alrededor si el cartel se saca.** El nombre, las solapas, y un blanco adentro de la
solapa abierta.

**Problemas que se ven acá.** Tres.

El primero es que el título afirma más de lo que se comprobó: dice que no trabajó ninguna guardia, y
lo que se miró es una lista con tope de cincuenta de esta pantalla. La frase habla de la vida
laboral de esa persona; el dato habla de una consulta.

El segundo es que el segundo renglón promete mal. Dice que va a aparecer cuando termine su primer
turno, y un turno entra en esta lista apenas existe, todavía en situación «Programada», sin que haya
terminado ni empezado nada.

El tercero es que es un callejón sin salida justo cuando más falta hace: el renglón que manda a la
pantalla de Guardias sólo sale cuando hay filas, así que la persona que no tiene ninguna es
exactamente la que no recibe la indicación de adónde ir a asignarle una.

---

## 18. Cuando ningún tipo de Asistente exige matrícula

**Cómo llegar.** Menú lateral → grupo **Plantel** → **Plantel de Asistentes** → clic en una persona
→ solapa **«Matrículas»**. El texto está en el lugar de la lista de matrículas.

**Qué es esa pantalla y para qué se usa.** Es la solapa donde se cargan las matrículas de esa
persona: qué la habilita a ejercer, con qué número y hasta cuándo. Qué matrícula hace falta no lo
decide esta solapa: sale de los tipos de Asistente configurados en Configuración.

**Qué se ve en pantalla, de arriba abajo.**
- El nombre de la persona y la fila de solapas.
- Arriba, cuando corresponde, la franja «No puede tomar guardias — No tiene matrícula cargada», que
  manda a esta misma solapa.
- La solapa «Matrículas» abierta.
- La lista de matrículas cargadas, o este párrafo.
- El botón «Agregar matrícula», que en esta situación está apagado.

**El texto, textual.**
Un párrafo: «Todavía no hay ningún tipo de Asistente que exija matrícula. Se configuran en
Configuración → Tipos de Asistente.»

**Cuándo aparece.** Cuando ningún tipo de Asistente configurado exige matrícula.

**Qué desaparece mientras el texto está puesto.** La lista de matrículas de esa persona, con cada
matrícula, su número y su vencimiento.

**Qué queda alrededor si el texto se saca.** El nombre, las solapas, el botón «Agregar matrícula»
apagado sin ninguna explicación de por qué, y —si corresponde— la franja de arriba diciendo que no
puede tomar guardias.

**Problemas que se ven acá.** Cuatro.

El primero, y es el peor: **hay dos textos contradictorios a la vista al mismo tiempo**. Arriba, la
franja dice «No puede tomar guardias — No tiene matrícula cargada», y abajo, en el mismo momento, el
párrafo dice que ningún tipo exige matrícula. Las dos cosas no pueden ser ciertas juntas.

El segundo es que es un callejón sin salida, y peor todavía porque la franja de arriba manda
justamente acá a resolver algo que acá no se puede resolver.

El tercero es que cuenta mal el hecho: dice que ningún tipo exige matrícula, y eso no es lo que se
miró. Un tipo que sí la exige pero está de baja, o uno que la exige sin indicar cuál, deja la cuenta
en cero igual.

El cuarto es que es una explicación puesta debajo de un control, en el lugar de una lista.

---

## 19. Cuando esa persona no recibió ninguna evaluación

**Cómo llegar.** Menú lateral → grupo **Plantel** → **Plantel de Asistentes** → clic en una persona
→ solapa **«Evaluaciones recibidas»**. Esta solapa sólo existe con la modalidad de Match.

**Qué es esa pantalla y para qué se usa.** Es donde se ven las evaluaciones que los Clientes
hicieron sobre esa persona.

**Qué se ve en pantalla, de arriba abajo.**
- El nombre de la persona y la fila de solapas.
- La solapa «Evaluaciones recibidas» abierta.
- La lista de evaluaciones, o el cartel cuando no hay ninguna.
- Cuando hay evaluaciones, un renglón al pie que manda a la pantalla de Calificaciones y descargos.

**El cartel, textual.**
Primer renglón: «Todavía no recibió ninguna evaluación.»
Segundo renglón: «Cuando un Cliente lo evalúe va a aparecer acá.»

**Cuándo aparece.** Cuando esa persona no tiene ni una evaluación.

**Qué desaparece mientras el cartel está puesto.** La lista de evaluaciones y el renglón del pie que
manda a Calificaciones y descargos.

**Qué queda alrededor si el cartel se saca.** El nombre, las solapas, y un blanco adentro de la
solapa.

**Problemas que se ven acá.** Cuatro.

El primero es que el renglón que manda a Calificaciones y descargos se va justo cuando más falta
hace: sale solamente cuando hay evaluaciones, así que quien no tiene ninguna no se entera de que esa
pantalla existe.

El segundo es que «lo evalúe» pone en masculino a una persona de la que no se sabe el género. En el
resto de las pantallas del Panel esto se resuelve sin marcarlo.

El tercero es que las dos frases dicen lo mismo: que no hay evaluaciones y que cuando haya van a
estar. El segundo renglón no agrega nada.

El cuarto es menor y es de forma: este título termina en punto, y los títulos de los demás carteles
del Panel no llevan punto.

---

# Plantel → Postulaciones (y Clientes → Solicitudes de Servicio)

Los dos carteles que siguen son del mismo mapa, que se ve en dos lugares distintos del Panel.

## 20. Mapa del plantel — cuando no hay nadie en el plantel

**Cómo llegar.** Por cualquiera de estos dos caminos:
- Menú lateral → grupo **Plantel** → **Postulaciones**, y bajar hasta la sección **«Mapa del plantel
  por zona»**.
- Menú lateral → grupo **Clientes** → **Solicitudes de Servicio** → abrir una Solicitud, y bajar
  hasta la misma sección dentro de esa ventana.

En los dos lugares es exactamente el mismo mapa y el mismo cartel.

**Qué es esa pantalla y para qué se usa.** Es un mapa que muestra dónde vive la gente que hoy está
trabajando en la Prestadora, agrupada por zona de cobertura. Se usa en dos lugares: en la pantalla de
postulaciones, para mirar cómo está repartido el plantel antes de sumar gente nueva, y adentro de la
ventana de una Solicitud de Servicio, para ver quién queda cerca del lugar que pidió el servicio. Cada
persona aparece como un puntito; el punto se dibuja únicamente si esa ficha tiene una ubicación
cargada. Nunca se muestra ninguna dirección escrita, sólo el punto.

**Qué se ve en pantalla, de arriba abajo.**
- En la pantalla de postulaciones: título de la pantalla, «Postulaciones de Asistentes».
- En la ventana de una Solicitud: título de sección, «Asistentes sugeridos», y debajo su explicación,
  «Ordenados por zona, especialidad y disponibilidad, cruzando lo que dice esta Solicitud con lo
  cargado de cada Asistente. Es una sugerencia: la elección es de quien atiende la Solicitud.»
- Título de sección del mapa, en los dos casos: «Mapa del plantel por zona»
- Debajo va todo el mapa —la cuenta, los botones de zona, el dibujo y la lista de nombres—, o el
  cartel cuando no hay nada que dibujar.

**El cartel, textual.**
Primer renglón: «No hay nadie en el plantel activo.»
Segundo renglón: «No hay nadie en el plantel activo.»

Los dos renglones dicen lo mismo, palabra por palabra. No es un error de transcripción: la pantalla
está pidiendo el mismo texto para el título del cartel y para el renglón de ayuda.

**Cuándo aparece.** Cuando no hay ni una sola persona en el plantel activo. Es el estado de una
Prestadora que recién empieza, o de una que dio de baja a todo el mundo.

**Qué desaparece mientras el cartel está puesto.** El mapa entero y todo lo que lo rodea: el renglón
que dice cuántas personas se pudieron ubicar sobre el total, los botones para elegir zona —el de
«Todos», con la cantidad entre paréntesis, y uno por cada zona de cobertura, también con su
cantidad—, el dibujo del mapa con sus puntos, la lista escrita con el nombre de cada persona y sus
zonas, y el renglón final que avisa cuántas fichas quedaron sin ubicación cargada.

**Qué queda alrededor si el cartel se saca.** El título de la pantalla o de la sección que
corresponda, el título «Mapa del plantel por zona», y debajo un blanco. En la ventana de una
Solicitud, más abajo sigue estando la lista de Asistentes sugeridos, que es otra lista aparte y tiene
su propio cartel.

**Problemas que se ven acá.** El texto está repetido: se lee dos veces seguidas la misma frase, una
como título del cartel y otra como renglón de ayuda. Y donde tendría que estar el segundo renglón —el
que explica qué hacer o qué esperar— no hay nada: el texto que existe para eso, «Las fichas con el
domicilio ubicado aparecen acá.», nunca se llega a mostrar en esta situación.

---

## 21. Mapa del plantel — cuando hay plantel pero ninguna ubicación cargada

**Cómo llegar.** El mismo camino que el cartel anterior: **Plantel → Postulaciones**, o **Clientes →
Solicitudes de Servicio → abrir una Solicitud**, y bajar hasta **«Mapa del plantel por zona»**. La
diferencia con el caso anterior no es el camino sino la situación: acá sí hay gente trabajando.

**Qué es esa pantalla y para qué se usa.** Es el mismo mapa descrito arriba: dónde vive la gente del
plantel activo, agrupada por zona. La diferencia con el caso anterior es la situación: acá sí hay
gente trabajando, pero de ninguna de esas personas se cargó una ubicación, así que no hay ni un punto
que dibujar. La decisión deliberada es no mostrar un mapa mudo, porque un mapa vacío se lee como un
mapa roto.

**Qué se ve en pantalla, de arriba abajo.**
- En la pantalla de postulaciones: título de la pantalla, «Postulaciones de Asistentes».
- En la ventana de una Solicitud: título de sección, «Asistentes sugeridos», y su explicación,
  «Ordenados por zona, especialidad y disponibilidad, cruzando lo que dice esta Solicitud con lo
  cargado de cada Asistente. Es una sugerencia: la elección es de quien atiende la Solicitud.»
- Título de sección del mapa: «Mapa del plantel por zona»
- Debajo, el cartel, en el lugar donde iría el mapa.

**El cartel, textual.**
Primer renglón: «Todavía no hay ninguna ubicación para mostrar.»
Segundo renglón: «Las fichas con el domicilio ubicado aparecen acá.»

**Cuándo aparece.** Cuando hay al menos una persona en el plantel activo y ninguna de ellas tiene
ubicación cargada. También aparece cuando las ubicaciones que hay cargadas no sirven: un par de
números fuera del rango posible, o el punto exacto cero-cero, que no es una ubicación sino una
casilla que quedó vacía, se descartan y no cuentan como ubicación.

**Qué desaparece mientras el cartel está puesto.** Lo mismo que en el caso anterior: el renglón de
cuántos se pudieron ubicar sobre el total, los botones de zona con sus cantidades, el dibujo del
mapa, la lista escrita de nombres y el renglón que avisa cuántos quedaron sin ubicar.

**Qué queda alrededor si el cartel se saca.** El título de la pantalla o de la sección, el título
«Mapa del plantel por zona», y debajo un blanco. En la ventana de una Solicitud, más abajo sigue la
lista de Asistentes sugeridos.

**Problemas que se ven acá.** El cartel esconde justamente el dato que más falta hace: cuántas
personas hay en el plantel. Se sabe que no hay ubicaciones, pero no se sabe si son tres personas sin
ubicar o cuarenta, porque el renglón que dice esa cuenta desaparece junto con el mapa. El texto del
segundo renglón habla de «fichas» y de «domicilio ubicado», dos palabras que no aparecen en ningún
otro lado de esta pantalla —el resto habla de personas y de zonas—, y no dice dónde se carga esa
ubicación, así que leído solo no se sabe adónde ir a resolverlo. Y hay una situación parecida que no
muestra ningún cartel: si se elige una zona que no tiene a nadie ubicado, el dibujo del mapa queda
sin puntos y no aparece ninguna explicación, porque el cartel sólo mira el total del plantel y no la
zona elegida.

---

# Ajustes → Prestadoras

## 22. Correo enviado — cuando no salió ningún correo

**Cómo llegar.** Menú lateral → grupo **Ajustes** → **Prestadoras** → sección **«Correo enviado»**,
que está arriba del listado de Prestadoras. **Este enlace del menú sólo lo ve el soporte técnico.**
El administrador de una Prestadora no tiene esta pantalla.

**Qué es esa pantalla y para qué se usa.** En la pantalla de Prestadoras, además del listado, hay un
recuadro que lleva la cuenta del correo que salió. Todo el correo de todas las Prestadoras sale por
un mismo servicio contratado, que tiene un tope por día y un tope por mes; pasado ese tope, los
mensajes dejan de salir. El recuadro está ahí para que quien administra la plataforma vea a tiempo
cuánto margen queda antes de quedarse sin envíos. Se carga por separado del listado a propósito: si
esta cuenta falla, el listado tiene que seguir apareciendo igual.

**Qué se ve en pantalla, de arriba abajo.**
- Título de la pantalla: «Prestadoras»
- Título de sección: «Correo enviado»
- Explicación de la sección: «El correo de todas las Prestadoras sale por un mismo servicio, con un
  tope por día y por mes. Pasado ese tope, los mensajes no salen.»
- Debajo va el aviso de tope alcanzado, cuando corresponde, y una tabla chiquita de dos renglones
  —«Hoy» y «Este mes»—, o el cartel cuando no hay nada.
- Más abajo, el listado de Prestadoras propiamente dicho, que es otra cosa aparte.

**El cartel, textual.**
Primer renglón: «Todavía no salió ningún correo.»
Segundo renglón: «Cuando salga el primero, la cuenta del día y la del mes aparecen acá.»

**Cuándo aparece.** Cuando la cuenta del mes da cero. Es la situación de una plataforma recién
arrancada, o de los primeros minutos de un mes nuevo antes del primer envío.

**Qué desaparece mientras el cartel está puesto.** La tabla de dos renglones con la cuenta de hoy y la
del mes, cada una acompañada de su tope —«tantos de tantos», o «tantos, sin límite cargado» cuando no
hay tope cargado— y, si estuviera dado el caso, el aviso en rojo que dice «Se alcanzó el límite. Los
mensajes que se manden ahora pueden no salir.»

**Qué queda alrededor si el cartel se saca.** El título de la pantalla, el título «Correo enviado» y
su explicación, y debajo un blanco. Más abajo, el listado de Prestadoras, que sigue funcionando.

**Problemas que se ven acá.** El texto cuenta mal el hecho. Dice «Todavía no salió ningún correo»,
pero lo único que se mira para decidir si aparece el cartel es la cuenta de este mes. Un primero de
mes a la mañana, con miles de correos enviados el mes anterior, el cartel va a decir igual que todavía
no salió ninguno. Y el segundo renglón dice que las cuentas «aparecen acá» cuando salga el primero,
como si antes no existieran: existen, valen cero, y lo que las esconde es esta misma decisión de tapar
la tabla. Además, tapar la tabla tapa también los topes, que es la única parte del Panel donde se ven
cuáles son.

---

# Ajustes → Auditoría

## 23. Cuando no hay sesión de soporte técnico abierta

**Cómo llegar.** Menú lateral → grupo **Ajustes** → **Auditoría**. El cartel está en la primera
tabla de la pantalla. **Sólo aparece si quien está mirando es del soporte técnico**: el
administrador de una Prestadora, en la misma pantalla y en el mismo lugar, ve el cartel genérico.

**Qué es esa pantalla y para qué se usa.** Es el registro de lo que hizo el soporte técnico: cuándo
entró, cuándo renovó, cuándo salió y qué tocó. La pantalla llega a una sola Organización por vez, la
que tiene una sesión de soporte técnico abierta; cuando no hay ninguna abierta, llega únicamente a la
Organización de pruebas. Quien quiera leer el registro de una Prestadora concreta tiene que abrir
primero la sesión de soporte sobre ella. La pantalla no elige el alcance: lo decide el sistema del
otro lado.

**Qué se ve en pantalla, de arriba abajo.**
- Título de la pantalla: «Auditoría»
- Cuando quien mira es del soporte técnico, un párrafo de alcance: «Esta pantalla llega a una sola
  Organización por vez: aquella sobre la que hay una sesión de soporte técnico abierta y, si no hay
  ninguna, la Organización de pruebas. Para ver el registro de otra Prestadora hay que abrir la
  sesión de soporte sobre ella.»
- Debajo va la tabla del registro, con cuatro columnas —Fecha y hora, Quién, Prestadora, Evento—, o
  el cartel cuando no hay nada.
- Más abajo, otro título de sección, «Registro de actividad», con una segunda tabla completamente
  aparte, de cuatro columnas —Fecha y hora, Quién, Acción, Qué cambió—, que tiene su propia carga y
  su propio cartel genérico.

**El cartel, textual.**
Primer renglón: «No hay ninguna sesión de soporte técnico abierta»
Segundo renglón: «Sin una sesión abierta, esta pantalla alcanza únicamente la Organización de
pruebas. Para ver el registro de una Prestadora hay que abrir la sesión de soporte sobre ella, desde
la pantalla de Prestadoras.»

**Cuándo aparece.** Con dos condiciones a la vez: que quien está mirando sea del soporte técnico y
que no tenga ninguna sesión de soporte abierta, y además que la lista haya vuelto sin ni un renglón.
Si hay sesión abierta, o si quien mira no es del soporte técnico, la lista vacía muestra el cartel
genérico del Panel, que dice «Todavía no hay nada acá» y «Cuando se cargue el primer registro va a
aparecer en esta lista.»

**Qué desaparece mientras el cartel está puesto.** La tabla entera del registro, con sus cuatro
columnas: la fecha y la hora, quién lo hizo, sobre qué Prestadora y la descripción del evento
—entrada, renovación, salida por decisión propia, salida por llegar al tope de tiempo, salida por
quedarse quieto, o un cambio hecho sobre los datos—.

**Qué queda alrededor si el cartel se saca.** El título de la pantalla, el párrafo de alcance, y
debajo un blanco. Más abajo, el título «Registro de actividad» y su tabla, que se carga por su cuenta
y no se ve afectada.

**Problemas que se ven acá.** El cartel repite casi entero lo que ya dice el párrafo de alcance que
está tres renglones más arriba: las dos veces se explica que sin sesión abierta sólo se alcanza la
Organización de pruebas y que hay que abrir la sesión sobre la Prestadora. Quien lee esa pantalla lo
lee dos veces seguidas. Y el primer renglón no habla de la lista sino de la sesión: puesto donde
está, en el lugar donde iría la tabla, se puede leer como que la pantalla no funciona, cuando en
realidad lo que pasó es que la Organización de pruebas no tiene ningún movimiento registrado. Son dos
hechos distintos —no hay sesión abierta, y además no hay movimientos— y el cartel sólo nombra el
primero.

Aparte de eso, esta pantalla le nombra al usuario la sesión de soporte técnico y la Organización de
pruebas, dos cosas que por regla la Prestadora no ve ni sabe que existen. Eso ya está informado como
asunto aparte.

---

# Ajustes → Configuración → Listas de opciones

## 24. El aviso de que una lista no admite opciones propias

**Cómo llegar.** Menú lateral → grupo **Ajustes** → **Configuración** → solapa **«Listas de
opciones»** → elegir en el desplegable una lista que no admita agregados. El aviso está al pie del
bloque, debajo de la tabla, en el lugar donde en las otras listas aparece el bloque para agregar una
opción propia.

**Qué es ese texto.** No es un cartel de lista vacía ni el valor de ningún campo: es un aviso que
explica por qué no hay nada para hacer ahí. Ocupa exactamente el lugar donde, en las demás listas, va
el bloque para agregar una opción propia.

**Qué es esa pantalla y para qué se usa.** Es la pantalla, dentro de Configuración, donde se miran y
se editan todas las listas de opciones del sistema en un solo lugar. Cada lista trae dos capas: las
opciones que vienen con el producto, iguales para todas las Prestadoras, que se ven pero no se tocan,
y las que agregó esta Prestadora, que son suyas por completo. Algunas listas admiten opciones propias
y otras no, y eso no lo decide esta pantalla: lo impone el sistema, y acá lo único que se hace es no
ofrecer un botón que iba a volver rechazado. Ninguna opción se borra nunca: se apaga, para que lo que
ya se eligió con ella siga teniendo nombre.

**Qué se ve en pantalla, de arriba abajo.**
- Título de la pantalla: «Configuración», con la solapa «Listas de opciones».
- Título de sección: «Las listas de opciones»
- Explicación de la sección: «Cada lista trae las opciones del producto, iguales para todas, y las
  que agregue esta Prestadora. Lo que agrega ella se ofrece detrás de las del producto.»
- Un desplegable rotulado «Lista», para elegir cuál se está mirando.
- La tabla de opciones de esa lista, con cuatro columnas: «Opción», «Origen», «Se ofrece» y una
  última sin nombre para los botones. La columna de origen dice «Del producto» o «De la Prestadora»,
  y la de ofrecerse dice sí o no.
- Al pie: o el bloque para agregar una opción propia, o —en las listas cerradas— este aviso.

**El texto, textual.**
«Esta lista es la que trae el producto y no admite opciones propias.»

**Cuándo aparece.** Cada vez que se elige en el desplegable una lista marcada como que no admite
opciones propias. Aparece siempre que esa lista esté seleccionada, tenga opciones o no.

**Qué desaparece mientras el aviso está puesto.** El subtítulo «Agregar una opción propia», el
casillero «Texto de la opción» y el botón «Agregar». La tabla de opciones sigue ahí, y los botones de
corregir, «Dejar de ofrecer» y «Volver a ofrecer» tampoco están, pero no por este aviso: esos botones
sólo existen en los renglones de opciones cargadas por la Prestadora, y en una lista cerrada no hay
ninguno de esos renglones.

**Qué queda alrededor si el aviso se saca.** El título de la pantalla, el título de sección, la
explicación, el desplegable para elegir lista y la tabla de opciones. Al pie, un blanco, y nada que
explique por qué en esta lista no se puede agregar nada cuando en la de al lado sí.

**Problemas que se ven acá.** El texto cuenta mal el hecho en su primera mitad. Dice «Esta lista es la
que trae el producto», pero todas las listas las trae el producto: la explicación que está arriba, en
la misma pantalla, dice que cada lista trae las opciones del producto y además las que agregue la
Prestadora. Lo que distingue a ésta no es venir del producto, es no admitir agregados. Leído tal cual,
sugiere que las otras listas no vienen del producto, que es falso. Además, no dice de quién depende
eso ni a quién pedírselo: queda como una puerta cerrada sin llave conocida.

---

# Ajustes → Configuración → Asistentes

## 25. El renglón que se muestra cuando no hay ninguna vía prohibida

**Cómo llegar.** Menú lateral → grupo **Ajustes** → **Configuración** → solapa **«Asistentes»** →
elegir un tipo de Asistente → bajar hasta el final del bloque de tareas, a la sección **«Además, no
puede administrar estas vías»**.

**Qué es ese texto.** No es un cartel de lista vacía ni un aviso de que falte configurar algo: es el
valor que se muestra en lugar de una lista, cuando esa lista no tiene ningún elemento. Ocupa el lugar
exacto donde, si hubiera prohibiciones, iría la enumeración de las vías prohibidas.

**Qué es esa pantalla y para qué se usa.** Dentro de Configuración, en la sección de Asistentes, está
la pantalla de tipos de Asistente. Ahí conviven tres cosas distintas que conviene no confundir: el
tipo, que es qué es esa persona —cuidador, enfermero—; las tareas, que son qué hace y qué no hace; y
la matrícula, que es qué la autoriza a ejercer. Al elegir un tipo se abren sus dos listas de tareas,
separadas a propósito: lo que le corresponde y lo que no le corresponde. La segunda existe para que
el Cliente no le pida al Asistente cosas que no son suyas. Y al final del todo se muestra, sin que
nadie la escriba, la lista de vías de administración de medicación que ese tipo no puede administrar:
sale sola de cruzar la matrícula que tiene ese tipo con lo que se haya exigido en la configuración de
matrícula para medicación.

**Qué se ve en pantalla, de arriba abajo.**
- Título de la pantalla: «Configuración», con la solapa «Asistentes».
- Título de sección de este bloque: «Tareas», seguido del nombre del tipo elegido.
- Explicación de la sección: «Dos listas separadas a propósito. La segunda —lo que no le
  corresponde— es la que evita que el Cliente le pida al Asistente cosas que no son suyas.»
- La lista «Le corresponde», con sus tareas, y la lista «No le corresponde», con las suyas.
- Título de la última sección: «Además, no puede administrar estas vías»
- Explicación de esa última sección: «Esto no se escribe a mano: sale de la matrícula que este tipo
  tiene y de lo que se pidió en "Matrícula para medicación". Si se cambia esa configuración, esta
  lista cambia sola.»
- Debajo: o la enumeración de vías prohibidas, o este renglón de texto.

**El texto, textual.**
«Ninguna. Este tipo puede administrar todas las vías configuradas.»

**Cuándo aparece.** Cuando el cruce no arroja ninguna vía prohibida. Eso pasa en dos situaciones bien
distintas: cuando todas las vías que exigen matrícula exigen justamente la matrícula que este tipo
tiene, y cuando directamente no hay ninguna vía cargada en la configuración de matrícula para
medicación.

**Qué desaparece mientras ese renglón está puesto.** La enumeración de vías, que es una lista con un
renglón por cada vía prohibida, escrita con el mismo nombre que le puso la Prestadora al cargarla en
la configuración de matrícula para medicación.

**Qué queda alrededor si el renglón se saca.** El título «Además, no puede administrar estas vías» y
su explicación, y debajo un blanco, que en un título redactado en negativo se lee como si la
respuesta estuviera faltando en vez de ser que no hay ninguna.

**Problemas que se ven acá.** El texto dice lo mismo en dos situaciones que no son lo mismo. Si la
Prestadora todavía no cargó ninguna vía en la configuración de matrícula para medicación, el renglón
igual afirma que este tipo «puede administrar todas las vías configuradas» —que son cero—, y eso se
lee como un permiso amplio cuando en realidad no hay nada configurado todavía. Y el título de la
sección está escrito en negativo, «Además, no puede administrar estas vías», de modo que la secuencia
que se lee es una prohibición seguida de la palabra «Ninguna», que obliga a releer para entender que
no hay ninguna prohibición.

---

# Ajustes → Configuración → La Prestadora

## 26. El aviso de que falta la clave de un proveedor conectado

**Cómo llegar.** Menú lateral → grupo **Ajustes** → **Configuración** → solapa **«La Prestadora»** →
bajar hasta la sección **«Pasarela de pago»**. El aviso está adentro de la tabla, en la columna
«Estado», justo debajo de la palabra «Activo», en el renglón del proveedor al que le falta la clave.
Este bloque sólo existe si esta Prestadora tiene contratada la modalidad de match.

**Qué es ese texto.** No es un cartel de lista vacía ni el valor de un campo: es un aviso de que falta
terminar de configurar algo, y de que mientras tanto ese medio de cobro no funciona. Está puesto en
la fila del proveedor a propósito, para que se sepa antes de que un cobro no entre y no después.

**Qué es esa pantalla y para qué se usa.** Dentro de Configuración, en la sección de la Prestadora,
está el bloque de pasarela de pago. Ahí se elige por qué medios cobra la suscripción de los Clientes:
tarjeta por distintos proveedores, transferencia por código, débito automático en cuenta bancaria, red
de cobranza en efectivo. La clave de cada medio se guarda cifrada y no se vuelve a mostrar una vez
cargada. Conectar los medios y cambiar sus claves es del administrador de la Prestadora; el soporte
técnico ve cuáles están conectados y nada más.

**Qué se ve en pantalla, de arriba abajo.**
- Título de la pantalla: «Configuración», con la solapa «La Prestadora».
- Título de sección: «Pasarela de pago»
- Explicación de la sección: «Se puede elegir uno o varios medios de cobro para la suscripción de las
  Clientes a Match. La credencial de cada uno se guarda cifrada y no vuelve a mostrarse una vez
  cargada.»
- Cuando quien mira no es el administrador de la Prestadora, un aviso: «Acá se ve qué pasarelas están
  conectadas, pero conectarlas y cambiar sus claves es del administrador de la prestadora. El soporte
  técnico no accede a las credenciales con las que la prestadora cobra, ni siquiera durante una sesión
  de soporte.»
- La tabla, con tres columnas: «Proveedor», «Estado» y una última sin nombre para los botones. En la
  columna de estado se lee «Activo» o «Inactivo», y es justo ahí, debajo de esa palabra, donde aparece
  este aviso.

**El texto, textual.**
«Falta la clave: sin ella no se aceptan los cobros que informe este proveedor.»

**Cuándo aparece.** Con tres condiciones a la vez, en el renglón de un mismo proveedor: que esté
activo, que ese proveedor sea de los que necesitan una segunda clave para comprobar la autenticidad de
lo que informa, y que esa clave no esté cargada. Un proveedor apagado no lo muestra, aunque le falte la
clave.

**Qué desaparece mientras el aviso está puesto.** Nada. Este aviso no reemplaza a nada: se suma a la
celda de estado, debajo de la palabra «Activo», que sigue diciendo «Activo».

**Qué queda alrededor si el aviso se saca.** La fila del proveedor con su nombre y la palabra «Activo»,
y, si quien mira es el administrador de la Prestadora, los botones de esa fila: «Desactivar» y el de
cargar o reemplazar el secreto de firma.

**Problemas que se ven acá.** La misma cosa tiene tres nombres distintos en la misma pantalla: el aviso
la llama «la clave», los botones de al lado la llaman «secreto de firma» y hay otros botones que hablan
de «credencial». Leído solo, no se sabe cuál de las dos cosas falta ni cuál de los botones la resuelve.
Y hay una contradicción visible en un mismo renglón: la columna de estado dice «Activo» y abajo se
aclara que los cobros no se aceptan, que es lo contrario de estar activo, sin que ninguna de las dos
afirmaciones desmienta a la otra. Por último, cuando quien mira no es el administrador de la
Prestadora, el aviso aparece igual pero los botones para resolverlo no están, así que se ve el problema
y no hay ninguna manera de actuar desde ahí; el aviso tampoco dice a quién hay que pedírselo, eso está
escrito más arriba en otro recuadro.

---

# Lo que queda afuera de este documento

**El cartel de Habilitar clave.** Se ve en Menú lateral → grupo **Ajustes** → **Habilitar cambio de
contraseña**, que es la pantalla donde se atienden los pedidos de habilitación, y el enlace del menú
lleva un contador al lado. Ese cartel **queda afuera por decisión del Desarrollador**, hasta que se
analicen en detalle los procedimientos y la lógica de esa pantalla. Textual: *«en este caso en
particular, ningún cartel es mas útil que tener uno vacío esperando. Puede llega a aparecer uno, y
hay que analizar en detalle primero los procedimientos y la lógica de los mismos antes de decir si o
no cuando eventualmente surja la necesidad»*. No se toca y no se opina sobre él acá.
