/**
 * Las condiciones con las que se le cobra a cada Cliente, en tres capas.
 *
 *   npx vitest run src/lib/__tests__/condicionesDelCliente.test.js
 *
 * Qué daría con el sistema roto: si una capa vacía pisara a la de arriba, un Servicio sin nada
 * propio quedaría sin frecuencia; si un valor fuera de la lista se aceptara, una fila mal cargada
 * dejaría una factura sin forma de calcularse. Las dos cosas fallan acá.
 */
import { describe, expect, it } from 'vitest';
import {
  FORMAS_DE_ACTUALIZACION,
  FORMAS_DE_PRECIO,
  FRECUENCIAS_DE_COBRO_AL_CLIENTE,
  MEDICIONES,
  VALORES_DE_FABRICA_DEL_CLIENTE,
  condicionDe,
  condicionDelServicioQueSePuedeGuardar,
  condicionesDe,
  condicionesQueSePuedenGuardar,
} from '../condicionesDelCliente';

describe('los nombres guardados', () => {
  it('son los del contrato y no cambian', () => {
    expect(Object.values(FORMAS_DE_PRECIO)).toEqual(['lista', 'directo']);
    expect(Object.values(FRECUENCIAS_DE_COBRO_AL_CLIENTE)).toEqual(['dia', 'semana', 'quincena', 'mes']);
    expect(Object.values(MEDICIONES)).toEqual(['pactado_mas_excedente', 'hora', 'dia_de_guardia']);
    expect(Object.values(FORMAS_DE_ACTUALIZACION)).toEqual(['manual', 'importacion', 'indice']);
  });

  it('los de fábrica son los del contrato', () => {
    expect(VALORES_DE_FABRICA_DEL_CLIENTE).toEqual({
      forma_de_precio: 'directo',
      frecuencia_de_cobro: 'mes',
      medicion: 'pactado_mas_excedente',
      forma_de_actualizacion: 'manual',
      indice_de_actualizacion: null,
    });
  });
});

describe('condicionDe', () => {
  it('sin nada cargado rige lo de fábrica', () => {
    expect(condicionDe('frecuencia_de_cobro', null, null)).toBe('mes');
    expect(condicionDe('medicion', {}, {})).toBe('pactado_mas_excedente');
  });

  it('la Prestadora pisa a fábrica y el Servicio pisa a la Prestadora', () => {
    expect(condicionDe('frecuencia_de_cobro', { frecuencia_de_cobro: 'semana' }, null)).toBe('semana');
    expect(condicionDe('frecuencia_de_cobro', { frecuencia_de_cobro: 'semana' }, { frecuencia_de_cobro: 'dia' })).toBe('dia');
  });

  it('un vacío del Servicio deja la de la Prestadora', () => {
    expect(condicionDe('medicion', { medicion: 'hora' }, { medicion: null })).toBe('hora');
    expect(condicionDe('medicion', { medicion: 'hora' }, { medicion: '' })).toBe('hora');
  });

  it('un valor fuera de la lista se ignora', () => {
    expect(condicionDe('medicion', { medicion: 'por_kilo' }, null)).toBe('pactado_mas_excedente');
    expect(condicionDe('frecuencia_de_cobro', null, { frecuencia_de_cobro: 'anio' })).toBe('mes');
  });

  it('una clave que no existe no devuelve nada', () => {
    expect(condicionDe('descuento', { descuento: 'todo' }, null)).toBeUndefined();
  });

  it('el índice sólo rige con la forma índice', () => {
    expect(condicionDe('indice_de_actualizacion', { indice_de_actualizacion: 'ipc_ficticio' }, null)).toBeNull();
    expect(
      condicionDe('indice_de_actualizacion', { forma_de_actualizacion: 'indice', indice_de_actualizacion: 'ipc_ficticio' }, null)
    ).toBe('ipc_ficticio');
  });

  it('condicionesDe arma las cinco', () => {
    expect(condicionesDe({ medicion: 'hora' }, { frecuencia_de_cobro: 'quincena' })).toEqual({
      forma_de_precio: 'directo',
      frecuencia_de_cobro: 'quincena',
      medicion: 'hora',
      forma_de_actualizacion: 'manual',
      indice_de_actualizacion: null,
    });
  });
});

describe('condicionesQueSePuedenGuardar', () => {
  it('sólo guarda lo que difiere de fábrica', () => {
    expect(condicionesQueSePuedenGuardar({ frecuencia_de_cobro: 'mes', medicion: 'hora' })).toEqual({
      ok: true,
      valor: { medicion: 'hora' },
    });
  });

  it('rechaza un valor fuera de la lista y dice cuál', () => {
    expect(condicionesQueSePuedenGuardar({ frecuencia_de_cobro: 'bimestre' })).toEqual({ ok: false, clave: 'frecuencia_de_cobro' });
  });

  it('la forma índice pide el índice', () => {
    expect(condicionesQueSePuedenGuardar({ forma_de_actualizacion: 'indice' })).toEqual({ ok: false, clave: 'indice_de_actualizacion' });
    expect(condicionesQueSePuedenGuardar({ forma_de_actualizacion: 'indice', indice_de_actualizacion: 'ipc_ficticio' })).toEqual({
      ok: true,
      valor: { forma_de_actualizacion: 'indice', indice_de_actualizacion: 'ipc_ficticio' },
    });
  });

  it('sin la forma índice el índice no se guarda', () => {
    expect(condicionesQueSePuedenGuardar({ forma_de_actualizacion: 'manual', indice_de_actualizacion: 'ipc_ficticio' })).toEqual({
      ok: true,
      valor: {},
    });
  });
});

describe('condicionDelServicioQueSePuedeGuardar', () => {
  it('vacío se guarda como null', () => {
    expect(condicionDelServicioQueSePuedeGuardar('medicion', '')).toEqual({ ok: true, valor: null });
  });
  it('un valor de la lista se guarda tal cual, y uno de afuera no', () => {
    expect(condicionDelServicioQueSePuedeGuardar('medicion', 'hora')).toEqual({ ok: true, valor: 'hora' });
    expect(condicionDelServicioQueSePuedeGuardar('medicion', 'minuto').ok).toBe(false);
  });
});
