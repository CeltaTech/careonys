import { createClient } from '@supabase/supabase-js';
import { ErrorConMotivo } from './errorConMotivo.js';
import { regionDeLaPrestadora, regionDeLaCredencial } from '../db/regiones.js';
import { direccionDeAcceso } from '../config/direccionDeAcceso.js';

// COMPROBAR LA CLAVE ACTUAL, DEL LADO DEL BACKEND.
//
// QUÉ PROTEGE. Cambiar el número de teléfono con el que se entra, y cerrar la sesión en todos los
// equipos, son dos cosas que no puede hacer quien se sienta un minuto en una máquina abierta. Tener
// la sesión adelante no alcanza: hay que saber la clave.
//
// POR QUÉ NO SE HACE EN LA PANTALLA. Si la comprobación viviera en la pantalla, quien llame a la
// dirección directamente se la saltea.
//
// SE USA LA LLAVE PÚBLICA Y NO LA MAESTRA. La maestra cambia la clave de cualquiera sin conocer la
// anterior, que es justo lo contrario de lo que hay que averiguar. Con la pública se intenta entrar
// como esa persona: si entra, la clave era ésa.
//
// Y EL CLIENTE NO GUARDA LA SESIÓN. `persistSession: false` y `autoRefreshToken: false`: lo único
// que interesa es si el intento entró o no. Sin eso, el proceso del backend acumularía sesiones de
// gente que sólo quiso comprobar su clave.
//
// Y SE LE PREGUNTA A LA REGIÓN DE LA CUENTA (`db/regiones.js`), nunca a una base supuesta: la de la
// Prestadora cuando se sabe de quién es la cuenta, y la que emitió la sesión cuando lo que se tiene
// es la sesión. Sin región reconocida no hay a quién preguntar, y se niega.

let clientes = new Map();

function regionDe(prestadoraId) {
  if (!prestadoraId) return null;
  try {
    return regionDeLaPrestadora(prestadoraId);
  } catch {
    return null;
  }
}

function clientePublico(region) {
  if (!region) return null;
  if (!clientes.has(region)) {
    clientes.set(region, createClient(region.url, region.clavePublica, {
      auth: { persistSession: false, autoRefreshToken: false },
    }));
  }
  return clientes.get(region);
}

/** Sólo para las pruebas: obliga a rearmar los clientes con las variables de entorno de ahora. */
export function olvidarClientePublico() {
  clientes = new Map();
}

/**
 * ¿Esta es la clave actual de esta cuenta?
 *
 * Se entra con la dirección de acceso de la cuenta, no con el email de la persona: el servicio de
 * acceso la conoce por su identificador (`config/direccionDeAcceso.js`), y el email es sólo un dato
 * de contacto.
 *
 * Falla cerrado: sin llave pública configurada no se puede comprobar nada, y lo que corresponde es
 * negar. Una comprobación que se saltea cuando falta una variable de entorno no es una
 * comprobación (CLAUDE.md de la empresa §5).
 */
export async function esLaClaveActual({ usuarioId, prestadoraId, clave }) {
  if (!usuarioId || !clave) return false;

  const publico = clientePublico(regionDe(prestadoraId));
  if (!publico) {
    console.error('claveActual: no hay región para esta cuenta; no se puede comprobar la clave y se niega');
    return false;
  }

  const { data, error } = await publico.auth.signInWithPassword({
    email: direccionDeAcceso(usuarioId),
    password: clave,
  });
  if (error || !data?.user) return false;

  // La sesión que se acaba de abrir se cierra en el acto: acá no se estaba entrando a ningún lado.
  // Sólo ésa: sin decirlo, la biblioteca cierra todas las de la persona, y comprobar la clave
  // terminaba sacándola de todos sus aparatos, incluido el que estaba usando.
  await publico.auth.signOut({ scope: 'local' }).catch(() => {});
  return true;
}

/**
 * Cierra todas las sesiones abiertas de una persona, con su propia sesión y la llave pública.
 * No hace falta la llave maestra: el servicio de acceso deja que cada cual cierre las suyas.
 * Devuelve si el servicio de acceso lo confirmó.
 */
export async function cerrarTodasLasSesionesDe(token) {
  if (!token) return false;
  const publico = clientePublico(regionDeLaCredencial(token));
  if (!publico) return false;
  const { error } = await publico.auth.admin.signOut(token, 'global');
  if (error) console.error('claveActual: no se pudieron cerrar las sesiones:', error.message);
  return !error;
}

/**
 * Cambia la clave propia: entra con la actual y, con esa misma sesión, escribe la nueva.
 *
 * TAMPOCO HACE FALTA LA LLAVE MAESTRA. El servicio de acceso deja que cada cual cambie la suya
 * desde su propia sesión, así que se usa la que abre la clave actual y no ninguna otra.
 *
 * UN CLIENTE POR PEDIDO, NO EL COMPARTIDO. Entre entrar y escribir la nueva hay una espera, y en
 * ese rato el cliente compartido podría quedar con la sesión de otro pedido: la clave nueva se
 * escribiría en la cuenta equivocada.
 *
 * Lanza `clave_actual_incorrecta` si la actual no entra; cualquier otra falla sube como error.
 */
export async function cambiarLaClave({ usuarioId, prestadoraId, claveActual, claveNueva }) {
  const region = regionDe(prestadoraId);
  if (!region) {
    console.error('claveActual: no hay región para esta cuenta; no se puede cambiar la clave');
    throw new Error('no hay región para esta cuenta');
  }
  if (!usuarioId || !claveActual) throw new ErrorConMotivo('clave_actual_incorrecta');

  const propio = createClient(region.url, region.clavePublica, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await propio.auth.signInWithPassword({
    email: direccionDeAcceso(usuarioId),
    password: claveActual,
  });
  if (error || !data?.user) throw new ErrorConMotivo('clave_actual_incorrecta');

  try {
    const { error: errorCambio } = await propio.auth.updateUser({ password: claveNueva });
    if (errorCambio) throw new Error(errorCambio.message);
  } finally {
    await propio.auth.signOut({ scope: 'local' }).catch(() => {});
  }
}

/** Lo mismo, pero lanzando el motivo que la pantalla traduce. */
export async function exigirLaClaveActual({ usuarioId, prestadoraId, clave }) {
  if (!(await esLaClaveActual({ usuarioId, prestadoraId, clave }))) {
    throw new ErrorConMotivo('clave_actual_incorrecta');
  }
}
