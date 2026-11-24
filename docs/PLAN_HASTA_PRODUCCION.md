# PLAN HASTA PRODUCCIÓN — Careonys

**Una sola lista, en orden.** Se hace de arriba abajo, en el orden en que están escritos los pasos. **Acá no se escribe
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

**La obra empieza por la sección «Los pasos comenzados»**, que está a continuación: son los que
ya tienen algo construido, y se terminan antes de abrir otro. Después siguen «Los cimientos».
Mientras dure la obra **no sale ninguna pantalla nueva**.

**El plan está aprobado en su ordenamiento y en sus dos decisiones de fondo**, que ya no se
vuelven a preguntar: los datos viven en São Paulo, y el segundo nivel de aislamiento está
construido.

**Los pasos de «Lo que se dijo que decidió usted» no frenan la obra.** Son una conversación con el
Desarrollador, renglón por renglón, y avanzan cuando él abra un grupo. Ninguno de ellos es
condición del trabajo de los cimientos.

---

## Los pasos comenzados

**Son los pasos que ya tienen algo construido, y van primero.** Se terminan antes de abrir otro.
Cada uno está debajo del nombre del tema del que sale. Lo que explica ese tema sigue en su
sección, más abajo.

### Los cimientos

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

**Lo que hay hoy**, comprobado en el código:

- **El respaldo de los datos va de a una Prestadora** (`backend/src/utils/respaldoDeLosDatos.js`),
  con el rol `copia_de_respaldo`: un archivo por Prestadora, con sus cuentas de entrada adentro, y
  cifrado con la clave pública de esa Prestadora. **La copia de los archivos se cifra igual**
  (`backend/src/utils/copiaDeLosArchivos.js`). El respaldo de GitHub sube sólo el código.
- **Un respaldo se abre con `backend/scripts/abrir_respaldo.mjs`** y la clave privada de su
  Prestadora; revisa que no traiga ninguna fila de otra.
- **Los secretos de terceros de cada Prestadora** —la conexión con WhatsApp, el proveedor de
  mensajes de texto, los secretos de firma de los avisos de facturación y de cobranzas y el acceso
  a esos dos programas— los cifra el backend con la clave de esa Prestadora
  (`backend/src/utils/secretosDeTerceros.js`), y la base guarda sólo el texto cifrado, bajo la
  protección por fila. Las claves van en `CLAVES_DE_LOS_SECRETOS_DE_TERCEROS` de Railway. Fuera de
  eso, el único cifrado del código es el del acceso guardado en el teléfono.
- **El cifrado del disco** lo pone Supabase, con una clave suya. No se puede comprobar desde la base.

**Lo que falta:**

1. **Una Prestadora nueva necesita sus tres cuentas automáticas y su clave de respaldo al darse de alta** —la del
   trabajo, la de la copia y la de la importación—. Hoy las tienen las 2 Prestadoras de la base
   real, con sus contraseñas en `CONTRASENAS_DE_LAS_CUENTAS_AUTOMATICAS` de Railway, y en la base
   local las crea `scripts/cuentas_automaticas_local.mjs`. La clave de respaldo es un par: la
   pública la lee el backend de `CLAVES_PUBLICAS_DE_LOS_RESPALDOS` de Railway, y la privada no la
   tiene el sistema. Sin la pública, el respaldo de esa Prestadora falla esa noche y lo dice en el
   registro. El backend ya no firma pases: entra con esas cuentas y
   el pase lo arma la base (`backend/src/db/connection.js`). **Además:** borrar de las claves de firma de
   Supabase las dos que firmaba el backend, `53b86d1f-…` desde el 25 de noviembre de 2026 y
   `8257f604-…` desde el 11 de diciembre de 2026. Ya están revocadas, y Supabase rechaza el
   borrado antes de esas fechas.
2. **Las contraseñas equivocadas de las cuentas automáticas no se vigilan.** La alarma de las
   entradas ya funciona (`interno.armar_el_pase`): más de 10 entradas con contraseña en una hora
   desactivan la cuenta y le mandan un correo a `CORREO_DE_LAS_ALARMAS` del backend. Las
   equivocadas, Supabase sólo las informa en el plan Teams. Espera ese cambio de plan. Para
   reactivar una cuenta cortada: contraseña nueva, `banned_until` vacío y la contraseña nueva en
   Railway y en la caja fuerte. Si la cortada es `lista@`, el correo no sale hasta reactivarla.
3. **La clave de los secretos de terceros de cada Prestadora.** Hoy no la tiene ninguna:
   `CLAVES_DE_LOS_SECRETOS_DE_TERCEROS` no existe en Railway. Mientras falte la clave de una
   Prestadora, esa Prestadora no manda mensajes de WhatsApp, rechaza los avisos firmados y
   Configuración no le deja guardar esos datos. Hace falta antes de que la primera Prestadora real
   cargue alguno de ellos.

**Todo esto lo genera y lo guarda el sistema solo, sin pedirle nada a nadie**: las tres cuentas
automáticas, sus contraseñas, la clave de respaldo y la clave de los secretos de terceros nacen en
el alta de cada Prestadora. Es un manejo interno: ni el Desarrollador ni la Prestadora generan ni
cargan claves. Dónde se guardan no es de Careonys: la custodia de las claves la administra CeltaTech para todos sus
productos, y está en su lista, `panel/docs/PENDIENTES.md`, `X-25`. Esto espera esa custodia.

**Comprobación:** las claves de una Prestadora no descifran nada de otra; ningún secreto del
repositorio, de GitHub ni del backend alcanza a más de una Prestadora —el backend las guarda todas,
porque trabaja para todas, pero cada una abre sólo la suya—; un pase pedido con la cuenta
de una Prestadora no lee nada de otra.

### El acto de armar un Servicio

**27.** Terminar el acto de armar un Servicio. Lo demás del acto ya está construido.

1. **El nivel de complejidad entra en el cálculo de candidatas.**
   - **Hoy:** se carga y se edita, y nadie lo mira.
   - **Espera la pregunta 82**, que dice qué significa cada nivel y si condiciona qué tipo de
     Asistente se admite. Es información de salud: no viaja al Panel, la base contesta sólo si la
     Asistente alcanza o no.

**28.** **Lo que ve cada uno se recorta a lo que necesita para trabajar**, y se cumple en la base y
en el backend, que hoy filtra sólo por Prestadora.

La base ya recorta a la Coordinadora a sus Servicios
(`interno.coordina_el_servicio`, `supabase/schemas/careonys.sql:1206`): los Servicios
que coordina y los de quien cubre por ausencia; los Clientes que los contratan y sus Pacientes, con
su información de salud, medicación, alertas, rangos vitales y personas autorizadas; y los turnos
de guardia, sueltos y recurrentes, de esos Servicios con todo lo que cuelga de ellas. Una alarma tomada le deja ver esa
guardia. El equipo del Servicio muestra como Coordinador a quien lo coordina. Las tomas
de alarma y las reasignaciones por emergencia se leen sólo de lo que ve; WhatsApp, por zona del
Asistente; y los archivos de prescripciones, documento firmado y autorizaciones de monitoreo, sólo de
los Pacientes que ve. De Contactos lee las que tienen un rol en sus Clientes y
Pacientes, salvo que tenga el permiso de editar personas. De cada Asistente recibe la distancia al
Paciente, redondeada a cien metros, y nunca el domicilio
(`distancias_de_asistentes_a_pacientes`); del Padrón lee los Asistentes de su zona y los de sus
Servicios, y todos sólo mientras tiene una emergencia abierta
(`coordinador_lee_asistentes_de_sus_servicios`); y las calificaciones, sólo de esos mismos
Asistentes o de las guardias que ve (`interno.personal_ve_la_calificacion`). Lo prueba
`scripts/probar_altas_con_sesion.mjs`. Falta:

- **El Asistente, en un turno asignado sin responder, ve barrio, distancia, horario, complejidad y
  las tareas especiales que pide el Paciente.** El nombre del Paciente y el domicilio exacto, recién
  al aceptar. Ya le llegan horario, barrio, complejidad, la distancia en línea recta y las tareas
  acordadas en el Servicio para su tipo; la aplicación todavía no muestra la distancia ni las
  tareas: dónde y cómo espera la aprobación del Desarrollador.
  **De las guardias pasadas que todavía no se le pagaron, ningún dato del Paciente.** Las ya pagadas
  dejaron de llegarle. Sacarle el Paciente a las otras cambia lo que muestra la tarjeta de la
  guardia, que hoy lleva su nombre y sin él diría «Sin Paciente asignado»: espera que el
  Desarrollador apruebe qué muestra en su lugar.
- **Durante la guardia, el Asistente recibe el contacto de emergencia del Paciente.** La obra
  social y el número de afiliado ya le llegan con la guardia en curso, y la aplicación todavía no
  los muestra: dónde y cómo se muestran espera la aprobación del Desarrollador.
  **El Cliente designa hasta tres contactos de emergencia, en orden de prioridad.** Puede ser
  cualquiera de las personas del Cliente, una Persona autorizada u otra persona. La persona que
  todavía no está en Contactos se da de alta al escribirla, con nombre, apellido y teléfono, y sin
  documento. **Una persona sin documento sólo puede ser contacto de emergencia**: para darle
  cualquier otro lugar primero se le completa el documento, y la base lo hace cumplir. La lista la
  cambian la administración, el Coordinador que ve al Cliente con el permiso de editar sus datos y,
  desde su aplicación, el titular del Cliente, que elige entre las personas de su propio Cliente o
  escribe una nueva. Cada cambio queda en el registro de actividad. El Asistente recibe los
  contactos, con nombre y teléfonos, sólo entre la llegada y la salida del turno. Está construido
  en la base y en el backend. Dónde y cómo se cargan en el Panel y en la aplicación del Cliente, y
  dónde los ve el Asistente, espera la aprobación del Desarrollador.

Cierre: la prueba con dos Coordinadoras de Servicios distintos y datos cargados, donde cada una ve
lo suyo y nada de la otra, salvo durante una emergencia abierta, extendida a lo que falta.

**29.** Agregar el tipo «Servicio» a Ajustes › Importación, que hoy no está entre los tipos que se
pueden importar. Va después de que el acto exista: importar un Servicio sin coordinador asignado
sería dar de alta algo que el producto no habilita.

En el mismo paso, el resto de la migración. Una Prestadora que ya trabajaba migra lo que tiene
—Clientes, Asistentes, historias clínicas y lo demás— y cada dato entra por planilla o cargado a
mano de a uno: es una sola migración, con dos formas de cargarla, y no pasa por el circuito
comercial del que llega nuevo. Hoy la importación sólo admite Clientes y Asistentes, y la carga a
mano no existe para ninguno. Falta decidir cómo se llaman, en pantalla, la carga a mano y la
sección, cuyo título habla sólo de archivos. Cierre: cada cosa que se migra entra por las dos
formas, por el mismo lote y la misma revisión.

Un Servicio que ya estaba en curso entra completo: con sus guardias y con los Asistentes asignados
a cada una. **Los Clientes heredados que tienen un Servicio en curso se tratan aparte y primero.**
Existen desde que entran y se opera con ellos desde el primer momento. La Prestadora no puede
rechazar esa tanda: sólo puede resolver lo que traba su regularización, y mientras no lo resuelva
quedan encendidas todas las alarmas que correspondan. La revisión con rechazo queda para lo que no
tiene un Servicio en curso. Cierre: un Cliente heredado con su Servicio, sus guardias y sus
Asistentes entra, se ve y se opera; no se puede rechazar; y cada cosa que falta enciende su alarma
hasta que se resuelve.

### El Paciente nunca queda solo

**31.** **El cierre y el Reporte.** Las cinco formas de cierre y el código QR con la
ubicación también a la salida.

**Comprobación:** un turno no se cierra por ningún camino que no sea uno de los cinco.

**32.** **Las alarmas y la configuración obligatoria.** El aviso al teléfono del Coordinador, el
sonido persistente del Panel con su insistencia, y la configuración sin valores de fábrica que
traba las guardias hasta que esté confirmada, con su paso pendiente en la guía de puesta en
marcha. La búsqueda en todo el Padrón al abrirse la alarma, la convocatoria que dispara el
Coordinador desde Continuidad, la pantalla donde el Asistente contesta con el aviso al teléfono
que lleva a ella, la comparación de respuestas, y el aviso de cierre a todos los consultados. La
convocatoria automática con sus dos arranques y sus dos formas. El titular que se demora y el que
no avisa, las cuatro alertas tempranas que cada Prestadora enciende o apaga, la guardia cubierta
que deja de figurar ausente —espera la palabra con que se muestra, que aprueba el Desarrollador—,
y las dos opciones de penalizar al titular y compensar al relevo.

**Lo que ya está:** el backend de la pantalla donde el Asistente contesta, sin pantalla que lo
llame (`backend/src/routes/appAsistentes.js:1439-1573`), y la convocatoria automática con una sola
forma —todos juntos— y un solo arranque —al vencer los plazos del Coordinador y de su respaldo—,
apagada de fábrica (`backend/src/utils/faseAutomaticaRelevo.js:12-28`). Faltan de a uno y el
arranque siempre.

**Comprobación:** una Prestadora sin esa configuración confirmada no puede asignar un turno; con
ella, un relevo que no llega hace sonar el Panel y llega al teléfono del Coordinador. De a uno, el
segundo consultado recibe el pedido sólo después de que el primero dijo que no o se le venció el
plazo, y nadie a quien ya le preguntó el Coordinador recibe un segundo pedido.

**33.** **El aviso al Cliente, el botón y el Egreso sin relevo.** Los dos plazos por Prestadora,
el aviso que sale siempre al vencer, el botón «Paciente sin Asistente» en la aplicación del
Cliente, la entrada del relevo con el código QR del Cliente y la anotación en el Panel y en el
Legajo.

**Comprobación:** con el plazo vencido y nadie que resuelva, el Cliente recibe el aviso aunque la
Prestadora intente apagarlo.

### La entrada y el restablecimiento de la contraseña

**37. Usted** — Las pantallas de la seguridad de la cuenta en las dos aplicaciones de teléfono.
El backend ya atiende al Asistente y al Cliente igual que al Panel: mandar y comprobar el código de
verificación, cambiar el número, reconocer el equipo, confirmar el equipo nuevo y cerrar la sesión
de todos los equipos (`backend/src/routes/cuentaSegura.js`). Falta la pantalla donde cada uno lo
hace, en la aplicación del Asistente y en la del Cliente. Espera que usted autorice pantallas
nuevas en las aplicaciones.

### El dinero

**39.** Escribir la conexión de ida con el software de facturación de la primera Prestadora, cuando
haya una y ella lo elija. **No se escribe antes**: se miraron los cinco que más se usan en
Argentina y se conectan todos parecido pero con datos distintos, así que escribir uno a ciegas es
acertar con suerte. Lo investigado está en `docs/FACTURADORES_Y_COMO_SE_CONECTAN.md`. **Cada
software es una pieza aparte** y agregar la segunda no puede obligar a tocar la primera. Las otras
dos maneras ya están hechas y alcanzan para salir a producción: se anota factura por factura a
mano, o se baja un archivo con todo lo que falta facturar y se sube el que el software devuelve. **La sección de Configuración donde se elige el software y se cargan sus datos de acceso
está en el estante**, en `Codigos-utiles/eleccion-del-software-de-facturacion-y-cobranzas/`, y vuelve
con la primera conexión, con ese programa solo en la lista.

**Esas dos maneras indirectas se revisan antes contra la norma de protección de datos.** El
Desarrollador duda de que sean seguras: el archivo sale de Careonys, queda en la computadora de
alguien y se sube a mano a otro software, y en ese camino nadie controla por dónde anda. Se cierra
cuando está escrito, con la norma a la vista, si se pueden usar tal como están, con qué recaudos, o
si hay que sacarlas.

**40.** La pantalla de los datos bancarios del Asistente. El dato lo informa él, así que él lo
carga y él lo corrige: la base ya lo deja escribir su propia fila y ninguna otra, y el backend ya
tiene por dónde —cargar, corregir y sacar la cuenta—, con lo que entra validado y con el cambio
anotado. Falta la pantalla donde lo hace, en la aplicación del Asistente.

### La modalidad Match de cara al Cliente

**140. Usted** — Los botones de compra y de baja del acceso en la aplicación del Cliente. El
backend ya recibe, firmado, el aviso del software de cobranzas por cada acceso de Match: anota el
pago, suma los contactos de un paquete y pone el acceso vigente, en gracia, suspendido o de baja
(`backend/src/routes/avisoDeAccesoDeMatch.js`). Falta dónde el Cliente compra y da de baja, en
`pwa-clientes/src/pages/AccesoIntermediacion.jsx`. Espera que usted autorice pantallas nuevas en
las aplicaciones.

### Los carteles y el texto visible del Panel

**64.** Que el Panel nombre la modalidad con el nombre comercial que informa CeltaTech como dato.
**Espera el paso 111**, que es la puerta por la que CeltaTech le informa al producto qué tiene
habilitado cada Prestadora: hoy no entra nada por ahí. Mientras tanto, «Prestación directa» y
«Match» siguen escritos en los textos del Panel. Con una sola modalidad habilitada, el Panel ya no
la nombra.

### Reclutamiento

**66.** El formulario de postulación, por una API única: entrega la definición del formulario —casilleros, listas de opciones y cuáles son obligatorios— y recibe la postulación. Cada Prestadora lo pone en su propio sitio, hecho con quien elija; OctoBuilder lo trae listo como una pieza más de la página, y con otro diseñador el diseñador lo conecta a la misma API (`docs/PRD_01_Sitio_Web.md`, §8). Careonys no dibuja la pantalla del formulario. La base ya tiene dónde guardarla, y la entrada del backend está en el estante, en `Codigos-utiles\postulacion-desde-un-sitio-publico`, con las listas, la edad mínima y el aviso por correo. Se dibuja desde la declaración, no a mano. Sirve de guía, sin copiarlo, el formulario de Match, que ya está construido: va por pasos con una barra que muestra en cuál está, guarda lo hecho si la persona se va y vuelve, y cubre identidad, domicilio, formación, experiencia clínica, disponibilidad, zonas, documentos y cierre (`productos/Careonys-Marketplace/web/src/pantallas/RegistrarAsistente/`). Lo que no se toma de él: ahí quien se registra entra directo al Padrón de la Prestadora que elige, sin ningún control; acá entra como postulación, y al Padrón lo pasa la Prestadora.

### Las dos aplicaciones

**74. Usted** — La alerta por salida del domicilio, dos decisiones que no puedo tomar yo. Hoy la cuenta se hace con una velocidad media única y distancia en línea recta (`backend/src/utils/llegadaEstimada.js:39-45`), se dispara recién cuando alguien marcó la salida, y mide llegada tarde, no que el Asistente siga en su casa.

- **El tiempo de viaje real sale de un servicio de mapas ajeno.** Cuál se contrata, con qué cuenta y qué se le manda en cada consulta —las coordenadas de la casa de una persona salen del producto— es decisión suya, y la credencial la pone usted.
- **Dónde vive el Asistente ya se guarda**, con su dirección escrita y sus coordenadas, y anotado como dato sensible que no sale hacia el Cliente. Las coordenadas las saca el backend solo, al dar el alta y al cambiar la dirección (`backend/src/utils/cuentasPanel.js:403`, `backend/src/routes/panelCoordenadas.js:37`); el servicio de mapas del punto anterior hace falta sólo para el tiempo de viaje. Esto **no es una decisión suya**: está tomada y construida.
- **Y exige mirar el teléfono antes de que la guardia empiece.** Hoy el GPS se sigue sólo durante el viaje, desde «Salgo ahora» hasta que escanea la entrada, y con consentimiento vigente (`pwa-asistentes/src/pages/TurnoGuardiaActivo.jsx:324-335`). Leerlo antes, mientras todavía no empezó a trabajar, es seguir a alguien fuera de su horario: hay que decidir si se hace, con qué advertencia y con qué permiso.

**76. Usted** — El botón de contacto de «Asistente Asignado»: ¿a quién llama? Hoy la pantalla no tiene ninguno (`pwa-clientes/src/pages/AsistenteAsignado.jsx`), y las dos salidas tienen consecuencias. Darle al Cliente el teléfono del Asistente es entregar el dato personal de quien trabaja, y es exactamente lo que Match cobra por abrir: ahí el contacto va tapado hasta que alguien paga. La otra salida es que el botón lleve a la Prestadora, que es con quien el Cliente tiene el trato en prestación directa, usando el contacto que ella misma configura. Hay una tercera: el hilo interno, que hoy existe sólo para Match y con el tapado puesto.

De las especialidades de esta pantalla no queda nada por hacer: el texto libre ya no existe en la base. Las Especialidades son un catálogo de cada tipo de Asistente, y lo que se muestra es el tipo, con sus Tareas de lo que corresponde y lo que no.

**79.** Construirlo según lo contestado. El tablero del Panel cuenta como emergencia sólo lo que avisó una persona con el botón.

### Configuración que todavía está escrita en el código

**90.** Construirlo según lo contestado. El código fijo de cada Asistente ya está guardado y no se
muestra en ningún lado.

### Datos personales

**94.** Sembrar los textos reales y encender el seguimiento y el mensaje de demora en el trayecto.

### Respaldo, continuidad y secretos

**160.** Mostrar en el Panel cuántos correos mandó cada Prestadora contra el tope de Resend. El
conteo ya existe (`envios_de_correo`), y la pantalla está en el estante, en
`Codigos-utiles/conteo-de-correos-contra-el-tope/`.

### Marca y dominio por Prestadora

**161.** Los archivos de isotipo y logotipo de la marca del producto. Lo que los muestra tiene que
funcionar también sin logotipo. Tiene que estar antes de la primera Prestadora real.

### Módulos

**103.** Sacar la facturación y la cobranza a un módulo, cuando haya dónde correrlo. **Match
cobra igual que la prestación directa: el cobro lo hace el software de cobranzas de la
Prestadora.** El botón de compra abre la ventana de pago de ese software, que resuelve todos los
medios de pago y le avisa a Careonys con un aviso firmado; Careonys no factura, no cobra, no
gestiona la mora y no decide restricciones. La pasarela de pago que cobraba desde adentro ya salió
al estante, en `Codigos-utiles\pasarela-de-pago-de-match`. Faltan dos piezas, que se construyen
con Match porque hoy está cerrado para los Clientes: la entrada que recibe el aviso por acceso y lo
anota en `cobros_intermediacion`, y el botón de compra en la aplicación del Cliente. Qué tiene que
cumplir el software está en `celtatech/docs/SOFTWARE_DE_CREDITOS_Y_COBRANZAS.md`, sección «La
compra de un acceso de Match», y cómo queda Match, en `docs/PRD_07_Modalidad_Match.md` §3.

**Y el cálculo de la relación de dependencia es de un módulo de sueldos y jornales.** Una
Prestadora puede tener a la vez Asistentes independientes y empleados en relación de dependencia,
y cuál es cada uno lo anota la relación laboral de su Legajo. Lo que no está en el producto es el
cálculo del sueldo, de la indemnización y del cese: el código está en el estante, en
`celtatech/Codigos-utiles/vinculo-laboral-cese-y-riesgo-de-dependencia`, y lo que usaba en la base ya salió.

**Los mensajes de cobros y facturación se redactan acá, no antes.** Salieron de la revisión de
frases porque se van con el módulo: en el Panel, forma de cobro con nombre repetido, renovación sin período, falta la fecha
límite de pago de los saldos, falta el motivo para anular un cobro, falta el importe o el tipo de
comprobante y faltan datos de la corrección.

### Decisiones que no traban nada empezado

**107. Usted** — ¿Diez pedidos por minuto y por persona es el número? El contador compartido hace falta el día que el backend se reparta en varios servicios; hoy corre en uno solo.

**111.** **El alta de una Prestadora entra por una puerta firmada, como la de Match**
(`productos/Careonys-Marketplace/supabase/functions/alta-y-baja/index.ts`), y hoy Careonys no tiene
ninguna: nada en el backend crea una Prestadora. **Por esa misma puerta tiene que entrar qué tiene
habilitado cada Prestadora, y hoy no entra nada.** CeltaTech le vende un plan, y ese plan dice qué puede usar. Eso se lo informa al
producto. **Y ahí termina: CeltaTech no tiene injerencia, bajo ninguna circunstancia, en el
negocio de ninguna Prestadora.** Le habilita funciones del software y nada más; qué cobra, a
quién, cuánto y con qué condiciones lo decide ella sola.

**Son tres niveles, uno arriba del otro, y falta el primero:**

- **Lo que CeltaTech le habilita**, según el plan que contrató. **No existe.**
- **Lo que la Prestadora decide usar**, adentro de eso, desde su Configuración. **Tampoco existe
  para las modalidades:** la Prestadora las ve y no las puede encender ni apagar, y hoy se cargan
  sólo desde la base.
- **Lo que el Legajo de cada Asistente permite**, adentro de lo que la Prestadora usa. Existe.

Del lado de CeltaTech el mecanismo ya está construido —un catálogo de capacidades que cada
producto declara, asignadas a planes y resueltas por suscripción, guardadas como texto que no
interpreta—. Lo que no existe es el canal por donde eso llegue acá.

**Y no es sólo al dar el alta: después también llega la orden de deshabilitar**, la aplicación
entera o una parte. **Por qué, Careonys no lo sabe ni lo pregunta**: recibe la orden y la ejecuta.
**Es un apagado distinto del de la Prestadora, aunque hoy los dos se dirían igual:**

- **El de la Prestadora** es una decisión de negocio de ella: deja de operar con una modalidad.
  No tiene que poder apagarla si quedan Asistentes trabajando o Clientes con acceso abierto. Esa
  comprobación no existe, porque tampoco existe el apagado.
- **La orden que llega no se puede bloquear.** Con esa misma comprobación, alcanzaría con tener un
  Asistente trabajando para que la orden nunca se cumpla.

**113.** Terminar el alta y construir lo contratado. **La puerta y el alta ya están**:
`/integracion/v1/tenants` (`backend/src/routes/altaDePrestadora.js`) comprueba la firma de
`celtatech/docs/MODELO_COMERCIAL_CELTATECH.md` §6.2 y no abre con la firma mal o sin
`CLAVE_DE_FIRMA_DE_CELTATECH`; `public.dar_de_alta_la_prestadora` crea en una sola operación la
Prestadora con la moneda de su país, guarda el código que manda CeltaTech en
`configuracion_prestadora.dominio` (único, y con un código repetido el alta no se hace), guarda la
referencia de CeltaTech como texto opaco en `prestadoras.referencia_celtatech` (el alta repetida
devuelve la misma Prestadora), crea al Administrador, fija la casilla de envío a partir del código,
abre el reenvío de las respuestas, lo deshace todo si algo falla y queda auditada. Lo que falta
del lado de CeltaTech —generar y cargar la clave compartida de la firma, firmar y mandar el alta, y
entregarle al Administrador su primera contraseña— está en la lista de CeltaTech,
`panel/docs/PENDIENTES.md`, `X-21` y `X-24`. Falta acá:

- **Las cuentas automáticas de la Prestadora nueva, y sus claves.** El alta las genera y las
  guarda sola, sin pedirle nada a nadie: las tres cuentas, la clave de respaldo y la clave de los
  secretos de terceros. Hoy las cuentas sólo las crea un guion local
  (`scripts/cuentas_automaticas_local.mjs`); sin ellas, las tareas programadas, el correo y el
  respaldo de esa Prestadora fallan. Se construye con el paso 13, y espera la custodia de claves de
  CeltaTech (`panel/docs/PENDIENTES.md`, `X-25`).
- **La región por país.** Con una sola región alcanza; con más de una, el alta elige según el país.

**Después,** recibir qué tiene habilitado cada Prestadora y que su
Configuración ofrezca solamente eso; y recibir la orden de deshabilitar, sin la comprobación que
lleva el apagado de ella, haciendo con lo que quede en curso lo que se conteste arriba. **La lista
de capacidades la declara este producto**, que es el que sabe qué significan; del otro lado son
texto opaco. Lo que cada Prestadora tenga hoy en uso se conserva.

### El cumplimiento que se agrega encima

**121. Usted** — **La pantalla de la revisión del registro de accesos.** Espera su autorización,
porque es una pantalla nueva. El backend ya está: junta los accesos fuera de horario, sin guardia
con el Paciente o sobre demasiados Pacientes en el día; arma el resumen por persona del personal;
cuenta todos los días lo del día anterior; guarda la constancia firmada de quien revisó, con fecha
y nombre; y anota cada vez que alguien mira el registro. Falta la pantalla donde la administración
lo ve y firma.

**122.** **El motor de conservación y borrado.** La tabla de reglas, `reglas_de_conservacion`,
tiene un solo renglón, el del registro de accesos en Argentina, y ya puede expresar tramos
encadenados, el hecho desde el que corre cada plazo y qué se hace al vencer (`tramo`,
`hecho_de_inicio` y `al_vencer`). La fecha de fallecimiento no existe en ninguna tabla. Acá se
agrega esa fecha, se cargan los países, y se construyen el motor que decide, el congelamiento ante
una queja y el borrado en los respaldos.

**El registro de accesos ya se borra solo** con el plazo de su país, y el resto de los países se
carga como dato cuando se escriba su documento legal. Lo que ya se sabe: el piso general es de tres
años (EHDS art. 9); Perú pide un mínimo de dos con disponibilidad inmediata; ningún plazo supera el
de la historia clínica de ese país; y Brasil tiene además un piso que no es de protección de datos,
seis meses de registros de acceso por el art. 15 del Marco Civil de Internet, bajo secreto y
entregables sólo por orden judicial.

**Antes de construirlo se contesta:** qué clases de registro existen, porque la tabla las guarda
como texto libre; quién carga las reglas, que hoy sólo entran por migración; si la fecha de
fallecimiento va en los datos de la persona, que el Paciente ya cita; si su cambio se audita; cómo se
borra lo vencido del historial del registro clínico, que hoy no lo puede borrar nadie; y qué otras
tablas son clínicas y se versionan, además de las cuatro que ya lo hacen.

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
  Decreto 41/2012). Cualquier anotación posterior reinicia el reloj de toda la historia clínica.
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
  son una facultad de destruir, pensada para los documentos físicos. Y el art. 13 del Decreto 242/017 va al revés.

**El plazo de Ecuador está sin verificar** y se carga como dato el día que aparezca la fuente
oficial, sin tocar código.

El borrado tiene que alcanzar los respaldos, o hay que documentar por escrito que no puede: el
borrado incompleto en entorno de varios clientes está nombrado como amenaza en el Apéndice C de
NIST SP 800-66r2, lo que lo convierte en amenaza razonablemente anticipada del 164.306(a)(2).

**Y el borrado es por dato, no por cuenta.** El art. 17(3) del GDPR dice «en la medida en que»: que
la historia clínica deba conservarse no hace inborrables las preferencias de comunicación, los
perfiles opcionales, las notas no clínicas ni las copias analíticas. Acá se contesta qué pasa con
los datos de un Servicio cerrado hace años.

**Y ante una queja, el registro de ese paciente se congela** (NEN 7513, 8.5): se guarda aparte, el
vencimiento no lo alcanza, y se conserva hasta diez años.

**Comprobación:** con dos Prestadoras de países distintos y las mismas fechas cargadas, el motor
decide distinto en cada una y lo explica citando la regla que aplicó.

**123. Usted** — **Las pantallas de los derechos de la persona.** Esperan su autorización, porque
son pantallas nuevas: en el Panel, cargar y responder los pedidos de una persona sobre sus datos y
bajarle sus datos; en la aplicación del Cliente, bajar los propios y ver quién entró a la
información de salud de su Paciente. El backend ya está, con el plazo de cada pedido contado en
días hábiles del país y el aviso antes de que venza. **Los plazos y los feriados de cada país se
cargan en el paso de la configuración por país**, porque cada uno sale del documento legal de ese
país con su artículo: hoy ninguno está cargado, y sin plazo un pedido no vence.

**124. Usted** — **La pantalla de las brechas de seguridad.** Espera su autorización, porque es una
pantalla nueva. El backend ya está: cada incidente guarda cuándo ocurrió y cuándo se supo, los
Pacientes alcanzados, la evaluación de los cuatro factores y cuándo se avisó; la cuenta regresiva
la calcula la base con el plazo del país de la Prestadora. Están cargados Costa Rica y Panamá. **Los
plazos de los otros países y los textos de aviso se cargan en el paso de la configuración por
país**, porque cada uno sale del documento legal de ese país con su artículo.

**125. Usted** — **El segundo factor obligatorio y la pantalla del acceso de emergencia.** Esperan
su autorización, porque son pantallas nuevas.

- **Segundo factor obligatorio.** El Panel no lo tiene: la entrada con token salió de Careonys y
  quedó guardada en el estante de CeltaTech (`Codigos-utiles`), lista para volver. Ninguna norma
  vigente de Estados Unidos lo exige —el 164.312(d) es un estándar desnudo—, pero ningún comprador
  grande compra sin él. La NEN 7513 (8.1) sí lo exige para ver el registro de accesos. Volver a
  ponerlo pide la pantalla donde cada persona da de alta su token.
- **La pantalla del acceso de emergencia.** El backend ya está: quien no alcanza la información de
  salud de un Paciente la abre por un tiempo acotado, con el motivo escrito, y queda anotado como
  hecho aparte en el registro (164.312(a)(2)(ii) y NEN 7513, 6.2.2). Falta el botón en el Panel.

**Comprobación:** con el segundo factor obligatorio encendido, una cuenta sin él no entra a ninguna
pantalla del Panel.

**126.** **Respaldos que se probaron.** El 164.308(a)(7)(ii)(A), (B) y (C) son «Required»: copia
exacta y recuperable, restauración y modo de emergencia. El Decreto 41/2012 chileno lo escribe como
requisito de la historia clínica, y en Francia la copia de respaldo es una de las actividades
certificables del référentiel HDS.

**Y hay un país que fija frecuencia:** el art. 51 del DS 016-2024-JUS peruano exige copias
**semanales** con verificación de integridad. Es el único plazo numérico del relevamiento, así que
manda.

Se construye la restauración probada **y con constancia**, no la promesa de que se puede. Lo que hay
hoy es un programa que se corre a mano, `backend/scripts/abrir_respaldo.mjs`, que abre el respaldo
y cuenta sus filas, pero no lo restaura en ningún lado. Falta la restauración, que deje constancia,
que se repita sola y que quede atada a la frecuencia peruana.

**Comprobación:** una restauración completa a un entorno aparte, con constancia de fecha y de qué
se verificó.

**127.** **La configuración por país, cargada.** La estructura existe y tiene un solo país cargado.
Se carga, por jurisdicción: plazos de conservación con su hecho de inicio, plazo de brecha con su
destinatario y desde cuándo corre, plazo de respuesta a los derechos, mecanismo de transferencia
internacional, contacto del delegado u oficial de protección de datos donde sea obligatorio, y el
texto de consentimiento que cubra específicamente la transferencia internacional donde haga falta.

Vale la regla de la empresa: **el producto avisa, no bloquea**, y el aviso sale del documento legal
de ese país. Si el país no tiene documento, no hay aviso, y sin documento no se vende ahí.

**Y los documentos legales de `docs/legal/` hay que ampliarlos, empezando por Argentina.** Los 27
archivos existen. Argentina ya tiene su sección de protección de datos e historia clínica
(`docs/legal/argentina.md:165`), y Brasil, Chile, Colombia, Costa Rica, Ecuador, México, Panamá, Perú y
Uruguay dicen la conservación y la brecha; en los demás esa materia no está escrita.

**Comprobación:** ningún plazo de estos aparece escrito en el código.

**129.** **Los documentos que pide la auditoría.** Son entregables, y sin ellos lo construido no
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

### Cierre

**134. Usted** — Entrar con la huella en un Android real y en un iPhone real. En la computadora no se puede probar. Espera a que usted tenga un teléfono de cada uno a mano.

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

### 5. Documentos enteros atribuidos de una sola vez

No es una decisión sino un documento completo puesto a su nombre. Si no es suyo, lo que hay que
revisar es el documento entero, no un renglón.

- `docs/SECURITY.md`, sección «Portabilidad de datos» — qué se hace si cae un proveedor.

### 6. Cómo se elige construir, que no se ve en ninguna pantalla

Las tres deciden con qué criterio se elige, no qué se construye. Por eso van juntas: o valen las
tres o no vale ninguna.

- `docs/claude_history.md:415-419` — que lo propio del producto no quede atado a la plataforma de base de datos. Construido sólo en parte: la lógica de negocio vive en disparadores de Postgres.
- `docs/claude_history.md:426` — que la arquitectura se elija pensando en que dure, no en lo más rápido de hacer.
- `docs/claude_history.md:381-383` — que la empresa tenga que poder operar con poca gente.
- `docs/claude_history.md:439-441` — que el nivel visual del producto tenga que superar al de la competencia.

### 7. Sueltas, que no se agrupan con ninguna otra

Éstas sí se contestan de a una, en cualquier orden.

- `docs/claude_history.md:351` — **[ya construido]** que una guardia pueda tener más de un Paciente. Sigue en pie con la escala que ahora tiene el glosario: vale para la guardia y también para cada turno adentro de ella, y no traba nada de lo que sigue.

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

**La llave que abría todo ya no existe.** Ningún archivo del repositorio la usa: lo que
pide una persona entra con su credencial (`clienteDelPedido(req)`), lo que la persona no puede
hacer, con el trabajo de su Prestadora (`enLaPrestadora`), y la copia nocturna de los archivos, de
a una Prestadora, con la credencial de la copia de respaldo, que sólo lista y baja los archivos de
esa Prestadora. No está en Railway ni en los secretos de GitHub, y en Supabase la clave secreta
está borrada y las claves heredadas, apagadas.

**El filtro escrito a mano sigue, pero ya no es lo que separa.** `acotarAPrestadora` está definido
en `backend/src/middleware/alcancePrestadora.js:32` y lo llaman
`backend/src/routes/panelPersonasTelefonos.js:60` y `acotarAUsuariosDelPanel`
(`alcancePrestadora.js:83`), que usan `backend/src/routes/panelUsuarios.js` y
`backend/src/utils/cuentasPanel.js`. El resto de las consultas nombra la Prestadora a mano. Si falta uno, la base no devuelve nada ajeno: lo comprueba
`scripts/probar_aislamiento_en_la_base.mjs`, que lee cada tabla con cada cuenta sembrada de las
dos Prestadoras de prueba sin ningún filtro, y corre en cada push que toca `supabase/`.

**Ninguna tabla nace sin protección.** `scripts/verificar_proteccion_por_fila.mjs` corre en cada
push y falla si una tabla del esquema declarado no tiene la protección por fila encendida o no
tiene política, o si un depósito de archivos no tiene política.

**Los 14 depósitos de archivos tienen política.** La autorización de monitoreo, los documentos
del Asistente, los documentos del Pagador y el documento firmado de las personas autorizadas ya se sirven
con el acceso de quien pide, y ahí dice que no el depósito.

**La protección por fila está puesta y la base es la que decide.** Todas las tablas la tienen
encendida y con política, y ninguna depende de nada que aporte el backend: la Prestadora la resuelve
`interno.prestadora_actual()` con la cuenta de quien entró, o la credencial del trabajo de esa
Prestadora.

**La información de salud sale sólo por el registro.** Las diez tablas de
`interno.tablas_de_salud()` llevan la política restrictiva `la_informacion_de_salud_pasa_por_el_registro`,
y nadie las lee directo: el backend las lee con `backend/src/db/informacionDeSalud.js`, que anota
cada lectura encadenada en `consultas_a_hce`, y el Panel las pide a
`/api/panel/informacion-de-salud/<tabla>`. Quién vio la información de salud de un Cliente se ve en
su Ficha, en «Accesos a la información de salud», sólo para la administración, y se baja como
planilla para entregársela. `auditoria_de_accesos` es otra cosa: lo que hace el personal de
CeltaTech con un permiso de acceso.

**El registro clínico ya no se pisa.** Cada alta, corrección o baja de `indicaciones_medicacion`,
`rangos_referencia_vitales`, `domicilios_temporales_paciente` e
`informacion_de_salud_del_paciente` deja una copia en
`versiones_registro_clinico`, con autor, momento y nota aclaratoria, y ese historial no lo edita ni
lo borra nadie. Todas esas escrituras van con la credencial de la persona, así que el autor queda.

**La conservación corre sólo para el registro de accesos.** `reglas_de_conservacion` tiene un
renglón: Argentina, `consultas_a_hce`, 36 meses, con preaviso por correo a los 60 días y
notificación a los 30. Una tarea diaria del backend manda esos dos correos a la Prestadora y deja
constancia de cada uno; otra borra, de a una Prestadora por vez, los años enteros vencidos, y deja
un corte que mantiene comprobable la cadena.
Para todo lo demás no hay plazo ni tarea que purgue, y no hay fecha de fallecimiento guardada. Lo
que hay es borrado lógico: un dato marcado como borrado queda para siempre.

**No hay exportación ni portabilidad.** El derecho de acceso se atiende a mano, contra la base.

**El Panel cierra la sesión por inactividad**, encendido por defecto a los 15 minutos y ajustable
por Prestadora. **Las dos aplicaciones no la cierran.** **El Panel no tiene segundo factor**: la entrada con token
salió de Careonys y quedó guardada en el estante de CeltaTech (`Codigos-utiles`).

**La estructura de configuración por país está hecha y vacía.** `advertencias_legales` tiene 12
filas, todas de jurisdicción `AR`, y las doce son de materia laboral o de Match: ninguna es
de protección de datos. `escalas_legales` también es sólo `AR`.

**Los datos están en São Paulo** (`sa-east-1`). Para Brasil es tratamiento local; para todos los
demás países es transferencia internacional hacia Brasil.

**Lo que sí está bien.** Los secretos de terceros se guardan cifrados con la clave de cada
Prestadora, no en claro; hoy no hay ninguno cargado. Trece de los catorce depósitos son privados —el único público es el de la marca de las Prestadoras— y se sirven con enlace temporal. El consentimiento se registra
con texto versionado, con quién consintió, por qué medio, desde cuándo y hasta cuándo.

### Qué queda cuando esto termina

- **`SUPABASE_SERVICE_ROLE_KEY` no existe en el producto.** No está en el código, ni en el
  repositorio, ni en las variables de entorno del backend.
- **Todo pedido de una persona viaja con la credencial de esa persona**, y la base decide qué filas
  contesta. Un filtro olvidado no devuelve datos de otra Prestadora: no devuelve nada.
- **El trabajo sin persona detrás tiene su propia credencial**, acotada a sus tablas y funciones y
  de a una Prestadora por vez. Es la llave del cuarto de máquinas, no la del edificio.
- **`acotarAPrestadora` se borra.** Con la base decidiendo, un filtro en el código es una
  duplicación que puede contradecirla.
- **Cada lectura de un dato de salud deja constancia**, con la Prestadora, la persona que accedió,
  el paciente, la categoría de dato, el momento y el origen. Consultable por paciente.
- **Esa constancia no se puede alterar sin que se note.**
- **Ningún archivo se autoriza comparando texto de una ruta.**
- **Ninguna corrección clínica pisa lo anterior.**
- **El estado de la base se lee en un archivo, no en una pila de migraciones.**
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

**5.** **Dónde viven los datos: São Paulo.**
Decidido. No se abre alojamiento europeo hasta que haya un cliente europeo: pagar por un mercado
que todavía no existe es gasto sin contrapartida, y esa puerta se abre el día que haga falta.
Hasta entonces **Europa no se vende**, y no por trámite: Alemania y Francia exigen que los datos
de salud estén en Europa —no necesariamente en su propio país— y con un proveedor que tenga la
certificación de salud de ese país. Eso se comprueba contra la norma de cada uno el día que se
escriba su documento legal. **Estados Unidos sí se puede vender sin mudar nada**, porque no
exige residencia: lo que pide es el contrato con el proveedor de la nube, que es dinero y no obra.

**Preparar el producto para más de una región queda para la siguiente versión**, cuando haya un
cliente que la pida: está en `docs/LEGAJO_PARA_EL_FUTURO.md`, «Más de una región».

**Lo que no es código: los contratos con los proveedores, firmados y presentados antes del alta de
la primera Prestadora real.** Brasil no figura en la lista de países adecuados de la autoridad
argentina, así que alojar en São Paulo es una transferencia internacional. CeltaTech se constituye
en Argentina, así que quien saca los datos del país es CeltaTech, hacia cada proveedor que los
guarda o los procesa afuera: Supabase, Railway y Backblaze B2. Ninguno firma el modelo argentino:
se firma el contrato de tratamiento de datos de cada uno y se lo presenta a la autoridad dentro de
los 30 días corridos de firmado (Disposición 60-E/2016, art. 2). **Espera a que CeltaTech esté
constituida**, porque el contrato lo firma la sociedad. No hay que buscar proveedor en Argentina:
la ley no obliga a alojar dentro del país. **El procedimiento está en
`celtatech/docs/CLAUSULA_TRANSFERENCIA_INTERNACIONAL.md`.**

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
  que la habilita es el contrato de CeltaTech con cada proveedor, presentado a la autoridad dentro
  de los 30 días corridos de firmado porque no sigue el modelo (art. 2 de esa disposición).
  **Tiene que estar firmado y presentado antes del alta de la primera Prestadora real.** La excepción de datos médicos del art. 12(2)(b) es para un intercambio
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

**Comprobación:** por cada país donde haya una Prestadora dada de alta, su documento en
`docs/legal/<país>.md` nombra qué habilita el alojamiento y con qué instrumento. Sin eso, el alta no se aprueba.


Los pasos ya comenzados de este tema están al principio, en la sección «Los pasos comenzados».


**16.** **La documentación que queda falsa.** Hay renglones de documentación y comentarios de
código que describen el estado de hoy y quedarán falsos. **Se corrigen en el paso donde dejan de
ser ciertos, no antes ni en un barrido aparte.**

**Los comentarios que viven dentro de migraciones ya aplicadas no se tocan.** Una migración es una
instrucción que ya se ejecutó: no manda, no se le contesta y no se la corrige. Con el esquema
declarado encendido, el estado se lee en un archivo y ninguna migración vieja se puede confundir con
el estado de hoy.

Y hay una premisa caída afuera de este repositorio: `productos\Careonys-Marketplace\docs\PLAN.md:44-48`
apoya toda la etapa 2 de la fusión en que «Careonys protege por el servidor». **Ahí no se toca
nada**, así que queda señalado y se decide cuando la fusión llegue a esa etapa.

### Qué no hacen los cimientos

No cambian ninguna pantalla, ningún texto visible ni ninguna regla de negocio. **Lo único que se
nota es el alcance del Coordinador**: el backend ya no saltea la regla que la base tiene, y con su
propia credencial el Coordinador ve los Clientes, los Pacientes y los Servicios de los Servicios que
coordina (`interno.coordina_el_servicio`, `supabase/schemas/careonys.sql:1206`), y los Asistentes y
las guardias de los lugares que coordina (`interno.coordinador_alcanza_asistente`, `:1241`). El
Administrador sigue viendo todo, y una emergencia que llega a todos los Coordinadores la ve
cualquiera. Fuera de eso, nadie que use
el producto nota nada, salvo que un error de programación ya no puede filtrar datos de otra
Prestadora.

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

**Lo que se miró y no viaja, para que no se vuelva a discutir:** las quince pantallas del sitio
público y la maqueta; los consentimientos, donde Careonys está muy por delante —texto versionado
por jurisdicción e idioma, con copia exacta de lo que la persona leyó, y con rechazo y retiro—; el
tope de alarma, que acá tiene topes por Prestadora, cuatro escalones de gravedad y escalada de la
que nadie atiende; las verificaciones; los reportes de turno; y el seguimiento de ubicación, donde
lo de acá es mejor salvo el motivo de la falla, que ya está resuelto. Y los textos legales de allá no sirven: son de una
sola Prestadora, sin versión y sin dónde queden guardados.

**22. Usted** — Decidir qué secciones de Match quedan en el Panel. Match no tiene panel aparte:
sus secciones están en el mismo Panel y aparecen sólo si la Prestadora tiene habilitada la
intermediación. Son cinco: Calificaciones, Clientes, Formas de cobro —con su detalle—, Auditoría legal y Funciones con riesgo legal. Clientes y Formas de cobro las ve
sólo la administración, en el menú (`panel/src/components/layout/Layout.jsx:236` y `:246`) y en
la ruta. En el Legajo del Asistente, la pestaña de evaluaciones sigue la misma regla.

---

## El acto de armar un Servicio

**Va acá porque es la columna del producto**, y porque media docena de pasos de más abajo lo dan por
hecho sin que exista: a quién se le presenta una Asistente nueva, contra qué se asigna una guardia,
quién responde por un Servicio y qué se le factura a quién son preguntas que no se pueden contestar
mientras armar un Servicio no sea un acto con su pantalla. **Y va después de la mudanza** porque se
sirve de las listas de opciones por Prestadora, que es lo que quedó construido allá.

**Lo que pidió usted son cuatro cosas:** que un Servicio pueda tener duración indeterminada; que
no quede un turno sin cubrir que nadie vea; que se pueda pausar, suspender, modificar y cancelar, en forma total o
parcial; y que use las zonas que ya están cargadas.

**Lo que ya funciona y no se rehace:** el turno de guardia recurrente sin fecha de fin, que se
extiende solo
(`extenderSeriesTurnoGuardiaAbiertas`, en `backend/src/utils/generacionSeriesTurnoGuardia.js`); el alta, la baja y la reactivación del Servicio; la
asignación del Coordinador y la regla de que sin Coordinador no hay turnos de guardia; los seis
mecanismos de aviso; y la estructura de zonas (`zonas_cobertura`, `lugares`, `zona_lugares`,
`asistente_lugares`, `usuario_lugares`).

**Lo que usted fijó sobre cómo se resuelve:** el cronograma de la Prestación se carga igual que un
turno de guardia recurrente —días marcados, hora de inicio, hora de fin—, con más de un renglón
cuando haga falta; la cuenta es directa, el cronograma menos lo que cubren los turnos de guardia
recurrentes vigentes, y lo que sobra son los turnos sin cubrir, con su día y su horario; y la
cuenta corre en tres momentos: al armar o cambiar un turno de guardia recurrente, al suspender o
cancelar uno, y en el pasaje diario que ya los extiende.

**Lo que se carga son cuatro niveles que no se mezclan:**

| | Qué es | Ejemplo |
|---|---|---|
| **Servicio** | el acuerdo entero | cuidado domiciliario, por tiempo indeterminado |
| **Prestación** | cada cosa del acuerdo, con su precio. Si se cubre con la presencia de un Asistente, lleva su cronograma de guardias —una franja acotada o las 24 horas los 7 días—, que se anota una sola vez | los cuidados: los 7 días, de 00:00 a 24:00. Aparte, la enfermería, de 8 a 14 los martes, y la kinesiología |
| **Guardia** | cada uno de los días y horarios del cronograma de guardias | la guardia del lunes, la del martes, la del fin de semana |
| **Turno de guardia** | la parte de una guardia que cubre una Asistente, hasta que le entrega las responsabilidades a quien la releva o al Cliente | tres turnos de ocho horas, tres personas |

**La palabra «tramo» no se usa para los días y horarios de una Prestación**, porque en el producto ya
nombra otra cosa: los renglones de premura con los que se le insiste al Coordinador y el período
liquidado.

**Contra qué choca este acto en el resto de la lista.** Son tres, y ninguno se ve leyendo los
títulos:

- **El aviso del turno sin cubrir no es pieza nueva: entra por el catálogo de avisos que ya existe**, con su
  configuración por Prestadora. Las alertas tempranas las enciende o apaga cada Prestadora, una por
  una (sección «El Paciente nunca queda solo»), y el aviso del turno sin cubrir no puede ser
  de ésas: usted fijó que no puede haber un turno sin cubrir que nadie vea.
- **La sugerencia de Asistentes ya mira el lugar, las tareas, la Especialidad, los antecedentes y
  el valor acordado**, y aparece al asignar un turno de guardia. Le falta el nivel de complejidad,
  que espera la pregunta 82.
- **Un coordinador de sólo lectura no puede ser el asignado.** Más abajo se pregunta cómo entra un
  Pagador que sólo consulta, y una de las salidas propuestas es un Coordinador de sólo lectura.
  Quien tiene el Servicio asignado arma el equipo: si esa salida se elige, tiene que decir que ese
  rol nunca queda como responsable de un Servicio.

Los pasos ya comenzados de este tema están al principio, en la sección «Los pasos comenzados».





---

## El Paciente nunca queda solo

**La regla:** el Paciente siempre tiene a alguien. La única excepción es que el Cliente lo haya
indicado. Si el Asistente deja solo al Paciente, la Prestadora incumple su contrato.

**Va acá porque se apoya en dos cosas de más arriba:** los cimientos, porque todo lo que sigue
escribe en la base con la credencial de la persona, y el acto de armar un Servicio, porque el
turno cuelga del Servicio y el relevo es otro turno de la misma guardia. **No alcanza a Match:**
ahí la Prestadora ni se entera, y el relevo y el abandono se resuelven entre las partes
contratantes. Qué se delega en la aplicación del Contratante se evalúa en la mudanza de Match.

**Lo decidido, y no se vuelve a discutir:**

- **Un turno se cierra de cinco formas, y de ninguna otra:**
  - el relevo escanea el código QR del saliente, con la ubicación: abre el turno que entra, fija la
    hora de salida del saliente y cierra su turno si el Reporte está presentado;
  - el saliente escanea el código QR del Cliente, de una persona autorizada o de otro Asistente
    que cuida al mismo Paciente. El código registra que el Asistente salió, y con eso alcanza;
  - el Coordinador lo autoriza desde el Panel, y registrar la autorización cierra el turno. La
    hora de salida es la que él registra: el sistema le propone la fecha y la hora de ese momento
    y él la cambia antes de registrar, porque pudo autorizar de palabra y registrarlo después. La
    hora de salida no puede ser anterior a la entrada del turno, ni posterior al momento en que se
    registra, ni posterior a la entrada del Asistente que toma el turno siguiente. Los
    casos son dos: alguien recibió al Paciente y falló el teléfono o la ubicación, o el
    Coordinador fue a cubrir en persona. En ese segundo caso se autoriza a sí mismo y queda
    registrado que lo hizo; lo que eso cuesta lo ve la Prestadora;
  - el Paciente queda solo: hace falta el permiso explícito del Coordinador cada vez que pasa, y
    ese permiso cierra el turno. Lo carga sólo el Coordinador, en el registro de consentimientos,
    con fecha de vencimiento;
  - el cierre a mano desde el Panel, para los olvidos: motivo obligatorio de una lista, hora de
    salida que pone el Coordinador —el sistema le sugiere la última confirmación del Asistente en
    la casa— y registro de quién lo cerró y cuándo.
- **Todo cierre desde el Panel lo hace el Coordinador o la administración, por uno de los motivos
  de la lista, y pasa por un solo camino.** En el Panel no hay código QR.
- **El código QR va siempre junto con la ubicación.** «Sin comprobar» queda para la entrada y sale
  de la salida. La marca de cierre trabado, que nunca se usó, sale.
- **La presencia durante la guardia.** La aplicación queda abierta todo el turno, y si se cierra
  más tiempo del que fija la Prestadora, hay alarma. La ubicación se toma cada tantos minutos,
  según la Prestadora, y se guarda sólo dentro o fuera y la hora; las coordenadas se borran al
  cerrar el turno. **Viene encendida de fábrica**, y la Prestadora puede apagarla con una
  advertencia breve.
- **«Salida con el Paciente»**, con un motivo de la lista de la Prestadora: mientras dura no hay
  alarma por estar fuera, al Cliente se le avisa al salir y al volver, y si se pasa del tiempo hay
  alarma. Estar fuera sin avisar le manda una alarma al Coordinador.
- **El sistema junta información y sugiere; decide el Coordinador**, y cada Prestadora ajusta todo
  a su forma de trabajar.
  - **Titular que avisa que se demora:** el GPS calcula cuánto le falta. Dentro del margen de
    espera toma el turno con llegada tarde registrada. Fuera del margen se pregunta a los relevos;
    si llega antes el titular, se cancela la búsqueda; si llega antes un relevo, la guardia pasa a
    él y al titular se le avisa que no vaya.
  - **Titular que no avisa:** si el GPS no lo muestra en camino a tiempo, el Coordinador recibe un
    preaviso y pone en marcha el reemplazo. Si el titular aparece tarde, esté el relevo trabajando
    o en camino, el Coordinador decide quién se queda.
  - **Las cuatro alertas tempranas** —aviso telefónico previo, aviso de demora del Asistente,
    llegada tardía calculada y sin aviso ni salida— las enciende o apaga cada Prestadora, una por
    una. Agregar una alerta nueva es programarla, y queda para todas.
- **Si el relevo no llega**, el Asistente se queda y el tiempo de más cuenta como horas extra. Al
  abrirse la alarma el sistema busca en todo el Padrón y le muestra al Coordinador en Continuidad
  la lista ordenada, con lo que cada uno tiene a favor y en contra, sin escribirle a nadie. Los
  pedidos a los relevos los dispara el Coordinador, marcando a quiénes. A cada relevo se le
  pregunta si está disponible y cuánto tarda, también al personal de emergencia: escribe su tiempo
  y el GPS calcula otro, y el Coordinador los ve juntos, compara y elige. El turno se asigna
  siempre a uno solo. El pedido se cierra como resuelto también cuando el Coordinador elige entre
  el titular y el relevo, y a todos los que se les preguntó se les avisa que quedó resuelto, hayan
  contestado o no.
- **Una guardia cubierta nunca figura ausente**, tampoco la que cubrió el Coordinador en persona.
- **Penalizar al titular y compensar al relevo** son dos opciones separadas que cada Prestadora usa
  o no.
- **La convocatoria automática** es un automatismo que cada Prestadora enciende o apaga, y viene
  apagada. Si la enciende, elige cuándo arranca: **siempre**, junto con la alarma; o **sólo si el
  Coordinador no actúa**, cuando vence el plazo que ella fija sin que él haya convocado a nadie ni
  resuelto la alarma. Nunca le vuelve a preguntar a quien ya le preguntó el Coordinador.
  - **De a uno:** espera a cada persona el plazo que fija la Prestadora; si dice que no o no
    contesta, pasa al siguiente; si dice que sí, se detiene y le avisa al Coordinador, que decide,
    y si él la descarta sigue. Si se termina la lista sin nadie, le avisa al Coordinador.
  - **Todos juntos:** las respuestas llegan juntas a Continuidad y el Coordinador elige.
- **El orden de llamado** es una lista de grupos —personal de emergencia, franquero, los demás del
  Padrón, familiar— que ordena la Prestadora. Adentro de cada grupo, el sistema ordena a las
  personas por su Ponderación en el momento de la alarma.
- **Las alarmas:** las de hoy por WhatsApp y correo —el mensaje de texto tiene el lugar hecho y
  no sale, porque no tiene proveedor—, más el aviso al teléfono del
  Coordinador y un sonido que persiste en el Panel, con insistencia que se acelera.
- **Configuración obligatoria antes de operar, sin valores de fábrica:** el Coordinador de
  respaldo, el orden de llamado, de a uno o todos juntos, y los tiempos. El sistema muestra una
  sugerencia —de a uno; emergencia, franquero, los demás del Padrón; y los tiempos que hoy trae
  cada Prestadora—, pero no cuenta como
  configurada hasta que la Prestadora la confirma o la cambia. Mientras tanto figura pendiente en
  la guía de puesta en marcha y la Prestadora no puede asignar turnos.
- **El relevo confirma antes de ir**, con la anticipación que fija la Prestadora. Si no confirma,
  el Coordinador recibe una alarma temprana.
- **El Relevo de emergencia** se puede pedir en cualquier momento de la guardia, más de una vez,
  y no la cierra: le hace sonar la alarma al Coordinador.
- **Si el Asistente no vino o se fue**, se detecta por la ubicación fuera sin aviso, por la
  aplicación cerrada, por el botón «Paciente sin Asistente» del Cliente o porque el relevo no
  encontró a nadie —y entonces entra con el código QR del Cliente—. Queda como «Egreso sin
  relevo» en el Panel y en el Legajo, y las consecuencias las decide la Prestadora.
- **Al Cliente se le avisa siempre**, que no llegue a la casa y se encuentre al Paciente solo.
  Primero el Coordinador tiene un plazo para resolverlo, y puede ir él mismo a cubrir. Cada
  Prestadora fija dos plazos, uno para el que no vino y otro para el que se fue; los dos son
  obligatorios, no traen valor de fábrica y pueden ser cero. Vencido el plazo, el aviso sale
  siempre, y la Prestadora no lo puede apagar.
- **Las horas, tres elecciones separadas por Prestadora**, cada una guardada con su fecha:
  - qué se le paga al Asistente: las programadas, **las reales (de fábrica)**, o las programadas
    con tolerancia;
  - qué se le informa a la obra social: las programadas, **las cubiertas (de fábrica)**, o las
    programadas con las no cubiertas aparte;
  - qué se le cobra al Cliente: las programadas, **las cubiertas (de fábrica)**, o las programadas
    con las no cubiertas aparte en la factura.

  La primera opción de cada una lleva advertencia legal si el documento del país dice algo. Un
  turno sin cerrar no se paga hasta que el Coordinador lo cierra con su hora de salida.
- **El turno sin Reporte se factura igual.** La falta del reporte no es motivo para dejar
  de facturarle el turno al Cliente, salvo que la Prestadora elija esperar el reporte; viene
  elegido facturar. Si espera y el reporte llega después de emitida la factura del período, el
  turno entra en la factura siguiente. Al Asistente se le insiste con un aviso al teléfono cada
  tantas horas mientras el reporte falte, cada 2 de fábrica, entre 1 y 24 según la Prestadora; al
  Cliente no le llega nada. Las horas se le liquidan al Asistente cuando presenta el reporte, y si
  la liquidación del período ya se hizo, entran en la siguiente, una sola vez.
- **Quedan afuera:** un código fijo en la casa, que el turno se lo lleve el primero que acepta, y
  el cierre automático.

**Las palabras nuevas ya están aprobadas** y entran al glosario: Paciente sin Asistente, Egreso sin
relevo, Horas no cubiertas, Salida con el Paciente, Relevo de emergencia y Salida sin
Reporte.

**Cada pantalla nueva espera su sí para tocar la interfaz, y cada texto visible su aprobación,
uno por uno.**

**30. Usted** — El texto de la advertencia que ve la Prestadora al apagar la ubicación periódica.

Los pasos ya comenzados de este tema están al principio, en la sección «Los pasos comenzados».




**34.** **La presencia y la Salida con el Paciente.** La aplicación abierta todo el turno, la
ubicación periódica guardada como dentro o fuera y borrada al cerrar, la advertencia al apagarla, y
la salida con motivo, aviso al Cliente y alarma si se pasa.

**Lo que ya está es la configuración:** viaje y turno o sólo viaje, los minutos entre controles y
los días para aceptar (`panel/src/pages/configuracion/LasAplicaciones.jsx:44-181`). Lo que la hace
funcionar no: hoy la aplicación sigue la ubicación sólo durante el viaje
(`pwa-asistentes/src/lib/ubicacionDelTelefono.js:65-80`).

**Comprobación:** al cerrar el turno no queda ninguna coordenada guardada de la ubicación
periódica.

**35.** **Las horas, la confirmación del relevo y las correcciones.** Las tres elecciones de horas
con su fecha y su advertencia, la confirmación previa del relevo con su alarma temprana, y lo que
queda de las palabras: «Familiar» sale de lo guardado —la tabla de excepciones y el rol— y pasa a
Cliente o persona autorizada; «Suplente» sale de la interfaz.

**Comprobación:** «familiar» no queda en la tabla de excepciones ni entre los roles guardados, y
una liquidación hecha con
una elección vieja da el mismo número después de cambiarla.

---

## La entrada y el restablecimiento de la contraseña

**Va acá y no antes porque se apoya en la cuenta por Prestadora, más arriba en esta lista.** Cada
Prestadora donde la persona trabaja es una cuenta con su propia contraseña, así que la coordinadora que
habilita un cambio de contraseña abre una puerta que da a su Prestadora y a ninguna otra. Con una sola
contraseña para las tres, esa puerta daba también a las otras dos y esto no se podía hacer.

**Lo decidido, y no se vuelve a discutir:**

- **Tres vías para restablecer la contraseña, iguales para todas.** Por correo, por código de verificación al teléfono
  verificado, y llamando a la coordinadora. La Prestadora no configura nada de esto: no se le
  ofrece la opción de apagarlo.
- **El código de verificación se pide en dos momentos:** al restablecer la contraseña y al entrar desde un equipo nuevo.
  Para todos — administración, coordinación, Asistentes y Clientes.
- **Equipo nuevo quiere decir un aparato que no tiene una credencial guardada y desde el que nunca se
  entró.** Nada más que eso. No hace falta reconocer el navegador ni mirar desde dónde se conecta.
- **La huella y el rostro quedan afuera del restablecimiento de la contraseña.** Son para el día a día, en el teléfono, y
  sólo donde el aparato las tiene — la aplicación ya pregunta si puede y ante la duda contesta que
  no. En el Panel no están construidas. No pueden ser requisito de nada.
- **No hay aplicación de códigos para nadie más que el rol técnico**, que ya la tiene. Obliga a
  instalar algo aparte, y quien cambia de teléfono sin guardar el respaldo queda afuera.
- **El número viaja con el chip; la llave se queda en el aparato.** Con el mismo número en un
  aparato nuevo no hay nada que habilitar, porque lo verificado es el número.
- **Un número nuevo se cambia como en cualquier software corriente.** Se pide la contraseña actual, llega
  un código de verificación al número nuevo, y al escribirlo el número queda verificado y sirve de llave. Al correo
  le llega un aviso, por si el cambio no lo hizo su dueño. Nadie de la oficina tiene que llamar ni
  habilitar nada. Textual del Desarrollador: *«La industria del software ya encontro soluciones a
  este problema. Utilicemos la mas sencilla y eficiente»*.
- **Nada de esto puede impedirle a nadie trabajar.** La habilitación es para que un número se vuelva
  llave, nunca para entrar.

Los pasos ya comenzados de este tema están al principio, en la sección «Los pasos comenzados».


---

## El dinero

**Qué horas se le pagan al Asistente, se le informan a la obra social y se le cobran al Cliente**
está en la sección «El Paciente nunca queda solo».

Los pasos ya comenzados de este tema están al principio, en la sección «Los pasos comenzados».


**157.** Guardar con qué identificador figura cada Cliente en el software de facturación de su
Prestadora, que hace falta para la conexión directa del paso 39. Hoy no hay dónde:
`referencia_externa` existe sólo en `cobros_cliente`, `cobros_intermediacion` y
`verificaciones_asistente`. Va con esa conexión.


---

## La modalidad Match de cara al Cliente

Existe el andamiaje —base, disparadores, cobros, consentimiento—, el Cliente ya puede buscar un Asistente, ver su perfil público, escribirle por adentro de la aplicación y, activando el cobro, ver cómo llegar a él por afuera. **Todavía no puede contratarlo.**

**Cobrarle un contacto a un Cliente y facturarle el servicio son dos formas de cobro
de la misma Prestadora**, y cada Prestadora elige cómo cobra.

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

**Y queda un renglón para sacar en el plan de Match**, que dice que el precio y el tope de los
paquetes de contactos son de CeltaTech. Nació de leer «la decisión comercial no es del producto»
como «lo vende CeltaTech», que es otra cosa: la decide cada Prestadora. Ese repositorio está en
sólo lectura, así que el renglón se saca cuando se lo toque.

**43. Usted** — Prioridad de acceso al Padrón ante una baja: el PRD la define en una línea (`docs/PRD_07_Modalidad_Match.md:161`) y de ahí salen dos productos distintos. ¿Es que el contacto del reemplazo no vuelva a costar durante una ventana —ni descuenta saldo ni pide un acceso nuevo—, o es que a ese Cliente se le avise primero cuando algún Asistente del Padrón vuelve a estar disponible? ¿O las dos? Y antes que eso: hoy el Cliente no contrata por Match, así que no hay baja que detectar. ¿Qué cuenta como baja — que el Asistente se saque de los disponibles, que el Cliente cierre el Servicio, o hay que construir antes el vínculo?

**44.** Construirla según lo contestado.

Los pasos ya comenzados de este tema están al principio, en la sección «Los pasos comenzados».


---

## Los huecos del Panel

**46. Usted** — ¿Cómo se le presenta la Asistente nueva al Cliente — mensaje sin respuesta, aceptación explícita, o fuera del sistema? **Cuelga del acto de armar el Servicio**, más arriba en esta lista: sin Servicio armado no hay a qué Cliente presentarle a nadie.

**47. Usted** — Las dos observaciones de apariencia que quedan, porque las dos son decisiones de diseño: ¿con qué pantalla abre la aplicación del Cliente cuando hay más de un Paciente — hoy abre en la lista, y con uno solo ya se saltea al detalle? ¿Y cuál es la identidad visual de las dos aplicaciones, que nunca pasaron por su etapa de diseño?

El Desarrollador está preparando una maqueta orientativa de cómo tienen que verse y cómo se recorren. **La maqueta mejora lo que ya está construido: no es condición para construirlo.** Las pantallas que faltan se hacen ahora, con la apariencia que el producto ya tiene, y cuando la maqueta llegue se acomoda lo que haya que acomodar. Ningún paso de esta lista espera por ella.

**48. Usted** — Rotación y retención de Asistentes: ¿cuál es la fórmula y cuál el umbral?

**49.** Ponerlo en el tablero. Se calcula desde `asistentes`, sin tabla nueva.

**156. Usted** — El teléfono del Asistente en el Legajo y en las postulaciones se muestra sin enlace
a WhatsApp, y en la Ficha del cliente sí lo tiene (`linkWhatsapp`, `panel/src/lib/telefono.js:3`).
¿Se le pone el mismo enlace? Es interfaz, así que espera su sí.

---

## El tablero de Situación operativa

**Lo decidió el Desarrollador renglón por renglón.** Cada renglón es una tarjeta, una lista o un
gráfico. Van ordenados de lo más grave a lo de rutina, un clic abre el detalle, y nada aparece dos
veces.

Los renglones, en este orden:

- **Emergencia.** Lo que un Asistente avisó con el botón de emergencia y nadie tomó todavía. Cuenta
  sólo eso; la lista de emergencias está en la sección «Las dos aplicaciones».
- **Ausencias no programadas.** Asistentes que no llegaron a su turno.
- **Ingreso/Egreso en espera.** Asistentes que están en el domicilio esperando el código para
  registrar la entrada o la salida.
- **Turnos sin asignación.** Turnos sin Asistente, incluidos los que se asignaron y se rechazaron.
- **Asistente ausente.** El relevo que no llegó.
- **Salida sin registrar.** El nombre es provisorio: al Desarrollador no le gusta y no encontró uno
  mejor. Hoy el Panel lo muestra como «Sin cerrar la salida».
- **Estado del Paciente.** Los avisos amarillos o rojos que dejó la revisión de los informes y que
  nadie resolvió.
- **Documentación.** Matrícula y demás documentos de los Asistentes, vencidos o por vencer. Al abrirlo
  se ve qué documento tiene el problema. El mismo aviso le aparece al Asistente en su aplicación.
- **Informes.** Turnos terminados sin informe. Al hacer clic, quien coordina o administra ve de qué
  se trata.
- **Prospecto, Oportunidad o Cliente**, según la etapa comercial en que esté cada uno.
- **Postulante.** Personas que se postularon para trabajar. Es parte de Reclutamiento.

**Salida sin registrar, y lo mismo con la entrada.** Si el turno terminó y la salida no se
registró, a los 15 minutos aparece el aviso; cada Prestadora cambia ese plazo en su configuración.
El renglón dice sólo «Salida sin registrar»; al hacer clic
muestra las horas de entrada y salida registradas y las que faltan, del turno y del siguiente, sin
ninguna frase que las interprete. Un Asistente que se queda de más sin que lo releven hace
saltar la alarma del relevo que no llegó, salvo que sea el último turno de la guardia. La
coordinación consulta a los Asistentes involucrados: si fue un olvido, cierra el turno a mano; si
fue otra cosa, busca la solución; si no puede resolverlo, lo pasa al escalón de arriba.

**Cómo se cierra un turno, qué pasa sin Reporte y qué se le avisa al Cliente** está en la
sección «El Paciente nunca queda solo». De ahí salen también los estados nuevos que este tablero
tiene que mostrar: Egreso sin relevo y Relevo de emergencia.

**Lo que sale del tablero.** Turnos de hoy, Servicios en curso y Asistentes trabajando, porque no
piden hacer nada. Y las cuentas esperando su contraseña, que desaparecen con la regla del número nuevo,
en la sección «La entrada y el restablecimiento de la contraseña».

**Lo que va al Resumen del mes, en gráficos:**

- **Servicios a lo largo del tiempo**, en una línea mes por mes.
- **Prestaciones**, en una torta que las cuenta, y **Ventas**, en otra que las pondera por lo que
  se vende de cada una. Ventas la ve sólo la administración, igual que los pagos a los Asistentes.

**141.** Construir el tablero con los once renglones, en ese orden, y el Resumen del mes con sus
tres gráficos. Hoy `panel/src/pages/EstadoActual.jsx` muestra otros renglones —entre ellos los que
salen del tablero— y `panel/src/pages/Dashboard.jsx` no tiene ningún gráfico.

**53.** Las tres etapas comerciales:

- **Prospecto:** alguien de afuera de los clientes que mostró interés en los servicios de la
  Prestadora, porque se comunicó o porque la Prestadora lo contactó.
- **Oportunidad:** tiene un presupuesto de un servicio que se está negociando, con las condiciones
  cargadas y sin firmar.
- **Cliente:** desde que se cierra el trato y se empieza a preparar el servicio, mientras dure
  —pueden ser años— y también después de terminado, aunque esté inactivo.

**La etapa no la marca nadie: sale de lo que pasa.** Cargar un presupuesto convierte al Prospecto
en Oportunidad; cerrar la negociación de forma positiva lo convierte en Cliente; si la negociación
fracasa, vuelve a ser Prospecto con todo su historial. Es la misma persona de Contactos en
las tres etapas, nunca una tabla aparte. Sin presupuesto aprobado no hay Cliente, y no hay alta manual de
Cliente desde el Panel; la cartera que una Prestadora ya tenía se migra aparte (paso 29).

Prospectos y Oportunidades son asunto de la comercialización, que es la administración. Los Clientes
les importan a la administración y a la coordinación, y a los Asistentes involucrados en lo suyo.
En definitiva es un CRM, con todo lo que eso trae, y es OctoCRM: Careonys lo usa a través de su
API, pero los datos viven en Careonys: la persona, los presupuestos, la etapa y el historial.
OctoCRM no guarda ningún dato de ningún otro producto en sus bases, porque se vende solo y además
lo usan otros productos de CeltaTech; Careonys lo usa como si fuera propio. Falta decidir qué
muestra el tablero de los Clientes.

---

## Los cambios del diseño que se deshicieron

**El diseño nuevo del Panel se publicó entero de una vez y se deshizo.** Lo que de ahí sigue
pendiente se vuelve a hacer **de a un cambio por vez**: usted lo aprueba antes, se publica, y usted lo
revisa antes del siguiente.

**154. Usted** — Aprobar, uno por uno y en este orden, cada cambio:

1. **La pantalla de entrada en un molde único**, con el enlace para recuperar la contraseña más
   arriba. La línea «con la tecnología de {{producto}}» se queda.
2. **El menú reorganizado.**
3. **Los nombres nuevos del menú**: Documentación a regularizar, Facturación y pagos, Plantillas.
   Cada nombre lo aprueba usted.
4. **La apariencia de las páginas**, que es el cambio de más riesgo.
5. **La franja fija de Emergencias**, que hoy no existe.
6. **Calificaciones pasa a Asistentes, para las dos modalidades.** Hoy está en
   `/intermediacion/calificaciones` (`panel/src/components/layout/Layout.jsx:207`,
   `panel/src/App.jsx:251`) y la pide a la ruta del backend de Match
   (`backend/src/routes/panelIntermediacion.js`), que se muda con ella.
7. **Las cuatro secciones de Match**, que se deciden junto con el paso 22.
8. **La columna Modalidad en el Directorio de Clientes** (`panel/src/pages/clientes/Clientes.jsx:161`):
   primero, si se quiere.

**155.** Aplicar cada uno a medida que se apruebe.

---

## Reclutamiento

**Al llegar acá se vuelve a analizar entera contra Match.** Match tiene un reclutamiento más
desarrollado que el de acá —formulario de alta por pasos en la web y en el teléfono, documentos
adjuntos revisados uno por uno, resolución con motivo obligatorio e historial— y lo que sigue se
escribió sin mirarlo.

**La modalidad se decide en el reclutamiento.** El postulante dice en qué modalidades se ofrece
—Prestación directa, Match o las dos, entre las que la Prestadora tiene habilitadas— y la
Prestadora lo habilita o no en cada una como uno de los pasos del reclutamiento. No es una casilla
que se configura después en el Legajo. Hoy el código hace otra cosa: al pasar de postulación a
Asistente le pone todas las habilitadas de la Prestadora, sin que nadie lo elija.

**Primero el Certificado de Aptitud, después Activo.** El certificado es lo que cierra la
verificación, y recién con él se lo pasa a Activo. Hoy el código lo tiene al revés: el certificado
sólo se emite si el Asistente ya está Activo, se lo puede pasar a Activo sin ningún certificado, y
si después vuelve a Inactivo el certificado sigue figurando vigente en la aplicación del Cliente.

**La documentación que falta es del reclutamiento, y se trata acá.** Un Asistente no llega a Activo
sin los documentos que su Prestadora le exige. Hoy el código lo deja pasar sin mirarlos, y lo
único que frena es la asignación de guardias. Los vencidos son otra cosa —se tuvieron y hay que
renovarlos— y los avisa el Estado actual. Cuando se haga, se resuelve también qué pasa con los
Asistentes que ya están activos y a quienes les falta un documento pedido después de su alta.

**La ubicación se acepta en el reclutamiento, no en la aplicación.** Cada Prestadora elige en su
configuración una de dos formas de trabajo:

1. **Ubicación obligatoria.** Es condición del reclutamiento: el postulante que la acepta sigue, y
   el que no la acepta no obtiene el Certificado de Aptitud y no trabaja con esa Prestadora.
2. **Ubicación sólo en el viaje de ida y en los escaneos de entrada y salida.** La Prestadora
   renuncia a saber dónde está el Asistente durante el resto de la guardia.

En ninguna de las dos el Asistente decide nada desde la aplicación: en Perfil → Privacidad sólo
ve el texto que firmó. Lo que falta es el paso del reclutamiento donde se firma.

El reclutamiento es un módulo común a las dos
modalidades y la base de Asistentes de cada Prestadora es una sola para las dos; lo que faltaba
para poder construirlo son las listas de opciones por Prestadora y los formularios declarados, y **las
dos ya están construidas** —`listas_de_opciones` y `opciones_de_lista`, con su
pantalla en `panel/src/pages/configuracion/LasListasDeOpciones.jsx`, y
`formularios_declarados`, `formulario_secciones` y `formulario_campos`—. Sigue trabada por la pregunta **«¿dónde corre un módulo y contra
qué base?»**, más abajo.

Los tres arreglos, para que estén escritos:

1. **No existe el formulario público de postulación**, ni pantalla ni ruta del backend que reciba una postulación, y en la base no hay ninguna. Cuando se haga, pide lo mismo que el alta de un Legajo: tipo y número de documento, DNI donde el documento lo contiene, y género, todos obligatorios.
2. **Faltan las listas.** Género ya es un catálogo con tres opciones, y hay cuatro listas de fábrica: disponibilidad, situación fiscal —con una sola opción— y los medios de pago, al Asistente y del Cliente. Nacionalidad y los cinco subgrupos de experiencia clínica no existen como lista: hoy se guardan como texto libre. **La pantalla donde se cargan ya está construida** —`panel/src/pages/configuracion/LasListasDeOpciones.jsx`—, así que lo que queda es crear y sembrar las que faltan.
3. **Al incorporar un aspirante se pierden datos.** Lo que cargó en la postulación no llega entero al Legajo del Asistente: pasan el nombre, el teléfono, el email, el documento, el género, la disponibilidad y las referencias laborales, y se quedan afuera, entre otros, las especialidades, el domicilio, la situación fiscal, los estudios y el honorario pretendido (`backend/src/routes/panelCuentas.js:184-238`). Las zonas no pasan a propósito.

4. **Le faltan datos a la postulación.** `postulaciones` guarda el nombre en una sola columna y el documento sólo como `dni`; tiene que guardar el apellido aparte y el tipo y el número de documento, igual que `asistentes` (`documento_tipo`, `documento_numero`, `documento_pais`).
5. **Los estados de la postulación están escritos en la pantalla** (`panel/src/pages/Postulaciones.jsx:23`) y la base no los restringe. Pasan a la base, según «Los catálogos salen de la base».

Los pasos ya comenzados de este tema están al principio, en la sección «Los pasos comenzados».


**67. Usted** — ¿Se le bloquea la asignación de guardias a quien no está inscripto en monotributo, o se avisa y decide la Prestadora? La regla del producto dice avisar, no bloquear, así que el PRD y la regla no coinciden. **Lo que se asigna es un turno de guardia**, y asignarlo supone el Servicio armado, más arriba en esta lista.

**68.** Construirlo según lo contestado. Incluye un sexto número en los totales de Postulaciones —las aprobadas sin monotributo—, que hoy arma cinco.

**142. Usted** — Dos cosas del reclutamiento que no tienen definición:

- **El orden de los postulantes.** El PRD dice que los estudios y la experiencia laboral los ponen más arriba, y no dice cómo. Hoy se ordenan sólo por fecha (`panel/src/hooks/useSupabaseTable.js:12`).
- **Comprobar que la foto de perfil muestre una cara** antes de aceptar la postulación. Ninguna parte del código lo hace. Es tratamiento de imagen de una persona, igual que la comparación del paso 69, y puede ir con el mismo proveedor.

**143.** Construirlo según lo contestado.

**69. Usted** — Comparar automáticamente la foto del documento con la foto de la cara es tratamiento de dato biométrico, y hacen falta dos decisiones suyas: ¿cuál es el documento legal del que sale la advertencia al Asistente, que hoy no existe y sin la cual no hay advertencia? ¿Y qué proveedor compara las dos caras? Guardar las dos fotos y mostrarlas juntas ya está hecho: hoy las compara una persona.

**70.** Construirlo según lo contestado.

**71. Usted** — El programa de capacitación: qué contenido lleva, cuántas preguntas y qué nota se necesita para aprobar. Hoy «capacitación» es sólo el nombre de una etapa.

**72.** Construirlo.

---

## Las dos aplicaciones

**73. Usted** — Compartir el Certificado de Aptitud: ¿hacia dónde y por qué medio? Hoy se puede ver, con su estado y su fecha. Compartirlo hacia afuera exige decidir a quién se le manda, por qué canal y qué ve quien lo recibe, porque no existe ninguna verificación pública del certificado: sin eso, lo compartido sería una imagen que no prueba nada.

Los pasos ya comenzados de este tema están al principio, en la sección «Los pasos comenzados».


**75.** Con eso contestado, construirlo — incluida la lista de medios de transporte, que hoy es texto libre escrito en cada salida y por eso no hay contra qué traducirlo a una velocidad.


**144. Usted** — Tres cosas de la guardia en curso que no están decididas:

- **Si la salida espera a las horas mínimas de la modalidad.** Hoy el backend no compara el cierre contra ninguna cantidad de horas (`backend/src/routes/appAsistentes.js:2011-2081`).
- **Las notas del Coordinador en la Guardia Activa**, junto a los datos del Paciente. No hay dónde guardarlas: ni `pacientes`, ni `turnos_guardia`, ni `servicios` tienen una columna para eso.
- **El mapa del Cliente durante la guardia y el botón «Ver al Asistente en el mapa».** Hoy el mapa existe sólo durante el viaje, desde «Salgo ahora» hasta la entrada (`pwa-clientes/src/pages/PacienteDetalle.jsx:157-160`), y no hay botón. Seguir al Asistente adentro del domicilio es otra cosa que seguirlo en el camino.

**145.** Construirlo según lo contestado.

**78. Usted** — La lista de emergencias de cada Prestadora. Decidido por el Desarrollador, textual: *«cada prestadora podra armar su lista de emergencias dentro de la configuracion propia. Desde Careonys podemos proponer algunas, por ejemplo "Emergencia Medica", etc y un plan de accion sugerido y hasta acciones preconfiguradas que se pueden accionar automaticamente o no ante determinada emergencia. todo ello configurable por la prestadora»*. Queda así:

- Cada Prestadora arma su lista de emergencias en su configuración: agrega, cambia y quita.
- Careonys trae una lista de fábrica como propuesta, y cada emergencia de esa lista con un plan de acción sugerido.
- Cada emergencia puede llevar acciones preparadas de antemano. Para cada acción, la Prestadora elige si se ejecuta sola o la dispara una persona.
- **El Asistente elige la emergencia de la lista al apretar el botón.** La lista trae además la opción «Otras», donde escribe qué está pasando cuando no figura. Textual: *«El Asistente, cuando dispara la emergencia ademas de la lista con las opciones tendra la opcion de "otras" donde puede escribir la naturaleza de la emergencia no listada»*.

Falta que usted conteste dos cosas:

- **Qué emergencias y qué plan de acción trae la lista de fábrica.** Los textos los aprueba usted, uno por uno.
- **Qué acciones se pueden preparar**: avisar al Cliente, llamar al servicio de emergencias médicas, mandar a otro Asistente, u otras.

Y algo que hoy está mal pensado y se corrige acá: **a qué número se llama.** `telefonos_de_emergencia` guarda un solo número por país, y la respuesta automática de WhatsApp lo da cuando alguien escribe una emergencia (`backend/src/utils/respuestaAutomaticaWhatsapp.js:126`). En Argentina el número cambia según el lugar y según la clase de emergencia —salud, policía, bomberos—, como señaló el Desarrollador con `https://www.argentina.gob.ar/tema/emergencias`. Hoy no hace daño solamente porque la tabla está vacía. Se corrige con la lista de emergencias, cuando se decida qué número corresponde a cada una y a cada lugar.


**80.** El Panel se instala también en el teléfono, sin dejar de ser lo que es. En la computadora sigue igual. En el teléfono se instala desde el navegador, recibe avisos aunque no esté abierto y abre primero lo urgente del día —quién no llegó, qué guardia quedó sin cubrir, a quién mandar de reemplazo—, sin perder el resto. Es el mismo programa, con la misma dirección, la misma cuenta y los mismos permisos: no es una tercera aplicación. En el iPhone los avisos llegan sólo con el Panel instalado en la pantalla de inicio, igual que en las dos aplicaciones. Las alarmas del relevo que no llega se apoyan en estos avisos: sección «El Paciente nunca queda solo».

**Usted, al terminar de configurar las dos aplicaciones** — El nombre de la sección Perfil → Privacidad de la aplicación del Asistente. Tiene que abarcar todas las condiciones de trabajo que el Asistente aceptó. Textual del Desarrollador: *«deberia ser algo que abarque todas las condiciones de trabajo que el asistente acepto»*.

---

## Configuración que todavía está escrita en el código

**82. Usted** — Nivel de complejidad: ¿qué significa cada uno de los tres? ¿Condiciona qué tipo de Asistente se admite? Hoy se carga y se edita, y el cálculo de candidatos no lo mira.

**83.** Que el cálculo de candidatos lo use.

**88. Usted** — Accesibilidad: el código está hecho, falta la respuesta legal. `docs/legal/argentina.md` no la menciona.

**89. Usted** — Un código QR fijo por Asistente, que lleve a su perfil público y a otros lugares todavía sin definir: ¿qué muestra esa página pública? No es el código con el que se entrega la guardia.

Los pasos ya comenzados de este tema están al principio, en la sección «Los pasos comenzados».


---

## Datos personales

**91. Usted** — Protección de datos personales: el texto lo tiene que dar el Desarrollador. `docs/legal/argentina.md` ya tiene la sección «Protección de datos e historia clínica» (`docs/legal/argentina.md:165`), con la ley, la conservación y la transferencia a São Paulo; lo que falta es el texto de la advertencia que se le muestra a la persona. Sin documento no hay advertencia.

**92.** La advertencia. Qué se hace con los datos de un Servicio cerrado hace años, que hoy no se purgan nunca, no se contesta acá: es el paso 122, más abajo en esta misma lista.

**93. Usted** — La ubicación de las personas: cuatro preguntas para el profesional legal. En los 27 archivos de `docs/legal/` no aparece ni una vez «ubicación» ni «GPS», y la ley 25.326 aparece sólo en `docs/legal/argentina.md`, sin nada sobre la ubicación. El registro del consentimiento está construido. De los textos sembrados, los borradores son de relleno, y hay además una frase corta vigente para la modalidad autónoma, en los tres idiomas, que tampoco pasó por un profesional. **Mientras no haya respuesta, el seguimiento no se enciende con nadie real.**

Los pasos ya comenzados de este tema están al principio, en la sección «Los pasos comenzados».


**95. Usted** — **Guardar sólo lo que hace falta.** La revisión está hecha y escrita en
`docs/DATOS_PERSONALES.md`: cada dato personal dice para qué sirve y quién lo lee, qué sale hacia
terceros y que los registros de actividad y de errores no guardan valores personales. Quedan cinco
grupos de datos que nadie usa y que hay que decidir si se sacan, porque sacarlos borra columnas: el
recorrido punto por punto del Asistente, 17 datos de las postulaciones, el dato del navegador de
los avisos de la aplicación, la Persona dentro de la guardia y las notas de la Persona. Se cierra
cuando usted decide cada uno y se aplica.

---

## Respaldo, continuidad y secretos

**96. Usted** — El alta del gestor de contraseñas, y completar las cinco filas en blanco de `celtatech/docs/CUENTAS.md`.

**97.** Rotar clave por clave lo que corresponda, decidiéndolo de a una. Supabase ya no tiene clave secreta: la que había se borró, y las heredadas están apagadas.

**Ya no queda ninguna contraseña escrita en el repositorio.** Todas salen del entorno, y las
cuentas de la base local nacen sin contraseña: se la pone un programa aparte después de cada
reconstrucción. Lo que queda por hacer acá es **rotar las cuentas que nacieron con las contraseñas que
estuvieron a la vista**: las de la Prestadora de demostración, las de la demostración de
continuidad de guardia, las de la prueba de cierre de Servicio y las que quedaron sin borrar de la
prueba del escaneo del Asistente.

Y queda además **una contraseña de prueba en texto plano dentro de la configuración de permisos de
una copia de trabajo**, que no es un archivo del repositorio y por eso el barrido no la alcanzó.

**98. Usted** — Abrir el último respaldo de cada Prestadora: desde `backend/`, con las variables `R2_*` del respaldo cargadas en el entorno, `node scripts/abrir_respaldo.mjs --prestadora <id> --clave <archivo con la clave privada>`. Baja el respaldo más nuevo de esa Prestadora, lo abre, muestra cuántas filas trae cada tabla y revisa que no haya ninguna de otra Prestadora. Le toca a usted porque la clave privada vive en la caja fuerte; el programa la lee del archivo y no la muestra. Se hace después de la primera noche con `CLAVES_PUBLICAS_DE_LOS_RESPALDOS` cargada en Railway, con las dos Prestadoras. **Si contesta `no_probado`, no salió mal: quiere decir que el respaldo estaba en orden y no traía ninguna fila**, y entonces hay que repetirlo con datos de prueba cargados.

**99. Usted** — Los dominios se renovaron en julio de 2026 y vencen en julio de 2027, y esa fecha hoy no está en ningún calendario: `celtatech.com` y `careonys.com` en Cloudflare, y `celtatech.com.ar` y `celtatech.net.ar` en NIC Argentina. Poner un recordatorio un mes antes de cada uno y, donde el registrador lo permita, dejar la renovación automática encendida — NIC Argentina no la tiene, así que ésos son los dos que de verdad dependen del recordatorio. Un dominio vencido no se cae despacio: deja de resolver, y con él se van las pantallas, el correo de la empresa y la entrada a las cuentas que se registraron con ese correo.

**136. Usted** — Abierto el 2026-10-25. Borrar la llave de la cuenta vieja de Backblaze, la del depósito `aurevia-backups-mirror`, que quedó escrita a la vista. El respaldo diario ya no la usa: escribe en la cuenta nueva, a nombre de cuentas@celtatech.com. Hoy no se pudo porque la cuenta bloqueó el ingreso por intentos fallidos. Se cierra cuando la llave ya no figure en **Application Keys**. Qué se hace con esa cuenta y con los respaldos viejos lo decide usted aparte.

Los pasos ya comenzados de este tema están al principio, en la sección «Los pasos comenzados».


**139. Usted** — Abierto el 2026-10-25. Railway y Cloudflare están a nombre de su correo personal. Pasarlos a cuentas@celtatech.com. Se cierra cuando ninguno de los dos dependa de su correo personal.

---

## Marca y dominio por Prestadora

**100.** Que la conversación quede guardada adentro del producto, según lo que se conteste sobre el botón de contacto de «Asistente Asignado», más arriba en esta misma lista. Hasta que el Panel no tenga un hilo de dos puntas, lo que se hablan el Cliente y el Asistente en prestación directa se va a WhatsApp y no queda adentro de ningún lado. El chat interno ya está construido entero —hilos, mensajes, tapado del contacto, pantallas en las dos aplicaciones, mensaje al celular y videollamada—, pero **sólo funciona donde la Prestadora pone Asistentes disponibles para que el Cliente elija**: exige un Cliente y un Asistente que se hayan encontrado ahí. En prestación directa no hay hilo, y hacia la Prestadora tampoco: el único canal con el Panel va en un solo sentido, del Panel al Asistente, y no hay dónde guardar lo que contesta.

Los pasos ya comenzados de este tema están al principio, en la sección «Los pasos comenzados».


---

## Módulos

**101.** Pasar a `careonys` los dos depósitos de respaldo, que son los únicos nombres de afuera que
todavía no lo llevan.

**102. Usted** — ¿Contra qué base guarda un módulo sus datos? Dónde corre ya está decidido: en
Railway, sin afectar lo que Careonys corre ahí (`celtatech/docs/POLITICA_DE_MODULOS.md:315-318`).
Hoy `Modulos\` no tiene ningún módulo. **Facturación y créditos y cobranzas ya están decididas como software aparte del que Careonys se sirve**, así que esto no decide si salen, sino dónde corren el día que existan.

Los pasos ya comenzados de este tema están al principio, en la sección «Los pasos comenzados».


---

## Decisiones que no traban nada empezado

**151. Usted** — ¿Qué tabla de opciones queda? Hay dos para lo mismo: `listas_de_opciones`, con su
pantalla y cuatro listas cargadas, y `opciones_postulacion`, vacía, que lee sólo el detalle de la
postulación para las especialidades (`panel/src/pages/PostulacionDetalle.jsx:50`).

**152.** Hacerlo según lo contestado, y sumar al glosario de los productos Careonys las palabras que
sigan en uso: «Guardia de cobertura». La definición se le presenta para aprobar.

**162. Usted** — La consulta de antecedentes penales hoy es manual. Si se automatiza, ¿con qué
proveedor?

**163. Usted** — ¿Cuánto tiempo se guarda el recorrido del Asistente (`turnos_guardia_tracking_gps`), y se
le pide al Asistente un consentimiento propio para eso? Va con las preguntas del paso 93.

**165. Usted** — ¿Se saca el pago a los Asistentes a un software aparte? No está decidido. Sería un
software que trabaja por API, construido sobre el código que ya existe en Careonys. **Nace
preparado para venderse solo**, se haga o no esta mudanza, y lo más probable es que termine siendo
un software de liquidación de sueldos y jornales. **Lo construye CeltaTech y es de CeltaTech**: no
es un software de terceros como el de facturación. Careonys tiene que seguir funcionando sin ese
software conectado: cada Prestadora elige, igual que con la facturación. **Si se hace, el reparto
ya está fijado:**

- **Queda en Careonys:** los turnos de guardia con las horas trabajadas; el valor que el Asistente
  pretende en su Legajo y el valor acordado en cada Servicio, con el ajuste del valor del Legajo
  por índice; los índices de actualización, que también ajustan el precio al Cliente; y la factura
  al Cliente.
- **Se va al software aparte:** las escalas legales; los conceptos que suman o restan; la regla y
  la frecuencia de pago; el cálculo de la liquidación, las liquidaciones y el registro de cada
  pago; y los datos bancarios del Asistente, que él sigue cargando desde su aplicación.
- **Careonys le entrega** las horas trabajadas de cada Asistente con el valor que corresponde a
  cada una. **El software le informa** qué períodos ya se le pagaron a cada Asistente.
- **Primero se separa** el cálculo de la factura al Cliente, que hoy comparte el programa con el
  cálculo de la liquidación.

**104. Usted** — Empresas subcontratadas o tercerizadas: son un recurso dentro de la prestación directa, como el Padrón propio, y no una modalidad. Todavía no hay dónde cargarlas ni cómo encargarles una prestación. La precondición era no construirlo hasta que una Prestadora real lo pida. ¿Sigue valiendo?

**105. Usted** — Un tercero que sólo mira: ¿cómo entra un Pagador que sólo consulta? Un cuarto rol, un Coordinador de sólo lectura desde el catálogo de permisos, o no se hace. Lo que vería ya lo fija la regla de la empresa: el cumplimiento en números agregados, nunca el contenido (`celtatech/CLAUDE.md`, «Seguridad, privacidad y auditoría», «Quien paga un servicio sin recibirlo ve el cumplimiento, nunca el contenido»).

**106. Usted** — ¿Careonys va a atender establecimientos donde conviven Pacientes de Clientes distintos — una residencia, un geriátrico? Si es más adelante, alcanza con dejarlo dicho.

Los pasos ya comenzados de este tema están al principio, en la sección «Los pasos comenzados».


**109. Usted** — El puntaje interno de calidad del Asistente, que sólo ve el Admin: ¿sigue en pie ahora que existen las estrellas que pone el Cliente? Si sigue, faltan dos respuestas: qué lo compone, y la garantía de que ninguna acción automática dependa de él. La tabla donde iría ya existe, con su permiso (`datos_reservados_asistente`), y no tiene la columna del puntaje.

**Usted — para analizar, no para resolver ahora.** Un registro de cambios general: qué dato
cambió, de qué valor a qué valor, quién y cuándo, para cualquier tabla que lo necesite. Hoy no
existe: cada cambio que se registra tiene su lista propia, y hoy son nueve —las seis `auditoria_*`,
el historial del registro clínico, el registro de actividad y los cambios de la fecha prevista de
vuelta de una ausencia—. El registro de actividad anota qué campo cambió, y de qué valor a qué valor
sólo en algunas acciones. Si se construye, se decide si absorbe el historial
del registro clínico y el de las ausencias, o si quedan varias listas para lo mismo.


**112. Usted** — Qué hace Careonys de su lado cuando recibe esa orden y adentro quedan Asistentes
trabajando y Clientes con acceso abierto. Cortar el acceso y dejarlo todo en su lugar no es lo
mismo que darlo de baja.


**114. Usted** — El acompañamiento online: ¿prestación más, o guardia sin domicilio? Si es guardia, hay que decidir qué reemplaza al check-in por ubicación. **Las dos palabras son ahora dos niveles distintos del glosario**, así que la pregunta elige entre uno y el otro: una Prestación con su precio y sus horarios, o una guardia que se reparte en turnos. Y lo que reemplaza al check-in por ubicación es del turno, no de la guardia.

**115. Usted** — El «Gestor del cuidado»: ¿rol nuevo, variante de Coordinador, o entrada en el catálogo de permisos por Prestadora? La tercera no rompe la regla de los tres roles de Panel; las dos primeras sí.

**Ya se puede contestar.** El acto de armar el Servicio está construido: **una sola persona
coordina todo el Servicio**, la asigna la administración y sin ella no hay guardias
(`sin_coordinador_no_hay_turnos_guardia`, `el_coordinador_lo_asigna_la_administracion`). La pregunta es si
hace falta alguien más además de esa persona.

**116. Usted** — Cursos para Clientes: ¿va o no va?

**118. Usted** — La categoría de convenio del Asistente, de la que depende su remuneración básica.
Hoy no se carga en ningún lado: la columna salió de la base junto con los restos del cálculo de
sueldos e indemnizaciones. Cuando vuelva, si se teclea a mano queda escrita distinto en cada
Legajo: no se puede saber cuántos Asistentes hay en cada categoría, ni aplicarle un cambio de escala
a todos los de una de una sola vez. **Qué hay que analizar:** si pasa a ser una lista que la Prestadora carga —porque las
categorías de otro país son otras y no pueden venir escritas en el código—, y qué se hace con las
liquidaciones que ya salieron. **El mecanismo para que sea una lista ya está construido**, con las
listas de opciones por Prestadora y su pantalla de carga; lo que falta decidir es si corresponde y
qué pasa con lo ya liquidado.

---

## El sitio web

**119. Usted** — ¿Se autoriza construir `careonys.com` según `docs/PRD_01_Sitio_Web.md`? El PRD ya está entero. Hoy `sitio-web/` es una página que dice «En construcción». **El diseño se hace de cero**: del sitio público de Match no viaja nada visual.

**120.** Construirlo.

**146. Usted** — De quién es la página pública de Careonys: de CeltaTech o del producto. Hoy el código vive en `sitio-web/` de este repositorio. Si es de CeltaTech, el código y `docs/PRD_01_Sitio_Web.md` se mudan.

**147.** El cartel de obra y el `noindex` de `careonys.com` (`sitio-web/index.html:103` y `:11`) salen juntos, cuando estén escritas las seis páginas y los textos de privacidad y de términos.

---

## El cumplimiento que se agrega encima

**Va al final porque nada de esto obliga a reescribir lo anterior.** Son piezas que se apoyan sobre
lo que dejaron los cimientos y se suman sin tocarlo. Hacerlas antes no ahorra nada y demora el MVP;
hacerlas después cuesta lo mismo.

**Lo que sí es condición:** antes de dar de alta una Prestadora real de un país, ese país tiene que
tener cargado lo suyo. Lo de cada país, con artículo, está en su documento, en `docs/legal/<país>.md`.

Los pasos ya comenzados de este tema están al principio, en la sección «Los pasos comenzados».











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

**Y hay una tanda que no espera al MVP, porque no es consulta sino contrato:** los contratos con
los proveedores que habilitan alojar en São Paulo los datos de una Prestadora argentina tienen que
estar firmados y presentados a la autoridad antes del alta de la primera Prestadora real. Eso está
en «Los cimientos», y por eso está ahí y no acá. El procedimiento está en
`celtatech/docs/CLAUSULA_TRANSFERENCIA_INTERNACIONAL.md`.

**131. Usted** — Las escalas legales: la validación. En el mismo viaje va el texto de la advertencia sobre el abandono de persona: ninguno de los veintisiete documentos de `docs/legal/`
lo menciona —lo único parecido es el abandono de *trabajo*, art. 244 LCT, en
`docs/legal/argentina.md:146`, que es otra cosa—, y la regla del producto prohíbe improvisarlo. Sin
documento no hay advertencia; la mecánica se construye igual, porque no depende de ninguna ley.

---

## Los carteles y el texto visible del Panel

**Todo lo de esta sección es texto que ve alguien, así que lo aprueba usted, uno por uno.** El
relevamiento completo está en `docs/CARTELES_DEL_PANEL.md`, cartel por cartel y con la pantalla
donde se ve cada uno; sus decisiones ya tomadas están en `docs/CARTELES_DEL_PANEL.docx`, que es
fuente y no se modifica.

**Va al final, antes del cierre: primero tienen que funcionar todos los sistemas.**

**Y va antes del paso que decide si los idiomas pasan a la base**, que es el último de esta sección, por un motivo de
orden: los mensajes que manda el producto ya viven en la base, con su texto en los tres idiomas y
lugar para una fila propia por Prestadora, que hoy ninguna tiene; lo que sigue escrito en un archivo es el texto de las pantallas del
Panel, que es exactamente lo que barre esta sección. **No se muda lo que se va a sacar.**

**La regla de fondo:** cuantos menos carteles haya, más atención recibe cada uno — es inversamente
proporcional. Y **cuando un texto sale, sale el cartel entero**: no queda el recuadro vacío
diciendo nada.

**Contra qué choca esta revisión en el resto de la lista.** Son tres:

- **La advertencia legal del código no la contesta usted.** Por regla el aviso sale del documento
  legal de ese país, y ese documento no existe. Espera a lo del abogado, más abajo, no a una
  respuesta suya.
- **El barrido del tuteo alcanza pantallas que todavía no están escritas** —el formulario de
  postulación, lo que falta de las dos aplicaciones—. No se barre dos veces: la regla queda
  escrita y cada pantalla nueva nace cumpliéndola.

**Y el texto de la sugerencia de Asistentes es el mismo trabajo que el acto**, no uno de carteles:
la pantalla dice que ordena por zona y el cálculo no la mira. Se arregla arreglando el cálculo.

**54. Usted** — Los carteles que esperan su texto, cuyo detalle está en
`docs/CARTELES_DEL_PANEL.md`. Las fichas 2, 9 y 12 ya tienen el texto o el molde escrito en el
`.docx` y lo único que falta es confirmarlo.

**55. Usted** — La pregunta que usted dejó escrita en el `.docx`: si alguna pantalla dice «La
Prestadora». Sí lo dicen, y el relevamiento completo está en `docs/NOMBRAR_A_LA_PRESTADORA.md`. La
otra pregunta, qué es un selector, era de la fila 4, un cartel que ya no está en el código.

**56. Usted** — El cartel que quedó parado porque no ubicó la situación: la ficha 21 de
`docs/CARTELES_DEL_PANEL.md`. Va con la pantalla delante.

**57. Usted** — Los tres grupos que quedaron sin autorizar: los once textos que salen por ser una
aclaración debajo de un casillero, los catorce que pasarían a formar parte de la etiqueta del
casillero, y los nueve casilleros que están mal hechos y por eso necesitaban esa aclaración.

**58. Usted** — Habilitar cambio de contraseña, que `docs/CARTELES_DEL_PANEL.md` deja afuera por
su decisión: qué carteles lleva se decide después de analizar el procedimiento y su lógica, no
antes.

**60. Usted** — Tres cosas que son texto visible y no se pueden decidir de mi lado: la
contradicción del certificado, donde dos textos dicen cosas distintas del mismo código; las cuatro
frases que le nombran al usuario el permiso de acceso, que la regla del producto dice que la
Prestadora no ve ni sabe que existe; y la advertencia legal escrita adentro del
código de la aplicación del Asistente, que según la regla tiene que salir del documento legal de ese
país.

**153. Usted** — Las fichas de `docs/FRASES_PARA_APROBAR.md` que tienen la decisión en blanco.

**61.** Aplicar todo lo contestado.

**63. Usted** — Aprobar las 44 fichas de redacción de `docs/RELEVAMIENTO_DE_TEXTOS.md`: 10 textos
al pie del campo, 7 mensajes de «se guardó», 17 ventanas de confirmación, 3 carteles de las dos
aplicaciones del teléfono y 7 textos que no cumplen las cuatro fuentes de `..\..\CLAUDE.md` §8. El
relevamiento está hecho: no hay tuteo ni voseo en las traducciones, y el botón «Habilitar cambio de
contraseña» no necesita cambio. Se cierra cuando usted contesta cada ficha y se aplica.

Los pasos ya comenzados de este tema están al principio, en la sección «Los pasos comenzados».


---

**108. Usted** — ¿Los idiomas siguen en un archivo o pasan a la base? De esto depende si sumar un
idioma es una publicación o una carga de datos. **Y está contestado a medias sin que nadie lo
anotara**, así que la pregunta es más chica de lo que parece:

- **Las listas de opciones ya viven en la base**, con la traducción adentro de cada opción.
- **Los mensajes que manda el producto también**, en `mensajes_del_sistema`, con su columna de
  traducciones. Admite una fila propia por Prestadora, y hoy no hay ninguna. El Panel ya lee de ahí
  el pie de firmas (`panel/src/hooks/useFrasesDelSistema.js:27`).
- **Lo que sigue en un archivo es el resto del texto de las pantallas del Panel** —`panel/src/i18n/translations.js`—.

Así que lo único que esto decide es ese último resto. **Y se contesta después de los
carteles**, que están más arriba en esta misma sección: es justamente ese archivo el que se barre ahí, y no tiene sentido mudar
texto que va a salir.

---

## Cierre

**164.** El manual del usuario. Antes de escribirlo hay que sacar de `docs/TEXTOS_PARA_EL_MANUAL.md`
los temas marcados «No existe», que no tienen pantalla en el Panel, o construir esas pantallas.

**132. Usted** — El documento de roles generado desde la base: ¿para quién es, interno de CeltaTech o manual para la Prestadora?

**133.** Generarlo.

Los pasos ya comenzados de este tema están al principio, en la sección «Los pasos comenzados».


**135.** Correr las pruebas y publicar.
