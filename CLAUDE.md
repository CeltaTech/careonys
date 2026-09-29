# CLAUDE.md — Reglas propias de Careonys

> **Acá está sólo lo que es exclusivo de este producto.** Lo demás no se repite, se consulta:
>
> | Qué | Dónde | Cómo llega |
> |---|---|---|
> | Lo común a todos los productos de CeltaTech | `..\..\CLAUDE.md` | **Se lee solo**, porque la línea de comandos junta los `CLAUDE.md` hacia arriba |
> | Lo de Careonys y Match | `..\..\docs\REGLAS_PRODUCTOS_CAREONYS.md` | **A mano, al empezar** |
> | El glosario de los dos | `..\..\docs\GLOSARIO_PRODUCTOS_CAREONYS.md` | **A mano, al empezar** |
> | Lo de este producto | este archivo | Se lee solo |
>
> Si una regla está escrita arriba, acá no se escribe. Si aparece repetida, se borra de acá.

## 1. Qué es Careonys

Plataforma de gestión para empresas dedicadas al cuidado de personas. **Careonys no presta
servicios de cuidado.** Las Prestadoras la usan con licencia, cada una en su propia Organización.
**Ninguna Prestadora tiene relación especial con CeltaTech ni trato privilegiado en el código.**

**El alta de una Prestadora no es de Careonys.** Una Prestadora se registra con CeltaTech, y **sólo
CeltaTech le da el alta**. Hecha el alta, CeltaTech le informa al producto dos cosas: los datos que
el producto requiera para que esa Prestadora ingrese, y **a qué tiene acceso y a qué no**. El
producto recibe e informa: no da de alta, no reparte accesos, no decide qué alcanza cada Prestadora
y no le crea nada por su cuenta en ese momento.

Lo fijó el Desarrollador, textual: *«Solo celtatech puede dar alta a una prestadora, lo hace y te
informa los datos que requieras para que ingrese. cuando le da el alta tambien te informa a que
tiene acceso y a que no lo tiene»*, y *«Careonys nada tiene que hacer metiendo la nariz donde no la
llaman»*. Es la regla fundamental de la empresa —`..\..\CLAUDE.md` §2— aplicada al alta.

**Y la cuenta con la que se entra al Panel tampoco es de Careonys.** Cada Prestadora ingresa con el
usuario, la contraseña y los permisos que le genera CeltaTech. **Del cambio de contraseña, de la
recuperación y de lo que siga por ese lado se ocupa CeltaTech**, no el producto. Textual del
Desarrollador: *«Cada prestadora ingresara con el usuario, contraseñas y permisos que le genere
cletatech. De los cambios de contraseñas, recuperacion de las mismas, etc. tambien se ocupa
celtatech»*.

Esto habla del **Panel**. El Cliente y el Asistente son de la Prestadora, no clientes de CeltaTech,
y cómo entran ellos no está dicho acá.

**Lo único que Careonys sí hace en el alta es el correo de salida.** Se le crea
`[prestadora]@careonys.com`, **exclusivamente para enviar**; se crea solo y la Prestadora ni se
entera de que existe (`docs/MARCA.md`, sección 0). Una dirección de correo no es una dirección web:
**no existe ninguna dirección web propia por Prestadora, y no se construye ninguna.**

## 2. Sandbox

Organización ficticia reservada del sistema, sólo para desarrollo, pruebas, validación y demos
internas. No es una Prestadora comercial ni un cliente. **El nombre «Sandbox» queda reservado:
ninguna Prestadora real puede usarlo.**

## 3. De dónde sale cada advertencia legal

Qué funciones traen riesgo y qué dice cada aviso está en
`..\..\docs\REGLAS_PRODUCTOS_CAREONYS.md` §3, y los textos por país en `docs/legal/<país>.md`.
Acá sólo cómo se implementa:

**La fuente de las advertencias es una tabla configurable** —jurisdicción → función → texto—,
nunca texto escrito en el código.

**Lo mostrado queda en `auditoria_advertencias_legales`:** quién, cuándo, qué función, qué
advertencia se mostró.

## 4. Glosario

**El glosario de los productos Careonys es uno solo y no vive acá:**
`..\..\docs\GLOSARIO_PRODUCTOS_CAREONYS.md`. No se copia a este repositorio.

## 5. Los tres roles

Careonys tiene **tres** roles de Panel: Superadmin, Admin_prestadora y Coordinador. **No hay un
cuarto rol comercial, y no se agrega:** la gestión comercial de las cuentas es de CeltaTech y vive
en su propio panel.

**Superadmin** — rol técnico de CeltaTech. No representa una Prestadora ni la opera
comercialmente. **Y por eso no entra por el Panel:** el soporte técnico entra por el lado de
CeltaTech y desde ahí hace lo que tenga que hacer. Lo decidió el Desarrollador, textual: *«el
soporte técnico entre por el lado de CeltaTech, desde celtatech hara lo que tenga que hacer»*. El
Panel es la herramienta con la que trabaja la Prestadora, y un rol que no es suyo —y que además es
el más poderoso— no vive ahí.

**Para entrar a una Prestadora real hace falta un permiso de acceso**, con todos sus recaudos: una
Organización por vez, corte por inactividad a los 5 minutos, tope absoluto de 60 y todo auditado
—es regla de la empresa, `..\..\CLAUDE.md` §6—. **Lo abre CeltaTech desde su lado, y el producto
no tiene ninguna ruta para abrirlo, renovarlo ni cerrarlo a pedido.** Textual del Desarrollador:
*«la sesión de soporte ya está construida con todos sus recaudos, es cierto, pero solo puede ser
accedida desde el soporte de celtatech»*. Qué tiene que construir CeltaTech está escrito en
`celtatech/docs/EL_PERMISO_DE_ACCESO.md`.

**La cerradura está acá y la llave es de CeltaTech.** El permiso se anota en esta base porque es
la que decide qué filas ve una consulta; quién tiene derecho a abrirlo no se anota adentro del
producto.

**Y la Prestadora no lo ve ni sabe que existe.** Textual: *«la prestadora no la ve, ni siquiera
sabe que existe»*. Ninguna pantalla del Panel lo ofrece, lo nombra ni lo deja ver abierto. El
cartel que exige la regla de la empresa es de la herramienta con la que opera CeltaTech.
- Entrada propia; segundo factor por código temporal, activable desde Configuración.
- **Acá la Organización ficticia es Sandbox.** El permiso vive en `permisos_de_acceso` y lo que
  se hace con él, en `auditoria_de_accesos`. La forma del permiso es la de la empresa y no se toca.
- La precedencia —permiso de acceso primero, Organización propia después— la define la función
  SQL `current_tenant()`, y el middleware `requiereRolPanel.js` la refleja, no la reinventa. Ahí
  vive además el cierre por vencimiento, porque es el único lugar por el que pasan todos los
  pedidos.

**Admin_prestadora** — administrador operativo, acotado a su propia Organización. Sin acceso a
otras Prestadoras ni a configuración global.

**En cada Prestadora hay un solo Administrador, y es el que figura en el contrato.** Lo nombra
CeltaTech, que es también quien se ocupa de su usuario, su contraseña y sus permisos, y de los
cambios y la recuperación de esa clave. **No hay dos, y el producto no crea ninguno.** Las personas
en las que ese Administrador delegue funciones propias de él **llevan otro nombre, que todavía no
está decidido**, nunca el de Administrador. **No es el Coordinador**, que es otra cosa: quien
organiza el trabajo de un grupo determinado de Asistentes, y que depende de funciones del
Administrador o de aquel en quien él las delegue o las comparta. Textual del Desarrollador: *«en cada prestadora hay un
solo administrador, que es el que figura en el contrato y el que nombra celtatech, el resto de las
personas en las que ese administrador delegue funciones que le corresponde a el, tendrá un nombre
distinto»*.

**Del Administrador para abajo, las cuentas las hace la Prestadora.** El Administrador genera y
administra los usuarios, las contraseñas y los permisos de su gente: coordinadores, Asistentes,
Clientes, personas autorizadas. Ahí el ciclo de la clave del producto —pedirla, recuperarla, los
topes— sí corre; para el Administrador no, porque esa cuenta es de CeltaTech.

**Y reparte permisos adentro de lo que su Prestadora tiene.** Qué alcanza cada Prestadora lo
informa CeltaTech al dar el alta, y de ahí no se sale. Adentro de eso decide él: el producto deja
marcado lo que considera prudente, y él lo reconfigura según su criterio y su necesidad. Textual:
*«Careonys puede dejar marcada por default lo que considera prudente, pero el adminisatador de la
la prestadora lo reconfigura segun sus criterios y necesidades»*.

## 6. Lo propio de Careonys en el desarrollo

Lo común a todos los productos —no hardcodear, multiidioma, cuatro estados, apagar el botón,
sistema de diseño, RLS, auditoría, operaciones destructivas, importe con moneda, punto único de
verdad, módulos, commit y push— está en `..\..\CLAUDE.md` y **no se repite acá**. Lo del cuidado
de personas —glosario, riesgo legal, marca de la Prestadora, datos sensibles, financiador— está en
`..\..\docs\REGLAS_PRODUCTOS_CAREONYS.md`. Acá queda **cómo se cumple en este producto**.

**La identidad del producto sale de `src/config/identidadProducto.js`.** Marcador `{{producto}}` /
`{{productoCorto}}` en traducciones y HTML, `IDENTIDAD.nombre` en código. Lo que **persiste** —base
IndexedDB, prefijo de respaldo— usa `IDENTIDAD.codigo`. Ese archivo existe
cinco veces, una por unidad desplegable, y `scripts/verificar_identidad.mjs` corta el push si las
cinco no coinciden o si el nombre está escrito a mano.

**El `codigo: 'careonys'` no se toca por ahora.** Es identificador guardado, no marca: con él se
arman la base local del teléfono y el prefijo de los respaldos. **Cambiarlo se evalúa en el momento de la fusión con Match**, y
hasta entonces queda como está. Ver la excepción del glosario, §4.

**Dónde vive la marca de la Prestadora.** En las dos aplicaciones, `src/context/PerfilContext.jsx`
la pide una vez a `/perfil` y la entrega con `useMarca()` (`nombre`, `logoUrl`,
`mostrarMarcaProducto`); el aviso al celular la lee de `src/lib/marcaGuardada.js`, porque el
trabajador de fondo no tiene sesión; del lado del backend la arma
`backend/src/utils/marcaPrestadora.js` con `prestadoras.nombre_fantasia` y `prestadoras.logo_url`.
La línea al pie —*«con la tecnología de {{producto}}»*— **va siempre** y es el **único** uso de
`IDENTIDAD` en una superficie de Cliente o Asistente. **El producto no consulta qué contrató
ninguna Prestadora**, acá ni en ningún otro lado: eso es de CeltaTech (`celtatech/CLAUDE.md` §2).

**Y para nombrarla adentro de una frase hay marcador, igual que el producto.** `{{prestadora}}`
en cualquier traducción, resuelto en `src/i18n/marcaEnElTexto.js` (original en el Panel, copia
idéntica en las dos aplicaciones) y alimentado por `PerfilContext.jsx` en las aplicaciones y
`EmpresaContext.jsx` en el Panel. Sin Prestadora conocida cae al nombre del producto. **Sólo
texto:** la marca dibujada no pasa por ahí y sigue saliendo de `useMarca()`.

**En qué idioma se le abre la pantalla a quien entra por primera vez** lo decide
`src/i18n/idiomaInicial.js`: lo que esa persona haya elegido alguna vez, después lo que diga la
dirección —`.com.br` y `.pt` son portugués, `.co.uk` inglés— y recién después el navegador,
comparando sólo la primera parte de la etiqueta para que `pt-PT` caiga en `pt-BR` y `en-GB` en
`en`. Qué se habla en cada país sale de `i18n/idiomas.js`, que es el mismo archivo para las
pantallas y el backend. **Sólo se guarda lo que la persona eligió a mano**, para que un navegador
que cambia de idioma se siga notando.

**Una frase que falta avisa, no deja un hueco.** `src/i18n/faltaLaFrase.js` envuelve el árbol de
traducciones: la clave que no existe avisa una vez por consola y muestra un guion en producción y
`[falta: la.ruta]` en desarrollo. Ningún punto de consumo cambia — `t` se sigue leyendo como
objeto.

**El trato se le dice al modelo una sola vez**, en `backend/src/utils/tratoIA.js`. Ningún prompt
copia ese párrafo, y los prompts tampoco tutean al modelo, porque eso lo empuja a contestar así.
Detalle en `docs/AI_PROMPTS.md`.

**Los errores los clasifica `lib/errores.js`** en ocho situaciones —sin conexión, sesión vencida,
sin permiso, no encontrado, duplicado, en uso, dato mal cargado, falla del sistema— y muestra la
frase de las traducciones en los tres idiomas. El texto crudo queda en la consola.

**Entre carpetas que se despliegan por separado, el punto único de verdad es un original más
copias idénticas.** El Panel, las dos aplicaciones y el backend no pueden importarse entre sí. La
lista de qué archivo es copia de cuál está en `scripts/copias_entre_apps.mjs`,
`scripts/sincronizar_copias.mjs` las regenera y `scripts/verificar_identidad.mjs` corta el build si
alguna se despegó. Nunca una copia editada a mano.

**La moneda de cada importe se completa sola.** La de la Prestadora está en `prestadoras.moneda`,
nace del país configurado y se cambia desde Configuración; la de cada importe, en la columna
`moneda` de su tabla, que la función `public.moneda_de_prestadora` completa al insertar.

**Alcance, para que la regla de la moneda no se estire:** Careonys **no emite comprobantes
fiscales y no está previsto que lo haga.** No tiene punto de venta, ni numeración autorizada, ni
impuestos discriminados, y no calcula ningún importe fiscal. Pide la moneda y nada más. Si algún
día un importe se convierte, ahí sí se guarda la cotización usada con su fecha.

**Lo que sí guarda es lo que emitió otro.** El comprobante lo emite el software de facturación de
la Prestadora, y de ahí vuelven tres datos que se anotan tal como llegaron: cómo se llama el
comprobante, qué número tiene y cuánto quedó adeudando el Cliente con los impuestos incluidos. Ese
monto es el que se reclama; el sistema no lo revisa ni lo compara contra nada, porque no conoce
los impuestos de ningún país. El nombre del comprobante es texto y no se interpreta.

**Careonys no asume tareas de facturación ni de créditos y cobranzas.** Las dos son software
aparte, y Careonys **se sirve** de ellas: le **entrega** a facturación qué hay que cobrarle a cada
cliente, y **se informa** del estado de cuenta —cuánto debe cada uno y si está atrasado—, porque
eso es información que a la Prestadora le conviene tener a la vista para trabajar. Lo que no hace
es el trabajo: no emite comprobantes, no calcula impuestos, no reclama, no gestiona la mora y no
decide ninguna restricción.

**Y tiene que poder con las dos situaciones**, que las elige cada Prestadora: con un software de
facturación conectado, o **con ninguno conectado**. Con ninguno, Careonys
sigue funcionando con lo que él mismo registra. **Conectado, Careonys no calcula: muestra lo que
recibe, tal como lo recibe.** No lo recalcula, no lo completa con lo suyo y no lo compara contra
nada. Un número que llega de afuera y otro calculado acá son dos verdades para lo mismo, y eso es
peor que no tener ninguna. Textual del Desarrollador: *«cada prestadora elige como hacerlo»*.

**El estado de cuenta lo ve solamente la administración de la Prestadora.** Cuánto debe un Cliente
y si está atrasada no es información de quien coordina turnos ni de nadie más: entra por el
catálogo de permisos, con el mismo molde que `ver_pagos_asistente`, que nace reservada a
administración.

**Cada Prestadora con lo suyo, sin mezclar.** Una conexión con un software de facturación o de
cobranzas es de una Prestadora, con su propia credencial, y nunca alcanza los datos de otra.

**Toda la información de los Clientes de la Prestadora vive en un solo lugar —el Padrón— y de ahí
se nutre todo el que la consuma.** Un Cliente puede ser un Cliente, una obra social, una prepaga o
lo que sea, y en los cuatro casos se guarda una sola vez, con todo lo que se sabe de él: quién es, cómo se
lo ubica, qué servicio recibe y cómo figura ante el organismo fiscal. Nada de eso se guarda por
segunda vez en otra pantalla, en otra tabla ni en el software de otro.

**Se lo consulta todas las veces que haga falta; se lo copia ninguna.** Una obra social puede estar
nombrada en cien Legajos, y en los cien es la misma: lo que cada uno guarda es cuál, no cómo se
llama. El nombre escrito a mano en cada lugar termina siempre en datos que se contradicen entre
sí, y entonces no hay forma de saber cuál vale. **Y no hay excepción.** Que un comprobante emitido
conserve los datos del día que se emitió es asunto de quien lo emite —el software de facturación o
el contable—, no de Careonys, que no emite ninguno.

**Hacia afuera se entrega, y no se trae.** Careonys le dice al software de facturación, para una
Prestadora: hacé las facturas con estos datos e informame lo que corresponda. **Al revés no**: el
mismo software puede estar trabajando para otros fines y con otros clientes, y nada de eso le llega
a Careonys, porque no es información suya. Un cliente creado adentro del facturador no existe para
Careonys. Un solo emisor y muchos receptores; dos padrones hablándose de igual a igual divergen
siempre. Textual del Desarrollador: *«Careonys le dice al facturado externo "para tal prestadora
hace las facturas con tales datos y informame de los datos que correpondan»*.

**Si del otro lado editan lo que salió de acá, se avisa, no se bloquea.** Un software comprado deja
cambiar el nombre o el domicilio de su cliente y eso no se puede impedir desde afuera. Lo que
corresponde es que la Prestadora vea que se despegaron, no que el producto intente imponer nada.

**Una contratación tiene tres roles, y siempre son tres.** Quien contrata el Servicio es el
Cliente Contratante; para quién se contrata es el Paciente; y quien asume la obligación de pagar es
el Pagador. Cada rol lo pueden tener una o más personas, físicas o jurídicas, y **una misma
persona puede tener varios roles**. Los tres pueden ser la misma persona, y eso es lo corriente,
pero **se anotan aparte igual**: coincidir hoy no es coincidir siempre. Textual del Desarrollador:
*«Pueden ser 1 o mas personas (físicas o jurídicas)»* y *«una misma persona puede tener varios
roles»*. **Se dice «rol», nunca «papel».** Cada uno de los tres lleva todos sus datos —nombre,
apellido, datos fiscales, domicilio, teléfono—, y esos datos están en la base de la Prestadora, no
en un papel.

**El Pagador firma su consentimiento a la obligación de pagar, y sin esa firma no hay Pagador
definido.** Se establece al contratar, con todos sus datos y con la documentación que ese
financiador exija, completa y firmada. Eso tiene que estar listo el día que se firma con la
Cliente; de ahí en más el cobro es asunto de créditos y cobranzas, que **sólo le informa a Careonys
en qué situación están los pagos** —al día, vencido hace tantos días— y nada más.

**Cada persona ve lo que firmó, y lo que firmó otro no, salvo que sea parte firmante.** Vale para
todo documento en el que alguien da su consentimiento, firmado en papel o en pantalla. La
Prestadora es parte de todos, porque son con ella. Un Asistente que consiente que la Prestadora
siga su ubicación tiene derecho a ver ese documento; el Cliente podrá ver o no esa ubicación, según
se configure su aplicación, pero el documento no lo ve nunca. Textual del Desarrollador: *«cada
persona tiene acceso a ver lo que firma, no asi a lo que firma otra persona, salvo que sea parte
involucrada»*. **Es el piso:** la norma de cada país sobre seguridad y confidencialidad se revisa,
y si pide más, manda la norma. Para que se pueda cumplir, **quien firma queda guardado como un
Legajo**, nunca como un nombre tecleado.

**La Persona se guarda una sola vez, y los roles la citan.** El rol es una anotación que apunta a
un Legajo, nunca una copia de sus datos ni un Legajo nuevo. Si la misma Persona contrata, recibe el
cuidado y paga, hay un Legajo y tres anotaciones.

**Un Legajo no se borra nunca.** Que termine el Servicio a un Paciente da de baja el Servicio, no
el Legajo. El Legajo queda, con el historial de cómo se comportó esa Persona en cada rol que
desempeñó. Con quien dejó de ser Cliente se vuelve a cruzar: como Pagador de otra contratación,
como familiar de otro Paciente, como financiador. Ese historial es justamente lo que se pierde el
día que alguien borra el Legajo «porque ya no está activa».

**Y la cuenta de una persona tampoco se borra, por la misma razón que no se borra una HCE.** Se
puede desactivar, suspender, bloquear o marcar con la advertencia que haga falta; borrar, nunca.
En el Panel, el Administrador desactiva una cuenta dejando siempre una nota que diga por qué.

**Rol nunca significa permisos.** Un rol dice qué lugar ocupa alguien en una contratación. Quién
puede ver o hacer qué cosa es otra cosa, se llama de otra manera y se guarda en otro lado.

**Un casillero que nombra algo que existe en otro lado es una lista, y nunca texto libre.** Si lo
que se escribe ahí es el nombre de una Persona, de una obra social o de una localidad que ya está
cargada, el casillero ofrece esa lista y se elige una. **Un nombre tecleado crea una entidad que no
existe**: se parece a la de al lado, no es la misma para el sistema, y nadie se entera. La lista
puede tener buscador y puede permitir dar de alta un Legajo nuevo desde ahí mismo, pero lo que
queda guardado es cuál, no cómo se llama.

**Un Legajo nuevo se carga desde el Padrón, con el botón que lo dice.** Un casillero que elige del
Padrón sólo elige: no da de alta. Y el botón que guarda una corrección dice guardar, porque ahí se
están cambiando datos de algo que ya existe; agregar es otra cosa y tiene su propio botón.

**El número de Legajo no se muestra en las fichas.** No es dato que sirva para reconocer a nadie, y
menos todavía como etiqueta de anuncio.

**El nombre visible del Cliente se calcula al mostrarlo, y no se guarda.** Se arma con el
apellido y los nombres del Paciente; cuando hay más de uno, **queda el más antiguo al que se le
esté brindando servicio**. Si aparece otra Cliente con ese mismo apellido y nombres, se le agrega
la localidad o el barrio. Si aun así siguen siendo dos, se le antepone el número de cliente. **El
número de cliente es otra cosa**: es único, no se reasigna nunca a nadie más, y es lo que usan el
sistema y los documentos. El nombre visible es para la pantalla.

**Las funciones internas de la base no viven en un esquema publicado.** Las que usan las políticas
de RLS están en el esquema `interno`, que queda afuera de la lista `schemas` de
`supabase/config.toml` a propósito: así no son direcciones web. Las políticas las siguen
encontrando porque guardan el identificador interno de la función, no su nombre. **Una función se
queda en `public` solamente si el navegador la llama a propósito, y entonces no puede recibir un
identificador que la apunte a otra Prestadora** — hoy la única es `ausencias_que_tapan`, que recibe
dos fechas y resuelve la Prestadora adentro con `current_tenant()`. Toda función nueva de política
nace en `interno`, y cualquiera que se quede en `public` y llame a una de ahí lleva `interno` en su
`search_path`. El reparto de permisos —cuáles pierden el alcance anónimo y cuáles conservan
`authenticated`— está en
`supabase/migrations/20260823010000_las_funciones_internas_de_la_base_no_se_llaman_desde_afuera.sql`,
y la mudanza en
`supabase/migrations/20260904090000_las_funciones_internas_salen_del_esquema_publicado.sql`.

**Y lo que llama un disparador tiene que estar del lado de adentro.** Un disparador que no es
`SECURITY DEFINER` corre con el rol de quien está escribiendo, así que lo que llama por dentro se
comprueba contra ese rol y no contra su dueño. Si la función que llama está cerrada a
`authenticated`, ninguna persona con sesión puede escribir en esa tabla: el síntoma es
`42501 permission denied for function`, y así estuvieron catorce tablas hasta la migración
`20260910190000_lo_que_llama_un_disparador_no_se_lo_pide_prestado_a_quien_inserta.sql`. La salida
no es abrirle la función a `authenticated` en `public` —eso la convierte en dirección web— sino
mudarla a `interno` y darle el permiso ahí. **No se convierte el disparador en `SECURITY
DEFINER`**: sumaría código corriendo con privilegio de dueño y le sacaría la protección por fila a
las consultas que hace por dentro. El Desarrollador la adoptó como propia, textual: *«no era mia,
pero desde ahora en mas lo es»*.

**Ninguna prueba del backend ve esto**: casi todo el backend entra todavía con la llave de
servicio, que puede ejecutar todo, y las pruebas del backend contestan con una base de mentira. Lo prueba `scripts/probar_altas_con_sesion.mjs`, que da de alta con la credencial de una
persona y además le pregunta a la base si algún disparador quedó pidiendo un permiso que no
tiene. Se corre con la base local levantada, junto con `scripts/probar_aislamiento.mjs`.

**El aislamiento lo hace cumplir la base, y el backend todavía no está ahí.** Hoy el backend entra
con `SUPABASE_SERVICE_ROLE_KEY`, que alcanza todas las Prestadoras y se saltea la protección por
fila, así que lo que separa una de otra son los filtros escritos a mano en cada ruta. Las tareas
automatizadas ya salieron de ahí: corren de a una Prestadora por vez con la credencial del trabajo
sin persona, que genera `backend/src/db/connection.js`. Los tres middleware de entrada también:
comprueban la credencial con la clave pública y leen a la persona con `clienteDelPedido(req)`, que
es la única forma en que una ruta toma la conexión de quien pide; la primera ruta que la usa es
`panelReferenciasLaborales.js`. Las demás rutas todavía no, y eso incumple
`..\..\CLAUDE.md` §5 —«no se puede tener una credencial que alcance a todas las Organizaciones»— y
se está reemplazando: **cada pedido de una persona pasa a la credencial de esa persona, y lo que no tiene
persona detrás lleva una credencial acotada a sus tablas y funciones, de a una Prestadora por
vez.** Los pasos, con sus comprobaciones, están en `docs/PLAN_HASTA_PRODUCCION.md`, sección «Los
cimientos».
Ninguna propuesta que agregue una red más encima de la llave maestra se acepta: el arreglo es
sacarla.

**Y el sistema tiene que poder demostrar lo que hace, no sólo hacerlo.** Careonys trata datos de
salud, así que lo alcanzan HIPAA en Estados Unidos, el Reglamento General de Protección de
Datos y las normas nacionales en Europa, y las diez leyes de protección de datos y de historia
clínica de los países latinoamericanos donde se vende. Qué exige cada una, con artículo, y en qué
estado está el producto frente a ella, está en `docs/CUMPLIMIENTO_NORMATIVO.md`; qué hay que
construir para llegar, en `docs/PLAN_HASTA_PRODUCCION.md`. **Ninguna afirmación de
cumplimiento se escribe sin artículo citado, y no se afirma ninguna certificación**: de HIPAA no
existe certificación de ninguna clase, y de protección de datos europea tampoco.

**Los datos están alojados en São Paulo.** Para todo país que no sea Brasil eso es transferencia
internacional, y para Alemania y Francia hoy impide vender. Antes de dar de alta una Prestadora de
un país nuevo, el documento de cumplimiento tiene que decir qué habilita alojar allá los datos de
salud de ese país.

**Ninguna palabra de Careonys entra en un módulo** —Prestadora, Guardia, Paciente, Servicio— si el
otro producto no la tiene. Todavía no hay ningún módulo; sacar una pieza de acá para convertirla
en uno entra por `..\..\CLAUDE.md` §11, nunca como parte de otra tarea. Anotado en
`docs/PLAN_HASTA_PRODUCCION.md`, sección «Módulos».

**Nunca datos reales en pruebas: se usa Sandbox y datos inventados.**

**Antes de cerrar una tarea:** ¿se consultaron los tres archivos de reglas? ¿aislamiento entre
Organizaciones mantenido? ¿términos del glosario aprobados? ¿cuatro estados cubiertos?
¿documentación al día? Si alguna respuesta es no, la tarea no está terminada.

## 7. Despliegue

**Un push no es un despliegue por sí solo — lo es porque hay un automatismo que lo convierte en
uno.** Cada `push` a `main` que toca `backend/`, `panel/`, `pwa-clientes/` o `pwa-asistentes/`
dispara el despliegue de esa parte (`.github/workflows/deploy-backend.yml` y
`publicar-pantallas.yml`). Los proyectos de Cloudflare Pages son de **subida directa**: no están
enganchados a GitHub, publica el automatismo. Comprobar que salió bien con `gh run list` y la
dirección en vivo respondiendo.

## 8. `Exclusivo <Prestadora>/`

Carpeta reservada: guarda lo que es puramente de una Prestadora —su identidad de marca, su
configuración de negocio, su investigación de competencia—. **No se entra: no se lee, no se lista,
no se cita su contenido**, salvo orden explícita del Desarrollador en esa misma sesión. No alcanza
con que la tarea roce el tema, y el permiso no se hereda de una sesión a la siguiente. Cualquier
carpeta nueva con material de una sola Prestadora se nombra igual y queda bajo esta regla.

## 9. Protocolo de sesión

Lo general está en `..\..\CLAUDE.md` §12. Acá, lo de este producto.

**Al iniciar:** leer este archivo, `..\..\CLAUDE.md`,
`..\..\docs\REGLAS_PRODUCTOS_CAREONYS.md`,
`..\..\docs\GLOSARIO_PRODUCTOS_CAREONYS.md`, `docs/CONTEXT.md`, `docs/PLAN_HASTA_PRODUCCION.md` —la lista
de pasos, en orden— y el PRD que corresponda al paso que se va a hacer. Confirmar en una línea:
*«Leí los documentos correspondientes. Paso del plan: [X]. Último paso terminado: [Y]. Tarea de
esta sesión: [Z].»*

**Cómo se escribe la ruta de un documento.** Hay dos carpetas `docs/`: la del producto y la de la
empresa. Un documento del producto se cita desde la raíz del producto —`docs/CONTEXT.md`—; uno de
la empresa, con la ruta entera desde `celtatech/` —`celtatech/docs/ARQUITECTURA_NIVELES.md`—.

**Todo se verifica contra el código escrito y la base en vivo, nunca contra documentos ni
migraciones** (`..\..\CLAUDE.md` §12). Acá, cómo: la base se consulta con
`supabase db query --linked "…"`, que pregunta a la instancia enlazada y no necesita Docker. Las
migraciones no son el estado: son instrucciones que ya se ejecutaron, y este producto juntó
tantas que se contradicen entre sí. `supabase migration list --linked` sólo sirve para saber si
quedó alguna sin aplicar, nunca para saber cómo está la base.

**Por qué cambió una regla** va a `docs/claude_history.md`, en una línea: qué decía antes, qué
dice ahora y el motivo. Se revisa antes de proponer algo que suene a tema ya debatido.

**Qué falta hacer:** `docs/PLAN_HASTA_PRODUCCION.md`, una sola lista numerada, en orden. **No se
abren pendientes nuevos:** un problema que aparece se arregla en el momento; si no cabe en la tarea
que se está haciendo, se agrega como paso en el lugar de la lista que le corresponde. Un paso
terminado se borra: no se marca como hecho, se saca.
