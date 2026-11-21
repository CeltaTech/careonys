/**
 * Con qué valor del Legajo se paga cada día: la misma elección que hace la base con
 * `valor_del_legajo_en`, hecha sin base.
 *
 *   npm test --prefix backend
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  filasDelLegajoPorAsistente,
  tramosDelLegajoEnElPeriodo,
  valorDelLegajoEnLaFecha,
} from '../valorDelLegajoEnLaFecha.js';

const ENERO = { asistente_id: 'a-1', valor_hora: 1000, rige_desde: '2026-01-01' };
const MAYO = { asistente_id: 'a-1', valor_hora: 1200, rige_desde: '2026-05-01' };
const SEPTIEMBRE = { asistente_id: 'a-1', valor_hora: 1500, rige_desde: '2026-09-01' };
const FILAS = [SEPTIEMBRE, ENERO, MAYO];

describe('el valor que rige en una fecha', () => {
  it('rige el que empezó más cerca antes de la fecha', () => {
    assert.equal(valorDelLegajoEnLaFecha(FILAS, '2026-06-10'), MAYO);
    assert.equal(valorDelLegajoEnLaFecha(FILAS, '2026-12-31'), SEPTIEMBRE);
  });

  it('el día en que empieza ya rige', () => {
    assert.equal(valorDelLegajoEnLaFecha(FILAS, '2026-05-01'), MAYO);
    assert.equal(valorDelLegajoEnLaFecha(FILAS, '2026-04-30'), ENERO);
  });

  it('una fecha anterior a todas se paga con el más antiguo, igual que en la base', () => {
    assert.equal(valorDelLegajoEnLaFecha(FILAS, '2025-12-01'), ENERO);
  });

  it('sin filas no hay valor', () => {
    assert.equal(valorDelLegajoEnLaFecha([], '2026-06-10'), null);
  });

  it('la vigente y la historia se juntan por Asistente', () => {
    const otro = { asistente_id: 'a-2', valor_hora: 900, rige_desde: '2026-01-01' };
    const porAsistente = filasDelLegajoPorAsistente([SEPTIEMBRE, otro], [ENERO, MAYO]);
    assert.equal(porAsistente.get('a-1').length, 3);
    assert.deepEqual(porAsistente.get('a-2'), [otro]);
  });
});

describe('los tramos de un período', () => {
  const AGOSTO = { desde: '2026-08-01', hasta: '2026-08-31' };

  it('sin cambios adentro, un solo tramo con la fila del primer día', () => {
    assert.deepEqual(tramosDelLegajoEnElPeriodo(FILAS, AGOSTO), [{ desde: '2026-08-01', hasta: '2026-08-31', fila: MAYO }]);
  });

  it('un cambio adentro parte el período el día en que empieza a regir', () => {
    const nuevo = { ...MAYO, rige_desde: '2026-08-16' };
    assert.deepEqual(tramosDelLegajoEnElPeriodo([ENERO, nuevo], AGOSTO), [
      { desde: '2026-08-01', hasta: '2026-08-15', fila: ENERO },
      { desde: '2026-08-16', hasta: '2026-08-31', fila: nuevo },
    ]);
  });

  it('dos cambios adentro dan tres tramos seguidos', () => {
    const segundo = { ...MAYO, rige_desde: '2026-08-10' };
    const tercero = { ...SEPTIEMBRE, rige_desde: '2026-08-20' };
    assert.deepEqual(tramosDelLegajoEnElPeriodo([tercero, ENERO, segundo], AGOSTO), [
      { desde: '2026-08-01', hasta: '2026-08-09', fila: ENERO },
      { desde: '2026-08-10', hasta: '2026-08-19', fila: segundo },
      { desde: '2026-08-20', hasta: '2026-08-31', fila: tercero },
    ]);
  });

  it('un cambio el primer día no abre un tramo vacío', () => {
    const nuevo = { ...MAYO, rige_desde: '2026-08-01' };
    assert.deepEqual(tramosDelLegajoEnElPeriodo([ENERO, nuevo], AGOSTO), [{ desde: '2026-08-01', hasta: '2026-08-31', fila: nuevo }]);
  });

  it('el último día del mes anterior se calcula bien al cruzar de mes', () => {
    const nuevo = { ...MAYO, rige_desde: '2026-03-01' };
    assert.deepEqual(tramosDelLegajoEnElPeriodo([ENERO, nuevo], { desde: '2026-02-20', hasta: '2026-03-05' }), [
      { desde: '2026-02-20', hasta: '2026-02-28', fila: ENERO },
      { desde: '2026-03-01', hasta: '2026-03-05', fila: nuevo },
    ]);
  });

  it('sin filas no hay tramos', () => {
    assert.deepEqual(tramosDelLegajoEnElPeriodo([], AGOSTO), []);
  });
});
