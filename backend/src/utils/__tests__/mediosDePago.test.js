/**
 * Los medios de pago se leen con la conexión de quien pide, y con los dos pisos de la lista.
 *
 *   npm test --prefix backend
 *   node --test backend/src/utils/__tests__/mediosDePago.test.js
 *
 * POR QUÉ EXISTE ESTA PRUEBA. `../mediosDePago.js` recibe la conexión de quien pide y lee con ella
 * las opciones de la lista. Lo que hay que sostener acá es que la consulta vaya por esa conexión y
 * por ninguna otra, que pida las opciones del producto y las de la Prestadora, y que una lista que
 * no existe ni siquiera consulte.
 *
 * La conexión es de mentira: anota cada filtro que se le pide y contesta las filas preparadas.
 *
 * Con el sistema roto —la consulta por otra conexión, o sin el filtro de los dos pisos— las
 * pruebas dan al revés.
 *
 * Datos inventados, como manda CLAUDE.md §6.
 */
import { strict as assert } from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import {
  LISTA_DE_MEDIOS_DE_PAGO_DEL_CLIENTE,
  mediosDePagoDeLaPrestadora,
} from '../mediosDePago.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';

/** Lo que se le pidió a la conexión, en orden. */
let pedidos = [];

/** Una conexión que anota los filtros y contesta `filas`. */
function conexionDeMentira(filas) {
  const consulta = {
    select: (columnas) => (pedidos.push(['select', columnas]), consulta),
    eq: (columna, valor) => (pedidos.push(['eq', columna, valor]), consulta),
    is: (columna, valor) => (pedidos.push(['is', columna, valor]), consulta),
    or: (condicion) => (pedidos.push(['or', condicion]), consulta),
    then: (listo, fallo) => Promise.resolve({ data: filas, error: null }).then(listo, fallo),
  };
  return { from: (tabla) => (pedidos.push(['from', tabla]), consulta) };
}

beforeEach(() => {
  pedidos = [];
});

describe('los medios de pago de una Prestadora', () => {
  it('se leen con la conexión que se le pasa, con los dos pisos', async () => {
    const db = conexionDeMentira([
      { clave: 'efectivo', prestadora_id: null, modalidades: null },
      { clave: 'transferencia', prestadora_id: PRESTADORA, modalidades: null },
    ]);

    const medios = await mediosDePagoDeLaPrestadora(db, PRESTADORA, LISTA_DE_MEDIOS_DE_PAGO_DEL_CLIENTE);

    assert.deepEqual(medios, ['efectivo', 'transferencia']);
    assert.deepEqual(pedidos[0], ['from', 'opciones_de_lista']);
    assert.ok(
      pedidos.some(([tipo, condicion]) => tipo === 'or' && condicion === `prestadora_id.is.null,prestadora_id.eq.${PRESTADORA}`),
      'no pidió las opciones del producto y las de la Prestadora',
    );
  });

  it('una lista que no existe no consulta', async () => {
    const db = conexionDeMentira([]);

    assert.deepEqual(await mediosDePagoDeLaPrestadora(db, PRESTADORA, 'lista_que_no_existe'), []);
    assert.equal(pedidos.length, 0);
  });

  it('sin Prestadora no consulta', async () => {
    const db = conexionDeMentira([]);

    assert.deepEqual(await mediosDePagoDeLaPrestadora(db, null, LISTA_DE_MEDIOS_DE_PAGO_DEL_CLIENTE), []);
    assert.equal(pedidos.length, 0);
  });
});
