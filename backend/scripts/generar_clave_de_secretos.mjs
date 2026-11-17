// Genera la clave con la que el backend cifra las contraseñas de terceros de una Prestadora.
//
// Uso, desde backend/:
//   node scripts/generar_clave_de_secretos.mjs --prestadora <identificador> --archivo <ruta>
//
// La clave son 32 bytes al azar. Se escribe en el archivo que se indica y nunca en la pantalla.
// El archivo queda con la forma que pide la variable CLAVES_DE_LOS_SECRETOS_DE_TERCEROS:
//
//   {"<prestadora>": {"version": 1, "claves": {"1": "<base64>"}}}
//
// Si el archivo ya existe se completa, no se pisa: una Prestadora nueva se agrega, y una que ya
// estaba recibe una versión nueva de su clave sin perder las anteriores, que siguen haciendo
// falta para leer lo que se guardó con ellas. El contenido del archivo es lo que se carga en la
// variable de entorno del servidor.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const FORMA_DE_IDENTIFICADOR = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function opcion(nombre) {
  const posicion = process.argv.indexOf(`--${nombre}`);
  return posicion >= 0 ? process.argv[posicion + 1] : undefined;
}

function cortar(mensaje) {
  console.error(mensaje);
  process.exit(1);
}

const prestadoraId = opcion('prestadora');
const archivo = opcion('archivo');

if (!prestadoraId || !FORMA_DE_IDENTIFICADOR.test(prestadoraId)) {
  cortar('Indique la Prestadora con --prestadora <identificador>.');
}
if (!archivo) cortar('Indique dónde escribir la clave con --archivo <ruta>.');

let claves = {};
if (existsSync(archivo)) {
  try {
    claves = JSON.parse(readFileSync(archivo, 'utf8'));
  } catch {
    cortar('El archivo ya existe y no es un JSON válido. No se tocó.');
  }
  if (!claves || typeof claves !== 'object' || Array.isArray(claves)) {
    cortar('El archivo ya existe y no tiene la forma esperada. No se tocó.');
  }
}

const anterior = claves[prestadoraId];
const versiones = anterior?.claves && typeof anterior.claves === 'object' ? { ...anterior.claves } : {};
const version = Math.max(0, ...Object.keys(versiones).map(Number).filter(Number.isInteger)) + 1;
versiones[String(version)] = randomBytes(32).toString('base64');
claves[prestadoraId] = { version, claves: versiones };

writeFileSync(archivo, `${JSON.stringify(claves)}\n`, { encoding: 'utf8', mode: 0o600 });

console.log(`Se escribió la versión ${version} de la clave de la Prestadora ${prestadoraId} en ${archivo}.`);
