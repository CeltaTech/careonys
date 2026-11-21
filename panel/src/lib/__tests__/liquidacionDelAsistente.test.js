// Cada día se paga con el valor del Legajo que regía ese día: la liquidación de un Asistente
// partida en tramos.
import { describe, expect, it } from 'vitest';
import { calcularLiquidacion } from '../calcularLiquidacion.js';

const AGOSTO = '2026-08';
const ASISTENTE = { id: 'a-1', nombre: 'Asistente de prueba', relaciones_laborales: { nombre: 'Monotributo' } };
const SIN_TRABAJO = { turnos_guardia: 0, horas: 0, horasExtra: 0 };

const liquidar = (extras) =>
  calcularLiquidacion({
    asistente: ASISTENTE,
    acumulado: SIN_TRABAJO,
    conceptos: [],
    escalasPorTipo: new Map(),
    moneda: 'ARS',
    jurisdiccion: 'AR',
    periodo: AGOSTO,
    reglaDePago: {},
    ...extras,
  });

describe('la liquidación de un Asistente por tramos', () => {
  it('con un solo valor en el período da lo mismo que sin tramos', () => {
    const valores = { unidad_medicion: 'hora', valor_hora: 1500, valor_hora_extra: 2000 };
    const acumulado = { turnos_guardia: 2, horas: 16, horasExtra: 1 };
    const sinTramos = liquidar({ asistente: { ...ASISTENTE, ...valores }, acumulado });
    const conUnTramo = liquidar({
      acumulado,
      tramos: [{ desde: '2026-08-01', hasta: '2026-08-31', valores: { ...valores, moneda: 'ARS' }, acumulado }],
    });
    expect(conUnTramo).toEqual(sinTramos);
    expect(conUnTramo.liquidacion.bruto).toBe(26000);
    expect(conUnTramo.liquidacion.moneda).toBe('ARS');
  });

  it('con un cambio a mitad del período, cada turno de guardia se paga con el valor de su tramo', () => {
    const { liquidacion, items } = liquidar({
      tramos: [
        {
          desde: '2026-08-01',
          hasta: '2026-08-15',
          valores: { unidad_medicion: 'turno_guardia', valor_turno_guardia: 1000 },
          acumulado: { turnos_guardia: 3, horas: 24, horasExtra: 0 },
        },
        {
          desde: '2026-08-16',
          hasta: '2026-08-31',
          valores: { unidad_medicion: 'turno_guardia', valor_turno_guardia: 1200 },
          acumulado: { turnos_guardia: 2, horas: 16, horasExtra: 0 },
        },
      ],
    });
    const base = items.filter((item) => item.unidad === 'base');
    expect(base.map((item) => [item.valor_aplicado, item.monto])).toEqual([
      [1000, 3000],
      [1200, 2400],
    ]);
    expect(base[0].descripcion).toContain('2026-08-01 a 2026-08-15');
    expect(liquidacion.bruto).toBe(5400);
    expect(liquidacion.turnos_guardia_contados).toBe(5);
    expect(liquidacion.horas).toBe(40);
    expect(liquidacion.base_valor).toBe(1200);
    expect(items.map((item) => item.orden)).toEqual([0, 1]);
  });

  it('por semana, un cambio el día 16 de agosto prorratea los días de cada tramo', () => {
    const { liquidacion, items } = liquidar({
      tramos: [
        { desde: '2026-08-01', hasta: '2026-08-15', valores: { unidad_medicion: 'semana', valor_semana: 70000 }, acumulado: SIN_TRABAJO },
        { desde: '2026-08-16', hasta: '2026-08-31', valores: { unidad_medicion: 'semana', valor_semana: 77000 }, acumulado: SIN_TRABAJO },
      ],
    });
    // 15 días de 70000 por semana y 16 días de 77000 por semana.
    expect(items.filter((item) => item.unidad === 'base').map((item) => item.monto)).toEqual([150000, 176000]);
    expect(liquidacion.bruto).toBe(326000);
  });

  it('las horas extra se pagan con el valor de la hora extra de su tramo', () => {
    const { liquidacion, sinEscala } = liquidar({
      tramos: [
        {
          desde: '2026-08-01',
          hasta: '2026-08-15',
          valores: { unidad_medicion: 'hora', valor_hora: 1000, valor_hora_extra: 1500 },
          acumulado: { turnos_guardia: 1, horas: 8, horasExtra: 2 },
        },
        {
          desde: '2026-08-16',
          hasta: '2026-08-31',
          valores: { unidad_medicion: 'hora', valor_hora: 1100, valor_hora_extra: 1800 },
          acumulado: { turnos_guardia: 1, horas: 8, horasExtra: 1 },
        },
      ],
    });
    expect(liquidacion.importe_horas_extra).toBe(4800);
    expect(liquidacion.horas_extra).toBe(3);
    expect(liquidacion.valor_hora_extra).toBe(1800);
    expect(liquidacion.bruto).toBe(8000 + 8800 + 4800);
    expect(sinEscala).toEqual([]);
  });

  it('si a un tramo le falta el valor, la liquidación entera queda sin hacer', () => {
    const resultado = liquidar({
      tramos: [
        { desde: '2026-08-01', hasta: '2026-08-15', valores: { unidad_medicion: 'hora', valor_hora: 1000 }, acumulado: SIN_TRABAJO },
        { desde: '2026-08-16', hasta: '2026-08-31', valores: { unidad_medicion: 'hora' }, acumulado: SIN_TRABAJO },
      ],
    });
    expect(resultado).toEqual({ faltaBase: true });
  });

  it('con valores en dos monedas no se calcula nada', () => {
    const resultado = liquidar({
      tramos: [
        { desde: '2026-08-01', hasta: '2026-08-15', valores: { unidad_medicion: 'hora', valor_hora: 1000, moneda: 'ARS' }, acumulado: SIN_TRABAJO },
        { desde: '2026-08-16', hasta: '2026-08-31', valores: { unidad_medicion: 'hora', valor_hora: 10, moneda: 'USD' }, acumulado: SIN_TRABAJO },
      ],
    });
    expect(resultado).toEqual({ variasMonedas: ['ARS', 'USD'] });
  });

  it('la liquidación toma la moneda del Legajo, y un concepto propio en otra moneda queda afuera', () => {
    const concepto = { id: 'c-1', nombre: 'Viático de prueba', origen_valor: 'propio', signo: 'suma', unidad: 'monto_fijo', valor: 50, moneda: 'ARS' };
    const { liquidacion, sinEscala } = liquidar({
      conceptos: [concepto],
      tramos: [
        { desde: '2026-08-01', hasta: '2026-08-31', valores: { unidad_medicion: 'hora', valor_hora: 10, moneda: 'USD' }, acumulado: { turnos_guardia: 1, horas: 8, horasExtra: 0 } },
      ],
    });
    expect(liquidacion.moneda).toBe('USD');
    expect(liquidacion.total_sumas).toBe(0);
    expect(sinEscala).toEqual(['Viático de prueba: el concepto está en ARS y la liquidación en USD']);
  });
});
