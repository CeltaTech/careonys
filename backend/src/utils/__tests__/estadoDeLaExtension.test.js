/**
 * Lo que se le muestra a la Asistente que quedó de más: con qué credencial se lee y qué sale.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. `../estadoDeLaExtension.js` lee hasta cuatro tablas de una sola
 * Prestadora. Lo que hay que sostener acá es que las cuatro consultas vayan con la credencial del
 * trabajo de esa Prestadora y con ninguna otra, que sin extensión abierta no se siga consultando,
 * y que los pasos de la búsqueda salgan de lo que contesta la base.
 *
 * Con el sistema roto —una consulta con otra credencial, o la credencial de otra Prestadora— la
 * primera prueba da al revés.
 *
 * Se levanta la base de mentira igual que `corteDelAcceso.test.js`. Datos inventados, como manda
 * CLAUDE.md §6.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '44444444-4444-4444-4444-444444444444';
const GUARDIA = '11111111-1111-1111-1111-111111111111';
const RELEVO = '22222222-2222-2222-2222-222222222222';
const INCIDENTE = '33333333-3333-3333-3333-333333333333';

const EXTENSIONES = 'GET /rest/v1/extensiones_de_turno';
const GUARDIAS = 'GET /rest/v1/guardias';
const INCIDENTES_RELEVO = 'GET /rest/v1/incidentes_relevo';
const SIN_CUBRIR = 'GET /rest/v1/incidentes_turno_sin_cubrir';
const ESCALONES = 'GET /rest/v1/escalones_de_alarma_avisados';

/** Qué contesta la base a cada `MÉTODO /ruta`. Cada prueba pisa lo que necesita cambiar. */
const respuestas = new Map();
/** Todo lo que se le pidió a la base. */
let llamadas = [];
/** Lo que quedó anotado del lado del servidor. Se junta para no ensuciar la salida. */
let anotados = [];

/** Lo que dice adentro una credencial, o `null` si no se puede leer. */
function leerCredencial(autorizacion) {
  try {
    return JSON.parse(Buffer.from(autorizacion.replace('Bearer ', '').split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

const baseFalsa = createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    llamadas.push({ clave, url: req.url, credencial: leerCredencial(req.headers.authorization ?? '') });

    const valor = respuestas.get(clave);
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
prepararCredencialDePrueba();

// El import va después de dejar puestas las variables de entorno: la conexión a la base se arma en
// el momento en que se importa el archivo.
const { estadoDeLaExtension } = await import('../estadoDeLaExtension.js');

const avisarDeVerdad = console.error;
console.error = (...partes) => anotados.push(partes.join(' '));

after(() => {
  console.error = avisarDeVerdad;
  baseFalsa.close();
});

beforeEach(() => {
  respuestas.clear();
  llamadas = [];
  anotados = [];
});

/** Una extensión abierta, esperando a `RELEVO`. */
function prepararExtensionAbierta() {
  respuestas.set(EXTENSIONES, [
    { id: 'ext-1', desde_at: '2026-01-10T08:00:00Z', relevo_guardia_id: RELEVO, no_puede_continuar_at: null },
  ]);
  respuestas.set(GUARDIAS, [{ id: RELEVO, asistente_id: 'asis-1', checkin_at: null }]);
  respuestas.set(INCIDENTES_RELEVO, [{ id: INCIDENTE, ultima_notificacion_at: '2026-01-10T08:05:00Z' }]);
  respuestas.set(SIN_CUBRIR, []);
  respuestas.set(ESCALONES, []);
}

describe('el estado de la extensión de un turno', () => {
  it('las cuatro tablas se leen con la credencial del trabajo de la Prestadora', async () => {
    prepararExtensionAbierta();

    await estadoDeLaExtension({ guardiaId: GUARDIA, prestadoraId: PRESTADORA });

    assert.deepEqual(
      [...new Set(llamadas.map((l) => l.clave))].sort(),
      [ESCALONES, EXTENSIONES, GUARDIAS, INCIDENTES_RELEVO, SIN_CUBRIR].sort(),
    );
    for (const llamada of llamadas) {
      assert.equal(llamada.credencial?.role, 'trabajo_sin_persona', `${llamada.clave} fue con otra credencial`);
      assert.equal(llamada.credencial.prestadora_id, PRESTADORA, `${llamada.clave} fue fuera de la Prestadora`);
    }
  });

  it('con la extensión abierta, devuelve desde cuándo y los pasos de la búsqueda', async () => {
    prepararExtensionAbierta();

    const estado = await estadoDeLaExtension({ guardiaId: GUARDIA, prestadoraId: PRESTADORA });

    assert.equal(estado.desdeAt, '2026-01-10T08:00:00Z');
    assert.equal(estado.noPuedeContinuarAt, null);
    assert.ok(Array.isArray(estado.pasos));
  });

  it('sin extensión abierta devuelve null y no sigue consultando', async () => {
    respuestas.set(EXTENSIONES, []);

    assert.equal(await estadoDeLaExtension({ guardiaId: GUARDIA, prestadoraId: PRESTADORA }), null);
    assert.deepEqual(llamadas.map((l) => l.clave), [EXTENSIONES]);
  });

  it('sin Prestadora no consulta', async () => {
    assert.equal(await estadoDeLaExtension({ guardiaId: GUARDIA, prestadoraId: null }), null);
    assert.equal(llamadas.length, 0);
  });

  it('si la base falla, devuelve null', async () => {
    assert.equal(await estadoDeLaExtension({ guardiaId: GUARDIA, prestadoraId: PRESTADORA }), null);
    assert.equal(anotados.length, 1);
  });
});
