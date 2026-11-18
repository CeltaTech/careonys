import { describe, it, expect } from 'vitest';
import {
  ALTA_VACIA,
  cuerpoDelAlta,
  faltantesDelAlta,
  hastaAntesDelDesde,
  hastaParaGuardar,
  separarPorVigencia,
} from '../responsableDePagosDelServicio';

const PERSONA = '00000000-0000-0000-0000-0000000000a1';
const HOY = '2026-11-18';

describe('qué Responsables de pagos rigen y cuáles terminaron', () => {
  const sinFin = { id: 'a', vigente_desde: '2026-01-01', vigente_hasta: null };
  const terminaHoy = { id: 'b', vigente_desde: '2026-03-01', vigente_hasta: HOY };
  const terminoAyer = { id: 'c', vigente_desde: '2026-02-01', vigente_hasta: '2026-11-17' };
  const terminoAntes = { id: 'd', vigente_desde: '2025-01-01', vigente_hasta: '2025-12-31' };
  const empiezaDespues = { id: 'e', vigente_desde: '2027-01-01', vigente_hasta: null };

  const { vigentes, anteriores } = separarPorVigencia(
    [terminoAntes, empiezaDespues, terminaHoy, sinFin, terminoAyer],
    HOY,
  );

  it('rige el que no tiene hasta, el que termina hoy y el que todavía no empezó', () => {
    expect(vigentes.map((r) => r.id)).toEqual(['a', 'b', 'e']);
  });

  it('el que terminó antes de hoy es anterior, del más reciente al más viejo', () => {
    expect(anteriores.map((r) => r.id)).toEqual(['c', 'd']);
  });

  it('sin Responsables de pagos no hay ninguno de los dos lados', () => {
    expect(separarPorVigencia(null, HOY)).toEqual({ vigentes: [], anteriores: [] });
  });
});

describe('el alta de un Responsable de pagos', () => {
  it('vacía le faltan la persona y el desde', () => {
    expect(faltantesDelAlta(ALTA_VACIA)).toEqual(['persona_id', 'desde']);
  });

  it('con persona y desde no le falta nada', () => {
    expect(faltantesDelAlta({ ...ALTA_VACIA, persona_id: PERSONA, desde: HOY })).toEqual([]);
  });

  it('el tipo vacío viaja vacío y la marca apagada viaja apagada', () => {
    expect(cuerpoDelAlta({ ...ALTA_VACIA, persona_id: PERSONA, desde: HOY })).toEqual({
      persona_id: PERSONA,
      tipo: null,
      desde: HOY,
      factura_al_responsable: false,
    });
  });

  it('el tipo y la marca elegidos viajan como se eligieron', () => {
    expect(cuerpoDelAlta({ persona_id: PERSONA, tipo: 'obra_social', desde: HOY, factura_al_responsable: true })).toEqual({
      persona_id: PERSONA,
      tipo: 'obra_social',
      desde: HOY,
      factura_al_responsable: true,
    });
  });
});

describe('el hasta de un Responsable de pagos', () => {
  it('vacío quiere decir que sigue rigiendo', () => {
    expect(hastaParaGuardar('')).toBe(null);
  });

  it('con fecha viaja la fecha', () => {
    expect(hastaParaGuardar(HOY)).toBe(HOY);
  });

  it('anterior al desde se avisa', () => {
    expect(hastaAntesDelDesde('2026-11-18', '2026-11-17')).toBe(true);
  });

  it('el mismo día del desde vale', () => {
    expect(hastaAntesDelDesde(HOY, HOY)).toBe(false);
  });

  it('sin hasta no hay nada que avisar', () => {
    expect(hastaAntesDelDesde(HOY, '')).toBe(false);
  });
});
