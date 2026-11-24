/**
 * Cuánto antes del fin del turno de guardia se le recuerda al Asistente el Reporte Diario.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. El número lo elige cada Prestadora desde la configuración del Panel.
 * Hay que sostener tres cosas: que se lea con la sesión de quien pide, que un número fuera de rango
 * no llegue a la base, y que el cambio se escriba sólo en la fila de esa Prestadora, con la
 * credencial del trabajo de esa Prestadora.
 *
 * Se levanta el router de verdad contra una base de mentira y se mira qué contesta y qué escribe.
 * Datos inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';

import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const USUARIO = '22222222-2222-2222-2222-222222222222';

/** Qué contesta la base a cada `MÉTODO /ruta`. Cada prueba prepara lo suyo. */
const respuestas = new Map();
/** Todo lo que el backend le pidió a la base. */
let llamadas = [];

/** Lo que dice adentro una credencial, o `null` si no se puede leer. */
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
    const direccion = new URL(req.url, 'http://interno');
    const clave = `${req.method} ${direccion.pathname}`;
    llamadas.push({
      clave,
      filtros: direccion.searchParams,
      cuerpo: crudo ? JSON.parse(crudo) : null,
      credencial: leerCredencial(req.headers.authorization ?? ''),
    });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada(direccion.searchParams) : preparada;
    if (valor === undefined) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `la prueba no preparó respuesta para ${clave}` }));
      return;
    }

    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? valor[0] ?? null : valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;

// El import va después de dejar puestas las variables de entorno: la conexión a la base se arma
// en el momento en que se importa, y con la dirección que haya en ese instante.
const { default: express } = await import('express');
await import('express-async-errors');
const { panelConfiguracionRouter } = await import('../panelConfiguracion.js');
const { LIMITES_RECORDATORIO_REPORTE } = await import('../../utils/revisarRecordatoriosPush.js');

const app = express();
app.use(express.json());
app.use('/api/panel/configuracion', panelConfiguracionRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/panel/configuracion/recordatorio-reporte`;

after(() => {
  backend.close();
  baseFalsa.close();
});

async function leer() {
  const respuesta = await fetch(DIRECCION, { headers: { Authorization: sesionDePrueba(USUARIO) } });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

async function guardar(cuerpo) {
  const respuesta = await fetch(DIRECCION, {
    method: 'PATCH',
    headers: { Authorization: sesionDePrueba(USUARIO), 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

const escrituras = () => llamadas.filter((l) => l.clave === 'PATCH /rest/v1/prestadoras');

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol: 'admin_prestadora', prestadora_id: PRESTADORA }]);
  respuestas.set('GET /rest/v1/prestadoras', () => [{ id: PRESTADORA, minutos_recordatorio_reporte: 45 }]);
  respuestas.set('PATCH /rest/v1/prestadoras', () => []);
});

describe('el recordatorio del Reporte Diario en la configuración', () => {
  it('lee el número de la Prestadora con la sesión de quien pide', async () => {
    const { estado, cuerpo } = await leer();

    assert.equal(estado, 200);
    assert.deepEqual(cuerpo, { minutos_recordatorio_reporte: 45 });
    const lectura = llamadas.find((l) => l.clave === 'GET /rest/v1/prestadoras');
    assert.equal(lectura.filtros.get('select'), 'minutos_recordatorio_reporte');
    assert.equal(lectura.credencial?.role, 'authenticated');
  });

  it('guarda el número sólo en la fila de esa Prestadora, con la credencial de su trabajo', async () => {
    const { estado, cuerpo } = await guardar({ minutos: 20 });

    assert.equal(estado, 200);
    assert.deepEqual(cuerpo, { ok: true });
    assert.equal(escrituras().length, 1);
    const [escritura] = escrituras();
    assert.deepEqual(escritura.cuerpo, { minutos_recordatorio_reporte: 20 });
    assert.equal(escritura.filtros.get('id'), `eq.${PRESTADORA}`);
    assert.equal(escritura.credencial?.role, 'trabajo_sin_persona');
    assert.equal(escritura.credencial.prestadora_id, PRESTADORA);
  });

  for (const minutos of [
    LIMITES_RECORDATORIO_REPORTE.minimo - 1,
    LIMITES_RECORDATORIO_REPORTE.maximo + 1,
    12.5,
    '30',
    null,
  ]) {
    it(`rechaza ${JSON.stringify(minutos)} sin tocar la base`, async () => {
      const { estado, cuerpo } = await guardar({ minutos });

      assert.equal(estado, 400);
      assert.ok(cuerpo.error);
      assert.equal(escrituras().length, 0);
    });
  }

  it('acepta los dos topes', async () => {
    assert.equal((await guardar({ minutos: LIMITES_RECORDATORIO_REPORTE.minimo })).estado, 200);
    assert.equal((await guardar({ minutos: LIMITES_RECORDATORIO_REPORTE.maximo })).estado, 200);
    assert.equal(escrituras().length, 2);
  });
});
