/**
 * Una cuenta no se borra: se desactiva. Borrar queda sólo para deshacer un alta cortada.
 *
 *   npm test --prefix backend
 *   node --test backend/src/utils/__tests__/borrarCuenta.test.js
 *
 * QUÉ SE PRUEBA. `desactivarCuenta`, `borrarCuentaDeUnAltaCortada` y `revocarPersonaAutorizada`
 * llamadas derecho, sin ninguna ruta que las cuide antes. La base hace el trabajo adentro de una
 * Prestadora; lo que les toca a estas funciones es no preguntarle nada cuando falta la cuenta, la
 * Prestadora o el motivo, pedir con la credencial de la Prestadora que se les nombró, no dar por
 * hecho lo que la base dijo que no hizo y, sobre todo, que quitar una persona autorizada desactive
 * su cuenta y no la borre.
 *
 * La base es de mentira y responde por HTTP como responde la de verdad. Datos inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import crypto from 'node:crypto';

const PRESTADORA_PROPIA = '11111111-1111-1111-1111-111111111111';
const CLIENTE = '22222222-2222-2222-2222-222222222222';
const CUENTA = '33333333-3333-3333-3333-333333333333';

/** Lo que contesta la base a las dos funciones. */
let respuestaDeLaBase = true;
/** Todo lo que se le pidió a la base. */
let llamadas = [];

const RUTAS_QUE_CONTESTAN = ['/rest/v1/rpc/desactivar_la_cuenta', '/rest/v1/rpc/deshacer_el_alta_de_la_cuenta'];

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
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    let respuesta = unoSolo ? null : [];
    if (RUTAS_QUE_CONTESTAN.includes(url.pathname)) respuesta = respuestaDeLaBase;
    if (req.method === 'GET' && url.pathname === '/rest/v1/clientes') {
      respuesta = unoSolo ? { usuario_id: '44444444-4444-4444-4444-444444444444' } : [{ usuario_id: '44444444-4444-4444-4444-444444444444' }];
    }
    if (req.method === 'GET' && url.pathname === '/rest/v1/personas_autorizadas') {
      respuesta = unoSolo ? { cliente_id: CLIENTE } : [{ cliente_id: CLIENTE }];
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(respuesta));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
process.env.SUPABASE_ANON_KEY = 'clave-publica-de-mentira';
// Una clave inventada para generar la credencial del trabajo sin persona, nacida acá y descartada
// al terminar.
const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
process.env.CLAVE_DEL_TRABAJO_SIN_PERSONA = JSON.stringify({ ...privateKey.export({ format: 'jwk' }), kid: 'prueba' });

// El import va después de dejar puestas las variables de entorno: la conexión a la base se arma
// en el momento en que se importa, y con la dirección que haya en ese instante.
const { desactivarCuenta, borrarCuentaDeUnAltaCortada, revocarPersonaAutorizada } = await import('../cuentasPanel.js');
const { conexionDe } = await import('../../__tests__/adentroDeUnaPrestadora.js');
const supabase = conexionDe();

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

/** Todo pedido que borre una cuenta: la función de deshacer un alta, la vieja, o un borrado de auth. */
function borradosDeCuenta() {
  return llamadas.filter((l) => l.ruta === '/rest/v1/rpc/deshacer_el_alta_de_la_cuenta'
    || l.ruta === '/rest/v1/rpc/dar_de_baja_la_cuenta'
    || l.ruta.startsWith('/auth/')
    || (l.metodo === 'DELETE' && l.ruta === '/rest/v1/usuarios'));
}

describe('desactivarCuenta', () => {
  it('sin Prestadora, sin cuenta o sin motivo no le pregunta nada a la base', async () => {
    assert.match(await elMotivo(desactivarCuenta(CUENTA, { prestadoraId: null, motivo: 'Motivo' })), /No hay permiso/);
    assert.match(await elMotivo(desactivarCuenta(undefined, { prestadoraId: PRESTADORA_PROPIA, motivo: 'Motivo' })), /No hay permiso/);
    assert.match(await elMotivo(desactivarCuenta(CUENTA, { prestadoraId: PRESTADORA_PROPIA })), /faltan_datos/);
    assert.match(await elMotivo(desactivarCuenta(CUENTA, { prestadoraId: PRESTADORA_PROPIA, motivo: '  ' })), /faltan_datos/);
    assert.deepEqual(llamadas, []);
  });

  it('pide la desactivación con el motivo, con la credencial de esa Prestadora, y no borra', async () => {
    await desactivarCuenta(CUENTA, { prestadoraId: PRESTADORA_PROPIA, motivo: ' Motivo inventado ' });

    assert.equal(llamadas.length, 1);
    const [pedido] = llamadas;
    assert.equal(pedido.metodo, 'POST');
    assert.equal(pedido.ruta, '/rest/v1/rpc/desactivar_la_cuenta');
    assert.deepEqual(pedido.cuerpo, { p_usuario: CUENTA, p_motivo: 'Motivo inventado' });

    const contenido = contenidoDe(pedido.credencial);
    assert.equal(contenido.role, 'trabajo_sin_persona');
    assert.equal(contenido.prestadora_id, PRESTADORA_PROPIA);
    assert.deepEqual(borradosDeCuenta(), []);
  });

  it('si la base no encontró qué desactivar, no la da por hecha', async () => {
    respuestaDeLaBase = false;
    assert.match(await elMotivo(desactivarCuenta(CUENTA, { prestadoraId: PRESTADORA_PROPIA, motivo: 'Motivo' })), /No hay permiso/);
  });
});

describe('quitar una persona autorizada', () => {
  it('sin motivo no toca nada', async () => {
    assert.match(
      await elMotivo(revocarPersonaAutorizada(supabase, CUENTA, { prestadoraId: PRESTADORA_PROPIA, clienteId: CLIENTE })),
      /faltan_datos/,
    );
    assert.deepEqual(llamadas, []);
  });

  // UNA CUENTA NO SE BORRA. Si quitar una persona autorizada vuelve a borrar su cuenta, esta
  // prueba falla.
  it('desactiva su cuenta con el motivo y no la borra', async () => {
    const desactivada = await revocarPersonaAutorizada(supabase, CUENTA, {
      prestadoraId: PRESTADORA_PROPIA, clienteId: CLIENTE, motivo: 'Motivo inventado',
    });
    assert.equal(desactivada, true);

    const pedido = llamadas.find((l) => l.ruta === '/rest/v1/rpc/desactivar_la_cuenta');
    assert.ok(pedido, 'no se desactivó la cuenta');
    assert.deepEqual(pedido.cuerpo, { p_usuario: CUENTA, p_motivo: 'Motivo inventado' });
    assert.equal(contenidoDe(pedido.credencial).prestadora_id, PRESTADORA_PROPIA);
    assert.deepEqual(borradosDeCuenta(), []);
  });
});

describe('borrarCuentaDeUnAltaCortada', () => {
  it('sin Prestadora o sin cuenta no le pregunta nada a la base', async () => {
    assert.match(await elMotivo(borrarCuentaDeUnAltaCortada(CUENTA, { prestadoraId: null })), /No hay permiso/);
    assert.match(await elMotivo(borrarCuentaDeUnAltaCortada(CUENTA)), /No hay permiso/);
    assert.match(await elMotivo(borrarCuentaDeUnAltaCortada(undefined, { prestadoraId: PRESTADORA_PROPIA })), /No hay permiso/);
    assert.deepEqual(llamadas, []);
  });

  it('pide deshacer el alta de esa cuenta, con la credencial de esa Prestadora, y nada más', async () => {
    await borrarCuentaDeUnAltaCortada(CUENTA, { prestadoraId: PRESTADORA_PROPIA });

    assert.equal(llamadas.length, 1);
    const [pedido] = llamadas;
    assert.equal(pedido.ruta, '/rest/v1/rpc/deshacer_el_alta_de_la_cuenta');
    assert.deepEqual(pedido.cuerpo, { p_usuario: CUENTA });
    const contenido = contenidoDe(pedido.credencial);
    assert.equal(contenido.role, 'trabajo_sin_persona');
    assert.equal(contenido.prestadora_id, PRESTADORA_PROPIA);
  });

  it('si la base no deshizo el alta, no la da por hecha', async () => {
    respuestaDeLaBase = false;
    assert.match(await elMotivo(borrarCuentaDeUnAltaCortada(CUENTA, { prestadoraId: PRESTADORA_PROPIA })), /No hay permiso/);
  });
});
