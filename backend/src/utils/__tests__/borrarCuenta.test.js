/**
 * `borrarCuenta` llamada derecho, sin ninguna ruta que la cuide antes.
 *
 *   npm test --prefix backend
 *   node --test backend/src/utils/__tests__/borrarCuenta.test.js
 *
 * QUÉ SE PRUEBA. La baja la hace la base, con `dar_de_baja_la_cuenta`, adentro de una Prestadora:
 * la cuenta de otra no la encuentra. Lo que le toca a esta función es no preguntarle nada a la base
 * cuando falta la cuenta o la Prestadora, pedir la baja con la credencial de la Prestadora que se le
 * nombró y no de otra, y no dar por hecha una baja que la base dijo que no hizo.
 *
 * La base es de mentira y responde por HTTP como responde la de verdad, así que lo que se comprueba
 * es qué terminó pidiéndole la función a la base y con qué credencial. Que la base se niegue de
 * verdad a tocar otra Prestadora se prueba contra la base, no acá.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import crypto from 'node:crypto';

const PRESTADORA_PROPIA = '11111111-1111-1111-1111-111111111111';
const CUENTA = '33333333-3333-3333-3333-333333333333';

/** Lo que contesta la base cuando se le pide la baja. */
let respuestaDeLaBase = true;
/** Todo lo que se le pidió a la base. */
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const url = new URL(req.url, 'http://interno');
    llamadas.push({
      metodo: req.method,
      ruta: url.pathname,
      cuerpo: crudo ? JSON.parse(crudo) : null,
      credencial: String(req.headers.authorization || '').replace(/^Bearer /, ''),
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(url.pathname === '/rest/v1/rpc/dar_de_baja_la_cuenta' ? JSON.stringify(respuestaDeLaBase) : '[]');
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-mentira';
process.env.SUPABASE_ANON_KEY = 'clave-publica-de-mentira';
// Una clave inventada para generar la credencial del trabajo sin persona, nacida acá y descartada
// al terminar.
const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
process.env.CLAVE_DEL_TRABAJO_SIN_PERSONA = JSON.stringify({ ...privateKey.export({ format: 'jwk' }), kid: 'prueba' });

// El import va después de dejar puestas las variables de entorno: la conexión a la base se arma
// en el momento en que se importa, y con la dirección que haya en ese instante.
const { borrarCuenta } = await import('../cuentasPanel.js');

after(() => {
  baseFalsa.close();
});

beforeEach(() => {
  llamadas = [];
  respuestaDeLaBase = true;
});

async function elMotivo(promesa) {
  return promesa.then(
    () => null,
    (error) => error.message,
  );
}

/** Lo que dice adentro una credencial, sin comprobar la firma: eso lo hace la base. */
function contenidoDe(credencial) {
  return JSON.parse(Buffer.from(credencial.split('.')[1], 'base64url').toString('utf8'));
}

describe('borrarCuenta', () => {
  it('sin Prestadora no le pregunta nada a la base', async () => {
    assert.match(await elMotivo(borrarCuenta(CUENTA, { prestadoraId: null })), /No hay permiso/);
    assert.match(await elMotivo(borrarCuenta(CUENTA, {})), /No hay permiso/);
    assert.match(await elMotivo(borrarCuenta(CUENTA)), /No hay permiso/);
    assert.deepEqual(llamadas, []);
  });

  it('sin cuenta no le pregunta nada a la base', async () => {
    assert.match(await elMotivo(borrarCuenta(undefined, { prestadoraId: PRESTADORA_PROPIA })), /No hay permiso/);
    assert.deepEqual(llamadas, []);
  });

  it('pide la baja de esa cuenta, con la credencial de esa Prestadora', async () => {
    await borrarCuenta(CUENTA, { prestadoraId: PRESTADORA_PROPIA });

    assert.equal(llamadas.length, 1);
    const [pedido] = llamadas;
    assert.equal(pedido.metodo, 'POST');
    assert.equal(pedido.ruta, '/rest/v1/rpc/dar_de_baja_la_cuenta');
    assert.deepEqual(pedido.cuerpo, { p_usuario: CUENTA });

    const contenido = contenidoDe(pedido.credencial);
    assert.equal(contenido.role, 'trabajo_sin_persona');
    assert.equal(contenido.prestadora_id, PRESTADORA_PROPIA);
  });

  it('no sale ningún borrado por fuera de la base', async () => {
    await borrarCuenta(CUENTA, { prestadoraId: PRESTADORA_PROPIA });
    assert.deepEqual(llamadas.filter((l) => l.metodo === 'DELETE'), []);
    assert.deepEqual(llamadas.filter((l) => l.ruta.startsWith('/auth/')), []);
  });

  it('si la base no encontró qué dar de baja, no la da por hecha', async () => {
    respuestaDeLaBase = false;
    assert.match(await elMotivo(borrarCuenta(CUENTA, { prestadoraId: PRESTADORA_PROPIA })), /No hay permiso/);
  });
});
