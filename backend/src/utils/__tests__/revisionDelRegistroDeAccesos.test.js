/**
 * El informe diario de los accesos fuera de lo normal: la base cuenta y anota; el backend sólo la
 * llama, de a una Prestadora por vez y con la credencial del trabajo de esa Prestadora.
 *
 *   npm test --prefix backend
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA_A = '11111111-1111-1111-1111-111111111111';
const PRESTADORA_B = '22222222-2222-2222-2222-222222222222';

let llamadas = [];
let falla = false;

const baseFalsa = createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    const cuerpo64 = (req.headers.authorization ?? '').replace('Bearer ', '').split('.')[1];
    const credencial = JSON.parse(Buffer.from(cuerpo64, 'base64url').toString());
    llamadas.push({ clave: `${req.method} ${new URL(req.url, 'http://interno').pathname}`, credencial });
    if (falla) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'falla de mentira' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(credencial.prestadora_id === PRESTADORA_A
      ? [{ dia: '2026-11-16', cantidad: 7, anotado: true }]
      : [{ dia: '2026-11-16', cantidad: 0, anotado: false }]));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();
const { informarLosAccesosFueraDeLoNormal } = await import('../revisionDelRegistroDeAccesos.js');

after(() => baseFalsa.close());
beforeEach(() => { llamadas = []; falla = false; });

describe('informarLosAccesosFueraDeLoNormal', () => {
  it('llama a la base con la credencial del trabajo de esa Prestadora', async () => {
    const { informe } = await informarLosAccesosFueraDeLoNormal(PRESTADORA_A);
    assert.deepEqual(informe, { dia: '2026-11-16', cantidad: 7, anotado: true });
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].clave, 'POST /rest/v1/rpc/informar_accesos_fuera_de_lo_normal_del_dia_anterior');
    assert.equal(llamadas[0].credencial.role, 'trabajo_sin_persona');
    assert.equal(llamadas[0].credencial.prestadora_id, PRESTADORA_A);
  });

  it('otra Prestadora va con su propia credencial', async () => {
    const { informe } = await informarLosAccesosFueraDeLoNormal(PRESTADORA_B);
    assert.equal(informe.anotado, false);
    assert.equal(llamadas[0].credencial.prestadora_id, PRESTADORA_B);
  });

  it('sin Prestadora no llama a nadie', async () => {
    assert.deepEqual(await informarLosAccesosFueraDeLoNormal(null), { informe: null });
    assert.equal(llamadas.length, 0);
  });

  it('si la base falla, no se cae', async () => {
    falla = true;
    assert.deepEqual(await informarLosAccesosFueraDeLoNormal(PRESTADORA_A), { informe: null });
  });
});
