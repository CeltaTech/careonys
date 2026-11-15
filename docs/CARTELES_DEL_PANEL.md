# Los carteles del Panel, uno por uno

Este documento existe para que se pueda mirar el Panel abierto, pantalla por pantalla, y ver con
los ojos cada cartel que el sistema pone por su cuenta. Cada ficha arranca diciendo **cómo se
llega a esa pantalla** —el camino por el menú, los clics— y qué hay que hacer para que ese cartel
aparezca.

**Son cuatro.** Llevan el mismo número que tienen en el punto 15 de `docs/CARTELES_DEL_PANEL.docx`
—el 2, el 9, el 12 y el 21—, que son los que siguen en el código de los veintiséis de
ese punto. Están ordenados por el camino del menú, de arriba abajo, para que se puedan ir viendo
uno atrás del otro sin saltar de un lado al otro del Panel.

**Éste es el único lugar donde está el detalle de cada cartel.** El plan, la lista de cambios
deshechos y las fichas de cómo nombrar a la Prestadora remiten acá.

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

**El relevamiento son cuatro, y el punto 15 avisa que no alcanza:** «hay que evaluar
absolutamente todos».

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
Y debajo, un botón: «Limpiar filtros».

**Cuándo aparece.** Cuando la lista volvió sin ni un renglón y hay al menos un filtro puesto.

**Qué desaparece mientras el cartel está puesto.** La tabla entera.

**Qué queda alrededor si el cartel se saca.** El título, los filtros con lo tecleado adentro, y un
blanco. El botón «Limpiar filtros» se iría con el cartel, que es el único lugar donde está.

**Problemas que se ven acá.** Tres.

El primero es que afirma un hecho que no comprobó. Dice «Hay registros cargados», y eso no se
miró: lo único que se sabe es que la consulta con filtro volvió vacía. En el Directorio de Personas sin ni una
persona cargada, basta teclear una letra en el buscador para que la pantalla diga que hay registros
cargados, que es exactamente lo contrario de la verdad.

El segundo es que «lo que se buscó» nombra solamente al buscador, y la mayoría de estas pantallas
filtran además por desplegable —un estado, una zona, un rango de fechas—. Quien tecleó nada y sólo
eligió un estado lee una frase que no habla de lo que hizo.

El tercero es que hay pantallas que nunca llegan a este cartel aunque tengan filtros: Documentación
es una, porque su filtro de arranque no cuenta como filtro y la deja como lista vacía, sin ningún
cartel.


**Decisión del Desarrollador: CAMBIAR.** Del punto 15 de
`docs/CARTELES_DEL_PANEL.docx`, copiada textual y sin interpretar:

> «No encontramos resultados. Revise los filtros seleccionados.» (solo se aplica si realmente el usuario interactúa con la lista, caso contrario no existe ningún mensaje)

---

# PARTE II — Los carteles propios de cada pantalla

# Clientes → Directorio de Clientes → un Cliente

## 9. Cuando el Cliente no tiene reportes

**Cómo llegar.** El mismo camino: **Clientes → Directorio de Clientes → un Cliente**, y ahí la
pestaña **«Historial de reportes»**.

**Qué es eso y para qué se usa.** Cada guardia deja un reporte al terminar, escrito por quien la
trabajó. Esta sección junta los de los Pacientes de ese Cliente, hasta treinta, sin rango de fechas
para elegir.

**Qué se ve en pantalla, de arriba abajo.**
- El nombre del Cliente, el renglón de sus datos y las pestañas, con «Historial de reportes»
  elegida.
- Debajo, la tabla de reportes, o el cartel cuando no hay ninguno.

**El cartel, textual.**
Un solo renglón: «Todavía no hay reportes»

**Cuándo aparece.** Cuando ningún Paciente de ese Cliente tiene ni un reporte cargado.

**Qué desaparece mientras el cartel está puesto.** La tabla de reportes, con sus columnas «Fecha»,
«Paciente», «Asistente», «Ánimo» y «Señales». En la última se marca si hubo un incidente, si algo
quedó fuera de rango y si el reporte quedó «Sin confirmar».

**Qué queda alrededor si el cartel se saca.** Las pestañas, con «Historial de reportes» elegida, y
un blanco debajo.

**Problemas que se ven acá.** Tres.

El primero es que tapa dos situaciones distintas con el mismo texto: que no hubo ninguna guardia
todavía, y que hubo guardias y ninguna dejó reporte. La segunda es un problema y se lee igual que la
primera.

El segundo es que un Cliente sin Pacientes recibe este cartel en vez de que se le diga que no
tiene a quién atenderle.

El tercero es que no nombra la pantalla de Reportes diarios, que es donde se ven todos y donde se
resuelve lo que quedó sin confirmar.


**Decisión del Desarrollador: CAMBIAR.** Del punto 15 de
`docs/CARTELES_DEL_PANEL.docx`, copiada textual y sin interpretar:

> Si hace falta cartel: «No existen reportes aún.»

---

# Guardias → Guardias

## 12. Cuando no quedó ninguna guardia abierta de días anteriores

**Cómo llegar.** Menú lateral → grupo **Guardias** → **Guardias**. El cartel está arriba de todo,
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
- Título de la pantalla: «Guardias», con los botones «Filtrar» y «Nueva».
- Título de sección: «Guardias sin cerrar»
- Y ahí va la tabla, o el cartel cuando no hay nada.
- Más abajo, ya fuera de esta franja, la grilla de turnos. Los filtros de la pantalla —desde,
  hasta, estado, buscador, y la casilla de ver sólo los huecos— quedan ocultos hasta que se aprieta
  «Filtrar».

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

**Qué queda alrededor si el cartel se saca.** El título de la pantalla, el título de la sección, y
debajo un blanco. Más abajo, la grilla de turnos y sus filtros, que no tienen nada que ver con esta
franja y siguen funcionando igual.

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

## 21. Mapa de los Asistentes — cuando hay Asistentes pero ninguna ubicación cargada

**Cómo llegar.** Menú lateral → grupo **Asistentes** → **Postulaciones**, y bajar hasta **«Mapa del
Padrón por zona»**.

**Qué es esa pantalla y para qué se usa.** Es el mapa de dónde viven los Asistentes activos del
Padrón, agrupados por zona. Este cartel es para cuando hay gente trabajando, pero de ninguna de
esas personas se cargó una ubicación, así que no hay ni un punto
que dibujar. La decisión deliberada es no mostrar un mapa mudo, porque un mapa vacío se lee como un
mapa roto.

**Qué se ve en pantalla, de arriba abajo.**
- Título de la pantalla, «Postulaciones de Asistentes».
- Título de sección del mapa: «Mapa del Padrón por zona»
- Debajo, el cartel, en el lugar donde iría el mapa.

**El cartel, textual.** «Todavía no hay ninguna ubicación para mostrar.»

**Cuándo aparece.** Cuando hay al menos un Asistente activo en el Padrón y ninguno de ellas tiene
ubicación cargada. También aparece cuando las ubicaciones que hay cargadas no sirven: un par de
números fuera del rango posible, o el punto exacto cero-cero, que no es una ubicación sino una
casilla que quedó vacía, se descartan y no cuentan como ubicación. Si el Padrón no tiene ningún
Asistente activo, no aparece ningún cartel.

**Qué desaparece mientras el cartel está puesto.** El renglón de cuántos se pudieron ubicar sobre el total, los botones de zona con sus cantidades, el dibujo del
mapa, la lista escrita de nombres y el renglón que avisa cuántos quedaron sin ubicar.

**Qué queda alrededor si el cartel se saca.** El título de la pantalla, el título «Mapa del Padrón
por zona», y debajo un blanco.

**Problemas que se ven acá.** El cartel esconde justamente el dato que más falta hace: cuántos
Asistentes hay en el Padrón. Se sabe que no hay ubicaciones, pero no se sabe si son tres personas sin
ubicar o cuarenta, porque el renglón que dice esa cuenta desaparece junto con el mapa. Y hay una situación parecida que no
muestra ningún cartel: si se elige una zona que no tiene a nadie ubicado, el dibujo del mapa queda
sin puntos y no aparece ninguna explicación, porque el cartel sólo mira el total del Padrón y no la
zona elegida.


**Decisión del Desarrollador: CAMBIAR.** Del punto 15 de
`docs/CARTELES_DEL_PANEL.docx`, copiada textual y sin interpretar:

> No ubica la situación, asi que no puedo decir si va o no va algún cartel

---

# Lo que queda afuera de este documento

**El cartel de Habilitar cambio de contraseña.** Se ve en Menú lateral → grupo **Gestión** →
**Configuración** → **Habilitar cambio de contraseña**, que es la pantalla donde se atienden los pedidos de habilitación, y el enlace del menú
lleva un contador al lado. Ese cartel **queda afuera por decisión del Desarrollador**, hasta que se
analicen en detalle los procedimientos y la lógica de esa pantalla. Textual: *«en este caso en
particular, ningún cartel es mas útil que tener uno vacío esperando. Puede llega a aparecer uno, y
hay que analizar en detalle primero los procedimientos y la lógica de los mismos antes de decir si o
no cuando eventualmente surja la necesidad»*. No se toca y no se opina sobre él acá.

**Lo que el punto 15 manda evaluar.** Su título dice «Aplicación algunos de los casos, hay que
evaluar absolutamente todos», así que los cuatro de acá no cierran la revisión.
