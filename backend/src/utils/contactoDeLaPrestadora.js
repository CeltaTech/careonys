// Cómo se llega a la Prestadora desde el teléfono de un Cliente.
//
// A QUIÉN LLAMA EL BOTÓN, Y POR QUÉ NO A UNA PERSONA. En prestación directa el Cliente contrató a
// la Prestadora, no a un Coordinador ni a un Asistente. Mandarla al teléfono personal de quien
// coordina ese día sería entregar el dato de contacto de alguien que trabaja ahí —y que además
// rota, se toma vacaciones y cambia—, así que lo que se entrega es el contacto que la propia
// Prestadora cargó en Configuración › La Prestadora. Dónde suena ese número lo decide ella: puede
// ser el escritorio del Coordinador de turno, la guardia, o una central.
//
// LO QUE ACÁ NO PUEDE APARECER NUNCA es el teléfono ni el correo de un Asistente. Cómo llegar a
// una persona del Padrón es justamente lo que la modalidad Match abre a pedido y con el
// contacto tapado hasta entonces (`utils/contactoTapado.js`); que otra pantalla lo regale por
// atrás dejaría sin sentido esa puerta y publicaría el dato personal de quien trabaja.
//
// LOS TRES CANALES SON LOS QUE ELLA CARGÓ, y ninguno se inventa. Una Prestadora que no cargó
// ninguno no tiene botón: la pantalla no muestra un canal que no lleva a ningún lado.
//
// Y EL TELÉFONO PARA EMERGENCIAS ES OTRO DATO, no un cuarto canal del Cliente. Lo usa la
// aplicación del Asistente, desde el cartel de una emergencia que no salió. Tampoco se completa
// con el teléfono general: si la Prestadora no lo cargó, no hay botón.

import { supabase } from '../db/connection.js';

/** Un campo de texto cargado a medias —espacios, cadena vacía— no es un canal. */
function limpio(valor) {
  const texto = typeof valor === 'string' ? valor.trim() : '';
  return texto.length > 0 ? texto : null;
}

/**
 * El contacto que la Prestadora publicó para su gente.
 *
 * Devuelve siempre la misma forma, con `null` en lo que no esté cargado, para que la pantalla no
 * tenga que distinguir «no hay dato» de «no se pudo leer»: en los dos casos no hay a dónde
 * llamar, y una alerta no se deja de mostrar porque falló una consulta de más.
 *
 * @param {string|null|undefined} prestadoraId
 * @returns {Promise<{telefono: string|null, whatsapp: string|null, email: string|null}>}
 */
export async function contactoDeLaPrestadora(prestadoraId) {
  const vacio = { telefono: null, whatsapp: null, email: null };
  if (!prestadoraId) return vacio;

  const data = await filaDeContacto(prestadoraId, 'telefono, whatsapp_numero, email');
  if (!data) return vacio;

  return {
    telefono: limpio(data.telefono),
    whatsapp: limpio(data.whatsapp_numero),
    email: limpio(data.email),
  };
}

/**
 * El teléfono para emergencias que cargó la Prestadora, o `null`.
 *
 * @param {string|null|undefined} prestadoraId
 * @returns {Promise<string|null>}
 */
export async function telefonoParaEmergencias(prestadoraId) {
  if (!prestadoraId) return null;
  const data = await filaDeContacto(prestadoraId, 'telefono_emergencias');
  return limpio(data?.telefono_emergencias);
}

// Los canales viven en `configuracion_prestadora`, que es lo que carga Configuración › La
// Prestadora. La consulta va con la llave maestra, así que el filtro por la Prestadora de quien
// mira es lo único que separa una de otra.
async function filaDeContacto(prestadoraId, columnas) {
  const { data, error } = await supabase
    .from('configuracion_prestadora')
    .select(columnas)
    .eq('prestadora_id', prestadoraId)
    .maybeSingle();
  return error ? null : data;
}

/** Si hay al menos un canal por el que se pueda llegar. */
export function hayPorDondeLlamar(contacto) {
  return Boolean(contacto?.telefono || contacto?.whatsapp || contacto?.email);
}
