/**
 * El borrado del registro de accesos vencido: la base decide y borra; el backend sólo la llama,
 * de a una Prestadora por vez y con la credencial del trabajo de esa Prestadora.
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
    res.end(JSON.stringify(credencial.prestadora_id === PRESTADORA_A ? [{ anio: 2022, renglones: 10 }] : []));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();
const { borrarLoVencidoDelRegistroDeAccesos } = await import('../borradoDelRegistroDeAccesos.js');

after(() => baseFalsa.close());
beforeEach(() => { llamadas = []; falla = false; });

describe('borrarLoVencidoDelRegistroDeAccesos', () => {
  it('llama a la base con la credencial del trabajo de esa Prestadora', async () => {
    const { borrados } = await borrarLoVencidoDelRegistroDeAccesos(PRESTADORA_A);
    assert.deepEqual(borrados, [{ anio: 2022, renglones: 10 }]);
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].clave, 'POST /rest/v1/rpc/borrar_consultas_a_hce_vencidas');
    assert.equal(llamadas[0].credencial.role, 'trabajo_sin_persona');
    assert.equal(llamadas[0].credencial.prestadora_id, PRESTADORA_A);
  });

  it('otra Prestadora va con su propia credencial', async () => {
    const { borrados } = await borrarLoVencidoDelRegistroDeAccesos(PRESTADORA_B);
    assert.deepEqual(borrados, []);
    assert.equal(llamadas[0].credencial.prestadora_id, PRESTADORA_B);
  });

  it('sin Prestadora no llama a nadie', async () => {
    assert.deepEqual(await borrarLoVencidoDelRegistroDeAccesos(null), { borrados: [] });
    assert.equal(llamadas.length, 0);
  });

  it('si la base falla, no se cae: lo que no se borró hoy se borra mañana', async () => {
    falla = true;
    assert.deepEqual(await borrarLoVencidoDelRegistroDeAccesos(PRESTADORA_A), { borrados: [] });
  });
});
