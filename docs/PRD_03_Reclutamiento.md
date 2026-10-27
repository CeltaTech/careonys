# PRD_03 — Reclutamiento (Sitio de Captación + Postulación + Verificación)

> Fuente: documento original de PRD de Reclutamiento (histórico, fuera del repo, v1.0, Mayo 2026). Condensado para
> ejecución directa, con las siguientes correcciones respecto del original: (1) el original
> nombra a una persona real como responsable de entrevistas — reemplazado por el Responsable
> del reclutamiento y el Entrevistador; (2) se documenta explícitamente una discrepancia de stack, ver
> sección "Nota de stack" abajo, en vez de elegir en silencio; (3) el original usa
> "Cuidadora"/"Cuidadoras" en varios lugares (tabla de usuarios del sistema, catálogo de
> especialidades) — reemplazado por "Asistente"/"Asistente Integral" en todo el documento,
> regla del glosario obligatorio; (4) se agregó la sección "Landing page de reclutamiento"
> (contenido de la página pública — perfiles buscados, beneficios — del original, que
> no estaba condensada acá todavía); (5) queda fuera de alcance la Sección 8 del original
> (comparativa de posicionamiento frente a la competencia) y la mención a explorar aval
> institucional de terceros (Cruz Roja, AAGG) — son decisiones de negocio/marketing, no
> generan código.

## Objetivo

La prestadora necesita mínimo 20 Asistentes Integrales certificados antes del lanzamiento
comercial. El proceso de incorporación completo tarda 4-7 días hábiles por persona — el
reclutamiento arranca en Etapa 0/1, antes que el resto del producto.

## Nota de stack (discrepancia ya resuelta)

La discrepancia que este documento anotaba —Supabase desde el arranque contra un primer paso
por MySQL en Railway— quedó resuelta hace tiempo y a favor de lo primero: **nunca hubo
MySQL**, todo se construyó sobre Supabase (ver `docs/claude_history.md`). Este documento
aporta el detalle funcional del reclutamiento —qué campos se piden, qué etapas de
verificación hay, qué pantallas de Panel—, no decisiones de infraestructura.

**Dónde vive el formulario de postulación (corregido 2026-08-13):** en la empresa que va a
contratar al Asistente, no en la página pública de Careonys, que le vende software a esas
empresas y no toma postulaciones (`PRD_01_Sitio_Web.md` §3).

Twilio (mensajes de texto) no aparece en ningún otro documento — no construir verificación
por mensaje de texto hasta que haya una decisión de negocio explícita.

## Proceso de Incorporación de Asistentes

**Nota de nomenclatura (corregida 2026-07-10):** dentro del Panel, uso interno, se llama
"Proceso de Incorporación de Asistentes". El nombre anterior quedó retirado por completo, de
cualquier contexto interno o público (ver glosario de `CLAUDE.md`) — no reintroducirlo ni
siquiera como "concepto general".

**Las etapas no son fijas: cada Prestadora define las suyas**, con su clave, su nombre y su
orden, en Configuración › El cuidado (tabla `etapas_incorporacion_asistente`). Cada Asistente
nuevo arranca con una fila por etapa activa en `verificaciones_asistente`, y el único lugar del
backend que sabe de dónde salen las etapas es `backend/src/utils/etapasDeIncorporacion.js`. Una
Prestadora sin ninguna etapa activa no puede dar de alta un Asistente: el producto no le inventa
un proceso.

### Verificación de identidad — cómo quedó construido

Las dos fotos se cargan y se ven juntas desde el Legajo del Asistente, en la pestaña de
verificación (`panel/src/pages/asistentes/FotosDeIdentidad.jsx`). Quedan guardadas en el depósito
`fotos-identidad`, que sube y firma el backend
(`backend/src/routes/panelVerificacionIdentidad.js`).

**El bloque de las fotos está afuera de la lista de etapas**, y no es un olvido: cada Prestadora
define las etapas de su proceso y les pone las claves que quiera (Configuración > El cuidado), así
que no hay ninguna clave que el código pueda buscar. Las dos fotos son de la persona, no de una
etapa.

**Las compara una persona, no el producto.** Quien revisa las mira una al lado de la otra y marca
la etapa como venía haciéndolo; lo que cambió es que ahora queda guardado lo que miró. La
comparación automática de las dos caras —la «comparación por IA» que pedía el PRD original— es
tratamiento de dato biométrico y **no está construida**: falta el documento legal del que salga la
advertencia al Asistente, y falta elegir proveedor (`SECURITY.md`, decisiones pendientes).

### Referencias laborales — cómo quedó construido

Las referencias que la persona cargó en su postulación pasan al Legajo del Asistente cuando se le
crea la cuenta, una fila cada una y todas sin llamar. Desde la pestaña de verificación
(`panel/src/pages/asistentes/ReferenciasLaborales.jsx`) se llama a cada una y queda anotado qué
contestó: verificada, no responde o rechazada, con una nota interna. También se pueden cargar a
mano, hasta las mismas cinco que admite el formulario, para quien entró sin postulación.

**Quién llamó y cuándo los escribe el backend** (`backend/src/routes/panelReferenciasLaborales.js`),
no la pantalla: son la firma de esa verificación. Volver el resultado a «sin llamar» los borra.

**El mínimo de dos verificadas es configuración de cada Prestadora**, no un número escrito en el
código (`configuracion_referencias_laborales`). Se cambia desde Configuración,
puede ser cero, y el tope es cinco porque más de cinco no se pueden cargar.

**Y no bloquea nada.** Si faltan verificadas, la pantalla lo dice y aclara que incorporar igual a
esa persona lo decide la Prestadora: el producto avisa, no prohíbe (`celtatech/CLAUDE.md` §7).

**Están afuera de la lista de etapas**, por lo mismo que las dos fotos: las claves de las etapas las
inventa cada Prestadora y ninguna se puede nombrar desde el código.

### El avance del aspirante — cómo quedó construido

La pantalla de verificación muestra, arriba de todo, cuánto lleva hecho el aspirante: una línea
—«2 de 4 etapas aprobadas — 50%»— y una barra.

- **El total sale del catálogo de etapas de esa Prestadora**, no de las filas guardadas. Una etapa
  que la Prestadora sacó deja de contar aunque su fila siga ahí, y una que agregó cuenta como
  pendiente aunque todavía no tenga fila.
- **Una etapa rechazada no suma avance.** Está resuelta, pero no acerca a nadie a trabajar. Cuántas
  hay se informa aparte, al lado del porcentaje.
- **Sin etapas configuradas no se muestra nada.** Un contador de cero sobre cero no dice nada, y lo
  que hay que resolver ahí es cargar el catálogo, que se hace en Configuración.
- El cálculo vive en `panel/src/lib/avanceDeIncorporacion.js`, y es lo único que decide qué cuenta.

## Roles

| Rol | Quién | Acceso |
|---|---|---|
| Aspirante | Postulante sin verificar | Formulario público + estado de su postulación |
| Asistente | Verificada e incorporada al Padrón | App + panel propio |
| Admin_prestadora | Gestión de negocio de la prestadora | Panel de administración completo |
| Cliente | Contrata el servicio | Portal de seguimiento |
| Coordinador | Rol operativo | Gestión de su zona |

## Landing page de reclutamiento (sitio público)

Cara pública de la campaña de incorporación — comunica a quién busca la prestadora, qué ofrece y
cómo es el proceso, antes de llevar al aspirante al formulario. Corrección de terminología
respecto del documento fuente: donde el original dice "Cuidadoras" se usa "Asistentes
Integrales" (glosario de `CLAUDE.md`).

**Perfiles buscados** (checklist visual, no un formulario todavía): Asistente Integral /
Auxiliar de Enfermería / Enfermero/a profesional / Kinesiólogo/a / Acompañante Terapéutico/a
/ Fonoaudiólogo/a / Psicólogo/a / Terapista Ocupacional / Nutricionista / otras
especialidades vinculadas al cuidado de personas — mismo catálogo `especialidades` de cada
Prestadora, no crear una lista paralela.

**Beneficios que comunica el sitio**: trabajo registrado; honorarios acordados según
tipo de Asistente y experiencia (sin publicar montos — ver regla abajo); Certificado de Aptitud;
respaldo operativo permanente; aplicación propia de gestión de guardias; capacitación continua.

**Zonas de cobertura**: mismo catálogo de zonas que la Sección E del formulario
(ver abajo) — no duplicar como una lista independiente en el código.

## Formulario de postulación (landing pública)

Regla explícita del PRD original: **no publicar honorarios en el sitio** — se relevan en el
formulario sin sesgar la respuesta del aspirante, se acuerdan individualmente en la
entrevista.

### Sección A — Datos personales

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| Nombre / Apellido | texto | Sí | |
| DNI | numérico | Sí | validar formato |
| Fecha de nacimiento | date | Sí | validar mayoría de edad (18+) |
| Teléfono/WhatsApp | tel | Sí | |
| Email | email | Sí | con confirmación |
| Domicilio | texto + Maps | Sí | confirmar en mapa |
| Localidad/Barrio | texto | Sí | |
| Nacionalidad | select | No | |
| CUIL | numérico | No | |
| Género | select (Femenino/Masculino/No binario/Prefiero no contestar) | Sí | |
| Foto de perfil | file (imagen) | Sí | detectar rostro antes de aceptar |

### Sección B — Situación fiscal

| Campo | Opciones | Obligatorio |
|---|---|---|
| Situación ante AFIP | Monotributista / Me comprometo a inscribirme / Otra | Sí |
| Tipo de registro AFIP | No inscripto / Monotributo social / Monotributista / Responsable inscripto | Sí |
| Obra social | texto libre | No |

Regla de negocio (bloqueante para asignación, no solo informativa): ser monotributista es
obligatorio para recibir guardias. Si el aspirante no está inscripto, el sistema **bloquea
la asignación** hasta que Admin_prestadora confirme el alta de monotributo — este es el mismo campo
`tipo_vinculo`/monotributo de `asistentes`, no una tabla nueva.

### Sección C — Formación y certificaciones

Profesión/especialidad (checkboxes múltiples — mismo catálogo `especialidades` de cada
Prestadora; el original enumeraba: Asistente Integral, Acompañante Terapéutico/a, Enfermero/a, Auxiliar de
Enfermería, Asistente Gerontológico/a, Kinesiólogo/a, Fonoaudiólogo/a, Psicólogo/a,
Terapista Ocupacional, Nutricionista, Voluntario/a, Otro — mínimo 1 obligatorio;
corregido respecto del documento fuente, que decía "Cuidadora Domiciliaria" — término
prohibido por el glosario de `CLAUDE.md`). Estudios/cursos y experiencia
laboral: formularios dinámicos (múltiples entradas), opcionales pero mejoran ranking.
Referencias laborales: nombre/apellido/teléfono, 0 a 5. Cuántas verificadas se esperan es
configuración de cada Prestadora, y dos es el valor con el que nace — ver «Referencias laborales —
cómo quedó construido», más arriba.

### Sección D — Experiencia clínica

Checkboxes en 5 subgrupos: discapacidades con experiencia, patologías clínicas atendidas,
tareas de cuidado directo, tareas de acompañamiento, tareas domésticas — catálogo completo
en el documento fuente, usar como opciones fijas de un multi-select, no texto libre.

### Sección E — Zonas de cobertura

Selector múltiple de zona + municipio + distancia máxima desde el domicilio. Las zonas no son
fijas: cada Prestadora carga las suyas (`zonas_cobertura`), y es el mismo catálogo que usa el
resto del producto — no crear un catálogo paralelo.

### Sección F — Disponibilidad horaria

Grilla días (L-D) x franjas (Mañana 6-14 / Tarde 14-22 / Noche 22-6) — mapea directo a
`asistentes.disponibilidad` (JSONB). Más checkboxes: disponible para
urgencias, disponible con retiro (por horas), disponible sin retiro (cama adentro).

### Cómo quedó construido

`postulaciones` guarda todos los campos de las seis secciones. Los que son lista de renglones
—estudios y cursos, experiencia laboral, referencias— van como documento adentro de la
postulación, porque se leen enteros con ella y nunca por separado. Domicilio, latitud y longitud
se llaman igual que en `asistentes`: una postulación aprobada se convierte en Asistente y los dos
nombres tienen que coincidir.

**Las listas de opciones no están escritas en la pantalla.** Género, nacionalidad, tipo de
registro ante AFIP y los cinco subgrupos de experiencia clínica viven en `opciones_postulacion`,
una fila por opción y por Prestadora, y el backend las entrega en `GET
/api/publico/:prestadora/postulacion-asistente/opciones`. Las opciones que este documento enumera
más arriba son lo que se esperaba encontrar, no lo que el sistema impone: **cada Prestadora carga
las suyas, y la tabla nace vacía.** El catálogo completo de experiencia clínica quedó en el
documento fuente, que no está en el repositorio, así que no se sembró ninguno: inventarlo sería
inventar contenido de negocio.

**La mayoría de edad no son dieciocho escritos en el código.** La edad mínima para trabajar es un
valor legal y vive en `escalas_legales` (`tipo = 'edad_minima_para_trabajar'`), resuelta a la
fecha de la postulación y en la jurisdicción de la Prestadora. Si no hay escala vigente, **no se
rechaza a nadie por edad**: la postulación entra con su fecha de nacimiento y quien la revisa
decide.

Lo que comprueba el servidor antes de guardar —edad, forma del CUIL y que corresponda al
documento, que lo elegido esté en el catálogo, que las listas traigan renglones completos, que la
distancia sea una distancia y que el punto del mapa viaje entero— está en
`backend/src/utils/postulacionCompleta.js`, escrito una sola vez y probado aparte. Los motivos de
rechazo salen como claves y ninguno nombra una tabla ni una columna.

**Falta la pantalla.** Dónde vive el formulario público es una decisión abierta — ver
`docs/PLAN_HASTA_PRODUCCION.md`, sección «Reclutamiento».

## Panel de administración — sección Postulantes

### Los totales — cómo quedaron construidos

Arriba de la lista hay cinco números: cuántas postulaciones hay, y cuántas pendientes, en
verificación, aprobadas y rechazadas.

- **Los números son de todas las postulaciones, no de las que quedaron después de los filtros.**
  Contados sobre lo filtrado, elegir una situación dejaría los otros cuatro en cero: dirían lo
  mismo que el filtro que se acaba de tocar, y no habría forma de ver el panorama para volver.
- **Cada número filtra por esa situación, y el primero saca el filtro.** Es la pregunta que se hace
  cualquiera después de mirar el número.
- La cuenta vive en `panel/src/lib/totalesDePostulaciones.js`. Una situación que no está entre las
  cinco se cuenta en el total y en ninguna otra parte: cuántas postulaciones hay no depende de que
  se sepa clasificarlas.

**Falta un sexto número, las aprobadas sin monotributo**, y no se construyó porque todavía no está
decidido si eso avisa o bloquea — ver `docs/PLAN_HASTA_PRODUCCION.md`, sección «Reclutamiento». Un
número que diga «bloqueadas» antes de esa decisión adelanta la respuesta.

### La tabla y los filtros — cómo quedaron construidos

Columnas: nombre, especialidades, zonas, fecha, pretensión de honorario por hora, años de
experiencia, condición fiscal, urgencias, cómo nos conoció y situación. Más reciente primero, que
es el orden con el que la pantalla pide los datos.

- **La pretensión de honorario se muestra con su moneda**, la de la fila y no la de quien mira. La
  columna nació junto con la de moneda, que completa sola el mismo disparador que el resto de los
  importes. Quien no dijo cuánto pretende cobrar aparece con un guión: se pregunta en la
  entrevista.
- **La columna de cómo nos conoció se rotula por el dato que hay guardado.** El PRD original la
  llamaba «canal de llegada», y son dos cosas distintas: acá un canal es por dónde sale un mensaje del sistema
  —WhatsApp, correo, notificación— y está escrito así en `panel/src/lib/modalidades.js`. Lo que la
  postulación guarda es lo que la persona contestó, y así se rotula.
- **Once condiciones no entran adentro de una pantalla.** El filtrado vive en
  `panel/src/lib/filtrarPostulaciones.js`, con sus pruebas: varias de esas condiciones no son una
  comparación sino una decisión, y una decisión se prueba.
- **Quien no declaró un dato queda afuera sólo cuando ese dato se pide.** Buscando gente que
  pretenda hasta cierto honorario, quien no lo dijo no cumple: meterla adentro la haría pasar por
  alguien que pidió poco. Mientras ese filtro no se toque, aparece como todas.
- **Un número escrito a medias no esconde a nadie.** Mientras se tipea «-» o «1e» el filtro
  todavía no se entiende, y un filtro que no se entiende no puede vaciar la lista y hacer creer
  que no hay postulantes.
- **El honorario y la distancia se escriben, no se eligen de una lista.** Una lista de rangos
  armada de antemano sería un valor operativo escrito en el código, distinto en cada Prestadora y
  en cada zona.

Filtros: texto libre, situación de la postulación, especialidad, zona, franja horaria, condición
fiscal, urgencias, tipo de servicio —por horas o cama adentro—, rango de honorario por hora y
distancia («viaja al menos tantos kilómetros», que es la pregunta que se hace quien busca a
alguien para una casa lejos).

**El filtro por «Suspendida» no existe porque esa situación no existe**: una postulación está
pendiente, en revisión, aprobada o rechazada.

Mapa geolocalizado de los Asistentes activos del Padrón agrupado por zona (mismo componente de mapa
del Padrón, `panel/src/components/mapa/MapaDelPadron.jsx`, no duplicar implementación).

### La entrevista al postulante — cómo está construida

Desde la ficha de una postulación se agenda la entrevista, se la mueve de horario, se la cancela o
se le carga el informe (`panel/src/components/EntrevistaDePostulacion.jsx`,
`backend/src/routes/panelEntrevistas.js`, `backend/src/utils/entrevistaDePostulacion.js`, tabla
`entrevistas_postulacion`).

- **La agenda el Responsable del reclutamiento, y la hace el Entrevistador.** El Responsable es
  una persona del Panel que elige la Administración en Configuración → Reclutamiento
  (`configuracion_reclutamiento`); sin elección, es el Administrador de la Prestadora. Lo resuelve
  una sola función, `backend/src/utils/responsableDelReclutamiento.js`, que falla cerrado: si no
  resuelve a nadie, nadie agenda.
- **Al agendar, el Responsable elige al Entrevistador** entre las personas del Panel; si no
  elige, es él. Mientras la entrevista está agendada puede cambiarlo, y nada más.
- **Mover la entrevista, cancelarla y cargarle el informe lo hace sólo el Entrevistador.** El
  backend contesta «sin permiso» a cualquier otra cuenta, y el Panel no le muestra los botones.
- **La entrevista termina de dos maneras.** Con el informe del Entrevistador, que es obligatorio
  y la deja realizada, o cancelada, con el motivo si se escribe. Si la persona no se presenta, se
  cancela y el motivo lo dice. Al postulante no le llega nada por el informe.

- **El bloque está siempre, sin depender de la situación de la postulación.** Se entrevista
  justamente para decidir, así que esperar a que la postulación esté aprobada llegaría tarde.
- **Y terminar una entrevista no cambia la situación de la postulación.** Haber entrevistado a
  alguien no es haberlo aprobado: eso se decide arriba, en el selector de estado, y sigue siendo
  una decisión de una persona.
- **Hay una sola entrevista viva por vez, y las demás son historia.** Las anteriores se listan
  con su fecha, su resultado —con informe o cancelada—, su Entrevistador y el informe o el motivo
  de la cancelación.
- **Al postulante le llega su propio enlace, nunca la dirección de la sala**
  (`backend/src/routes/entrevistaPublica.js`). Abre sin cuenta y sin contraseña: el enlace que le llegó
  por correo es todo lo que necesita, igual que el enlace para activar la cuenta. Por eso reprogramar no
  obliga a mandarle un enlace nuevo, y el Panel copia ese enlace y no la sala.
- **La sala aparece recién a la hora de la cita.** Llegar temprano no es equivocarse: la pantalla
  del postulante no muestra ningún error, dice en qué momento está —todavía no, entre ahora, ya
  pasó— y qué corresponde hacer. Del lado del backend eso viaja como un dato de la respuesta, no como
  una falla.
- **Sin dirección de videollamada la entrevista se agenda igual.** La dirección base es
  configuración de cada Prestadora (`prestadoras.videollamada_base_url`), y el producto le agrega
  un nombre de sala imposible de adivinar. Vacía esa dirección, la pantalla del Panel avisa que va
  a haber que comunicarse por otro medio y la del postulante también: el producto avisa, no
  prohíbe (`celtatech/CLAUDE.md` §7).
- **El día y la hora se convierten en un solo lugar**
  (`panel/src/lib/momentoDeLaEntrevista.js`), porque el campo del navegador habla en la hora de
  quien mira y el backend guarda un instante universal. Su prueba hace ir y volver sin fijar ningún
  huso: escrita con un huso adentro pasaría acá y fallaría en la máquina que publica.

## Programa de capacitación (etapa del Proceso de Incorporación de Asistentes, si la Prestadora la configura)

8 horas online en 4 bloques (2hs c/u): 1) La persona mayor, 2) Cuidados esenciales, 3)
Seguridad y prevención, 4) El rol del Asistente (incluye uso de la app: check-in/out, reporte
diario, registro de medicación, código de conducta). Evaluación: 20 preguntas de opción
múltiple, aprobación mínima 80% (16 correctas). Emite Certificado de Aptitud digital (nombre,
tipo de Asistente, fecha), que se ve entre los datos del perfil del Asistente.

## Fuera de alcance de este documento

Alianzas institucionales para avalar la capacitación (mencionadas como pendientes en el
original) y comparativas de posicionamiento frente a competidores — son decisiones de
negocio/marketing, no generan código.
