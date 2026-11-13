/**
 * Lo que se revisa antes de pedirle a la base una actualización de precios.
 *
 *   node --test src/utils/__tests__/actualizacionDePrecios.test.js
 *
 * Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  errorDeLaBase,
  esLoteDePersonas,
  fechaDelDia,
  mapeoPropuestoDeLaLista,
  pedidoDeActualizacionPorIndice,
  periodoDelMes,
  renglonDeLaActualizacion,
  renglonesDeLaLista,
  valorDeIndiceDelPedido,
  valorPositivo,
} from '../actualizacionDePrecios.js';

function motivoDe(fn) {
  try {
    fn();
  } catch (error) {
    return error.motivo;
  }
  return 'no lanzó';
}

describe('fechas y números', () => {
  it('lleva cualquier día al primero de su mes', () => {
    assert.equal(periodoDelMes('2026-10'), '2026-10-01');
    assert.equal(periodoDelMes('2026-10-17'), '2026-10-01');
    assert.equal(periodoDelMes('2026-13'), null);
    assert.equal(periodoDelMes('2026-02-30'), null);
    assert.equal(periodoDelMes('octubre'), null);
  });

  it('acepta sólo días que existen', () => {
    assert.equal(fechaDelDia('2028-02-29'), '2028-02-29');
    assert.equal(fechaDelDia('2027-02-29'), null);
    assert.equal(fechaDelDia('2026-10'), null);
  });

  it('entiende el punto y la coma decimal, y rechaza cero y negativos', () => {
    assert.equal(valorPositivo('4200'), 4200);
    assert.equal(valorPositivo('4.200,50'), 4200.5);
    assert.equal(valorPositivo('4200.50'), 4200.5);
    assert.equal(valorPositivo(12.5), 12.5);
    assert.equal(valorPositivo('0'), null);
    assert.equal(valorPositivo('-5'), null);
    assert.equal(valorPositivo('cuatro mil'), null);
    assert.equal(valorPositivo(''), null);
    assert.equal(valorPositivo(null), null);
  });
});

describe('valorDeIndiceDelPedido', () => {
  it('devuelve el mes y el valor', () => {
    assert.deepEqual(valorDeIndiceDelPedido({ periodo: '2026-11', valor: '13000,5' }), { periodo: '2026-11-01', valor: 13000.5 });
  });

  it('distingue lo que falta de lo que está mal', () => {
    assert.equal(motivoDe(() => valorDeIndiceDelPedido({ periodo: '2026-11' })), 'faltan_datos');
    assert.equal(motivoDe(() => valorDeIndiceDelPedido({ periodo: '2026-11', valor: '0' })), 'dato_invalido');
    assert.equal(motivoDe(() => valorDeIndiceDelPedido({ periodo: 'noviembre', valor: '10' })), 'dato_invalido');
  });
});

describe('pedidoDeActualizacionPorIndice', () => {
  const bien = { desde: '2026-12-01', periodoBase: '2026-09', periodoNuevo: '2026-10' };

  it('arma los argumentos de la función de la base', () => {
    assert.deepEqual(pedidoDeActualizacionPorIndice(bien, true), {
      p_desde: '2026-12-01', p_periodo_base: '2026-09-01', p_periodo_nuevo: '2026-10-01', p_aplicar: true,
    });
  });

  it('sólo aplica si se lo pide con true', () => {
    assert.equal(pedidoDeActualizacionPorIndice(bien, 'true').p_aplicar, false);
    assert.equal(pedidoDeActualizacionPorIndice(bien, false).p_aplicar, false);
  });

  it('rige desde el día 1 de un mes', () => {
    assert.equal(motivoDe(() => pedidoDeActualizacionPorIndice({ ...bien, desde: '2026-12-15' }, false)), 'dato_invalido');
  });

  it('el período nuevo va después del de base', () => {
    assert.equal(motivoDe(() => pedidoDeActualizacionPorIndice({ ...bien, periodoNuevo: '2026-09' }, false)), 'dato_invalido');
    assert.equal(motivoDe(() => pedidoDeActualizacionPorIndice({ ...bien, periodoNuevo: '2026-08' }, false)), 'dato_invalido');
  });

  it('falta un dato', () => {
    assert.equal(motivoDe(() => pedidoDeActualizacionPorIndice({ desde: '2026-12-01' }, false)), 'faltan_datos');
    assert.equal(motivoDe(() => pedidoDeActualizacionPorIndice(undefined, false)), 'faltan_datos');
  });
});

describe('renglonDeLaActualizacion', () => {
  it('pasa los números a número y deja vacío lo que no hay', () => {
    assert.deepEqual(renglonDeLaActualizacion({
      clase: 'lista', renglon_id: 7, renglon_nuevo_id: null, servicio_id: null, descripcion: 'Acompañamiento — Por hora',
      indice: 'ipc_indec_nacional', precio_actual: '4200', precio_nuevo: null, moneda: 'ARS',
    }), {
      clase: 'lista', renglonId: 7, renglonNuevoId: null, servicioId: null, descripcion: 'Acompañamiento — Por hora',
      indice: 'ipc_indec_nacional', precioActual: 4200, precioNuevo: null, moneda: 'ARS',
    });
  });
});

describe('la importación de una lista de precios', () => {
  it('propone las columnas por el nombre del encabezado, sin repetir ninguna', () => {
    assert.deepEqual(mapeoPropuestoDeLaLista(['Tipo de servicio', 'Modalidad', 'Precio']), {
      tipo_servicio: 'Tipo de servicio', modalidad: 'Modalidad', precio: 'Precio',
    });
    assert.deepEqual(mapeoPropuestoDeLaLista(['Serviço', 'Unidade', 'Preço']), {
      tipo_servicio: 'Serviço', modalidad: 'Unidade', precio: 'Preço',
    });
    assert.deepEqual(mapeoPropuestoDeLaLista(['Columna A', 'Columna B']), {
      tipo_servicio: null, modalidad: null, precio: null,
    });
  });

  it('arma cada renglón con su número de fila de la planilla', () => {
    const mapeo = { tipo_servicio: 'Servicio', modalidad: 'Modo', precio: 'Valor' };
    const filas = [
      { Servicio: ' Acompañamiento ', Modo: 'Por hora', Valor: '4.500,00' },
      { Servicio: 'Acompañamiento', Modo: 'Por día', Valor: 'consultar' },
    ];
    assert.deepEqual(renglonesDeLaLista(filas, mapeo), [
      { fila: 2, tipo_servicio: 'Acompañamiento', modalidad: 'Por hora', precio: 4500 },
      { fila: 3, tipo_servicio: 'Acompañamiento', modalidad: 'Por día', precio: null },
    ]);
  });

  it('no arma nada si falta elegir una columna', () => {
    assert.equal(motivoDe(() => renglonesDeLaLista([], { tipo_servicio: 'a', modalidad: 'b' })), 'faltan_datos');
  });

  it('sólo los lotes de personas se conforman o se rechazan', () => {
    assert.equal(esLoteDePersonas({ tipo: 'asistente' }), true);
    assert.equal(esLoteDePersonas({ tipo: 'cliente' }), true);
    assert.equal(esLoteDePersonas({ tipo: 'lista_precios' }), false);
    assert.equal(esLoteDePersonas(null), false);
  });
});

describe('errorDeLaBase', () => {
  it('lleva el motivo que levanta la función', () => {
    const { error, estado } = errorDeLaBase({ message: 'fecha_anterior', code: 'P0001' });
    assert.equal(error.motivo, 'fecha_anterior');
    assert.equal(estado, 400);
  });

  it('no deja salir un texto de Postgres', () => {
    const { error, estado } = errorDeLaBase({ message: 'new row violates row-level security policy for table "lista_precios"' });
    assert.equal(error.motivo, undefined);
    assert.equal(estado, 500);
  });
});
