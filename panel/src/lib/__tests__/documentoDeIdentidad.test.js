import { describe, expect, it } from 'vitest';
import { avisosDelDocumento, cumpleModulo11, dniCoincide, nombreDelTipo, normalizarNumero } from '../documentoDeIdentidad';

const CUIL = { codigo: 'cuil', sigla: 'CUIL', verifica_modulo_11: true, lleva_pais: false };
const CUIL_CON_DNI = { ...CUIL, contiene_dni: true };
const PASAPORTE = { codigo: 'pasaporte', sigla: 'Pasaporte', verifica_modulo_11: false, lleva_pais: true };

describe('cumpleModulo11', () => {
  it('acepta los que cierran, con los mismos números que la base', () => {
    expect(cumpleModulo11('20111111112')).toBe(true);
    expect(cumpleModulo11('30350000018')).toBe(true);
    expect(cumpleModulo11('30350000026')).toBe(true);
  });

  it('rechaza un dígito verificador equivocado', () => {
    expect(cumpleModulo11('20111111113')).toBe(false);
  });

  it('rechaza lo que no tiene once dígitos', () => {
    expect(cumpleModulo11('2011111111')).toBe(false);
    expect(cumpleModulo11('20-11111111-2')).toBe(false);
    expect(cumpleModulo11('')).toBe(false);
    expect(cumpleModulo11(null)).toBe(false);
  });

  it('rechaza el que da diez, que no tiene dígito posible', () => {
    // Con estos diez la cuenta da 10, así que ningún último dígito lo hace válido.
    for (let d = 0; d <= 9; d += 1) expect(cumpleModulo11(`2035000008${d}`)).toBe(false);
  });
});

describe('normalizarNumero', () => {
  it('saca guiones, puntos y espacios de los que llevan dígito verificador', () => {
    expect(normalizarNumero(' 20-11.111 111-2 ', true)).toBe('20111111112');
  });

  it('a los demás sólo los recorta y los pasa a mayúsculas', () => {
    expect(normalizarNumero(' ab-123 ', false)).toBe('AB-123');
  });
});

describe('avisosDelDocumento', () => {
  it('sin tipo, falta el documento', () => {
    expect(avisosDelDocumento({ tipo: null, numero: '', pais: '' })).toEqual({ documento_tipo: 'falta_el_documento' });
  });

  it('con tipo y sin número, falta el documento en el número', () => {
    expect(avisosDelDocumento({ tipo: CUIL, numero: '  ', pais: '' })).toEqual({ documento_numero: 'falta_el_documento' });
  });

  it('un CUIL que no cierra no es válido', () => {
    expect(avisosDelDocumento({ tipo: CUIL, numero: '20-11111111-3', pais: '' })).toEqual({ documento_numero: 'numero_no_valido' });
  });

  it('un CUIL que cierra no tiene avisos, aunque venga con guiones', () => {
    expect(avisosDelDocumento({ tipo: CUIL, numero: '20-11111111-2', pais: '' })).toEqual({});
  });

  it('el pasaporte pide el país, y su número no se controla', () => {
    expect(avisosDelDocumento({ tipo: PASAPORTE, numero: 'X1', pais: '' })).toEqual({ documento_pais: 'falta_el_pais' });
    expect(avisosDelDocumento({ tipo: PASAPORTE, numero: 'X1', pais: 'UY' })).toEqual({});
  });

  it('el tipo que lleva el DNI adentro lo pide, y tiene que coincidir', () => {
    expect(avisosDelDocumento({ tipo: CUIL_CON_DNI, numero: '20111111112', pais: '', dni: '' })).toEqual({ dni: 'falta_el_dni' });
    expect(avisosDelDocumento({ tipo: CUIL_CON_DNI, numero: '20111111112', pais: '', dni: '11111112' })).toEqual({ dni: 'dni_no_coincide' });
    expect(avisosDelDocumento({ tipo: CUIL_CON_DNI, numero: '20111111112', pais: '', dni: '11.111.111' })).toEqual({});
  });

  it('si el número no es válido, no se compara el DNI', () => {
    expect(avisosDelDocumento({ tipo: CUIL_CON_DNI, numero: '20111111113', pais: '', dni: '9' })).toEqual({ documento_numero: 'numero_no_valido' });
  });

  it('el pasaporte no pide DNI', () => {
    expect(avisosDelDocumento({ tipo: PASAPORTE, numero: 'X1', pais: 'UY', dni: '' })).toEqual({});
  });

  it('el género se pide sólo cuando se lo pide', () => {
    expect(avisosDelDocumento({ tipo: PASAPORTE, numero: 'X1', pais: 'UY', pideGenero: true })).toEqual({ genero: 'falta_el_genero' });
    expect(avisosDelDocumento({ tipo: null, numero: '', pais: '', pideGenero: true })).toEqual({ documento_tipo: 'falta_el_documento', genero: 'falta_el_genero' });
    expect(avisosDelDocumento({ tipo: PASAPORTE, numero: 'X1', pais: 'UY', genero: 'x', pideGenero: true })).toEqual({});
  });
});

describe('dniCoincide', () => {
  it('compara con los ocho dígitos del medio, sin importar los ceros de adelante', () => {
    expect(dniCoincide('11111111', '20111111112')).toBe(true);
    expect(dniCoincide('5000001', '20050000017')).toBe(true);
    expect(dniCoincide('11111112', '20111111112')).toBe(false);
    expect(dniCoincide('abc', '20111111112')).toBe(false);
  });
});

describe('nombreDelTipo', () => {
  it('usa el nombre del idioma si lo hay, y si no la sigla', () => {
    expect(nombreDelTipo(PASAPORTE, { pasaporte: 'Passport' })).toBe('Passport');
    expect(nombreDelTipo(CUIL, { pasaporte: 'Passport' })).toBe('CUIL');
    expect(nombreDelTipo(null, {})).toBe('');
  });
});
