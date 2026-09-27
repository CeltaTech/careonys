# PLAN — El acto de armar y mantener un Servicio

> **Estado: esperando aprobación del Desarrollador. No se escribió ni una línea de código.**
>
> Este documento es el paso 2 de la regla de la empresa para un cambio grande —inventario, plan
> aprobado, y recién después código de producción (`celtatech/CLAUDE.md` §11)—. El inventario está
> en la sección 5, hecho contra el código real y no contra la memoria ni contra documentos viejos.
>
> **Un paso terminado se borra de acá, no se marca como hecho.**

---

## 1. De dónde sale este plan

El Desarrollador planteó un caso y pidió que se auditara si el sistema puede sostenerlo:

> «el cliente "XX" contrata un servicio de cuidado domiciliario que debe cubri 24 hs al dia 7 dias a
> la semana durante un periodo indeterminado de tiempo», «el servicio se debe cubrir en la zona
> "JJ"», «como esta previsto poner esto en marcha y mantenerlo?»

Y sobre esa base fijó cuatro requisitos, textuales:

1. «Deberia existir la opcion indeterminada, es decir que la configuracion que se arme para cubrir
   la semana se mantenga en el tiempo, salvo intervencion de la coordinacion para suspenderlas
   total o parcialmente (vacaciones, enfermedad de algun asistente, fin del servicio, etc)»
2. «No puede haber un hueco invisible desde el momento en se contrata el servicio y se arman las
   guardias (que pueden variar de muchas formas posibles) el sistema ya sabe que periodos de tiempo
   deben estar cubiertos, no debería ser posible que haya un hueco y nadie se de cuenta, para eso
   esta el sistema»
3. «Se debe pausar, suspender, modificar, cancelar. etc un servicio total o parcialmente»
4. «Puse Zona JJ como un generico, las zonas ya estan precargadas, cada coordinador coordinadora
   atiende las suyas»

Y describió el acto que falta, también textual: «es un acto que cubre la persona de administracion,
cuando arma el servicio, dice quien lo va a realizar, quien lo va a coordinar, etc».

---

## 2. Advertencia sobre las pruebas: los datos cargados no son evidencia

Lo dijo el Desarrollador y condiciona todo lo que sigue:

> «tanto las prestadoras como los servicios y cada uno de los datos que haya en las prestadoras
> actuales son ficticios y sembrados por vos para poder hacer pruebas y ensayos»

De ahí salen tres consecuencias que se aplican en todo este plan:

- **La forma de lo cargado no prueba nada.** Cuántos Servicios hay, cómo están armados y qué patrón
  siguen es siembra propia. Lo que vale como fuente es el código, las migraciones, las reglas
  escritas y lo que dice el Desarrollador.
- **No hay datos históricos que convertir.** Se evaluó construir un convertidor con IA para leer los
  «días» y «horario» escritos a mano y proponer su versión en forma de dato. **No se construye:** no
  hay nada real que convertir. Los casilleros se cambian y la siembra se vuelve a hacer con la forma
  nueva.
- **La migración que creó los Servicios no valida el modelo.**
  `supabase/migrations/20260910220000_el_precio_el_calendario_y_el_cierre_cuelgan_del_servicio.sql`
  comprueba con rigor que no perdió ninguna fila —hay un bloque que hace fracasar la migración
  entera si algo quedó colgado de un Servicio que no le corresponde a su Paciente, o si algo quedó
  sin Servicio—, pero lo que no perdió era siembra.

---

## 3. Lo que hoy funciona y no se rehace

Verificado contra el código en esta auditoría. Se deja escrito para que ningún paso de este plan lo
vuelva a construir ni lo rompa.

**La serie de duración indeterminada.** Una serie con `vigente_hasta` vacío no se renueva: hay un
pasaje diario que le mantiene el horizonte de turnos generados por delante.
`backend/src/utils/generacionSeriesGuardia.js` → `extenderSeriesGuardiaAbiertas()`, llamada una vez
por día desde `server.js`, mantiene generados los días que diga `prestadoras.dias_generacion_series_guardia`
(90 por defecto, con la misma cifra escrita en el código como red). Recorre sólo Prestadoras
certificadas. **Es lo único previsto específicamente para el tiempo indeterminado, y funciona.**

**El fin del Servicio, entero, con motivo del catálogo de la Prestadora.** Está en
`panel/src/pages/clientes/PrestacionesPaciente.jsx`: inserta en `cierres_servicio_paciente` y
encadena las prestaciones a de baja, los paquetes a de baja, las series a cancelada y los turnos
programados a cancelada con alcance total. Registra qué Asistentes quedaron involucrados y su
estado de aviso. La fecha de fin la pone la base.

**Los seis mecanismos de aviso sobre un turno con problema.** Ausencia avisada con tiempo y ausencia
de golpe —el borde son 24 horas—; el incidente de turno sin cubrir, con horas para abrirlo y horas
entre recordatorios configurables por Prestadora; el incidente que **no se cierra solo** si nadie
fue, y espera a que una persona elija cómo terminó; la alerta temprana cuando llega la hora de
inicio sin marca de salida, sin aviso de demora y sin llegada registrada; y la guarda que impide que
una guardia de cobertura arranque sin sustituto asignado.

**La estructura de zonas, completa y cargada en las dos puntas.** `lugares`, `zona_lugares`,
`asistente_lugares` y `usuario_lugares`. Lo guardado son siempre lugares, nunca zonas: la zona es
atajo para cargar y forma de hablar en pantalla. El Paciente tiene su lugar desde
`20260921110000_el_domicilio_deja_de_estar_todo_junto.sql`, y el alcance de cada coordinadora se
guarda también en lugares, para que las dos puntas de la comparación sean la misma cosa.

**El Servicio como envase.** Guarda poco de sí mismo, pero es el punto al que apunta todo lo
pactado: las prestaciones, las series —y los turnos heredan el Servicio de su serie—, y los cierres.
Quién contrata se resuelve por tipo de contratante más identificador, sin clave foránea a propósito,
con un disparador que falla cerrado.

**La cancelación de un turno suelto, con motivo y con alcance parcial o total.** `guardias.cancelacion_alcance`
admite parcial y total. **Es el único lugar del sistema donde hoy existe la idea de «parcial».**

---

## 4. Los cinco defectos, con su evidencia

Los cinco son el mismo agujero: **no existe el acto de armar y mantener un Servicio.** La estructura
está; el acto de administración que la llena es lo que falta.

### 4.1. Lo pactado se declara en texto libre, así que no se puede restar

`panel/src/pages/clientes/PrestacionesPaciente.jsx:50-52` y `:765-766`. «Días» y «horario» son dos
casilleros de texto escritos a mano. Quien carga escribe «lunes a domingo» y «24 hs», o «todos los
días», o «L a D / turnos de 6». Las series, en cambio, guardan días de la semana marcados y hora de
inicio y de fin, en forma de dato.

Entonces no hay ninguna comparación posible: de un lado una frase escrita a mano, del otro números.
El sistema tiene las dos mitades y no puede restarlas. **De ahí sale el hueco invisible, y no de que
falte información.**

Y esos dos casilleros están además contra una regla del propio producto: «Un casillero que nombra
algo que existe en otro lado es una lista, y nunca texto libre» (`careonys/CLAUDE.md` §6). Los días
de la semana y un horario existen en otro lado.

### 4.2. El único caso ciego del sistema

Con una ausencia, el turno existe y los seis mecanismos se disparan. Con una serie cancelada, o
nunca cargada, **no hay fila que recorrer**: todos los avisos del sistema salen de recorrer turnos, y
el turno que nunca se creó no está en ninguna tabla. Nada puede encontrarlo.

### 4.3. Modificar no existe en ningún nivel

Grep de `from('series_guardias')` en todo el Panel: siete resultados, y **ninguno es una edición**.
Dos leen, dos cancelan todas, uno pausa todas, uno reactiva todas, uno crea. Una serie se crea y no
se puede editar nunca — ni el horario, ni los días, ni el Asistente. Para cambiar el turno de la
noche hay que cancelar y volver a cargar, y la continuidad se pierde.

### 4.4. La suspensión es sólo total, y sin fecha de vuelta

`PrestacionesPaciente.jsx:466` y `:470` pausan **todos** los turnos programados y **todas** las
series activas del Paciente de una vez. `:528` y `:529` los reactivan igual, en bloque. No hay forma
de suspender una sola serie, ni uno de los horarios pactados, ni de decir hasta cuándo.

### 4.5. La zona está modelada y cargada, y las dos decisiones que dependen de ella la ignoran

- **Quién coordina se deduce desde las Asistentes ya asignadas.** `panel/src/lib/equipoDelPaciente.js`
  → `coordinadoresDelEquipo()`: si nadie fijó a alguien a mano, son todos los que alcanzan por sus
  zonas. Pero la lista de zonas sale del equipo, y el equipo sale de los turnos. Sin turnos no hay
  equipo, sin equipo no hay zona que cruzar, y sin zona no sale ningún coordinador. **Un Cliente
  recién firmada no muestra a nadie coordinando, teniendo el lugar del Paciente cargado.** Y el
  casillero que fija a alguien a mano nunca se puebla: nada escribe esa anotación.
- **El cálculo de candidatas no tiene el criterio de la zona.** `panel/src/lib/candidatos.js` no
  contiene ni la palabra «zonas» ni la palabra «lugares» (grep vacío). La ubicación entra sólo como
  distancia en línea recta entre las coordenadas de la Asistente y las del Paciente, y **se calla si
  falta cualquiera de las dos puntas**.

---

## 5. El inventario: qué asume el código de hoy y qué queda afectado

### 5.1. Nadie escribe la tabla de Servicios

**Ninguna escritura** sobre `servicios` en el Panel, en el backend ni en las dos aplicaciones. Las
cuatro apariciones de la tabla son lecturas: `panel/src/pages/Servicios.jsx:39`,
`panel/src/pages/servicios/ServicioDetalle.jsx:39`, `panel/src/pages/guardias/NuevaGuardiaModal.jsx:97`
y `panel/src/pages/clientes/PrestacionesPaciente.jsx:126`.

Los Servicios que hay entraron por la migración de más arriba y desde entonces se heredan solos. **Es
la constatación central de este plan: el acto no existe en ninguna parte del código.**

### 5.2. Lo que sí se escribe, y desde dónde

**Lo pactado** — `prestaciones`: se inserta en `PrestacionesPaciente.jsx:238`, se marca revisado en
`:279`, y se da de baja en cascada al cerrar el Servicio en `:365-370`. `paquetes_prestaciones`: se
inserta en `:564-572` y se da de baja en `:373` —por Paciente, no por Servicio—.

**Los turnos repetidos** — `series_guardias`: se crea en `NuevaGuardiaModal.jsx:231-246`; se cancela
en cascada en `PrestacionesPaciente.jsx:374-379`; se pausa en `:470` y se reactiva en `:529`.
`series_guardias_pacientes`: se inserta en `NuevaGuardiaModal.jsx:255-261` —los Pacientes distintos
del primero, que lo pone un disparador—.

**Los turnos concretos** — `guardias` tiene 17 puntos de escritura en el Panel y 17 en el backend.
Los que este plan toca son sólo los del calendario: la creación de la guardia suelta
(`NuevaGuardiaModal.jsx:188-202`), la materialización de la serie (`:286-289`), la extensión diaria
(`backend/src/utils/generacionSeriesGuardia.js:113`), y las tres cascadas de
`PrestacionesPaciente.jsx:380-385`, `:464-469` y `:528`. **Los demás son de operación del turno
—llegada, salida, oferta, reasignación, avisos— y este plan no los toca.**

**El cierre** — `cierres_servicio_paciente` se inserta en `PrestacionesPaciente.jsx:303-315`, y no se
actualiza ni se borra en ninguna parte.

**Las dos aplicaciones no escriben ninguna de estas tablas.** Su cliente de base se usa sólo para la
sesión y para un canal en vivo; todo lo demás pasa por el backend. **Así que este plan no toca las
aplicaciones.**

### 5.3. Las pantallas afectadas, nombradas como se ven

| Pantalla | Qué hace hoy | Qué le pasa con este plan |
|---|---|---|
| **Clientes › Servicios** | Lista los Servicios con su Cliente, estado, cuántos Pacientes, cuántas prestaciones y cuántos turnos. Dice en pantalla que es de sólo lectura | **Deja de ser de sólo lectura:** es la pantalla donde el Servicio se arma y se mantiene |
| **Clientes › Servicios › ficha del Servicio** | Cliente, Pacientes deducidos, tabla de prestaciones y las últimas 20 guardias. También de sólo lectura | Recibe lo que hoy no tiene: los períodos que cubre, la zona, quién realiza, quién coordina, y la cuenta de lo pactado contra lo cubierto |
| **Clientes › Clientes › ficha › Prestaciones del Paciente** | Es un modal, y hoy es el único lugar donde se pacta, se hospitaliza, se pausa, se reactiva y se cierra el Servicio | Los dos casilleros de texto libre pasan a ser días marcados y horarios. La pausa y la reactivación dejan de ser en bloque |
| **Cobertura › Guardias › guardia nueva** | Crea la guardia suelta o la serie | Sigue creando, y además queda alcanzada por la cuenta: al crear o cambiar una serie, la cuenta se rehace |
| **Cobertura › Guardias** | Grilla, filtros, reasignar y mover | Sin cambios de fondo |
| **Estado actual** | Siete contadores de excepciones sobre el calendario ya generado | Recibe el hueco pactado y no cubierto como una excepción más |
| **Cobertura › Continuidad** | Turnos sin cubrir abiertos, lo que pasó en la casa, consentimientos | Sin cambios |
| **Ajustes › Importación** | Trae Asistentes y Clientes con su Paciente, con la IA proponiendo el mapeo de columnas | **Queda para después**, como consecuencia: recién cuando el acto exista hay adónde volcar un Servicio importado |

### 5.4. Ninguna pantalla compara hoy lo pactado contra lo cubierto

Verificado archivo por archivo. **Clientes › Servicios** y su ficha muestran prestaciones y turnos en
dos tablas separadas, sin ninguna cuenta que las cruce —y la ficha trae sólo los 20 turnos más
próximos, así que ni tiene los datos—. **Clientes › Clientes › ficha › Prestaciones del Paciente**
guarda los días, el horario y la cantidad de turnos pactados, y **nunca los lee contra los turnos
reales**. **Estado actual**, **Cobertura › Guardias**, el panel de cobertura y **Cobertura ›
Continuidad** miran huecos contra el calendario ya generado —turnos que existen y no tienen
Asistente—, nunca contra lo pactado. La facturación calcula qué prestaciones corren un período, del
lado del backend, y no compara nada.

**El Panel no tiene ningún lugar que diga «se pactaron estas horas y se cubrieron estas otras».**

---

## 6. Lo que el Desarrollador fijó sobre cómo se resuelve

Esto no se discute en este plan: es la decisión, y los pasos de la sección 7 la ejecutan.

- **Los días y el horario de la Prestación se cargan igual que en una serie:** días marcados, hora de
  inicio, hora de fin. **Puede ser más de un tramo.**
- **La cuenta es directa:** lo pactado menos lo que cubren las series vigentes. Lo que sobra es el
  hueco, **con su día y su horario**.
- **La cuenta corre en tres momentos:** al armar o cambiar las series, al suspender o cancelar una, y
  en el pasaje diario que ya extiende las series.

---

## 7. El plan

Los pasos van en orden. Cada uno deja el sistema funcionando; ninguno depende de que el siguiente
esté hecho.

### Paso 1. Lo pactado deja de ser una frase

Reemplazar en **Clientes › Clientes › ficha › Prestaciones del Paciente** los dos casilleros de texto
libre por la misma forma que ya tiene la serie: días de la semana marcados, hora de inicio y hora de
fin, y la posibilidad de cargar más de un renglón.

Lo pactado pasa a guardarse como dato, en tabla propia y no adentro del campo de configuración
—`prestaciones.configuracion` es un campo sin forma, y una cuenta no se puede apoyar ahí—. Cada
renglón lleva sus días, su hora de inicio y su hora de fin, y apunta a la Prestación.

**Esto no necesita ninguna palabra nueva, y el glosario ya lo tenía resuelto.** Lo que se guarda son
**los días y horarios de una Prestación**, con más de un renglón cuando haga falta. El glosario de los
productos Careonys ya dice las dos cosas: la Prestación es «cada cosa del acuerdo, con su precio»
—`celtatech/docs/GLOSARIO_PRODUCTOS_CAREONYS.md:37`— y del Servicio dice «cada cosa del acuerdo tiene
sus propios días y horarios» —`:36`—. Así que la tabla se nombra por eso y no hay nada que decidir.

**Y la palabra «tramo» no se usa acá**, porque en este producto ya nombra otra cosa: los renglones de
premura con los que se le insiste al Coordinador —`panel/src/i18n/translations.js:689`, «Agregar un
tramo»— y el período liquidado, que por dentro es `col_tramo`.

**Y lo pactado no se carga con la forma de un turno.** Son cuatro niveles y cada renglón vive en el
suyo:

| | Qué es | Ejemplo del caso del cliente «XX» |
|---|---|---|
| **Servicio** | el acuerdo entero | cuidado domiciliario, por tiempo indeterminado |
| **Prestación** | cada cosa del acuerdo, con su precio y sus propios días y horarios | el cuidado por horas; aparte, la kinesiología |
| **Guardia** | el período que hay que cubrir sin interrupción, y de qué es | la de cuidados: los 7 días, de 00:00 a 24:00. Aparte, la de enfermería |
| **Turno de guardia** | la parte que cubre una Asistente, hasta que entrega las responsabilidades | tres turnos de ocho horas, tres personas |

Lo del paso 1 se carga en el segundo nivel: los días y horarios de una Prestación. Un renglón puede
ir de 00:00 a 24:00, y ningún turno puede. **Repartir la guardia en turnos es trabajo de quien
coordina**, y es lo que el paso 2 compara contra lo pactado.

**Un Servicio incluye varias guardias, y cada una es de algo:** de cuidados, de enfermería, de lo
que el Servicio haya acordado. Y eso hoy no se puede saber: ni `guardias` ni `series_guardias`
tienen de qué es —verificado en la foto de la base—, **el tipo lo lleva únicamente la persona**, en
`asistentes.tipo_asistente_id`, que apunta al catálogo `tipos_asistente`. Así que de qué es una
guardia se deduce de quién la cubre, **y mientras no haya nadie asignado no dice nada**. Eso es
justamente lo que el paso 2 necesita para avisar el hueco: sin el tipo puesto en la guardia, el
aviso puede decir que falta cubrir un horario, pero no qué hace falta ahí, y la sugerencia de
Asistentes del paso 8 no tiene contra qué comparar la capacidad.

**Y hay un desajuste de nombre guardado que decide el Desarrollador, porque tocarlo no es gratis.**
Lo que la base llama `guardias` es el turno: cada fila lleva una Asistente, un día, una hora de
inicio y una de fin, con su check-in y su check-out
—`supabase/migrations/20260819160000_foto_de_la_base.sql:2043-2062`—. El nivel de la guardia
completa, el período repartido entre varias, **no tiene tabla**. Las dos salidas son quedarse con el
nombre como está y entender que una fila es un turno, o renombrar lo guardado, que es una migración
de datos sobre `guardias`, `series_guardias` y todo lo que las nombra.

Qué queda afectado: el insert de `PrestacionesPaciente.jsx:238`, la tabla de prestaciones vigentes de
esa misma pantalla, y la siembra de datos de prueba.

### Paso 2. La cuenta de lo pactado contra lo cubierto

Un punto único de verdad que reciba un Servicio y un período y conteste qué horarios pactados no están
cubiertos por ninguna serie vigente, con su día y su horario. Una sola función que consuman los tres
momentos y las pantallas, nunca la misma resta escrita en cada lugar
(`celtatech/CLAUDE.md` §8, punto único de verdad).

Qué tiene que resolver, y está verificado que hoy nada lo hace: que una serie cubra a varios
Pacientes, que un horario pactado lo cubran dos series distintas, que una serie pausada no cuente como
cobertura, y que una serie sin fecha de fin cubra hacia adelante sin límite.

### Paso 3. La cuenta corre en los tres momentos

- **Al armar o cambiar una serie** — en **Cobertura › Guardias › guardia nueva**, y en la pantalla de
  modificación que trae el paso 5.
- **Al suspender o cancelar** — en las acciones que trae el paso 5, y en las cascadas de cierre y de
  hospitalización que ya existen.
- **En el pasaje diario** — dentro de `backend/src/utils/generacionSeriesGuardia.js`, que ya recorre
  una vez por día todas las series abiertas de las Prestadoras certificadas. Es el único lugar del
  sistema que ya pasa por donde hay que pasar.

Lo que el hueco produce —a quién le llega y por qué canal— entra por el catálogo de avisos que ya
existe, con su configuración por Prestadora, no como un mecanismo nuevo al costado.

**FALTA DEFINIR EL TEXTO.** Qué dice el aviso del hueco es texto visible y lo aprueba el
Desarrollador. No se redacta acá.

### Paso 4. El acto de armar el Servicio

**Clientes › Servicios** deja de ser de sólo lectura. El Servicio pasa a decir las cuatro cosas que
hoy no tiene dónde decirse:

1. **Qué períodos cubre** — lo del paso 1, visto desde el Servicio y no desde cada Paciente.
2. **En qué zona** — elegido de los lugares ya cargados, no tecleado. La estructura está completa y
   el Paciente ya tiene su lugar; acá se usa.
3. **Quién lo realiza** — las Asistentes asignadas al Servicio, que hoy sólo se deducen de los turnos.
4. **Quién lo coordina** — asignado en este acto, que es lo que hoy no existe y por eso se deduce
   hacia atrás desde las Asistentes.

### Paso 5. Modificar, suspender y cancelar, total o parcialmente

Una serie tiene que poder editarse —horario, días, Asistente— sin cancelarla y volver a cargarla,
para que la continuidad no se pierda. Y las cuatro acciones tienen que poder alcanzar una sola serie
o un solo horario pactado, no el Paciente entero:

| Acción | Hoy | Con este paso |
|---|---|---|
| Modificar | No existe en ningún nivel | Sobre una serie, sin perder su historia |
| Pausar | Todo el Paciente de una vez, sin fecha de vuelta | Una serie o un horario pactado, con fecha de vuelta opcional |
| Suspender | No se distingue de pausar | Según lo decida el Desarrollador: ver sección 8 |
| Cancelar | El Servicio entero, o un turno suelto con alcance parcial | Una serie, con su motivo del catálogo |

La idea de «parcial» ya existe en el sistema, en el alcance de la cancelación de un turno suelto. Se
reusa esa palabra y no se inventa otra.

### Paso 6. La zona entra en las dos decisiones que hoy la ignoran

- **Quién coordina** sale de lo asignado en el paso 4, y deja de deducirse desde las Asistentes. Con
  eso, un Cliente recién firmada muestra a quien la coordina el mismo día que se firma.
- **El cálculo de candidatas** suma el criterio que le falta: acepta trabajar en el lugar del
  Paciente. La distancia en línea recta se queda como está —incluida la decisión de callarse si falta
  una de las dos puntas—, pero deja de ser lo único.

### Paso 7. Una sola persona coordina, y se asigna al acordar el Servicio

**El Desarrollador fijó cuatro cosas acá, y las cuatro cambian el modelo que tiene el código.**
Textuales:

> 1 sola persona coordina todo el servicio, si interviene otra persona en la coordinación es eventual
> seguramente debido a alguna emergencia.
>
> Por otro lado, cuando ingresa un cliente (cliente) nueva, y se acuerda el servicio, inmediatamente
> se asigna quien ha de coordinar para que esta persona comience a armar el equipo que brindara el
> servicio.
>
> Si no se asigna coordinador no hay forma de dar por habilitado el servicio.
> Seria como decir que se hara "tal cosa", pero sin asignar un responsable de que eso se haga

Y de antes, la regla de fondo y los tres estados: «Si no hay nadie coordinando, no hay operacion con
esa cliente», y **sin asignar / asignado, y ahí va el nombre / vacante, y ahí aparece la
administración.**

**Qué tiene el código hoy, y no es esto.** La coordinación de un Paciente es **una lista**, y el
sistema la **deduce de las zonas** cuando nadie fijó a alguien a mano —`coordinadoresDelEquipo()`, en
`panel/src/lib/equipoDelPaciente.js`—. Fijar a una persona es opcional y no es condición de nada. Las
tres diferencias:

| | Hoy | Lo que fijó el Desarrollador |
|---|---|---|
| Quién responde por el Servicio | nadie en particular: una lista deducida de las zonas | **una sola persona, asignada** |
| Cómo se llega | el sistema la deduce | **se asigna a mano al acordar el Servicio** |
| Si falta | el Servicio funciona igual | **el Servicio no se habilita** |

#### Responder por el Servicio y ver una emergencia son dos cosas distintas

Lo precisó el Desarrollador, textual:

> Se asigna una sola ppersona, pero, creo que desto hablamos mucho, las emergencias las ven todos, un
> problema nunca puede quedar si resolver a causa de que, por alguna causa, la persona asignada no
> este disponible para resolverla

Entonces **«una sola persona» es la responsabilidad, no la visibilidad.** Lo asignado es quién
responde por ese Servicio y quién arma su equipo. Una emergencia la ve cualquiera que pueda
resolverla, y eso no depende de quién esté asignado: **ningún problema queda sin resolver porque la
persona asignada no esté disponible.**

**Esto ya funciona así, y no se toca.** La bandeja de emergencias del Panel acota los avisos **a la
Prestadora y a nada más** —`backend/src/routes/panelEmergencias.js`, con `acotarAPrestadora`—: no
filtra por lugar, ni por zona, ni por quién coordina. Verificado: en ese archivo no aparece ninguna
mención de lugares ni de coordinador. Quien tiene el permiso las ve, y así queda.

**Y hay un mecanismo más, que también queda como está.** Cuando un aviso lleva demasiado tiempo sin
respuesta, pasa al coordinador de respaldo de la Prestadora, configurado a mano en
`configuracion_escalada_coordinador` y ejecutado por
`backend/src/utils/revisarNotificacionesCoordinador.js`. Es una red distinta de la anterior —espera
una cantidad de minutos y avisa a una persona concreta— y las dos conviven.

**La consecuencia para este paso es una sola, y es lo que hay que cuidar al construirlo:** la
asignación no puede convertirse en un filtro de visibilidad. Asignar a una persona dice quién
responde; **no le saca la emergencia de la vista a nadie.**

**Lo que esto obliga en el paso 4.** La asignación de quién coordina es una de las cuatro cosas que
se dicen al armar el Servicio, y **es requisito para habilitarlo**: sin ella el Servicio queda sin
habilitar, y eso se ve.

#### El sistema sugiere y la administración decide

El Desarrollador lo precisó, textual:

> El sistema va a "sugerir" a que coordinador asignarle el servicio, en administracion, cuando dan de
> alta el servicio aceptan o rechazan la sugerencia.
>
> Al sugerir el sistema tiene en cuenta la zona o lugares donde el coordinador tiene centrada su mayor
> carga de trabajo y que tan grande es esa carga de trabajo. A un coordinador de berazategui
> dificilmente se le asigne un nuevo servicio en san isidro

Es la misma forma que ya rige para las Asistentes: **el sistema adivina y sugiere, pero no asigna.**
Acá la sugerencia se acepta o se rechaza al dar de alta el Servicio, y quien decide es administración.

**Son dos criterios, y ninguno de los dos existe hoy.**

| El criterio | Qué hace falta | Qué hay |
|---|---|---|
| Dónde tiene centrada su carga | contar el trabajo por lugar, y quedarse con los lugares donde se concentra | nada |
| Qué tan grande es esa carga | contar cuánto trabajo tiene encima | nada |

**Por qué no existen, verificado en el código.** No hay ningún mecanismo que sugiera un coordinador:
lo único parecido es `coordinadoresDelEquipo()` —`panel/src/lib/equipoDelPaciente.js:226`—, que
**deduce** una lista por zona y no propone a nadie. Y toda la carga que el sistema mide hoy es **de
Asistentes**, no de coordinadores: `resumenDelPlantel.js:51` cuenta guardias por Asistente y
`candidatos.js:283` cuenta sus horas semanales. Lo único que se cuenta por usuario del Panel es
**cuántos lugares alcanza** —`backend/src/routes/panelUsuarios.js:65-77`, mostrado en
`panel/src/pages/UsuariosPanel.jsx:92`—, que es hasta dónde llega, no cuánto trabajo tiene ahí.

**Y falta una sola pieza para que los dos criterios se puedan calcular: que cada Servicio tenga su
coordinador anotado.** Hoy nadie está atribuido a un coordinador concreto, y los lugares de dos
coordinadores se solapan libremente —`usuario_lugares` no tiene exclusividad—, así que un Paciente de
un lugar compartido cuenta para todos los que lo alcanzan: repartir esa carga sería inventarla. Con
la asignación de este paso hecha, contar por lugar sale cruzando con `pacientes.lugar_id`.

**Orden, entonces:** primero la asignación —que es lo que crea el dato—, y la sugerencia después, con
los Servicios ya asignados. Las dos columnas donde eso podría anotarse ya existen y **hoy no las
escribe nadie**: `equipo_paciente.usuario_id` sólo se llena a mano, y `guardias.coordinador_id` no la
escribe ninguna línea del Panel ni del backend. Cuál de las dos se usa es parte de este paso.

**FALTA DEFINIR EL TEXTO** del tercer estado —el de la vacante, cuando quien coordinaba deja la
función y el rol lo cubre la administración—. Es texto visible y lo aprueba el Desarrollador.

**El cartel #11 se cerró acá, y está ejecutado.** El Desarrollador indicó: «El cartel de "Nadie por
ahora" se va.» Salió de los tres idiomas y con él la sección entera mientras la lista está vacía
—`panel/src/pages/clientes/EquipoDelPaciente.jsx:316`—. **Y el caso no debería existir**, porque sin
coordinador asignado no hay Servicio habilitado.

**Queda una consecuencia por ejecutar en este paso**: el párrafo que hay debajo de ese título dice
«Mientras nadie esté fijado, son todos los que trabajan en la zona», y describe justamente el modelo
que se cambia acá. Sale cuando este paso se haga.

### Paso 8. Los tres criterios de sugerencia que faltan

El Desarrollador los nombró: «Las sugerencias son por zona, por compatibilidad con las tareas, por
capacidad de realizarlas, por antecedentes de la asistente, por voalores economicos (la asistente ha
de estar de acuerdo con las condiciones economicas de sus servicios (montos, plazos de pago, etc)».

La zona entra en el paso 6. Los otros tres —capacidad para las tareas del Servicio, antecedentes de
la Asistente, y el acuerdo económico— **no están en el código** y quedan como paso propio, porque
cada uno necesita datos que hoy no se guardan.

---

## 8. Lo que falta que decida el Desarrollador

Nada de esto se resuelve por criterio propio. Cada punto traba lo que tiene al lado.

1. **Qué dice el aviso del hueco** (paso 3). Texto visible.
2. **Qué dice el tercer estado de la coordinación** (paso 7). Texto visible.
3. **Si «suspender» es distinto de «pausar»** (paso 5). En el pedido aparecen las dos palabras:
   «Se debe pausar, suspender, modificar, cancelar. etc». Si son dos cosas distintas, hacen falta dos
   acciones; si es la misma dicha de dos maneras, alcanza una. **No se decide por criterio propio.**

---

## 9. Lo que este plan no hace

- **No construye el convertidor de los días y horarios escritos a mano.** No hay datos reales que
  convertir (sección 2).
- **No agrega el tipo «Servicio» a Ajustes › Importación.** Va después de que el acto exista, y es
  paso propio.
- **No toca las dos aplicaciones de teléfono.** No escriben ninguna de estas tablas.
- **No toca los mecanismos de aviso que ya funcionan**, ni la operación del turno —llegada, salida,
  oferta, reasignación—.
- **No redacta ningún texto visible.** Donde hace falta uno y no hay uno aprobado, queda escrito que
  falta definirlo.
- **No se mezcla con la revisión de carteles**, que tiene su propio documento y su propio estado.
