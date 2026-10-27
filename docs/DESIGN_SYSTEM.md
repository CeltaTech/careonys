# DESIGN_SYSTEM.md — Identidad visual para código

> **Sistema de tokens, tonos y modo oscuro: vigente desde 2026-07-31.** Es el estado actual
> del Panel y está descrito abajo, en "Paleta y tokens del Panel" y las cuatro secciones que
> le siguen. Los valores exactos no se copian acá: viven en `panel/src/styles/variables.css`.

> **Identidad visual base: vigente desde 2026-07-18.** Reemplazó a la identidad anterior por
> decisión explícita del Desarrollador — ver el detalle del cambio, motivo y qué se preservó sin
> tocar en `docs/claude_history.md` (entrada 2026-07-18).

> Fuente: manual de identidad original (histórico, documento fuera del repo) + prompt maestro original Parte B.
> Advertencia que hay que respetar: el manual se declara "Provisional — identidad
> definitiva pendiente de definición". Construir el sistema de estilos de forma
> centralizada (variables CSS, nunca hardcodeado por componente) para que un reemplazo
> futuro de marca no requiera tocar componentes uno por uno.

## Paleta y tokens del Panel (vigente desde 2026-07-31)

**El archivo manda, no este documento.** Los valores exactos viven en
`panel/src/styles/variables.css` y ahí se leen. Acá se explica cómo está armado y qué regla
hay que respetar; copiar los valores a este documento solo garantizaría que algún día los dos
digan cosas distintas.

El archivo está partido en dos mitades y la división importa:

**1. La marca.** Cinco colores de Careonys: `--azul-oscuro`, `--azul-medio`, `--verde-exito`,
`--naranja-alerta`, `--rojo-peligro`. Son los mismos de día y de noche, porque son la
identidad del producto.

**2. Los tokens.** Un token es un nombre que dice **para qué sirve** el color, no de qué
color es: `--superficie` en vez de "blanco". No es cosmético — cuando el Panel pasa a modo
oscuro, `--superficie` deja de ser blanco y se vuelve gris oscuro, y todas las pantallas se
dan vuelta solas. Si en cambio estuviera escrito "blanco" en veintisiete lugares, habría que
ir a buscar los veintisiete.

Los grupos de tokens son: fondos y superficies (`--fondo-app`, `--superficie`,
`--superficie-hundida`, `--superficie-hover`, `--borde-card`, `--sombra-card`,
`--velo-modal`), texto (`--texto-principal`, `--texto-secundario`, `--texto-titulo`,
`--texto-sobre-color`), la barra lateral (`--barra-*`), las versiones "para texto" de los
cinco colores (`--azul-medio-texto` y compañía), los cuatro pares de tono de señal y las dos
medidas de densidad de fila.

`--fondo-alt` sigue existiendo, pero solo como sinónimo viejo de `--superficie-hundida`. En
código nuevo se usa el nombre nuevo.

**Modo claro y modo oscuro.** Los tokens se definen tres veces: en `:root` (el claro, que es
el de arranque), dentro de `@media (prefers-color-scheme: dark)` (lo que la persona tenga
puesto en su computadora, sin haber elegido nada en el Panel) y en `:root[data-tema='claro']`
/ `:root[data-tema='oscuro']` (cuando eligió a mano desde el encabezado, y esa elección le
tiene que ganar a la de la computadora **en los dos sentidos** — sin la regla de `claro`,
alguien con la computadora en oscuro no podría forzar el Panel en claro).

**Por qué `oklch` y no los `#RRGGBB` de siempre.** En `oklch` el primer número es el brillo
tal como lo ve el ojo humano. Eso permite armar el modo oscuro cambiando solo ese primer
número, con la certeza de que el color se sigue viendo del mismo tono. Con `#RRGGBB` habría
que probar a ojo, color por color.

**Contraste.** Las variantes `-texto` son el mismo tono, más oscuro, para llegar a 4.5:1
sobre fondo claro (WCAG 2.1 AA, auditado convirtiendo `oklch` a sRGB real, no estimado). Se
usan **solo** cuando el color pinta letras; bordes, barras de color y fondos de alerta usan la
variable de marca, que ya cumple el mínimo de 3:1 para esos casos. En modo oscuro esas mismas
variantes se vuelven **más claras** que la marca — la misma idea, al revés.

Regla: ningún componente define un color fuera de estas variables. Si hace falta un tono
nuevo, se agrega a `variables.css` primero, con justificación. Las tarjetas (`.metrica-card`,
`.panel-kpi-card`, etc.) usan `border: 1px solid var(--borde-card)`, no `border-left`
grueso de acento — ese patrón de acento lateral queda reservado a los indicadores de
estado semántico (guardias, alertas), ver abajo.

## Los cinco tonos de señal

Todo lo que el Panel marca como "está bien" / "prestá atención" / "esto es grave" / "esto es
un dato más" / "esto no dice nada" sale de acá y de ningún otro lado.

| Tono | Qué significa | Clase |
|---|---|---|
| `exito` | Terminado, al día, verificado, aprobado | `.badge-exito` |
| `atencion` | Falta algo, hay que mirarlo — **no es un error** | `.badge-atencion` |
| `critico` | Está mal, se venció, se canceló | `.badge-critico` |
| `info` | Un hecho neutro que conviene ver, sin culpa asociada | `.badge-info` |
| `neutro` | Sin estado, o estado que no dice nada | `.badge-neutro` |

Hay **un solo lugar** que decide qué estado del negocio corresponde a qué tono:
`panel/src/lib/tonos.js` («Ningún patrón repetido sin punto único de verdad», de `celtatech/CLAUDE.md`). Una pantalla nunca elige el color de
un estado: llama a `claseBadge(estado)` y recibe la clase ya resuelta. Cuando el tono no
depende de un estado con nombre sino de un sí/no, se usa `claseBadgeTono(TONO.EXITO)`.

`variables.css` solo dice de qué color se pinta cada tono (un par por tono: un fondo suave y
una letra legible encima). `index.css` define **cinco** reglas de badge y ninguna más. Un
estado nuevo se agrega al mapa de `tonos.js`; **no** se inventa una clase CSS nueva — una
clase que no existe se ve gris y nadie se entera de que está rota.

## Los dos vacíos

Una lista vacía no siempre significa lo mismo, y decirle a la persona lo mismo en los dos
casos la deja sin saber qué hacer:

- **No hay nada cargado todavía.** "Todavía no hay nada acá." La salida es cargar el primer
  registro.
- **Hay datos, pero el filtro no encontró ninguno.** "El filtro no encontró nada." La salida
  es sacar los filtros, y el botón para hacerlo aparece ahí mismo.

`panel/src/components/layout/EstadoLista.jsx` es el único componente que dibuja los cuatro
estados de carga que exige «Todo componente que carga datos maneja cuatro estados», de
`celtatech/CLAUDE.md` (cargando / error / vacío / listo), y
distingue los dos vacíos mirando `filtrado`. Ese dato se lo pasa
`panel/src/hooks/useFiltros.js`, que es el punto único de verdad de los filtros de una lista:
guarda los valores, sabe si hay alguno puesto (`hayFiltros`) y sabe cómo sacarlos (`limpiar`).

Detalle que importa: "hay filtros puestos" significa **distinto del valor con el que abrió la
pantalla**, no "no está vacío". Hay pantallas que abren ya filtradas a propósito —
Documentación abre mostrando lo vencido y lo por vencer, Guardias abre en un rango de fechas.
Para esas, dejarlo como está no cuenta como filtro puesto, y "sacar los filtros" las devuelve
a como abrieron, no a mostrar todo.

## Densidad de las filas

Tres modos —`comoda`, `normal`, `compacta`— que cambian **solo** dos cosas: cuánto respira
cada renglón (`--densidad-fila-y`) y qué tan grande es su letra (`--densidad-fila-texto`).
Ningún otro token se toca. Existe porque un Coordinador que mira treinta guardias en una
pantalla chica necesita ver más filas de las que entran en el modo cómodo.

Se elige desde el encabezado, junto con el idioma y los colores de la pantalla. Las tres
preferencias las guarda `panel/src/context/PreferenciasVistaContext.jsx` en el navegador de
cada persona, **no en la base**: la misma persona puede querer pantalla oscura de noche en su
notebook y clara de día en la computadora de la oficina. El contexto escribe `data-tema` y
`data-densidad` en la etiqueta `<html>`, y el CSS reacciona solo.

También se respeta `prefers-reduced-motion`: quien pidió que el movimiento se reduzca no ve
transiciones. No es un extra — para algunas personas el movimiento en pantalla produce mareo
real.

## Regla de cierre del sistema de diseño

**Ningún módulo nuevo trae sus patrones propios.** Antes de escribir un color, una clase de
estado, un cartel de lista vacía o un bloque de filtros, se busca el que ya existe:

| Si hace falta… | Se usa… |
|---|---|
| un color | un token de `variables.css` |
| marcar un estado | `claseBadge()` / `claseBadgeTono()` de `lib/tonos.js` |
| cargando / error / vacío / listo | `components/layout/EstadoLista.jsx` |
| filtros de una lista | `hooks/useFiltros.js` |
| un texto visible | una clave en `i18n/translations.js`, en los tres idiomas |

Si ninguno alcanza, se amplía **ese** archivo y desde ahí lo consume la pantalla nueva. Lo que
no se hace es resolverlo localmente: esa es exactamente la forma en que un sistema de diseño
se deshace, un archivo por vez.

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

- **Display** (títulos, encabezados principales): Inter
- **Body** (interfaz, párrafos, formularios, navegación): Inter

```css
:root {
  --font-display: 'Inter', 'Segoe UI', sans-serif;
  --font-body: 'Inter', 'Segoe UI', sans-serif;
}
```

Cargada vía `<link>` de Google Fonts en `panel/index.html` (pesos 400;500;600;650;700;750).

## Layout general del Panel (vigente desde 2026-07-18)

- **Sidebar**: 232px de ancho, fondo `--azul-oscuro`. El link de navegación activo se marca
  con un punto (`::before`, redondel de 6px, color `--azul-medio`) a la izquierda del texto,
  no con un fondo resaltado.
- **Tarjetas**: fondo blanco, `border: 1px solid var(--borde-card)`, `border-radius: 12px` —
  nunca `border-left` grueso de acento (ver nota en la sección de paleta).
- **Guardias**: grilla semanal (asistentes en filas, días en columnas) con reasignación por
  drag-and-drop nativo (HTML5 `draggable`/`dragstart`/`dragover`/`drop`), no lista agrupada
  por día. Cada guardia es un chip (`.grilla-chip`, en
  `panel/src/pages/guardias/GrillaGuardias.jsx`). `guardias.asistente_id` admite vacío sólo
  en una guardia `programada` o `cancelada` (`guardias_sin_cubrir_estado_check`).
- **Comunicación**: además del hilo por Asistente (dentro del Legajo del Asistente), existe una bandeja
  global en `/comunicacion` con lista de Asistentes ordenada por último mensaje a la
  izquierda y el hilo activo a la derecha. Ambas vistas comparten el mismo componente
  (`HiloComunicacion`), no hay lógica de chat duplicada.

## Logos disponibles

Solo **la Prestadora Demo** tiene el logo necesario para el desarrollo actual (1 variante con
texto). Los logos de "divisiones" de ese negocio real de origen (Junior, Pets, Bienestar,
Hogar, Legal, Group) no se usan en esta etapa — quedan solo como referencia de paleta arriba.

## Estructura real de archivos de estilos

```
panel/src/
├── styles/variables.css   ← los tokens: colores, tipografía, densidad, modo oscuro
└── index.css              ← reset, base y estilos de componentes, todos leyendo tokens
```

El corte de `global.css` / `components.css` que este documento proponía nunca se hizo: todo
lo que no son tokens vive junto en `index.css`. Se deja registrado así, y no como plan, para
que nadie busque dos archivos que no existen. Lo que sí es innegociable es la separación de
`variables.css`: los tokens aparte, porque son lo único que cambia entre modo claro y oscuro.

## Estados visuales de alertas (Nivel 2 de IA)

Las tres clases `.alerta-verde` / `.alerta-amarilla` / `.alerta-roja` que este documento
describía **ya no existen** (retiradas el 2026-07-31). Los tres niveles que devuelve el backend
de alertas (ver `AI_PROMPTS.md`) pasaron al sistema de tonos: `roja` → `critico`,
`amarilla` → `atencion`, `verde` → `exito`. Ese mapeo vive en `panel/src/lib/tonos.js` y la
pantalla solo llama a `claseBadge(nivel)`.

El motivo del cambio es el que da nombre a los tonos: una clase que se llama por su color no
sobrevive al modo oscuro ni a un cambio de paleta, y obliga a que cada pantalla sepa que
"amarilla" quiere decir "prestá atención". Ahora eso lo sabe un solo archivo.

## Estados visuales de guardias (Módulo 6 del Panel Admin)

De las clases de acento lateral por estado, hoy existe una sola, en `panel/src/index.css`.
Reutiliza las variables de la paleta funcional, no colores nuevos:

```css
.guardia-ausente { border-left: 4px solid var(--naranja-alerta); }
```

`guardias.estado` admite seis valores (`guardias_estado_check`): `programada`, `activa`,
`completada`, `cancelada`, `ausente` y `pausada`. `ausente` es distinto de `cancelada`. Los demás
estados no tienen regla de acento: en cualquier badge de un estado de guardia se usa
`claseBadge()` como en el resto del Panel, que sí los resuelve.

## Convenciones de UI (patrón adoptado de análisis de GlamourOS/ERP salones — no vinculante,
## solo se toman estas dos prácticas puntuales, ver justificación en memoria de sesión)

- **Teléfono siempre como link, nunca texto plano.** Cualquier campo de teléfono/WhatsApp
  visible en UI (Ficha del cliente, Legajo del Asistente, tabla de postulantes) se renderiza
  como `wa.me/{telefono}`, no como texto estático — reduce fricción de contacto en un solo
  clic, consistente con el botón de WhatsApp flotante que ya define `PRD_01_Sitio_Web.md`.
- **Listas largas de opciones se agrupan por categoría, nunca scroll vertical infinito.**
  Aplica directo a la Sección D del formulario de postulación (`PRD_03_Reclutamiento.md`):
  discapacidades, patologías, tareas de cuidado directo/acompañamiento/domésticas — cada
  subgrupo se muestra como su propia sección colapsable o con su propio encabezado visual,
  no como un único muro de checkboxes.
