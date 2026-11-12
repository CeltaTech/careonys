import { AsyncLocalStorage } from 'node:async_hooks';
import { createClient } from '@supabase/supabase-js';
import {
  regionDeLaCredencial,
  regionDeLaPrestadora,
  lasRegiones,
} from './regiones.js';
import { conRegistroDeSalud } from './informacionDeSalud.js';
import { origenDelPedido } from '../utils/registroDeConsultas.js';

/* La conexión con la base.
   ========================

   HAY DOS CREDENCIALES.
   - La de la persona que pide: la misma con la que entró al Panel o a su aplicación. La base ve
     quién es y le contesta sólo lo de su Prestadora. Es la que usa una ruta, a través de
     `clienteDelPedido(req)`.
   - La del trabajo sin persona, de una sola Prestadora, que la base limita a lo que ese trabajo
     usa.
   La llave maestra, que alcanza todas las Prestadoras, no la usa el backend.

   CÓMO ENTRA EL TRABAJO SIN PERSONA. Con una cuenta automática por Prestadora, como entra una
   persona: correo y contraseña. El backend no firma nada. El pase lo arma Supabase con
   `interno.armar_el_pase`, que lee de `interno.cuentas_automaticas` el rol y la Prestadora de la
   cuenta. Así no existe en el backend nada con lo que fabricar un pase que abra otra Prestadora:
   cada contraseña abre una sola. Cada Prestadora tiene tres —la del trabajo, la de la copia de
   respaldo y la de la importación de planillas, que es la única que ve lo importado sin confirmar—
   y hay una más, sin Prestadora, que sólo pide la lista. Las contraseñas llegan en
   `CONTRASENAS_DE_LAS_CUENTAS_AUTOMATICAS`: un objeto de correo a contraseña.

   QUIÉN ELIGE LA DEL TRABAJO. Nadie, adentro del código que consulta. Lo que corre adentro de
   `enLaPrestadora` recibe, sin enterarse, la conexión con la credencial de esa Prestadora a través
   de `supabase`. Así un trabajo se pasa de una a otra envolviéndolo, sin tocar las funciones que
   llama: mandar un correo, un mensaje de WhatsApp, leer el idioma. Lo que corre afuera no tiene
   conexión: `supabase` se corta, nunca cae a otra credencial.

   EL PASE SE RENUEVA ANTES DE VENCER. Se guarda uno por cuenta y, un minuto antes de que venza, se
   renueva; si la renovación falla, se vuelve a entrar con la contraseña. Un trabajo largo nunca
   queda con uno vencido.

   NINGUNA CONEXIÓN SUPONE QUE HAY UNA SOLA BASE. Toda conexión nueva —la de la persona y la del
   trabajo— se arma con la región de la Prestadora (`db/regiones.js`). Hoy hay una sola,
   y el día que haya más, el único lugar que cambia es ése. */


const MARGEN_S = 60;

/** El único trabajo que tiene cuenta propia en cada Prestadora. */
export const TRABAJO_DE_LA_IMPORTACION = 'importación de planillas';

const DOMINIO_DE_LAS_CUENTAS = 'cuentas-automaticas.invalid';

/**
 * El correo de la cuenta que corresponde. Sin Prestadora, la que sólo pide la lista. Un rol que no
 * se conoce no tiene cuenta: se corta, no se cae a otra.
 */
export function cuentaDelTrabajo({ prestadoraId = null, trabajo, rol = 'trabajo_sin_persona' }) {
  if (!prestadoraId) return `lista@${DOMINIO_DE_LAS_CUENTAS}`;
  if (rol === 'copia_de_respaldo') return `copia-${prestadoraId}@${DOMINIO_DE_LAS_CUENTAS}`;
  if (rol !== 'trabajo_sin_persona') throw new Error(`El rol ${rol} no tiene cuenta automática`);
  if (trabajo === TRABAJO_DE_LA_IMPORTACION) return `importacion-${prestadoraId}@${DOMINIO_DE_LAS_CUENTAS}`;
  return `trabajo-${prestadoraId}@${DOMINIO_DE_LAS_CUENTAS}`;
}

let contrasenas = null;
function contrasenaDe(correo) {
  if (!contrasenas) {
    const texto = process.env.CONTRASENAS_DE_LAS_CUENTAS_AUTOMATICAS;
    if (!texto) throw new Error('Falta CONTRASENAS_DE_LAS_CUENTAS_AUTOMATICAS: el trabajo sin persona no puede entrar a la base');
    contrasenas = JSON.parse(texto);
  }
  const contrasena = contrasenas[correo];
  if (!contrasena) throw new Error(`No hay contraseña para la cuenta automática ${correo.split('@')[0]}`);
  return contrasena;
}

/** Quien entra con las cuentas, uno por región. No guarda nada: los pases los guarda `pases`. */
const entradas = new Map();
function entradaDe(region) {
  if (!entradas.has(region)) {
    entradas.set(region, createClient(region.url, region.clavePublica, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }));
  }
  return entradas.get(region);
}

/** El pase vigente de cada cuenta, y el pedido en curso si se está renovando. */
const pases = new Map();

async function entrar(region, correo, anterior) {
  const auth = entradaDe(region).auth;
  if (anterior?.renovacion) {
    const { data, error } = await auth.refreshSession({ refresh_token: anterior.renovacion });
    if (!error && data?.session) return data.session;
  }
  const { data, error } = await auth.signInWithPassword({ email: correo, password: contrasenaDe(correo) });
  if (error || !data?.session) {
    throw new Error(`La cuenta automática ${correo.split('@')[0]} no pudo entrar: ${error?.message ?? 'sin pase'}`);
  }
  return data.session;
}

async function paseDe(region, correo) {
  const clave = `${region.url}|${correo}`;
  const guardado = pases.get(clave);
  if (guardado?.pase && guardado.vence - MARGEN_S > Date.now() / 1000) return guardado.pase;
  if (guardado?.pendiente) return guardado.pendiente;

  const pendiente = entrar(region, correo, guardado)
    .then((sesion) => {
      pases.set(clave, { pase: sesion.access_token, vence: sesion.expires_at, renovacion: sesion.refresh_token });
      return sesion.access_token;
    })
    .catch((err) => {
      pases.delete(clave);
      throw err;
    });
  pases.set(clave, { ...guardado, pendiente });
  return pendiente;
}

function conexionDelTrabajo({ prestadoraId, trabajo, rol, region = regionDeLaPrestadora(prestadoraId) }) {
  const correo = cuentaDelTrabajo({ prestadoraId, trabajo, rol });
  return createClient(region.url, region.clavePublica, {
    accessToken: async () => paseDe(region, correo),
  });
}

const contexto = new AsyncLocalStorage();

/** La conexión que corresponde a lo que se está haciendo ahora. */
export const supabase = new Proxy({}, {
  get(_, propiedad) {
    const conexion = contexto.getStore();
    if (!conexion) throw new Error('supabase: se usó fuera de enLaPrestadora, sin Prestadora no hay conexión');
    const valor = conexion[propiedad];
    return typeof valor === 'function' ? valor.bind(conexion) : valor;
  },
});

/**
 * Corre `hacer` adentro de una Prestadora, con la credencial de ese trabajo. `hacer` recibe además
 * esa conexión, para quien la quiera usar sin pasar por `supabase`.
 */
export function enLaPrestadora(prestadoraId, trabajo, hacer) {
  if (!prestadoraId) throw new Error(`enLaPrestadora: falta la Prestadora (${trabajo})`);
  const conexion = conexionDelTrabajo({ prestadoraId, trabajo });
  return contexto.run(conexion, () => hacer(conexion));
}

/**
 * La conexión de un trabajo que todavía no sabe su Prestadora. La base sólo le deja averiguarla:
 * la lista a recorrer, o la de una dirección pública.
 */
export function sinPrestadora(trabajo, region = regionDeLaPrestadora(null)) {
  return conexionDelTrabajo({ prestadoraId: null, trabajo, region });
}

/**
 * Corre `hacer` una vez por cada Prestadora, de a una, cada vez con su propia credencial. Lo que
 * falla en una se anota y no frena a las demás. Recorre todas las regiones: cada una contesta
 * por las Prestadoras que viven en ella. `hacer` recibe la Prestadora y esa conexión, para quien
 * la quiera usar sin pasar por `supabase`.
 *
 * `rol` cambia el rol de la credencial de cada Prestadora. Lo usa la copia de respaldo, que sólo
 * lee los archivos y las filas de la Prestadora: no escribe y no borra.
 */
export async function paraCadaPrestadora(trabajo, hacer, { rol } = {}) {
  for (const region of lasRegiones()) {
    const { data, error } = await sinPrestadora(trabajo, region).rpc('prestadoras_a_recorrer');
    if (error) {
      console.error(`${trabajo}: no se pudo saber qué Prestadoras recorrer:`, error.message);
      continue;
    }
    for (const prestadoraId of data ?? []) {
      try {
        const conexion = conexionDelTrabajo({ prestadoraId, trabajo, rol, region });
        await contexto.run(conexion, () => hacer(prestadoraId, conexion));
      } catch (err) {
        console.error(`${trabajo}: falló en la Prestadora ${prestadoraId}:`, err?.message ?? err);
      }
    }
  }
}

/* LA CREDENCIAL DE LA PERSONA.
   ============================

   Una ruta que atiende a una persona entra a la base con la credencial con la que esa persona
   inició sesión, no con la maestra. La base sabe entonces quién pide y le contesta sólo lo de su
   Prestadora: el aislamiento lo hace cumplir ella y no un filtro escrito en cada ruta.

   CÓMO SE COMPRUEBA. La firma se verifica con la clave pública de la región que la emitió
   (`auth.getClaims`, que baja esa clave una vez y la guarda). Con eso se sabe que la credencial es
   auténtica y no está vencida; lo demás se exige acá, porque `getClaims` no lo mira:
   - que sea de una persona —`role` igual a `authenticated`— y no la del trabajo sin persona, la
     pública o cualquier otra que la región también firme;
   - que diga quién es —`sub`—.
   Si algo de eso falta, no hay persona, y la ruta contesta que no está autorizada.

   UNA SOLA FORMA DE ABRIRLA Y UNA SOLA DE USARLA. La abre `abrirSesionDelPedido`, que llaman los
   tres middleware que dejan entrar a una persona —el del Panel y los de las dos aplicaciones—. Las
   rutas la piden con `clienteDelPedido(req)`, y si nadie la abrió, esa función no inventa una:
   corta el pedido. */

/** El que verifica firmas, uno por región, para que la clave pública bajada no se pierda. */
const verificadores = new Map();
function verificadorDe(region) {
  if (!verificadores.has(region)) {
    verificadores.set(region, createClient(region.url, region.clavePublica, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }));
  }
  return verificadores.get(region);
}

/** Las conexiones abiertas por pedido. Sólo este archivo las escribe: nadie más puede ponerle una. */
const conexionesDePedidos = new WeakMap();

function credencialDelPedido(req) {
  const encabezado = req.headers?.authorization || '';
  return encabezado.startsWith('Bearer ') ? encabezado.slice(7).trim() || null : null;
}

/**
 * Comprueba la credencial con la que llega el pedido y, si es de una persona, le deja al pedido
 * la conexión con esa credencial.
 *
 * Devuelve `{ id, aal }` —quién es y con qué nivel de comprobación entró— o `null` si no hay una
 * persona válida. Ante cualquier duda, `null`.
 */
export async function abrirSesionDelPedido(req) {
  const credencial = credencialDelPedido(req);
  if (!credencial) return null;

  const region = regionDeLaCredencial(credencial);
  if (!region) return null;

  let datos;
  try {
    const { data, error } = await verificadorDe(region).auth.getClaims(credencial);
    if (error) return null;
    datos = data?.claims;
  } catch {
    return null;
  }

  if (!datos || datos.iss !== region.emisor) return null;
  if (datos.role !== 'authenticated') return null;
  if (typeof datos.sub !== 'string' || !datos.sub) return null;

  // La información de salud, con la sesión de una persona, sale sólo anotada: la envoltura manda
  // esas consultas por las funciones que anotan, con el origen que tenga el pedido al ejecutarlas.
  conexionesDePedidos.set(req, conRegistroDeSalud(createClient(region.url, region.clavePublica, {
    accessToken: async () => credencial,
  }), () => origenDelPedido(req)));
  return { id: datos.sub, aal: datos.aal ?? null };
}

/**
 * La conexión con la credencial de quien pide. Es la única forma en que una ruta la obtiene.
 * Si el pedido no pasó por un middleware que la abriera, no hay conexión y el pedido se corta: no
 * se cae a la maestra.
 */
export function clienteDelPedido(req) {
  const conexion = conexionesDePedidos.get(req);
  if (!conexion) {
    throw new Error('clienteDelPedido: el pedido no trae la sesión de una persona');
  }
  return conexion;
}
