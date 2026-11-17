/**
 * La seguridad de la propia cuenta, abierta a los Asistentes y a los Clientes.
 *
 *   npm test --prefix backend
 *   node --test backend/src/routes/__tests__/cuentaSeguraDeLasApps.test.js
 *
 * POR QUÉ EXISTE ESTA PRUEBA. Mandar el código de verificación, comprobarlo, reconocer el equipo y
 * cerrar todas las sesiones viven en un solo lugar (`../cuentaSegura.js`), y el Panel y las dos
 * aplicaciones lo montan cada uno con su propia comprobación de sesión. Lo que hay que sostener:
 *
 *   1. Que cada aplicación deje pasar sólo a su gente: un Asistente no entra por la puerta de los
 *      Clientes, ni al revés, y sin sesión no entra nadie.
 *   2. Que la propia cuenta se lea con la credencial de quien pide y filtrada por su cuenta, nunca
 *      con la del trabajo de la Prestadora.
 *   3. Que el número no salga en la respuesta.
 *   4. Que sin persona en el pedido se conteste «no encontrado»: falla cerrado.
 *   5. Que la comprobación extra del Panel alcance sólo a las rutas del número.
 *   6. Que las tres puertas tengan las mismas rutas, y la contraseña propia sólo en el Panel.
 *
 * La base es de mentira y contesta por HTTP como la de verdad. Datos inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-1111-4111-8111-111111111111';
const CUENTA_ASISTENTE = '22222222-2222-4222-8222-222222222222';
const CUENTA_CLIENTE = '33333333-3333-4333-8333-333333333333';
const LEGAJO = '44444444-4444-4444-8444-444444444444';
const CLIENTE = '55555555-5555-4555-8555-555555555555';
const NUMERO = '+5400000009';

const CUENTAS = {
  [CUENTA_ASISTENTE]: { id: CUENTA_ASISTENTE, rol: 'asistente', nombre: 'Asistente Inventada', email: 'asistente@ejemplo.test', telefono: NUMERO, telefono_verificado_en: null, prestadora_id: PRESTADORA, desactivada_en: null },
  [CUENTA_CLIENTE]: { id: CUENTA_CLIENTE, rol: 'cliente', nombre: 'Cliente Inventado', email: 'cliente@ejemplo.test', telefono: null, telefono_verificado_en: null, prestadora_id: PRESTADORA, desactivada_en: null },
};

let llamadas = [];
let quienEntra = CUENTA_ASISTENTE;

function leerCredencial(autorizacion) {
  try {
    return JSON.parse(Buffer.from(autorizacion.replace('Bearer ', '').split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

function contestar(req, url) {
  const ruta = url.pathname;
  const credencial = leerCredencial(req.headers.authorization ?? '');
  const delTrabajo = credencial?.role === 'trabajo_sin_persona';

  if (ruta === '/auth/v1/user') return { id: quienEntra, aud: 'authenticated' };

  if (ruta === '/rest/v1/usuarios') {
    // Con la credencial de quien pide, la base le contesta sólo su propia cuenta.
    if (delTrabajo) return [];
    const pedida = url.searchParams.get('id')?.replace('eq.', '');
    const propia = CUENTAS[credencial?.sub];
    return propia && pedida === propia.id ? [propia] : [];
  }
  if (ruta === '/rest/v1/asistentes') return credencial?.sub === CUENTA_ASISTENTE ? [{ id: LEGAJO }] : [];
  if (ruta === '/rest/v1/clientes') return credencial?.sub === CUENTA_CLIENTE ? [{ id: CLIENTE }] : [];
  if (ruta === '/rest/v1/personas_autorizadas') return [];
  if (ruta === '/rest/v1/equipos_conocidos') return [];
  if (ruta === '/rest/v1/plantillas_whatsapp') return [];
  return undefined;
}

const baseFalsa = createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    const url = new URL(req.url, 'http://interno');
    llamadas.push({
      clave: `${req.method} ${url.pathname}`,
      url,
      credencial: leerCredencial(req.headers.authorization ?? ''),
    });
    const valor = contestar(req, url);
    if (valor === undefined) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `la prueba no preparó respuesta para ${req.method} ${url.pathname}` }));
      return;
    }
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? valor[0] ?? null : valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

// El import va después de dejar puestas las variables de entorno: la conexión a la base se arma
// en el momento en que se importa.
const { default: express } = await import('express');
await import('express-async-errors');
const { abrirSesionDelPedido } = await import('../../db/connection.js');
const { rutasDeLaCuentaSegura } = await import('../cuentaSegura.js');
const { appAsistentesCuentaSeguraRouter } = await import('../appAsistentesCuentaSegura.js');
const { appClientesCuentaSeguraRouter } = await import('../appClientesCuentaSegura.js');
const { panelCuentaSeguraRouter } = await import('../panelCuentaSegura.js');

// Una comprobación de sesión de mentira que abre la sesión pero no deja a nadie en el pedido.
async function sesionSinPersona(req, res, next) {
  if (!(await abrirSesionDelPedido(req))) return res.status(401).json({ error: 'No autorizado' });
  next();
}
// Una comprobación extra que siempre cierra, para ver a qué rutas alcanza.
function siempreCierra(req, res) {
  res.status(418).json({ error: 'cerrado_por_la_prueba' });
}

const app = express();
app.use(express.json());
app.use('/asistentes', appAsistentesCuentaSeguraRouter);
app.use('/clientes', appClientesCuentaSeguraRouter);
app.use('/sin-persona', rutasDeLaCuentaSegura({ requiereSesion: sesionSinPersona, quienPide: () => null }));
app.use('/con-extra', rutasDeLaCuentaSegura({
  requiereSesion: sesionSinPersona,
  quienPide: () => null,
  soloElDuenoDelTelefono: [siempreCierra],
}));
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}`;

after(() => {
  backend.close();
  baseFalsa.close();
});

beforeEach(() => {
  llamadas = [];
});

async function pedir(metodo, ruta, { cuenta = null, cuerpo } = {}) {
  if (cuenta) quienEntra = cuenta;
  const cabeceras = { 'Content-Type': 'application/json' };
  if (cuenta) cabeceras.Authorization = sesionDePrueba(cuenta);
  const respuesta = await fetch(`${DIRECCION}${ruta}`, {
    method: metodo,
    headers: cabeceras,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

function lecturasDeLaCuenta() {
  return llamadas.filter((l) => l.clave === 'GET /rest/v1/usuarios');
}

describe('cada aplicación deja pasar sólo a su gente', () => {
  it('el Asistente ve cómo está su cuenta', async () => {
    const { estado, cuerpo } = await pedir('GET', '/asistentes', { cuenta: CUENTA_ASISTENTE });
    assert.equal(estado, 200);
    assert.equal(cuerpo.telefonoCargado, true);
    assert.equal(cuerpo.telefonoVerificado, false);
    assert.deepEqual(cuerpo.equipos, []);
  });

  it('el Cliente ve cómo está su cuenta', async () => {
    const { estado, cuerpo } = await pedir('GET', '/clientes', { cuenta: CUENTA_CLIENTE });
    assert.equal(estado, 200);
    assert.equal(cuerpo.telefonoCargado, false);
  });

  it('un Asistente no entra por la puerta de los Clientes', async () => {
    const { estado } = await pedir('GET', '/clientes', { cuenta: CUENTA_ASISTENTE });
    assert.equal(estado, 403);
    assert.ok(!llamadas.some((l) => l.clave === 'GET /rest/v1/equipos_conocidos'));
  });

  it('un Cliente no entra por la puerta de los Asistentes', async () => {
    const { estado } = await pedir('GET', '/asistentes', { cuenta: CUENTA_CLIENTE });
    assert.equal(estado, 403);
  });

  it('sin sesión no entra nadie', async () => {
    assert.equal((await pedir('GET', '/asistentes')).estado, 401);
    assert.equal((await pedir('POST', '/clientes/cerrar-sesiones', { cuerpo: { claveActual: 'x' } })).estado, 401);
  });
});

describe('la propia cuenta, con la credencial de quien pide', () => {
  it('se lee con la credencial de la persona y filtrada por su cuenta', async () => {
    await pedir('GET', '/asistentes', { cuenta: CUENTA_ASISTENTE });
    const lecturas = lecturasDeLaCuenta();
    assert.ok(lecturas.length > 0, 'no se leyó la cuenta');
    for (const lectura of lecturas) {
      assert.equal(lectura.credencial?.role, 'authenticated', 'la cuenta se leyó con otra credencial');
      assert.equal(lectura.credencial.sub, CUENTA_ASISTENTE);
      assert.equal(lectura.url.searchParams.get('id'), `eq.${CUENTA_ASISTENTE}`);
    }
  });

  it('el número no sale en la respuesta', async () => {
    const { cuerpo } = await pedir('GET', '/asistentes', { cuenta: CUENTA_ASISTENTE });
    assert.ok(!JSON.stringify(cuerpo).includes(NUMERO));
    assert.ok(!JSON.stringify(cuerpo).includes('0000009'));
  });

  it('cerrar todas las sesiones sin la contraseña actual no hace nada', async () => {
    const { estado, cuerpo } = await pedir('POST', '/clientes/cerrar-sesiones', { cuenta: CUENTA_CLIENTE, cuerpo: {} });
    assert.equal(estado, 400);
    assert.equal(cuerpo.error, 'faltan_datos');
  });
});

describe('falla cerrado', () => {
  it('sin persona en el pedido contesta «no encontrado»', async () => {
    const { estado, cuerpo } = await pedir('GET', '/sin-persona', { cuenta: CUENTA_ASISTENTE });
    assert.equal(estado, 404);
    assert.equal(cuerpo.error, 'no_encontrado');
    assert.equal(lecturasDeLaCuenta().length, 0, 'sin persona no tenía que leer ninguna cuenta');
  });

  it('las rutas no se arman sin comprobación de sesión o sin quién pide', () => {
    assert.throws(() => rutasDeLaCuentaSegura({ quienPide: () => null }));
    assert.throws(() => rutasDeLaCuentaSegura({ requiereSesion: sesionSinPersona }));
  });
});

describe('la comprobación extra alcanza sólo a las rutas del número', () => {
  for (const ruta of ['/telefono/codigo', '/telefono/confirmar', '/telefono/cambiar']) {
    it(`cierra ${ruta}`, async () => {
      const { estado } = await pedir('POST', `/con-extra${ruta}`, { cuenta: CUENTA_ASISTENTE, cuerpo: {} });
      assert.equal(estado, 418);
    });
  }

  for (const ruta of ['/equipo/confirmar', '/cerrar-sesiones']) {
    it(`no toca ${ruta}`, async () => {
      const { estado } = await pedir('POST', `/con-extra${ruta}`, { cuenta: CUENTA_ASISTENTE, cuerpo: {} });
      assert.notEqual(estado, 418);
    });
  }
});

describe('las tres puertas tienen las mismas rutas', () => {
  function rutasDe(router) {
    return router.stack
      .filter((capa) => capa.route)
      .map((capa) => `${Object.keys(capa.route.methods).join(',').toUpperCase()} ${capa.route.path}`)
      .sort();
  }

  it('Asistentes y Clientes, las mismas que el Panel menos la contraseña propia', () => {
    const delPanel = rutasDe(panelCuentaSeguraRouter);
    assert.ok(delPanel.includes('POST /clave'));
    const sinLaContrasena = delPanel.filter((r) => r !== 'POST /clave');
    assert.deepEqual(rutasDe(appAsistentesCuentaSeguraRouter), sinLaContrasena);
    assert.deepEqual(rutasDe(appClientesCuentaSeguraRouter), sinLaContrasena);
  });
});
