# Informe de la ejecución del plan hasta producción

Este informe dice qué se hizo en cada paso del plan, y por qué no se hizo el resto. Los pasos
terminados ya no están en el plan. Los que quedan dicen qué esperan. Cada paso que se termine se
agrega acá, hasta que el plan quede vacío.

Se hicieron todos los pasos que no esperaban una decisión suya ni algo de afuera, salvo los que
necesitaban una pantalla nueva. Ninguna pantalla nueva salió.

## Lo que se hizo

**Paso 13, la clave de cada Prestadora para los datos de otros servicios.** Las contraseñas que
una Prestadora carga para conectar otros servicios, como WhatsApp o su software de facturación,
ya no se guardan en la caja de Supabase. Ahora se guardan cifradas con una clave propia de cada
Prestadora. Una Prestadora no puede leer las de otra, aunque alguien se equivoque al escribir una
consulta. En la base en la nube no había ninguna cargada, así que no hubo nada que mudar.
Falta que usted genere y cargue la clave de cada Prestadora en Railway.

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
manda datos de producción a entrenar un modelo. Queda en el plan su decisión: si la inteligencia
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

## Cómo se comprobó

Pasaron las 2449 pruebas del backend y las 884 del Panel. La prueba que lee cada tabla con cada
cuenta de las Prestadoras de demostración pasó: ninguna ve datos de otra. La base reconstruida
desde cero coincide con el esquema escrito. Las 6 migraciones nuevas están aplicadas en la base en
la nube.

No se corrieron las tres comprobaciones que entran con la contraseña de las Prestadoras de
demostración, porque esa contraseña la tiene usted.

## Lo que le toca a usted

- Generar y cargar en Railway la clave de cada Prestadora para los datos de otros servicios.
- Cargar en Railway la clave de firma de CeltaTech.
- Agregar el código de la Prestadora al modelo comercial de CeltaTech.
- Decidir dónde se guardan en Railway las contraseñas de las cuentas automáticas de una
  Prestadora nueva.
- La herramienta de CeltaTech que entrega la contraseña del Administrador de una Prestadora nueva.
- Lo que tiene contratado cada Prestadora y la región de cada país.
- Aprobar las 44 fichas de redacción.
- Decidir si se sacan los 5 grupos de datos personales que nadie usa.
- Decidir si la inteligencia artificial puntúa Asistentes.
- Revisar si las llaves de los dos depósitos de respaldo tienen permiso de borrar.
- Autorizar las pantallas de seguridad de la cuenta en las dos aplicaciones.
- Autorizar los botones de compra y de baja del acceso de Match en la aplicación del Cliente.

## Los pasos que no se hicieron

**Esperan una decisión suya.** Son 69 pasos. Cada uno dice en el plan qué pregunta espera.

**Dependen de un paso suyo o de algo de afuera.** Son 36. Por ejemplo, los contratos con los
proveedores esperan que CeltaTech esté constituida, y el registro de accesos holandés espera un
Cliente en Países Bajos.

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
- Paso 121, la revisión del registro de accesos.
- Paso 123, los derechos de la persona sobre sus datos.
- Paso 124, el registro de las brechas de seguridad.
- Paso 125, el segundo paso de verificación obligatorio y el cierre por inactividad.

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
