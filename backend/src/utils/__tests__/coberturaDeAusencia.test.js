/**
 * Que la cobertura de un turno fijo siga a la ausencia, y que devolverle el turno al titular no se
 * lleve lo que ya pasó.
 *
 *   npm test --prefix backend
 *
 * Lo que tiene que garantizar:
 *
 *   1. HASTA DÓNDE SE CUBRE. Con fecha prevista por delante, o con la vuelta anotada, hasta la fecha
 *      de fin. Con la prevista pasada y sin vuelta, hasta pasado mañana: la cobertura sigue sin
 *      inventar un fin.
 *   2. DEVOLVER AL TITULAR mueve de vuelta las guardias programadas desde el día pedido, borra su
 *      constancia de sustitución y no toca las anteriores.
 *   3. EL TRABAJO PROGRAMADO VA DE A UNA PRESTADORA: cada consulta de coberturas sale atada a una.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';

const PRESTADORA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TITULAR = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const COBERTURA = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const respuestas = new Map();
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const direccion = new URL(req.url, 'http://interno');
    const clave = `${req.method} ${direccion.pathname}`;
    llamadas.push({ clave, filtros: direccion.searchParams, cuerpo: crudo ? JSON.parse(crudo) : null });
    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada(direccion.searchParams) : (preparada ?? []);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-mentira';

const { supabase } = await import('../../db/connection.js');
const { hastaDondeCubrir, devolverAlTitular, extenderCoberturasDeAusencia } = await import('../coberturaDeAusencia.js');

after(() => baseFalsa.close());

beforeEach(() => {
  respuestas.clear();
  llamadas = [];
});

describe('hasta dónde se cubre', () => {
  const HOY = '2026-10-10';

  it('con la fecha prevista por delante, hasta esa fecha', () => {
    assert.equal(hastaDondeCubrir({ fecha_fin: '2026-10-20', fecha_vuelta_real: null }, HOY), '2026-10-20');
  });

  it('con la vuelta anotada, hasta el día anterior a la vuelta', () => {
    assert.equal(hastaDondeCubrir({ fecha_fin: '2026-10-05', fecha_vuelta_real: '2026-10-06' }, HOY), '2026-10-05');
  });

  it('con la prevista pasada y sin vuelta, hasta pasado mañana', () => {
    assert.equal(hastaDondeCubrir({ fecha_fin: '2026-10-05', fecha_vuelta_real: null }, HOY), '2026-10-12');
  });
});

describe('devolver al titular', () => {
  it('devuelve las guardias programadas desde el día pedido y borra su constancia', async () => {
    respuestas.set('GET /rest/v1/guardias_cobertura', [
      { id: 'f-1', guardia_original_id: 'g-pasada' },
      { id: 'f-2', guardia_original_id: 'g-futura' },
    ]);
    // La base contesta sólo las que cumplen el filtro de fecha: la pasada no vuelve.
    respuestas.set('GET /rest/v1/guardias', [{ id: 'g-futura' }]);

    const devueltas = await devolverAlTitular({
      db: supabase,
      cobertura: { id: COBERTURA, prestadora_id: PRESTADORA },
      titularId: TITULAR,
      desde: '2026-10-10',
    });

    assert.deepEqual(devueltas, ['g-futura']);
    const lectura = llamadas.find((l) => l.clave === 'GET /rest/v1/guardias');
    assert.equal(lectura.filtros.get('fecha'), 'gte.2026-10-10');
    assert.equal(lectura.filtros.get('estado'), 'eq.programada');

    const cambios = llamadas.filter((l) => l.clave === 'PATCH /rest/v1/guardias');
    assert.equal(cambios.length, 1);
    assert.deepEqual(cambios[0].cuerpo, { asistente_id: TITULAR });
    assert.equal(cambios[0].filtros.get('id'), 'eq.g-futura');

    const borradas = llamadas.filter((l) => l.clave === 'DELETE /rest/v1/guardias_cobertura');
    assert.equal(borradas.length, 1);
    assert.equal(borradas[0].filtros.get('id'), 'eq.f-2');
  });
});

describe('el trabajo programado', () => {
  it('lee las coberturas de a una Prestadora', async () => {
    respuestas.set('GET /rest/v1/prestadoras', [{ id: PRESTADORA }, { id: '99999999-9999-9999-9999-999999999999' }]);

    await extenderCoberturasDeAusencia();

    const lecturas = llamadas.filter((l) => l.clave === 'GET /rest/v1/coberturas_de_ausencia');
    assert.equal(lecturas.length, 2);
    assert.deepEqual(
      lecturas.map((l) => l.filtros.get('prestadora_id')),
      [`eq.${PRESTADORA}`, 'eq.99999999-9999-9999-9999-999999999999'],
    );
  });
});
