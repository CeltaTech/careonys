// ---------------------------------------------------------------------------
// clave_de_firma_local.mjs — le da a la base local la clave con la que se firman las tareas
//
// Uso, desde la raíz del producto, una sola vez por máquina:
//   node scripts/clave_de_firma_local.mjs
//   npx supabase stop && npx supabase start
//
// POR QUÉ EXISTE. El backend entra a la base con una credencial que firma él mismo
// (`backend/src/db/connection.js`), y la base la acepta sólo si conoce la clave con que se
// firmó. En la nube esa clave se cargó a mano; la base local no traía ninguna, así que en la
// máquina de trabajo no corría ninguna tarea programada y el backend no podía averiguar de qué
// Prestadora es una dirección.
//
// QUÉ DEJA Y DÓNDE. Genera un par de claves ES256. La base recibe la clave en
// `supabase/signing_keys.json`, que el repositorio ignora; el backend, en
// `CLAVE_DEL_TRABAJO_SIN_PERSONA` de `backend/.env`, que el repositorio también ignora. Es la
// misma clave en los dos lados, porque la base local firma con ella también las sesiones de las
// personas: alcanza con que el backend y la base hablen el mismo idioma.
//
// NO PISA. Si la clave ya está, no la cambia: una clave nueva dejaría vencidas todas las
// sesiones abiertas contra la base local.
//
// NINGÚN VALOR SE MUESTRA. Ni en la pantalla, ni como argumento de otro programa.
// ---------------------------------------------------------------------------

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARCHIVO_DE_LA_BASE = join(RAIZ, 'supabase', 'signing_keys.json');
const ENTORNO_DEL_BACKEND = join(RAIZ, 'backend', '.env');
const VARIABLE = 'CLAVE_DEL_TRABAJO_SIN_PERSONA';

const entorno = existsSync(ENTORNO_DEL_BACKEND) ? readFileSync(ENTORNO_DEL_BACKEND, 'utf8') : '';
const yaEstaEnElBackend = new RegExp(`^${VARIABLE}=.+`, 'm').test(entorno);

if (existsSync(ARCHIVO_DE_LA_BASE) && yaEstaEnElBackend) {
  console.log('La base local y el backend ya tienen la clave de firma. No se cambió nada.');
  process.exit(0);
}

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const clave = {
  ...privateKey.export({ format: 'jwk' }),
  kid: randomUUID(),
  alg: 'ES256',
  use: 'sig',
  key_ops: ['sign', 'verify'],
};

writeFileSync(ARCHIVO_DE_LA_BASE, JSON.stringify([clave], null, 2) + '\n');

const renglon = `${VARIABLE}=${JSON.stringify(clave)}`;
const nuevoEntorno = yaEstaEnElBackend
  ? entorno.replace(new RegExp(`^${VARIABLE}=.*$`, 'm'), renglon)
  : entorno + (entorno && !entorno.endsWith('\n') ? '\n' : '') + renglon + '\n';
writeFileSync(ENTORNO_DEL_BACKEND, nuevoEntorno);

console.log('Listo: la base local y el backend tienen la misma clave de firma.');
console.log('  Falta reiniciar la base: npx supabase stop && npx supabase start');
