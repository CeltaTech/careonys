/**
 * Lo que la Prestadora elige para los turnos de guardia sin Reporte Diario: cada cuántas horas se
 * le repite el aviso al Asistente, y si esos turnos se le facturan al Cliente.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. Las dos cosas las elige cada Prestadora desde la configuración del
 * Panel. Hay que sostener tres cosas: que se lean con la sesión de quien pide, que un valor fuera de
 * rango no llegue a la base, y que el cambio se escriba sólo en la fila de esa Prestadora, con la
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
const { LIMITES_INSISTENCIA_REPORTE_DIARIO } = await import('../../utils/revisarRecordatoriosPush.js');

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

async function leer(ruta) {
  const respuesta = await fetch(`${RAIZ}/${ruta}`, { headers: { Authorization: sesionDePrueba(USUARIO) } });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

async function guardar(ruta, cuerpo) {
  const respuesta = await fetch(`${RAIZ}/${ruta}`, {
    method: 'PATCH',
    headers: { Authorization: sesionDePrueba(USUARIO), 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

const escrituras = () => llamadas.filter((l) => l.clave === 'PATCH /rest/v1/prestadoras');

function comprobarEscritura(esperado) {
  assert.equal(escrituras().length, 1);
  const [escritura] = escrituras();
  assert.deepEqual(escritura.cuerpo, esperado);
  assert.equal(escritura.filtros.get('id'), `eq.${PRESTADORA}`);
  assert.equal(escritura.credencial?.role, 'trabajo_sin_persona');
  assert.equal(escritura.credencial.prestadora_id, PRESTADORA);
}

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol: 'admin_prestadora', prestadora_id: PRESTADORA }]);
  respuestas.set('GET /rest/v1/prestadoras', () => [{
    id: PRESTADORA,
    horas_entre_avisos_reporte_pendiente: 3,
    factura_turnos_sin_reporte_diario: false,
  }]);
  respuestas.set('PATCH /rest/v1/prestadoras', () => []);
});

describe('cada cuántas horas se repite el aviso del Reporte Diario', () => {
  it('lee el número de la Prestadora con la sesión de quien pide', async () => {
    const { estado, cuerpo } = await leer('insistencia-reporte-diario');

    assert.equal(estado, 200);
    assert.deepEqual(cuerpo, { horas_entre_avisos_reporte_pendiente: 3 });
    const lectura = llamadas.find((l) => l.clave === 'GET /rest/v1/prestadoras');
    assert.equal(lectura.filtros.get('select'), 'horas_entre_avisos_reporte_pendiente');
    assert.equal(lectura.credencial?.role, 'authenticated');
  });

  it('guarda el número sólo en la fila de esa Prestadora, con la credencial de su trabajo', async () => {
    const { estado, cuerpo } = await guardar('insistencia-reporte-diario', { horas: 6 });

    assert.equal(estado, 200);
    assert.deepEqual(cuerpo, { ok: true });
    comprobarEscritura({ horas_entre_avisos_reporte_pendiente: 6 });
  });

  for (const horas of [
    LIMITES_INSISTENCIA_REPORTE_DIARIO.minimo - 1,
    LIMITES_INSISTENCIA_REPORTE_DIARIO.maximo + 1,
    1.5,
    '2',
    null,
  ]) {
    it(`rechaza ${JSON.stringify(horas)} sin tocar la base`, async () => {
      const { estado, cuerpo } = await guardar('insistencia-reporte-diario', { horas });

      assert.equal(estado, 400);
      assert.ok(cuerpo.error);
      assert.equal(escrituras().length, 0);
    });
  }

  it('acepta los dos topes', async () => {
    const { minimo, maximo } = LIMITES_INSISTENCIA_REPORTE_DIARIO;
    assert.equal((await guardar('insistencia-reporte-diario', { horas: minimo })).estado, 200);
    assert.equal((await guardar('insistencia-reporte-diario', { horas: maximo })).estado, 200);
    assert.equal(escrituras().length, 2);
  });
});

describe('si se facturan los turnos de guardia sin Reporte Diario', () => {
  it('lee la elección de la Prestadora con la sesión de quien pide', async () => {
    const { estado, cuerpo } = await leer('facturar-turnos-sin-reporte');

    assert.equal(estado, 200);
    assert.deepEqual(cuerpo, { factura_turnos_sin_reporte_diario: false });
    const lectura = llamadas.find((l) => l.clave === 'GET /rest/v1/prestadoras');
    assert.equal(lectura.filtros.get('select'), 'factura_turnos_sin_reporte_diario');
    assert.equal(lectura.credencial?.role, 'authenticated');
  });

  for (const factura of [true, false]) {
    it(`guarda ${factura} sólo en la fila de esa Prestadora, con la credencial de su trabajo`, async () => {
      const { estado, cuerpo } = await guardar('facturar-turnos-sin-reporte', { factura });

      assert.equal(estado, 200);
      assert.deepEqual(cuerpo, { ok: true });
      comprobarEscritura({ factura_turnos_sin_reporte_diario: factura });
    });
  }

  for (const factura of ['true', 1, null, undefined]) {
    it(`rechaza ${JSON.stringify(factura)} sin tocar la base`, async () => {
      const { estado, cuerpo } = await guardar('facturar-turnos-sin-reporte', { factura });

      assert.equal(estado, 400);
      assert.ok(cuerpo.error);
      assert.equal(escrituras().length, 0);
    });
  }
});
