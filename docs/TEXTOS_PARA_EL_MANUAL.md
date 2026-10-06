# Textos para el manual del usuario

Material para el manual del usuario, los tutoriales y la capacitación de quien empieza a operar el
Panel en cada Prestadora: qué es cada cosa, para qué sirve y cómo se usa. **En el Panel no se
muestran** (`..\..\CLAUDE.md`, «Ningún casillero lleva una explicación debajo»).

Son borradores. Salen del diseño «Careonys v2», donde estaban como líneas de ayuda, y se copian tal
cual. La redacción final la aprueba el Desarrollador cuando se escriba el manual.

## Secciones del Panel

| Sección | Texto |
|---|---|
| Servicios | Un servicio agrupa una o varias prestaciones para un paciente y su financiador. |
| Guardias | Programación de la semana, asignaciones y reemplazos. La medición está en Reportes. |
| Guardias, vista por Asistente | Vista de carga horaria: muestra qué hace cada asistente en la semana. Los turnos se crean y se editan en la vista por servicio. |
| Asistentes | Reclutamiento, cualificación, documentación, disponibilidad y asignaciones. |
| Clientes | Quien contrata y paga el servicio: los familiares del paciente o un financiador. |
| Clientes, Contratación directa | Los familiares del paciente contratan y pagan el servicio directamente. |
| Clientes, Financiadores | Obra social, prepaga o empresa que contrata y paga el servicio de sus afiliados. |
| Empresas tercerizadas | Proveedores que ejecutan prestaciones y administran su propio personal. |
| Facturación y pagos | Se cobra al cliente o al financiador por las horas prestadas, y se liquida a cada asistente por las que trabajó. |
| Facturación y pagos, Cobranza | Las horas se cuentan de la programación de la semana, sin las que quedaron sin cubrir. |
| Facturación y pagos, Liquidación | Se liquidan sólo las horas con entrada y salida cerradas. Las guardias programadas o en curso se suman al cerrarse. |
| Facturación y pagos, A liquidar | Sobre horas con fichaje cerrado |
| Comunicaciones | Lo que ocurre y lo que queda pendiente: lo detecta el sistema, lo informan las aplicaciones o llega por WhatsApp o correo. |
| Capacitación | Catálogo de cursos, inscripción del plantel, dictado y contenido. |
| Tareas pendientes | Seguimiento de lo que quedó pendiente de resolución |
| Reclutamiento | El proceso avanza en forma automática. La coordinación interviene sólo ante alarma o excepción. |
| Reportes | Indicadores de operación, presentismo, cumplimiento y facturación. |
| Reportes, Presentismo | Fichajes con escaneo y ubicación válidos. |
| Reportes, Empresas | Comparación del trimestre, para decidir a quién derivar las próximas prestaciones. |
| Configuración | Funciones habilitadas, parámetros de automatización y usuarios del panel. |
| Configuración, Parámetros | Tiempos que definen cuándo el sistema actúa sin esperar a la coordinación. |
| Configuración, WhatsApp | Número de la prestadora conectado a la plataforma de WhatsApp Business. |
| Configuración, Plantillas | Pasadas 24 horas desde el último mensaje de la persona, sólo se pueden enviar plantillas aprobadas. Toda plantilla nueva requiere aprobación de Meta. |
| Configuración, Usuarios | Sólo la administración general puede crear usuarios y asignar permisos. |

## Opciones de Configuración

| Opción | Texto |
|---|---|
| Escaneo de código entre aplicaciones | El asistente escanea la aplicación del cliente o del compañero al que releva. |
| Geolocalización en el fichaje | Se registra la posición al abrir y cerrar la guardia. |
| Permitir fichaje manual | Habilita cerrar una guardia sin escaneo. Cada caso queda contado como excepción en Verificación de presentismo. |
| Seguimiento del trayecto | Calcula el tiempo de llegada y avisa al cliente si hay demora. |
| Conformidad del cliente | Al cerrar la guardia, el cliente expresa su conformidad desde su propia aplicación. Nunca se le pide en el teléfono de la asistente. |
| Informes visibles para el cliente | Publica los reportes diarios en la aplicación del cliente. |
| Capacitación obligatoria | Con esta opción activa, quien tenga un curso obligatorio vencido o sin aprobar no puede recibir turnos ni aparecer como candidata. |
| Transporte alternativo | Sugiere otro medio de transporte si el habitual falla. |
| Espera antes de confirmar suplente | Si el titular no responde en este plazo, el suplente queda firme. |
| Umbral de alarma por demora | Minutos de retraso estimado que disparan el aviso al cliente. |
| Aviso previo al vencimiento | Con cuánta antelación se avisa por documentación por vencer. |
| Cierre de sesión por inactividad | Tiempo sin actividad tras el cual se cierra la sesión del panel. |
| WhatsApp, Número conectado | Número verificado de la prestadora ante Meta. |
| WhatsApp, Estado de la conexión | Última comprobación del webhook de mensajes entrantes. |
| WhatsApp, Calidad del número | La califica Meta según los reportes de los destinatarios. |
| WhatsApp, Contactos sin consentimiento | Sin su autorización no se puede iniciar una conversación. |
| Cálculo de candidatos, Que venga quien ya conoce al Paciente | Haber atendido antes a esa persona pesa más que cualquier otra comodidad de la agenda. Es como viene de fábrica. |
| Cálculo de candidatos, Que nadie quede al límite | Llegar sin haber descansado lo suficiente o con la semana casi llena resta mucho más, y la continuidad deja de tapar al resto. |
| Cálculo de candidatos, Que el viaje sea corto | Vivir cerca del domicilio pesa bastante más. La distancia se mide en línea recta, así que es una ayuda para ordenar, no un veredicto. |

## Otras pantallas del Panel

| Pantalla | Texto |
|---|---|
| Segundo factor, activación | Hace falta escanear este código con Google Authenticator, Authy u otra app similar, y escribir el código de 6 dígitos que muestra para confirmar. |
| Segundo factor, recuperar acceso | Enviamos un código de un solo uso al email registrado. Al confirmarlo, se da de baja el dispositivo perdido y se puede configurar uno nuevo. |
| Primeros pasos, Empezar desde una planilla | Si esta información ya está en una planilla, se puede leer acá y el sistema propone la configuración inicial a partir de ella. No se crea nada hasta confirmarlo. |
| Postulaciones, Cerrar la entrevista | Cerrarla deja constancia de que ya pasó. No cambia el estado de la postulación: eso se decide aparte. |
| Asistentes, Datos bancarios | Los informa el Asistente desde su aplicación. |
| Asistentes, Simulador, Cobertura de sus ausencias | La cobertura no es una estimación: es lo que ya se pagó para reemplazar a esta persona en los últimos {meses} meses, repartido por mes. Sale igual bajo los dos vínculos, porque se le paga a quien la reemplazó. |
| Mapa del plantel | Las fichas con el domicilio ubicado aparecen acá. |

## Entrada al Panel

- Ninguna guardia debería quedar sin cubrir.
- El sistema anticipa la demora, convoca al suplente y verifica el presentismo en el domicilio. La coordinación interviene sólo cuando hace falta.
- Ingrese con las credenciales asignadas por la administración.
- Acceso restringido al personal autorizado. Toda actividad queda registrada.
