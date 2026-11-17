// ---------------------------------------------------------------------------
// verificar_entrenamiento_con_datos.mjs — ningún modelo se entrena con datos de las Prestadoras
//
// Uso, desde la raíz del repo:
//   node scripts/verificar_entrenamiento_con_datos.mjs
//   node scripts/verificar_entrenamiento_con_datos.mjs --raiz <carpeta>   (revisa otra carpeta)
//
// QUÉ CAZA
//   Toda llamada que entrene o ajuste un modelo de IA: el ajuste fino de OpenAI, Azure y Mistral,
//   los modelos ajustados de Gemini, los trabajos de ajuste de Vertex, la personalización de
//   modelos de Bedrock —que es la vía para ajustar Claude—, los trabajos de entrenamiento de
//   SageMaker y el entrenamiento automático de Hugging Face. Basta que aparezca una para que
//   termine con código de salida 1 y la publicación no salga.
//
// POR QUÉ NO DISTINGUE CON QUÉ DATOS
//   Todo lo que se publica corre contra la base en vivo, así que una llamada de entrenamiento en
//   el código publicado entrena con datos de producción. Entrenar con los datos de las Prestadoras
//   está prohibido sin excepción (docs/PLAN_HASTA_PRODUCCION.md, «Lo que no se hace nunca»), y no
//   hay ninguna razón para que el producto entrene un modelo con otros datos.
//
// QUÉ NO REVISA, a propósito:
//   - Archivos .md — la documentación puede nombrar la prohibición.
//   - Líneas que son sólo comentario (//, *, --, #): un comentario no llama a nadie.
//   - Las carpetas de pruebas (__tests__): corren con una base de mentira, nunca con datos reales.
//   - Dependencias, armados, la documentación y las cajas fuertes, que no se abren.
//
// Si mañana aparece otro proveedor con otra forma de entrenar, se agrega su forma a
// FORMAS_DE_ENTRENAMIENTO. Nunca se agrega un archivo permitido.
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, extname, sep, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ESTE_ARCHIVO = fileURLToPath(import.meta.url);
const RAIZ_DEL_REPO = join(dirname(ESTE_ARCHIVO), '..');

/** Cada forma es la que usa un proveedor para entrenar o ajustar un modelo. */
export const FORMAS_DE_ENTRENAMIENTO = [
  { que: 'ajuste fino (OpenAI, Azure, Mistral, Cohere)', forma: /fine[_-]?tun(e|es|ed|ing)/i },
  { que: 'modelos ajustados de Gemini', forma: /tuned_?models/i },
  { que: 'trabajos de ajuste de Vertex', forma: /tuning_?jobs?\b/i },
  { que: 'personalización de modelos de Bedrock', forma: /model_?customization_?jobs?/i },
  { que: 'trabajos de entrenamiento de SageMaker', forma: /create_?training_?job/i },
  { que: 'entrenamiento automático de Hugging Face', forma: /\bautotrain\b/i },
];

const DIRECTORIOS_IGNORADOS = new Set([
  'node_modules', '.git', '.claude', '.playwright-mcp', '.wrangler', '.temp',
  'dist', 'build', 'coverage', 'docs', '__tests__',
]);

// Las cajas fuertes no se abren: se comparan sin mayúsculas para que ninguna variante se cuele.
const CAJAS_FUERTES = new Set(['no_commit', 'no commit', 'no hacer commit', 'no pushear', 'referencianohacercommit']);
const esCajaFuerte = (nombre) => {
  const n = nombre.toLowerCase();
  return CAJAS_FUERTES.has(n) || n.startsWith('exclusivo ');
};

const EXTENSIONES_REVISADAS = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.py', '.sh',
  '.html', '.json', '.sql', '.yml', '.yaml', '.toml',
]);

// Los candados de versiones listan nombres de bibliotecas, no llamadas.
const ARCHIVOS_IGNORADOS = new Set(['package-lock.json']);

const INICIOS_DE_COMENTARIO = ['//', '*', '/*', '--', '#'];
const esLineaDeComentario = (linea) => INICIOS_DE_COMENTARIO.some((i) => linea.trimStart().startsWith(i));

function* recorrer(directorio) {
  for (const entrada of readdirSync(directorio)) {
    if (DIRECTORIOS_IGNORADOS.has(entrada) || esCajaFuerte(entrada)) continue;
    const ruta = join(directorio, entrada);
    if (statSync(ruta).isDirectory()) yield* recorrer(ruta);
    else if (EXTENSIONES_REVISADAS.has(extname(entrada)) && !ARCHIVOS_IGNORADOS.has(entrada)) yield ruta;
  }
}

/** Las llamadas de entrenamiento que hay debajo de `raiz`, con archivo, renglón y cuál es. */
export function llamadasDeEntrenamiento(raiz = RAIZ_DEL_REPO) {
  const hallazgos = [];
  for (const rutaAbsoluta of recorrer(raiz)) {
    if (resolve(rutaAbsoluta) === resolve(ESTE_ARCHIVO)) continue;
    const ruta = relative(raiz, rutaAbsoluta).split(sep).join('/');
    readFileSync(rutaAbsoluta, 'utf8').split(/\r?\n/).forEach((linea, indice) => {
      if (esLineaDeComentario(linea)) return;
      const encontrada = FORMAS_DE_ENTRENAMIENTO.find(({ forma }) => forma.test(linea));
      if (encontrada) hallazgos.push({ ruta, numero: indice + 1, que: encontrada.que, texto: linea.trim() });
    });
  }
  return hallazgos;
}

function main() {
  const i = process.argv.indexOf('--raiz');
  const raiz = i >= 0 && process.argv[i + 1] ? resolve(process.argv[i + 1]) : RAIZ_DEL_REPO;
  const hallazgos = llamadasDeEntrenamiento(raiz);

  if (hallazgos.length === 0) {
    console.log('✓ Ninguna llamada entrena un modelo de IA.');
    process.exit(0);
  }

  console.error(`\n✗ Hay ${hallazgos.length} llamada(s) que entrenan un modelo de IA. La publicación no sale:\n`);
  for (const h of hallazgos) {
    const recorte = h.texto.length > 110 ? `${h.texto.slice(0, 110)}…` : h.texto;
    console.error(`  ${h.ruta}:${h.numero}  (${h.que})`);
    console.error(`      ${recorte}`);
  }
  console.error('\n  Ningún modelo se entrena con datos de las Prestadoras. Se saca la llamada.\n');
  process.exit(1);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();
