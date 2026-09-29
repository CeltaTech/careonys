/**
 * La credencial de la persona: se comprueba con la clave pública de la región que la emitió,
 * y la conexión que queda en el pedido lleva esa credencial y ninguna otra.
 *
 *   node --test src/db/__tests__/credencialDeLaPersona.test.js
 *
 * POR QUÉ EXISTE ESTA PRUEBA. Una ruta migrada entra a la base con la conexión que devuelve
 * `clienteDelPedido(req)` (`../connection.js`), y la base le contesta según quién sea. Si esa
 * conexión se abriera con una credencial falsa, vencida, de otra región o que no es de una
 * persona, la base le contestaría a quien no corresponde. Todo eso lo decide `abrirSesionDelPedido`.
 *
 * La base es de mentira y contesta por HTTP como la de verdad, incluida la lista de claves
 * públicas de la región. Las credenciales se firman acá, con una clave hecha en el momento.
 *
 * Con el sistema roto —la firma sin comprobar, el emisor o el tipo de credencial sin mirar, o la
 * conexión armada con la llave maestra— las pruebas de rechazo y la de la credencial que llega a la
 * base dan al revés. Lo que no puede ver es qué filas devuelve la base de verdad con esa
 * credencial: eso es de `scripts/probar_aislamiento.mjs`.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { generateKeyPairSync, sign } from 'node:crypto';

const PERSONA = '22222222-2222-2222-2222-222222222222';
const KID = 'clave-de-la-region';

const { privateKey: clavePrivada, publicKey: clavePublica } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const { privateKey: otraClavePrivada } = generateKeyPairSync('ec', { namedCurve: 'P-256' });

let llamadas = [];
let respuestaDelUsuario = null;

const baseFalsa = createServer((req, res) => {
  const ruta = new URL(req.url, 'http://interno').pathname;
  llamadas.push({ ruta, credencial: req.headers.authorization, apikey: req.headers.apikey });
  res.setHeader('Content-Type', 'application/json');
  if (ruta === '/auth/v1/.well-known/jwks.json') {
    res.end(JSON.stringify({
      keys: [{ ...clavePublica.export({ format: 'jwk' }), kid: KID, alg: 'ES256', use: 'sig' }],
    }));
    return;
  }
  if (ruta === '/auth/v1/user') {
    if (!respuestaDelUsuario) {
      res.writeHead(401);
      res.end(JSON.stringify({ message: 'credencial inválida' }));
      return;
    }
    res.end(JSON.stringify(respuestaDelUsuario));
    return;
  }
  res.end('[]');
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
const URL_BASE = `http://127.0.0.1:${baseFalsa.address().port}`;
process.env.SUPABASE_URL = URL_BASE;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-maestra-de-mentira';
process.env.SUPABASE_ANON_KEY = 'clave-publica-de-mentira';

const { abrirSesionDelPedido, clienteDelPedido } = await import('../connection.js');
const { regionDeLaCredencial, regionDeLaPrestadora } = await import('../regiones.js');

after(() => baseFalsa.close());

beforeEach(() => {
  llamadas = [];
  respuestaDelUsuario = null;
});

const enBase64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** Una credencial firmada como la firma la región, con lo que cada prueba le cambie. */
function credencial(cambios = {}, { llave = clavePrivada, kid = KID } = {}) {
  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = enBase64({ alg: 'ES256', typ: 'JWT', kid });
  const cuerpo = enBase64({
    sub: PERSONA,
    role: 'authenticated',
    aud: 'authenticated',
    iss: `${URL_BASE}/auth/v1`,
    iat: ahora,
    exp: ahora + 3600,
    aal: 'aal1',
    ...cambios,
  });
  const firma = sign('sha256', Buffer.from(`${cabecera}.${cuerpo}`), { key: llave, dsaEncoding: 'ieee-p1363' });
  return `${cabecera}.${cuerpo}.${firma.toString('base64url')}`;
}

function pedidoCon(valor) {
  return { headers: valor === undefined ? {} : { authorization: valor } };
}

describe('abrir la sesión de la persona', () => {
  it('una credencial auténtica abre la sesión y dice quién es y cómo entró', async () => {
    const req = pedidoCon(`Bearer ${credencial({ aal: 'aal2' })}`);

    const sesion = await abrirSesionDelPedido(req);

    assert.deepEqual(sesion, { id: PERSONA, aal: 'aal2' });
  });

  it('la firma se comprueba con la clave pública de la región, sin preguntarle a la base por la persona', async () => {
    await abrirSesionDelPedido(pedidoCon(`Bearer ${credencial()}`));

    assert.equal(llamadas.some((l) => l.ruta === '/auth/v1/user'), false);
  });

  it('la conexión que queda en el pedido lleva la credencial de la persona, no la llave maestra', async () => {
    const texto = credencial();
    const req = pedidoCon(`Bearer ${texto}`);
    await abrirSesionDelPedido(req);
    llamadas = [];

    await clienteDelPedido(req).from('cualquier_tabla').select('id');

    const consulta = llamadas.find((l) => l.ruta === '/rest/v1/cualquier_tabla');
    assert.equal(consulta.credencial, `Bearer ${texto}`);
    assert.equal(consulta.apikey, 'clave-publica-de-mentira');
  });

  it('una firma hecha con otra clave no abre nada', async () => {
    const req = pedidoCon(`Bearer ${credencial({}, { llave: otraClavePrivada })}`);

    assert.equal(await abrirSesionDelPedido(req), null);
    assert.throws(() => clienteDelPedido(req));
  });

  it('una credencial vencida no abre nada', async () => {
    const hace = Math.floor(Date.now() / 1000) - 7200;
    const req = pedidoCon(`Bearer ${credencial({ iat: hace, exp: hace + 3600 })}`);

    assert.equal(await abrirSesionDelPedido(req), null);
  });

  it('una credencial de otra región no abre nada, aunque la firma sea buena', async () => {
    const req = pedidoCon(`Bearer ${credencial({ iss: 'https://otra-region.example/auth/v1' })}`);

    assert.equal(await abrirSesionDelPedido(req), null);
    assert.equal(llamadas.length, 0, 'ni siquiera se le pregunta a nadie');
  });

  it('la credencial del trabajo sin persona y la pública no son de una persona', async () => {
    for (const role of ['trabajo_sin_persona', 'anon', 'service_role']) {
      const req = pedidoCon(`Bearer ${credencial({ role })}`);
      assert.equal(await abrirSesionDelPedido(req), null, `el rol ${role} abrió una sesión`);
    }
  });

  it('sin decir quién es, no hay persona', async () => {
    const req = pedidoCon(`Bearer ${credencial({ sub: '' })}`);

    assert.equal(await abrirSesionDelPedido(req), null);
  });

  it('sin credencial, o con algo que no es una credencial, no hay persona', async () => {
    for (const valor of [undefined, '', 'Bearer ', 'Bearer token-de-mentira', 'Basic abc', credencial()]) {
      assert.equal(await abrirSesionDelPedido(pedidoCon(valor)), null, `abrió con ${String(valor).slice(0, 20)}`);
    }
  });

  it('una credencial sin clave pública conocida se le pregunta a la base, y si la base dice que no, no hay persona', async () => {
    const req = pedidoCon(`Bearer ${credencial({}, { kid: 'clave-que-nadie-publico' })}`);

    assert.equal(await abrirSesionDelPedido(req), null);
    assert.ok(llamadas.some((l) => l.ruta === '/auth/v1/user'));
  });
});

describe('la conexión del pedido', () => {
  it('si nadie abrió la sesión, no hay conexión y el pedido se corta: no se cae a la llave maestra', () => {
    assert.throws(() => clienteDelPedido(pedidoCon(`Bearer ${credencial()}`)), /no trae la sesión de una persona/);
  });

  it('cada pedido tiene la suya', async () => {
    const uno = pedidoCon(`Bearer ${credencial()}`);
    const otro = pedidoCon(`Bearer ${credencial({ sub: '33333333-3333-3333-3333-333333333333' })}`);
    await abrirSesionDelPedido(uno);
    await abrirSesionDelPedido(otro);

    assert.notEqual(clienteDelPedido(uno), clienteDelPedido(otro));
  });
});

describe('la región', () => {
  it('la de una credencial es la que la emitió', () => {
    const region = regionDeLaCredencial(credencial());

    assert.equal(region.url, URL_BASE);
    assert.equal(region.emisor, `${URL_BASE}/auth/v1`);
  });

  it('un emisor que no es de ninguna región no elige ninguna', () => {
    assert.equal(regionDeLaCredencial(credencial({ iss: 'https://otra.example/auth/v1' })), null);
    assert.equal(regionDeLaCredencial(credencial({ iss: undefined })), null);
    assert.equal(regionDeLaCredencial('no-es-una-credencial'), null);
  });

  it('la de una Prestadora sale del mismo lugar', () => {
    assert.equal(regionDeLaPrestadora('11111111-1111-1111-1111-111111111111').url, URL_BASE);
  });
});
