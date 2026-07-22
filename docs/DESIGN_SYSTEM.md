# DESIGN_SYSTEM.md — Identidad visual para código

> **Vigente desde 2026-07-18.** La identidad anterior (Playfair Display + paleta azul
> `#1F4E79` en hex) fue reemplazada por decisión explícita del Desarrollador tras considerar
> el Panel "totalmente horrible e inoperativo" — ver el detalle del cambio, motivo y qué se
> preservó sin tocar en `docs/claude_history.md` (entrada 2026-07-18). Las referencias a
> Playfair Display en la sección de benchmark de abajo son históricas: documentan por qué se
> eligió esa fuente en 2026-07-07, no la identidad vigente hoy.

## Benchmark estético de competidores (2026-07-07)

> La documentación de negocio original (histórica: anexo técnico, auditoría estratégica)
> ya analiza a los competidores por **prestaciones** (verificación, GPS, precios, IA). Esta
> sección cubre el ángulo que faltaba: cómo se ven, porque acá sí afecta decisiones de código
> (`DESIGN_SYSTEM.md` es el único lugar de `Workspace/docs/` donde el análisis de mercado es
> relevante para la implementación).

Relevamiento visual, julio 2026, en dos rondas (la segunda a partir de una lista adicional
de sitios que aportó el usuario, incluyendo Instagram — ver limitación abajo):

| Sitio | Paleta | Tono / nota visual |
|---|---|---|
| EnCasa (`encasa.com.ar`) | Blanco + celeste/teal | Corporativo-cálido, fotografía de staff/pacientes |
| Cuidarlos (`cuidarlos.com`) | Blanco + negro, casi sin color | Tech/producto, mockups de celular, bloques repetitivos |
| Medincare (`grupomedincare.com.ar`) | Blanco + azul/teal, iconografía SVG | Institucional, poca fotografía humana |
| Cuidando en Casa (`cuidandoencasa.com`) | Blanco + verde | Cálido, foto real de cuidador+paciente |
| Ver Salud (`versalud.com.ar`) | Blanco + celeste + **magenta/fucsia en fotos** | Único relevado con un color fuera de la paleta azul/verde estándar — se nota, en buen sentido |
| Casamed Salud (`casamedsalud.com.ar`) | Blanco + azul | Genérico, una sola foto de enfermera, sin personalidad |
| Situ Care (`situ.care`) | Blanco + teal | Usa la metáfora "Sherpa" para darle calidez — el único con un concepto narrativo, no solo lista de servicios |
| Home Care BA (`homecareba.org`) | Blanco + **rojo** de acento | Fotografía cálida/íntima, pero el rojo es un uso de color más atrevido que el resto |
| Continuum (`continuum.com.ar`) | Blanco + azul | Fotografía en contexto domiciliario, tono "centrado en la persona, no en la enfermedad" |
| Cuidarte Argentina (`cuidarteargentina.com.ar`) | Blanco + azul | El más flojo del relevamiento — menús duplicados, imagen de banco genérica, "se lee funcional y desactualizado" (cita literal del análisis) |
| InDom (`indom.com.ar`) | Blanco + azul/gris | Institucional maduro, fotografía de banco de imágenes correcta pero sin identidad propia |
| +Vida Salud (`masvidaessalud.com.ar`) | Blanco + azul/verde | Sin fotografía — todo ilustrado con íconos geométricos simples, "enfoque humano" solo en el texto, no en la imagen |
| API Cuidados Domiciliarios (`api.org.ar`) | Blanco + gris + azul | Casi sin fotografía, muy institucional/wireframe |
| Amparando Salud (`amparandosalud.com.ar`) | Blanco + azul | **Ojo**: por el contenido relevado parece más un estudio de asesoría legal en salud que un competidor de cuidado domiciliario directo — no asumir que compite 1 a 1, confirmar antes de sumarlo al análisis de negocio |
| Cuidar Buenos Aires, `app.cuidadosdomiciliarios.com` | — | Sitios con muy poco contenido accesible por herramientas automáticas (probablemente SPA/JS pesado) — no se pudo evaluar en profundidad, requiere revisión visual manual si se los quiere comparar en serio |

**Conclusión del benchmark: todos convergen en la misma fórmula** — fondo blanco,
acento azul/teal/verde, sans-serif sin personalidad, mucho whitespace, tono
"institucional-cálido" indistinguible entre marcas. Las únicas dos excepciones notadas
(Ver Salud con magenta, Home Care BA con rojo) confirman la regla: alcanza con un solo
color fuera de la paleta esperada para destacar en este rubro. Ningún competidor relevado
usa tipografía display, ni tiene dirección de arte propia consistente entre foto y foto —
es una categoría visualmente genérica. Esto es una oportunidad real, no solo un
lindo-tener: en un mercado donde nadie se diferencia estéticamente, verse distinto es
gratis en términos de percepción de superioridad, incluso antes de comparar funcionalidad.

**Competidores nuevos detectados en esta búsqueda, no presentes en el corpus de negocio
original (anexo técnico histórico) — dejar constancia para que se evalúe si suman al
análisis de negocio, esto acá solo cubre el ángulo visual:** Cuidarnos (UTEP/Movimiento
Evita), Cuidando en Casa, Ver Salud, Casamed Salud, Cuidar Buenos Aires, Situ Care, Home
Care BA, Amparando Salud (con la salvedad de arriba), Continuum, Cuidarte Argentina, InDom,
+Vida Salud, API Cuidados Domiciliarios, Go Home Cuidados Domiciliarios (Instagram),
CuidArteBien (cooperativa, Córdoba/Santa Fe, activa en Instagram/Reels).

## Instagram — vacío detectado, no cubierto por ningún PRD original

Ningún documento de `Workspace/docs/` decía nada sobre identidad visual para redes
sociales. Es un vacío real señalado por el usuario, no solo un detalle menor: la mayoría
de los competidores chicos/medianos (Go Home, CuidArteBien) compiten más en Instagram que
en su sitio web. **Limitación a declarar:** las herramientas de investigación disponibles
en esta sesión no pueden "ver" Instagram como una persona — el contenido es
JS-renderizado y con restricciones de scraping, así que solo se pudo observar cadencia de
publicación y tipo de contenido (fotos/carruseles/reels), no calidad visual real de grilla,
paleta ni dirección de arte. Lo que sí se pudo confirmar: hay competidores activos y con
publicación regular en ese canal (Go Home: ~750 seguidores, posteo constante 2024-2026;
CuidArteBien: reels con producción cuidada, cooperativa multi-sede). **Antes de construir
nada de Etapa 1, definir explícitamente**: grilla de Instagram con sistema de plantillas
(no publicaciones sueltas sin identidad), paleta y tipografía consistentes con el sitio
(mismo `--azul-oscuro` + Playfair Display, no un estilo distinto "para redes"), y quién es
responsable de este canal — no está definido en ningún PRD actual y requiere una decisión
de negocio, no solo de diseño.

### Qué ya tiene la Prestadora Demo a favor (no perder al implementar)

- **Playfair Display para títulos** ya rompe con la sans-serif genérica de los cuatro
  competidores relevados — es el diferenciador más barato de mantener y el más fácil de
  perder si un desarrollador "simplifica" a una sola fuente sans en el camino. No negociar
  esto en la implementación.
- La paleta funcional (`--azul-oscuro #1F4E79`) es más oscura y con más carácter que el
  celeste claro/teal que usan EnCasa y Medincare — mantenerla como color dominante de marca,
  no aclararla "para que se vea más liviano".

### Recomendaciones para superar al resto visualmente (a aplicar en Etapa 1)

- **No repetir la fórmula fondo-blanco-completo.** Usar bloques con `--fondo-alt` y el azul
  oscuro de marca como fondo de secciones completas (hero, testimonios), no solo como acento
  de botón — ningún competidor se anima a esto, todos usan blanco de punta a punta.
  Combinar la paleta funcional (verde-exito, naranja-alerta, rojo-peligro) con dark mode.
- **Fotografía real y propia, no genérica de banco de imágenes**, con dirección de arte
  consistente (misma luz, mismo grado de color en todas las fotos) — es lo único que
  Cuidando en Casa y EnCasa hacen bien y Cuidarlos/Medincare no; superarlos significa
  hacerlo mejor y de forma sistemática, no solo igual.
- **Micro-interacciones y transiciones** (hover states, transiciones de sección, loading
  states con identidad, no spinners genéricos) — ningún competidor relevado invierte en
  esto, es terreno libre para diferenciarse con poco esfuerzo de desarrollo.
- **Iconografía propia** en vez de sets genéricos (Font Awesome/Heroicons sin editar) —
  Medincare ya se apoya en iconos SVG genéricos; un set de íconos con el mismo espíritu que
  Playfair Display (con algo de personalidad, no solo funcional) refuerza la distancia visual.
- **Definir una identidad de Instagram desde Etapa 1, no después** — grilla con sistema de
  plantillas propio, misma paleta y tipografía que el sitio (ver sección "Instagram" arriba).
  Ningún competidor grande lo hace bien; los que sí publican seguido (Go Home, CuidArteBien)
  lo hacen sin un sistema visual reconocible — ahí también hay espacio para diferenciarse.


> Fuente: manual de identidad original (histórico, documento fuera del repo) + prompt maestro original Parte B.
> Advertencia que hay que respetar: el manual se declara "Provisional — identidad
> definitiva pendiente de definición". Construir el sistema de estilos de forma
> centralizada (variables CSS, nunca hardcodeado por componente) para que un reemplazo
> futuro de marca no requiera tocar componentes uno por uno.

## Paleta funcional de UI (estable — no es branding de división)

```css
:root {
  --azul-oscuro: oklch(0.22 0.02 250);      /* sidebar oscuro y acentos fuertes */
  --azul-medio: oklch(0.65 0.13 250);       /* acentos, links activos, secundario */
  --verde-exito: oklch(0.55 0.13 165);      /* confirmaciones, éxito */
  --naranja-alerta: oklch(0.62 0.13 70);    /* alertas moderadas (nivel amarilla) */
  --rojo-peligro: oklch(0.58 0.15 25);      /* errores, emergencias (nivel roja) */
  --rojo-peligro-bg: oklch(0.92 0.05 25);   /* fondo de alertas/errores */
  --fondo-alt: oklch(0.98 0.004 250);       /* fondos de sección */
  --texto-principal: oklch(0.2 0.01 250);   /* cuerpo de texto */
  --texto-secundario: oklch(0.5 0.01 250);  /* labels, subtítulos */
  --borde-card: oklch(0.9 0.005 250);       /* borde 1px de tarjetas/inputs */

  /* Variantes "-texto": mismo tono/saturación de su color base, más oscuras para llegar a
     4.5:1 de contraste sobre fondo blanco (WCAG 2.1 AA, auditado con oklch->sRGB real, no
     estimado). Usar SOLO cuando el color pinta texto; bordes, fondos de alerta y acentos
     grandes (≥24px o UI no textual) siguen usando la variable base de arriba, que ya
     cumple el mínimo de 3:1 para esos casos. rojo-peligro no tiene variante -texto: su
     tono base ya da 4.61:1 sobre blanco. */
  --azul-medio-texto: oklch(0.567 0.13 250);
  --verde-exito-texto: oklch(0.548 0.13 165);
  --naranja-alerta-texto: oklch(0.575 0.13 70);
}
```

Regla: ningún componente define un color fuera de estas variables. Si hace falta un tono
nuevo, se agrega acá primero, con justificación. Las tarjetas (`.metrica-card`,
`.panel-kpi-card`, etc.) usan `border: 1px solid var(--borde-card)`, no `border-left`
grueso de acento — ese patrón de acento lateral queda reservado a los indicadores de
estado semántico (guardias, alertas), ver abajo.

## Colores de división (solo referencia — NO usar en la Prestadora Demo)

```css
--salud: #2E75B6;      /* única división activa hoy — coincide con --azul-medio */
--junior: #F4820A;
--pets: #4A7C3F;
--bienestar: #7B6BB5;
--hogar: #C0622A;
--legal: #1F3A6E;
--group: #2C2C3E;
```

## Tipografía

- **Display** (títulos, encabezados principales): Public Sans — weights 400 a 800
- **Body** (interfaz, párrafos, formularios, navegación): Public Sans — weights 400 a 800

```css
:root {
  --font-display: 'Public Sans', sans-serif;
  --font-body: 'Public Sans', sans-serif;
}
```

Cargada vía `<link>` de Google Fonts en `panel/index.html` (pesos 400;500;600;700;800).

## Layout general del Panel (vigente desde 2026-07-18)

- **Sidebar**: 232px de ancho, fondo `--azul-oscuro`. El link de navegación activo se marca
  con un punto (`::before`, personas autorizadas de 6px, color `--azul-medio`) a la izquierda del texto,
  no con un fondo resaltado.
- **Tarjetas**: fondo blanco, `border: 1px solid var(--borde-card)`, `border-radius: 12px` —
  nunca `border-left` grueso de acento (ver nota en la sección de paleta).
- **Guardias**: grilla semanal (asistentes en filas, días en columnas) con reasignación por
  drag-and-drop nativo (HTML5 `draggable`/`dragstart`/`dragover`/`drop`), no lista agrupada
  por día. Cada guardia es un chip que reutiliza las clases de estado ya existentes
  (`.guardia-programada`, etc.). No existe columna "sin asignar": `guardias.asistente_id` es
  `NOT NULL` en el schema, ese estado no tiene equivalente real.
- **Comunicación**: además del hilo por Asistente (dentro de su ficha), existe una bandeja
  global en `/comunicacion` con lista de Asistentes ordenada por último mensaje a la
  izquierda y el hilo activo a la derecha. Ambas vistas comparten el mismo componente
  (`HiloComunicacion`), no hay lógica de chat duplicada.

## Logos disponibles

Solo **la Prestadora Demo** tiene el logo necesario para el desarrollo actual (1 variante con
texto). Los logos de "divisiones" de ese negocio real de origen (Junior, Pets, Bienestar,
Hogar, Legal, Group) no se usan en esta etapa — quedan solo como referencia de paleta arriba.

## Estructura de archivos de estilos recomendada

```
src/styles/
├── variables.css      ← todo lo de arriba: colores, tipografía, espaciados
├── global.css         ← reset + base
└── components.css     ← estilos de componentes reutilizables (Button, Alert, FormField)
```

## Estados visuales de alertas (Nivel 2 de IA)

Estas tres clases mapean directo a los niveles que devuelve el motor de alertas
(ver `AI_PROMPTS.md`):

```css
.alerta-verde  { border-left: 4px solid var(--verde-exito); }
.alerta-amarilla { border-left: 4px solid var(--naranja-alerta); }
.alerta-roja   { border-left: 4px solid var(--rojo-peligro); }
```

## Estados visuales de guardias (Módulo 6 del Panel Admin)

Patrón adoptado de análisis de GlamourOS/ERP salones: colores automáticos por estado en
vista calendario/lista, para escaneo visual rápido sin leer texto. Reutiliza las mismas
variables de la paleta funcional, no colores nuevos:

```css
.guardia-programada { border-left: 4px solid var(--azul-medio); }
.guardia-activa     { border-left: 4px solid var(--verde-exito); }
.guardia-completada { border-left: 4px solid var(--texto-secundario); }
.guardia-cancelada  { border-left: 4px solid var(--rojo-peligro); }
.guardia-ausente    { border-left: 4px solid var(--naranja-alerta); }
```

`ausente` se agregó como quinto valor de `guardias.estado` al diseñar el schema real
(`backend/src/db/schema_modulo6_guardias.sql`) — distinto de `cancelada`, esta sección había
quedado con solo 4 reglas. Corregido al implementar Módulo 6 Parte 1 (2026-07-10).

## Convenciones de UI (patrón adoptado de análisis de GlamourOS/ERP salones — no vinculante,
## solo se toman estas dos prácticas puntuales, ver justificación en memoria de sesión)

- **Teléfono siempre como link, nunca texto plano.** Cualquier campo de teléfono/WhatsApp
  visible en UI (ficha de Cliente, ficha de Asistente, tabla de postulantes) se renderiza
  como `wa.me/{telefono}`, no como texto estático — reduce fricción de contacto en un solo
  clic, consistente con el botón de WhatsApp flotante que ya define `PRD_01_Sitio_Web.md`.
- **Listas largas de opciones se agrupan por categoría, nunca scroll vertical infinito.**
  Aplica directo a la Sección D del formulario de postulación (`PRD_03_Reclutamiento.md`):
  discapacidades, patologías, tareas de cuidado directo/acompañamiento/domésticas — cada
  subgrupo se muestra como su propia sección colapsable o con su propio encabezado visual,
  no como un único muro de checkboxes.
