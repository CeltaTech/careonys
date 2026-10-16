/**
 * La configuración de la Prestadora: con qué credencial se guarda lo que la Administración no
 * alcanza con la suya.
 *
 *   node --test src/routes/__tests__/panelConfiguracionTrabajo.test.js
 *
 * Cambiar la fila de la Prestadora, leer la revisión con IA de los reportes y listar sus
 * Coordinadores va con el trabajo de la Prestadora que la base le deja ver a quien pide, que
 * alcanza esa Prestadora y ninguna otra.
 *
 * Se levanta el router de verdad contra una base de mentira que contesta por HTTP como la de
 * verdad: además del resultado se mira con qué credencial se le pidió cada cosa. Con el sistema
 * roto —otra credencial u otra Prestadora— las pruebas dan al revés.
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
const COORDINADOR = '33333333-3333-4333-8333-333333333333';

let llamadas = [];

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
    const credencial = leerCredencial(req.headers.authorization ?? '');
    llamadas.push({ clave, url, cuerpo: crudo, credencial: req.headers.authorization });
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    let filas = [];
    if (clave === 'GET /auth/v1/user') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: QUIEN_LLAMA, aud: 'authenticated' }));
      return;
    }
    if (clave === 'GET /rest/v1/usuarios') {
      filas = credencial?.role === 'trabajo_sin_persona'
        ? [{ id: COORDINADOR, nombre: 'Coordinador inventado' }]
        : [{ id: QUIEN_LLAMA, rol: 'admin_prestadora', prestadora_id: PRESTADORA }];
    }
    if (clave === 'GET /rest/v1/prestadoras') filas = [{ id: PRESTADORA, moneda: 'ARS' }];
    if (clave === 'PATCH /rest/v1/prestadoras') filas = [{ moneda: 'ARS' }];
    if (clave === 'GET /rest/v1/monedas_por_pais') filas = [{ moneda: 'ARS' }];
    if (clave === 'GET /rest/v1/catalogo_acciones_permisos') filas = [{ accion: 'accion_inventada', default_solo_admin: true }];
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
});

async function pedir(metodo, ruta, cuerpo) {
  const respuesta = await fetch(`${RAIZ}${ruta}`, {
    method: metodo,
    headers: { Authorization: sesionDePrueba(QUIEN_LLAMA), 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

function conElTrabajoDeLaPrestadora(llamada) {
  const credencial = leerCredencial(llamada.credencial ?? '');
  assert.equal(credencial?.role, 'trabajo_sin_persona', `${llamada.clave} fue con otra credencial`);
  assert.equal(credencial.prestadora_id, PRESTADORA, `${llamada.clave} fue fuera de la Prestadora`);
}

function unaSola(clave) {
  const encontradas = llamadas.filter((l) => l.clave === clave);
  assert.equal(encontradas.length, 1, `${clave} no se pidió una vez`);
  return encontradas[0];
}

describe('la configuración de la Prestadora', () => {
  it('la moneda se cambia con el trabajo de la Prestadora, en su propia fila', async () => {
    const { estado } = await pedir('PATCH', '/moneda', { moneda: 'ARS' });
    assert.equal(estado, 200);
    const cambio = unaSola('PATCH /rest/v1/prestadoras');
    conElTrabajoDeLaPrestadora(cambio);
    assert.equal(cambio.url.searchParams.get('id'), `eq.${PRESTADORA}`);
  });

  it('el cierre por inactividad se cambia con el trabajo de la Prestadora, en su propia fila', async () => {
    const { estado } = await pedir('PATCH', '/cierre-por-inactividad', { activo: true, minutos: 30 });
    assert.equal(estado, 200);
    const cambio = unaSola('PATCH /rest/v1/prestadoras');
    conElTrabajoDeLaPrestadora(cambio);
    assert.equal(cambio.url.searchParams.get('id'), `eq.${PRESTADORA}`);
  });

  it('la revisión con IA de los reportes se lee con el trabajo de la Prestadora', async () => {
    const { estado } = await pedir('GET', '/alertas-ia');
    assert.equal(estado, 200);
    const lectura = unaSola('GET /rest/v1/configuracion_alertas_ia');
    conElTrabajoDeLaPrestadora(lectura);
    assert.equal(lectura.url.searchParams.get('prestadora_id'), `eq.${PRESTADORA}`);
  });

  it('los Coordinadores se listan con el trabajo de la Prestadora', async () => {
    const { estado, cuerpo } = await pedir('GET', '/permisos');
    assert.equal(estado, 200);
    assert.deepEqual(cuerpo.coordinadores, [{ id: COORDINADOR, nombre: 'Coordinador inventado' }]);
    const lista = llamadas.find((l) => l.clave === 'GET /rest/v1/usuarios' && l.url.searchParams.get('rol') === 'eq.coordinador');
    assert.ok(lista, 'no se pidió la lista de Coordinadores');
    conElTrabajoDeLaPrestadora(lista);
    assert.equal(lista.url.searchParams.get('prestadora_id'), `eq.${PRESTADORA}`);
  });
});
