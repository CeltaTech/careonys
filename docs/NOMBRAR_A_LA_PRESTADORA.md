# Dónde el producto dice «la Prestadora»

Este documento existe para que usted revise, uno por uno, **todos los textos del producto que
nombran a la empresa como «la Prestadora»**. Son 70 en castellano.

## Qué se está revisando

La palabra «Prestadora» es del glosario interno: describe el lugar que esa empresa ocupa adentro
del modelo del producto. Quien lee la pantalla no tiene por qué conocer ese modelo. La empresa
que licenció el producto se llama PresDemo, o Cuidados del Sur, o como se llame.

La pieza para decir el nombre real ya está construida y funcionando en las tres pantallas: se
escribe `{{prestadora}}` adentro de la frase y el producto lo reemplaza por el nombre con el que
esa empresa se presenta. De los 70 la usa uno solo, la ficha 112. Fuera de esta lista ya la usan
el botón «Llamar a {{prestadora}}» de la aplicación de los Asistentes
(`pwa-asistentes/src/i18n/translations.js:375`), la aceptación de términos de la medicación en la
de los Clientes (`pwa-clientes/src/i18n/translations.js:632`) y los dos `responsable_directa` del
Panel (`panel/src/i18n/translations.js:1185` y `:1949`).

## Las tres salidas posibles de cada texto

Cada uno de los 70 puede terminar en una de tres, y **la decisión es suya, texto por texto**:

1. **Poner el nombre** — la frase nombra a la empresa y corresponde que diga su nombre.
2. **No nombrar a nadie** — la frase se entiende sin nombrar a nadie, y el sujeto sobra.
3. **La frase no va** — el texto entero sobra.

Al pie de cada ficha hay un renglón **DECISIÓN:** en blanco.

## Qué NO hay en este documento

**No hay ninguna recomendación mía.** Ni la salida sugerida, ni una redacción propuesta, ni un
agrupamiento por lo que yo crea que conviene. Cada ficha dice qué texto es, dónde se ve, qué lo
hace aparecer y quién lo está leyendo. Nada más.

Donde encontré un defecto de funcionamiento —un texto que no se puede llegar a ver, por
ejemplo— lo digo como un hecho al pie de la ficha, marcado **OBSERVACIÓN**. No es una decisión
ni una propuesta.

## Cómo está ordenado

Por quién lee. Tres partes:

- **Parte I — La aplicación de los Asistentes** (9 textos). Los lee la persona que hace las
  guardias.
- **Parte II — La aplicación de los Clientes** (25 textos). Los lee el Cliente y sus personas
  autorizadas.
- **Parte III — El Panel** (36 textos). Los lee la propia empresa, por dentro.

---

# PARTE I — La aplicación de los Asistentes

Los lee la persona que va al domicilio a hacer la guardia. **Son 9.**

---

## 1. Videollamada no configurada

**Ruta:** `errores.motivos.videollamada_no_configurada`

**Texto de hoy:**
> Esta Prestadora todavía no configuró las videollamadas, así que por ahora la conversación
> sigue por escrito.

**Dónde se ve:** pantalla de Conversación — se entra desde Mensajes y se toca un hilo.

**Qué lo dispara:** la persona aprieta «Empezar videollamada» y el servidor contesta que no hay
videollamadas configuradas.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/lib/errores.js:167`, mostrado desde `pages/Conversacion.jsx:130`

**DECISIÓN:**

---

## 2. Función no activada

**Ruta:** `errores.motivos.no_disponible`

**Texto de hoy:**
> Esta función no está activada en esta Prestadora.

**Dónde se ve:** en cualquier pantalla. No tiene lugar fijo: es un cartel de error que sale
donde haya ocurrido.

**Qué lo dispara:** la persona intenta usar algo que la empresa tiene apagado.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/lib/errores.js:167`

**DECISIÓN:**

---

## 5. País sin configurar

**Ruta:** `errores.motivos.pais_sin_configurar`

**Texto de hoy:**
> Esta Prestadora todavía no configuró su país, así que por ahora no se puede cargar una cuenta.

**Dónde se ve:** en cualquier pantalla, como cartel de error.

**Qué lo dispara:** el servidor devuelve ese motivo.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/lib/errores.js:167`

**OBSERVACIÓN:** esta aplicación no tiene ninguna pantalla donde se cargue una cuenta bancaria.
El texto habla de algo que acá no se puede hacer.

**DECISIÓN:**

---

## 6. La lista de tareas de la guardia está vacía

**Ruta:** `guardia_activa.tareas_vacio`

**Texto de hoy:**
> La Prestadora todavía no cargó esta lista.

**Dónde se ve:** pantalla de la Guardia — se entra desde Guardias y se toca una guardia. En la
tarjeta del tipo de Asistente, en lugar de la lista de tareas.

**Qué lo dispara:** el tipo de Asistente está cargado, pero su lista de tareas vino vacía.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/pages/GuardiaActiva.jsx:735`

**DECISIÓN:**

---

## 8. El aviso de demora salió

**Ruta:** `antes_de_llegar.aviso_enviado`

**Texto de hoy:**
> El aviso salió hacia la Prestadora.

**Dónde se ve:** pantalla de la Guardia, bloque «Antes de llegar».

**Qué lo dispara:** la persona confirma «Voy demorado» y el aviso sale bien.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/components/AntesDeLlegar.jsx:105`

**DECISIÓN:**

---

## 10. La emergencia quedó avisada

**Ruta:** `emergencia.reportada`

**Texto de hoy:**
> Aviso enviado a las {hora}. La Prestadora ya lo tiene.

**Dónde se ve:** pantalla de la Guardia en curso, bloque de emergencia.

**Qué lo dispara:** el aviso ya salió. Reemplaza al formulario y confirma la hora.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/components/EmergenciaEnGuardia.jsx:91`

**DECISIÓN:**

---

## 11. Paso de la búsqueda de relevo: ya está avisada

**Ruta:** `extension.pasos.coordinacion_avisada`

**Texto de hoy:**
> La Prestadora ya está avisada.

**Dónde se ve:** pantalla de la Guardia en curso, bloque «El turno se extendió», dentro de la
lista de pasos de la búsqueda de reemplazo.

**Qué lo dispara:** el bloque aparece sólo si el turno terminó y el relevo no llegó. Qué pasos
se muestran lo decide el servidor.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/components/ExtensionDeTurno.jsx:42`

**DECISIÓN:**

---

## 12. Paso de la búsqueda de relevo: se amplió el aviso

**Ruta:** `extension.pasos.escalado`

**Texto de hoy:**
> El aviso se amplió a más responsables de la Prestadora.

**Dónde se ve:** pantalla de la Guardia en curso, mismo bloque de turno extendido, como otro
renglón de la lista de pasos.

**Qué lo dispara:** lo decide el servidor.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/components/ExtensionDeTurno.jsx:42`

**DECISIÓN:**

---

## 32. El Certificado quedó dado de baja

**Ruta:** `documentos.certificado_estado_dado_de_baja`

**Texto de hoy:**
> La Prestadora dio de baja este Certificado.

**Dónde se ve:** Documentos (`/documentos`), bloque «Certificado de Aptitud». Es el estado del
certificado.

**Qué lo dispara:** el certificado fue dado de baja.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/pages/Documentos.jsx:139`

**DECISIÓN:**

---

# PARTE II — La aplicación de los Clientes

Los lee el Cliente: el titular de la cuenta y las personas que él anotó como personas
autorizadas. **Son 25.**

---

## 34. Videollamada no configurada

**Ruta:** `errores.motivos.videollamada_no_configurada`

**Texto de hoy:**
> Esta Prestadora todavía no configuró las videollamadas, así que por ahora la conversación
> sigue por escrito.

**Dónde se ve:** Conversación de Match (`/mensajes/:id`).

**Qué lo dispara:** se toca el botón de videollamada y la empresa no tiene sala configurada.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/lib/errores.js:167`

**DECISIÓN:**

---

## 35. Función no activada

**Ruta:** `errores.motivos.no_disponible`

**Texto de hoy:**
> Esta función no está activada en esta Prestadora.

**Dónde se ve:** en cualquier pantalla apagada por la empresa —por ejemplo Facturas— cuando se
llega escribiendo la dirección.

**Qué lo dispara:** el servidor corta con ese motivo.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/lib/errores.js:167`

**DECISIÓN:**

---

## 36. Esto no está entre lo que le dieron

**Ruta:** `errores.motivos.sin_acceso`

**Texto de hoy:**
> El titular de la cuenta no incluyó esto en lo que usted puede ver. El cambio se lo pide él a
> la Prestadora.

**Dónde se ve:** en cualquier pantalla o acción que el titular no le haya dado a esa persona
autorizada —guardias, reportes, alertas, facturas, medicación—.

**Qué lo dispara:** el servidor rechaza el pedido por falta de acceso.

**Quién lo lee:** una persona autorizada, nunca el titular.

**Archivo:** `pwa-clientes/src/lib/errores.js:167`

**DECISIÓN:**

---

## 38. Acá no hay lista para elegir

**Ruta:** `errores.motivos.intermediacion_no_habilitado`

**Texto de hoy:**
> Esta Prestadora asigna ella misma a sus Asistentes, así que no hay una lista para elegir.

**Dónde se ve:** la vidriera (`/buscar`, `/buscar/:id`) o Mensajes (`/mensajes`).

**Qué lo dispara:** se llega escribiendo la dirección y la empresa no trabaja con Match.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/lib/errores.js:167`

**DECISIÓN:**

---

## 39. Para ver el contacto hace falta contratar

**Ruta:** `errores.motivos.sin_acceso_de_intermediacion`

**Texto de hoy:**
> Para ver los datos de contacto de esta persona, contrate el servicio con la Prestadora.

**Dónde se ve:** hoy en ninguna parte. Sería el perfil público del Asistente (`/buscar/:id`),
bloque de contacto, que es de Match, y Match está cerrado: el servidor nunca deja entrar a la
vidriera (`backend/src/utils/intermediacionDeLaPrestadora.js:50`).

**Qué lo dispara:** el dato de contacto está cerrado por ese motivo.

**Quién lo lee:** el Cliente, o la persona autorizada con permiso para lo relativo a dinero.

**Archivo:** `pwa-clientes/src/pages/PerfilPublicoAsistente.jsx:177`

**Propuesta de redacción:** dejar el texto actual.

**Por qué:** ya es una oración completa que dice qué hacer y para qué. Match está cerrado, no
retirado: el Desarrollador decide si la frase se saca hasta que Match se reabra.

**DECISIÓN:** queda para después de la mudanza: lo de Match se resuelve con la unificación con su
desarrollo independiente.

---

## 40. El servicio contratado no está vigente

**Ruta:** `errores.motivos.acceso_no_vigente`

**Texto de hoy:**
> El servicio contratado venció. Renuévelo con la Prestadora para ver estos datos.

**Dónde se ve:** hoy en ninguna parte. Sería el perfil público del Asistente (`/buscar/:id`),
bloque de contacto, que es de Match, y Match está cerrado: el servidor nunca deja entrar a la
vidriera (`backend/src/utils/intermediacionDeLaPrestadora.js:50`).

**Qué lo dispara:** el acceso venció.

**Quién lo lee:** el Cliente, o la persona autorizada con permiso para lo relativo a dinero.

**Archivo:** `pwa-clientes/src/pages/PerfilPublicoAsistente.jsx:177`

**Propuesta de redacción:** «El servicio contratado venció. Para volver a ver estos datos,
renuévelo con la Prestadora.»

**Por qué:** igual que la ficha 39; sólo pone primero para qué.

**DECISIÓN:** queda para después de la mudanza: lo de Match se resuelve con la unificación con su
desarrollo independiente.

---

## 41. Se acabaron los contactos incluidos

**Ruta:** `errores.motivos.saldo_agotado`

**Texto de hoy:**
> Usó todos los contactos incluidos. Solicite otro paquete a la Prestadora para ver más.

**Dónde se ve:** hoy en ninguna parte. Sería el perfil público del Asistente (`/buscar/:id`),
bloque de contacto, que es de Match, y Match está cerrado: el servidor nunca deja entrar a la
vidriera (`backend/src/utils/intermediacionDeLaPrestadora.js:50`).

**Qué lo dispara:** se agotó el paquete de contactos.

**Quién lo lee:** el Cliente, o la persona autorizada con permiso para lo relativo a dinero.

**Archivo:** `pwa-clientes/src/pages/PerfilPublicoAsistente.jsx:177`

**Propuesta de redacción:** «Ya no quedan contactos incluidos en su servicio. Para ver más,
solicite otro paquete a la Prestadora.»

**Por qué:** igual que la ficha 39. «Usó todos» pone a la persona como causa; la propuesta dice
el hecho.

**DECISIÓN:** queda para después de la mudanza: lo de Match se resuelve con la unificación con su
desarrollo independiente.

---

## 42. Quién canceló la guardia

**Ruta:** `guardias.cancelo_prestadora`

**Texto de hoy:**
> Cancelada por la Prestadora

**Dónde se ve:** Guardias de un Paciente (`/pacientes/:id/guardias`), etiqueta de la tarjeta de
cada guardia.

**Qué lo dispara:** esa guardia fue cancelada y el origen de la cancelación es la empresa.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/pages/Guardias.jsx:110` — la clave se arma sola como
`cancelo_${g.cancelacion_origen}`

**DECISIÓN:**

---

## 43. Título del bloque de contacto, sin nombre

**Ruta:** `contacto.titulo`

**Texto de hoy:**
> Hablar con la Prestadora

**Dónde se ve:** Alertas de un Paciente (`/pacientes/:id/alertas`), encabezado del bloque de
contacto, al pie.

**Qué lo dispara:** no se conoce el nombre de fantasía de la empresa.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/components/ContactarALaPrestadora.jsx:37`

**DECISIÓN:**

---

## 44. Título del bloque de contacto, con nombre

**Ruta:** `contacto.titulo_con_nombre`

**Texto de hoy:**
> Hablar con {prestadora}

**Dónde se ve:** el mismo bloque al pie de Alertas.

**Qué lo dispara:** sí se conoce el nombre de fantasía de la empresa.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/components/ContactarALaPrestadora.jsx:36`

**OBSERVACIÓN:** este texto ya pone el nombre real, pero por un parámetro propio de la pantalla,
no por el marcador `{{prestadora}}`.

**DECISIÓN:**

---

## 45. La lista de tareas del Asistente está vacía

**Ruta:** `asistente.tareas_vacio`

**Texto de hoy:**
> La Prestadora todavía no cargó esta lista.

**Dónde se ve:** Asistente asignado (`/pacientes/:id/asistente`), en la tarjeta de las tareas, en
lugar de la lista.

**Qué lo dispara:** esa lista viene vacía.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/pages/AsistenteAsignado.jsx:100`

**DECISIÓN:**

---

## 46. No se exigen documentos

**Ruta:** `asistente.documentacion_sin_exigencias`

**Texto de hoy:**
> Esta Prestadora no registró exigencias documentales para su personal.

**Dónde se ve:** bloque «Documentación» del Asistente, que aparece en dos lados: Asistente
asignado (`/pacientes/:id/asistente`) y el perfil público de la vidriera (`/buscar/:id`).

**Qué lo dispara:** el resumen documental es «sin exigencias».

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/components/EstadoDocumental.jsx:22`

**DECISIÓN:**

---

## 47. Los documentos están al día

**Ruta:** `asistente.documentacion_al_dia`

**Texto de hoy:**
> Los documentos que esta Prestadora exige están al día.

**Dónde se ve:** el mismo bloque «Documentación», en las dos pantallas.

**Qué lo dispara:** los documentos están completos.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/components/EstadoDocumental.jsx:22`

**DECISIÓN:**

---

## 48. Falta algún documento

**Ruta:** `asistente.documentacion_incompleta`

**Texto de hoy:**
> Falta cargar alguno de los documentos que esta Prestadora exige.

**Dónde se ve:** el mismo bloque «Documentación», en las dos pantallas.

**Qué lo dispara:** falta algún documento.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/components/EstadoDocumental.jsx:22`

**DECISIÓN:**

---

## 49. Algún documento está vencido

**Ruta:** `asistente.documentacion_vencida`

**Texto de hoy:**
> Alguno de los documentos que esta Prestadora exige está vencido.

**Dónde se ve:** el mismo bloque «Documentación», en las dos pantallas.

**Qué lo dispara:** algún documento está vencido.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/components/EstadoDocumental.jsx:22`

**DECISIÓN:**

---

## 52. Qué no dice el estado documental

**Ruta:** `asistente.documentacion_que_no_se_verifica`

**Texto de hoy:**
> Qué no dice esto: no se verifica la identidad de la persona, no se consultan antecedentes
> penales y no se comprueba que los documentos presentados sean auténticos. Quien controla los
> documentos de su personal es la Prestadora.

**Dónde se ve:** última línea del bloque «Documentación», en las dos pantallas.

**Qué lo dispara:** está siempre que ese bloque se dibuje.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/components/EstadoDocumental.jsx:30`

**DECISIÓN:**

---

## 53. Calificar no está entre lo que le dieron

**Ruta:** `asistente.calificar_sin_acceso`

**Texto de hoy:**
> Calificar al Asistente no está entre lo que el titular de la cuenta le dio a usted. El cambio
> se lo pide él a la Prestadora.

**Dónde se ve:** Asistente asignado (`/pacientes/:id/asistente`), sección de evaluaciones, en
lugar del formulario de estrellas.

**Qué lo dispara:** se llega desde una guardia concreta y esa persona no tiene permiso para
calificar.

**Quién lo lee:** una persona autorizada.

**Archivo:** `pwa-clientes/src/pages/AsistenteAsignado.jsx:128`

**DECISIÓN:**

---

## 55. Antigüedad del Asistente

**Ruta:** `vidriera.antiguedad`

**Texto de hoy:**
> Hace {meses} meses en esta Prestadora.

**Dónde se ve:** en la tarjeta de cada Asistente de la vidriera (`/buscar`) y en el perfil
público de un Asistente (`/buscar/:id`).

**Qué lo dispara:** se conoce la antigüedad.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/pages/BuscarAsistentes.jsx:114` y
`pwa-clientes/src/pages/PerfilPublicoAsistente.jsx:129`

**DECISIÓN:**

---

## 56. La forma de cobro se renueva sola

**Ruta:** `vidriera.contacto_confirmar_renueva`

**Texto de hoy:**
> Esa forma se renueva sola hasta que se le pida la baja a la Prestadora.

**Dónde se ve:** perfil público de un Asistente (`/buscar/:id`), en el cartel de confirmación
que sale al tocar «ver el contacto».

**Qué lo dispara:** la forma de acceso se renueva sola.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/pages/PerfilPublicoAsistente.jsx:199`

**DECISIÓN:**

---

## 60. No hay contenidos publicados

**Ruta:** `contenidos.sin_contenidos`

**Texto de hoy:**
> Esta Prestadora todavía no publicó nada acá.

**Dónde se ve:** Contenidos (`/contenidos`).

**Qué lo dispara:** la empresa no publicó ningún material.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/pages/Contenidos.jsx:43`

**DECISIÓN:**

---

## 61. Esto no es un comprobante fiscal

**Ruta:** `facturas.no_es_comprobante`

**Texto de hoy:**
> Esta pantalla muestra lo que la Prestadora facturó y lo que registró como cobrado. No es un
> comprobante fiscal.

**Dónde se ve:** detalle de una factura (`/facturas/:facturaId`), al pie. Se llega desde la
lista de Facturas, a la que se entra desde Mi Perfil.

**Qué lo dispara:** está siempre en esa pantalla.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/pages/FacturaDetalle.jsx:163`

**DECISIÓN:**

---

## 62. Usted es el titular

**Ruta:** `perfil.acceso_titular`

**Texto de hoy:**
> Usted es el titular de la cuenta: ve todo lo que la Prestadora ofrece, y es quien decide qué
> ve cada persona autorizada.

**Dónde se ve:** Mi Perfil (`/perfil`), sección «Qué ve usted».

**Qué lo dispara:** quien mira es el titular. Es el único párrafo que se le muestra, en lugar de
las dos listas.

**Quién lo lee:** el titular de la cuenta.

**Archivo:** `pwa-clientes/src/pages/MiPerfil.jsx:217`

**DECISIÓN:**

---

## 63. No hay nada afuera

**Ruta:** `perfil.acceso_no_ve_vacio`

**Texto de hoy:**
> No hay nada afuera: usted ve todo lo que la Prestadora ofrece.

**Dónde se ve:** Mi Perfil (`/perfil`), sección «Qué ve usted», como texto de la lista vacía «Lo
que usted no ve».

**Qué lo dispara:** quien mira no es el titular, y el titular le dio acceso a todo.

**Quién lo lee:** una persona autorizada.

**Archivo:** `pwa-clientes/src/pages/MiPerfil.jsx:230`

**DECISIÓN:**

---

## 65. La solicitud de medicación salió

**Ruta:** `medicacion.enviada_exito`

**Texto de hoy:**
> La solicitud fue enviada. La Prestadora la va a revisar antes de que se active.

**Dónde se ve:** Medicación de un Paciente (`/pacientes/:id/medicacion`), bloque «Solicitar
nueva indicación», arriba del botón Enviar.

**Qué lo dispara:** se mandó el formulario con éxito.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/pages/Medicacion.jsx:382`

**DECISIÓN:**

---

## 66. Pedir un cambio no está entre lo que le dieron

**Ruta:** `medicacion.sin_acceso_pedir`

**Texto de hoy:**
> Pedir un cambio de medicación no está entre lo que el titular de la cuenta le dio a usted. El
> cambio se lo pide él a la Prestadora.

**Dónde se ve:** Medicación (`/pacientes/:id/medicacion`), en el lugar donde iría el formulario
«Solicitar nueva indicación».

**Qué lo dispara:** esa persona puede ver la medicación pero no pedir cambios.

**Quién lo lee:** una persona autorizada.

**Archivo:** `pwa-clientes/src/pages/Medicacion.jsx:294`

**DECISIÓN:**

---

# PARTE III — El Panel

Los lee, casi siempre, la propia empresa: su Administrador o su Coordinador. **Son 36.**

Hay dos excepciones que conviene tener a la vista al recorrerlos, y son un hecho del código, no
una opinión:

- **Las dos de la entrevista pública** (fichas 112 y 114) las lee un postulante, que está
  afuera de la empresa.
- **Un grupo las lee también el soporte técnico de CeltaTech**: son las de datos de acceso
  (ficha 100) y las de Auditoría (fichas 159 a 163). Van señaladas en su ficha.

---

## 69. No hay etapas de incorporación

**Ruta:** `errores.motivos.sin_etapas_incorporacion`

**Texto de hoy:**
> Esta Prestadora todavía no tiene etapas de incorporación configuradas. Se definen en
> Configuración > Reclutamiento.

**Dónde se ve:** al confirmar la incorporación o el avance de un Asistente por el circuito de
incorporación.

**Qué lo dispara:** no hay ninguna etapa activa configurada.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/lib/errores.js:167`

**DECISIÓN:**

---

## 73. Esa modalidad no está activa

**Ruta:** `errores.motivos.modalidad_no_activa`

**Texto de hoy:**
> Esta modalidad no está activa.

**Dónde se ve:** en el lugar del contenido de una pantalla de Match —Clientes (Match), Formas de
cobro, Calificaciones, Auditoría legal—.

**Qué lo dispara:** se entra sin tener esa modalidad contratada.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/lib/errores.js:167`

**DECISIÓN:** aprobado así.

---

## 74. No hay pasarela conectada

**Ruta:** `errores.motivos.sin_pasarela_conectada`

**Texto de hoy:**
> Esta Prestadora no tiene ninguna pasarela de cobro conectada. Se conecta en Configuración ›
> Prestadora › Pasarela de pago.

**Dónde se ve:** Clientes > Clientes (Match), al confirmar el alta de un acceso cobrable.

**Qué lo dispara:** no hay ninguna pasarela conectada.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/lib/errores.js:167`

**DECISIÓN:**

---

## 76. Esa pasarela no está conectada

**Ruta:** `errores.motivos.pasarela_no_conectada`

**Texto de hoy:**
> Esa pasarela de cobro no está conectada en esta Prestadora. Se conecta en Configuración ›
> Prestadora › Pasarela de pago.

**Dónde se ve:** Clientes > Clientes (Match), al confirmar el alta de un acceso.

**Qué lo dispara:** se pidió cobrar por una pasarela puntual que no está conectada.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/lib/errores.js:167`

**DECISIÓN:**

---

## 77. No hay cuenta de WhatsApp Business

**Ruta:** `errores.motivos.whatsapp_sin_cuenta`

**Texto de hoy:**
> Esta Prestadora no tiene cuenta de WhatsApp Business. Se carga en Configuración > Mensajes.

**Dónde se ve:** Gestión > Configuración > Configuración > Mensajes, bloque de plantillas.

**Qué lo dispara:** se intenta dar de alta una plantilla o consultar su estado sin cuenta ni
token cargados.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/lib/errores.js:167`

**DECISIÓN:**

---

## 80. El nombre de la primera sección de Configuración

**Ruta:** `configuracion.seccion_prestadora`

**Texto de hoy:**
> Prestadora

**Dónde se ve:** Gestión > Configuración > Configuración, en la lista de secciones. Es la
primera.

**Qué lo dispara:** está siempre que un Admin abra Configuración.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/Configuracion.jsx:34`

**OBSERVACIÓN:** este texto es el nombre de una sección de la pantalla. Ningún otro texto del
Panel la nombra: los que mandan a Configuración dicen «Configuración» a secas o nombran otra
parte de ella.

**DECISIÓN:**

---

## 82. Origen de una opción: propia

**Ruta:** `configuracion.listas_origen_propia`

**Texto de hoy:**
> De la Prestadora

**Dónde se ve:** Gestión > Configuración > Configuración > Listas de opciones, columna de origen de la tabla.

**Qué lo dispara:** esa opción la agregó la empresa, no el producto.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/configuracion/LasListasDeOpciones.jsx:247`

**DECISIÓN:**

---

## 88. Hoy rige el modelo

**Ruta:** `configuracion.consentimiento_pagador_es_modelo`

**Texto de hoy:**
> Hoy rige el modelo que trae {{producto}}. Es una sugerencia y nada más: no es asesoramiento
> legal, y adoptarlo, cambiarlo o reemplazarlo es decisión de esta Prestadora.

**Dónde se ve:** Gestión > Configuración > Configuración > Prestadora, cartel de estado del consentimiento.

**Qué lo dispara:** la empresa todavía no cargó texto propio.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/configuracion/ConsentimientoPagadorTab.jsx:95`

**DECISIÓN:**

---

## 89. Hoy rige el texto propio

**Ruta:** `configuracion.consentimiento_pagador_es_propio`

**Texto de hoy:**
> Hoy rige el texto que cargó esta Prestadora.

**Dónde se ve:** Gestión > Configuración > Configuración > Prestadora, el mismo cartel de estado.

**Qué lo dispara:** ya hay texto propio cargado.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/configuracion/ConsentimientoPagadorTab.jsx:96`

**DECISIÓN:**

---

## 94. No hay ningún lugar cargado

**Ruta:** `configuracion.lugares_sin_lista`

**Texto de hoy:**
> La Prestadora todavía no cargó ningún lugar. Se cargan en Configuración.

**Dónde se ve:** en todo casillero que elige lugares: alta y solapa Perfil de un Asistente
(Asistentes > Padrón de Asistentes), asignación de zonas en Gestión > Configuración > Usuarios del Panel, y el
propio bloque de lugares de Configuración.

**Qué lo dispara:** no hay ningún lugar cargado.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/components/lugares/ElegirLugares.jsx:30` y
`panel/src/components/lugares/SelectorDeLugares.jsx:59`

**DECISIÓN:**

---

## 98. Título del bloque de correo

**Ruta:** `configuracion.correo_titulo`

**Texto de hoy:**
> El correo de esta prestadora

**Dónde se ve:** Gestión > Configuración > Configuración > Mensajes. Es el título del bloque.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/configuracion/Avisos.jsx:513`

**DECISIÓN:**

---

## 100. Los datos de acceso de WhatsApp sólo los ve el Admin

**Ruta:** `configuracion.whatsapp_credenciales_solo_admin`

**Texto de hoy:**
> Estos datos de acceso son de la prestadora y solo los ve y los cambia su administrador. El
> soporte técnico no accede a las claves con las que la prestadora habla con Meta, ni siquiera
> durante una sesión de soporte.

**Dónde se ve:** Gestión > Configuración > Configuración > Mensajes, bloque de WhatsApp.

**Qué lo dispara:** quien mira no es el Administrador de la empresa, o hay sesión de soporte
abierta.

**Quién lo lee:** alguien de la empresa que no es su Administrador, o el soporte de CeltaTech.

**Archivo:** `panel/src/pages/configuracion/Avisos.jsx:801`

**DECISIÓN:**

---

## 101. La llave que enciende WhatsApp

**Ruta:** `configuracion.whatsapp_activo`

**Texto de hoy:**
> WhatsApp activo para esta prestadora

**Dónde se ve:** Gestión > Configuración > Configuración > Mensajes, bloque de WhatsApp. Es la etiqueta de la
llave que lo enciende o lo apaga.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/configuracion/Avisos.jsx:970`

**DECISIÓN:**

---

## 108. El paso de completar los datos

**Ruta:** `guia_primeros_pasos.paso_datos_titulo`

**Texto de hoy:**
> Completar los datos de la Prestadora

**Dónde se ve:** guía de primeros pasos — en la puesta en marcha, en el Estado actual y en la
franja de arriba.

**Qué lo dispara:** ese paso sigue sin hacerse.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/components/estado-actual/GuiaPrimerosPasos.jsx:84`

**DECISIÓN:**

---

## 109. Qué pasa si faltan los datos

**Ruta:** `guia_primeros_pasos.paso_datos_consecuencia`

**Texto de hoy:**
> Mientras falten, los mensajes de la Prestadora salen sin un contacto al que responder.

**Dónde se ve:** guía de primeros pasos, línea de advertencia debajo de ese paso.

**Qué lo dispara:** ese paso está pendiente.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/components/estado-actual/GuiaPrimerosPasos.jsx:89`

**DECISIÓN:**

---

## 110. Qué pasa si faltan las zonas

**Ruta:** `guia_primeros_pasos.paso_zonas_consecuencia`

**Texto de hoy:**
> Sin zonas cargadas, el formulario público de la Prestadora no tiene ninguna para ofrecer y
> nadie puede pedir el servicio desde ahí.

**Dónde se ve:** guía de primeros pasos, línea de advertencia del paso de zonas.

**Qué lo dispara:** no hay zonas cargadas.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/components/estado-actual/GuiaPrimerosPasos.jsx:89`

**DECISIÓN:**

---

## 112. Título de la entrevista pública

**Ruta:** `entrevistaPublica.con`

**Texto de hoy:**
> Entrevista con {{prestadora}}

**Dónde se ve:** pantalla pública de entrevista, fuera del Panel y del menú. La abre el
postulante con la llave que le llegó por correo. Es el título de la página.

**Qué lo dispara:** está siempre en esa pantalla.

**Quién lo lee:** el postulante. Está afuera de la empresa.

**Archivo:** `panel/src/pages/EntrevistaPublica.jsx:98`

**OBSERVACIÓN:** es el único texto de los 70 que ya usa el marcador `{{prestadora}}`.

**DECISIÓN:**

---

## 114. La entrevista no tiene sala

**Ruta:** `entrevistaPublica.sin_sala_texto`

**Texto de hoy:**
> La Prestadora se va a comunicar por el medio que le indicó en el correo.

**Dónde se ve:** pantalla pública de entrevista.

**Qué lo dispara:** la entrevista está agendada pero sin sala de videollamada.

**Quién lo lee:** el postulante. Está afuera de la empresa.

**Archivo:** `panel/src/pages/EntrevistaPublica.jsx:110`

**DECISIÓN:**

---

## 116. Esa modalidad no está habilitada

**Ruta:** `modalidades.error_no_habilitada`

**Texto de hoy:**
> La Prestadora no tiene habilitada la modalidad {modalidad}. Se habilita en Configuración.

**Dónde se ve:** cartel de error al guardar, en el alta de un Asistente y en la solapa Perfil del
Legajo del Asistente (Asistentes > Padrón de Asistentes).

**Qué lo dispara:** se marcó una modalidad que la empresa no tiene contratada.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/lib/modalidades.js:144`

**DECISIÓN:**

---

## 124. Se alcanzó el mínimo de referencias

**Ruta:** `asistentes.verificacion.referencias.alcanza`

**Texto de hoy:**
> Se alcanzó el mínimo de referencias verificadas de esta Prestadora.

**Dónde se ve:** Asistentes > Padrón de Asistentes > Legajo del Asistente > solapa Verificación,
bloque de referencias laborales.

**Qué lo dispara:** ya se llegó al mínimo exigido.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/asistentes/ReferenciasLaborales.jsx:106`

**DECISIÓN:**

---

## 125. Faltan referencias

**Ruta:** `asistentes.verificacion.referencias.faltan`

**Texto de hoy:**
> Faltan {{faltan}} referencias verificadas de las {{exigidas}} que espera esta Prestadora. No
> impide incorporar a la persona: la decisión es de la Prestadora.

**Dónde se ve:** la misma solapa Verificación, bloque de referencias laborales.

**Qué lo dispara:** todavía no se llegó al mínimo.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/asistentes/ReferenciasLaborales.jsx:109`

**DECISIÓN:**

---

## 131. No hay catálogo de documentación

**Ruta:** `clientes.pagador.papeles_sin_catalogo`

**Texto de hoy:**
> Esta Prestadora todavía no cargó qué documentación pide. Se configura en Configuración.

**Dónde se ve:** Clientes > Directorio de Clientes > un Cliente > pestaña Contacto, tarjeta
«Documentación que pide el Pagador», donde iría la tabla de documentos. El detalle de esa
pantalla está en la ficha 6 de `docs/CARTELES_DEL_PANEL.md`.

**Qué lo dispara:** el catálogo de documentación está vacío.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/clientes/EstadoDelPagador.jsx:217`

**DECISIÓN:**

---

## 133. El autor de un mensaje saliente

**Ruta:** `comunicacion.autor_prestadora`

**Texto de hoy:**
> Prestadora

**Dónde se ve:** Gestión > Comunicación > Comunicación, hilo de WhatsApp. Es la etiqueta
de autor de cada mensaje saliente.

**Qué lo dispara:** está siempre en los mensajes salientes.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/components/comunicacion/HiloWhatsapp.jsx:139`

**DECISIÓN:**

---

## 134. WhatsApp no está configurado

**Ruta:** `comunicacion.whatsapp_no_configurado`

**Texto de hoy:**
> Esta Prestadora todavía no tiene WhatsApp configurado. Se configura en Configuración ›
> Mensajes › Conexión de WhatsApp.

**Dónde se ve:** Gestión > Comunicación > Comunicación, hilo de WhatsApp.

**Qué lo dispara:** se intenta mandar un mensaje sin WhatsApp configurado.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/components/comunicacion/HiloWhatsapp.jsx:95`

**DECISIÓN:**

---

## 135. Origen de una respuesta preparada

**Ruta:** `respuestas_preparadas.origen_prestadora`

**Texto de hoy:**
> Cargada por la Prestadora

**Dónde se ve:** Gestión > Comunicación > Respuestas preparadas, columna de origen de la tabla.

**Qué lo dispara:** esa respuesta la escribió la empresa, no la sugirió la IA.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/RespuestasPreparadas.jsx:288`

**DECISIÓN:**

---

## 136. Quién canceló: la empresa

**Ruta:** `guardias.detalle.cancelacion_origen_prestadora`

**Texto de hoy:**
> Prestadora

**Dónde se ve:** Guardias > Guardias. Es una opción del desplegable «quién cancela», tanto al
cancelar una guardia desde su detalle como al cancelar varias con la barra de acciones masivas.

**Qué lo dispara:** está siempre en ese desplegable.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/guardias/GuardiaAcciones.jsx:476` y
`panel/src/pages/guardias/BarraAccionesMasivas.jsx:320`

**DECISIÓN:**

---

## 144. De dónde sale el valor de un concepto

**Ruta:** `pagos_asistentes.origen_propio`

**Texto de hoy:**
> Valor propio de la Prestadora

**Dónde se ve:** Asistentes > Pagos a Asistentes, catálogo de conceptos de liquidación. Es una
opción del desplegable «de dónde sale el valor»; la otra es la escala legal.

**Qué lo dispara:** está siempre en ese desplegable.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/PagosAsistentes.jsx:828` — la clave se arma sola como
`origen_${origen}`

**DECISIÓN:**

---

## 159. El encabezado de la columna

**Ruta:** `auditoria.col_prestadora`

**Texto de hoy:**
> Prestadora

**Dónde se ve:** Gestión > Informes > Auditoría, encabezado de esa columna en la tabla de eventos.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa, y el soporte de CeltaTech.

**Archivo:** `panel/src/pages/Auditoria.jsx:106`

**DECISIÓN:**

---

## 160. Evento: entró

**Ruta:** `auditoria.evento_login`

**Texto de hoy:**
> Entró a la prestadora

**Dónde se ve:** Gestión > Informes > Auditoría, en la fila del evento.

**Qué lo dispara:** lo registrado es la apertura de una sesión de soporte.

**Quién lo lee:** la empresa, y el soporte de CeltaTech.

**Archivo:** `panel/src/pages/Auditoria.jsx:67`

**DECISIÓN:**

---

## 161. Evento: salió

**Ruta:** `auditoria.evento_logout_manual`

**Texto de hoy:**
> Salió de la prestadora

**Dónde se ve:** Gestión > Informes > Auditoría, en la fila del evento.

**Qué lo dispara:** la sesión se cerró a mano, no por tope ni por inactividad.

**Quién lo lee:** la empresa, y el soporte de CeltaTech.

**Archivo:** `panel/src/pages/Auditoria.jsx:73`

**DECISIÓN:**

---

## 162. Evento: cambió los permisos

**Ruta:** `auditoria.accion_cambio_de_permisos_de_la_prestadora`

**Texto de hoy:**
> Cambió los permisos de la Prestadora

**Dónde se ve:** Gestión > Informes > Auditoría, nombre de la acción en la fila.

**Qué lo dispara:** lo auditado es un cambio en Configuración > Accesos.

**Quién lo lee:** la empresa, y el soporte de CeltaTech.

**Archivo:** `panel/src/lib/registroDeActividad.js:8` — la clave se arma sola como
`accion_${fila.accion}`

**DECISIÓN:**

---

## 163. Evento: cambió la moneda

**Ruta:** `auditoria.accion_cambio_de_moneda`

**Texto de hoy:**
> Cambió la moneda de la Prestadora

**Dónde se ve:** Gestión > Informes > Auditoría, nombre de la acción en la fila.

**Qué lo dispara:** lo auditado es un cambio de moneda hecho en Configuración > Prestadora.

**Quién lo lee:** la empresa, y el soporte de CeltaTech.

**Archivo:** `panel/src/lib/registroDeActividad.js:8` — la clave se arma sola como
`accion_${fila.accion}`

**DECISIÓN:**
