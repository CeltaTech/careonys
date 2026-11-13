import { describe, it, expect } from 'vitest';
import {
  AVISOS_DE_LA_PROMOCION as A,
  admitePromocion,
  avisosDeLaPromocion,
  conSusPromociones,
  esPromocion,
  pedidoDeLaPromocion,
  promocionRige,
  promocionVacia,
} from '../promocionDeLista.js';

const HOY = '2027-04-10';
const BASE = { id: 7, tipo_servicio: 'Acompañamiento', modalidad: 'Por hora', precio: 1000, vigente_desde: '2027-01-01', vigente_hasta: null, activo: true, promocion_de: null };

describe('promocionDeLista — a qué se le carga', () => {
  it('sólo a un precio de siempre abierto y activo', () => {
    expect(admitePromocion(BASE)).toBe(true);
    expect(admitePromocion({ ...BASE, vigente_hasta: '2027-03-31' })).toBe(false);
    expect(admitePromocion({ ...BASE, activo: false })).toBe(false);
    expect(admitePromocion({ ...BASE, promocion_de: 3, vigente_hasta: '2027-05-01' })).toBe(false);
    expect(admitePromocion(null)).toBe(false);
  });

  it('reconoce la promoción por su precio de siempre', () => {
    expect(esPromocion(BASE)).toBe(false);
    expect(esPromocion({ promocion_de: 7 })).toBe(true);
  });
});

describe('promocionDeLista — avisos', () => {
  it('formulario vacío: los tres obligatorios, en orden', () => {
    const avisos = avisosDeLaPromocion({ precio: '', vigente_desde: '', vigente_hasta: '' }, BASE);
    expect(Object.keys(avisos)).toEqual(['precio', 'vigente_desde', 'vigente_hasta']);
    expect(Object.values(avisos).every((a) => a === A.FALTA)).toBe(true);
  });

  it('completo, sin avisos; el mismo día de comienzo y fin vale', () => {
    expect(avisosDeLaPromocion({ precio: '800', vigente_desde: HOY, vigente_hasta: HOY }, BASE)).toEqual({});
  });

  it('precio cero o negativo', () => {
    expect(avisosDeLaPromocion({ precio: '0', vigente_desde: HOY, vigente_hasta: '2027-05-01' }, BASE).precio).toBe(A.PRECIO_NO_POSITIVO);
    expect(avisosDeLaPromocion({ precio: '-1', vigente_desde: HOY, vigente_hasta: '2027-05-01' }, BASE).precio).toBe(A.PRECIO_NO_POSITIVO);
  });

  it('no empieza antes que el precio de siempre', () => {
    expect(avisosDeLaPromocion({ precio: '800', vigente_desde: '2026-12-31', vigente_hasta: '2027-05-01' }, BASE).vigente_desde).toBe(A.FECHA_ANTERIOR);
  });

  it('la fecha de fin no es anterior al comienzo', () => {
    const avisos = avisosDeLaPromocion({ precio: '800', vigente_desde: '2027-05-01', vigente_hasta: '2027-04-30' }, BASE);
    expect(avisos).toEqual({ vigente_hasta: A.FECHAS_AL_REVES });
  });

  it('con varios avisos el primero es el del primer casillero', () => {
    const avisos = avisosDeLaPromocion({ precio: '0', vigente_desde: '2027-05-01', vigente_hasta: '2027-04-01' }, BASE);
    expect(Object.keys(avisos)).toEqual(['precio', 'vigente_hasta']);
  });
});

describe('promocionDeLista — pedido y vigencia', () => {
  it('arma los parámetros de la función de la base', () => {
    expect(pedidoDeLaPromocion({ precio: '850.5', vigente_desde: HOY, vigente_hasta: '2027-04-30' }, BASE)).toEqual({
      p_precio_id: 7,
      p_precio: 850.5,
      p_desde: HOY,
      p_hasta: '2027-04-30',
    });
  });

  it('arranca hoy, o el día que empieza el precio de siempre si es más adelante', () => {
    expect(promocionVacia(BASE, HOY).vigente_desde).toBe(HOY);
    expect(promocionVacia({ ...BASE, vigente_desde: '2027-06-01' }, HOY).vigente_desde).toBe('2027-06-01');
  });

  it('rige entre sus dos fechas, ambas incluidas', () => {
    const promo = { ...BASE, id: 8, promocion_de: 7, vigente_desde: '2027-04-01', vigente_hasta: '2027-04-10' };
    expect(promocionRige(promo, '2027-03-31')).toBe(false);
    expect(promocionRige(promo, '2027-04-01')).toBe(true);
    expect(promocionRige(promo, '2027-04-10')).toBe(true);
    expect(promocionRige(promo, '2027-04-11')).toBe(false);
    expect(promocionRige({ ...promo, activo: false }, '2027-04-05')).toBe(false);
    expect(promocionRige(BASE, '2027-04-05')).toBe(false);
  });
});

describe('promocionDeLista — orden en la lista', () => {
  it('cada promoción va debajo de su precio, por fecha de comienzo; las sueltas al final', () => {
    const otro = { ...BASE, id: 9 };
    const p2 = { id: 11, promocion_de: 7, vigente_desde: '2027-06-01', vigente_hasta: '2027-06-30' };
    const p1 = { id: 10, promocion_de: 7, vigente_desde: '2027-05-01', vigente_hasta: '2027-05-31' };
    const suelta = { id: 12, promocion_de: 99, vigente_desde: '2027-05-01', vigente_hasta: '2027-05-31' };
    const ids = conSusPromociones([p2, BASE, suelta, otro, p1]).map((f) => f.id);
    expect(ids).toEqual([7, 10, 11, 9, 12]);
  });

  it('sin filas, lista vacía', () => {
    expect(conSusPromociones(undefined)).toEqual([]);
  });
});
