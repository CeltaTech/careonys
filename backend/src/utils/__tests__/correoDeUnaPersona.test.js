/**
 * El correo de una persona, leído sólo adentro de su Prestadora.
 *
 *   npm test --prefix backend
 *   node --test backend/src/utils/__tests__/correoDeUnaPersona.test.js
 *
 * POR QUÉ EXISTE ESTA PRUEBA. `../correoDeUnaPersona.js` lee el correo de una o de varias personas
 * con la credencial del trabajo de la Prestadora, que la base acota a ella. Lo que hay que sostener
 * acá es que la lectura vaya con esa credencial y con ninguna otra, filtrada por la Prestadora, y
 * que sin Prestadora no se lea nada.
 *
 * La base es de mentira y contesta por HTTP como la de verdad: con la credencial del trabajo
 * contesta las cuentas de la Prestadora que lleva adentro, y con cualquier otra, ninguna.
 *
 * Con el sistema roto —la lectura con otra credencial, con la de otra Prestadora, o sin el filtro
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

/** Las cuentas que hay en la base, de las dos Prestadoras. */
const CUENTAS = [
  { id: 'persona-1', email: 'una@ejemplo.test', prestadora_id: PRESTADORA },
  { id: 'persona-2', email: 'otra@ejemplo.test', prestadora_id: PRESTADORA },
  { id: 'persona-1', email: 'ajena@ejemplo.test', prestadora_id: OTRA_PRESTADORA },
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
    const id = url.searchParams.get('id') ?? '';
    const ids = id.startsWith('eq.') ? [id.slice(3)] : id.replace(/^in\.\(|\)$/g, '').split(',').map((x) => x.replace(/"/g, ''));
    const filas = CUENTAS.filter((cuenta) => cuenta.prestadora_id === prestadora && ids.includes(cuenta.id));
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
const { correoDe, correosDe } = await import('../correoDeUnaPersona.js');

after(() => {
  baseFalsa.close();
});

beforeEach(() => {
  llamadas = [];
});

/** Cada lectura fue con la credencial del trabajo de la Prestadora, y filtrada por ella. */
function todasDentroDeLaPrestadora() {
  assert.equal(llamadas.length, 1);
  const credencial = leerCredencial(llamadas[0].credencial ?? '');
  assert.equal(credencial?.role, 'trabajo_sin_persona', 'la lectura fue con otra credencial');
  assert.equal(credencial.prestadora_id, PRESTADORA, 'la lectura fue fuera de la Prestadora');
  assert.equal(llamadas[0].url.searchParams.get('prestadora_id'), `eq.${PRESTADORA}`, 'la lectura no filtró por la Prestadora');
}

describe('el correo de una persona', () => {
  it('se lee con la credencial del trabajo de la Prestadora', async () => {
    assert.equal(await correoDe({ prestadoraId: PRESTADORA, usuarioId: 'persona-1' }), 'una@ejemplo.test');
    todasDentroDeLaPrestadora();
  });

  it('el de varias personas, también', async () => {
    const correos = await correosDe({ prestadoraId: PRESTADORA, usuarioIds: ['persona-2', 'persona-1'] });

    assert.deepEqual(correos, ['otra@ejemplo.test', 'una@ejemplo.test']);
    todasDentroDeLaPrestadora();
  });

  it('sin Prestadora no lee nada', async () => {
    assert.equal(await correoDe({ prestadoraId: null, usuarioId: 'persona-1' }), null);
    assert.deepEqual(await correosDe({ prestadoraId: null, usuarioIds: ['persona-1'] }), []);
    assert.equal(llamadas.length, 0);
  });
});
