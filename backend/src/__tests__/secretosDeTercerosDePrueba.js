// Las contraseñas de terceros, para las pruebas que contestan con una base de mentira.
//
// La base de verdad guarda cada contraseña cifrada con la clave de su Prestadora. Acá se inventa
// una clave por Prestadora, se la deja en la variable de entorno que lee el backend, y se arma la
// fila cifrada tal como la devolvería la base. Así cada prueba pasa por el descifrado de verdad, y
// no por un atajo que nunca podría fallar.
//
// Datos y claves inventados.
import { randomBytes } from 'node:crypto';
import { cifrarSecreto } from '../utils/secretosDeTerceros.js';

const VARIABLE = 'CLAVES_DE_LOS_SECRETOS_DE_TERCEROS';

function clavesActuales() {
  try {
    return JSON.parse(process.env[VARIABLE] || '{}');
  } catch {
    return {};
  }
}

/** Le inventa una clave a la Prestadora, si no tenía. Devuelve las claves de todas. */
export function claveDePruebaPara(prestadoraId) {
  const claves = clavesActuales();
  if (!claves[prestadoraId]) {
    claves[prestadoraId] = { version: 1, claves: { 1: randomBytes(32).toString('base64') } };
    process.env[VARIABLE] = JSON.stringify(claves);
  }
  return claves;
}

/** Le quita la clave a la Prestadora: para probar que sin clave se falla cerrado. */
export function quitarClaveDePrueba(prestadoraId) {
  const claves = clavesActuales();
  delete claves[prestadoraId];
  process.env[VARIABLE] = JSON.stringify(claves);
}

/** La fila cifrada, como la devuelve la base: texto cifrado y versión de la clave. */
export function filaCifradaDePrueba(prestadoraId, uso, texto) {
  const claves = claveDePruebaPara(prestadoraId);
  return { prestadora_id: prestadoraId, uso, ...cifrarSecreto({ prestadoraId, uso, texto }, claves) };
}

/** Los parámetros de la consulta, vengan como vengan en cada base de mentira. */
function parametrosDe(argumento) {
  if (argumento instanceof URLSearchParams) return argumento;
  if (argumento?.url) return new URL(argumento.url, 'http://interno').searchParams;
  return null;
}

/**
 * La respuesta de la base de mentira a una lectura de `secretos_de_terceros`, para una Prestadora
 * con estas contraseñas cargadas (`{ uso: texto }`; un texto `null` es «no cargada»).
 *
 * Si la consulta pide sólo los usos, contesta la lista. Si pide uno, contesta su fila cifrada o
 * nada. Si la base de mentira no le pasa los parámetros, contesta la fila del único uso cargado.
 */
export function respuestaDeSecretosDePrueba(prestadoraId, textosPorUso) {
  const filas = Object.entries(textosPorUso)
    .filter(([, texto]) => texto != null)
    .map(([uso, texto]) => filaCifradaDePrueba(prestadoraId, uso, texto));
  return (argumento) => {
    const parametros = parametrosDe(argumento);
    if (parametros?.get('select') === 'uso') return filas.map(({ uso }) => ({ uso }));
    const pedido = parametros?.get('uso')?.replace(/^eq\./, '');
    if (pedido) return filas.find((fila) => fila.uso === pedido) ?? null;
    return filas[0] ?? null;
  };
}
