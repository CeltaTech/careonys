# Dónde el producto dice «la Prestadora»

Este documento existe para que usted revise, uno por uno, **todos los textos del producto que
nombran a la empresa como «la Prestadora»**. Son 168 en castellano.

## Qué se está revisando

La palabra «Prestadora» es del glosario interno: describe el lugar que esa empresa ocupa adentro
del modelo del producto. Quien lee la pantalla no tiene por qué conocer ese modelo. La empresa
que licenció el producto se llama PresDemo, o Cuidados del Sur, o como se llame.

La pieza para decir el nombre real ya está construida y funcionando en las tres pantallas: se
escribe `{{prestadora}}` adentro de la frase y el producto lo reemplaza por el nombre con el que
esa empresa se presenta. Hoy no la usa ninguno de los 168.

## Las tres salidas posibles de cada texto

Cada uno de los 168 puede terminar en una de tres, y **la decisión es suya, texto por texto**:

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

- **Parte I — La aplicación de los Asistentes** (33 textos). Los lee la persona que hace las
  guardias.
- **Parte II — La aplicación de los Clientes** (34 textos). Los lee el Cliente y su personas autorizadas.
- **Parte III — El Panel** (101 textos). Los lee la propia empresa, por dentro.

---

# PARTE I — La aplicación de los Asistentes

Los lee la persona que va al domicilio a hacer la guardia. **Son 33.**

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

**Archivo:** `pwa-asistentes/src/lib/errores.js:156`, mostrado desde `pages/Conversacion.jsx:130`

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

**Archivo:** `pwa-asistentes/src/lib/errores.js:156`

**DECISIÓN:**

---

## 3. Matrícula sin comprobar, al aceptar una oferta

**Ruta:** `errores.motivos.matricula_sin_verificar`

**Texto de hoy:**
> La matrícula está cargada, pero la Prestadora todavía no la comprobó. Hasta entonces no se
> pueden tomar guardias.

**Dónde se ve:** Ofertas de guardia.

**Qué lo dispara:** la persona acepta una oferta y el servidor la rechaza porque su matrícula
está cargada pero nadie la comprobó.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/lib/errores.js:156`, mostrado desde `pages/OfertasDeGuardia.jsx:175`

**DECISIÓN:**

---

## 4. Modalidad no habilitada en el perfil

**Ruta:** `errores.motivos.modalidad_no_habilitada`

**Texto de hoy:**
> Esta guardia es de una modalidad de trabajo que no está habilitada en este perfil. Hace falta
> hablarlo con la Prestadora.

**Dónde se ve:** Ofertas de guardia.

**Qué lo dispara:** la persona responde una oferta cuya modalidad de trabajo su perfil no tiene
habilitada.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/lib/errores.js:156`, mostrado desde `pages/OfertasDeGuardia.jsx:175`

**DECISIÓN:**

---

## 5. País sin configurar

**Ruta:** `errores.motivos.pais_sin_configurar`

**Texto de hoy:**
> Esta Prestadora todavía no configuró su país, así que por ahora no se puede cargar una cuenta.

**Dónde se ve:** en cualquier pantalla, como cartel de error.

**Qué lo dispara:** el servidor devuelve ese motivo.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/lib/errores.js:156`

**OBSERVACIÓN:** esta aplicación no tiene ninguna pantalla donde se cargue una cuenta bancaria.
El texto habla de algo que acá no se puede hacer.

**DECISIÓN:**

---

## 6. La lista de tareas de la guardia está vacía

**Ruta:** `guardia_activa.tareas_vacio`

**Texto de hoy:**
> La Prestadora todavía no cargó esta lista.

**Dónde se ve:** pantalla de la Guardia — se entra desde Mis guardias y se toca una guardia. Al
pie, en el bloque «Qué me corresponde / qué no me corresponde».

**Qué lo dispara:** el tipo de Asistente está cargado, pero su lista de tareas vino vacía.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/pages/GuardiaActiva.jsx:702` y `:707`

**DECISIÓN:**

---

## 7. Para qué sirve avisar antes de llegar

**Ruta:** `antes_de_llegar.explicacion`

**Texto de hoy:**
> Avisar que se sale, y avisar si se va demorado, le da a la Prestadora tiempo para cubrir la
> guardia. Los dos avisos quedan registrados como avisos dados por esta persona.

**Dónde se ve:** pantalla de la Guardia, bloque «Antes de llegar», debajo del título.

**Qué lo dispara:** se dibuja mientras la llegada todavía no está marcada y no se está haciendo
el pase de guardia.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/components/AntesDeLlegar.jsx:131`

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

## 9. Qué es el botón de emergencia

**Ruta:** `emergencia.explicacion`

**Texto de hoy:**
> Esto le llega a la Prestadora en el momento. Si hace falta atención médica o de seguridad,
> llame primero al número que corresponda: este aviso no reemplaza esa llamada.

**Dónde se ve:** pantalla de la Guardia en curso —después de marcar la llegada—, al final del
bloque de la guardia, en el botón de emergencia.

**Qué lo dispara:** la persona abre el botón de emergencia, antes de confirmar.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/components/EmergenciaEnGuardia.jsx:97`

**DECISIÓN:**

---

## 10. La emergencia quedó avisada

**Ruta:** `emergencia.reportada`

**Texto de hoy:**
> Aviso enviado a las {hora}. La Prestadora ya lo tiene.

**Dónde se ve:** pantalla de la Guardia en curso, bloque de emergencia.

**Qué lo dispara:** el aviso ya salió. Reemplaza al formulario y confirma la hora.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/components/EmergenciaEnGuardia.jsx:83`

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

**Archivo:** `pwa-asistentes/src/components/ExtensionDeTurno.jsx:92`

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

**Archivo:** `pwa-asistentes/src/components/ExtensionDeTurno.jsx:92`

**DECISIÓN:**

---

## 13. Qué es «no puedo continuar»

**Ruta:** `extension.explicacion`

**Texto de hoy:**
> Esto le llega a la Prestadora con la máxima urgencia. No la libera del turno: sirve para que
> sepan que necesita que la releven ya.

**Dónde se ve:** pantalla de la Guardia en curso, bloque de turno extendido.

**Qué lo dispara:** la persona aprieta «No puedo continuar». Es lo que lee antes de confirmar.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/components/ExtensionDeTurno.jsx:114`

**DECISIÓN:**

---

## 14. El «no puedo continuar» quedó avisado

**Ruta:** `extension.avisado`

**Texto de hoy:**
> Aviso enviado a las {hora}. La Prestadora ya lo tiene.

**Dónde se ve:** pantalla de la Guardia en curso, bloque de turno extendido.

**Qué lo dispara:** el aviso ya salió. Confirma la hora.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/components/ExtensionDeTurno.jsx:101`

**DECISIÓN:**

---

## 15. Qué pasa cuando se pide un código

**Ruta:** `pase_de_guardia.pedido_explicacion`

**Texto de hoy:**
> Esto le aparece enseguida a la Prestadora. Quien esté de turno lo va a resolver y le va a
> dictar un código que sirve unos minutos.

**Dónde se ve:** Pase de guardia —al marcar la llegada o al cerrar la guardia—, en el paso «no
hay nadie que me muestre el código». Arriba del formulario donde se cuenta qué pasó.

**Qué lo dispara:** la persona llegó al domicilio y no tiene a quién pedirle el código.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/components/PaseDeGuardia.jsx:260`

**DECISIÓN:**

---

## 16. El botón que manda el pedido

**Ruta:** `pase_de_guardia.avisar_a_la_prestadora`

**Texto de hoy:**
> Avisar a la Prestadora

**Dónde se ve:** Pase de guardia, mismo paso del pedido. Es el texto del botón.

**Qué lo dispara:** está siempre en ese paso.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/components/PaseDeGuardia.jsx:273`

**DECISIÓN:**

---

## 17. Esperando la respuesta

**Ruta:** `pase_de_guardia.esperando`

**Texto de hoy:**
> Esperando que la Prestadora conteste…

**Dónde se ve:** Pase de guardia, paso de espera.

**Qué lo dispara:** el pedido ya salió y todavía no soltaron el código.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/components/PaseDeGuardia.jsx:291`

**DECISIÓN:**

---

## 18. Soltaron el código

**Ruta:** `pase_de_guardia.codigo_soltado`

**Texto de hoy:**
> La Prestadora soltó un código. Escríbalo acá abajo.

**Dónde se ve:** Pase de guardia, paso de espera. Aparece el cartel y abajo el campo para
escribir el código.

**Qué lo dispara:** del otro lado contestaron.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/components/PaseDeGuardia.jsx:286`

**DECISIÓN:**

---

## 19. Motivo: no contesta nadie

**Ruta:** `pase_de_guardia.motivo_prestadora_no_responde`

**Texto de hoy:**
> En la Prestadora no contesta nadie

**Dónde se ve:** Pase de guardia, paso «entrar igual / cerrar igual». Es una de las cinco
opciones de la lista de motivos por los que no se pudo comprobar.

**Qué lo dispara:** está siempre en esa lista.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/components/PaseDeGuardia.jsx:313`, la lista en
`src/lib/motivosSinComprobar.js`

**DECISIÓN:**

---

## 20. Qué significa ponerse no disponible

**Ruta:** `perfil.disponibilidad_explicacion`

**Texto de hoy:**
> Usted decide cuándo quiere que le ofrezcan guardias nuevas. Ponerse como no disponible no
> cambia las guardias que ya aceptó ni lo da de baja de la Prestadora, y puede volver atrás
> cuando quiera.

**Dónde se ve:** Mi perfil, sección «Disponibilidad», entre el título y el botón de ponerse
disponible o no disponible.

**Qué lo dispara:** está siempre.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/pages/MiPerfil.jsx:138`

**DECISIÓN:**

---

## 21. La matrícula espera que la miren

**Ruta:** `matricula.esperando_verificacion`

**Texto de hoy:**
> La matrícula que cargó está esperando que la Prestadora la mire. Hasta entonces no se pueden
> tomar guardias.

**Dónde se ve:** Mi perfil, bloque Matrícula, cartel de arriba.

**Qué lo dispara:** la matrícula está trabada por «sin comprobar» y esta persona tiene
habilitada la carga desde el teléfono.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/components/Matricula.jsx:136`

**DECISIÓN:**

---

## 22. La misma espera, cuando carga la oficina

**Ruta:** `matricula.esperando_verificacion_prestadora`

**Texto de hoy:**
> Está cargada y la Prestadora todavía tiene que comprobarla. Hasta entonces no se pueden tomar
> guardias.

**Dónde se ve:** Mi perfil, bloque Matrícula, el mismo cartel de arriba.

**Qué lo dispara:** lo mismo que el anterior, pero cuando la carga la hace la oficina y no la
persona.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/components/Matricula.jsx:136`

**DECISIÓN:**

---

## 23. Bloqueo por matrícula sin comprobar

**Ruta:** `matricula.bloqueo_sin_verificar`

**Texto de hoy:**
> La matrícula está cargada, pero nadie de la Prestadora la comprobó todavía.

**Dónde se ve:** Mi perfil, bloque Matrícula, cartel rojo de bloqueo.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/components/Matricula.jsx:143`

**OBSERVACIÓN:** este texto no se puede llegar a ver. El caso «sin comprobar» lo atrapa antes la
rama anterior del mismo cartel (la ficha 21), así que esta rama queda inalcanzable.

**DECISIÓN:**

---

## 24. Qué hacer con la matrícula sin comprobar

**Ruta:** `matricula.que_hacer_sin_verificar`

**Texto de hoy:**
> No hace falta hacer nada más: la Prestadora la va a mirar.

**Dónde se ve:** Mi perfil, bloque Matrícula, segunda mitad del cartel rojo de bloqueo.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/components/Matricula.jsx:143`

**OBSERVACIÓN:** tampoco se puede llegar a ver, por la misma razón que la ficha 23.

**DECISIÓN:**

---

## 25. Acá la matrícula la carga la oficina

**Ruta:** `matricula.carga_la_prestadora`

**Texto de hoy:**
> En esta Prestadora las matrículas las carga la oficina: hace falta acercarles el papel o el
> archivo para que lo suban.

**Dónde se ve:** Mi perfil, bloque Matrícula, cartel rojo de bloqueo.

**Qué lo dispara:** la matrícula traba las guardias y esta persona no puede cargarla desde el
teléfono.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/components/Matricula.jsx:143`

**DECISIÓN:**

---

## 26. Hay que acercar la renovación

**Ruta:** `matricula.renovar_con_la_prestadora`

**Texto de hoy:**
> Hace falta acercarle la renovación a la Prestadora antes de esa fecha para no quedarse sin
> guardias.

**Dónde se ve:** Mi perfil, bloque Matrícula, cartel amarillo de vencimiento cercano o ya
vencida.

**Qué lo dispara:** la matrícula vence pronto y esta persona no carga desde el teléfono.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/components/Matricula.jsx:154`

**DECISIÓN:**

---

## 27. La matrícula quedó cargada

**Ruta:** `matricula.cargada`

**Texto de hoy:**
> Listo. La Prestadora la va a revisar.

**Dónde se ve:** Mi perfil, bloque Matrícula.

**Qué lo dispara:** la persona manda el formulario de carga de una matrícula nueva.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/components/Matricula.jsx:97`

**DECISIÓN:**

---

## 28. Estado: comprobada

**Ruta:** `matricula.verificada`

**Texto de hoy:**
> Comprobada por la Prestadora

**Dónde se ve:** Mi perfil, bloque Matrícula, lista de matrículas cargadas. Es el estado que
acompaña a cada renglón ya comprobado.

**Qué lo dispara:** está siempre en los renglones comprobados.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/components/Matricula.jsx:253`

**DECISIÓN:**

---

## 29. Acá sólo se carga

**Ruta:** `matricula.solo_carga`

**Texto de hoy:**
> Acá solo se carga. Comprobarla y corregirla es de la Prestadora — si algo quedó mal, hace
> falta cargar la correcta y avisarles.

**Dónde se ve:** Mi perfil, bloque Matrícula, texto del final.

**Qué lo dispara:** está siempre, para quien tiene habilitada la carga desde el teléfono.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/components/Matricula.jsx:267`

**DECISIÓN:**

---

## 30. Falta cargar algún papel

**Ruta:** `papeles.resumen_incompleta`

**Texto de hoy:**
> Falta cargar algún papel de los que pide la Prestadora.

**Dónde se ve:** Mi perfil, bloque «Mis papeles» —debajo de Matrícula—, cartel de resumen de
arriba.

**Qué lo dispara:** la carpeta está incompleta.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/components/CarpetaDePapeles.jsx:98`

**DECISIÓN:**

---

## 31. No se pide ningún papel

**Ruta:** `papeles.resumen_sin_exigencias`

**Texto de hoy:**
> Esta Prestadora no pide ningún papel.

**Dónde se ve:** Mi perfil, bloque «Mis papeles», el mismo cartel de resumen.

**Qué lo dispara:** la empresa no exige documentación.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/components/CarpetaDePapeles.jsx:98`

**DECISIÓN:**

---

## 32. El Certificado quedó dado de baja

**Ruta:** `papeles.certificado_estado_dado_de_baja`

**Texto de hoy:**
> La Prestadora dio de baja este Certificado.

**Dónde se ve:** Mi perfil, bloque «Mis papeles», subsección «Certificado de Aptitud». Es el
estado del certificado.

**Qué lo dispara:** el certificado fue dado de baja.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/components/CarpetaDePapeles.jsx:121`

**DECISIÓN:**

---

## 33. Los papeles los recibe la oficina

**Ruta:** `papeles.los_recibe_la_prestadora`

**Texto de hoy:**
> Los papeles los recibe y los carga la Prestadora. Si falta alguno o hay que renovarlo, hace
> falta acercárselo a la oficina.

**Dónde se ve:** Mi perfil, bloque «Mis papeles», último renglón.

**Qué lo dispara:** está siempre que el bloque se dibuja.

**Quién lo lee:** el Asistente.

**Archivo:** `pwa-asistentes/src/components/CarpetaDePapeles.jsx:127`

**DECISIÓN:**

---

# PARTE II — La aplicación de los Clientes

Los lee el Cliente: el titular de la cuenta y las personas que él anotó en su personas autorizadas. **Son 34.**

---

## 34. Videollamada no configurada

**Ruta:** `errores.motivos.videollamada_no_configurada`

**Texto de hoy:**
> Esta Prestadora todavía no configuró las videollamadas, así que por ahora la conversación
> sigue por escrito.

**Dónde se ve:** Conversación de Match (`/mensajes/:id`).

**Qué lo dispara:** se toca el botón de videollamada y la empresa no tiene sala configurada.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/lib/errores.js:156`

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

**Archivo:** `pwa-clientes/src/lib/errores.js:156`

**DECISIÓN:**

---

## 36. Esto no está entre lo que le dieron

**Ruta:** `errores.motivos.sin_acceso`

**Texto de hoy:**
> El titular de la cuenta no incluyó esto en lo que usted puede ver. El cambio se lo pide él a
> la Prestadora.

**Dónde se ve:** en cualquier pantalla o acción que el titular no le haya dado a esa persona
de las personas autorizadas —guardias, reportes, alertas, facturas, medicación—.

**Qué lo dispara:** el servidor rechaza el pedido por falta de acceso.

**Quién lo lee:** una persona de las personas autorizadas, nunca el titular.

**Archivo:** `pwa-clientes/src/lib/errores.js:156`

**DECISIÓN:**

---

## 37. Demasiados intentos con la instrucción

**Ruta:** `errores.motivos.demasiados_intentos`

**Texto de hoy:**
> Se probó demasiadas veces con esta instrucción. Pedir un código nuevo ya no devuelve
> intentos: hace falta que la Prestadora la cargue de nuevo, o firmarla en papel.

**Dónde se ve:** Firmar instrucción (`/instruccion`).

**Qué lo dispara:** se manda el código de verificación después de haber errado el tope de veces.

**Quién lo lee:** el titular de la cuenta.

**Archivo:** `pwa-clientes/src/lib/errores.js:156`

**DECISIÓN:**

---

## 38. Acá no hay lista para elegir

**Ruta:** `errores.motivos.match_no_habilitado`

**Texto de hoy:**
> Esta Prestadora asigna ella misma a sus Asistentes, así que no hay una lista para elegir.

**Dónde se ve:** la vidriera (`/buscar`, `/buscar/:id`) o Mensajes (`/mensajes`).

**Qué lo dispara:** se llega escribiendo la dirección y la empresa no trabaja con Match.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/lib/errores.js:156`

**DECISIÓN:**

---

## 39. Para ver el contacto hace falta contratar

**Ruta:** `errores.motivos.sin_acceso_de_match`

**Texto de hoy:**
> Para ver cómo llegar a esta persona hace falta tener contratado el servicio con la Prestadora.

**Dónde se ve:** perfil público del Asistente (`/buscar/:id`), bloque de contacto.

**Qué lo dispara:** el dato de contacto está cerrado por ese motivo.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/pages/PerfilPublicoAsistente.jsx:176`

**DECISIÓN:**

---

## 40. El servicio contratado no está vigente

**Ruta:** `errores.motivos.acceso_no_vigente`

**Texto de hoy:**
> El servicio contratado no está vigente. Para ver estos datos hace falta renovarlo con la
> Prestadora.

**Dónde se ve:** perfil público del Asistente (`/buscar/:id`), bloque de contacto.

**Qué lo dispara:** el acceso venció.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/pages/PerfilPublicoAsistente.jsx:176`

**DECISIÓN:**

---

## 41. Se acabaron los contactos incluidos

**Ruta:** `errores.motivos.saldo_agotado`

**Texto de hoy:**
> Ya se usaron todos los contactos incluidos. Para ver uno más hace falta pedirle otro paquete
> a la Prestadora.

**Dónde se ve:** perfil público del Asistente (`/buscar/:id`), bloque de contacto.

**Qué lo dispara:** se agotó el paquete de contactos.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/pages/PerfilPublicoAsistente.jsx:176`

**DECISIÓN:**

---

## 42. Quién canceló la guardia

**Ruta:** `guardias.cancelo_prestadora`

**Texto de hoy:**
> Cancelada por la Prestadora

**Dónde se ve:** Guardias de un Paciente (`/pacientes/:id/guardias`), etiqueta de la tarjeta de
cada guardia.

**Qué lo dispara:** esa guardia fue cancelada y el origen de la cancelación es la empresa.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/pages/Guardias.jsx:108` — la clave se arma sola como
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

**Dónde se ve:** Asistente asignado (`/pacientes/:id/asistente`), en «Qué le corresponde hacer»
y en «Qué no le corresponde».

**Qué lo dispara:** esa lista viene vacía.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/pages/AsistenteAsignado.jsx:117` y `:122`

**DECISIÓN:**

---

## 46. No se exigen papeles

**Ruta:** `asistente.documentacion_sin_exigencias`

**Texto de hoy:**
> Esta Prestadora no registró exigencias documentales para su personal.

**Dónde se ve:** bloque «Documentación» del Asistente, que aparece en dos lados: Asistente
asignado (`/pacientes/:id/asistente`) y el perfil público de la vidriera (`/buscar/:id`).

**Qué lo dispara:** el resumen documental es «sin exigencias».

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/components/EstadoDocumental.jsx:19`

**DECISIÓN:**

---

## 47. Los papeles están al día

**Ruta:** `asistente.documentacion_al_dia`

**Texto de hoy:**
> Los papeles que esta Prestadora exige están al día.

**Dónde se ve:** el mismo bloque «Documentación», en las dos pantallas.

**Qué lo dispara:** los papeles están completos.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/components/EstadoDocumental.jsx:19`

**DECISIÓN:**

---

## 48. Falta algún papel

**Ruta:** `asistente.documentacion_incompleta`

**Texto de hoy:**
> Falta cargar alguno de los papeles que esta Prestadora exige.

**Dónde se ve:** el mismo bloque «Documentación», en las dos pantallas.

**Qué lo dispara:** falta algún papel.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/components/EstadoDocumental.jsx:19`

**DECISIÓN:**

---

## 49. Algún papel está vencido

**Ruta:** `asistente.documentacion_vencida`

**Texto de hoy:**
> Alguno de los papeles que esta Prestadora exige está vencido.

**Dónde se ve:** el mismo bloque «Documentación», en las dos pantallas.

**Qué lo dispara:** algún papel está vencido.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/components/EstadoDocumental.jsx:19`

**DECISIÓN:**

---

## 50. Matrícula vigente y comprobada

**Ruta:** `asistente.documentacion_matricula_vigente_verificada`

**Texto de hoy:**
> Matrícula vigente, comprobada por la Prestadora contra el registro correspondiente.

**Dónde se ve:** el mismo bloque «Documentación», renglón de la matrícula, en las dos pantallas.

**Qué lo dispara:** la matrícula fue comprobada.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/components/EstadoDocumental.jsx:28`

**DECISIÓN:**

---

## 51. Matrícula vigente, sin comprobar

**Ruta:** `asistente.documentacion_matricula_vigente_sin_verificar`

**Texto de hoy:**
> Matrícula vigente según el papel presentado. La Prestadora todavía no la comprobó contra el
> registro correspondiente.

**Dónde se ve:** el mismo renglón de la matrícula, en las dos pantallas.

**Qué lo dispara:** la matrícula está vigente por el papel, pero sin comprobar.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/components/EstadoDocumental.jsx:28`

**DECISIÓN:**

---

## 52. Qué no dice el estado documental

**Ruta:** `asistente.documentacion_que_no_se_verifica`

**Texto de hoy:**
> Qué no dice esto: no se verifica la identidad de la persona, no se consultan antecedentes
> penales y no se comprueba que los documentos presentados sean auténticos. Quien controla los
> papeles de su personal es la Prestadora.

**Dónde se ve:** última línea del bloque «Documentación», en las dos pantallas.

**Qué lo dispara:** está siempre que ese bloque se dibuje.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/components/EstadoDocumental.jsx:31`

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

**Quién lo lee:** una persona de las personas autorizadas.

**Archivo:** `pwa-clientes/src/pages/AsistenteAsignado.jsx:155`

**DECISIÓN:**

---

## 54. Para qué sirve la vidriera

**Ruta:** `vidriera.para_que`

**Texto de hoy:**
> Las personas que esta Prestadora ofrece. Se puede mirar el perfil de cada una antes de
> decidir.

**Dónde se ve:** Buscar Asistentes (`/buscar`), bajada debajo del título.

**Qué lo dispara:** está siempre, donde la empresa trabaja con Match.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/pages/BuscarAsistentes.jsx:72`

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

**Archivo:** `pwa-clientes/src/pages/BuscarAsistentes.jsx:117` y
`pwa-clientes/src/pages/PerfilPublicoAsistente.jsx:131`

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

**Archivo:** `pwa-clientes/src/pages/PerfilPublicoAsistente.jsx:201`

**DECISIÓN:**

---

## 57. Si en la casa no hay quien muestre el código

**Ruta:** `codigo_para_el_asistente.si_no_pueden_mostrarlo`

**Texto de hoy:**
> Si en la casa no hay nadie que pueda mostrar el código, el Asistente le avisa a la Prestadora
> desde su teléfono y entra igual. La guardia nunca se traba por esto.

**Dónde se ve:** Código para el Asistente (`/codigo`), al pie, debajo del código.

**Qué lo dispara:** está siempre en esa pantalla.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/pages/CodigoParaElAsistente.jsx:37`

**DECISIÓN:**

---

## 58. Qué confirma el escaneo

**Ruta:** `escaneo.alcance`

**Texto de hoy:**
> Esta verificación confirma la identidad y la asignación registradas por la Prestadora. No
> reemplaza la supervisión personal.

**Dónde se ve:** Escanear Asistente (`/pacientes/:id/escanear-asistente`), en la pantalla de
resultado, debajo de su ficha.

**Qué lo dispara:** se escaneó el código del Asistente.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/pages/EscanearAsistente.jsx:147`

**DECISIÓN:**

---

## 59. Qué es la biblioteca de contenidos

**Ruta:** `contenidos.explicacion`

**Texto de hoy:**
> Lo que esta Prestadora escribió para quienes cuidan en su casa.

**Dónde se ve:** Contenidos (`/contenidos`), bajada debajo del título. Se entra desde Mi Perfil.

**Qué lo dispara:** está siempre.

**Quién lo lee:** el Cliente.

**Archivo:** `pwa-clientes/src/pages/Contenidos.jsx:40`

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

**Archivo:** `pwa-clientes/src/pages/FacturaDetalle.jsx:158`

**DECISIÓN:**

---

## 62. Usted es el titular

**Ruta:** `perfil.acceso_titular`

**Texto de hoy:**
> Usted es el titular de la cuenta: ve todo lo que la Prestadora ofrece, y es quien decide qué
> ve cada persona anotada en su personas autorizadas.

**Dónde se ve:** Mi Perfil (`/perfil`), sección «Qué ve usted».

**Qué lo dispara:** quien mira es el titular. Es el único párrafo que se le muestra, en lugar de
las dos listas.

**Quién lo lee:** el titular de la cuenta.

**Archivo:** `pwa-clientes/src/pages/MiPerfil.jsx:152`

**DECISIÓN:**

---

## 63. No hay nada afuera

**Ruta:** `perfil.acceso_no_ve_vacio`

**Texto de hoy:**
> No hay nada afuera: usted ve todo lo que la Prestadora ofrece.

**Dónde se ve:** Mi Perfil (`/perfil`), sección «Qué ve usted», como texto de la lista vacía «Lo
que usted no ve».

**Qué lo dispara:** quien mira no es el titular, y el titular le dio acceso a todo.

**Quién lo lee:** una persona de las personas autorizadas.

**Archivo:** `pwa-clientes/src/pages/MiPerfil.jsx:165`

**DECISIÓN:**

---

## 64. Esto lo decide el titular

**Ruta:** `perfil.acceso_lo_decide_el_titular`

**Texto de hoy:**
> Esto lo definió el titular de la cuenta por escrito. Acá no hay nada que configurar:
> cualquier cambio se lo pide él a la Prestadora.

**Dónde se ve:** Mi Perfil (`/perfil`), al pie de la sección «Qué ve usted».

**Qué lo dispara:** quien mira no es el titular. Aclara que la pantalla no es un formulario.

**Quién lo lee:** una persona de las personas autorizadas.

**Archivo:** `pwa-clientes/src/pages/MiPerfil.jsx:167`

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

**Archivo:** `pwa-clientes/src/pages/Medicacion.jsx:223`

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

**Quién lo lee:** una persona de las personas autorizadas.

**Archivo:** `pwa-clientes/src/pages/Medicacion.jsx:167`

**DECISIÓN:**

---

## 67. Qué es la instrucción a firmar

**Ruta:** `instruccion.explicacion`

**Texto de hoy:**
> Esto es lo que usted le pidió a la Prestadora sobre qué ve cada persona anotada en su personas autorizadas
> familiar. Ya está rigiendo: lo que falta es su firma.

**Dónde se ve:** Firmar instrucción (`/instruccion`), entre el título y el texto del documento.

**Qué lo dispara:** hay una instrucción pendiente de firma. Se llega por el cartel que aparece
en Mis Pacientes, en el detalle de un Paciente y en Mi Perfil.

**Quién lo lee:** el titular de la cuenta.

**Archivo:** `pwa-clientes/src/pages/FirmarInstruccion.jsx:141`

**DECISIÓN:**

---

# PARTE III — El Panel

Los lee, casi siempre, la propia empresa: su Administrador o su Coordinador. **Son 101.**

Hay dos excepciones que conviene tener a la vista al recorrerlos, y son un hecho del código, no
una opinión:

- **Las tres de la entrevista pública** (fichas 112, 113 y 114) las lee un postulante, que está
  afuera de la empresa.
- **Un grupo las lee el soporte técnico de CeltaTech**, no la empresa: son las de la pantalla de
  Prestadoras, las de la franja de sesión de soporte y las de Auditoría con alcance de
  Superadmin. Van señaladas en su ficha.

---

## 68. Ese correo ya tiene cuenta acá

**Ruta:** `errores.motivos.correo_de_esta_prestadora`

**Texto de hoy:**
> Ese correo ya tiene una cuenta en esta Prestadora. Conviene buscarla en la lista antes de
> crear una nueva.

**Dónde se ve:** cartel de error del formulario, al guardar un alta de cuenta —Usuario del
Panel, Asistente, Cliente, personas autorizadas— o una importación masiva.

**Qué lo dispara:** el correo escrito ya tiene cuenta de acceso en esta misma empresa.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/lib/errores.js:156`

**DECISIÓN:**

---

## 69. No hay etapas de incorporación

**Ruta:** `errores.motivos.sin_etapas_incorporacion`

**Texto de hoy:**
> Esta Prestadora todavía no tiene etapas de incorporación configuradas. Se definen en
> Configuración > El cuidado.

**Dónde se ve:** al confirmar la incorporación o el avance de un Asistente por el circuito de
incorporación.

**Qué lo dispara:** no hay ninguna etapa activa configurada.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/lib/errores.js:156`

**DECISIÓN:**

---

## 70. Ese nombre de Prestadora ya existe

**Ruta:** `errores.motivos.nombre_de_prestadora_repetido`

**Texto de hoy:**
> Ya hay una Prestadora con ese nombre. Hace falta usar otro: de ese nombre sale la dirección
> desde la que manda sus mensajes.

**Dónde se ve:** Ajustes > Prestadoras, formulario «Dar de alta una Prestadora», al guardar.

**Qué lo dispara:** el nombre de fantasía ya existe.

**Quién lo lee:** el soporte técnico de CeltaTech.

**Archivo:** `panel/src/lib/errores.js:156`

**DECISIÓN:**

---

## 71. Ese país no tiene moneda cargada

**Ruta:** `errores.motivos.pais_sin_moneda`

**Texto de hoy:**
> Todavía no está cargado en qué moneda trabaja ese país, así que no se puede dar de alta una
> Prestadora ahí. Hace falta agregarlo antes.

**Dónde se ve:** Ajustes > Prestadoras, al confirmar el alta.

**Qué lo dispara:** el país elegido no está en el catálogo de monedas.

**Quién lo lee:** el soporte técnico de CeltaTech.

**Archivo:** `panel/src/lib/errores.js:156`

**DECISIÓN:**

---

## 72. No se pudo dar una dirección de ingreso

**Ruta:** `errores.motivos.direccion_de_prestadora_no_disponible`

**Texto de hoy:**
> No se pudo darle una dirección propia de ingreso a esa Prestadora. Hace falta usar otro
> nombre.

**Dónde se ve:** Ajustes > Prestadoras, al confirmar el alta.

**Qué lo dispara:** del nombre no sale ninguna dirección de ingreso libre.

**Quién lo lee:** el soporte técnico de CeltaTech.

**Archivo:** `panel/src/lib/errores.js:156`

**DECISIÓN:**

---

## 73. Esa modalidad no está activa

**Ruta:** `errores.motivos.modalidad_no_activa`

**Texto de hoy:**
> Esta Prestadora no tiene activa esa modalidad, así que esa pantalla no le corresponde. Se
> activa en Configuración > La Prestadora, en Modalidades contratadas.

**Dónde se ve:** en el lugar del contenido de una pantalla de Match —Clientes (Match), Formas de
cobro, Calificaciones, Auditoría legal—.

**Qué lo dispara:** se entra sin tener esa modalidad contratada.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/lib/errores.js:156`

**DECISIÓN:**

---

## 74. No hay pasarela conectada

**Ruta:** `errores.motivos.sin_pasarela_conectada`

**Texto de hoy:**
> Esta Prestadora no tiene ninguna pasarela de cobro conectada. Se conecta en Match > Pasarela
> de pago.

**Dónde se ve:** Clientes > Clientes (Match), al confirmar el alta de un acceso cobrable.

**Qué lo dispara:** no hay ninguna pasarela conectada.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/lib/errores.js:156`

**DECISIÓN:**

---

## 75. Hay más de una pasarela conectada

**Ruta:** `errores.motivos.varias_pasarelas_conectadas`

**Texto de hoy:**
> Esta Prestadora tiene más de una pasarela de cobro conectada. Hace falta elegir con cuál se
> va a cobrar este acceso.

**Dónde se ve:** Clientes > Clientes (Match), al confirmar el alta de un acceso cobrable.

**Qué lo dispara:** hay más de una pasarela conectada y no se indicó cuál.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/lib/errores.js:156`

**DECISIÓN:**

---

## 76. Esa pasarela no está conectada

**Ruta:** `errores.motivos.pasarela_no_conectada`

**Texto de hoy:**
> Esa pasarela de cobro no está conectada en esta Prestadora. Se conecta en Match > Pasarela de
> pago.

**Dónde se ve:** Clientes > Clientes (Match), al confirmar el alta de un acceso.

**Qué lo dispara:** se pidió cobrar por una pasarela puntual que no está conectada.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/lib/errores.js:156`

**DECISIÓN:**

---

## 77. No hay cuenta de WhatsApp Business

**Ruta:** `errores.motivos.whatsapp_sin_cuenta`

**Texto de hoy:**
> Esta Prestadora no tiene cuenta de WhatsApp Business. Se carga en Configuración > Mensajes.

**Dónde se ve:** Ajustes > Configuración > Mensajes, bloque de plantillas.

**Qué lo dispara:** se intenta dar de alta una plantilla o consultar su estado sin cuenta ni
token cargados.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/lib/errores.js:156`

**DECISIÓN:**

---

## 78. El enlace del menú

**Ruta:** `nav.prestadoras`

**Texto de hoy:**
> Prestadoras

**Dónde se ve:** menú lateral, grupo «Ajustes». Es el nombre del enlace.

**Qué lo dispara:** está siempre, y sólo para el Superadmin.

**Quién lo lee:** el soporte técnico de CeltaTech.

**Archivo:** `panel/src/components/layout/Layout.jsx:216`

**DECISIÓN:**

---

## 79. Esta dirección no es de ninguna Prestadora

**Ruta:** `auth.puerta_desconocida`

**Texto de hoy:**
> Esta dirección no corresponde a ninguna Prestadora.

**Dónde se ve:** pantalla de ingreso (`/login`), fuera del menú.

**Qué lo dispara:** se abrió el Panel por una dirección que no está asociada a ninguna empresa.

**Quién lo lee:** quien haya escrito esa dirección. No se sabe quién es: todavía no hay sesión.

**Archivo:** `panel/src/pages/Login.jsx:130`

**DECISIÓN:**

---

## 80. El nombre de la primera sección de Configuración

**Ruta:** `configuracion.seccion_prestadora`

**Texto de hoy:**
> La Prestadora

**Dónde se ve:** Ajustes > Configuración, en la lista de secciones. Es la primera.

**Qué lo dispara:** está siempre que un Admin abra Configuración.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/Configuracion.jsx:33`

**OBSERVACIÓN:** este texto es el nombre de una sección de la pantalla, y otros ocho textos del
Panel mandan a ella escribiendo «Configuración > La Prestadora». Si el nombre cambia, esos ocho
quedan mandando a un lugar que ya no se llama así.

**DECISIÓN:**

---

## 81. De qué se componen las listas de opciones

**Ruta:** `configuracion.listas_explicacion`

**Texto de hoy:**
> Cada lista trae las opciones del producto, iguales para todas, y las que agregue esta
> Prestadora. Lo que agrega ella se ofrece detrás de las del producto.

**Dónde se ve:** Ajustes > Configuración > Listas de opciones, párrafo del encabezado.

**Qué lo dispara:** está siempre al abrir la sección.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/configuracion/LasListasDeOpciones.jsx:48`

**DECISIÓN:**

---

## 82. Origen de una opción: propia

**Ruta:** `configuracion.listas_origen_propia`

**Texto de hoy:**
> De la Prestadora

**Dónde se ve:** Ajustes > Configuración > Listas de opciones, columna de origen de la tabla.

**Qué lo dispara:** esa opción la agregó la empresa, no el producto.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/configuracion/LasListasDeOpciones.jsx:229`

**DECISIÓN:**

---

## 83. Qué son las modalidades

**Ruta:** `configuracion.modalidades_explicacion`

**Texto de hoy:**
> De qué manera trabaja la Prestadora. Al activar una modalidad aparecen en el menú las
> pantallas que le corresponden; al desactivarla, esas pantallas se van.

**Dónde se ve:** Ajustes > Configuración > La Prestadora, bloque «Modalidades contratadas».

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/configuracion/LaPrestadora.jsx:154`

**DECISIÓN:**

---

## 84. La credencial del software externo sólo la carga el Admin

**Ruta:** `configuracion.software_externo_solo_admin`

**Texto de hoy:**
> La credencial es de la Prestadora: solo Admin puede cargarla.

**Dónde se ve:** Ajustes > Configuración > La Prestadora, bloque del software de afuera
(facturación y cobranzas).

**Qué lo dispara:** quien mira no es Admin.

**Quién lo lee:** alguien de la empresa que no es su Administrador.

**Archivo:** `panel/src/pages/configuracion/ElSoftwareDeAfuera.jsx:105`

**DECISIÓN:**

---

## 85. Qué son los tipos de Asistente

**Ruta:** `configuracion.tipos_explicacion`

**Texto de hoy:**
> Qué es cada Asistente y qué tareas le corresponden. {{producto}} trae cuatro tipos de
> fábrica: no se pueden renombrar ni cambiarles la exigencia de matrícula, pero sí agregarles
> tareas propias. Los tipos que agregue la Prestadora son suyos por completo.

**Dónde se ve:** Ajustes > Configuración > Asistentes, bloque de tipos de Asistente.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/configuracion/TiposAsistenteTab.jsx:159`

**DECISIÓN:**

---

## 86. Origen de un tipo: propio

**Ruta:** `configuracion.tipos_origen_propia`

**Texto de hoy:**
> La Prestadora

**Dónde se ve:** Ajustes > Configuración > Asistentes, columna de origen de la tabla de tipos.

**Qué lo dispara:** ese tipo lo agregó la empresa, no el producto.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/configuracion/TiposAsistenteTab.jsx:229`

**DECISIÓN:**

---

## 87. Qué es el consentimiento del Pagador

**Ruta:** `configuracion.consentimiento_pagador_explicacion`

**Texto de hoy:**
> El Pagador firma que asume la obligación de pagar el servicio. Ese documento es entre esta
> Prestadora y quien paga, así que el texto es suyo: acá se lo escribe, se lo reemplaza por el
> propio o se deja el modelo.

**Dónde se ve:** Ajustes > Configuración > La Prestadora, bloque del consentimiento del Pagador.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/configuracion/ConsentimientoPagadorTab.jsx:32`

**DECISIÓN:**

---

## 88. Hoy rige el modelo

**Ruta:** `configuracion.consentimiento_pagador_es_modelo`

**Texto de hoy:**
> Hoy rige el modelo que trae {{producto}}. Es una sugerencia y nada más: no es asesoramiento
> legal, y adoptarlo, cambiarlo o reemplazarlo es decisión de esta Prestadora.

**Dónde se ve:** Ajustes > Configuración > La Prestadora, cartel de estado del consentimiento.

**Qué lo dispara:** la empresa todavía no cargó texto propio.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/configuracion/ConsentimientoPagadorTab.jsx:94`

**DECISIÓN:**

---

## 89. Hoy rige el texto propio

**Ruta:** `configuracion.consentimiento_pagador_es_propio`

**Texto de hoy:**
> Hoy rige el texto que cargó esta Prestadora.

**Dónde se ve:** Ajustes > Configuración > La Prestadora, el mismo cartel de estado.

**Qué lo dispara:** ya hay texto propio cargado.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/configuracion/ConsentimientoPagadorTab.jsx:95`

**DECISIÓN:**

---

## 90. Qué papeles exige el financiador

**Ruta:** `configuracion.papeles_pagador_explicacion`

**Texto de hoy:**
> Qué papeles exige cada financiador. Lo sabe esta Prestadora, que trabaja con él, así que no
> viene nada cargado. Sin ninguno cargado no se pide ninguno, y eso también es una respuesta
> válida.

**Dónde se ve:** Ajustes > Configuración > La Prestadora, bloque de papeles del financiador,
debajo del consentimiento.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/configuracion/ConsentimientoPagadorTab.jsx:208`

**DECISIÓN:**

---

## 91. Las credenciales de la pasarela sólo las toca el Admin

**Ruta:** `configuracion.pasarela_credenciales_solo_admin`

**Texto de hoy:**
> Acá se ve qué pasarelas están conectadas, pero conectarlas y cambiar sus claves es del
> administrador de la prestadora. El soporte técnico no accede a las credenciales con las que
> la prestadora cobra, ni siquiera durante una sesión de soporte.

**Dónde se ve:** Ajustes > Configuración > La Prestadora, bloque de pasarelas de cobro.

**Qué lo dispara:** quien mira no puede tocar las credenciales: es Coordinador, o es soporte
técnico con la sesión abierta.

**Quién lo lee:** alguien de la empresa que no es su Administrador, o el soporte de CeltaTech.

**Archivo:** `panel/src/pages/configuracion/LaPrestadora.jsx:437`

**DECISIÓN:**

---

## 92. Cada cuánto se le paga a cada persona

**Ruta:** `configuracion.frecuencia_pago_explicacion`

**Texto de hoy:**
> Con qué se le mide el trabajo a cada persona —por hora, por guardia, por semana o por mes— se
> elige en el Plantel de Asistentes. Acá se elige otra cosa: cada cuánto se le paga. Son
> independientes: se le puede pagar por hora y cobrar por mes. Esto es lo que rige para toda la
> Prestadora, y con cada persona se puede arreglar distinto desde el Plantel.

**Dónde se ve:** Ajustes > Configuración > Asistentes, bloque de pago, junto al selector de
frecuencia.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/configuracion/PagoAsistentesTab.jsx:114`

**DECISIÓN:**

---

## 93. Qué son los lugares

**Ruta:** `configuracion.lugares_explicacion`

**Texto de hoy:**
> Las localidades y los barrios donde la Prestadora presta servicio. De esta lista salen el
> domicilio del Paciente, el de la Asistente, dónde acepta trabajar cada una y qué abarca cada
> zona de cobertura.

**Dónde se ve:** Ajustes > Configuración > La Prestadora, bloque de lugares.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/configuracion/LosLugares.jsx:50`

**DECISIÓN:**

---

## 94. No hay ningún lugar cargado

**Ruta:** `configuracion.lugares_sin_lista`

**Texto de hoy:**
> La Prestadora todavía no cargó ningún lugar. Se cargan en Configuración.

**Dónde se ve:** en todo casillero que elige lugares: alta y solapa Perfil de un Asistente
(Plantel > Plantel de Asistentes), asignación de zonas en Ajustes > Usuarios del Panel, y el
propio bloque de lugares de Configuración.

**Qué lo dispara:** no hay ningún lugar cargado.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/components/lugares/ElegirLugares.jsx:30` y
`panel/src/components/lugares/SelectorDeLugares.jsx:59`

**DECISIÓN:**

---

## 95. Qué es el pase de guardia

**Ruta:** `configuracion.servicios_pase_explicacion`

**Texto de hoy:**
> Al llegar al domicilio, el Asistente lee un código que le muestra en su teléfono quien está
> en la casa: el Cliente, o el Asistente que se va cuando hay relevo. Ese código se renueva
> solo cada pocos segundos, así que una foto no sirve un minuto después. Cuando no hay nadie
> que pueda mostrarlo, el Asistente lo pide y la Prestadora le suelta uno de un solo uso, que
> vale para esa guardia, ese domicilio y unos pocos minutos.

**Dónde se ve:** Ajustes > Configuración > El cuidado, bloque del pase de guardia.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/configuracion/ElCuidado.jsx:181`

**DECISIÓN:**

---

## 96. Cuántos minutos vale el código

**Ruta:** `configuracion.servicios_pase_minutos`

**Texto de hoy:**
> Cuántos minutos vale el código que suelta la Prestadora

**Dónde se ve:** Ajustes > Configuración > El cuidado, bloque del pase de guardia. Es la
etiqueta del casillero.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/configuracion/ElCuidado.jsx:190`

**DECISIÓN:**

---

## 97. La alerta roja siempre le llega al Coordinador

**Ruta:** `configuracion.alertas_ia_roja_siempre_coordinador`

**Texto de hoy:**
> Una alerta roja siempre le llega al Coordinador. Eso no se cambia: si la revisión encontró
> algo urgente, alguien de la Prestadora tiene que enterarse.

**Dónde se ve:** Ajustes > Configuración > Mensajes, bloque de alertas de la revisión con IA,
debajo de los destinatarios configurables.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/configuracion/Avisos.jsx:396`

**DECISIÓN:**

---

## 98. Título del bloque de correo

**Ruta:** `configuracion.correo_titulo`

**Texto de hoy:**
> El correo de esta prestadora

**Dónde se ve:** Ajustes > Configuración > Mensajes. Es el título del bloque.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/configuracion/Avisos.jsx:492`

**DECISIÓN:**

---

## 99. De dónde sale el correo

**Ruta:** `configuracion.correo_explicacion`

**Texto de hoy:**
> Los mensajes de esta prestadora salen desde una dirección que sólo envía. Las respuestas se
> reenvían a la casilla que se indique acá.

**Dónde se ve:** Ajustes > Configuración > Mensajes, debajo del título del bloque de correo,
encima del casillero de la casilla de respuestas.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/configuracion/Avisos.jsx:493`

**DECISIÓN:**

---

## 100. Las credenciales de WhatsApp sólo las ve el Admin

**Ruta:** `configuracion.whatsapp_credenciales_solo_admin`

**Texto de hoy:**
> Estas credenciales son de la prestadora y solo las ve y las cambia su administrador. El
> soporte técnico no accede a las claves con las que la prestadora habla con Meta, ni siquiera
> durante una sesión de soporte.

**Dónde se ve:** Ajustes > Configuración > Mensajes, bloque de WhatsApp.

**Qué lo dispara:** quien mira no es el Administrador de la empresa, o hay sesión de soporte
abierta.

**Quién lo lee:** alguien de la empresa que no es su Administrador, o el soporte de CeltaTech.

**Archivo:** `panel/src/pages/configuracion/Avisos.jsx:769`

**DECISIÓN:**

---

## 101. La llave que enciende WhatsApp

**Ruta:** `configuracion.whatsapp_activo`

**Texto de hoy:**
> WhatsApp activo para esta prestadora

**Dónde se ve:** Ajustes > Configuración > Mensajes, bloque de WhatsApp. Es la etiqueta de la
llave que lo enciende o lo apaga.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/configuracion/Avisos.jsx:861`

**DECISIÓN:**

---

## 102. Por qué hacen falta plantillas

**Ruta:** `configuracion.whatsapp_plantillas_explicacion`

**Texto de hoy:**
> Meta exige una plantilla pre-aprobada para cualquier mensaje que la prestadora inicia (no una
> respuesta dentro de una conversación ya abierta). Acá se redactan y se hace seguimiento de su
> aprobación.

**Dónde se ve:** Ajustes > Configuración > Mensajes, sub-bloque de plantillas de WhatsApp.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/configuracion/Avisos.jsx:1022`

**DECISIÓN:**

---

## 103. El nombre del permiso de ver el Padrón

**Ruta:** `configuracion.permisos_accion_ver_padron`

**Texto de hoy:**
> Ver el Padrón de la Prestadora

**Dónde se ve:** Ajustes > Configuración > Accesos, como nombre de esa fila de la tabla de
permisos. También en Ajustes > Auditoría, en el detalle de un evento de cambio de permisos.

**Qué lo dispara:** está siempre. La clave se arma sola con el código del permiso.

**Quién lo lee:** la empresa; en Auditoría, también el soporte de CeltaTech.

**Archivo:** `panel/src/pages/configuracion/Accesos.jsx:131` y `panel/src/pages/Auditoria.jsx:121`

**DECISIÓN:**

---

## 104. De dónde salen los valores de los signos vitales

**Ruta:** `configuracion.vitales_explicacion`

**Texto de hoy:**
> Valores de referencia que el sistema propone para cada signo vital, según recomendaciones
> médicas ampliamente aceptadas (ver fuente de cada uno). Son un punto de partida editable — no
> un estándar fijo — y se pueden ajustar para cada Prestadora. También se pueden personalizar
> para un Paciente en particular desde ese Paciente.

**Dónde se ve:** Ajustes > Configuración > El cuidado, bloque de signos vitales.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/configuracion/ElCuidado.jsx:1062`

**DECISIÓN:**

---

## 105. Qué es el informe para Obra Social

**Ruta:** `informesObraSocial.explicacion`

**Texto de hoy:**
> Acá se genera un informe a partir de las Guardias reales de un Paciente. Antes de guardarlo,
> un usuario habilitado de la Prestadora debe validar que está correctamente elaborado —
> recién ahí queda disponible para imprimir, y no se puede editar después.

**Dónde se ve:** Dinero > Informes para Obra Social, debajo del título.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/InformesObraSocial.jsx:328`

**DECISIÓN:**

---

## 106. Este usuario no puede validar informes

**Ruta:** `informesObraSocial.sin_permiso_validar`

**Texto de hoy:**
> La Prestadora no habilitó a este usuario para validar informes. Se puede ver la vista previa,
> pero no guardarla.

**Dónde se ve:** Dinero > Informes para Obra Social, debajo de la vista previa ya generada.

**Qué lo dispara:** quien mira no tiene permiso para validar y guardar.

**Quién lo lee:** alguien de la empresa sin ese permiso.

**Archivo:** `panel/src/pages/InformesObraSocial.jsx:361`

**DECISIÓN:**

---

## 107. Subtítulo de la puesta en marcha

**Ruta:** `puesta_en_marcha.subtitulo`

**Texto de hoy:**
> Falta completar algunos datos para que la Prestadora pueda operar. Cada uno se carga una sola
> vez.

**Dónde se ve:** pantalla de puesta en marcha, debajo del título. No está en el menú: es adonde
desvía la entrada del Panel mientras queden pasos sin completar.

**Qué lo dispara:** hay pasos pendientes.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/PuestaEnMarcha.jsx:35`

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

**Archivo:** `panel/src/components/estado-actual/GuiaPrimerosPasos.jsx:76`

**DECISIÓN:**

---

## 109. Qué pasa si faltan los datos

**Ruta:** `guia_primeros_pasos.paso_datos_consecuencia`

**Texto de hoy:**
> Mientras falten, los mensajes de la Prestadora salen sin un contacto al que responder.

**Dónde se ve:** guía de primeros pasos, línea de advertencia debajo de ese paso.

**Qué lo dispara:** ese paso está pendiente.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/components/estado-actual/GuiaPrimerosPasos.jsx:80`

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

**Archivo:** `panel/src/components/estado-actual/GuiaPrimerosPasos.jsx:80`

**DECISIÓN:**

---

## 111. La entrevista se agenda sin sala

**Ruta:** `postulaciones.entrevista.sin_videollamada`

**Texto de hoy:**
> Esta Prestadora no tiene cargada una dirección de videollamada, así que la entrevista se
> agenda sin sala. Se carga en Configuración > La Prestadora.

**Dónde se ve:** Plantel > Postulaciones > ficha de una postulación, bloque de entrevista.

**Qué lo dispara:** se agenda una entrevista y no hay sala de videollamada cargada.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/components/EntrevistaDePostulacion.jsx:164`

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

**Archivo:** `panel/src/pages/EntrevistaPublica.jsx:96`

**OBSERVACIÓN:** es el único texto de los 168 que ya usa el marcador `{{prestadora}}`.

**DECISIÓN:**

---

## 113. La fecha de la entrevista ya pasó

**Ruta:** `entrevistaPublica.ya_paso_texto`

**Texto de hoy:**
> Si hace falta una fecha nueva, la Prestadora va a avisar por correo.

**Dónde se ve:** pantalla pública de entrevista.

**Qué lo dispara:** el postulante abre el enlace después de que la fecha pasó.

**Quién lo lee:** el postulante. Está afuera de la empresa.

**Archivo:** `panel/src/pages/EntrevistaPublica.jsx:119`

**DECISIÓN:**

---

## 114. La entrevista no tiene sala

**Ruta:** `entrevistaPublica.sin_sala_texto`

**Texto de hoy:**
> La Prestadora se va a comunicar por el medio que le indicó en el correo.

**Dónde se ve:** pantalla pública de entrevista.

**Qué lo dispara:** la entrevista está agendada pero sin sala de videollamada.

**Quién lo lee:** el postulante. Está afuera de la empresa.

**Archivo:** `panel/src/pages/EntrevistaPublica.jsx:108`

**DECISIÓN:**

---

## 115. Qué son las dos modalidades

**Ruta:** `modalidades.ayuda`

**Texto de hoy:**
> En prestación directa la Prestadora le asigna las guardias. En Match las elige el Asistente.
> Se puede marcar una, la otra o las dos, y solo aparecen las que la Prestadora tenga
> habilitadas.

**Dónde se ve:** Plantel > Plantel de Asistentes: en la ventana de alta de un Asistente nuevo y
en la solapa Perfil de su ficha, junto a las casillas de modalidad.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/asistentes/NuevoAsistenteModal.jsx:116` y
`panel/src/pages/asistentes/PerfilTab.jsx:445`

**DECISIÓN:**

---

## 116. Esa modalidad no está habilitada

**Ruta:** `modalidades.error_no_habilitada`

**Texto de hoy:**
> La Prestadora no tiene habilitada la modalidad {modalidad}. Se habilita en Configuración.

**Dónde se ve:** cartel de error al guardar, en el alta de un Asistente y en la solapa Perfil de
su ficha (Plantel > Plantel de Asistentes).

**Qué lo dispara:** se marcó una modalidad que la empresa no tiene contratada.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/lib/modalidades.js:180`

**DECISIÓN:**

---

## 117. Qué hacer con una matrícula sin verificar

**Ruta:** `matricula.que_hacer_sin_verificar`

**Texto de hoy:**
> Alguien de la Prestadora tiene que ver la matrícula y marcarla como verificada.

**Dónde se ve:** en dos lados. Plantel > Plantel de Asistentes > ficha del Asistente > solapa
Matrículas, como detalle del aviso de bloqueo; y Cobertura > Guardias, panel de cobertura, al
intentar asignar un Asistente cuya matrícula está sin verificar.

**Qué lo dispara:** la matrícula está cargada y sin comprobar.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/asistentes/MatriculasTab.jsx:174` y `panel/src/lib/matricula.js:238`

**DECISIÓN:**

---

## 118. Método de verificación: constancia del organismo

**Ruta:** `matricula.metodo_constancia_del_organismo`

**Texto de hoy:**
> El colegio emitió una constancia a nombre de la Prestadora

**Dónde se ve:** Plantel > Plantel de Asistentes > ficha del Asistente > solapa Matrículas. Es
una opción del desplegable «con qué método se verificó», y también lo que muestra la columna de
método de cada matrícula verificada así.

**Qué lo dispara:** está siempre en ese desplegable.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/asistentes/MatriculasTab.jsx:455`, y `:82` para mostrarlo

**DECISIÓN:**

---

## 119. Qué se exige antes de una guardia

**Ruta:** `matricula.modo_explicacion`

**Texto de hoy:**
> Qué exige la Prestadora antes de dejar que un Asistente tome una guardia. La matrícula
> vigente se exige siempre; lo que se elige acá es si además hace falta que alguien la haya
> visto.

**Dónde se ve:** Ajustes > Configuración > Asistentes, bloque de control de matrícula.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/configuracion/TiposAsistenteTab.jsx:164`

**DECISIÓN:**

---

## 120. El modo estricto

**Ruta:** `matricula.modo_estricto`

**Texto de hoy:**
> Estricto: la matrícula tiene que estar verificada por alguien de la Prestadora

**Dónde se ve:** Ajustes > Configuración > Asistentes, bloque de control de matrícula. Es una
opción del desplegable de modo.

**Qué lo dispara:** está siempre en ese desplegable.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/configuracion/TiposAsistenteTab.jsx:191`

**DECISIÓN:**

---

## 121. No se pudo leer el modo configurado

**Ruta:** `matricula.modo_no_se_pudo_leer`

**Texto de hoy:**
> No se pudo leer qué control de matrícula tiene configurado la Prestadora, así que no se
> muestra ninguno y no se puede cambiar hasta poder leerlo.

**Dónde se ve:** Ajustes > Configuración > Asistentes, en lugar del desplegable de modo.

**Qué lo dispara:** falló la consulta del modo configurado.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/configuracion/TiposAsistenteTab.jsx:174`

**DECISIÓN:**

---

## 122. No hay documentos a seguir

**Ruta:** `asistentes.documentos.vencimientos_sin_tipos`

**Texto de hoy:**
> La prestadora todavía no configuró ningún documento a seguir (Configuración > Documentos de
> Asistentes).

**Dónde se ve:** Plantel > Plantel de Asistentes > ficha del Asistente > solapa Perfil, lista de
vencimientos de documentación.

**Qué lo dispara:** no hay tipos de documento configurados.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/asistentes/PerfilTab.jsx:594`

**DECISIÓN:**

---

## 123. Qué es el historial de comunicación

**Ruta:** `asistentes.comunicacion.explicacion`

**Texto de hoy:**
> Historial de mensajes del equipo de la Prestadora sobre este Asistente. No es un chat con el
> Asistente ni con el Cliente.

**Dónde se ve:** Plantel > Plantel de Asistentes > ficha del Asistente > solapa Comunicación, y
el mismo hilo en la bandeja de Comunicación.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/components/comunicacion/HiloComunicacion.jsx:68`

**DECISIÓN:**

---

## 124. Se alcanzó el mínimo de referencias

**Ruta:** `asistentes.verificacion.referencias.alcanza`

**Texto de hoy:**
> Se alcanzó el mínimo de referencias verificadas de esta Prestadora.

**Dónde se ve:** Plantel > Plantel de Asistentes > ficha del Asistente > solapa Verificación,
bloque de referencias laborales.

**Qué lo dispara:** ya se llegó al mínimo exigido.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/asistentes/ReferenciasLaborales.jsx:102`

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

**Archivo:** `panel/src/pages/asistentes/ReferenciasLaborales.jsx:105`

**DECISIÓN:**

---

## 126. De dónde sale el costo mensual

**Ruta:** `asistentes.simulador.costo_mensual_explicacion`

**Texto de hoy:**
> Sale del catálogo de conceptos de la Prestadora y de las escalas legales vigentes hoy. Es lo
> que sale de la Prestadora: lo que se le descuenta a la persona se paga igual, sólo que a
> otro, así que no se resta.

**Dónde se ve:** Plantel > Plantel de Asistentes > ficha del Asistente > solapa del simulador de
vínculo, junto al costo mensual calculado.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/asistentes/SimuladorVinculoTab.jsx:196`

**DECISIÓN:**

---

## 127. No hay conceptos de liquidación cargados

**Ruta:** `asistentes.simulador.sin_conceptos`

**Texto de hoy:**
> La Prestadora todavía no cargó ningún concepto de liquidación, así que la comparación muestra
> sólo la remuneración.

**Dónde se ve:** la misma solapa del simulador de vínculo.

**Qué lo dispara:** el catálogo de conceptos de liquidación está vacío.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/asistentes/SimuladorVinculoTab.jsx:236`

**DECISIÓN:**

---

## 128. Indicador: exclusividad de facturación

**Ruta:** `asistentes.score.indicadores.exclusividad_facturacion`

**Texto de hoy:**
> Exclusividad de facturación a la prestadora

**Dónde se ve:** Plantel > Plantel de Asistentes > ficha del Asistente > solapa del score de
riesgo, en la lista de indicadores y en la etiqueta de su casilla.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/asistentes/ScoreRiesgoTab.jsx:107` y `:121`

**DECISIÓN:**

---

## 129. Indicador: herramientas provistas

**Ruta:** `asistentes.score.indicadores.herramientas_provistas`

**Texto de hoy:**
> Herramientas/uniforme provisto por la prestadora

**Dónde se ve:** la misma solapa del score de riesgo, en la lista y en su casilla.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/asistentes/ScoreRiesgoTab.jsx:107` y `:121`

**DECISIÓN:**

---

## 130. Qué es el Padrón

**Ruta:** `padron.explicacion`

**Texto de hoy:**
> Todas las personas y entidades con las que la Prestadora tiene algo que ver: quien contrata,
> quien paga, quien recibe el cuidado y su propia gente. Una persona, un Legajo, aunque con el
> tiempo le toquen varios roles.

**Dónde se ve:** Clientes > Padrón, debajo del título.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/Padron.jsx:153`

**DECISIÓN:**

---

## 131. No hay catálogo de documentación

**Ruta:** `clientes.pagador.papeles_sin_catalogo`

**Texto de hoy:**
> Esta Prestadora todavía no cargó qué documentación pide. Se configura en Configuración.

**Dónde se ve:** Clientes > Clientes > ficha del Cliente, bloque del estado del Pagador, donde
irían los papeles exigidos.

**Qué lo dispara:** el catálogo de documentación está vacío.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/clientes/EstadoDelPagador.jsx:211`

**DECISIÓN:**

---

## 132. Esta función no se ofrece

**Ruta:** `clientes.personas autorizadas.accesos_topado`

**Texto de hoy:**
> Esta Prestadora no ofrece esta función en su aplicación, así que no hay nada que dar. No es
> una decisión del titular.

**Dónde se ve:** en ninguna parte.

**Quién lo lee:** nadie.

**Archivo:** —

**OBSERVACIÓN:** la clave existe en las traducciones y no la usa ninguna pantalla.

**DECISIÓN:**

---

## 133. El autor de un mensaje saliente

**Ruta:** `comunicacion.autor_prestadora`

**Texto de hoy:**
> Prestadora

**Dónde se ve:** Comunicación —enlace suelto arriba del menú—, hilo de WhatsApp. Es la etiqueta
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
> WhatsApp.

**Dónde se ve:** Comunicación, hilo de WhatsApp.

**Qué lo dispara:** se intenta mandar un mensaje sin WhatsApp configurado.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/components/comunicacion/HiloWhatsapp.jsx:95`

**DECISIÓN:**

---

## 135. Origen de una respuesta preparada

**Ruta:** `respuestas_preparadas.origen_prestadora`

**Texto de hoy:**
> Cargada por la Prestadora

**Dónde se ve:** Ajustes > Respuestas preparadas, columna de origen de la tabla.

**Qué lo dispara:** esa respuesta la escribió la empresa, no la sugirió la IA.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/RespuestasPreparadas.jsx:262`

**DECISIÓN:**

---

## 136. Quién canceló: la empresa

**Ruta:** `guardias.detalle.cancelacion_origen_prestadora`

**Texto de hoy:**
> Prestadora

**Dónde se ve:** Cobertura > Guardias. Es una opción del desplegable «quién cancela», tanto al
cancelar una guardia desde su detalle como al cancelar varias con la barra de acciones masivas.

**Qué lo dispara:** está siempre en ese desplegable.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/guardias/GuardiaAcciones.jsx:493` y
`panel/src/pages/guardias/BarraAccionesMasivas.jsx:321`

**DECISIÓN:**

---

## 137. Qué hacer con un pedido de código

**Ruta:** `pase_de_guardia.pedidos_explicacion`

**Texto de hoy:**
> El Asistente llegó al domicilio y no tiene a quién pedirle el código. Averigüe como su
> Prestadora acostumbre —un llamado a la casa, una videollamada, lo que corresponda— y recién
> entonces suelte el código.

**Dónde se ve:** Cumplimiento > Pase de guardia, bloque de pedidos de código pendientes.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/PaseDeGuardia.jsx:149`

**DECISIÓN:**

---

## 138. Motivo registrado: no le contestaron

**Ruta:** `pase_de_guardia.motivo_prestadora_no_responde`

**Texto de hoy:**
> Pidió el código a la Prestadora y no le contestaron

**Dónde se ve:** Cumplimiento > Pase de guardia, historial de ingresos. Es el motivo que muestra
la fila.

**Qué lo dispara:** el Asistente entró eligiendo esa razón.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/PaseDeGuardia.jsx:235`

**DECISIÓN:**

---

## 139. Qué muestra Saldos pendientes

**Ruta:** `facturacion.explicacion`

**Texto de hoy:**
> Muestra, período a período, cuánto se le reclama a cada Cliente, cuánto entró y cuánto queda
> debiendo. Lo que se manda a facturar se arma con las Prestaciones vigentes de sus Pacientes;
> el comprobante lo emite el software de facturación de la Prestadora.

**Dónde se ve:** Dinero > Saldos pendientes, debajo del título.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/Facturacion.jsx:309`

**DECISIÓN:**

---

## 140. De dónde sale cada número del saldo

**Ruta:** `facturacion.aviso_texto`

**Texto de hoy:**
> Lo que se reclama menos lo cobrado. Lo que se reclama es lo que informó el software de
> facturación de la Prestadora, más y menos las correcciones que se hayan anotado; mientras no
> se anote ningún comprobante, es lo que se mandó a facturar. Admite cobros parciales, y los
> cobros pueden anotarse acá o entrar desde afuera: un archivo importado, el sistema contable
> de la Prestadora, una pasarela de pago. Como un número puede venir de otro sistema, al lado
> de cada saldo dice de dónde salió y de cuándo es. {{producto}} no emite comprobantes fiscales
> y no decide nada: si a un Cliente se le sigue prestando el Servicio, lo resuelve una
> persona.

**Dónde se ve:** Dinero > Saldos pendientes, cartel de aviso debajo de la explicación, encima de
la tabla.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/Facturacion.jsx:312`

**DECISIÓN:**

---

## 141. El estado de cuenta está reservado

**Ruta:** `facturacion.estado_de_cuenta_reservado`

**Texto de hoy:**
> El estado de cuenta de los Clientes lo ve la administración de la Prestadora. Si necesita
> verlo, pídale que le habilite esa acción en Configuración.

**Dónde se ve:** Dinero > Saldos pendientes, en lugar del estado de cuenta.

**Qué lo dispara:** quien mira no tiene ese permiso — por ejemplo, un Coordinador.

**Quién lo lee:** alguien de la empresa sin ese permiso.

**Archivo:** `panel/src/pages/Facturacion.jsx:325` y `:450`

**DECISIÓN:**

---

## 142. Qué muestra Pagos a Asistentes

**Ruta:** `pagos_asistentes.explicacion`

**Texto de hoy:**
> Lo que la Prestadora le liquida a cada Asistente por mes: las horas de sus guardias cerradas,
> el valor hora o el sueldo básico que tiene cargado, y las sumas y las restas del catálogo de
> conceptos.

**Dónde se ve:** Dinero > Pagos a Asistentes, debajo del título.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/PagosAsistentes.jsx:134`

**DECISIÓN:**

---

## 143. Liquidar y pagar es de administración

**Ruta:** `pagos_asistentes.solo_administracion`

**Texto de hoy:**
> Generar liquidaciones y registrar pagos es tarea de la administración de la Prestadora.

**Dónde se ve:** Dinero > Pagos a Asistentes, donde irían los botones de generar liquidación y
registrar pago.

**Qué lo dispara:** quien mira no es de administración.

**Quién lo lee:** alguien de la empresa que no es de administración.

**Archivo:** `panel/src/pages/PagosAsistentes.jsx:249`

**DECISIÓN:**

---

## 144. De dónde sale el valor de un concepto

**Ruta:** `pagos_asistentes.origen_propio`

**Texto de hoy:**
> Valor propio de la Prestadora

**Dónde se ve:** Dinero > Pagos a Asistentes, catálogo de conceptos de liquidación. Es una
opción del desplegable «de dónde sale el valor»; la otra es la escala legal.

**Qué lo dispara:** está siempre en ese desplegable.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/PagosAsistentes.jsx:834`

**DECISIÓN:**

---

## 145. Qué es la Lista de Precios

**Ruta:** `lista_precios.explicacion`

**Texto de hoy:**
> Referencia interna de uso del equipo de la prestadora. Nunca se muestra a Clientes ni en
> ningún medio público — cada Prestación particular parte de este valor y se ajusta a mano
> según lo que se acuerde con cada Cliente.

**Dónde se ve:** Dinero > Lista de Precios, debajo del título.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/ListaPrecios.jsx:34`

**DECISIÓN:**

---

## 146. En qué Prestadora se crea la cuenta

**Ruta:** `usuarios_panel.aviso_organizacion_activa`

**Texto de hoy:**
> La cuenta se crea en la Prestadora en la que se está trabajando ahora. Para crear una cuenta
> de otra Prestadora, hace falta entrar primero con una sesión de soporte técnico.

**Dónde se ve:** Ajustes > Usuarios del Panel, dentro del formulario de alta.

**Qué lo dispara:** está siempre en ese formulario.

**Quién lo lee:** la empresa, y el soporte de CeltaTech.

**Archivo:** `panel/src/pages/UsuariosPanel.jsx:209`

**DECISIÓN:**

---

## 147. El título de la pantalla de Prestadoras

**Ruta:** `prestadoras.titulo`

**Texto de hoy:**
> Prestadoras

**Dónde se ve:** Ajustes > Prestadoras. Es el título de la pantalla.

**Qué lo dispara:** está siempre, y sólo para el Superadmin.

**Quién lo lee:** el soporte técnico de CeltaTech.

**Archivo:** `panel/src/pages/Prestadoras.jsx:204`

**DECISIÓN:**

---

## 148. El tope de correo es común a todas

**Ruta:** `prestadoras.correos_explicacion`

**Texto de hoy:**
> El correo de todas las Prestadoras sale por un mismo servicio, con un tope por día y por mes.
> Pasado ese tope, los mensajes no salen.

**Dónde se ve:** Ajustes > Prestadoras, bloque de consumo de correo.

**Qué lo dispara:** está siempre.

**Quién lo lee:** el soporte técnico de CeltaTech.

**Archivo:** `panel/src/pages/Prestadoras.jsx:75`

**DECISIÓN:**

---

## 149. El botón de cerrar la sesión de soporte

**Ruta:** `prestadoras.salir`

**Texto de hoy:**
> Salir de la prestadora

**Dónde se ve:** franja de sesión de soporte, arriba de todas las pantallas del Panel.

**Qué lo dispara:** hay una sesión de soporte abierta.

**Quién lo lee:** el soporte técnico de CeltaTech.

**Archivo:** `panel/src/components/layout/Layout.jsx:69`

**DECISIÓN:**

---

## 150. La franja dice que hay sesión abierta

**Ruta:** `prestadoras.sesion_activa_titulo`

**Texto de hoy:**
> Sesión abierta en esta prestadora

**Dónde se ve:** la misma franja de sesión de soporte, arriba de cualquier pantalla. Es el texto
en negrita.

**Qué lo dispara:** hay sesión abierta y todavía no está por vencer.

**Quién lo lee:** el soporte técnico de CeltaTech.

**Archivo:** `panel/src/components/layout/Layout.jsx:52`

**DECISIÓN:**

---

## 151. Advertencia antes de una acción destructiva

**Ruta:** `prestadoras.confirmar_advertencia_tenant`

**Texto de hoy:**
> La sesión está abierta en {prestadora}, no en la prestadora propia.

**Dónde se ve:** se antepone al texto de cualquier confirmación de acción destructiva, en
cualquier pantalla.

**Qué lo dispara:** se aprieta borrar, anular, cancelar o similar con una sesión de soporte
abierta sobre otra empresa.

**Quién lo lee:** el soporte técnico de CeltaTech.

**Archivo:** `panel/src/context/TenantSessionContext.jsx:147`

**DECISIÓN:**

---

## 152. El título del formulario de alta

**Ruta:** `prestadoras.alta_titulo`

**Texto de hoy:**
> Dar de alta una Prestadora

**Dónde se ve:** Ajustes > Prestadoras, título del formulario una vez abierto.

**Qué lo dispara:** el formulario está abierto.

**Quién lo lee:** el soporte técnico de CeltaTech.

**Archivo:** `panel/src/pages/Prestadoras.jsx:217`

**DECISIÓN:**

---

## 153. El botón que abre el alta

**Ruta:** `prestadoras.alta_abrir`

**Texto de hoy:**
> Dar de alta una Prestadora

**Dónde se ve:** Ajustes > Prestadoras. Es el botón.

**Qué lo dispara:** está siempre.

**Quién lo lee:** el soporte técnico de CeltaTech.

**Archivo:** `panel/src/pages/Prestadoras.jsx:211`

**DECISIÓN:**

---

## 154. El alta salió bien

**Ruta:** `prestadoras.alta_lista`

**Texto de hoy:**
> {prestadora} quedó dada de alta.

**Dónde se ve:** Ajustes > Prestadoras, cartel verde después de guardar.

**Qué lo dispara:** el alta salió bien.

**Quién lo lee:** el soporte técnico de CeltaTech.

**Archivo:** `panel/src/pages/Prestadoras.jsx:176`

**DECISIÓN:**

---

## 155. El alta salió, pero sin casilla de respuestas

**Ruta:** `prestadoras.alta_sin_casilla`

**Texto de hoy:**
> {prestadora} quedó dada de alta, pero la casilla de respuestas no se pudo guardar. Se carga
> desde Configuración, entrando a esa Prestadora.

**Dónde se ve:** Ajustes > Prestadoras, el mismo cartel en amarillo.

**Qué lo dispara:** la casilla de respuestas no se pudo grabar.

**Quién lo lee:** el soporte técnico de CeltaTech.

**Archivo:** `panel/src/pages/Prestadoras.jsx:176`

**DECISIÓN:**

---

## 156. Quién es el administrador que se carga en el alta

**Ruta:** `prestadoras.alta_administrador_explicacion`

**Texto de hoy:**
> Esta persona entra al Panel a completar la configuración de la Prestadora. Su cuenta se crea
> junto con ella, y recibe un correo para elegir su contraseña: acá no se escribe ninguna.

**Dónde se ve:** Ajustes > Prestadoras, formulario de alta, encabezando el bloque de datos del
administrador.

**Qué lo dispara:** está siempre en ese formulario.

**Quién lo lee:** el soporte técnico de CeltaTech.

**Archivo:** `panel/src/pages/Prestadoras.jsx:270`

**DECISIÓN:**

---

## 157. Hasta dónde llega la Auditoría

**Ruta:** `auditoria.alcance_superadmin`

**Texto de hoy:**
> Esta pantalla llega a una sola Organización por vez: aquella sobre la que hay una sesión de
> soporte técnico abierta y, si no hay ninguna, la Organización de pruebas. Para ver el
> registro de otra Prestadora hay que abrir la sesión de soporte sobre ella.

**Dónde se ve:** Ajustes > Auditoría, debajo del título.

**Qué lo dispara:** quien mira es Superadmin.

**Quién lo lee:** el soporte técnico de CeltaTech.

**Archivo:** `panel/src/pages/Auditoria.jsx:137`

**DECISIÓN:**

---

## 158. La ayuda de la lista vacía de Auditoría

**Ruta:** `auditoria.vacio_sin_sesion_ayuda`

**Texto de hoy:**
> Sin una sesión abierta, esta pantalla alcanza únicamente la Organización de pruebas. Para ver
> el registro de una Prestadora hay que abrir la sesión de soporte sobre ella, desde la
> pantalla de Prestadoras.

**Dónde se ve:** Ajustes > Auditoría, acompañando la lista vacía.

**Qué lo dispara:** no hay ninguna sesión de soporte abierta.

**Quién lo lee:** el soporte técnico de CeltaTech.

**Archivo:** `panel/src/pages/Auditoria.jsx:145`

**DECISIÓN:**

---

## 159. El encabezado de la columna

**Ruta:** `auditoria.col_prestadora`

**Texto de hoy:**
> Prestadora

**Dónde se ve:** Ajustes > Auditoría, encabezado de esa columna en la tabla de eventos.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa, y el soporte de CeltaTech.

**Archivo:** `panel/src/pages/Auditoria.jsx:152`

**DECISIÓN:**

---

## 160. Evento: entró

**Ruta:** `auditoria.evento_login`

**Texto de hoy:**
> Entró a la prestadora

**Dónde se ve:** Ajustes > Auditoría, en la fila del evento.

**Qué lo dispara:** lo registrado es la apertura de una sesión de soporte.

**Quién lo lee:** la empresa, y el soporte de CeltaTech.

**Archivo:** `panel/src/pages/Auditoria.jsx:80`

**DECISIÓN:**

---

## 161. Evento: salió

**Ruta:** `auditoria.evento_logout_manual`

**Texto de hoy:**
> Salió de la prestadora

**Dónde se ve:** Ajustes > Auditoría, en la fila del evento.

**Qué lo dispara:** la sesión se cerró a mano, no por tope ni por inactividad.

**Quién lo lee:** la empresa, y el soporte de CeltaTech.

**Archivo:** `panel/src/pages/Auditoria.jsx:86`

**DECISIÓN:**

---

## 162. Evento: cambió los permisos

**Ruta:** `auditoria.accion_cambio_de_permisos_de_la_prestadora`

**Texto de hoy:**
> Cambió los permisos de la Prestadora

**Dónde se ve:** Ajustes > Auditoría, nombre de la acción en la fila.

**Qué lo dispara:** lo auditado es un cambio en Configuración > Accesos.

**Quién lo lee:** la empresa, y el soporte de CeltaTech.

**Archivo:** `panel/src/pages/Auditoria.jsx:102`

**DECISIÓN:**

---

## 163. Evento: cambió la moneda

**Ruta:** `auditoria.accion_cambio_de_moneda`

**Texto de hoy:**
> Cambió la moneda de la Prestadora

**Dónde se ve:** Ajustes > Auditoría, nombre de la acción en la fila.

**Qué lo dispara:** lo auditado es un cambio de moneda hecho en Configuración > La Prestadora.

**Quién lo lee:** la empresa, y el soporte de CeltaTech.

**Archivo:** `panel/src/pages/Auditoria.jsx:102`

**DECISIÓN:**

---

## 164. Qué es el Contenido para Clientes

**Ruta:** `contenidos.explicacion`

**Texto de hoy:**
> La biblioteca que esta Prestadora escribe para quien cuida en su casa: un título, un texto y,
> si ya publica material en otro lado, un enlace. El Cliente lo ve en su aplicación recién
> cuando está publicado.

**Dónde se ve:** Clientes > Contenido para Clientes, debajo del título.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/contenidos/ContenidoParaClientes.jsx:57`

**DECISIÓN:**

---

## 165. Qué son las calificaciones

**Ruta:** `match.calificaciones_explicacion`

**Texto de hoy:**
> Calificaciones que los Clientes dejaron sobre los Asistentes de la Prestadora. Se puede
> ocultar una calificación puntual del perfil público, nunca editar su contenido ni el descargo
> del Asistente.

**Dónde se ve:** Plantel > Calificaciones y descargos, debajo del título. Sólo con la modalidad
Match.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/match/Calificaciones.jsx:70`

**DECISIÓN:**

---

## 166. Las funciones con riesgo las enciende la empresa

**Ruta:** `match.funciones_riesgo_explicacion`

**Texto de hoy:**
> Estas funciones se pueden encender: la decisión es de la Prestadora. Al encender una, si el
> país de la Prestadora tiene documento legal escrito, la advertencia se muestra antes de
> confirmar y queda registrada más abajo.

**Dónde se ve:** Ajustes > Auditoría legal de Match, encabezando el bloque de funciones con
riesgo. Sólo con la modalidad Match.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/match/AuditoriaLegal.jsx:118`

**DECISIÓN:**

---

## 167. Encenderlas es de administración

**Ruta:** `match.funciones_riesgo_solo_lectura`

**Texto de hoy:**
> Encender o apagar estas funciones es de la administración de la Prestadora.

**Dónde se ve:** Ajustes > Auditoría legal de Match, debajo del párrafo anterior.

**Qué lo dispara:** quien mira no es Admin, así que sólo puede mirar.

**Quién lo lee:** alguien de la empresa que no es su Administrador.

**Archivo:** `panel/src/pages/match/AuditoriaLegal.jsx:119`

**DECISIÓN:**

---

## 168. Qué son las formas de cobro

**Ruta:** `match.formas_explicacion`

**Texto de hoy:**
> Con qué números le cobra esta Prestadora a sus Clientes. Cada forma se arma combinando las
> piezas: un importe, cada cuánto se cobra, cuántos días van gratis y cuántos contactos
> incluye. Las decide la Prestadora: nadie las sugiere.

**Dónde se ve:** Dinero > Formas de cobro de Match, debajo del título. Sólo con la modalidad
Match, y sólo Admin.

**Qué lo dispara:** está siempre.

**Quién lo lee:** la empresa.

**Archivo:** `panel/src/pages/match/FormasDeCobro.jsx:74`

**DECISIÓN:**
