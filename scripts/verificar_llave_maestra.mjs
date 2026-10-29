// ---------------------------------------------------------------------------
// verificar_llave_maestra.mjs — que la llave maestra sólo pueda retroceder
//
// Uso, desde la raíz del repo:
//   node scripts/verificar_llave_maestra.mjs
//
// QUÉ MIRA
//   Los archivos que nombran la llave maestra (`SUPABASE_SERVICE_ROLE_KEY`), en todo el
//   repositorio: backend, pruebas, programas sueltos, la copia de respaldo y su configuración.
//   Quedan afuera los documentos y las migraciones, que la nombran para hablar de ella. La lista
//   está guardada en `scripts/llave_maestra_pendiente.json`.
//
// QUÉ EXIGE
//   1. Que lo que está en el repositorio coincida con la lista. Un archivo nuevo que la usa corta
//      la publicación; uno que dejó de usarla también, hasta que se lo saque de la lista.
//   2. Que la lista no crezca. Se compara contra la versión anterior de la misma lista: la del
//      último push en GitHub (`BASE`) o la del último commit en la máquina. Agregarle un renglón
//      no destraba nada: también corta. Lo único que no cuenta como renglón nuevo es un archivo
//      que git reconoce como renombrado de uno que ya estaba.
//
// La lista queda vacía y el chequeo sigue: si la llave vuelve a aparecer en cualquier archivo,
// el push no sale (docs/PLAN_HASTA_PRODUCCION.md, paso 15).
// ---------------------------------------------------------------------------

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const LISTA = 'scripts/llave_maestra_pendiente.json';
const YO = 'scripts/verificar_llave_maestra.mjs';

const git = (...args) => execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

const NOMBRA_LA_LLAVE = /SUPABASE_SERVICE_ROLE_KEY/;

const archivos = git('ls-files', '-z').split('\0').filter(Boolean);

const hoy = { nombran_la_llave: [] };
for (const ruta of archivos) {
  if (ruta === YO || ruta === LISTA) continue;
  if (ruta.endsWith('.md') || ruta.endsWith('.sql')) continue;
  const completa = join(RAIZ, ruta);
  if (!existsSync(completa)) continue;
  if (NOMBRA_LA_LLAVE.test(readFileSync(completa, 'utf8'))) hoy.nombran_la_llave.push(ruta);
}

const guardada = JSON.parse(readFileSync(join(RAIZ, LISTA), 'utf8'));

function anterior() {
  const base = process.env.BASE;
  const desde = base && !/^0+$/.test(base) ? base : 'HEAD';
  try {
    return JSON.parse(git('show', `${desde}:${LISTA}`));
  } catch {
    return null;
  }
}
const antes = anterior();

// Un archivo que sólo cambió de nombre no es un archivo nuevo: es el mismo renglón con otro nombre.
// Se miran los renombres desde la última vez que se escribió la lista, porque el renombre pudo
// haber subido en un push anterior que ya cortó por esto mismo.
function renombres() {
  const base = process.env.BASE;
  const desde = base && !/^0+$/.test(base) ? base : 'HEAD';
  const nombreNuevo = new Map();
  try {
    const escrita = git('log', '-1', '--format=%H', desde, '--', LISTA).trim();
    if (!escrita) return nombreNuevo;
    const salida = git('log', '-M', '--diff-filter=R', '--name-status', '--format=', '--reverse', `${escrita}..HEAD`);
    for (const renglon of salida.split('\n')) {
      const [estado, viejo, nuevo] = renglon.split('\t');
      if (!estado?.startsWith('R')) continue;
      for (const [origen, destino] of nombreNuevo) if (destino === viejo) nombreNuevo.set(origen, nuevo);
      nombreNuevo.set(viejo, nuevo);
    }
  } catch {
    // Sin historia no hay renombres que reconocer, y la regla corre como siempre.
  }
  return nombreNuevo;
}
const renombrados = renombres();

const fallas = [];
for (const clave of Object.keys(hoy)) {
  const lista = new Set(guardada[clave] ?? []);
  const real = new Set(hoy[clave]);
  for (const r of real) {
    if (!lista.has(r)) fallas.push(`${r} la usa y no estaba en la lista (${clave}).`);
  }
  for (const r of lista) {
    if (!real.has(r)) fallas.push(`${r} ya no la usa: hay que sacarlo de la lista (${clave}).`);
  }
  if (antes) {
    const previa = new Set((antes[clave] ?? []).map((r) => renombrados.get(r) ?? r));
    for (const r of lista) {
      if (!previa.has(r)) fallas.push(`${r} se agregó a la lista, y la lista sólo puede achicarse (${clave}).`);
    }
  }
}

if (fallas.length) {
  console.error('La llave maestra no retrocedió:');
  for (const f of fallas) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`La llave maestra sigue en ${hoy.nombran_la_llave.length} archivos que la nombran.`);
