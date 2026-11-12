import { sinPrestadora, enLaPrestadora } from '../db/connection.js';
import { rotuloDeLaPrestadora } from './direccionDeLaPrestadora.js';

// EL NOMBRE DE USUARIO.
//
// Coordinación, Asistentes y Clientes entran con un nombre de usuario que es único en todo el
// sistema. El de la coordinación es `<parte>_<código de la Prestadora>` —`juana.perez_demo`—: la
// parte la escribe el Administrador al dar el alta, y la base guarda el nombre entero en
// `usuarios.nombre_de_usuario`. Asistentes y Clientes eligen el suyo al activar la cuenta, con la
// regla de `config/reglaDeUsuario.js`.
//
// Así el ingreso y la recuperación de la clave saben de quién es la cuenta por lo que escribe la
// persona, sin preguntarle de qué Prestadora es.

// La forma de la parte de la coordinación, la misma que exige la base.
const FORMA_DE_LA_PARTE = /^[a-z0-9]([a-z0-9._-]{0,38}[a-z0-9])?$/;

/** La parte que escribe el Administrador, dejada comparable. */
export function parteComparable(texto) {
  return String(texto ?? '').trim().toLowerCase();
}

/** ¿La parte tiene la forma que la base acepta? */
export function parteBienEscrita(texto) {
  return FORMA_DE_LA_PARTE.test(parteComparable(texto));
}

/** El sufijo de una Prestadora: lo que va después de la parte. Nulo si la Prestadora no tiene código. */
export async function sufijoDeLaPrestadora(prestadoraId) {
  const rotulo = await rotuloDeLaPrestadora(prestadoraId);
  return rotulo ? `_${rotulo}` : null;
}

/**
 * De qué cuenta es lo escrito, con una sola pregunta a la base, o nulo.
 *
 * EL NOMBRE DE USUARIO ES ÚNICO EN TODO EL SISTEMA, sin distinguir mayúsculas, así que lo escrito
 * entero alcanza para saber de quién es: no se corta en ningún «_». Vale para la coordinación
 * —cuyo nombre lleva el código de su Prestadora al final— y para Asistentes y Clientes, que lo
 * eligen al activar la cuenta.
 *
 * Se pregunta sin Prestadora (`cuenta_del_usuario`); esa credencial sólo sirve para esa pregunta.
 * La base contesta únicamente las cuentas activas de coordinación, Asistentes y Clientes, que son
 * las que entran con nombre de usuario: cualquier otra contesta lo mismo que un nombre sin cuenta.
 *
 * Es lo único que necesita la entrada, y por eso tarda lo mismo exista la cuenta o no.
 *
 * @returns {Promise<{ id: string, prestadora_id: string } | null>}
 */
export async function cuentaQueNombra(texto, trabajo) {
  const escrito = parteComparable(texto);
  if (!escrito) return null;

  const { data: filas, error } = await sinPrestadora(trabajo)
    .rpc('cuenta_del_usuario', { p_usuario: escrito });
  if (error) throw new Error(error.message);
  const encontrada = Array.isArray(filas) ? filas[0] : filas;
  if (!encontrada?.id || !encontrada?.prestadora_id) return null;
  return { id: encontrada.id, prestadora_id: encontrada.prestadora_id };
}

/**
 * La cuenta que nombra lo escrito, con sus datos, o nulo.
 *
 * Con la respuesta de `cuentaQueNombra` se entra a esa Prestadora y a ninguna otra, y ahí se lee
 * la cuenta. Devuelve nulo en todos los casos en que no hay cuenta, y quien la llama los trata
 * igual.
 *
 * @returns {Promise<{ id: string, nombre: string, rol: string, email: string|null, prestadora_id: string } | null>}
 */
export async function cuentaDelUsuario(texto, trabajo) {
  const encontrada = await cuentaQueNombra(texto, trabajo);
  if (!encontrada) return null;

  const { data: cuenta, error: errorCuenta } = await enLaPrestadora(encontrada.prestadora_id, trabajo, (db) => db
    .from('usuarios')
    .select('id, nombre, rol, email, prestadora_id')
    .eq('prestadora_id', encontrada.prestadora_id)
    .eq('id', encontrada.id)
    .maybeSingle());
  if (errorCuenta) throw new Error(errorCuenta.message);

  return cuenta ?? null;
}
