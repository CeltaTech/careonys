# Los carteles del Panel, uno por uno

Este documento existe para que se pueda mirar el Panel abierto, pantalla por pantalla, y ver con
los ojos cada cartel que el sistema pone por su cuenta. Cada ficha arranca diciendo **cómo se
llega a esa pantalla** —el camino por el menú, los clics— y qué hay que hacer para que ese cartel
aparezca.

**Son seis.** Están ordenados por el camino del menú, de arriba abajo, para que se puedan ir
viendo uno atrás del otro sin saltar de un lado al otro del Panel.

**Qué se cuenta acá como cartel.** Todo texto que el Panel dice por su cuenta, sin que sea un dato
cargado por nadie: los carteles que ocupan el lugar de una lista cuando esa lista está vacía, los
avisos de que falta configurar algo, y los renglones que se muestran en lugar de un valor. No
entran las etiquetas de los casilleros, ni los títulos de pantalla, ni los datos.

**Qué NO está en este documento.** Los textos al pie de los casilleros cuando un dato está mal
cargado, los mensajes de «se guardó» y las ventanas de confirmar. Esos no están puestos esperando:
aparecen cuando alguien aprieta algo y se van solos. Y las dos aplicaciones de teléfono —la de los
Clientes y la de los Asistentes— van en documento aparte. **Eso lo decidí yo y se puede rechazar:
si tienen que entrar, entran.**

**Cada ficha tiene ocho apartados, siempre los mismos y en este orden:** cómo llegar, qué es esa
pantalla, qué se ve de arriba abajo, el cartel textual, cuándo aparece, qué tapa mientras está
puesto, qué quedaría si se lo saca, y los problemas que se ven ahí.

**Los problemas que figuran al final de cada ficha son observaciones, no decisiones.** Nada de esto
se tocó ni se va a tocar sin orden.

**Quién decide, y de dónde sale la decisión.** Las decisiones las fijó el Desarrollador en
`docs/CARTELES_DEL_PANEL.docx`, «Criterios definitivos para los carteles del Panel», punto 15. **Ese
documento manda sobre éste:** cada ficha cierra con la decisión que le corresponde, copiada textual
de ahí y sin interpretarla. Las cinco acciones posibles son BORRAR —que significa ningún cartel, y
nunca uno más corto—, CAMBIAR, AJUSTAR, DEJAR y REVISAR.

**Y el punto 13 de ese documento es obligatorio: no se redacta libremente.** Acá se detecta, se
ubica, se describe y se aplica exactamente un texto aprobado. Donde hace falta un texto y no hay uno
aprobado, queda escrito que falta definirlo. Nunca se inventa.

**El relevamiento son seis, y el punto 15 avisa que no alcanza:** «hay que evaluar
absolutamente todos». Lo que todavía no se relevó está anotado al pie.

---

# PARTE I — El cartel de fábrica

Éste no pertenece a ninguna pantalla: lo escribe una sola pieza del Panel, la que dibuja todas las
listas, y por eso aparece en decenas de lugares con las mismas palabras. Va primero porque es el que
más veces se ve.

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
miró: lo único que se sabe es que la consulta con filtro volvió vacía. En el Directorio de Personas sin ni una
Ficha de Persona, basta teclear una letra en el buscador para que la pantalla diga que hay registros
cargados, que es exactamente lo contrario de la verdad.

El segundo es que «lo que se buscó» nombra solamente al buscador, y la mayoría de estas pantallas
filtran además por desplegable —un estado, una zona, un rango de fechas—. Quien tecleó nada y sólo
eligió un estado lee una frase que no habla de lo que hizo.

El tercero es que hay pantallas que nunca llegan a este cartel aunque tengan filtros: Documentación
es una, porque su filtro de arranque no cuenta como filtro y la manda siempre al cartel genérico.


**Decisión del Desarrollador: CAMBIAR.** Del punto 15 de
`docs/CARTELES_DEL_PANEL.docx`, copiada textual y sin interpretar:

> «No encontramos resultados. Revise los filtros seleccionados.» (solo se aplica si realmente el usuario interactúa con la lista, caso contrario no existe ningún mensaje)

---

# PARTE II — Los carteles propios de cada pantalla

# Clientes → Clientes → un Cliente

## 6. Cuando el Pagador no tiene cargada ninguna documentación exigible

**Cómo llegar.** Menú lateral → grupo **Clientes** → **Clientes** → clic en un Cliente de la lista.
Dentro de la Ficha del cliente, bajar hasta la subsección **«Documentación que pide el Pagador»**, que está
debajo de todo lo de la firma del Pagador.

**Qué es esa pantalla y para qué se usa.** Es la parte de la Ficha del cliente donde se responde
una sola pregunta: quién paga esto y si eso ya está cerrado. Elegir a alguien del Directorio de Personas no alcanza:
queda definido como Pagador recién cuando firmó que asume la obligación de pagar. Ahí mismo se ve si
esa firma está, se arma el documento para que la firme, se registra que llegó firmado, y —abajo de
todo eso— se lleva la cuenta de los papeles que exige quien paga el servicio: cuáles están,
cuáles faltan, cuáles se vencieron. Nada de eso frena la contratación; avisa nada más, en el momento
en que se elige a la persona y no el día que hay que cobrarle.

**Qué se ve en pantalla, de arriba abajo.**
- Título de la pantalla: el nombre del Cliente.
- Título de sección: «Contacto», con los casilleros de nombre, teléfono, correo, localidad y plan.
- El casillero donde se elige del Directorio de Personas, rotulado «Quién paga».
- Título de la subsección: «Quién paga».
- Debajo, la explicación: «Elegir el Legajo no alcanza: el Pagador queda definido cuando firma que
  asume la obligación de pagar. Acá se ve si esa firma está y qué documentación pide el Pagador.
  Nada de esto frena la contratación.»
- Un cartel de estado, que dice «El Pagador está definido: firmó que asume la obligación de pagar.»
  o «El Pagador todavía no firmó que asume la obligación de pagar.»
- Una lista de dos renglones: «Quién paga» con el nombre, y «Firma en su representación» con el
  nombre de quien firma, si lo hay.
- Los botones de «Armar el consentimiento», «Ver el documento», «Registrar la firma» y «Anular»,
  según en qué punto esté la firma.
- Título de la subsección siguiente: «Documentación que pide el Pagador».
- Y ahí abajo va la tabla de papeles, o el cartel cuando no hay nada.

**El cartel, textual.**
Un solo renglón: «Esta Prestadora todavía no cargó qué documentación pide. Se configura en
Configuración.»

**Cuándo aparece.** Cuando la lista de papeles exigibles vuelve vacía, es decir, cuando nadie dejó
escrito en ningún lado qué documentación hay que pedirle a quien paga. No depende de este Cliente ni
de este Pagador: es una definición que se hace una sola vez para toda la empresa, y mientras no se
haga, este cartel va a estar en todos los Clientes por igual.

**Qué desaparece mientras el cartel está puesto.** La tabla entera de papeles, con sus cuatro
columnas —«Documento», «Situación», «Vence» y «Acciones»—, con el estado de cada renglón, que puede
ser «Falta», «Cargado» o «Vencido», y con los botones de «Ver», «Cargar» y «Reemplazar». Desaparece
también el aviso que resume la situación arriba de la tabla, el que dice «Falta cargar tantos
documentos.» y «Hay tantos documentos vencidos.»

**Qué queda alrededor si el cartel se saca.** Todo lo de la firma queda intacto: el estado del
Pagador, quién paga, quién firma en su representación, la fecha en que se firmó y los botones de
armar, ver y registrar. Lo único que queda es el título «Documentación que pide el Pagador» con
un blanco debajo, y el botón de guardar los datos de contacto más abajo.

**Problemas que se ven acá.** Son tres. El primero es que el título y el cartel se contradicen sobre
quién exige los papeles: el título dice que la documentación la pide el Pagador, y el cartel dice
que la Prestadora «todavía no cargó qué documentación pide», como si fuera ella la que exige. Leídos
uno atrás del otro, no se entiende de quién es la exigencia. El segundo es que en esta misma pantalla
la frase «Quién paga» aparece tres veces seguidas y con tres significados distintos: es el rótulo del
casillero donde se elige, es el título de la subsección entera, y es el renglón que muestra el nombre
elegido. El tercero es que la frase «Se configura en Configuración» dice la misma palabra dos veces
en cinco palabras, y aun así no dice en qué parte de esa pantalla hay que buscar.


**Decisión del Desarrollador: CAMBIAR.** Del punto 15 de
`docs/CARTELES_DEL_PANEL.docx`, copiada textual y sin interpretar:

> Por favor cargar [documentación] en [lugar donde hacerlo].

---

## 8. Cuando el Cliente no tiene reportes

**Cómo llegar.** El mismo camino: **Clientes → Clientes → un Cliente**, y bajar hasta la sección
**«Historial de reportes»**, que está justo debajo de las guardias activas.

**Qué es eso y para qué se usa.** Cada guardia deja un reporte al terminar, escrito por quien la
trabajó. Esta sección junta los de los Pacientes de ese Cliente, hasta treinta, sin rango de fechas
para elegir.

**Qué se ve en pantalla, de arriba abajo.**
- El nombre del Cliente, y las secciones anteriores.
- Título de sección: «Historial de reportes»
- Debajo, la tabla de reportes, o el cartel cuando no hay ninguno.
- Más abajo, la sección de «Alertas activas».

**El cartel, textual.**
Primer renglón: «Todavía no hay reportes»
Segundo renglón: «Cada guardia deja su reporte al terminar, y acá se ven los de los Pacientes de
este Cliente.»

**Cuándo aparece.** Cuando ningún Paciente de ese Cliente tiene ni un reporte cargado.

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


**Decisión del Desarrollador: CAMBIAR.** Del punto 15 de
`docs/CARTELES_DEL_PANEL.docx`, copiada textual y sin interpretar:

> Si hace falta cartel: «No existen reportes aún.»

---

# Cobertura → Guardias

## 11. Cuando no quedó ninguna guardia abierta de días anteriores

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


**Decisión del Desarrollador: CAMBIAR.** Del punto 15 de
`docs/CARTELES_DEL_PANEL.docx`, copiada textual y sin interpretar:

> Si todo esta en orden no hace falta ningún mensaje, si hay guardias si cerrar se muestran, y si corresponde a la pantalla también como se solucionan

---

# Asistentes → Postulaciones

## 20. Mapa de los Asistentes — cuando hay Asistentes pero ninguna ubicación cargada

**Cómo llegar.** El mismo camino que el cartel anterior: **Asistentes → Postulaciones**, y bajar hasta
**«Mapa del Padrón por zona»**. La diferencia con el caso anterior no es el camino sino la
situación: acá sí hay gente trabajando.

**Qué es esa pantalla y para qué se usa.** Es el mismo mapa descrito arriba: dónde viven los
Asistentes activos del Padrón, agrupados por zona. La diferencia con el caso anterior es la situación: acá sí hay
gente trabajando, pero de ninguna de esas personas se cargó una ubicación, así que no hay ni un punto
que dibujar. La decisión deliberada es no mostrar un mapa mudo, porque un mapa vacío se lee como un
mapa roto.

**Qué se ve en pantalla, de arriba abajo.**
- Título de la pantalla, «Postulaciones de Asistentes».
- Título de sección del mapa: «Mapa del Padrón por zona»
- Debajo, el cartel, en el lugar donde iría el mapa.

**El cartel, textual.**
Primer renglón: «Todavía no hay ninguna ubicación para mostrar.»
Segundo renglón: «Los Legajos con el domicilio ubicado aparecen acá.»

**Cuándo aparece.** Cuando hay al menos un Asistente activo en el Padrón y ninguno de ellas tiene
ubicación cargada. También aparece cuando las ubicaciones que hay cargadas no sirven: un par de
números fuera del rango posible, o el punto exacto cero-cero, que no es una ubicación sino una
casilla que quedó vacía, se descartan y no cuentan como ubicación.

**Qué desaparece mientras el cartel está puesto.** Lo mismo que en el caso anterior: el renglón de
cuántos se pudieron ubicar sobre el total, los botones de zona con sus cantidades, el dibujo del
mapa, la lista escrita de nombres y el renglón que avisa cuántos quedaron sin ubicar.

**Qué queda alrededor si el cartel se saca.** El título de la pantalla, el título «Mapa del Padrón
por zona», y debajo un blanco.

**Problemas que se ven acá.** El cartel esconde justamente el dato que más falta hace: cuántos
Asistentes hay en el Padrón. Se sabe que no hay ubicaciones, pero no se sabe si son tres personas sin
ubicar o cuarenta, porque el renglón que dice esa cuenta desaparece junto con el mapa. El texto del
segundo renglón habla de «Legajos» y de «domicilio ubicado», dos palabras que no aparecen en ningún
otro lado de esta pantalla —el resto habla de personas y de zonas—, y no dice dónde se carga esa
ubicación, así que leído solo no se sabe adónde ir a resolverlo. Y hay una situación parecida que no
muestra ningún cartel: si se elige una zona que no tiene a nadie ubicado, el dibujo del mapa queda
sin puntos y no aparece ninguna explicación, porque el cartel sólo mira el total del Padrón y no la
zona elegida.


**Decisión del Desarrollador: CAMBIAR.** Del punto 15 de
`docs/CARTELES_DEL_PANEL.docx`, copiada textual y sin interpretar:

> No ubica la situación, asi que no puedo decir si va o no va algún cartel

---

# Ajustes → Configuración → La Prestadora

## 25. El aviso de que falta la clave de un proveedor conectado

**Cómo llegar.** Menú lateral → grupo **Ajustes** → **Configuración** → solapa **«La Prestadora»** →
bajar hasta la sección **«Pasarela de pago»**. El aviso está adentro de la tabla, en la columna
«Estado», justo debajo de la palabra «Activo», en el renglón del proveedor al que le falta la clave.
Este bloque sólo existe si esta Prestadora tiene contratada la modalidad Match.

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
- Explicación de la sección: «Se puede elegir uno o varios medios de cobro para la suscripción de los
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


**Decisión del Desarrollador: CAMBIAR.** Del punto 15 de
`docs/CARTELES_DEL_PANEL.docx`, copiada textual y sin interpretar:

> Debe indicar únicamente que falta la credencial necesaria, con una redacción formal y sencilla. Texto a aprobar. Quiero suponer que en ninguna pantalla dice «La Prestadora»

---

# Lo que queda afuera de este documento

**El cartel de Habilitar cambio de contraseña.** Se ve en Menú lateral → grupo **Ajustes** → **Habilitar cambio de
contraseña**, que es la pantalla donde se atienden los pedidos de habilitación, y el enlace del menú
lleva un contador al lado. Ese cartel **queda afuera por decisión del Desarrollador**, hasta que se
analicen en detalle los procedimientos y la lógica de esa pantalla. Textual: *«en este caso en
particular, ningún cartel es mas útil que tener uno vacío esperando. Puede llega a aparecer uno, y
hay que analizar en detalle primero los procedimientos y la lógica de los mismos antes de decir si o
no cuando eventualmente surja la necesidad»*. No se toca y no se opina sobre él acá.

**Lo que el punto 15 manda evaluar y todavía no se relevó.** Su título dice «Aplicación algunos de
los casos, hay que evaluar absolutamente todos», así que los seis de acá no cierran la
revisión. Falta relevar, con la misma ficha de ocho apartados:

1. Los textos al pie de los casilleros, cuando un dato está mal cargado.
2. Los avisos de «se guardó».
3. Las ventanas de confirmar.
4. Los carteles de las dos aplicaciones de teléfono, la de los Clientes y la de los Asistentes.
5. El cartel de Habilitar cambio de contraseña, que está parado por la decisión de arriba.

**Y el punto 8 abre un trabajo aparte**, que no es de carteles: eliminar el tuteo y el voseo de todo
el Panel y de las dos aplicaciones, sin excepción.
