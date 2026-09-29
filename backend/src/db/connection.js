import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  regionDeLaCredencial,
  regionDeLaPrestadora,
  lasRegiones,
} from './regiones.js';

/* La conexión con la base.
   ========================

   HAY TRES CREDENCIALES.
   - La de la persona que pide: la misma con la que entró al Panel o a su aplicación. La base ve
     quién es y le contesta sólo lo de su Prestadora. Es la que usa una ruta migrada, a través de
     `clienteDelPedido(req)`.
   - La del trabajo sin persona, que el backend genera para una sola Prestadora y que la base
     limita a lo que ese trabajo usa.
   - La llave maestra, que alcanza todas las Prestadoras y se saltea la protección por fila. Queda
     sólo para lo que todavía no se mudó a ninguna de las otras dos, y se va sacando
     (docs/PLAN_HASTA_PRODUCCION.md, «Los cimientos»).

   QUIÉN ELIGE LA DEL TRABAJO. Nadie, adentro del código que consulta. Lo que corre adentro de
   `enLaPrestadora` recibe, sin enterarse, la conexión con la credencial de esa Prestadora a través
   de `supabase`. Así un trabajo se pasa de una a otra envolviéndolo, sin tocar las funciones que
   llama: mandar un correo, un mensaje de WhatsApp, leer el idioma. Lo que corre afuera sigue con la
   maestra, que es lo que todavía no se mudó.

   LA CREDENCIAL DEL TRABAJO ES CORTA. Vive diez minutos y se genera otra antes de que venza, en cada
   pedido que la necesita: un trabajo largo nunca queda con una vencida.

   NINGUNA CONEXIÓN SUPONE QUE HAY UNA SOLA BASE. Toda conexión nueva —la de la persona y la del
   trabajo— se arma con la región de la Prestadora (`db/regiones.js`). Hoy hay una sola,
   y el día que haya más, el único lugar que cambia es ése. */

const URL = process.env.SUPABASE_URL;

const maestra = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const DURACION_S = 10 * 60;
const MARGEN_S = 60;

let clave = null;
let kid = null;
function laClave() {
  if (!clave) {
    const texto = process.env.CLAVE_DEL_TRABAJO_SIN_PERSONA;
    if (!texto) throw new Error('Falta CLAVE_DEL_TRABAJO_SIN_PERSONA: el trabajo sin persona no puede entrar a la base');
    const jwk = JSON.parse(texto);
    clave = crypto.createPrivateKey({ key: jwk, format: 'jwk' });
    kid = jwk.kid;
  }
  return clave;
}

const enBase64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** Genera la credencial de un trabajo. Sin Prestadora, la base sólo le deja pedir la lista. */
export function generarCredencial({ prestadoraId = null, trabajo }) {
  const llave = laClave();
  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = enBase64({ alg: 'ES256', typ: 'JWT', kid });
  const cuerpo = enBase64({
    role: 'trabajo_sin_persona',
    iat: ahora,
    exp: ahora + DURACION_S,
    trabajo,
    ...(prestadoraId ? { prestadora_id: prestadoraId } : {}),
  });
  const firma = crypto.sign('sha256', Buffer.from(`${cabecera}.${cuerpo}`), { key: llave, dsaEncoding: 'ieee-p1363' });
  return { credencial: `${cabecera}.${cuerpo}.${firma.toString('base64url')}`, vence: ahora + DURACION_S };
}

function conexionDelTrabajo({ prestadoraId, trabajo, region = regionDeLaPrestadora(prestadoraId) }) {
  let vigente = null;
  return createClient(region.url, region.clavePublica, {
    accessToken: async () => {
      if (!vigente || vigente.vence - MARGEN_S < Date.now() / 1000) {
        vigente = generarCredencial({ prestadoraId, trabajo });
      }
      return vigente.credencial;
    },
  });
}

const contexto = new AsyncLocalStorage();

/** La conexión que corresponde a lo que se está haciendo ahora. */
export const supabase = new Proxy({}, {
  get(_, propiedad) {
    const conexion = contexto.getStore() ?? maestra;
    const valor = conexion[propiedad];
    return typeof valor === 'function' ? valor.bind(conexion) : valor;
  },
});

/** Corre `hacer` adentro de una Prestadora, con la credencial de ese trabajo. */
export function enLaPrestadora(prestadoraId, trabajo, hacer) {
  if (!prestadoraId) throw new Error(`enLaPrestadora: falta la Prestadora (${trabajo})`);
  return contexto.run(conexionDelTrabajo({ prestadoraId, trabajo }), hacer);
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
 * por las Prestadoras que viven en ella.
 */
export async function paraCadaPrestadora(trabajo, hacer) {
  for (const region of lasRegiones()) {
    const { data, error } = await sinPrestadora(trabajo, region).rpc('prestadoras_a_recorrer');
    if (error) {
      console.error(`${trabajo}: no se pudo saber qué Prestadoras recorrer:`, error.message);
      continue;
    }
    for (const prestadoraId of data ?? []) {
      try {
        await contexto.run(
          conexionDelTrabajo({ prestadoraId, trabajo, region }),
          () => hacer(prestadoraId),
        );
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

  conexionesDePedidos.set(req, createClient(region.url, region.clavePublica, {
    accessToken: async () => credencial,
  }));
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
