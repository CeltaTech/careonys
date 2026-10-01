import { describe, expect, it } from 'vitest';

import { armarCsv } from '../exportarCsv';

describe('armarCsv', () => {
  it('pone un renglón por fila, con los encabezados primero', () => {
    expect(armarCsv(['a', 'b'], [[1, 2], [3, 4]])).toBe('a,b\r\n1,2\r\n3,4');
  });

  it('encierra entre comillas lo que trae comas, comillas o saltos, y duplica las comillas', () => {
    expect(armarCsv(['x'], [['uno, dos'], ['dijo "hola"'], ['a\nb']])).toBe(
      'x\r\n"uno, dos"\r\n"dijo ""hola"""\r\n"a\nb"',
    );
  });

  it('deja vacío lo que no tiene valor', () => {
    expect(armarCsv(['x', 'y'], [[null, undefined]])).toBe('x,y\r\n,');
  });
});
