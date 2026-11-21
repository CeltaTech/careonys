# Informe de la ejecución del plan hasta producción

Este informe dice qué se hizo en cada paso del plan, y por qué no se hizo el resto. Los pasos
terminados ya no están en el plan. Los que quedan dicen qué esperan. Cada paso que se termine se
agrega acá, hasta que el plan quede vacío.

Se hicieron todos los pasos que no esperaban una decisión suya ni algo de afuera, salvo los que
necesitaban una pantalla nueva. La única pantalla nueva que salió es la del veto de la
administración, del paso 27.

## Lo que se hizo

**Paso 27, las sugerencias al armar el equipo del Servicio.** Al sumar a alguien al equipo de un
Servicio, la lista de Asistentes viene ordenada por lugar, tareas, Especialidades, antecedentes y
acuerdo económico, con los mismos criterios que la asignación de turnos de guardia. Si el Servicio
tiene turnos de guardia sin cubrir, también cuentan, y quien ya tiene otro turno a esa hora baja en
la lista con una advertencia. Un Servicio recién armado, sin turnos de guardia, recibe la lista
igual ordenada y con sus advertencias. Quien ya está en el equipo no se ofrece.

**Paso 27, la fecha desde la que rige el valor hora en la importación de Asistentes.** La
planilla para importar Asistentes acepta ahora una columna más: desde qué fecha rige el valor hora
de cada uno. La fecha se lee en los mismos formatos que el resto de la importación, con el día adelante. Un
renglón con una fecha que no se entiende no se importa y vuelve con ese motivo. Si la columna viene
vacía, el valor rige desde el día de la importación, igual que cuando se carga a mano.

**Paso 27, el veto de la administración sobre las decisiones del Coordinador.** La administración
de la Prestadora ya puede vetar cualquier decisión que el Coordinador tomó en un Servicio. En la
ficha del Servicio hay una pestaña nueva, Decisiones, que sólo ve la administración. Ahí está cada
decisión del Coordinador, con la fecha, qué cambió y si sigue vigente o fue vetada. El botón
«Vetar» abre una ventana que pide el motivo, y sin motivo no se veta.

Vetar deja las cosas como estaban antes de la decisión, de ese momento en adelante. Un turno de
guardia que ya empezó o que ya terminó no cambia. Si después de esa decisión alguien volvió a
cambiar los mismos datos, el sistema no aplica el veto y lo dice. Registrar un hecho, como una
ausencia, no se puede vetar; lo que el Coordinador decidió por ese hecho, sí. Un turno de guardia
que vuelve a un Asistente queda exactamente como estaba, y ese Asistente recibe el mismo aviso que
en una asignación. Cada veto queda en el registro de actividad, con quién, cuándo y el motivo.

El Coordinador se entera por tres caminos: un correo, un mensaje de WhatsApp y un aviso en el
Panel. En el menú le aparece «Decisiones vetadas», con cuántas tiene sin ver. Ahí ve el Servicio,
la decisión y el motivo, y la marca como vista.

De paso, cubrir un turno de guardia con un sustituto ahora se guarda en una sola operación de la
base: o queda todo guardado, o no queda nada.

**Paso 27, los criterios para sugerir Asistentes: el lugar, las tareas, la Especialidad, los
antecedentes y el valor.** Al asignar un turno de guardia, la lista de Asistentes sugeridas ahora
mira cinco cosas más:

- **El lugar.** Si la Asistente acepta trabajar en el lugar de todos los Pacientes del turno de
  guardia: su domicilio o el domicilio temporal vigente. Si falta el lugar, el criterio no opina.
- **Las tareas.** Una tarea o una vía de medicación prohibida para el tipo de la Asistente ya no
  deja asignarla, por ningún camino: la base lo rechaza al guardar. Una tarea no incluida en su
  tipo sólo avisa.
- **La Especialidad.** En Configuración, cada tarea del tipo de Asistente puede pedir una
  Especialidad. La sugerencia avisa cuántas le faltan a la Asistente.
- **Los antecedentes.** Las calificaciones, las faltas sin aviso y las llegadas tarde de los
  últimos 6 meses. Cada Prestadora cambia los meses y el peso de cada uno en la configuración del
  cálculo.
- **El valor.** En la ficha del Servicio, la administración carga el valor acordado con cada
  Asistente, con su moneda y desde qué fecha rige. La sugerencia dice sólo si ese valor coincide
  con el del Legajo. El Coordinador no ve ningún importe.

El valor del Legajo ahora tiene fecha desde la que rige y guarda la historia de los valores
anteriores. La liquidación paga cada día con el valor que regía ese día, aunque el valor haya
cambiado en la mitad del período. Si en un mismo período el Legajo tiene valores en dos monedas,
esa liquidación no se genera y se avisa. El valor del Legajo se ajusta por índice con el mismo
mecanismo que el precio al Cliente: cada Prestadora elige en Configuración qué índice, o ninguno,
y si se aplica solo o con revisión previa. Los ajustes con revisión previa aparecen en Ajustes por
índice para aceptarlos o rechazarlos.

De paso quedó corregido un defecto: al cubrir un turno de guardia, si la base rechazaba al
sustituto, quedaba guardada una cobertura sin turno. Ahora esa cobertura se borra.

No se hizo el nivel de complejidad, que espera la pregunta 82. Tampoco el valor del Legajo por
mes, que espera que se decida cómo se liquida un mes.

**Paso 25, el nombre «turno de guardia».** Todo lo guardado que es un turno de guardia ya se llama
turno de guardia, nunca «turno» a secas ni «guardia»: las tablas, las columnas, las funciones, las
reglas de acceso de la base, los tipos de aviso, las claves de los textos, el backend, el Panel y
las dos aplicaciones. La guardia como Prestación conserva su nombre. Se cambió todo junto, en una
sola publicación de la base y del programa, para que nada quede apuntando a un nombre viejo. Las
dos protecciones de la base que no dejan tocar un aviso atendido ni un texto propio se apartaron
sólo durante el cambio de nombre y quedaron encendidas otra vez. Además, las tareas automáticas
del backend ahora esperan a que se carguen los textos antes de su primera vuelta.

Dos defectos que aparecieron al revisar el paso 27 quedaron corregidos. La ficha de un Servicio no
abría en la nube: pedía el apellido de los usuarios del Panel, un dato que no existe, y por eso no
se podía asignar el Coordinador. Y la configuración del aviso de turno de guardia sin cubrir había
quedado con el nombre viejo en las dos Prestadoras de demostración: el sistema no la encontraba y
usaba los valores de fábrica. Ya tiene el nombre nuevo.

**Paso 13, la clave de cada Prestadora para los datos de otros servicios.** Las contraseñas que
una Prestadora carga para conectar otros servicios, como WhatsApp o su software de facturación,
ya no se guardan en la caja de Supabase. Ahora se guardan cifradas con una clave propia de cada
Prestadora. Una Prestadora no puede leer las de otra, aunque alguien se equivoque al escribir una
consulta. En la base en la nube no había ninguna cargada, así que no hubo nada que mudar.
La clave de cada Prestadora la va a generar el sistema solo en el alta, y la va a guardar CeltaTech.

**Paso 36, la confirmación del teléfono por la oficina.** Salió entera: la lista de números que
esperaban la confirmación de la oficina, el botón «Confirmar el teléfono» y el contador del menú.
Ahora un número sirve para recuperar la contraseña cuando la persona lo verificó con el código que
le llegó. Las 3 confirmaciones guardadas eran de la Prestadora de demostración.

**Paso 37, la seguridad de la cuenta en las dos aplicaciones.** El backend ya les ofrece a los
Asistentes y a los Clientes lo mismo que al Panel: verificar el teléfono, cambiar el número,
reconocer el equipo y cerrar todas las sesiones. Falta la pantalla en cada aplicación. El paso
quedó en el plan como suyo, porque son pantallas nuevas y esperan su autorización.

**Paso 28, lo que ve la Coordinadora.** La Coordinadora ya no recibe el domicilio de cada
Asistente para calcular quién está cerca. Recibe sólo la distancia al Paciente, redondeada a cien
metros. Del Padrón ve los Asistentes de su zona y los de sus Servicios, y sólo mientras tiene una
emergencia abierta. Las calificaciones, sólo de esos mismos Asistentes. Lo demás del paso espera
sus decisiones y quedó en el plan.

**Paso 113, el alta de una Prestadora desde CeltaTech.** Existe la entrada por la que CeltaTech
da de alta una Prestadora nueva. Sólo abre si el pedido viene firmado con la clave de CeltaTech.
Crea la Prestadora con su código y su casilla de correo, y si el mismo pedido llega dos veces, no
crea dos. Quedó en el plan lo que falta: usted carga la clave de firma en Railway y agrega el
código de la Prestadora al modelo comercial, y CeltaTech necesita la herramienta que entrega la
contraseña del Administrador.

**Paso 137, el respaldo del código borra los vencidos.** El respaldo nocturno del código ahora
borra los paquetes vencidos: guarda 30 días de diarios y uno por mes durante un año. El de los
datos usa la misma regla. Lo que no se pudo comprobar: si las llaves de los dos depósitos de
respaldo tienen permiso de borrar. Si no lo tienen, el respaldo sale igual y el registro de la
corrida lo dice.

**Paso 130, la inteligencia artificial.** Hay un control que frena la publicación si algún código
manda datos de producción a entrenar un modelo. Su decisión pasó al Legajo para el futuro: si la inteligencia
artificial puntúa Asistentes. Si los puntúa, la ley europea pide una autoevaluación antes del 2 de
diciembre de 2027.

**Paso 95, los datos personales.** Está escrito para qué sirve cada dato personal y quién lo lee.
Aparecieron 5 grupos de datos que nadie usa. No se sacó ninguno, porque sacarlos borra datos:
espera su decisión.

**Paso 63, el relevamiento de los textos.** Se revisaron los 4128 textos en castellano, más el
inglés y el portugués. No hay tuteo ni voseo. Quedaron 44 fichas de redacción para que usted las
apruebe. Ninguna está aplicada.

**Paso 140, la compra de contactos.** El software de cobranzas ya puede avisar, firmado, cada pago
de un acceso de Match. Con ese aviso el sistema anota el pago, suma los contactos de un paquete y
pone el acceso vigente, en período de gracia, suspendido o de baja, todo en una sola operación. Si
el mismo aviso llega dos veces, no se anota dos veces. Un acceso en período de gracia abre
contactos hasta el día anterior a la suspensión. Uno dado de baja abre hasta el último día pagado.
El Panel muestra los dos estados nuevos en los tres idiomas. La función que antes sumaba los
contactos quedó sin uso y se guardó en el estante de código. Falta el botón de compra y el de baja
en la aplicación del Cliente: son pantallas nuevas y quedaron en el plan como suyas.

**Paso 64, la modalidad en el Panel.** Con una sola modalidad habilitada, Estado actual ya no
muestra el recuadro «Servicios por modalidad», y las otras dos tarjetas ocupan el ancho. El Resumen
ya lo hacía así. El motivo por el que un Asistente no puede tomar una guardia hoy no se ve en
ninguna pantalla, así que no hubo nada que cambiar ahí. Queda en el plan el nombre comercial de
cada modalidad, que tiene que llegar desde CeltaTech: espera el paso del alta de una Prestadora.

**Paso 121, la revisión del registro de accesos.** El sistema ya junta los accesos fuera de lo
normal: fuera de horario, sin guardia con el Paciente, o sobre demasiados Pacientes en un mismo
día. Arma el resumen por persona del personal y todos los días cuenta lo del día anterior. Guarda la
firma de quien revisó, con fecha y nombre, y anota cada vez que alguien mira o descarga el registro.
Falta la pantalla donde la administración lo ve y firma: quedó en el plan como suya.

**Paso 123, los derechos de la persona sobre sus datos.** El sistema ya guarda cada pedido de una
persona sobre sus datos, con su plazo contado en días hábiles del país, y avisa antes de que venza.
Un pedido respondido ya no se puede modificar. También está lista, del lado del sistema, la descarga
de los datos propios del Cliente y la lista de quién entró a la información de salud de su Paciente.
Faltan las pantallas en el Panel y en la aplicación
del Cliente: quedaron en el plan como suyas. Los plazos y los feriados de cada país se cargan con la
configuración legal por país; hoy no hay ninguno cargado.

**Paso 124, las brechas de seguridad.** El sistema ya guarda cada incidente de seguridad: cuándo
ocurrió, cuándo se supo, qué Pacientes alcanzó, su evaluación y cuándo se avisó a quién. La cuenta
regresiva del aviso la calcula la base con el plazo del país. Un aviso dado no se puede cambiar.
Están cargados los plazos de Costa Rica y Panamá. Falta la pantalla: quedó en el plan como suya.

**Paso 125, quién entra y cómo.** Las dos aplicaciones ahora cierran la sesión por inactividad,
igual que el Panel, con una franja que avisa el último minuto. El registro anota cuándo alguien
cierra la sesión, a mano o por inactividad, y cada archivo que alguien descarga. Existe el acceso de
emergencia: quien no alcanza la información de salud de un Paciente la puede abrir por un tiempo
acotado, con el motivo escrito, y queda anotado aparte en el registro. Quedaron en el plan como
suyos el segundo paso de verificación obligatorio y el botón del acceso de emergencia, porque son
pantallas nuevas.

**El alta de una Prestadora.** La da CeltaTech. Lo que le toca a CeltaTech salió del plan de
Careonys y pasó a la lista de CeltaTech: generar la clave compartida de la firma y cargarla en los
dos lados, firmar y mandar el alta, y entregarle al Administrador su primera contraseña. El código
de la Prestadora quedó escrito en el modelo comercial de CeltaTech, entre los datos que Careonys
pide para el alta. En Careonys quedó que el alta genera y guarda sola las cuentas automáticas y las
claves de cada Prestadora, sin pedirle nada a nadie. Dónde se guardan lo administra CeltaTech para
todos sus productos, y también pasó a su lista.

**Paso 26, la firma del Responsable de pagos.** Cada Prestadora decide si un Servicio puede
programar guardias sin la firma del Responsable de pagos. En Configuración, en la parte del
cuidado, hay una opción nueva: «Programar guardias sólo con la firma del Responsable de pagos».
Viene apagada, así que ninguna Prestadora cambia de comportamiento hasta que la encienda. Con la
opción encendida, el sistema no deja programar una guardia ni una serie de guardias en un Servicio
que no tenga la firma vigente de su Responsable de pagos. Al intentarlo, la persona ve un mensaje
que dice qué falta. El detalle del Servicio muestra el mismo tipo de aviso que muestra cuando falta
el Coordinador. Las guardias que ya estaban programadas siguen igual.

El Responsable de pagos ahora se puede cambiar con el Servicio en curso. En la pestaña Pagos del
Servicio, quien elige otro Responsable de pagos indica también desde qué día rige el cambio. Puede
ser cualquier día, pasado o futuro. La factura sale siempre a nombre del Contratante, que es quien
asume la responsabilidad legal y comercial de contratar a la Prestadora. Por eso un cambio de
Responsable de pagos no parte ninguna factura. La única excepción la pone la Prestadora, para un
Servicio puntual: al elegir el Responsable de pagos marca la casilla «Facturar a nombre del
Responsable de pagos», y desde ese día la factura sale a nombre de él. Sólo cuando cambia la
persona a cuyo nombre sale la factura, y el cambio cae en la mitad de un período, la factura de ese
período sale partida en dos: una por los días anteriores al cambio y otra por los días siguientes.
Cada una cobra sus propios días, y entre las dos suman el período entero. Las facturas de esos días
que todavía no se mandaron a facturar se vuelven a armar solas, ya partidas. Si alguno de esos días
ya está en una factura emitida, con cobros o con correcciones, el sistema no hace ese cambio y
avisa que se elija un día posterior a esa factura. La firma del anterior sigue valiendo para sus
días, y el nuevo firma su propio documento. Si el anterior tenía un documento sin firmar, ese
documento se anula. También quedó corregida una falla de la pestaña Pagos, que no dejaba abrirla.

Un Servicio ahora puede tener varios Responsables de pagos a la vez. En la pestaña Pagos del
Servicio están todos en una lista, cada uno con el día desde el que rige y el día hasta el que
rige, o «Sin fecha de fin». El botón «Agregar Responsable de pagos» suma uno más sin sacar a los
otros. El que desiste se anota con «Cambiar fecha de fin»: deja de regir después de ese día, y la
factura sigue saliendo a nombre del Contratante. La misma persona no puede estar dos veces en los
mismos días. Cada uno firma su propio documento. Con la opción de la Prestadora encendida, para
programar guardias tienen que haber firmado todos los que rigen hoy. La factura sale a nombre del
Contratante. La indicación «Facturar a su nombre» va en un solo Responsable de pagos por día, y el
sistema no deja ponerla en dos. Con la opción apagada y sin la indicación, nada cambia.

El envío del documento por correo para que el Responsable de pagos lo lea y lo firme se probó
entero el 8 de noviembre de 2026: llegó el correo, el enlace abrió el documento, el botón «Firmar»
dejó la firma registrada y apareció «Descargar».

## Cómo se comprobó

El veto del paso 27: pasaron las 2743 pruebas del backend y las 1072 del Panel, y el Panel
construye sin error. En la base local se probaron siete casos de veto, entre ellos el cambio
posterior que rechaza el veto, el veto sin motivo y el veto pedido por un Coordinador o por otra
Prestadora, que la base rechaza. El caso del turno de guardia que ya empezó no se probó en la base
local. La migración está aplicada en la base en la nube. No se
corrieron las dos comprobaciones que entran con la contraseña de las Prestadoras de demostración,
porque esa contraseña la tiene usted.

Pasaron las 2507 pruebas del backend, las 889 del Panel, las 6 de la aplicación de los Clientes y las 41
de la aplicación de los Asistentes, y las tres construyen sin error. La prueba que lee cada tabla con cada
cuenta de las Prestadoras de demostración pasó: ninguna ve datos de otra. La base reconstruida
desde cero coincide con el esquema escrito. Las 6 migraciones nuevas están aplicadas en la base en
la nube, y también las 4 de los pasos 121, 123, 124 y 125.

El cambio de nombre del paso 25 se probó en la base local con dos avisos inventados, uno atendido y
otro pendiente, cargados antes de la migración: los dos quedaron con el tipo nuevo y las dos
protecciones encendidas. Pasaron las 2539 pruebas del backend, y la prueba de aislamiento entre las
dos Prestadoras de demostración no encontró ningún dato cruzado. En la base en la nube la migración
está aplicada, el aviso atendido tiene el tipo nuevo y la tabla vieja ya no existe.

Los dos defectos del paso 27: pasaron las 901 pruebas del Panel, la base local se reconstruyó desde
cero sin error, y en la nube los dos avisos tienen el nombre nuevo y no queda ninguno con el viejo.
La ficha del Servicio no se abrió en el Panel publicado, porque para eso hay que entrar con un
usuario de demostración, y ese acceso lo tiene usted.

No se corrieron las tres comprobaciones que entran con la contraseña de las Prestadoras de
demostración, porque esa contraseña la tiene usted.

## Lo que le toca a usted

- Lo que tiene contratado cada Prestadora y la región de cada país.
- Aprobar las 44 fichas de redacción.
- Decidir si se sacan los 5 grupos de datos personales que nadie usa.
- Revisar si las llaves de los dos depósitos de respaldo tienen permiso de borrar.
- Autorizar las pantallas de seguridad de la cuenta en las dos aplicaciones.
- Autorizar los botones de compra y de baja del acceso de Match en la aplicación del Cliente.
- Autorizar la pantalla de la revisión del registro de accesos.
- Autorizar las pantallas de los derechos de la persona, en el Panel y en la aplicación del Cliente.
- Autorizar la pantalla de las brechas de seguridad.
- Autorizar la pantalla del segundo paso de verificación y el botón del acceso de emergencia.

## Los pasos que no se hicieron

**Esperan una decisión suya.** Son 67 pasos. Cada uno dice en el plan qué pregunta espera.

**Dependen de un paso suyo o de algo de afuera.** Son 35. Por ejemplo, los contratos con los
proveedores esperan que CeltaTech esté constituida. El registro de accesos holandés pasó al Legajo
para el futuro.

**Los que no esperan nada, pero necesitan pantallas nuevas.** No se hicieron, porque usted pidió
que no saliera ninguna pantalla nueva:

- Paso 31, las cinco formas de cerrar un turno.
- Paso 33, el aviso al Cliente y el Egreso sin relevo.
- Paso 35, las tres elecciones de horas y la confirmación previa del relevo.
- Paso 40, los datos bancarios en la aplicación del Asistente.
- Paso 141, el tablero con los once renglones y el Resumen del mes.
- Paso 80, el Panel instalable en el teléfono.
- Paso 160, cuántos correos mandó cada Prestadora contra el tope del proveedor de correo.
- Paso 164, el manual del usuario, que primero pide sacar o construir pantallas.

**Los que no esperan nada, pero no se podían hacer sin usted.**

- Paso 97, rotar las contraseñas que estuvieron a la vista: son contraseñas de cuentas, y las
  maneja usted.
- Paso 101, renombrar los dos depósitos de respaldo: mueve los respaldos guardados en un servicio
  de afuera.
- Paso 126, probar una restauración real: necesita la clave privada de los respaldos, que tiene
  usted.
- Paso 127, cargar la configuración legal por país: cada texto sale del documento legal del país,
  y el contacto del delegado espera sus designaciones.
- Paso 129, los documentos de auditoría: incluyen una prueba de seguridad hecha por un tercero.
- Paso 161, los archivos del logotipo del producto: son una decisión de identidad visual.
