/**
 * Las alarmas que alguien ya está atendiendo, leídas sólo adentro de su Prestadora.
 *
 *   npm test --prefix backend
 *   node --test backend/src/utils/__tests__/tomasDeAlarma.test.js
 *
 * POR QUÉ EXISTE ESTA PRUEBA. `../tomasDeAlarma.js` lee las tomas en pie y la regla de cuánto dura
 * una toma con la credencial del trabajo de la Prestadora, que la base acota a ella. Lo que hay que
 * sostener acá es que las dos lecturas vayan con esa credencial y con ninguna otra, filtradas por
 * la Prestadora, y que sin Prestadora no se lea nada y se insista.
 *
 * La base es de mentira y contesta por HTTP como la de verdad: con la credencial del trabajo
 * contesta las filas de la Prestadora que lleva adentro, y con cualquier otra, ninguna.
 *
 * Con el sistema roto —las lecturas con otra credencial, con la de otra Prestadora, o sin el filtro
 * de la Prestadora— las pruebas dan al revés.
 *
 * Datos inventados, como manda CLAUDE.md §6.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const OTRA_PRESTADORA = '99999999-9999-9999-9999-999999999999';
const AHORA = new Date('2026-10-01T12:00:00Z');
const EN_MEDIA_HORA = '2026-10-01T12:30:00Z';

/** Las tomas en pie que hay en la base, de las dos Prestadoras. */
const TOMAS = [
  { referencia_id: 'alarma-propia', tipo: 'turno_sin_cubrir', tomada_at: '2026-10-01T11:55:00Z', vence_at: EN_MEDIA_HORA, soltada_at: null, prestadora_id: PRESTADORA },
  { referencia_id: 'alarma-ajena', tipo: 'turno_sin_cubrir', tomada_at: '2026-10-01T11:55:00Z', vence_at: EN_MEDIA_HORA, soltada_at: null, prestadora_id: OTRA_PRESTADORA },
];

/** Todo lo que el backend le pidió a la base, con la dirección entera: los filtros van ahí. */
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
  req.resume();
  req.on('end', () => {
    const url = new URL(req.url, 'http://interno');
    llamadas.push({ ruta: url.pathname, url, credencial: req.headers.authorization });

    const credencial = leerCredencial(req.headers.authorization ?? '');
    const prestadora = credencial?.role === 'trabajo_sin_persona' ? credencial.prestadora_id : null;
    const filas = url.pathname === '/rest/v1/alarmas_tomadas'
      ? TOMAS.filter((toma) => toma.prestadora_id === prestadora)
      : [];
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo ? (filas[0] ?? null) : filas));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

// El import va después de dejar puestas las variables de entorno: la conexión a la base se arma
// en el momento en que se importa, y con la dirección que haya en ese instante.
const { reglaDeLaToma, tomadasAhora } = await import('../tomasDeAlarma.js');

after(() => {
  baseFalsa.close();
});

beforeEach(() => {
  llamadas = [];
});

/** Cada lectura fue con la credencial del trabajo de la Prestadora, y filtrada por ella. */
function todasDentroDeLaPrestadora() {
  assert.ok(llamadas.length > 0, 'tendría que haber leído algo');
  for (const llamada of llamadas) {
    const credencial = leerCredencial(llamada.credencial ?? '');
    assert.equal(credencial?.role, 'trabajo_sin_persona', `${llamada.ruta} fue con otra credencial`);
    assert.equal(credencial.prestadora_id, PRESTADORA, `${llamada.ruta} fue fuera de la Prestadora`);
    assert.equal(llamada.url.searchParams.get('prestadora_id'), `eq.${PRESTADORA}`, `${llamada.ruta} no filtró por la Prestadora`);
  }
}

describe('las alarmas que alguien está atendiendo', () => {
  it('devuelve las tomas de la Prestadora, leídas con la credencial del trabajo de ella', async () => {
    const tomadas = await tomadasAhora({ prestadoraId: PRESTADORA, tipo: 'turno_sin_cubrir', ahora: AHORA });

    assert.deepEqual([...tomadas], ['alarma-propia']);
    todasDentroDeLaPrestadora();
  });

  it('la regla de la toma se lee con la misma credencial', async () => {
    await reglaDeLaToma(PRESTADORA);

    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].ruta, '/rest/v1/configuracion_alarmas_tomadas');
    todasDentroDeLaPrestadora();
  });

  it('sin Prestadora no lee nada, y no hay ninguna tomada', async () => {
    const tomadas = await tomadasAhora({ prestadoraId: null, tipo: 'turno_sin_cubrir', ahora: AHORA });
    const regla = await reglaDeLaToma(null);

    assert.equal(tomadas.size, 0);
    assert.ok(regla);
    assert.equal(llamadas.length, 0);
  });
});
