import { describe, expect, it } from 'vitest';
import { minutosRepetirEmergenciaAjustados } from '../minutosRepetirEmergencia';

describe('minutosRepetirEmergenciaAjustados', () => {
  it('deja pasar de uno a diez tal cual', () => {
    expect(minutosRepetirEmergenciaAjustados('1', 5)).toBe(1);
    expect(minutosRepetirEmergenciaAjustados('7', 5)).toBe(7);
    expect(minutosRepetirEmergenciaAjustados('10', 5)).toBe(10);
  });

  it('lo de arriba queda en el tope y lo de abajo en el mínimo', () => {
    expect(minutosRepetirEmergenciaAjustados('25', 5)).toBe(10);
    expect(minutosRepetirEmergenciaAjustados('0', 5)).toBe(1);
    expect(minutosRepetirEmergenciaAjustados('-3', 5)).toBe(1);
  });

  it('lo que no es número no cambia el que había', () => {
    expect(minutosRepetirEmergenciaAjustados('abc', 5)).toBe(5);
    expect(minutosRepetirEmergenciaAjustados('-', 5)).toBe(5);
  });

  it('un decimal se queda con la parte entera', () => {
    expect(minutosRepetirEmergenciaAjustados('2.7', 5)).toBe(2);
  });
});
