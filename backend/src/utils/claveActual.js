import { createClient } from '@supabase/supabase-js';
import { ErrorConMotivo } from './errorConMotivo.js';
import { correoDeAcceso } from '../config/correoDeAcceso.js';

// COMPROBAR LA CLAVE ACTUAL, DEL LADO DEL BACKEND.
//
// QUÉ PROTEGE. Cambiar el número de teléfono con el que se entra, y cerrar la sesión en todos los
// equipos, son dos cosas que no puede hacer quien se sienta un minuto en una máquina abierta. Tener
// la sesión adelante no alcanza: hay que saber la clave.
//
// POR QUÉ NO SE HACE EN LA PANTALLA. `MiClave.jsx` la comprueba del lado del navegador para cambiar
// la clave propia, y ahí alcanza porque el servicio de acceso vuelve a pedirla igual al escribir la
// nueva. Acá no: lo que sigue lo escribe el backend con la llave maestra, así que si la comprobación
// viviera en la pantalla, quien llame a la dirección directamente se la saltea.
//
// SE USA LA LLAVE PÚBLICA Y NO LA MAESTRA. La maestra cambia la clave de cualquiera sin conocer la
// anterior, que es justo lo contrario de lo que hay que averiguar. Con la pública se intenta entrar
// como esa persona: si entra, la clave era ésa.
//
// Y EL CLIENTE NO GUARDA LA SESIÓN. `persistSession: false` y `autoRefreshToken: false`: lo único
// que interesa es si el intento entró o no. Sin eso, el proceso del backend acumularía sesiones de
// gente que sólo quiso comprobar su clave.

let cliente = null;

function clientePublico() {
  const url = process.env.SUPABASE_URL;
  const llave = process.env.SUPABASE_ANON_KEY;
  if (!url || !llave) return null;

  if (!cliente) {
    cliente = createClient(url, llave, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cliente;
}

/** Sólo para las pruebas: obliga a rearmar el cliente con las variables de entorno de ahora. */
export function olvidarClientePublico() {
  cliente = null;
}

/**
 * ¿Esta es la clave actual de esta cuenta?
 *
 * Se entra con el correo de acceso, no con el de la persona: el servicio de acceso guarda el de la
 * cuenta en esa Prestadora (`config/correoDeAcceso.js`), y con el otro no encuentra a nadie.
 *
 * Falla cerrado: sin llave pública configurada no se puede comprobar nada, y lo que corresponde es
 * negar. Una comprobación que se saltea cuando falta una variable de entorno no es una
 * comprobación (CLAUDE.md de la empresa §5).
 */
export async function esLaClaveActual({ email, prestadoraId, clave }) {
  if (!email || !prestadoraId || !clave) return false;

  const publico = clientePublico();
  if (!publico) {
    console.error('claveActual: falta SUPABASE_ANON_KEY; no se puede comprobar la clave y se niega');
    return false;
  }

  const { data, error } = await publico.auth.signInWithPassword({
    email: await correoDeAcceso(email, prestadoraId),
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
  const publico = clientePublico();
  if (!publico || !token) return false;
  const { error } = await publico.auth.admin.signOut(token, 'global');
  if (error) console.error('claveActual: no se pudieron cerrar las sesiones:', error.message);
  return !error;
}

/** Lo mismo, pero lanzando el motivo que la pantalla traduce. */
export async function exigirLaClaveActual({ email, prestadoraId, clave }) {
  if (!(await esLaClaveActual({ email, prestadoraId, clave }))) {
    throw new ErrorConMotivo('clave_actual_incorrecta');
  }
}
