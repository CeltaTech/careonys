import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { armarLosRenglonesDeLaFactura, correEnElPeriodo, ultimoDiaDelPeriodo } from '../facturaDelPeriodo.js';

/* Qué se le cobra a un Cliente en un mes.
   ==========================================================================

   ACÁ SE PRUEBA UNA CUENTA SOBRE PLATA, así que cada caso está escrito por el error que evita, y
   son tres los que importan: cobrarle a alguien un acuerdo que ya terminó, cobrarle uno que
   todavía no empezó, y dejar de cobrar uno que corre.

   Los datos son inventados. El período de todos los casos es agosto de 2026. */

const PERIODO = '2026-08-01';
const PACIENTE = '11111111-1111-4111-8111-111111111111';
const OTRO_PACIENTE = '22222222-2222-4222-8222-222222222222';

const NOMBRES = new Map([
  [PACIENTE, 'Juana Pérez'],
  [OTRO_PACIENTE, 'Marcos Giménez'],
]);

function prestacion(cambios = {}) {
  return {
    id: 1,
    paciente_id: PACIENTE,
    servicio_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    tipo_servicio: 'Acompañamiento',
    precio_final: '10000.00',
    vigente_desde: '2026-01-01',
    vigente_hasta: null,
    ...cambios,
  };
}

function armar({ prestaciones = [] } = {}) {
  return armarLosRenglonesDeLaFactura({
    periodo: PERIODO,
    nombresDePacientes: NOMBRES,
    prestaciones,
  });
}

describe('el último día del período', () => {
  it('sale del mes pedido, sin lista de cuántos días tiene cada uno', () => {
    assert.equal(ultimoDiaDelPeriodo('2026-08-01'), '2026-08-31');
    assert.equal(ultimoDiaDelPeriodo('2026-04-01'), '2026-04-30');
  });

  it('y febrero de un año bisiesto tiene veintinueve', () => {
    assert.equal(ultimoDiaDelPeriodo('2028-02-01'), '2028-02-29');
  });
});

describe('qué acuerdos corren en el período', () => {
  it('uno que se terminó antes de que el mes empiece, no', () => {
    assert.equal(correEnElPeriodo(prestacion({ vigente_hasta: '2026-07-31' }), PERIODO), false);
  });

  it('uno que empieza después de que el mes termine, tampoco', () => {
    assert.equal(correEnElPeriodo(prestacion({ vigente_desde: '2026-09-01' }), PERIODO), false);
  });

  it('uno sin fecha de fin sigue corriendo', () => {
    assert.equal(correEnElPeriodo(prestacion(), PERIODO), true);
  });

  it('y alcanza con que corra un día: el primero del mes', () => {
    assert.equal(correEnElPeriodo(prestacion({ vigente_hasta: '2026-08-01' }), PERIODO), true);
  });

  it('o el último', () => {
    assert.equal(correEnElPeriodo(prestacion({ vigente_desde: '2026-08-31' }), PERIODO), true);
  });
});

describe('los renglones de la factura', () => {
  it('el que corre se cobra, y dice de qué Servicio es y a quién se le prestó', () => {
    const renglones = armar({ prestaciones: [prestacion()] });
    assert.equal(renglones.length, 1);
    assert.equal(renglones[0].paciente_id, PACIENTE);
    assert.equal(renglones[0].servicio_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    assert.equal(renglones[0].descripcion, 'Acompañamiento — Juana Pérez');
    assert.equal(renglones[0].monto, 10000);
  });

  it('el que ya no corre no aparece, aunque el acuerdo siga vigente', () => {
    // Es el caso que se cobraba de más: `estado` dice que el acuerdo está en pie, las fechas
    // dicen que dejó de correr en julio.
    assert.deepEqual(armar({ prestaciones: [prestacion({ vigente_hasta: '2026-06-30' })] }), []);
  });

  it('se cobra el precio acordado entero aunque haya corrido un solo día', () => {
    const renglones = armar({ prestaciones: [prestacion({ vigente_desde: '2026-08-31' })] });
    assert.equal(renglones[0].monto, 10000);
  });
});
