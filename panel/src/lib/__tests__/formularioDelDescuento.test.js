import { describe, it, expect } from 'vitest';
import {
  AVISOS,
  CAMPOS_DEL_DESCUENTO,
  DURACIONES,
  avisosDelDescuento,
  camposVisibles,
  filaDelDescuento,
  formularioVacio,
  sigueVigente,
} from '../formularioDelDescuento.js';
import { descuentoValido } from '../descuentosDelPeriodo.js';

const HOY = '2027-04-10';

function completo(cambios = {}) {
  return { ...formularioVacio(HOY), valor: '10', cantidad_de_periodos: '3', ...cambios };
}

describe('formularioDelDescuento — la declaración', () => {
  it('cada casillero tiene clave, tipo y si es obligatorio', () => {
    for (const c of CAMPOS_DEL_DESCUENTO) {
      expect(typeof c.clave).toBe('string');
      expect(typeof c.tipo).toBe('string');
      expect(typeof c.obligatorio).toBe('boolean');
    }
  });

  it('por períodos se ve la cantidad y no la fecha de fin', () => {
    const claves = camposVisibles(completo()).map((c) => c.clave);
    expect(claves).toContain('cantidad_de_periodos');
    expect(claves).not.toContain('vigente_hasta');
  });

  it('por fecha se ve la fecha de fin y no la cantidad', () => {
    const claves = camposVisibles(completo({ duracion: DURACIONES.FECHA })).map((c) => c.clave);
    expect(claves).toContain('vigente_hasta');
    expect(claves).not.toContain('cantidad_de_periodos');
  });
});

describe('formularioDelDescuento — avisos', () => {
  it('un formulario completo no tiene avisos', () => {
    expect(avisosDelDescuento(completo())).toEqual({});
  });

  it('el formulario vacío avisa todos los obligatorios visibles, en orden, y no el motivo', () => {
    const avisos = avisosDelDescuento(formularioVacio(''));
    expect(Object.keys(avisos)).toEqual(['valor', 'vigente_desde', 'cantidad_de_periodos']);
    expect(Object.values(avisos).every((a) => a === AVISOS.FALTA)).toBe(true);
  });

  it('no avisa por un casillero que no se ve', () => {
    const avisos = avisosDelDescuento(completo({ duracion: DURACIONES.FECHA, cantidad_de_periodos: '', vigente_hasta: '2027-05-01' }));
    expect(avisos).toEqual({});
  });

  it('valor cero, negativo o no numérico', () => {
    expect(avisosDelDescuento(completo({ valor: '0' })).valor).toBe(AVISOS.VALOR_NO_POSITIVO);
    expect(avisosDelDescuento(completo({ valor: '-5' })).valor).toBe(AVISOS.VALOR_NO_POSITIVO);
    expect(avisosDelDescuento(completo({ valor: 'abc' })).valor).toBe(AVISOS.VALOR_NO_POSITIVO);
  });

  it('el porcentaje llega hasta 100; el monto no tiene ese tope', () => {
    expect(avisosDelDescuento(completo({ valor: '100' }))).toEqual({});
    expect(avisosDelDescuento(completo({ valor: '100.01' })).valor).toBe(AVISOS.PORCENTAJE_MAYOR_A_CIEN);
    expect(avisosDelDescuento(completo({ clase: 'monto', valor: '25000' }))).toEqual({});
  });

  it('la cantidad de períodos es un entero de 1 a 999', () => {
    expect(avisosDelDescuento(completo({ cantidad_de_periodos: '0' })).cantidad_de_periodos).toBe(AVISOS.PERIODOS_FUERA_DE_RANGO);
    expect(avisosDelDescuento(completo({ cantidad_de_periodos: '1.5' })).cantidad_de_periodos).toBe(AVISOS.PERIODOS_FUERA_DE_RANGO);
    expect(avisosDelDescuento(completo({ cantidad_de_periodos: '1000' })).cantidad_de_periodos).toBe(AVISOS.PERIODOS_FUERA_DE_RANGO);
    expect(avisosDelDescuento(completo({ cantidad_de_periodos: '999' }))).toEqual({});
  });

  it('la fecha de fin no puede ser anterior al comienzo; el mismo día sí', () => {
    const base = { duracion: DURACIONES.FECHA };
    expect(avisosDelDescuento(completo({ ...base, vigente_hasta: '2027-04-09' })).vigente_hasta).toBe(AVISOS.FECHAS_AL_REVES);
    expect(avisosDelDescuento(completo({ ...base, vigente_hasta: HOY }))).toEqual({});
  });

  it('el motivo es opcional pero tiene largo máximo', () => {
    expect(avisosDelDescuento(completo({ motivo: '' }))).toEqual({});
    expect(avisosDelDescuento(completo({ motivo: 'x'.repeat(500) }))).toEqual({});
    expect(avisosDelDescuento(completo({ motivo: 'x'.repeat(501) })).motivo).toBe(AVISOS.TEXTO_LARGO);
  });

  it('una clase o duración desconocida se avisa como faltante', () => {
    expect(avisosDelDescuento(completo({ clase: 'regalo' })).clase).toBe(AVISOS.FALTA);
    expect(avisosDelDescuento(completo({ duracion: 'siempre' })).duracion).toBe(AVISOS.FALTA);
  });
});

describe('formularioDelDescuento — el renglón para la base', () => {
  const contexto = { prestadoraId: 'p-1', servicioId: 's-1', moneda: 'ARS' };

  it('porcentaje por períodos: sin moneda y sin fecha de fin', () => {
    const fila = filaDelDescuento(completo({ motivo: '  promo  ' }), contexto);
    expect(fila).toEqual({
      prestadora_id: 'p-1',
      servicio_id: 's-1',
      clase: 'porcentaje',
      valor: 10,
      moneda: null,
      vigente_desde: HOY,
      cantidad_de_periodos: 3,
      vigente_hasta: null,
      motivo: 'promo',
    });
  });

  it('monto por fecha: con la moneda de la Prestadora y sin cantidad', () => {
    const fila = filaDelDescuento(
      completo({ clase: 'monto', valor: '1500.5', duracion: DURACIONES.FECHA, vigente_hasta: '2027-06-30', cantidad_de_periodos: '7' }),
      contexto,
    );
    expect(fila.moneda).toBe('ARS');
    expect(fila.valor).toBe(1500.5);
    expect(fila.cantidad_de_periodos).toBeNull();
    expect(fila.vigente_hasta).toBe('2027-06-30');
    expect(fila.motivo).toBeNull();
  });

  it('lo que sale de un formulario sin avisos es un descuento válido para el cálculo', () => {
    for (const form of [
      completo(),
      completo({ clase: 'monto', valor: '200' }),
      completo({ duracion: DURACIONES.FECHA, vigente_hasta: '2027-12-31' }),
    ]) {
      expect(avisosDelDescuento(form)).toEqual({});
      expect(descuentoValido(filaDelDescuento(form, contexto))).toBe(true);
    }
  });
});

describe('formularioDelDescuento — sigueVigente', () => {
  it('terminado no sigue', () => {
    expect(sigueVigente({ terminado_en: '2027-04-01T10:00:00Z' }, HOY)).toBe(false);
  });
  it('con fecha de fin pasada no sigue; hoy o futura, sí', () => {
    expect(sigueVigente({ vigente_hasta: '2027-04-09' }, HOY)).toBe(false);
    expect(sigueVigente({ vigente_hasta: HOY }, HOY)).toBe(true);
    expect(sigueVigente({ vigente_hasta: '2027-05-01' }, HOY)).toBe(true);
  });
  it('por períodos, sin terminar, sigue', () => {
    expect(sigueVigente({ cantidad_de_periodos: 3, vigente_hasta: null }, HOY)).toBe(true);
  });
  it('nada no sigue', () => {
    expect(sigueVigente(null, HOY)).toBe(false);
  });
});
