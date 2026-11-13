import { describe, it, expect } from 'vitest';
import {
  calcularPrecioFinal,
  faltantesDelPrecio,
  columnasDelPrecio,
  diaAnterior,
  cambioDePrecioValido,
  idsReemplazados,
  lasQueSeCobranEnElPeriodo,
} from '../precioDeLaPrestacion';

// Datos inventados.
const renglon = { id: 7, tipo_servicio: 'Acompañamiento', modalidad: 'Diurno', precio: 1000 };

describe('calcularPrecioFinal', () => {
  it('desde la lista sin ajuste da el precio de la lista', () => {
    expect(calcularPrecioFinal({ forma: 'lista', precioLista: 1000 })).toBe(1000);
  });

  it('descuento y recargo, por porcentaje y por monto fijo', () => {
    expect(calcularPrecioFinal({ forma: 'lista', precioLista: 1000, sentido: 'descuento', tipo: 'porcentaje', valor: 10 })).toBe(900);
    expect(calcularPrecioFinal({ forma: 'lista', precioLista: 1000, sentido: 'recargo', tipo: 'porcentaje', valor: 10 })).toBe(1100);
    expect(calcularPrecioFinal({ forma: 'lista', precioLista: 1000, sentido: 'descuento', tipo: 'monto_fijo', valor: 250 })).toBe(750);
    expect(calcularPrecioFinal({ forma: 'lista', precioLista: 1000, sentido: 'recargo', tipo: 'monto_fijo', valor: 250 })).toBe(1250);
  });

  it('un descuento no deja el precio por debajo de cero', () => {
    expect(calcularPrecioFinal({ forma: 'lista', precioLista: 100, sentido: 'descuento', tipo: 'monto_fijo', valor: 500 })).toBe(0);
  });

  it('redondea a centavos', () => {
    expect(calcularPrecioFinal({ forma: 'lista', precioLista: 333.33, sentido: 'recargo', tipo: 'porcentaje', valor: 3.3 })).toBe(344.33);
  });

  it('directo da lo escrito, y vacío no es cero', () => {
    expect(calcularPrecioFinal({ forma: 'directo', precioEscrito: '1500.5' })).toBe(1500.5);
    expect(calcularPrecioFinal({ forma: 'directo', precioEscrito: '' })).toBeNull();
    expect(calcularPrecioFinal({ forma: 'directo', precioEscrito: '-1' })).toBeNull();
  });

  it('falla cerrado ante una forma o un ajuste que no existen', () => {
    expect(calcularPrecioFinal({ forma: 'otra', precioLista: 1000 })).toBeNull();
    expect(calcularPrecioFinal({ forma: 'lista', precioLista: 1000, sentido: 'regalo', tipo: 'porcentaje', valor: 1 })).toBeNull();
    expect(calcularPrecioFinal({ forma: 'lista', precioLista: 1000, sentido: 'descuento', tipo: 'otro', valor: 1 })).toBeNull();
    expect(calcularPrecioFinal({ forma: 'lista', precioLista: 1000, sentido: 'descuento', tipo: 'porcentaje', valor: '' })).toBeNull();
  });
});

describe('faltantesDelPrecio', () => {
  it('directo no pide renglón de la lista', () => {
    expect(faltantesDelPrecio({ forma: 'directo', tipoServicio: 'Acompañamiento', precioEscrito: 800 })).toEqual([]);
  });

  it('directo pide qué se presta y el precio', () => {
    expect(faltantesDelPrecio({ forma: 'directo', tipoServicio: '  ', precioEscrito: '' })).toEqual(['tipo_servicio', 'precio_escrito']);
  });

  it('lista pide el renglón, y con un sentido elegido pide tipo y valor', () => {
    expect(faltantesDelPrecio({ forma: 'lista' })).toEqual(['precio_lista_id']);
    expect(faltantesDelPrecio({ forma: 'lista', renglon, sentido: 'recargo' })).toEqual(['tipo_de_ajuste', 'valor_del_ajuste']);
    expect(faltantesDelPrecio({ forma: 'lista', renglon, sentido: 'recargo', tipo: 'porcentaje', valor: 5 })).toEqual([]);
  });

  it('sin forma no se guarda', () => {
    expect(faltantesDelPrecio({})).toEqual(['forma_de_precio']);
  });
});

describe('columnasDelPrecio', () => {
  it('desde la lista guarda la copia del precio de ese día y el ajuste entero', () => {
    expect(columnasDelPrecio({ forma: 'lista', renglon, sentido: 'recargo', tipo: 'monto_fijo', valor: '50' })).toEqual({
      forma_de_precio: 'lista',
      tipo_servicio: 'Acompañamiento — Diurno',
      precio_lista_id: 7,
      precio_lista_snapshot: 1000,
      sentido_del_ajuste: 'recargo',
      tipo_descuento: 'monto_fijo',
      valor_descuento: 50,
      precio_final: 1050,
    });
  });

  it('desde la lista sin sentido no deja medio ajuste guardado', () => {
    const c = columnasDelPrecio({ forma: 'lista', renglon, sentido: '', tipo: 'porcentaje', valor: '10' });
    expect(c.sentido_del_ajuste).toBeNull();
    expect(c.tipo_descuento).toBeNull();
    expect(c.valor_descuento).toBeNull();
    expect(c.precio_final).toBe(1000);
  });

  it('directo no apunta a la lista ni lleva ajuste', () => {
    expect(columnasDelPrecio({ forma: 'directo', tipoServicio: ' Acompañamiento nocturno ', precioEscrito: '1200' })).toEqual({
      forma_de_precio: 'directo',
      tipo_servicio: 'Acompañamiento nocturno',
      precio_lista_id: null,
      precio_lista_snapshot: null,
      sentido_del_ajuste: null,
      tipo_descuento: null,
      valor_descuento: null,
      precio_final: 1200,
    });
  });

  it('con algo faltante no devuelve columnas', () => {
    expect(columnasDelPrecio({ forma: 'lista' })).toBeNull();
  });
});

describe('diaAnterior', () => {
  it('cruza meses y años, y los bisiestos', () => {
    expect(diaAnterior('2027-03-01')).toBe('2027-02-28');
    expect(diaAnterior('2028-03-01')).toBe('2028-02-29');
    expect(diaAnterior('2027-01-01')).toBe('2026-12-31');
  });
});

describe('cambioDePrecioValido', () => {
  const anterior = { id: 1, estado: 'vigente', vigente_desde: '2027-01-01', vigente_hasta: '2027-06-30' };

  it('acepta una fecha posterior al arranque y dentro del período', () => {
    expect(cambioDePrecioValido(anterior, '2027-01-02')).toBe(true);
    expect(cambioDePrecioValido(anterior, '2027-06-30')).toBe(true);
    expect(cambioDePrecioValido({ ...anterior, vigente_hasta: null }, '2030-01-01')).toBe(true);
  });

  it('rechaza el mismo día de arranque, antes, o después del fin', () => {
    expect(cambioDePrecioValido(anterior, '2027-01-01')).toBe(false);
    expect(cambioDePrecioValido(anterior, '2026-12-31')).toBe(false);
    expect(cambioDePrecioValido(anterior, '2027-07-01')).toBe(false);
  });

  it('rechaza una dada de baja o una ya reemplazada', () => {
    expect(cambioDePrecioValido({ ...anterior, estado: 'de_baja' }, '2027-02-01')).toBe(false);
    expect(cambioDePrecioValido(anterior, '2027-02-01', new Set([1]))).toBe(false);
  });

  it('rechaza una fecha vacía o mal escrita', () => {
    expect(cambioDePrecioValido(anterior, '')).toBe(false);
    expect(cambioDePrecioValido(anterior, '01/02/2027')).toBe(false);
  });
});

describe('idsReemplazados', () => {
  it('junta los ids a los que apunta alguna otra', () => {
    expect([...idsReemplazados([{ id: 1, prestacion_anterior_id: null }, { id: 2, prestacion_anterior_id: 1 }])]).toEqual([1]);
  });
});

describe('lasQueSeCobranEnElPeriodo', () => {
  const vieja = { id: 1, prestacion_anterior_id: null, vigente_desde: '2027-01-01', vigente_hasta: '2027-03-14' };
  const nueva = { id: 2, prestacion_anterior_id: 1, vigente_desde: '2027-03-15', vigente_hasta: null };
  const otra = { id: 3, prestacion_anterior_id: null, vigente_desde: '2027-02-01', vigente_hasta: null };

  it('con un cambio de precio a mitad del período cobra uno solo: el que corría el primer día', () => {
    expect(lasQueSeCobranEnElPeriodo([vieja, nueva], '2027-03-01', '2027-03-31')).toEqual([vieja]);
  });

  it('el período siguiente cobra el precio nuevo', () => {
    expect(lasQueSeCobranEnElPeriodo([vieja, nueva], '2027-04-01', '2027-04-30')).toEqual([nueva]);
  });

  it('no mezcla cadenas distintas del mismo Servicio', () => {
    expect(lasQueSeCobranEnElPeriodo([vieja, nueva, otra], '2027-03-01', '2027-03-31')).toEqual([vieja, otra]);
  });

  it('si la cadena arranca a mitad del período, cobra el primer eslabón que arranca adentro', () => {
    const a = { id: 10, prestacion_anterior_id: null, vigente_desde: '2027-03-10', vigente_hasta: '2027-03-19' };
    const b = { id: 11, prestacion_anterior_id: 10, vigente_desde: '2027-03-20', vigente_hasta: null };
    expect(lasQueSeCobranEnElPeriodo([b, a], '2027-03-01', '2027-03-31')).toEqual([a]);
  });

  it('con tres eslabones en el mismo período cobra uno solo', () => {
    const a = { id: 20, prestacion_anterior_id: null, vigente_desde: '2027-01-01', vigente_hasta: '2027-01-31' };
    const b = { id: 21, prestacion_anterior_id: 20, vigente_desde: '2027-02-01', vigente_hasta: '2027-02-28' };
    const c = { id: 22, prestacion_anterior_id: 21, vigente_desde: '2027-03-01', vigente_hasta: null };
    expect(lasQueSeCobranEnElPeriodo([a, b, c], '2027-01-15', '2027-03-15')).toEqual([a]);
  });

  it('deja afuera lo que no toca el período', () => {
    expect(lasQueSeCobranEnElPeriodo([vieja], '2027-04-01', '2027-04-30')).toEqual([]);
  });
});
