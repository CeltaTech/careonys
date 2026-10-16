/**
 * El candado de modalidad pregunta con la credencial de quien pide, y niega ante cualquier duda.
 *
 *   node --test src/middleware/__tests__/exigirModalidad.test.js
 *
 * La base es de mentira y anota con qué credencial le llegó cada consulta. Lo que se prueba es que
 * la pregunta salga con la credencial de la persona —nunca con la llave maestra— y que el candado
 * deje pasar sólo cuando la base contesta una fila encendida. Qué filas le deja ver la base a esa
 * persona lo deciden sus políticas, y eso es de `scripts/probar_aislamiento.mjs`.
 *
 * Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';

const PERSONA = '44444444-4444-4444-4444-444444444444';
const PRESTADORA = '55555555-5555-5555-5555-555555555555';

let llamadas = [];
/** Lo que contesta la base a la pregunta de la modalidad: filas, o `{ __estado }` para fallar. */
let respuesta = [];

const baseFalsa = createServer((req, res) => {
  const url = new URL(req.url, 'http://interno');
  res.setHeader('Content-Type', 'application/json');
  if (url.pathname === '/auth/v1/user') {
    res.end(JSON.stringify({ id: PERSONA, aud: 'authenticated', role: 'authenticated' }));
    return;
  }
  llamadas.push({ ruta: url.pathname, consulta: url.searchParams, credencial: req.headers.authorization });
  if (respuesta?.__estado) {
    res.writeHead(respuesta.__estado);
    res.end(JSON.stringify({ message: 'falla de mentira' }));
    return;
  }
  res.end(JSON.stringify(respuesta));
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
process.env.SUPABASE_ANON_KEY = 'clave-publica-de-mentira';

const { sesionDePrueba } = await import('../../__tests__/sesionDePrueba.js');
const { abrirSesionDelPedido } = await import('../../db/connection.js');
const { exigirModalidad } = await import('../exigirModalidad.js');

after(() => {
  baseFalsa.close();
});

beforeEach(() => {
  llamadas = [];
  respuesta = [];
});

/** Corre el candado sobre un pedido de la persona y devuelve si pasó y con qué estado se cortó. */
async function correr({ prestadoraId = PRESTADORA, conSesion = true } = {}) {
  const req = { headers: conSesion ? { authorization: sesionDePrueba(PERSONA) } : {}, usuarioPanel: { prestadoraId } };
  if (conSesion) assert.ok(await abrirSesionDelPedido(req), 'la sesión de prueba se abrió');
  let estado = null;
  let paso = false;
  const res = {
    status(codigo) {
      estado = codigo;
      return this;
    },
    json() {
      return this;
    },
  };
  await exigirModalidad('intermediacion')(req, res, () => {
    paso = true;
  });
  return { paso, estado };
}

describe('el candado de modalidad', () => {
  it('pregunta con la credencial de quien pide, y no con la llave maestra', async () => {
    respuesta = [{ activa: true }];
    const { paso } = await correr();
    assert.equal(paso, true);
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].ruta, '/rest/v1/prestadora_modalidades');
    assert.equal(llamadas[0].credencial, sesionDePrueba(PERSONA));
    assert.equal(llamadas[0].consulta.get('prestadora_id'), `eq.${PRESTADORA}`);
    assert.equal(llamadas[0].consulta.get('modalidad'), 'eq.intermediacion');
  });

  it('sin fila encendida niega', async () => {
    respuesta = [];
    assert.deepEqual(await correr(), { paso: false, estado: 403 });
  });

  it('si la base falla niega', async () => {
    respuesta = { __estado: 500 };
    assert.deepEqual(await correr(), { paso: false, estado: 403 });
  });

  it('sin Prestadora niega, y ni siquiera le pregunta a la base', async () => {
    assert.deepEqual(await correr({ prestadoraId: null }), { paso: false, estado: 403 });
    assert.equal(llamadas.length, 0);
  });

  it('sin sesión de una persona niega, y no cae a la llave maestra', async () => {
    respuesta = [{ activa: true }];
    assert.deepEqual(await correr({ conSesion: false }), { paso: false, estado: 403 });
    assert.equal(llamadas.length, 0);
  });
});
