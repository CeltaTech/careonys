/**
 * Las condiciones con las que se le cobra a cada Cliente, en tres capas.
 *
 *   npx vitest run src/lib/__tests__/condicionesDelCliente.test.js
 *
 * Qué daría con el sistema roto: si una capa vacía pisara a la de arriba, un Servicio sin nada
 * propio quedaría sin frecuencia; si un valor fuera de la lista se aceptara, una fila mal cargada
 * dejaría una factura sin forma de calcularse; si un «no» del Servicio se tomara como vacío, no
 * se podría apagar lo que la Prestadora encendió. Las tres cosas fallan acá.
 */
import { describe, expect, it } from 'vitest';
import {
  AJUSTES_POR_INDICE,
  CLAVES_ENTERAS,
  CLAVES_SI_NO,
  FORMAS_DE_PRECIO,
  FRECUENCIAS_DE_COBRO_AL_CLIENTE,
  MEDICIONES,
  SIN_INDICE,
  VALORES_DE_FABRICA_DEL_CLIENTE,
  condicionDe,
  condicionDelServicioQueSePuedeGuardar,
  condicionesDe,
  condicionesQueSePuedenGuardar,
  esValorDeLaCondicion,
  leerValorDeLaCondicion,
} from '../condicionesDelCliente';

const FABRICA = {
  forma_de_precio: 'directo',
  frecuencia_de_cobro: 'mes',
  medicion: 'pactado_mas_excedente',
  cobra_cancelada_por_el_cliente: true,
  descuenta_lo_no_prestado: true,
  cobra_guardias_adicionales: true,
  cobra_horas_adicionales: true,
  indice_de_actualizacion: null,
  meses_entre_actualizaciones: 1,
  ajuste_por_indice: 'revision_previa',
};

describe('los nombres guardados', () => {
  it('son los del contrato y no cambian', () => {
    expect(Object.values(FORMAS_DE_PRECIO)).toEqual(['lista', 'directo']);
    expect(Object.values(FRECUENCIAS_DE_COBRO_AL_CLIENTE)).toEqual(['dia', 'semana', 'quincena', 'mes']);
    expect(Object.values(MEDICIONES)).toEqual(['pactado_mas_excedente', 'hora', 'dia_de_guardia']);
    expect(Object.values(AJUSTES_POR_INDICE)).toEqual(['automatico', 'revision_previa']);
    expect(SIN_INDICE).toBe('ninguno');
  });

  it('los de fábrica son los del contrato', () => {
    expect(VALORES_DE_FABRICA_DEL_CLIENTE).toEqual(FABRICA);
  });

  it('separa las claves sí o no y las enteras', () => {
    expect(CLAVES_SI_NO).toEqual([
      'cobra_cancelada_por_el_cliente',
      'descuenta_lo_no_prestado',
      'cobra_guardias_adicionales',
      'cobra_horas_adicionales',
    ]);
    expect(CLAVES_ENTERAS).toEqual(['meses_entre_actualizaciones']);
  });
});

describe('esValorDeLaCondicion', () => {
  it('sí o no acepta sólo booleanos', () => {
    expect(esValorDeLaCondicion('descuenta_lo_no_prestado', false)).toBe(true);
    expect(esValorDeLaCondicion('descuenta_lo_no_prestado', 'false')).toBe(false);
    expect(esValorDeLaCondicion('descuenta_lo_no_prestado', 0)).toBe(false);
  });

  it('los enteros respetan sus bordes; los meses, sólo mensual, trimestral o semestral', () => {
    expect(esValorDeLaCondicion('meses_entre_actualizaciones', 1)).toBe(true);
    expect(esValorDeLaCondicion('meses_entre_actualizaciones', 3)).toBe(true);
    expect(esValorDeLaCondicion('meses_entre_actualizaciones', 6)).toBe(true);
    expect(esValorDeLaCondicion('meses_entre_actualizaciones', 2)).toBe(false);
    expect(esValorDeLaCondicion('meses_entre_actualizaciones', 24)).toBe(false);
    expect(esValorDeLaCondicion('meses_entre_actualizaciones', 0)).toBe(false);
    expect(esValorDeLaCondicion('meses_entre_actualizaciones', 1.5)).toBe(false);
  });

  it('una clave que no existe no acepta nada', () => {
    expect(esValorDeLaCondicion('forma_de_actualizacion', 'manual')).toBe(false);
  });
});

describe('leerValorDeLaCondicion', () => {
  it('pasa el texto de un casillero a su clase de valor', () => {
    expect(leerValorDeLaCondicion('cobra_horas_adicionales', 'false')).toBe(false);
    expect(leerValorDeLaCondicion('cobra_horas_adicionales', 'true')).toBe(true);
    expect(leerValorDeLaCondicion('meses_entre_actualizaciones', '6')).toBe(6);
    expect(leerValorDeLaCondicion('medicion', 'hora')).toBe('hora');
    expect(leerValorDeLaCondicion('medicion', '')).toBeNull();
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

  it('un «no» del Servicio apaga lo que la Prestadora encendió', () => {
    expect(condicionDe('descuenta_lo_no_prestado', { descuenta_lo_no_prestado: true }, { descuenta_lo_no_prestado: false })).toBe(false);
  });

  it('un vacío del Servicio deja la de la Prestadora', () => {
    expect(condicionDe('medicion', { medicion: 'hora' }, { medicion: null })).toBe('hora');
    expect(condicionDe('medicion', { medicion: 'hora' }, { medicion: '' })).toBe('hora');
    expect(condicionDe('cobra_horas_adicionales', { cobra_horas_adicionales: false }, { cobra_horas_adicionales: null })).toBe(false);
  });

  it('un valor que no sirve se ignora', () => {
    expect(condicionDe('medicion', { medicion: 'por_kilo' }, null)).toBe('pactado_mas_excedente');
    expect(condicionDe('frecuencia_de_cobro', null, { frecuencia_de_cobro: 'anio' })).toBe('mes');
    expect(condicionDe('meses_entre_actualizaciones', { meses_entre_actualizaciones: 99 }, null)).toBe(1);
  });

  it('una clave que no existe no devuelve nada', () => {
    expect(condicionDe('descuento', { descuento: 'todo' }, null)).toBeUndefined();
  });

  it('el índice de la Prestadora rige, y el Servicio lo puede anular', () => {
    expect(condicionDe('indice_de_actualizacion', { indice_de_actualizacion: 'ipc_ficticio' }, null)).toBe('ipc_ficticio');
    expect(condicionDe('indice_de_actualizacion', { indice_de_actualizacion: 'ipc_ficticio' }, { indice_de_actualizacion: 'ninguno' })).toBeNull();
    expect(condicionDe('indice_de_actualizacion', null, { indice_de_actualizacion: 'otro_ficticio' })).toBe('otro_ficticio');
  });

  it('condicionesDe arma todas', () => {
    expect(condicionesDe({ medicion: 'hora' }, { frecuencia_de_cobro: 'quincena' })).toEqual({
      ...FABRICA,
      frecuencia_de_cobro: 'quincena',
      medicion: 'hora',
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

  it('lee el texto de los casilleros', () => {
    expect(
      condicionesQueSePuedenGuardar({ descuenta_lo_no_prestado: 'false', meses_entre_actualizaciones: '3', ajuste_por_indice: 'automatico' })
    ).toEqual({ ok: true, valor: { descuenta_lo_no_prestado: false, meses_entre_actualizaciones: 3, ajuste_por_indice: 'automatico' } });
  });

  it('rechaza un valor que no sirve y dice cuál', () => {
    expect(condicionesQueSePuedenGuardar({ frecuencia_de_cobro: 'bimestre' })).toEqual({ ok: false, clave: 'frecuencia_de_cobro' });
    expect(condicionesQueSePuedenGuardar({ meses_entre_actualizaciones: '24' })).toEqual({ ok: false, clave: 'meses_entre_actualizaciones' });
  });

  it('«sin índice» es lo de fábrica y no se guarda', () => {
    expect(condicionesQueSePuedenGuardar({ indice_de_actualizacion: 'ninguno' })).toEqual({ ok: true, valor: {} });
    expect(condicionesQueSePuedenGuardar({ indice_de_actualizacion: 'ipc_ficticio' })).toEqual({
      ok: true,
      valor: { indice_de_actualizacion: 'ipc_ficticio' },
    });
  });
});

describe('condicionDelServicioQueSePuedeGuardar', () => {
  it('vacío se guarda como null', () => {
    expect(condicionDelServicioQueSePuedeGuardar('medicion', '')).toEqual({ ok: true, valor: null });
  });

  it('un valor que sirve se guarda, y uno que no, no', () => {
    expect(condicionDelServicioQueSePuedeGuardar('medicion', 'hora')).toEqual({ ok: true, valor: 'hora' });
    expect(condicionDelServicioQueSePuedeGuardar('medicion', 'minuto').ok).toBe(false);
  });

  it('elegir lo que ya rige desde arriba no es propio del Servicio', () => {
    expect(condicionDelServicioQueSePuedeGuardar('medicion', 'hora', { medicion: 'hora' })).toEqual({ ok: true, valor: null });
    expect(condicionDelServicioQueSePuedeGuardar('medicion', 'pactado_mas_excedente', {})).toEqual({ ok: true, valor: null });
    expect(condicionDelServicioQueSePuedeGuardar('cobra_horas_adicionales', 'false', {})).toEqual({ ok: true, valor: false });
    expect(condicionDelServicioQueSePuedeGuardar('indice_de_actualizacion', 'ninguno', {})).toEqual({ ok: true, valor: null });
    expect(condicionDelServicioQueSePuedeGuardar('indice_de_actualizacion', 'ninguno', { indice_de_actualizacion: 'ipc_ficticio' })).toEqual({
      ok: true,
      valor: 'ninguno',
    });
  });
});
