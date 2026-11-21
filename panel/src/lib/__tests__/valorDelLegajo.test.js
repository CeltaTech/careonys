import { describe, expect, it } from 'vitest';
import {
  cambiaElValor,
  esRigeDesdeAnterior,
  filaDelValorDelLegajo,
  historiaDelValor,
  revisarRigeDesde,
  valorDeLaFila,
} from '../valorDelLegajo';

// Datos inventados.
const GUARDADO = {
  unidad_medicion: 'hora',
  valor_hora: 1500,
  valor_turno_guardia: null,
  valor_semana: null,
  valor_hora_extra: 2000,
};

describe('cambiaElValor', () => {
  it('lo escrito como texto con el mismo número no es un cambio', () => {
    const escrito = { unidad_medicion: 'hora', valor_hora: '1500', valor_turno_guardia: '', valor_semana: '', valor_hora_extra: '2000' };
    expect(cambiaElValor(GUARDADO, escrito)).toBe(false);
  });

  it('otro importe es un cambio', () => {
    expect(cambiaElValor(GUARDADO, { ...GUARDADO, valor_hora: '1600' })).toBe(true);
    expect(cambiaElValor(GUARDADO, { ...GUARDADO, valor_hora_extra: '' })).toBe(true);
  });

  it('otra unidad es un cambio', () => {
    expect(cambiaElValor(GUARDADO, { ...GUARDADO, unidad_medicion: 'semana' })).toBe(true);
  });

  it('sin valor cargado y sin nada escrito no hay cambio', () => {
    expect(cambiaElValor({}, { unidad_medicion: 'hora', valor_hora: '' })).toBe(false);
  });
});

describe('revisarRigeDesde', () => {
  it('acepta una fecha del día y avisa si falta', () => {
    expect(revisarRigeDesde('2027-03-01')).toBeNull();
    expect(revisarRigeDesde('')).toBe('falta_el_dato');
    expect(revisarRigeDesde(undefined)).toBe('falta_el_dato');
    expect(revisarRigeDesde('01/03/2027')).toBe('falta_el_dato');
  });
});

describe('esRigeDesdeAnterior', () => {
  it('reconoce el rechazo de la base por el comienzo del mensaje', () => {
    expect(esRigeDesdeAnterior({ code: '23514', message: 'rige_desde_anterior: 2027-01-01' })).toBe(true);
    expect(esRigeDesdeAnterior({ code: '23514', message: 'otra cosa' })).toBe(false);
    expect(esRigeDesdeAnterior(null)).toBe(false);
  });
});

describe('filaDelValorDelLegajo', () => {
  const base = {
    asistenteId: 'a-1',
    prestadoraId: 'p-1',
    escrito: { unidad_medicion: 'turno_guardia', valor_hora: '', valor_turno_guardia: '30000', valor_semana: '', valor_hora_extra: '2500' },
    rigeDesde: '2027-05-01',
    frecuenciaPago: {},
  };

  it('con un valor nuevo manda la fecha y los importes como número', () => {
    const fila = filaDelValorDelLegajo({ ...base, cambio: true });
    expect(fila).toMatchObject({
      asistente_id: 'a-1',
      prestadora_id: 'p-1',
      unidad_medicion: 'turno_guardia',
      valor_hora: null,
      valor_turno_guardia: 30000,
      valor_semana: null,
      valor_hora_extra: 2500,
      frecuencia_pago: {},
      rige_desde: '2027-05-01',
    });
    expect(typeof fila.updated_at).toBe('string');
  });

  it('sin cambio de valor no manda la fecha', () => {
    const fila = filaDelValorDelLegajo({ ...base, cambio: false });
    expect('rige_desde' in fila).toBe(false);
  });
});

describe('valorDeLaFila', () => {
  it('devuelve el importe de la unidad de la fila', () => {
    expect(valorDeLaFila({ unidad_medicion: 'semana', valor_hora: 10, valor_semana: '90000' })).toBe(90000);
    expect(valorDeLaFila(null)).toBeNull();
  });
});

describe('historiaDelValor', () => {
  const anteriores = [
    { id: 'v-1', unidad_medicion: 'hora', valor_hora: 1000, valor_hora_extra: 1200, moneda: 'ARS', rige_desde: '2026-01-01', rige_hasta: '2026-06-30' },
    { id: 'v-2', unidad_medicion: 'hora', valor_hora: 1200, valor_hora_extra: 1500, moneda: 'ARS', rige_desde: '2026-07-01', rige_hasta: '2026-12-31' },
  ];

  it('pone primero el vigente y después los anteriores, del más reciente al más viejo', () => {
    const historia = historiaDelValor({
      vigente: { ...GUARDADO, moneda: 'ARS', rige_desde: '2027-01-01' },
      anteriores,
    });
    expect(historia.map((r) => r.clave)).toEqual(['vigente', 'v-2', 'v-1']);
    expect(historia[0]).toMatchObject({ vigente: true, valor: 1500, valor_hora_extra: 2000, rige_hasta: null });
    expect(historia[1]).toMatchObject({ vigente: false, valor: 1200, rige_desde: '2026-07-01', rige_hasta: '2026-12-31' });
  });

  it('sin fecha del vigente muestra sólo los anteriores', () => {
    expect(historiaDelValor({ vigente: { ...GUARDADO }, anteriores }).map((r) => r.clave)).toEqual(['v-2', 'v-1']);
  });

  it('sin nada cargado queda vacía', () => {
    expect(historiaDelValor({ vigente: {}, anteriores: [] })).toEqual([]);
  });
});
