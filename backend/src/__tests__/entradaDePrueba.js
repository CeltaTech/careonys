/**
 * Las cuentas automáticas, en las pruebas. Se carga antes de cada archivo de prueba.
 *
 * El backend entra a la base con una cuenta automática por Prestadora, con correo y contraseña, y
 * Supabase le devuelve el pase. Acá no hay Supabase: esto contesta la entrada como lo haría él, con
 * un pase que dice lo mismo que arma `interno.armar_el_pase` —el rol, la Prestadora y, para la
 * importación, el trabajo—, sacado del correo de la cuenta.
 *
 * Las contraseñas son inventadas y nacen acá, una por cada Prestadora que nombra el archivo de
 * prueba que corre, más la de la Prestadora de prueba compartida.
 *
 * Lo que no prueba: que la base de verdad le dé a cada cuenta su rol y su Prestadora. Eso se
 * comprobó contra la base, entrando con cada cuenta.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';

// La de `adentroDeUnaPrestadora.js`. No se la importa: eso cargaría la conexión antes de que la
// prueba deje puesta la dirección de su base de mentira.
const PRESTADORA_DE_PRUEBA = '0a000000-0000-4000-8000-0000000000a1';
const DOMINIO = 'cuentas-automaticas.invalid';
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

if (!process.env.CONTRASENAS_DE_LAS_CUENTAS_AUTOMATICAS) {
  const prestadoras = new Set([PRESTADORA_DE_PRUEBA]);
  const archivo = process.argv[1];
  if (archivo && fs.existsSync(archivo)) {
    for (const id of fs.readFileSync(archivo, 'utf8').match(UUID) ?? []) prestadoras.add(id.toLowerCase());
  }
  const inventada = () => crypto.randomBytes(16).toString('hex');
  const contrasenas = { [`lista@${DOMINIO}`]: inventada() };
  for (const id of prestadoras) {
    for (const cuenta of ['trabajo', 'copia', 'importacion']) contrasenas[`${cuenta}-${id}@${DOMINIO}`] = inventada();
  }
  process.env.CONTRASENAS_DE_LAS_CUENTAS_AUTOMATICAS = JSON.stringify(contrasenas);
}

const enBase64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** Lo que pondría `interno.armar_el_pase` en el pase de esa cuenta. */
function contenidoDelPase(correo) {
  const [local] = correo.split('@');
  if (local === 'lista') return { role: 'trabajo_sin_persona' };
  const [, cuenta, prestadoraId] = local.match(/^(trabajo|copia|importacion)-(.+)$/) ?? [];
  if (!cuenta) return null;
  if (cuenta === 'copia') return { role: 'copia_de_respaldo', prestadora_id: prestadoraId };
  if (cuenta === 'importacion') return { role: 'trabajo_sin_persona', prestadora_id: prestadoraId, trabajo: 'importación de planillas' };
  return { role: 'trabajo_sin_persona', prestadora_id: prestadoraId };
}

/** Qué cuenta corresponde a cada pase de renovación entregado. */
const renovaciones = new Map();

function respuesta(estado, cuerpo) {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });
}

async function contestarLaEntrada(url, opciones) {
  const tipo = new URL(url).searchParams.get('grant_type');
  const cuerpo = JSON.parse(typeof opciones?.body === 'string' ? opciones.body : '{}');
  let correo = null;
  if (tipo === 'password') {
    const contrasenas = JSON.parse(process.env.CONTRASENAS_DE_LAS_CUENTAS_AUTOMATICAS);
    if (contrasenas[cuerpo.email] === cuerpo.password) correo = cuerpo.email;
  } else if (tipo === 'refresh_token') {
    correo = renovaciones.get(cuerpo.refresh_token) ?? null;
  }
  const contenido = correo && contenidoDelPase(correo);
  if (!contenido) return respuesta(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });

  const ahora = Math.floor(Date.now() / 1000);
  const pase = `${enBase64({ alg: 'none', typ: 'JWT' })}.${enBase64({ ...contenido, iat: ahora, exp: ahora + 3600 })}.prueba`;
  const renovacion = crypto.randomBytes(12).toString('hex');
  renovaciones.set(renovacion, correo);
  return respuesta(200, {
    access_token: pase,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: ahora + 3600,
    refresh_token: renovacion,
    user: { id: crypto.randomUUID(), aud: 'authenticated', role: 'authenticated', email: correo },
  });
}

/** Si el pedido es la entrada de una cuenta automática. La de una persona sigue de largo. */
function esDeUnaCuentaAutomatica(url, opciones) {
  if (!url.includes('/auth/v1/token')) return false;
  try {
    const cuerpo = JSON.parse(typeof opciones?.body === 'string' ? opciones.body : '{}');
    return String(cuerpo.email ?? '').endsWith(`@${DOMINIO}`) || renovaciones.has(cuerpo.refresh_token);
  } catch {
    return false;
  }
}

/** La entrada se contesta acá, aunque la prueba ponga su propio `fetch`: se lo envuelve. */
function envolver(original) {
  return async (recurso, opciones) => {
    const url = typeof recurso === 'string' ? recurso : recurso?.url ?? String(recurso);
    if (esDeUnaCuentaAutomatica(url, opciones)) return contestarLaEntrada(url, opciones);
    return original(recurso, opciones);
  };
}

let actual = envolver(globalThis.fetch);
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  get: () => actual,
  set: (nuevo) => { actual = envolver(nuevo); },
});
