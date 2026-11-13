/**
 * Lo que se le cobra a un Cliente por un Servicio en un período, con las tres mediciones.
 *
 *   npx vitest run src/lib/__tests__/liquidacionDelCliente.test.js
 *
 * Todos los datos son inventados. Qué daría con el sistema roto: si la guardia se cobrara con la
 * prestación de hoy y no con la vigente el día de la guardia, el cambio de precio a mitad de mes
 * daría otro total; si una guardia de dos Pacientes no repartiera las horas, la medición por hora
 * cobraría el doble.
 */
import { describe, expect, it } from 'vitest';
import { calcularLiquidacionDelCliente } from '../calcularLiquidacion';

const SERVICIO = 'srv-ficticio';
const PERIODO = { desde: '2026-11-01', hasta: '2026-11-30' };

const prestacion = (extra = {}) => ({
  id: 'pre-1',
  paciente_id: 'pac-1',
  servicio_id: SERVICIO,
  tipo_servicio: 'Acompañamiento',
  precio_final: 1000,
  moneda: 'ARS',
  vigente_desde: '2026-01-01',
  vigente_hasta: null,
  configuracion: { cantidad_guardias: 4 },
  ...extra,
});

const guardia = (fecha, extra = {}) => ({
  id: `g-${fecha}`,
  fecha,
  servicio_id: SERVICIO,
  horas: 8,
  horas_extra: 0,
  pacientes: ['pac-1'],
  ...extra,
});

describe('pactado más excedente', () => {
  it('dentro de lo pactado cobra el precio entero, una vez', () => {
    const r = calcularLiquidacionDelCliente({
      periodo: PERIODO,
      medicion: 'pactado_mas_excedente',
      prestaciones: [prestacion()],
      guardias: [guardia('2026-11-02'), guardia('2026-11-09')],
    });
    expect(r.renglones).toHaveLength(1);
    expect(r.renglones[0]).toMatchObject({ unidad: 'periodo', cantidad: 1, precio_unitario: 1000, monto: 1000, moneda: 'ARS' });
    expect(r.total).toBe(1000);
  });

  it('cada guardia de más se cobra a precio dividido lo pactado, y la hora extra a valor de su guardia', () => {
    const r = calcularLiquidacionDelCliente({
      periodo: PERIODO,
      medicion: 'pactado_mas_excedente',
      prestaciones: [prestacion()],
      guardias: [
        guardia('2026-11-02'),
        guardia('2026-11-09'),
        guardia('2026-11-16'),
        guardia('2026-11-23'),
        guardia('2026-11-24', { horas_extra: 2 }),
        guardia('2026-11-25'),
      ],
    });
    const porUnidad = Object.fromEntries(r.renglones.map((x) => [x.unidad, x]));
    expect(porUnidad.guardia).toMatchObject({ cantidad: 2, precio_unitario: 250, monto: 500 });
    // 250 la guardia de 8 horas: la hora vale 31,25, y dos horas son 62,50.
    expect(porUnidad.hora_extra).toMatchObject({ cantidad: 2, precio_unitario: 31.25, monto: 62.5 });
    expect(r.total).toBe(1562.5);
  });

  it('sin cantidad pactada no inventa el excedente y avisa', () => {
    const r = calcularLiquidacionDelCliente({
      periodo: PERIODO,
      medicion: 'pactado_mas_excedente',
      prestaciones: [prestacion({ configuracion: {} })],
      guardias: [guardia('2026-11-02')],
    });
    expect(r.total).toBe(1000);
    expect(r.sinCantidadPactada).toEqual(['pre-1']);
  });
});

describe('por hora', () => {
  it('cobra horas más horas extra al precio de la prestación', () => {
    const r = calcularLiquidacionDelCliente({
      periodo: PERIODO,
      medicion: 'hora',
      prestaciones: [prestacion({ precio_final: 10 })],
      guardias: [guardia('2026-11-02'), guardia('2026-11-03', { horas: 12, horas_extra: 1.5 })],
    });
    expect(r.renglones).toEqual([
      expect.objectContaining({ unidad: 'hora', cantidad: 21.5, precio_unitario: 10, monto: 215 }),
    ]);
  });

  it('una guardia de dos Pacientes reparte las horas y no las cobra dos veces', () => {
    const r = calcularLiquidacionDelCliente({
      periodo: PERIODO,
      medicion: 'hora',
      prestaciones: [prestacion({ precio_final: 10 }), prestacion({ id: 'pre-2', paciente_id: 'pac-2', precio_final: 10 })],
      guardias: [guardia('2026-11-02', { pacientes: ['pac-1', 'pac-2'] })],
    });
    expect(r.renglones.map((x) => x.cantidad)).toEqual([4, 4]);
    expect(r.total).toBe(80);
  });
});

describe('por día de guardia', () => {
  it('cuenta días calendario distintos, y la guardia de 48 horas cubre dos', () => {
    const r = calcularLiquidacionDelCliente({
      periodo: PERIODO,
      medicion: 'dia_de_guardia',
      prestaciones: [prestacion({ precio_final: 100 })],
      guardias: [guardia('2026-11-02'), guardia('2026-11-02', { id: 'otra' }), guardia('2026-11-10', { horas: 48 })],
    });
    expect(r.renglones[0]).toMatchObject({ unidad: 'dia_de_guardia', cantidad: 3, monto: 300 });
  });
});

describe('la prestación vigente el día de la guardia', () => {
  it('un cambio de precio a mitad de período cobra cada guardia a su precio', () => {
    const r = calcularLiquidacionDelCliente({
      periodo: PERIODO,
      medicion: 'hora',
      prestaciones: [
        prestacion({ precio_final: 10, vigente_hasta: '2026-11-15' }),
        prestacion({ id: 'pre-nueva', precio_final: 20, vigente_desde: '2026-11-16' }),
      ],
      guardias: [guardia('2026-11-10'), guardia('2026-11-20')],
    });
    expect(r.renglones.map((x) => [x.prestacion_id, x.monto])).toEqual([
      ['pre-1', 80],
      ['pre-nueva', 160],
    ]);
  });

  it('sin prestación vigente la guardia queda sin asignar; con dos, ambigua', () => {
    const r = calcularLiquidacionDelCliente({
      periodo: PERIODO,
      medicion: 'hora',
      prestaciones: [
        prestacion({ vigente_desde: '2026-11-10' }),
        prestacion({ id: 'pre-doble', vigente_desde: '2026-11-20' }),
      ],
      guardias: [guardia('2026-11-05'), guardia('2026-11-25'), guardia('2026-11-12', { servicio_id: 'otro-servicio' })],
    });
    expect(r.guardiasSinAsignar).toBe(2);
    expect(r.guardiasAmbiguas).toBe(1);
    expect(r.total).toBe(0);
  });

  it('una guardia fuera del período no se cobra', () => {
    const r = calcularLiquidacionDelCliente({
      periodo: PERIODO,
      medicion: 'hora',
      prestaciones: [prestacion()],
      guardias: [guardia('2026-12-01')],
    });
    expect(r.renglones).toEqual([]);
  });
});

describe('lo que no se calcula', () => {
  it('una medición desconocida no cobra nada y lo dice', () => {
    const r = calcularLiquidacionDelCliente({ periodo: PERIODO, medicion: 'por_kilo', prestaciones: [prestacion()] });
    expect(r.medicionDesconocida).toBe(true);
    expect(r.renglones).toEqual([]);
  });

  it('una prestación sin precio no se cobra en cero: se avisa', () => {
    const r = calcularLiquidacionDelCliente({
      periodo: PERIODO,
      medicion: 'pactado_mas_excedente',
      prestaciones: [prestacion({ precio_final: null })],
    });
    expect(r.sinPrecio).toEqual(['pre-1']);
    expect(r.renglones).toEqual([]);
  });

  it('dos monedas en el mismo Servicio salen las dos', () => {
    const r = calcularLiquidacionDelCliente({
      periodo: PERIODO,
      medicion: 'pactado_mas_excedente',
      prestaciones: [prestacion(), prestacion({ id: 'pre-usd', paciente_id: 'pac-2', moneda: 'USD' })],
    });
    expect(r.monedas.sort()).toEqual(['ARS', 'USD']);
  });
});

describe('el cambio de precio a mitad de período, en lo pactado', () => {
  const cadena = (extraNueva = {}) => [
    prestacion({ vigente_hasta: '2026-11-15' }),
    prestacion({ id: 'pre-nueva', precio_final: 2000, vigente_desde: '2026-11-16', prestacion_anterior_id: 'pre-1', ...extraNueva }),
  ];

  it('se prorratea por días de vigencia: quince días a 1000 y quince a 2000 dan 1500, no 3000', () => {
    const r = calcularLiquidacionDelCliente({
      periodo: PERIODO,
      medicion: 'pactado_mas_excedente',
      prestaciones: cadena(),
      guardias: [],
    });
    expect(r.renglones.map((x) => [x.prestacion_id, x.cantidad, x.monto])).toEqual([
      ['pre-1', 0.5, 500],
      ['pre-nueva', 0.5, 1000],
    ]);
    expect(r.total).toBe(1500);
  });

  it('el excedente se cuenta sobre la cadena entera, y cada guardia de más va al precio de su día', () => {
    const r = calcularLiquidacionDelCliente({
      periodo: PERIODO,
      medicion: 'pactado_mas_excedente',
      prestaciones: cadena(),
      guardias: [
        guardia('2026-11-02'),
        guardia('2026-11-09'),
        guardia('2026-11-17'),
        guardia('2026-11-20'),
        guardia('2026-11-24'),
        guardia('2026-11-27'),
      ],
    });
    // Lo pactado de la cadena es 4 (la mitad de 4 más la mitad de 4): sobran dos, las últimas,
    // que caen en la prestación nueva y valen 2000 / 4 cada una.
    const excedente = r.renglones.filter((x) => x.unidad === 'guardia');
    expect(excedente).toEqual([expect.objectContaining({ prestacion_id: 'pre-nueva', cantidad: 2, precio_unitario: 500, monto: 1000 })]);
    expect(r.total).toBe(2500);
  });

  it('si a un eslabón le falta la cantidad pactada, no se inventa el excedente de la cadena', () => {
    const r = calcularLiquidacionDelCliente({
      periodo: PERIODO,
      medicion: 'pactado_mas_excedente',
      prestaciones: cadena({ configuracion: {} }),
      guardias: ['2026-11-02', '2026-11-05', '2026-11-09', '2026-11-12', '2026-11-17', '2026-11-27'].map((f) => guardia(f)),
    });
    // El primer eslabón sí tiene la cantidad, y aun así no se le cobra excedente: sin la del
    // segundo, lo pactado de la cadena no se puede saber.
    expect(r.renglones.filter((x) => x.unidad === 'guardia')).toEqual([]);
    expect(r.sinCantidadPactada.sort()).toEqual(['pre-1', 'pre-nueva']);
    expect(r.total).toBe(1500);
  });

  it('la prestación que arranca a mitad de período y no cambia se cobra entera', () => {
    const r = calcularLiquidacionDelCliente({
      periodo: PERIODO,
      medicion: 'pactado_mas_excedente',
      prestaciones: [prestacion({ vigente_desde: '2026-11-16' })],
    });
    expect(r.total).toBe(1000);
  });
});
