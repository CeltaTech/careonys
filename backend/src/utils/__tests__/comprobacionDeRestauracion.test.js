/**
 * Lo que se revisa al abrir un respaldo de los datos.
 *
 *   node --test src/utils/__tests__/comprobacionDeRestauracion.test.js
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { elegirElUltimoRespaldo, revisarElRespaldo } from '../comprobacionDeRestauracion.js';

const UNA = '11111111-1111-4111-8111-111111111111';
const OTRA = '22222222-2222-4222-8222-222222222222';
const carpeta = `datos/${UNA}/`;

describe('elegirElUltimoRespaldo', () => {
  it('elige el más nuevo y deja afuera lo que no es un respaldo de los datos', () => {
    const elegido = elegirElUltimoRespaldo([
      `${carpeta}careonys_datos_2026-11-09T03-00-00-000Z.json.gz.age`,
      `${carpeta}careonys_datos_2026-11-10T03-00-00-000Z.json.gz.age`,
      `${carpeta}careonys_datos_2026-11-10T03-00-00-000Z.json.gz`,
      'careonys_backup_2026-12-01T03-00-00-000Z.sql.gz',
      `archivos/certificados/${UNA}/ruta.pdf`,
    ]);
    assert.equal(elegido, `${carpeta}careonys_datos_2026-11-10T03-00-00-000Z.json.gz.age`);
  });

  it('sin ningún respaldo, lo dice', () => {
    assert.throws(() => elegirElUltimoRespaldo([`archivos/certificados/${UNA}/ruta.pdf`]), /ningún respaldo/);
  });
});

describe('revisarElRespaldo', () => {
  const contenido = (tablas, prestadora = UNA) => ({ producto: 'careonys', prestadora, tablas });

  it('bien, con filas y todas de esta Prestadora', () => {
    const r = revisarElRespaldo(contenido({ prestadoras: [{ id: UNA }], clientes: [{ id: 'a', prestadora_id: UNA }] }), UNA);
    assert.equal(r.estado, 'bien');
    assert.deepEqual(r.filasPorTabla, { prestadoras: 1, clientes: 1 });
  });

  it('roto, si alguna fila es de otra Prestadora, sin decir cuál', () => {
    const r = revisarElRespaldo(contenido({ clientes: [{ id: 'secreto', prestadora_id: OTRA }] }), UNA);
    assert.equal(r.estado, 'roto');
    assert.match(r.motivos.join(' '), /clientes: 1 filas de otra Prestadora/);
    assert.equal(r.motivos.join(' ').includes('secreto'), false);
  });

  it('roto, si el respaldo es de otra Prestadora', () => {
    assert.equal(revisarElRespaldo(contenido({ clientes: [{ id: 'a', prestadora_id: OTRA }] }, OTRA), UNA).estado, 'roto');
  });

  it('roto, si no tiene la forma de un respaldo', () => {
    assert.equal(revisarElRespaldo({ algo: 1 }, UNA).estado, 'roto');
    assert.equal(revisarElRespaldo(contenido({}), UNA).estado, 'roto');
  });

  it('no_probado, si las tablas están y ninguna trae filas', () => {
    assert.equal(revisarElRespaldo(contenido({ clientes: [], prestadoras: [] }), UNA).estado, 'no_probado');
  });
});
