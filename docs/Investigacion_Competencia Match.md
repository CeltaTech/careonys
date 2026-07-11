# Investigación de Cuidarlos — hallazgos para el match de prestadora-original

> Referencia completa, no un resumen de una línea. Sale de recorrer cuidarlos.com completo
> (home, soy-cuidador, ayuda/FAQ, directorio público, términos y condiciones) el 2026-07-11.
> Usar como catálogo de funciones a evaluar para el modelo match de prestadora-original — no como
> plantilla a copiar entera, Cuidarlos es un competidor real, no un modelo a imitar sin filtro.

## Funciones que Cuidarlos tiene y prestadora-original no tiene diseñadas en ningún PRD

- **Chat interno entre cliente y cuidador**, todo registrado dentro de la app — nunca por
  fuera. Es evidencia propia de la relación, mismo valor que ya le da el proyecto al reporte
  diario ("el instrumento de defensa más poderoso ante cualquier demanda").
- **Búsqueda de reemplazo por la propia cliente**, en tiempo real, cuando el cuidador falta.
  Encaja en el modelo match de prestadora-original (donde el cliente ya autogestiona la relación),
  no en el directo (donde prestadora-original garantiza el reemplazo).
- **"Historia de vida" del paciente** — gustos, hobbies, pasado — visible para el cuidador
  recién después de que hay un acuerdo formado. Pensado para generar empatía, no es dato
  clínico. prestadora-original solo tiene datos clínicos (patologías, medicación), nada humano.
- **Modo "invisible"** — un cuidador ya empleado puede ocultar su perfil de nuevas búsquedas
  sin desactivar la cuenta.
- **Capacitación continua**, gratuita y paga, después del ingreso — no solo la capacitación
  inicial. prestadora-original hoy tiene un único programa de 8hs, una sola vez, al ingresar.
- **Programa de referidos con pago real** (vía Mercado Pago) a quien trae usuarios nuevos que
  cumplen condiciones mínimas (contactos, actividad). Motor de crecimiento con costo
  variable — solo se paga si funciona.
- **"Gestor de Cuidados"** — servicio humano premium, pago aparte, para quien quiere que
  alguien le gestione y monitoree todo el cuidado. Es, en los hechos, una versión de mayor
  margen del mismo servicio de coordinación que el modelo directo de prestadora-original ya incluye por
  defecto — podría funcionar como **puente entre match y directo** (cliente entra
  barato por match, puede pagar extra por gestión activa sin "mudarse" al modelo
  directo completo), no como una función aislada.

## Benchmark de precio real — primer dato de mercado que tiene el proyecto

`CONTEXT.md` señala que prestadora-original no tiene ningún precio de referencia validado. Cuidarlos
cobra al cliente:
- Pack de 10 contactos con cuidadores: **USD 13**.
- Suscripción Premium mensual: **USD 15/mes**, renovación automática.
- Para el cuidador: **gratis**, siempre (incluidos cursos gratuitos u opcionalmente pagos).

## Alerta de privacidad — qué NO hacer, con ejemplo real

El directorio público de Cuidarlos (`/cuidadores`, sin login) muestra nombre, **edad real**,
ciudad, puntaje exacto y patologías específicas atendidas — de cualquier cuidador, a
cualquiera. Peor: aunque la tarjeta muestra "Romina V." (apellido abreviado), la URL del
perfil es `romina-vanesa-cuidador` — **el apellido completo queda expuesto en la dirección
web** aunque no se muestre en pantalla. Contradice lo que `PRD_04_05_App_Servicio.md` ya
define para prestadora-original (primer nombre + inicial, nunca nombre completo, nunca edad). Vale como
caso de estudio concreto para cuando se construya el perfil público del Asistente con QR —
confirmar explícitamente que ni el contenido visible ni la URL del perfil filtran más de lo
que el diseño ya promete.

## El sistema de ranking — por qué prestadora-original ya decidió no copiarlo, confirmado con la fuente

Estrellas de 1 a 5, promedio entre reputación (calificación de los clientes), completitud del
perfil, y capacitaciones — con el objetivo declarado de "aparecer en los primeros puestos".
Confirma por qué `CLAUDE.md` lo descartó explícitamente para la PWA de Asistentes: es un
mecanismo de presión de comportamiento sobre gente que la propia Cuidarlos, en sus términos y
condiciones, dice que no son empleados — mismo indicio de subordinación que el proyecto
viene evitando desde el principio. No reproponer.

## Blindaje legal de Cuidarlos — referencia para el abogado, no para copiar literal

Cláusula 13 de sus Términos y Condiciones: declara explícitamente que no existe relación
laboral ni comercial entre Cuidarlos y ninguno de sus usuarios/cuidadores/gestores — se
define como un "lugar de encuentro" únicamente. Mismo argumento de fondo que ya sostiene el
modelo match de prestadora-original en el análisis legal original. Puede servir de referencia de
estructura para el abogado laboralista al redactar la cláusula equivalente de prestadora-original — no
copiarla, es contenido de otra empresa.

## Entidad legal identificada

Cuidarlos opera bajo **TECHELDER S.A.**, CUIT 30-71630790-1.

## Cómo usar este documento

No es una lista de tareas para Claude Code. Es información de negocio para el Desarrollador,
a consultar cuando se diseñe en serio el modelo match (ver pendiente #13 de
`docs/PENDIENTES.md`, que remite acá). Recién en ese momento se decide cuáles de estas
funciones se construyen, en qué orden, y con qué adaptaciones para no copiar a Cuidarlos sino
mejorarlo.
