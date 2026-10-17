import { enLaPrestadora, supabase } from '../db/connection.js';
import { nombreBase } from './casillaDeEnvio.js';

// El código de cada Prestadora.
//
// Es un rótulo corto —`cuidardelsur`— que nombra a la Prestadora sin decir su número interno. Va al
// final del nombre de usuario de su coordinación (`juana.perez_cuidardelsur`, ver
// `nombreDeUsuario.js`) y adentro de los enlaces de los correos con un código de un solo uso. No es
// una dirección web: no existe ninguna dirección propia por Prestadora.
//
// Se elige solo al dar de alta la Prestadora, nadie lo teclea, y no cambia nunca: está escrito en
// los nombres de usuario de toda su coordinación.
//
// Sale con la misma regla que la casilla desde la que manda —del dominio propio que declaró, si no
// de su nombre, y con un sufijo si el que salió ya está tomado—, y la regla está escrita una sola
// vez, en `casillaDeEnvio.js`: letras, números y guiones, nunca «_». Lo único distinto es contra qué
// se comprueba que esté libre: los códigos ya repartidos, y los nombres que el producto se reserva
// para sí.

// Los códigos ya repartidos que empiezan igual. Se consultan todos juntos y no de a uno para no
// hacerle una pregunta a la base por cada intento.
async function direccionesTomadas(base) {
  // SIN PRESTADORA A PROPÓSITO
  // Elige un dominio libre antes de que la Prestadora exista. Sin mirar a las demás no puede saber
  // si está tomado. No sale ningún dato de ninguna: sólo qué rótulos ya están repartidos.
  const { data, error } = await supabase
    .from('configuracion_prestadora')
    .select('dominio')
    .ilike('dominio', `${base}%`);

  if (error) throw error;
  return new Set((data ?? []).map((fila) => String(fila.dominio).toLowerCase()));
}

// Los nombres que el producto se reserva: los que ya publica para sí mismo. Salen de la base y no
// de una lista escrita acá, porque agregar una pantalla nueva no puede obligar a publicar el
// backend de nuevo.
//
// Si el catálogo no contesta, se corta. Acá no se puede tomar el camino prudente de suponer que
// están todos reservados —no quedaría ningún nombre— ni el de suponer que no hay ninguno, que es
// justo el que le entregaría a una Prestadora la puerta del Panel general.
async function direccionesReservadas() {
  const { data, error } = await supabase.from('direcciones_reservadas').select('direccion');

  if (error) throw error;
  return new Set((data ?? []).map((fila) => String(fila.direccion).toLowerCase()));
}

// Devuelve el código, o `null` si no se pudo elegir ninguno. A diferencia de la casilla de envío,
// `null` sí es una falla del alta: sin código, su coordinación no tiene nombre de usuario.
export async function elegirDireccionDeLaPrestadora({ nombreFantasia, emailRespuestas }) {
  const base = await nombreBase({ nombreFantasia, emailRespuestas });
  if (!base) return null;

  const tomadas = await direccionesTomadas(base);
  const reservadas = await direccionesReservadas();
  const estaLibre = (candidata) => !tomadas.has(candidata) && !reservadas.has(candidata);

  if (estaLibre(base)) return base;

  for (let sufijo = 2; sufijo <= 99; sufijo += 1) {
    const candidata = `${base}-${sufijo}`;
    if (estaLibre(candidata)) return candidata;
  }

  return null;
}

// El enlace que va en un correo con un código de un solo uso: activar la cuenta o elegir una clave
// nueva. Lleva el código de la Prestadora, porque quien lo abre todavía no tiene sesión y es ese
// código el que dice en cuál se busca (`middleware/resolverPrestadoraPublica.js`). Sin código no
// hay enlace que sirva, y devuelve nulo.
export async function enlaceConCodigo({ appUrl, pantalla, prestadoraId, codigo }) {
  if (!appUrl) return null;
  const rotulo = await rotuloDeLaPrestadora(prestadoraId);
  if (!rotulo) return null;
  const parametros = new URLSearchParams({ prestadora: rotulo, token: codigo });
  return `${appUrl}/${pantalla}?${parametros}`;
}

// El código guardado de una Prestadora, o nulo si no tiene. Se lee con el trabajo de
// esa Prestadora, que sólo alcanza su propia configuración.
export async function rotuloDeLaPrestadora(prestadoraId) {
  if (!prestadoraId) return null;
  const { data, error } = await enLaPrestadora(prestadoraId, 'leer la dirección de la Prestadora', (db) =>
    db.from('configuracion_prestadora').select('dominio').eq('prestadora_id', prestadoraId).maybeSingle(),
  );
  if (error) throw error;
  return data?.dominio || null;
}

// El choque de dos altas simultáneas: las dos eligieron el mismo nombre porque ninguna de las dos
// veía a la otra todavía. Lo resuelve el índice único de la base, y quien alta reintenta.
export function esChoqueDeDireccion(error) {
  return error?.code === '23505' && String(error?.message ?? '').includes('dominio');
}
