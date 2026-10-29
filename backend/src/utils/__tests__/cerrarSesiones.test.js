/**
 * Cerrar las sesiones de una persona, sin llave maestra.
 *
 *   npm test --prefix backend
 *
 * QUÉ SE PRUEBA. Dos cosas que estuvieron mal a la vez:
 *
 *  1. «Cerrar sesión en todos los equipos» le pasaba al servicio de acceso el número de la cuenta
 *     donde él espera una sesión, así que no cerraba nada. Ahora va con la sesión de la propia
 *     persona y la llave pública.
 *  2. Comprobar la clave actual abre una sesión para ver si la clave entra, y al cerrarla la
 *     biblioteca cerraba todas las de la persona. Ahora cierra sólo ésa.
 *
 * El servicio de acceso es de mentira y se mira qué le llegó.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';

const LLAVE_PUBLICA = 'clave-publica-de-mentira';
const LLAVE_MAESTRA = 'clave-maestra-de-mentira';
const PRESTADORA = '22222222-2222-2222-2222-222222222222';

// Una sesión de mentira con la forma de las de verdad: lo único que se lee de ella es quién la
// emitió, que es lo que elige la región a la que se le pide cerrar.
function sesionEmitidaPor(emisor) {
  const parte = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${parte({ alg: 'none' })}.${parte({ iss: emisor, sub: 'persona-inventada' })}.firma`;
}

let llamadas = [];

const accesoFalso = createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    const url = new URL(req.url, 'http://interno');
    llamadas.push({
      ruta: url.pathname,
      alcance: url.searchParams.get('scope'),
      llave: req.headers.apikey,
      sesion: String(req.headers.authorization || '').replace(/^Bearer /, ''),
    });
    if (url.pathname === '/auth/v1/token') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        access_token: 'sesion-de-la-comprobacion',
        refresh_token: 'renovacion',
        token_type: 'bearer',
        expires_in: 3600,
        user: { id: '33333333-3333-3333-3333-333333333333', aud: 'authenticated' },
      }));
      return;
    }
    res.writeHead(204);
    res.end();
  });
});

await new Promise((listo) => accesoFalso.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${accesoFalso.address().port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = LLAVE_MAESTRA;
process.env.SUPABASE_ANON_KEY = LLAVE_PUBLICA;

const SESION_DE_LA_PERSONA = sesionEmitidaPor(`${process.env.SUPABASE_URL}/auth/v1`);

const { olvidarRegiones } = await import('../../db/regiones.js');
olvidarRegiones();
const { cerrarTodasLasSesionesDe, esLaClaveActual, cambiarLaClave, olvidarClientePublico } =
  await import('../claveActual.js');
olvidarClientePublico();

after(() => {
  accesoFalso.close();
});

beforeEach(() => {
  llamadas = [];
});

describe('cerrar las sesiones de una persona', () => {
  it('va con la sesión de la persona y la llave pública, y las cierra todas', async () => {
    assert.equal(await cerrarTodasLasSesionesDe(SESION_DE_LA_PERSONA), true);

    const salidas = llamadas.filter((l) => l.ruta === '/auth/v1/logout');
    assert.equal(salidas.length, 1);
    assert.equal(salidas[0].alcance, 'global');
    assert.equal(salidas[0].sesion, SESION_DE_LA_PERSONA);
    assert.equal(salidas[0].llave, LLAVE_PUBLICA);
  });

  it('sin sesión no le pide nada al servicio de acceso', async () => {
    assert.equal(await cerrarTodasLasSesionesDe(''), false);
    assert.deepEqual(llamadas, []);
  });

  it('comprobar la clave cierra sólo la sesión que se abrió para comprobarla', async () => {
    assert.equal(await esLaClaveActual({
      usuarioId: '11111111-1111-1111-1111-111111111111',
      prestadoraId: PRESTADORA,
      clave: 'clave-inventada',
    }), true);

    const salidas = llamadas.filter((l) => l.ruta === '/auth/v1/logout');
    assert.equal(salidas.length, 1);
    assert.equal(salidas[0].alcance, 'local');
    assert.equal(salidas[0].sesion, 'sesion-de-la-comprobacion');
  });

  it('ningún pedido lleva la llave maestra', async () => {
    await cerrarTodasLasSesionesDe(SESION_DE_LA_PERSONA);
    assert.equal(llamadas.some((l) => l.llave === LLAVE_MAESTRA || l.sesion === LLAVE_MAESTRA), false);
  });
});

describe('sin región reconocida no se le pregunta a nadie', () => {
  it('una sesión que emitió otro servicio no cierra nada', async () => {
    const ajena = sesionEmitidaPor('https://otro-servicio.invalid/auth/v1');
    assert.equal(await cerrarTodasLasSesionesDe(ajena), false);
    assert.deepEqual(llamadas, []);
  });

  it('una sesión que no se puede leer no cierra nada', async () => {
    assert.equal(await cerrarTodasLasSesionesDe('no-es-una-sesion'), false);
    assert.deepEqual(llamadas, []);
  });

  it('sin Prestadora la clave no se comprueba, y se niega', async () => {
    assert.equal(await esLaClaveActual({
      usuarioId: '11111111-1111-1111-1111-111111111111',
      clave: 'clave-inventada',
    }), false);
    assert.deepEqual(llamadas, []);
  });

  it('sin Prestadora la clave no se cambia', async () => {
    await assert.rejects(cambiarLaClave({
      usuarioId: '11111111-1111-1111-1111-111111111111',
      claveActual: 'clave-inventada',
      claveNueva: 'otra-clave-inventada',
    }));
    assert.deepEqual(llamadas, []);
  });
});
