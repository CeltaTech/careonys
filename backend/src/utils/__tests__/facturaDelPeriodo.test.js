import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  armarLaFacturaDelPeriodo,
  correEnElPeriodo,
  etiquetaDelPeriodo,
  periodosDelTramo,
  seSuperponen,
  tramoNombrado,
  tramoPedido,
  ultimoDiaDelPeriodo,
} from '../facturaDelPeriodo.js';

/* Qué se le cobra a un Cliente en un período.
   ==========================================================================

   ACÁ SE PRUEBA UNA CUENTA SOBRE PLATA, así que cada caso está escrito por el error que evita:
   cobrarle a alguien un acuerdo que ya terminó o que todavía no empezó, cobrar un período que no
   terminó, partir un período entre dos tandas, cobrar dos veces el mismo período cuando el precio
   cambió a mitad, y armar una factura con dos monedas.

   Qué daría con el sistema roto: si los períodos se tomaran por superposición y no por su primer
   día, la semana que cruza de un mes al otro saldría en las dos tandas; si el cambio de precio no
   se prorrateara, la factura de agosto cobraría los dos precios enteros.

   Los datos son inventados. */

const PERIODO = '2026-08-01';
const SERVICIO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PACIENTE = '11111111-1111-4111-8111-111111111111';
const OTRO_PACIENTE = '22222222-2222-4222-8222-222222222222';

const NOMBRES = new Map([
  [PACIENTE, 'Juana Pérez'],
  [OTRO_PACIENTE, 'Marcos Giménez'],
]);

function prestacion(cambios = {}) {
  return {
    id: 'pre-1',
    paciente_id: PACIENTE,
    servicio_id: SERVICIO,
    tipo_servicio: 'Acompañamiento',
    precio_final: '10000.00',
    moneda: 'ARS',
    vigente_desde: '2026-01-01',
    vigente_hasta: null,
    configuracion: {},
    prestacion_anterior_id: null,
    ...cambios,
  };
}

const AGOSTO = { desde: '2026-08-01', hasta: '2026-08-31' };

function armar({ prestaciones = [], guardias = [], medicion = 'pactado_mas_excedente', periodo = AGOSTO } = {}) {
  return armarLaFacturaDelPeriodo({ periodo, medicion, prestaciones, guardias, nombresDePacientes: NOMBRES });
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

describe('qué acuerdos corren en el mes', () => {
  it('uno que se terminó antes de que el mes empiece, no', () => {
    assert.equal(correEnElPeriodo(prestacion({ vigente_hasta: '2026-07-31' }), PERIODO), false);
  });

  it('uno que empieza después de que el mes termine, tampoco', () => {
    assert.equal(correEnElPeriodo(prestacion({ vigente_desde: '2026-09-01' }), PERIODO), false);
  });

  it('uno sin fecha de fin sigue corriendo, y alcanza con un día', () => {
    assert.equal(correEnElPeriodo(prestacion(), PERIODO), true);
    assert.equal(correEnElPeriodo(prestacion({ vigente_hasta: '2026-08-01' }), PERIODO), true);
    assert.equal(correEnElPeriodo(prestacion({ vigente_desde: '2026-08-31' }), PERIODO), true);
  });
});

describe('el tramo que se pide', () => {
  it('un mes, como antes, va del primero al último día', () => {
    assert.deepEqual(tramoPedido({ periodo: '2026-02' }), { desde: '2026-02-01', hasta: '2026-02-28' });
  });

  it('dos fechas reales, en orden', () => {
    assert.deepEqual(tramoPedido({ desde: '2026-08-03', hasta: '2026-08-16' }), { desde: '2026-08-03', hasta: '2026-08-16' });
  });

  it('al revés, una fecha que no existe o un mes trece no se entienden', () => {
    assert.equal(tramoPedido({ desde: '2026-08-16', hasta: '2026-08-03' }), null);
    assert.equal(tramoPedido({ desde: '2026-02-30', hasta: '2026-03-03' }), null);
    assert.equal(tramoPedido({ periodo: '2026-13' }), null);
    assert.equal(tramoPedido({}), null);
  });

  it('si llega una sola de las dos fechas no cae al mes', () => {
    assert.equal(tramoPedido({ desde: '2026-08-01', periodo: '2026-08' }), null);
  });
});

describe('los períodos de cada frecuencia en el tramo', () => {
  it('sólo los que empiezan en el tramo: la semana que cruza al mes siguiente es de éste, y la que viene del anterior no', () => {
    const { terminados } = periodosDelTramo({ tramo: AGOSTO, frecuencia: 'semana', hoy: '2026-12-01' });
    assert.equal(terminados[0].desde, '2026-08-03');
    assert.deepEqual(terminados.at(-1), { desde: '2026-08-31', hasta: '2026-09-06' });
    assert.ok(terminados.every((p) => p.desde >= AGOSTO.desde && p.desde <= AGOSTO.hasta));
  });

  it('lo que todavía no terminó queda aparte', () => {
    const { terminados, sinTerminar } = periodosDelTramo({
      tramo: { desde: '2026-11-01', hasta: '2026-11-30' },
      frecuencia: 'semana',
      hoy: '2026-11-13',
    });
    assert.deepEqual(terminados, [{ desde: '2026-11-02', hasta: '2026-11-08' }]);
    assert.equal(sinTerminar[0].desde, '2026-11-09');
  });

  it('el período que termina hoy todavía no terminó', () => {
    const { terminados, sinTerminar } = periodosDelTramo({ tramo: AGOSTO, frecuencia: 'mes', hoy: '2026-08-31' });
    assert.deepEqual(terminados, []);
    assert.deepEqual(sinTerminar, [AGOSTO]);
  });

  it('por día, uno por cada día', () => {
    const { terminados } = periodosDelTramo({ tramo: AGOSTO, frecuencia: 'dia', hoy: '2026-12-01' });
    assert.equal(terminados.length, 31);
  });
});

describe('cómo se nombra el período', () => {
  it('un mes entero, como siempre', () => {
    assert.equal(etiquetaDelPeriodo('2026-08-01', '2026-08-31'), '2026-08');
  });
  it('otro período, con sus dos fechas', () => {
    assert.equal(etiquetaDelPeriodo('2026-08-03', '2026-08-09'), '2026-08-03/2026-08-09');
  });
  it('y lo que nombra un cobro de afuera se entiende de las tres formas', () => {
    assert.deepEqual(tramoNombrado('2026-08'), AGOSTO);
    assert.deepEqual(tramoNombrado('2026-08-05'), { desde: '2026-08-05', hasta: '2026-08-05' });
    assert.deepEqual(tramoNombrado('2026-08-03/2026-08-09'), { desde: '2026-08-03', hasta: '2026-08-09' });
    assert.equal(tramoNombrado('agosto'), null);
  });
  it('dos tramos se superponen si comparten un día', () => {
    assert.equal(seSuperponen({ desde: '2026-08-01', hasta: '2026-08-31' }, { desde: '2026-08-31', hasta: '2026-09-06' }), true);
    assert.equal(seSuperponen({ desde: '2026-08-01', hasta: '2026-08-30' }, { desde: '2026-08-31', hasta: '2026-09-06' }), false);
  });
});

describe('la factura del período', () => {
  it('el que corre se cobra, y dice de qué Servicio es y a quién se le prestó', () => {
    const f = armar({ prestaciones: [prestacion()] });
    assert.equal(f.renglones.length, 1);
    assert.equal(f.renglones[0].paciente_id, PACIENTE);
    assert.equal(f.renglones[0].servicio_id, SERVICIO);
    assert.equal(f.renglones[0].descripcion, 'Acompañamiento — Juana Pérez');
    assert.equal(f.renglones[0].monto, 10000);
    assert.equal(f.renglones[0].unidad, 'periodo');
    assert.equal(f.total, 10000);
    assert.equal(f.moneda, 'ARS');
  });

  it('el que ya no corre no aparece, aunque el acuerdo siga vigente', () => {
    assert.deepEqual(armar({ prestaciones: [prestacion({ vigente_hasta: '2026-06-30' })] }).renglones, []);
  });

  it('sin cambio de precio, se cobra el precio acordado entero aunque haya corrido un solo día', () => {
    assert.equal(armar({ prestaciones: [prestacion({ vigente_desde: '2026-08-31' })] }).total, 10000);
  });

  it('un cambio de precio a mitad de mes se prorratea por días, y no cobra los dos enteros', () => {
    const f = armar({
      prestaciones: [
        prestacion({ vigente_hasta: '2026-08-10' }),
        prestacion({ id: 'pre-2', precio_final: '20000.00', vigente_desde: '2026-08-11', prestacion_anterior_id: 'pre-1' }),
      ],
    });
    // 10 días a 10.000 y 21 días a 20.000, sobre los 31 del mes.
    assert.deepEqual(f.renglones.map((r) => r.monto), [3225.81, 13548.39]);
    assert.equal(f.total, 16774.2);
  });

  it('por hora, cada guardia al precio vigente su día', () => {
    const f = armar({
      medicion: 'hora',
      prestaciones: [
        prestacion({ precio_final: '100', vigente_hasta: '2026-08-10' }),
        prestacion({ id: 'pre-2', precio_final: '200', vigente_desde: '2026-08-11', prestacion_anterior_id: 'pre-1' }),
      ],
      guardias: [
        { id: 'g1', fecha: '2026-08-05', servicio_id: SERVICIO, horas: 8, horas_extra: 0, pacientes: [PACIENTE] },
        { id: 'g2', fecha: '2026-08-20', servicio_id: SERVICIO, horas: 8, horas_extra: 0, pacientes: [PACIENTE] },
      ],
    });
    assert.equal(f.total, 2400);
  });

  it('dos monedas en el mismo Servicio no arman una factura', () => {
    const f = armar({ prestaciones: [prestacion(), prestacion({ id: 'pre-usd', paciente_id: OTRO_PACIENTE, moneda: 'USD' })] });
    assert.equal(f.monedasMezcladas, true);
    assert.equal(f.moneda, null);
  });

  it('una prestación sin precio se cuenta, no se cobra en cero', () => {
    const f = armar({ prestaciones: [prestacion({ precio_final: null })] });
    assert.equal(f.sinPrecio, 1);
    assert.deepEqual(f.renglones, []);
  });
});

describe('lo que se descuenta y lo que se cobra de más, según las condiciones', () => {
  // Cuatro guardias pactadas a 10.000 el período: cada una vale 2.500.
  const pactadas = () => [prestacion({ configuracion: { cantidad_guardias: 4 } })];
  const guardia = (fecha, cambios = {}) => ({
    id: `g-${fecha}`, fecha, servicio_id: SERVICIO, horas: 8, horas_extra: 0, pacientes: [PACIENTE], ...cambios,
  });

  it('cada renglón dice qué es, y lo no prestado va aparte, en negativo y en la moneda de la factura', () => {
    const f = armarLaFacturaDelPeriodo({
      periodo: AGOSTO,
      condiciones: { medicion: 'pactado_mas_excedente' },
      prestaciones: pactadas(),
      guardias: [guardia('2026-08-03'), guardia('2026-08-10'), guardia('2026-08-17'), guardia('2026-08-24', { estado: 'ausente' })],
      nombresDePacientes: NOMBRES,
    });
    assert.deepEqual(f.renglones.map((r) => [r.concepto, r.unidad, r.monto]), [
      ['pactado', 'periodo', 10000],
      ['no_prestado', 'guardia', -2500],
    ]);
    assert.equal(f.moneda, 'ARS');
    assert.equal(f.total, 7500);
  });

  it('sin precio pactado, la guardia adicional vale lo proporcional, sin recargo', () => {
    const f = armarLaFacturaDelPeriodo({
      periodo: AGOSTO,
      condiciones: { medicion: 'pactado_mas_excedente' },
      prestaciones: pactadas(),
      guardias: ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31'].map((d) => guardia(d)),
      nombresDePacientes: NOMBRES,
    });
    const adicional = f.renglones.find((r) => r.concepto === 'adicional');
    assert.equal(adicional.precio_unitario, 2500);
    assert.equal(adicional.monto, 2500);
    assert.equal(f.total, 12500);
  });

  it('con precio pactado, la guardia adicional vale ese precio', () => {
    const f = armarLaFacturaDelPeriodo({
      periodo: AGOSTO,
      condiciones: { medicion: 'pactado_mas_excedente' },
      prestaciones: [prestacion({ configuracion: { cantidad_guardias: 4 }, precio_guardia_adicional: '4000.00' })],
      guardias: ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31'].map((d) => guardia(d)),
      nombresDePacientes: NOMBRES,
    });
    const adicional = f.renglones.find((r) => r.concepto === 'adicional');
    assert.equal(adicional.precio_unitario, 4000);
    assert.equal(adicional.monto, 4000);
    assert.equal(f.total, 14000);
  });
});
