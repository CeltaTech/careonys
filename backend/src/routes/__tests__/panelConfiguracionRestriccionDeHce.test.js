/**
 * Si la información de salud es visible para todos: con qué credencial se lee y se cambia.
 *
 *   node --test src/routes/__tests__/panelConfiguracionRestriccionDeHce.test.js
 *
 * Las dos cosas van con la sesión de quien pide, nunca con el trabajo de la Prestadora: la base
 * decide quién puede apagar la restricción y dónde el país no lo deja, y lo deja anotado. El
 * router sólo pregunta y escribe en la fila de la Prestadora que la base le deja ver.
 *
 * Se levanta el router de verdad contra una base de mentira que contesta por HTTP como la de
 * verdad. Con el sistema roto —otra credencial, otra Prestadora o el rechazo de la base tapado—
 * las pruebas dan al revés.
 *
 * Datos inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-1111-4111-8111-111111111111';
const QUIEN_LLAMA = '22222222-2222-4222-8222-222222222222';
const MENSAJE_CRUDO = 'restriccion_de_hce violates check on configuracion_de_hce';

let llamadas = [];
let laBaseRechaza = false;

function leerCredencial(autorizacion) {
  try {
    return JSON.parse(Buffer.from(autorizacion.replace('Bearer ', '').split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const url = new URL(req.url, 'http://interno');
    const clave = `${req.method} ${url.pathname}`;
    llamadas.push({ clave, url, cuerpo: crudo, credencial: req.headers.authorization, prefer: req.headers.prefer ?? '' });
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    let filas = [];
    if (clave === 'GET /auth/v1/user') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: QUIEN_LLAMA, aud: 'authenticated' }));
      return;
    }
    if (clave === 'POST /rest/v1/configuracion_de_hce' && laBaseRechaza) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: '23514', message: MENSAJE_CRUDO }));
      return;
    }
    if (clave === 'GET /rest/v1/usuarios') filas = [{ id: QUIEN_LLAMA, rol: 'admin_prestadora', prestadora_id: PRESTADORA }];
    if (clave === 'GET /rest/v1/prestadoras') filas = [{ id: PRESTADORA }];
    if (clave === 'POST /rest/v1/rpc/la_restriccion_de_hce_de_la_sesion') filas = [{ rige: true, la_exige_el_pais: true }];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo ? (filas[0] ?? null) : filas));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

const { default: express } = await import('express');
await import('express-async-errors');
const { panelConfiguracionRouter } = await import('../panelConfiguracion.js');

const app = express();
app.use(express.json());
app.use('/api/panel/configuracion', panelConfiguracionRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const RAIZ = `http://127.0.0.1:${backend.address().port}/api/panel/configuracion`;

after(() => {
  backend.close();
  baseFalsa.close();
});

beforeEach(() => {
  llamadas = [];
  laBaseRechaza = false;
});

async function pedir(metodo, ruta, cuerpo) {
  const respuesta = await fetch(`${RAIZ}${ruta}`, {
    method: metodo,
    headers: { Authorization: sesionDePrueba(QUIEN_LLAMA), 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

function conLaSesionDeQuienPide(llamada) {
  const credencial = leerCredencial(llamada.credencial ?? '');
  assert.equal(credencial?.sub, QUIEN_LLAMA, `${llamada.clave} no fue con la sesión de quien pide`);
  assert.notEqual(credencial.role, 'trabajo_sin_persona', `${llamada.clave} fue con el trabajo de la Prestadora`);
}

function unaSola(clave) {
  const encontradas = llamadas.filter((l) => l.clave === clave);
  assert.equal(encontradas.length, 1, `${clave} no se pidió una vez`);
  return encontradas[0];
}

describe('si la información de salud es visible para todos', () => {
  it('se lee con la sesión de quien pide, tal como la contesta la base', async () => {
    const { estado, cuerpo } = await pedir('GET', '/restriccion-de-hce');
    assert.equal(estado, 200);
    assert.deepEqual(cuerpo, { rige: true, la_exige_el_pais: true });
    conLaSesionDeQuienPide(unaSola('POST /rest/v1/rpc/la_restriccion_de_hce_de_la_sesion'));
  });

  it('se cambia con la sesión de quien pide, en la fila de la Prestadora que la base le deja ver', async () => {
    const { estado } = await pedir('PATCH', '/restriccion-de-hce', { rige: false });
    assert.equal(estado, 200);
    const cambio = unaSola('POST /rest/v1/configuracion_de_hce');
    conLaSesionDeQuienPide(cambio);
    assert.match(cambio.prefer, /resolution=merge-duplicates/);
    assert.deepEqual(JSON.parse(cambio.cuerpo), { prestadora_id: PRESTADORA, restriccion_de_hce: false });
  });

  it('no se cambia con algo que no sea sí o no', async () => {
    for (const rige of [undefined, 'false', 0, null]) {
      llamadas = [];
      const { estado } = await pedir('PATCH', '/restriccion-de-hce', { rige });
      assert.equal(estado, 400, `pasó con ${rige}`);
      assert.equal(llamadas.filter((l) => l.clave === 'POST /rest/v1/configuracion_de_hce').length, 0);
    }
  });

  it('si la base no lo deja, no se da por cambiado ni se muestra su texto', async () => {
    laBaseRechaza = true;
    const { estado, cuerpo } = await pedir('PATCH', '/restriccion-de-hce', { rige: false });
    assert.ok(estado >= 400, `contestó ${estado}`);
    assert.ok(!JSON.stringify(cuerpo).includes(MENSAJE_CRUDO), 'filtró el texto de la base');
  });
});
