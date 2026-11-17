// ---------------------------------------------------------------------------
// verificar_texto_visible.mjs — el control de las reglas del texto visible
//
// Uso, desde la raíz del repo:
//   node scripts/verificar_texto_visible.mjs              (con la base local encendida)
//   node scripts/verificar_texto_visible.mjs --sin-base   (sólo los archivos)
//   node scripts/verificar_texto_visible.mjs --json=<ruta> (además, guarda los hallazgos
//                                                           completos en esa ruta)
//
// Revisa cuatro cosas y devuelve código de salida 1 si alguna falla:
//
//   1. TEXTO ESCRITO A MANO. Que ninguna pantalla tenga una frase escrita
//      directamente en el código en lugar de salir del archivo de traducciones.
//      Una frase así se ve igual que cualquier otra, pero existe en un solo
//      idioma: quien mire el producto en inglés o en portugués encuentra un
//      castellano suelto en el medio.
//
//   2. TRATO EN LOS ARCHIVOS DE CÓDIGO. Que ningún texto suelto del código —un
//      mensaje que arma el backend, un atributo de una pantalla— tutee a quien lo
//      lee. Ahí no se sabe de antemano qué es frase y qué es un valor del sistema,
//      así que sólo se revisa el trato, que es lo que menos se confunde.
//
//   3. REDACCIÓN DE LAS TRADUCCIONES Y DEL SITIO WEB. Todas las reglas marcadas
//      «(lo revisa el control)» en la parte «Textos de la interfaz» del glosario de
//      los productos Careonys, sobre cada texto de los archivos de traducciones de
//      las tres aplicaciones y del sitio web, en los tres idiomas.
//
//   4. REDACCIÓN DE LOS TEXTOS GUARDADOS EN LA BASE. Las mismas reglas, para el
//      texto visible que no está en ningún archivo del repositorio: la advertencia
//      legal, el consentimiento que se firma, los catálogos, los mensajes del
//      sistema. Se consulta la base real —no los archivos de migración, que dicen lo
//      que se cargó aquel día y no lo que la gente lee hoy— y únicamente el texto que
//      escribió la plataforma, nunca lo que escribió una Prestadora ni un dato de una
//      persona (el porqué está escrito arriba de la lista, más abajo).
//
// LAS REGLAS VIVEN EN `reglas_del_texto_visible.mjs`, una sola vez, y las usan las
// revisiones 3 y 4. Ahí está también la lista de excepciones.
//
// POR QUÉ EXISTE. Las reglas estaban escritas desde siempre y se violaron igual,
// porque sólo las controlaba una persona leyendo. Una regla que sólo se comprueba
// leyendo se rompe sola con el tiempo; una que corta la publicación, no.
//
// CUANDO ESTE PROGRAMA FALLA hay exactamente dos respuestas correctas:
//   - corregir el texto, o
//   - si el programa se equivocó, agregar una excepción para ese texto o esa clave
//     sola, con su motivo escrito al lado.
// Nunca apagar el control ni una regla entera.
//
// LO QUE NO REVISA, a propósito: son coladores de patrones, no entienden lo que
// leen. Atrapan lo que se repite —una frase entre etiquetas, una palabra prohibida,
// un signo—, no un texto mal redactado ni una traducción floja. Que pase esto no
// reemplaza leer lo que se escribió.
// ---------------------------------------------------------------------------

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname, extname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { reglasRotasEnElTexto, tuteosEnElTexto } from './reglas_del_texto_visible.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/* El nombre del producto que se imprime en el informe sale del punto único de la marca,
   igual que en `verificar_identidad.mjs`: escrito acá, cambiar el nombre obligaría a
   acordarse de este archivo. */
const { IDENTIDAD } = await import(new URL('../backend/src/config/identidadProducto.js', import.meta.url));

/* Las tres aplicaciones que ve un cliente. `sitio-web/` no entra en la revisión 1
   porque es una página estática de una sola pieza, sin archivo de traducciones:
   ahí el texto en el HTML no es una violación sino el diseño. Sí entra en la
   revisión 2, que es la del trato. */
const APPS = ['panel', 'pwa-clientes', 'pwa-asistentes'];

/* Archivos que hablan solamente con quien programa, nunca con un cliente. La
   pantalla de muestra del Panel está montada bajo `import.meta.env.DEV`, así que
   no existe en el producto publicado. */
const SOLO_PARA_DESARROLLO = [
  'panel/src/pages/Muestra.jsx',
  'panel/src/pages/MuestraEstadoActual.jsx',
];

/* Archivos cuyos textos son instrucciones dirigidas a un modelo de inteligencia
   artificial, no frases para que las lea una persona.

   Lo que el modelo *responde* sí lo lee una persona, y eso este programa no lo puede
   revisar: esa frase no existe en ningún archivo hasta que el modelo contesta. Por eso
   la regla del trato se le dice al modelo adentro de la instrucción, escrita una sola
   vez en `backend/src/utils/tratoIA.js`, que los cuatro prompts insertan. Ese archivo
   entra en esta lista justamente porque nombra las formas prohibidas para prohibirlas
   —dice "nunca 'vos', 'podés'"—, y el colador, que no entiende lo que lee, las
   marcaría como si las estuviera usando.

   Si alguna vez se saca una instrucción de esta lista, el control la va a marcar por
   las palabras del bloque de trato, no por un error. */
const INSTRUCCIONES_PARA_LA_IA = [
  'backend/src/utils/alertasIA.js',
  'backend/src/utils/iaPlantillasWhatsapp.js',
  'backend/src/utils/iaWhatsapp.js',
  'backend/src/utils/importacionIA.js',
  'backend/src/utils/reporteIA.js',
  'backend/src/utils/tratoIA.js',
];

// ---------------------------------------------------------------------------
// Recorrido de archivos
// ---------------------------------------------------------------------------

function archivosDe(dir, extensiones) {
  if (!existsSync(dir)) return [];
  const salida = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...archivosDe(ruta, extensiones));
    else if (extensiones.includes(extname(nombre))) salida.push(ruta);
  }
  return salida;
}

const rutaCorta = (ruta) => relative(RAIZ, ruta).replaceAll('\\', '/');

/* Los comentarios se sacan antes de revisar nada: están escritos para quien lee el
   código, no para quien usa el producto, y no tienen por qué respetar ni una regla
   ni la otra. Las líneas se conservan (se reemplaza por líneas vacías) para que el
   número de línea que se informa siga siendo el verdadero. */
function sinComentarios(texto) {
  const vaciar = (m) => m.replace(/[^\n]/g, ' ');
  return texto
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, vaciar) // {/* … */} de JSX
    .replace(/\/\*[\s\S]*?\*\//g, vaciar) //           /* … */
    .replace(/^([ \t]*)\/\/.*$/gm, (m) => vaciar(m)); //  // … a principio de línea
}

// ---------------------------------------------------------------------------
// Revisión 1 — texto escrito a mano en una pantalla
// ---------------------------------------------------------------------------

/* Una frase entre etiquetas: `<span>Cargando…</span>`. Se descarta todo lo que
   tenga llaves, porque eso ya es código —`{t.comun.cargando}`, `{{producto}}`— y
   por lo tanto sale de las traducciones o de la identidad del producto.
   El `>` no puede venir de una flecha `=>` ni de una comparación, y después del `<`
   tiene que empezar una etiqueta de verdad y no un `<=`: sin esas dos condiciones,
   `findIndex((fin) => fin <= arranca)` se lee como si "fin" fuera una frase. */
const RE_ENTRE_ETIQUETAS = /(?<![=<>!-])>[\s]*([^<>{}\n]*?\p{L}{3,}[^<>{}\n]*?)[\s]*<(?=[/a-zA-Z])/gu;

/* Los atributos que la persona igual termina leyendo o escuchando: el texto gris
   de un campo vacío, el cartelito al pasar el mouse, lo que dice el lector de
   pantalla, la descripción de una imagen que no cargó. */
const RE_ATRIBUTO_VISIBLE = /\b(placeholder|title|aria-label|alt)\s*=\s*"([^"{}\n]*?\p{L}{3,}[^"{}\n]*?)"/gu;

/* Señales de que lo que se capturó es código y no una frase: una comparación
   (`n > 0 && lista.length < 5` deja `0 && lista.length` en el medio), una llamada
   a una función, un punto y coma. Ninguna frase de pantalla los tiene. */
const PARECE_CODIGO = /[=&|()[\];$`_]|=>|\.\w/;

/* Los dos brazos de un `condición ? esto : aquello` escrito entre etiquetas dejan
   restos que empiezan con dos puntos o con signo de pregunta. Ninguna frase de
   pantalla empieza así, ni lleva un signo de pregunta suelto entre espacios. */
const PARECE_CONDICION = /^[:?]|\s\?\s/;

/* Un número romano es el mismo en los tres idiomas: es un valor de una lista
   (Grado I, II, III), no una frase para traducir. */
const ES_NUMERO_ROMANO = /^[IVXLCDM]{1,6}$/;

/* Palabras sueltas que son valores del sistema, no frases: aparecen entre
   etiquetas en tablas y listas. Se comparan en minúsculas y sin acentos. */
const NO_ES_FRASE = new Set(['null', 'undefined', 'true', 'false', 'nan']);

function revisarTextoAMano() {
  const hallazgos = [];

  const archivos = [
    ...APPS.flatMap((app) => archivosDe(join(RAIZ, app, 'src'), ['.jsx'])),
    ...APPS.map((app) => join(RAIZ, app, 'index.html')).filter(existsSync),
  ];

  for (const ruta of archivos) {
    const corta = rutaCorta(ruta);
    if (SOLO_PARA_DESARROLLO.includes(corta)) continue;

    const contenido = sinComentarios(readFileSync(ruta, 'utf8'));
    const lineaDe = (indice) => contenido.slice(0, indice).split('\n').length;

    for (const [re, grupo] of [[RE_ENTRE_ETIQUETAS, 1], [RE_ATRIBUTO_VISIBLE, 2]]) {
      re.lastIndex = 0;
      for (const m of contenido.matchAll(re)) {
        const frase = m[grupo].trim();
        if (!frase || PARECE_CODIGO.test(frase) || PARECE_CONDICION.test(frase)) continue;
        if (ES_NUMERO_ROMANO.test(frase)) continue;
        if (NO_ES_FRASE.has(frase.toLowerCase())) continue;
        hallazgos.push({ archivo: corta, linea: lineaDe(m.index), frase });
      }
    }
  }

  return hallazgos;
}

// ---------------------------------------------------------------------------
// Revisión 2 — el trato en los archivos de código
// ---------------------------------------------------------------------------

/* Se revisan únicamente los textos entre comillas. Es lo que se le muestra a
   alguien; todo lo demás es código. */
const RE_TEXTOS_ENTRE_COMILLAS = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;

/* Los archivos de traducciones de cada aplicación. No entran en esta revisión: los
   revisa entera la revisión 3, con todas las reglas, y así no sale dos veces el
   mismo hallazgo. */
const TRADUCCIONES = APPS.map((app) => `${app}/src/i18n/translations.js`);

const recortar = (texto) => (texto.length > 90 ? `${texto.slice(0, 90)}…` : texto);

function revisarTrato() {
  const hallazgos = [];

  const archivos = [
    ...archivosDe(join(RAIZ, 'backend', 'src'), ['.js']),
    ...APPS.flatMap((app) => archivosDe(join(RAIZ, app, 'src'), ['.js', '.jsx'])),
    ...APPS.map((app) => join(RAIZ, app, 'index.html')).filter(existsSync),
    join(RAIZ, 'sitio-web', 'index.html'),
  ].filter(existsSync);

  for (const ruta of archivos) {
    const corta = rutaCorta(ruta);
    if (SOLO_PARA_DESARROLLO.includes(corta)) continue;
    if (INSTRUCCIONES_PARA_LA_IA.includes(corta)) continue;
    if (TRADUCCIONES.includes(corta)) continue;

    const contenido = sinComentarios(readFileSync(ruta, 'utf8'));
    const lineaDe = (indice) => contenido.slice(0, indice).split('\n').length;

    /* El HTML no tiene comillas alrededor de sus frases: ahí se revisa el texto
       que queda entre etiquetas, sin el bloque de programa, cuyos textos revisa la
       revisión 3. En los archivos de código, los textos entre comillas. */
    const esHtml = corta.endsWith('.html');
    const trozos = [];
    if (esHtml) {
      const sinPrograma = contenido.replace(/<script[\s\S]*?<\/script>/g, (m) => m.replace(/[^\n]/g, ' '));
      for (const m of sinPrograma.matchAll(/>([^<>]*)</g)) trozos.push({ texto: m[1], indice: m.index });
    } else {
      for (const m of contenido.matchAll(RE_TEXTOS_ENTRE_COMILLAS)) {
        trozos.push({ texto: m[1] ?? m[2] ?? m[3] ?? '', indice: m.index });
      }
    }

    for (const { texto, indice } of trozos) {
      const encontradas = tuteosEnElTexto(texto);
      if (encontradas.length === 0) continue;
      hallazgos.push({
        archivo: corta,
        linea: lineaDe(indice),
        palabras: encontradas.join(', '),
        frase: recortar(texto),
      });
    }
  }

  return hallazgos;
}

// ---------------------------------------------------------------------------
// Revisión 3 — la redacción de las traducciones y del sitio web
// ---------------------------------------------------------------------------

const IDIOMAS = ['es-AR', 'en', 'pt-BR'];

/* Cada texto de un archivo de traducciones, con su nombre completo: las partes
   separadas por puntos, y el lugar en la lista entre corchetes. */
function aplanar(objeto, prefijo, salida) {
  for (const [k, v] of Object.entries(objeto || {})) {
    const clave = prefijo ? `${prefijo}.${k}` : k;
    if (typeof v === 'string') salida.push([clave, v]);
    else if (Array.isArray(v)) {
      v.forEach((x, i) => (typeof x === 'string' ? salida.push([`${clave}[${i}]`, x]) : aplanar(x, `${clave}[${i}]`, salida)));
    } else if (v && typeof v === 'object') aplanar(v, clave, salida);
  }
  return salida;
}

/* El sitio web es una página de una sola pieza: sus textos están en un bloque
   `var TEXTOS = { … }` adentro de la página. Se toma ese bloque contando llaves y se
   lo evalúa aparte, sin nada alrededor. */
function textosDelSitioWeb() {
  const ruta = join(RAIZ, 'sitio-web', 'index.html');
  if (!existsSync(ruta)) return null;
  const html = readFileSync(ruta, 'utf8');
  const inicio = html.indexOf('var TEXTOS =');
  if (inicio < 0) throw new Error('No encontré el bloque de textos del sitio web.');
  const desde = html.indexOf('{', inicio);
  let nivel = 0;
  let fin = desde;
  for (; fin < html.length; fin++) {
    if (html[fin] === '{') nivel++;
    else if (html[fin] === '}' && --nivel === 0) break;
  }
  return vm.runInNewContext(`(${html.slice(desde, fin + 1)})`, {});
}

async function revisarTraducciones() {
  const fuentes = [];
  for (const app of APPS) {
    const ruta = join(RAIZ, app, 'src', 'i18n', 'translations.js');
    if (!existsSync(ruta)) continue;
    const { T } = await import(pathToFileURL(ruta).href);
    fuentes.push({ archivo: rutaCorta(ruta), textos: T });
  }
  const sitio = textosDelSitioWeb();
  if (sitio) fuentes.push({ archivo: 'sitio-web/index.html', textos: sitio });

  const hallazgos = [];
  let cuantos = 0;
  for (const { archivo, textos } of fuentes) {
    for (const idioma of IDIOMAS) {
      for (const [clave, texto] of aplanar(textos[idioma], '', [])) {
        cuantos++;
        const reglas = reglasRotasEnElTexto(texto, idioma, clave);
        if (reglas.length) hallazgos.push({ archivo, clave, idioma, texto, reglas });
      }
    }
  }
  return { cuantos, hallazgos };
}

// ---------------------------------------------------------------------------
// Revisión 4 — la redacción de los textos guardados en la base
// ---------------------------------------------------------------------------

/* Hay texto visible que no está en ningún archivo del repositorio: vive en la base,
   porque la regla «Nunca hardcodear» prohíbe escribirlo en el código. La advertencia
   legal que se muestra al activar una función riesgosa, el consentimiento que firma
   el Asistente, los catálogos, los mensajes del sistema: todos salen de una tabla.

   SE CONSULTA LA BASE, NO LOS ARCHIVOS DE MIGRACIÓN. Un archivo de migración dice lo
   que se cargó aquel día; la base dice lo que la gente lee hoy.

   QUÉ SE MIRA Y QUÉ NO. Únicamente el texto que escribió la plataforma: el catálogo
   general que viene con el producto. Nunca una fila que escribió una Prestadora, y
   nunca un dato de una persona. El motivo no es de estilo: este programa imprime en
   pantalla lo que encuentra, y esa pantalla queda guardada en el registro público de
   la publicación. Un reporte diario, una observación, el nombre de un Paciente son
   datos de salud y datos personales. Por eso la lista de abajo se escribe a mano,
   tabla por tabla, y no se arma sola recorriendo el esquema.

   El corte entre las dos cosas es la columna `prestadora_id`: donde no existe, la
   tabla entera es de la plataforma; donde existe, son de la plataforma solamente las
   filas que la tienen vacía, que son las del catálogo general.

   Cada renglón dice:
     - `tabla` y `columnas`: dónde está el texto;
     - `señal`: con qué se reconoce la fila en el informe (nunca un dato de persona);
     - `idioma`: la columna que dice el idioma del texto o, si no hay, el idioma fijo
       entre comillas simples. Si falta, es castellano;
     - `porIdioma`: la columna guarda un texto por idioma (`{"es-AR": …, "en": …}`);
     - `soloGeneral`: sólo las filas del catálogo general;
     - `condicion`: otra condición sobre las filas.
   Qué columnas son títulos, etiquetas u opciones de una lista lo dice el archivo de
   las reglas. */
const TEXTOS_DE_LA_PLATAFORMA = [
  // La advertencia que se muestra al activar una función con riesgo legal.
  { tabla: 'advertencias_legales', señal: "jurisdiccion || ' / ' || funcion_clave", columnas: ['texto_advertencia'] },
  // Lo que lee y acepta un Asistente o un Cliente antes de que se active algo. Sólo la versión vigente.
  {
    tabla: 'textos_consentimiento',
    señal: "jurisdiccion || ' / ' || clave || ' / v' || version",
    columnas: ['titulo', 'cuerpo'],
    idioma: 'idioma',
    condicion: 'vigente_hasta is null',
  },
  { tabla: 'textos_autorizacion_signos_vitales', señal: 'idioma', columnas: ['cuerpo'], idioma: 'idioma', soloGeneral: true },
  { tabla: 'textos_consentimiento_medicacion', señal: 'idioma', columnas: ['cuerpo'], idioma: 'idioma', soloGeneral: true },
  { tabla: 'textos_consentimiento_pagador', señal: 'idioma', columnas: ['cuerpo'], idioma: 'idioma', soloGeneral: true },
  // Los catálogos generales.
  { tabla: 'configuracion_notificaciones', señal: 'evento', columnas: ['descripcion'], soloGeneral: true },
  { tabla: 'tipos_asistente', señal: 'clave', columnas: ['nombre', 'descripcion'], soloGeneral: true },
  { tabla: 'tareas_tipo_asistente', señal: 'clave', columnas: ['texto', 'descripcion'], soloGeneral: true },
  { tabla: 'etapas_incorporacion_asistente', señal: 'clave', columnas: ['nombre'], soloGeneral: true },
  { tabla: 'tipos_documento_asistente', señal: 'nombre', columnas: ['nombre'], soloGeneral: true },
  { tabla: 'tipos_documento_pagador', señal: 'nombre', columnas: ['nombre'], soloGeneral: true },
  { tabla: 'especialidades', señal: 'nombre', columnas: ['nombre'], soloGeneral: true },
  { tabla: 'conceptos_liquidacion', señal: 'nombre', columnas: ['nombre'], soloGeneral: true },
  { tabla: 'lista_de_comprobacion_baja_servicio', señal: 'nombre', columnas: ['nombre'], soloGeneral: true },
  { tabla: 'motivos_aviso_previo_guardia', señal: 'nombre', columnas: ['nombre'], soloGeneral: true },
  { tabla: 'motivos_cierre_servicio', señal: 'clave', columnas: ['nombre'], soloGeneral: true },
  { tabla: 'motivos_reactivacion_servicio', señal: 'nombre', columnas: ['nombre'], soloGeneral: true },
  { tabla: 'motivos_resolucion', señal: "tabla || ' / ' || estado", columnas: ['nombre_es_ar'], idioma: "'es-AR'", soloGeneral: true },
  { tabla: 'motivos_resolucion', señal: "tabla || ' / ' || estado", columnas: ['nombre_en'], idioma: "'en'", soloGeneral: true },
  { tabla: 'motivos_resolucion', señal: "tabla || ' / ' || estado", columnas: ['nombre_pt_br'], idioma: "'pt-BR'", soloGeneral: true },
  { tabla: 'motivos_sustitucion_guardia', señal: 'clave', columnas: ['nombre'], soloGeneral: true },
  { tabla: 'formas_de_cobro_intermediacion', señal: 'nombre', columnas: ['nombre'], soloGeneral: true },
  { tabla: 'relaciones_laborales', señal: 'nombre', columnas: ['nombre'], soloGeneral: true },
  { tabla: 'finales_turno_sin_cubrir', señal: 'clave', columnas: ['nombre'], soloGeneral: true },
  { tabla: 'opciones_postulacion', señal: "grupo || ' / ' || clave", columnas: ['etiqueta'], soloGeneral: true },
  { tabla: 'contenidos', señal: 'id', columnas: ['titulo', 'cuerpo'], soloGeneral: true },
  { tabla: 'plantillas_whatsapp', señal: 'nombre_interno', columnas: ['cuerpo_texto'], idioma: 'idioma', soloGeneral: true },
  { tabla: 'configuracion_escalada_relevo', señal: 'nivel', columnas: ['plantilla_mensaje'], soloGeneral: true },
  // Catálogos que no tienen filas de ninguna Prestadora.
  { tabla: 'catalogo_software_externo', señal: 'clave', columnas: ['nombre'] },
  { tabla: 'indices_de_actualizacion', señal: 'codigo', columnas: ['nombre'] },
  { tabla: 'organismos_otorgantes', señal: 'pais', columnas: ['nombre'] },
  // Los textos que guardan un valor por idioma.
  { tabla: 'mensajes_del_sistema', señal: 'clave', columnas: ['i18n'], porIdioma: true, soloGeneral: true },
  { tabla: 'listas_de_opciones', señal: 'clave', columnas: ['i18n'], porIdioma: true, soloGeneral: true },
  { tabla: 'opciones_de_lista', señal: 'clave', columnas: ['i18n'], porIdioma: true, soloGeneral: true },
  { tabla: 'respuestas_preparadas_whatsapp', señal: 'nombre_interno', columnas: ['i18n'], porIdioma: true, soloGeneral: true },
  { tabla: 'formulario_campos', señal: 'clave', columnas: ['etiqueta'], porIdioma: true, soloGeneral: true },
  { tabla: 'formulario_secciones', señal: 'clave', columnas: ['titulo'], porIdioma: true, soloGeneral: true },
  { tabla: 'formularios_declarados', señal: 'clave', columnas: ['titulo'], porIdioma: true, soloGeneral: true },
];

/* Cómo se llega a la base: siempre por el contenedor local, que tiene usuario y contraseña
   fijos y conocidos, no son un secreto. En la publicación es la base que
   `probar-aislamiento-en-la-base.yml` levanta desde cero con las migraciones, que es el único
   lugar de donde sale el catálogo de la plataforma. Nunca se entra con una cuenta que lea
   todas las Prestadoras (`celtatech/CLAUDE.md`, sección «Aislamiento entre Organizaciones»). */
function consultarBase(consulta) {
  const opciones = { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 };
  /* El contenedor local se llama `supabase_db_<proyecto>`, y ese `<proyecto>` sale de
     `supabase/config.toml`, que es quien se lo puso. Se lee de ahí y no se escribe a mano. */
  const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
  const proyecto = config.match(/^\s*project_id\s*=\s*"([^"]+)"/m)?.[1];
  if (!proyecto) throw new Error('No encontré project_id en supabase/config.toml');

  return execFileSync(
    'docker',
    ['exec', '-i', `supabase_db_${proyecto}`, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-c', consulta],
    opciones,
  );
}

/* Una sola consulta con todas las tablas pegadas una abajo de la otra, y el resultado
   en un solo bloque de JSON. Así el texto puede tener comillas, barras o renglones
   adentro sin romper la lectura. */
function consultaDeLosTextosDeLaBase() {
  const trozos = TEXTOS_DE_LA_PLATAFORMA.flatMap(({ tabla, señal, columnas, idioma, porIdioma, soloGeneral, condicion }) =>
    columnas.map((columna) => {
      const filtros = [soloGeneral && 'm.prestadora_id is null', condicion && `(${condicion})`].filter(Boolean);
      const donde = filtros.length ? ` where ${filtros.join(' and ')}` : '';
      if (porIdioma) {
        return (
          `select '${tabla}.${columna}' as origen, (${señal})::text as fila, e.key as idioma, e.value as texto ` +
          `from ${tabla} m, jsonb_each_text(m.${columna}) e${donde}`
        );
      }
      return (
        `select '${tabla}.${columna}' as origen, (${señal})::text as fila, (${idioma || "'es-AR'"})::text as idioma, ` +
        `m.${columna}::text as texto from ${tabla} m${donde}`
      );
    }),
  );
  return `select coalesce(json_agg(f), '[]')::text from (${trozos.join(' union all ')}) f where texto is not null;`;
}

function revisarTextosDeLaBase() {
  let filas;
  try {
    filas = JSON.parse(consultarBase(consultaDeLosTextosDeLaBase()).trim());
  } catch (e) {
    return { revisada: false, motivo: (e.stderr || e.message || String(e)).trim().split('\n').slice(-3).join('\n'), hallazgos: [] };
  }

  const hallazgos = [];
  for (const { origen, fila, idioma, texto } of filas) {
    const clave = `${origen}:${fila}`;
    const reglas = reglasRotasEnElTexto(texto, idioma, clave);
    if (reglas.length) hallazgos.push({ archivo: origen, clave: fila, idioma, texto, reglas });
  }
  return { revisada: true, cuantos: filas.length, hallazgos };
}

// ---------------------------------------------------------------------------
// Informe
// ---------------------------------------------------------------------------

function informar(titulo, hallazgos, formatear, explicacion) {
  if (hallazgos.length === 0) {
    console.log(`### ${titulo}: sin hallazgos`);
    return false;
  }
  console.log(`\n### ${titulo}: ${hallazgos.length} hallazgos`);
  for (const h of hallazgos) console.log(formatear(h));
  console.log(`\n${explicacion}`);
  return true;
}

/* Un texto puede romper varias reglas: se imprime un renglón por regla, con el
   nombre de la regla y lo que la rompió. */
const formatearRedaccion = (h) =>
  `  ${h.archivo} · ${h.idioma} · ${h.clave}  →  "${recortar(h.texto)}"\n` +
  h.reglas.map((r) => `      ${r.nombre}: «${r.encontrado}»`).join('\n');

/* `--sin-base` lo usa `verificar-textos.yml`, que corre en cada push y no levanta ninguna base:
   los textos de la base los revisa `probar-aislamiento-en-la-base.yml`, que corre cada vez que
   cambia `supabase/`, que es lo único que puede cambiarlos. */
const sinBase = process.argv.includes('--sin-base');
const rutaJson = process.argv.find((a) => a.startsWith('--json='))?.slice('--json='.length);
const aMano = revisarTextoAMano();
const trato = revisarTrato();
const traducciones = await revisarTraducciones();
const base = sinBase ? null : revisarTextosDeLaBase();

const falla1 = informar(
  'Texto escrito a mano en una pantalla',
  aMano,
  (h) => `  ${h.archivo}:${h.linea} — "${h.frase}"`,
  'Ese texto existe en un solo idioma. Va al archivo de traducciones, en los tres,\ny la pantalla lo toma de ahí (reglas «Nunca hardcodear» e «i18n desde el día uno»).',
);

const falla2 = informar(
  'Textos de los archivos de código que tutean a quien los lee',
  trato,
  (h) => `  ${h.archivo}:${h.linea} — ${h.palabras}  →  "${h.frase}"`,
  'El texto visible va de usted, o en forma impersonal. En portugués, forma impersonal\ny "você" sólo donde no quede otra.',
);

const falla3 = informar(
  'Textos de las traducciones y del sitio web que rompen una regla de redacción',
  traducciones.hallazgos,
  formatearRedaccion,
  `Cada regla está escrita en la parte «Textos de la interfaz» del glosario de los\nproductos ${IDENTIDAD.nombre}. Se corrige el texto; si la regla se equivocó, se agrega una\nexcepción para ese texto solo, con su motivo.`,
);
if (traducciones.hallazgos.length === 0) console.log(`  (${traducciones.cuantos} textos revisados)`);

/* Que no se llegue a la base es una falla cuando esto corre en la publicación: si se
   dejara pasar, el control se apagaría solo el día que cambie una clave y nadie se
   enteraría. En la máquina de quien programa solamente avisa, porque ahí el
   contenedor local puede estar apagado por cualquier motivo. */
let falla4 = false;
if (sinBase) {
  console.log('\n### Textos guardados en la base: los revisa la prueba de aislamiento en la base');
} else if (!base.revisada) {
  const enLaPublicacion = !!process.env.CI;
  console.log(`\n### Textos guardados en la base: no se pudo consultar\n${base.motivo}`);
  console.log(
    enLaPublicacion
      ? '\nSin base no hay control. Revise que el automatismo haya levantado la base local.'
      : '\nAviso: los textos guardados en la base quedaron sin revisar. Para revisarlos, encienda\nla base local (`npx supabase start`). El automatismo de la publicación sí los revisa siempre.',
  );
  falla4 = enLaPublicacion;
} else {
  falla4 = informar(
    'Textos guardados en la base que rompen una regla de redacción',
    base.hallazgos,
    formatearRedaccion,
    'Ese texto no está en ningún archivo: vive en la base y se corrige con una migración.\nLas reglas son las mismas que arriba.',
  );
  if (base.hallazgos.length === 0) console.log(`  (${base.cuantos} textos de la plataforma revisados)`);
}

if (rutaJson) {
  writeFileSync(
    rutaJson,
    JSON.stringify({ aMano, trato, traducciones: traducciones.hallazgos, base: base?.revisada ? base.hallazgos : null }, null, 2),
  );
}

process.exit(falla1 || falla2 || falla3 || falla4 ? 1 : 0);
