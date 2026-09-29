import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

/* La conexión con la base.
   ========================

   HAY DOS CREDENCIALES. La llave maestra, que alcanza todas las Prestadoras y se saltea la
   protección por fila, y la del trabajo sin persona, que el backend genera para una sola Prestadora
   y que la base limita a lo que ese trabajo usa. La maestra se va sacando a medida que cada trabajo
   pasa a la otra (docs/PLAN_HASTA_PRODUCCION.md, «La credencial del trabajo sin persona»).

   QUIÉN ELIGE CUÁL. Nadie, adentro del código que consulta. Todo el backend importa `supabase` de
   acá, y lo que corre adentro de `enLaPrestadora` recibe, sin enterarse, la conexión con la
   credencial de esa Prestadora. Así un trabajo se pasa de una a otra envolviéndolo, sin tocar las
   funciones que llama: mandar un correo, un mensaje de WhatsApp, leer el idioma. Lo que corre afuera
   sigue con la maestra, que es lo que todavía no se mudó.

   LA CREDENCIAL ES CORTA. Vive diez minutos y se genera otra antes de que venza, en cada pedido que
   la necesita: un trabajo largo nunca queda con una vencida. */

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

function conexionDelTrabajo({ prestadoraId, trabajo }) {
  let vigente = null;
  return createClient(URL, process.env.SUPABASE_ANON_KEY, {
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
 * Corre `hacer` una vez por cada Prestadora, de a una, cada vez con su propia credencial. Lo que
 * falla en una se anota y no frena a las demás.
 */
export async function paraCadaPrestadora(trabajo, hacer) {
  const lista = conexionDelTrabajo({ prestadoraId: null, trabajo });
  const { data, error } = await lista.rpc('prestadoras_a_recorrer');
  if (error) {
    console.error(`${trabajo}: no se pudo saber qué Prestadoras recorrer:`, error.message);
    return;
  }
  for (const prestadoraId of data ?? []) {
    try {
      await enLaPrestadora(prestadoraId, trabajo, () => hacer(prestadoraId));
    } catch (err) {
      console.error(`${trabajo}: falló en la Prestadora ${prestadoraId}:`, err?.message ?? err);
    }
  }
}
