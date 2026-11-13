import { describe, it, expect } from 'vitest';
import {
  descuentosDelPeriodo,
  descuentoValido,
  ordenDelPeriodo,
  tocaElPeriodo,
  renglonesDeFactura,
  MOTIVOS_SIN_APLICAR,
} from '../descuentosDelPeriodo';
import { periodosDeCobroQueTocan } from '../frecuenciaDePago';

// Datos inventados.
const MARZO = { desde: '2027-03-01', hasta: '2027-03-31', orden: 1 };

function porcentaje(valor, extra = {}) {
  return { id: `p${valor}`, clase: 'porcentaje', valor, moneda: null, vigente_desde: '2027-03-01', cantidad_de_periodos: 12, vigente_hasta: null, ...extra };
}
function monto(valor, moneda = 'ARS', extra = {}) {
  return { id: `m${valor}`, clase: 'monto', valor, moneda, vigente_desde: '2027-03-01', cantidad_de_periodos: 12, vigente_hasta: null, ...extra };
}
function aplicar(descuentos, { periodo = MARZO, subtotal = 1000, moneda = 'ARS', ordenDe } = {}) {
  return descuentosDelPeriodo({ descuentos, periodo, subtotal, moneda, ordenDe });
}

describe('descuentosDelPeriodo — porcentaje y monto', () => {
  it('un porcentaje resta esa parte del subtotal, en un renglón propio', () => {
    const r = aplicar([porcentaje(10)]);
    expect(r.renglones).toEqual([
      { descuento_id: 'p10', clase: 'porcentaje', valor: 10, importe: 100, moneda: 'ARS', recortado: false },
    ]);
    expect(r.total_descontado).toBe(100);
    expect(r.total).toBe(900);
    expect(r.no_aplicados).toEqual([]);
  });

  it('un monto en la moneda del subtotal se resta tal cual', () => {
    const r = aplicar([monto(250)]);
    expect(r.renglones).toHaveLength(1);
    expect(r.renglones[0]).toMatchObject({ descuento_id: 'm250', importe: 250, moneda: 'ARS' });
    expect(r.total).toBe(750);
  });

  it('cuenta en centavos: un tercio no deja restos de coma flotante', () => {
    const r = aplicar([porcentaje(33.33)], { subtotal: 100.1 });
    expect(r.renglones[0].importe).toBe(33.36);
    expect(r.total).toBe(66.74);
    expect(r.total + r.total_descontado).toBe(100.1);
  });

  it('sin descuentos el total es el subtotal', () => {
    expect(aplicar([])).toMatchObject({ renglones: [], no_aplicados: [], total: 1000, total_descontado: 0 });
    expect(aplicar(undefined).total).toBe(1000);
  });
});

describe('descuentosDelPeriodo — cantidad de períodos', () => {
  const tres = porcentaje(10, { cantidad_de_periodos: 3 });

  it('se aplica del período 1 al N, y no en el N+1', () => {
    for (const orden of [1, 2, 3]) {
      expect(aplicar([tres], { periodo: { ...MARZO, orden } }).renglones).toHaveLength(1);
    }
    const cuarto = aplicar([tres], { periodo: { ...MARZO, orden: 4 } });
    expect(cuarto.renglones).toEqual([]);
    expect(cuarto.no_aplicados).toEqual([]);
    expect(cuarto.total).toBe(1000);
  });

  it('el período 0 (antes del comienzo) no lo lleva', () => {
    expect(aplicar([tres], { periodo: { ...MARZO, orden: 0 } }).renglones).toEqual([]);
  });

  it('sin orden del período falla cerrado: no se aplica y se informa', () => {
    const r = aplicar([tres], { periodo: { desde: MARZO.desde, hasta: MARZO.hasta } });
    expect(r.renglones).toEqual([]);
    expect(r.no_aplicados).toEqual([{ descuento_id: tres.id, motivo: MOTIVOS_SIN_APLICAR.SIN_ORDEN }]);
    expect(r.total).toBe(1000);
  });

  it('con ordenDe cada descuento cuenta desde su propio comienzo', () => {
    const viejo = porcentaje(10, { id: 'viejo', vigente_desde: '2027-01-01', cantidad_de_periodos: 2 });
    const nuevo = porcentaje(5, { id: 'nuevo', vigente_desde: '2027-03-01', cantidad_de_periodos: 2 });
    const mensual = (d, h) => periodosDeCobroQueTocan(d, h, 'mes');
    const r = aplicar([viejo, nuevo], { ordenDe: (d) => ordenDelPeriodo(d, MARZO, mensual) });
    // Marzo es el tercer mes del viejo (ya terminó) y el primero del nuevo.
    expect(r.renglones.map((x) => x.descuento_id)).toEqual(['nuevo']);
    expect(r.total).toBe(950);
  });
});

describe('ordenDelPeriodo', () => {
  const mensual = (d, h) => periodosDeCobroQueTocan(d, h, 'mes');
  const semanal = (d, h) => periodosDeCobroQueTocan(d, h, 'semana');

  it('el período que contiene el comienzo es el 1', () => {
    expect(ordenDelPeriodo({ vigente_desde: '2027-03-15' }, MARZO, mensual)).toBe(1);
    expect(ordenDelPeriodo({ vigente_desde: '2027-01-31' }, MARZO, mensual)).toBe(3);
  });

  it('con frecuencia semanal cuenta semanas', () => {
    // 2027-03-01 es lunes; la semana del Cliente cierra el domingo.
    expect(ordenDelPeriodo({ vigente_desde: '2027-03-01' }, { desde: '2027-03-15', hasta: '2027-03-21' }, semanal)).toBe(3);
  });

  it('antes del comienzo da 0, y sin datos da null', () => {
    expect(ordenDelPeriodo({ vigente_desde: '2027-04-01' }, MARZO, mensual)).toBe(0);
    expect(ordenDelPeriodo({ vigente_desde: null }, MARZO, mensual)).toBeNull();
    expect(ordenDelPeriodo({ vigente_desde: '2027-03-01' }, MARZO, null)).toBeNull();
  });
});

describe('descuentosDelPeriodo — hasta una fecha', () => {
  const hastaMarzo = porcentaje(10, { cantidad_de_periodos: null, vigente_hasta: '2027-03-10' });

  it('se aplica si termina dentro del período o después', () => {
    expect(aplicar([hastaMarzo]).total).toBe(900);
    expect(aplicar([{ ...hastaMarzo, vigente_hasta: '2027-12-31' }]).total).toBe(900);
  });

  it('no se aplica si terminó antes del período', () => {
    const r = aplicar([hastaMarzo], { periodo: { desde: '2027-04-01', hasta: '2027-04-30' } });
    expect(r.renglones).toEqual([]);
    expect(r.no_aplicados).toEqual([]);
  });

  it('no se aplica si empieza después del período, y no necesita el orden', () => {
    const futuro = { ...hastaMarzo, vigente_desde: '2027-04-01', vigente_hasta: '2027-05-01' };
    expect(aplicar([futuro], { periodo: { desde: MARZO.desde, hasta: MARZO.hasta } }).renglones).toEqual([]);
    expect(aplicar([hastaMarzo], { periodo: { desde: MARZO.desde, hasta: MARZO.hasta } }).total).toBe(900);
  });
});

describe('descuentosDelPeriodo — terminado', () => {
  it('alcanza a un período que cerró antes del día de la terminación', () => {
    const d = porcentaje(10, { terminado_en: '2027-04-05T14:00:00Z' });
    expect(aplicar([d]).total).toBe(900);
  });

  it('no alcanza al período abierto el día de la terminación ni a los siguientes', () => {
    const d = porcentaje(10, { terminado_en: '2027-03-31T10:00:00Z' });
    expect(aplicar([d]).renglones).toEqual([]);
    expect(aplicar([d], { periodo: { desde: '2027-04-01', hasta: '2027-04-30', orden: 2 } }).renglones).toEqual([]);
  });
});

describe('descuentosDelPeriodo — varios superpuestos', () => {
  it('los porcentajes se calculan sobre el subtotal, no en cascada', () => {
    const r = aplicar([porcentaje(10, { id: 'a' }), porcentaje(10, { id: 'b' })]);
    expect(r.renglones.map((x) => x.importe)).toEqual([100, 100]);
    expect(r.total).toBe(800);
  });

  it('porcentaje y monto juntos, cada uno en su renglón y en orden de comienzo', () => {
    const r = aplicar([
      monto(300, 'ARS', { id: 'tarde', vigente_desde: '2027-02-15' }),
      porcentaje(20, { id: 'temprano', vigente_desde: '2027-02-01' }),
    ]);
    expect(r.renglones.map((x) => [x.descuento_id, x.importe])).toEqual([['temprano', 200], ['tarde', 300]]);
    expect(r.total).toBe(500);
  });

  it('con el mismo comienzo desempata por cuándo se cargó', () => {
    const r = aplicar([
      monto(900, 'ARS', { id: 'segundo', cargado_en: '2027-02-02T00:00:00Z' }),
      monto(900, 'ARS', { id: 'primero', cargado_en: '2027-02-01T00:00:00Z' }),
    ]);
    expect(r.renglones.map((x) => [x.descuento_id, x.importe, x.recortado])).toEqual([
      ['primero', 900, false],
      ['segundo', 100, true],
    ]);
  });
});

describe('descuentosDelPeriodo — tope en cero', () => {
  it('un monto mayor que el subtotal se recorta y el total queda en cero', () => {
    const r = aplicar([monto(5000)]);
    expect(r.renglones[0]).toMatchObject({ importe: 1000, recortado: true });
    expect(r.total).toBe(0);
    expect(r.total_descontado).toBe(1000);
  });

  it('el que ya no entra nada se informa sin saldo', () => {
    const r = aplicar([porcentaje(100, { id: 'todo' }), monto(10, 'ARS', { id: 'nada', vigente_desde: '2027-03-02' })]);
    expect(r.total).toBe(0);
    expect(r.renglones.map((x) => x.descuento_id)).toEqual(['todo']);
    expect(r.no_aplicados).toEqual([{ descuento_id: 'nada', motivo: MOTIVOS_SIN_APLICAR.SIN_SALDO }]);
  });

  it('con subtotal cero o negativo no resta nada ni da negativo', () => {
    expect(aplicar([porcentaje(10)], { subtotal: 0 })).toMatchObject({ total: 0, renglones: [] });
    const negativo = aplicar([monto(10)], { subtotal: -50 });
    expect(negativo.total).toBe(0);
    expect(negativo.renglones).toEqual([]);
  });
});

describe('descuentosDelPeriodo — moneda distinta', () => {
  it('un monto en otra moneda no se aplica y se informa', () => {
    const r = aplicar([monto(100, 'USD')]);
    expect(r.renglones).toEqual([]);
    expect(r.no_aplicados).toEqual([{ descuento_id: 'm100', motivo: MOTIVOS_SIN_APLICAR.MONEDA_DISTINTA }]);
    expect(r.total).toBe(1000);
  });

  it('sin moneda del subtotal un monto no se aplica, pero un porcentaje sí', () => {
    const r = aplicar([monto(100), porcentaje(10)], { moneda: null });
    expect(r.no_aplicados).toEqual([{ descuento_id: 'm100', motivo: MOTIVOS_SIN_APLICAR.MONEDA_DISTINTA }]);
    expect(r.renglones.map((x) => x.descuento_id)).toEqual(['p10']);
    expect(r.total).toBe(900);
  });

  it('el porcentaje toma la moneda del subtotal', () => {
    expect(aplicar([porcentaje(10)], { moneda: 'BRL' }).renglones[0].moneda).toBe('BRL');
  });
});

describe('descuentoValido y datos mal escritos', () => {
  it('rechaza clase desconocida, valor no positivo, porcentaje mayor a 100 y dos fines', () => {
    expect(descuentoValido(porcentaje(10))).toBe(true);
    expect(descuentoValido(porcentaje(10, { clase: 'regalo' }))).toBe(false);
    expect(descuentoValido(porcentaje(0))).toBe(false);
    expect(descuentoValido(porcentaje(101))).toBe(false);
    expect(descuentoValido(porcentaje(10, { vigente_hasta: '2027-05-01' }))).toBe(false);
    expect(descuentoValido(porcentaje(10, { cantidad_de_periodos: null }))).toBe(true);
    expect(descuentoValido(porcentaje(10, { cantidad_de_periodos: 1.5 }))).toBe(false);
    expect(descuentoValido(porcentaje(10, { cantidad_de_periodos: null, vigente_hasta: '2027-02-01' }))).toBe(false);
  });

  it('un descuento sin fin alcanza a todo período desde que empieza', () => {
    const sinFin = porcentaje(10, { cantidad_de_periodos: null });
    expect(tocaElPeriodo(sinFin, { desde: '2029-01-01', hasta: '2029-01-31' }, null)).toBe(true);
    expect(tocaElPeriodo(sinFin, { desde: '2027-02-01', hasta: '2027-02-28' }, null)).toBe(false);
    expect(tocaElPeriodo({ ...sinFin, terminado_en: '2027-06-10T12:00:00Z' }, { desde: '2027-06-01', hasta: '2027-06-30' }, null)).toBe(false);
  });

  it('un descuento mal escrito no resta y se informa', () => {
    const r = aplicar([porcentaje(150, { id: 'malo' })]);
    expect(r.total).toBe(1000);
    expect(r.no_aplicados).toEqual([{ descuento_id: 'malo', motivo: MOTIVOS_SIN_APLICAR.DATO_INVALIDO }]);
  });

  it('tocaElPeriodo sin período no toca', () => {
    expect(tocaElPeriodo(porcentaje(10), null, 1)).toBe(false);
  });
});

describe('renglonesDeFactura', () => {
  it('cada descuento es un renglón en negativo, con su descuento_id, sin unidad y con su concepto', () => {
    const r = aplicar([porcentaje(10)]);
    expect(renglonesDeFactura(r, 'srv-1', (x) => `Descuento ${x.valor} %`)).toEqual([
      {
        paciente_id: null,
        servicio_id: 'srv-1',
        descuento_id: 'p10',
        descripcion: 'Descuento 10 %',
        monto: -100,
        cantidad: null,
        unidad: null,
        precio_unitario: null,
        concepto: 'descuento',
        recargo_del_adicional: null,
      },
    ]);
  });
});
