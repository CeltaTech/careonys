# Textos para el manual del usuario

Material para el manual del usuario, los tutoriales y la capacitación de quien empieza a operar el
Panel en cada Prestadora: qué es cada cosa, para qué sirve y cómo se usa. **En el Panel no se
muestran** (`..\..\CLAUDE.md`, «Ningún casillero lleva una explicación debajo»).

Son borradores. Salen del diseño «Careonys v2», donde estaban como líneas de ayuda, y se copian tal
cual. La redacción final la aprueba el Desarrollador cuando se escriba el manual. La columna «En el
Panel» dice si el tema existe en el Panel y, cuando lleva otro nombre, cuál.

## Secciones del Panel

| Sección | Texto | En el Panel |
|---|---|---|
| Servicios | Un servicio agrupa una o varias prestaciones para un paciente y su Pagador. | Existe |
| Guardias | Programación de la semana, asignaciones y reemplazos. La medición está en Reportes. | Existe |
| Guardias, vista por Asistente | Vista de carga horaria: muestra qué hace cada asistente en la semana. Los turnos se crean y se editan en la vista por servicio. | Existe, como «Por Asistente» |
| Asistentes | Reclutamiento, cualificación, documentación, disponibilidad y asignaciones. | Existe, como «Padrón de Asistentes» |
| Clientes | Quien contrata y paga el servicio: los familiares del paciente o un Pagador. | Existe, como «Directorio de Clientes» |
| Clientes, Contratación directa | Los familiares del paciente contratan y pagan el servicio directamente. | No existe |
| Clientes, Pagadores | Obra social, prepaga o empresa que contrata y paga el servicio de sus afiliados. | No existe |
| Empresas tercerizadas | Proveedores que ejecutan prestaciones y administran su propio personal. | No existe |
| Facturación y pagos | Se cobra al cliente o al Pagador por las horas prestadas, y se liquida a cada asistente por las que trabajó. | Existe, como «Saldos pendientes» y «Pagos a Asistentes» |
| Facturación y pagos, Cobranza | Las horas se cuentan de la programación de la semana, sin las que quedaron sin cubrir. | No existe |
| Facturación y pagos, Liquidación | Se liquidan sólo las horas con entrada y salida cerradas. Las guardias programadas o en curso se suman al cerrarse. | Existe, como «Liquidaciones» |
| Facturación y pagos, A liquidar | Sobre horas con fichaje cerrado | No existe |
| Comunicaciones | Lo que ocurre y lo que queda pendiente: lo detecta el sistema, lo informan las aplicaciones o llega por WhatsApp o correo. | Existe, como «Comunicación» |
| Capacitación | Catálogo de cursos, inscripción de los Asistentes del Padrón, dictado y contenido. | No existe |
| Tareas pendientes | Seguimiento de lo que quedó pendiente de resolución | No existe |
| Reclutamiento | El proceso avanza en forma automática. La coordinación interviene sólo ante alarma o excepción. | Existe, como «Postulaciones» |
| Reportes | Indicadores de operación, presentismo, cumplimiento y facturación. | No existe |
| Reportes, Presentismo | Fichajes con escaneo y ubicación válidos. | No existe |
| Reportes, Empresas | Comparación del trimestre, para decidir a quién derivar las próximas prestaciones. | No existe |
| Configuración | Funciones habilitadas, parámetros de automatización y usuarios del panel. | Existe |
| Configuración, Parámetros | Tiempos que definen cuándo el sistema actúa sin esperar a la coordinación. | No existe |
| Configuración, WhatsApp | Número de la prestadora conectado a la plataforma de WhatsApp Business. | Existe, como «Conexión de WhatsApp» |
| Configuración, Plantillas | Pasadas 24 horas desde el último mensaje de la persona, sólo se pueden enviar plantillas aprobadas. Toda plantilla nueva requiere aprobación de Meta. | Existe, como «Plantillas de mensaje» |
| Configuración, Usuarios | Sólo la administración general puede crear usuarios y asignar permisos. | Existe, como «Usuarios del Panel» |

## Opciones de Configuración

| Opción | Texto | En el Panel |
|---|---|---|
| Escaneo de código entre aplicaciones | El asistente escanea la aplicación del cliente o del compañero al que releva. | No existe |
| Geolocalización en el fichaje | Se registra la posición al abrir y cerrar la guardia. | No existe |
| Permitir fichaje manual | Habilita cerrar una guardia sin escaneo. Cada caso queda contado como excepción en Verificación de presentismo. | No existe |
| Seguimiento del trayecto | Calcula el tiempo de llegada y avisa al cliente si hay demora. | No existe |
| Conformidad del cliente | Al cerrar la guardia, el cliente expresa su conformidad desde su propia aplicación. Nunca se le pide en el teléfono de la asistente. | No existe |
| Informes visibles para el cliente | Publica los reportes diarios en la aplicación del cliente. | No existe |
| Capacitación obligatoria | Con esta opción activa, quien tenga un curso obligatorio vencido o sin aprobar no puede recibir turnos ni aparecer como candidata. | No existe |
| Transporte alternativo | Sugiere otro medio de transporte si el habitual falla. | No existe |
| Espera antes de confirmar suplente | Si el titular no responde en este plazo, el suplente queda firme. | No existe |
| Umbral de alarma por demora | Minutos de retraso estimado que disparan el aviso al cliente. | No existe |
| Aviso previo al vencimiento | Con cuánta antelación se avisa por documentación por vencer. | Existe, como «Preaviso de vencimiento» |
| Cierre de sesión por inactividad | Tiempo sin actividad tras el cual se cierra la sesión del panel. | Existe, como «Minutos sin actividad» |
| WhatsApp, Número conectado | Número verificado de la prestadora ante Meta. | Existe, como «Número de teléfono» |
| WhatsApp, Estado de la conexión | Última comprobación del webhook de mensajes entrantes. | No existe |
| WhatsApp, Calidad del número | La califica Meta según los reportes de los destinatarios. | No existe |
| WhatsApp, Contactos sin consentimiento | Sin su autorización no se puede iniciar una conversación. | No existe |
| Cálculo de candidatos, Que venga quien ya conoce al Paciente | Haber atendido antes a esa persona pesa más que cualquier otra comodidad de la agenda. Es como viene de fábrica. | Existe |
| Cálculo de candidatos, Que nadie quede al límite | Llegar sin haber descansado lo suficiente o con la semana casi llena resta mucho más, y la continuidad deja de tapar al resto. | Existe |
| Cálculo de candidatos, Que el viaje sea corto | Vivir cerca del domicilio pesa bastante más. La distancia se mide en línea recta, así que es una ayuda para ordenar, no un veredicto. | Existe |

## Otras pantallas del Panel

| Pantalla | Texto | En el Panel |
|---|---|---|
| Primeros pasos, Empezar desde una planilla | Si esta información ya está en una planilla, se puede leer acá y el sistema propone la configuración inicial a partir de ella. No se crea nada hasta confirmarlo. | Existe |
| Postulaciones, Cerrar la entrevista | Cerrarla deja constancia de que ya pasó. No cambia el estado de la postulación: eso se decide aparte. | No existe |
| Asistentes, Datos bancarios | Los informa el Asistente desde su aplicación. | Existe |
| Asistentes, Simulador, Cobertura de sus ausencias | La cobertura no es una estimación: es lo que ya se pagó para reemplazar a esta persona en los últimos {meses} meses, repartido por mes. Sale igual bajo los dos vínculos, porque se le paga a quien la reemplazó. | No existe |

## Entrada al Panel

- Ninguna guardia debería quedar sin cubrir.
- El sistema anticipa la demora, convoca al suplente y verifica el presentismo en el domicilio. La coordinación interviene sólo cuando hace falta.
- Ingrese con los datos de acceso asignados por la administración.
- Acceso restringido al personal autorizado. Toda actividad queda registrada.
