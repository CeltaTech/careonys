# Legajo para el futuro

> Ideas del Desarrollador que hoy no se pueden aplicar, y que se vuelven soluciones cuando las
> condiciones estén dadas. **Nada de acá se construye**: no son pasos del plan ni pendientes. Una
> idea sale de este archivo el día que él decide construirla, y ahí entra al plan como paso.

## Cámaras en el domicilio

Que el Cliente y la coordinación puedan ver qué pasa en la casa mientras el Asistente está solo
con el Paciente.

Para quién es cada cosa:

- **El Cliente** mira a su Paciente. Es el uso que la ordena: quien contrata el cuidado de su
  madre quiere verla.
- **La coordinación** mira la prestación. Es lo que hoy no tiene: sabe que el Asistente fichó,
  y nada más.

Lo que hay que resolver antes de construirlo, porque cambia qué producto es:

- **Filmar a quien trabaja es otra cosa que filmar la casa.** Una cámara que muestra al Paciente
  muestra al Asistente ocho horas seguidas. Eso entra por el marco normativo de cada país, que
  acá se carga por país y nunca se deduce por parecido con otro.
- **Quién pone la cámara y de quién es.** Si la pone el Cliente en su casa, es de él y Careonys
  se conecta. Si la pone la Prestadora, la Prestadora está filmando a su propio personal.
- **Qué se guarda y por cuánto.** Ver en vivo y guardar lo grabado son dos productos distintos,
  con dos riesgos distintos. Lo grabado en una casa donde se cuida a alguien es dato de salud.
- **Qué ve la coordinación, y cuándo.** Mirar cuando quiera no es lo mismo que mirar cuando hay
  una alerta.
- **Careonys no presta el servicio de cuidado y tampoco prestaría el de vigilancia.** Habría que
  definir qué pone el producto y qué pone el proveedor de las cámaras.

## Qué muestra cada pantalla, y qué queda afuera

Repasar el Panel y las dos aplicaciones de teléfono, pantalla por pantalla, para ver qué se le
muestra a cada quien y qué se deja afuera a propósito.

Hay configuraciones que hoy existen sólo en la base y que ninguna pantalla muestra. Por ejemplo,
cuáles personas de la Prestadora ven la HCE de un Paciente. En ese repaso se decide, una por una,
si la Prestadora tiene que verla o manejarla, y con qué palabras. La redacción de lo que se muestre la aprueba el
Desarrollador.

## Las aplicaciones en las tiendas

Que las aplicaciones de teléfono —la del Cliente, la del Asistente y el Panel instalado— se
descarguen de las tiendas de Apple y de Google. Se considera cuando todo esté terminado y ajustado
y haya pasado la etapa de prueba.

Lo que hay que resolver antes:

- **A nombre de quién se publica.** En el teléfono cada aplicación muestra la marca de la
  Prestadora. En la tienda hay un solo nombre y un solo ícono por aplicación: o se publica una
  sola, con el nombre del producto, o una por Prestadora.
- **Cada versión pasa por la revisión de la tienda.** Hoy un cambio llega al teléfono apenas se
  publica; desde la tienda, recién cuando la tienda lo aprueba.
- **Las cuentas de publicación en cada tienda**, y de quién son.

## Cobrar varias Prestaciones juntas por un precio

Que la Prestadora pueda cobrar varias Prestaciones de un mismo Paciente por un precio único, en
vez de la suma de cada una. Queda para la siguiente versión del producto.

Lo que hay que resolver antes:

- **Es política comercial de cada Prestadora.** Si junta o no sus Prestaciones, y cómo, lo decide
  ella. El producto le da formas de cobro para elegir, no le impone una.
- **Hoy no hay elementos de juicio** para decidir con algún criterio sólido cómo se arma, qué pasa
  si una de las Prestaciones termina antes que las otras, ni cómo se corrige o se da de baja.
- **La pieza que lo hacía está en el estante**, en `Codigos-utiles\paquetes-de-prestaciones\`.

## Más de una región

Que Careonys funcione con bases en más de un lugar del mundo. Queda para la siguiente versión del
producto: hoy hay una sola, en São Paulo, y ningún cliente la pide. Se abre el día que aparezca el
primer cliente de un país cuya ley exija tener los datos en otro lado, como Alemania o Francia.

**Una región es el lugar del mundo donde viven los datos de una Prestadora, con todo lo que los
trata**: la base, los archivos, las copias de respaldo, el Backend y los servicios que reciban esos
datos. La ley alemana limita el lugar donde se tratan los datos de salud, no sólo donde se guardan,
así que una región europea lleva su propio Backend. En la práctica son dos instalaciones
independientes del mismo programa, con el mismo código y sin nada compartido.

Lo que ya está decidido:

- **La región la decide CeltaTech al dar el alta**, según el domicilio de la Prestadora, y se la
  informa a Careonys. Cada Prestadora vive en una sola.
- **Careonys no se mete con la gente de la Prestadora** para decidir adónde va: la región es de la
  Prestadora, y sus Asistentes y sus Clientes viven adentro de ella.

Lo que ya existe en el código: el Backend elige la base en un solo lugar,
`backend/src/db/regiones.js`, que hoy conoce una sola región.

Lo que hay que resolver antes de construirlo:

- **El costo de mantener dos instalaciones**: cada cambio de la base se aplica en las dos, y hay
  dos Backends que vigilar.
- **Los clientes con operación en varios países.** La ley argentina declara adecuada a la Unión
  Europea, así que datos argentinos pueden vivir en una instalación europea sin instrumento
  aparte. Al revés no: datos franceses no pueden vivir en São Paulo.
- **Cómo llega cada persona a la instalación de su Prestadora**, sin que ninguna parte del
  producto busque a nadie por fuera de su Prestadora.
- **Si Supabase tiene la certificación que exige Francia.** No se comprobó.

## Una página por Prestadora

Que cada Prestadora tenga su propia página dentro del dominio del producto, del tipo
`cuidardelsur.careonys.com`.

Lo que ya está y lo que no se toca:

- **En Cloudflare ya existe el comodín** `*.careonys.com`, que hace que cualquier dirección dentro
  del dominio llegue a Cloudflare. Se deja puesto para esto. Hoy esas direcciones contestan con un
  error, porque nada las atiende.
- **La página no tiene nada que ver con entrar al Panel.** La coordinación entra con su nombre de
  usuario, `parte_código`, y la recuperación de la clave va por el nombre de usuario. Ni el
  ingreso ni la recuperación miran la dirección de la página, porque no todas las Prestadoras van
  a tener una.

## El logo en SVG

Que la Prestadora pueda subir su logo en SVG, que se ve nítido a cualquier tamaño.

Hoy no se acepta, en ninguno de los dos logos. Un SVG es texto, y puede llevar programas adentro.
Revisarlo buscando partes prohibidas no da certeza: siempre queda alguna forma que la lista no
prevé.

Lo que hay que estudiar antes de aceptarlo:

- **Convertirlo a PNG al recibirlo** y guardar sólo el PNG. Lo que queda guardado es una imagen sin
  instrucciones, y el original no se conserva. Hace falta sumarle al backend una herramienta que
  convierta imágenes.
- **Reescribirlo con una lista de lo permitido**, copiando sólo las partes autorizadas y
  descartando el resto, con una herramienta conocida y mantenida.
- **Cómo lo resuelven los sistemas que lo aceptan**: Wikipedia guarda el SVG y muestra un PNG que
  genera ella misma; WordPress no lo acepta de fábrica.

## Las tareas del producto, a cargo de cada Prestadora

Que ninguna tarea de los tipos de Asistente lleve candado. Las tareas que trae el producto también
se podrían editar y borrar, igual que las que agrega la Prestadora.

Cada Prestadora lo haría sobre su propia lista. Hoy, las tareas del producto son una sola lista
por país, compartida por todas las Prestadoras: cada una recibiría su propia copia y la cambiaría
sin alcanzar a ninguna otra.

Lo que hay que resolver antes:

- **Las Prohibidas.** Son las tareas que la ley de cada país le prohíbe a un tipo de Asistente:
  el Cuidador, por ejemplo, no pone inyecciones. Por la regla de CeltaTech sobre el riesgo legal,
  la tarea que la ley prohíbe no se asigna. Si la Prestadora pudiera borrar una prohibida, podría
  asignársela a un Cuidador. Hay que decidir si las Prohibidas entran o si se quedan como las trae
  el producto.

## El registro de accesos para Países Bajos

La norma holandesa NEN 7513:2018 se leyó
completa y se comparó con el registro: lo que falta, con su sección, está en
`docs/legal/paises_bajos.md`. **Espera a que haya un cliente en Países Bajos.**

**Comprobación:** cada campo que pide la norma está en `consultas_a_hce`, o se agregó.

## Las designaciones que no son programación

Representante legal en Perú y en
Ecuador, y delegado de protección de datos en Ecuador y en Uruguay. Son designaciones de CeltaTech
y condición para vender en esos países.

## Nada de riesgo alto del AI Act sin saberlo

Que no se entrenen modelos con
datos de las Prestadoras ya lo hace cumplir un control que corta la publicación si aparece una
llamada de entrenamiento (`scripts/verificar_entrenamiento_con_datos.mjs`). Queda esto, que no se
puede comprobar con un control automático y espera su decisión sobre qué hace la IA con los
Asistentes. La exposición no está en la vía clínica sino en el Anexo III punto 4(b): la IA que
asigna tareas según comportamiento o rasgos personales o evalúa desempeño. Un emparejamiento o una
planificación de Asistentes que los puntúa **es alto riesgo**, y la salida del art. 6(3) queda
cerrada por el perfilado. Rige desde el 2 de diciembre de 2027, con autoevaluación, pero no hay
norma armonizada y tampoco presunción de conformidad. **La transparencia del art. 50 no se aplazó
y rige desde el 2 de agosto de 2026.** Se cierra cuando usted decide si la IA puntúa Asistentes;
si los puntúa, la autoevaluación se hace antes de esa fecha.
