import { supabase } from '../db/connection.js';
import { IDENTIDAD } from '../config/identidadProducto.js';
import { nombreBase } from './casillaDeEnvio.js';

// La puerta por la que entra cada Prestadora.
//
// Cada Prestadora entra por su propia dirección —`cuidardelsur.careonys.com`—, y esa dirección es
// la que dice a cuál se está entrando: nunca se elige la Prestadora antes de la clave
// (`docs/MARCA.md`, sección 0). Acá se decide cómo se llama esa puerta.
//
// Se elige sola al dar de alta la Prestadora, nadie la teclea, y no cambia nunca: es la dirección
// que quedó anotada en el navegador de toda la gente que trabaja en esa Prestadora.
//
// El nombre sale con la misma regla que la casilla desde la que manda —del dominio propio que
// declaró, si no de su nombre, y con un sufijo si el que salió ya está tomado—, y la regla está
// escrita una sola vez, en `casillaDeEnvio.js`. Lo único distinto es contra qué se comprueba que
// esté libre: las puertas ya repartidas, y los nombres que el producto se reserva para sí.
//
// Lo guardado es el rótulo solo —`cuidardelsur`—, que es lo que el Panel le manda al motor
// cuando alguien abre la pantalla de ingreso. Una Prestadora con dominio propio puede tener
// guardada la dirección entera, y por eso lo reservado se comprueba únicamente cuando el valor
// no tiene ningún punto: `familias.cuidardelsur.com.ar` es de ella y no choca con nada del
// producto.

// Las puertas ya repartidas que empiezan igual. Se consultan todas juntas y no de a una para no
// hacerle una pregunta a la base por cada intento.
async function direccionesTomadas(base) {
  const { data, error } = await supabase
    .from('configuracion_prestadora')
    .select('dominio')
    .ilike('dominio', `${base}%`);

  if (error) throw error;
  return new Set((data ?? []).map((fila) => String(fila.dominio).toLowerCase()));
}

// Los nombres que el producto se reserva: los que ya publica para sí mismo. Salen de la base y no
// de una lista escrita acá, porque agregar una pantalla nueva no puede obligar a publicar el
// motor de nuevo.
//
// Si el catálogo no contesta, se corta. Acá no se puede tomar el camino prudente de suponer que
// están todos reservados —no quedaría ningún nombre— ni el de suponer que no hay ninguno, que es
// justo el que le entregaría a una Prestadora la puerta del Panel general.
async function direccionesReservadas() {
  const { data, error } = await supabase.from('direcciones_reservadas').select('direccion');

  if (error) throw error;
  return new Set((data ?? []).map((fila) => String(fila.direccion).toLowerCase()));
}

// Devuelve el rótulo de la puerta, o `null` si no se pudo elegir ninguno. A diferencia de la
// casilla de envío, `null` sí es una falla del alta: una Prestadora sin puerta no tiene por dónde
// entrar nadie.
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

// La dirección entera, para mostrarla y para escribirla en el correo del alta. El dominio del
// producto vive en un solo lugar y se lo pide ahí.
export function direccionDeIngreso(rotulo) {
  const nombre = String(rotulo ?? '').trim().toLowerCase();
  if (!nombre) return null;
  if (nombre.includes('.')) return nombre;
  const dominio = String(IDENTIDAD.dominio ?? '').trim().toLowerCase();
  return dominio ? `${nombre}.${dominio}` : nombre;
}

// El choque de dos altas simultáneas: las dos eligieron el mismo nombre porque ninguna de las dos
// veía a la otra todavía. Lo resuelve el índice único de la base, y quien alta reintenta.
export function esChoqueDeDireccion(error) {
  return error?.code === '23505' && String(error?.message ?? '').includes('dominio');
}
