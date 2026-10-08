/**
 * El género como lo escribe una planilla, convertido al código del catálogo.
 *
 *   npm test --prefix backend
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { generoEscrito } from '../generoEscrito.js';

describe('el género escrito', () => {
  it('reconoce la letra, la palabra entera y los tres idiomas', () => {
    for (const valor of ['F', 'f.', 'Femenino', 'MUJER', 'female', 'Feminino']) {
      assert.deepEqual(generoEscrito(valor), { codigo: 'femenino' }, valor);
    }
    for (const valor of ['M', 'Masculino', 'Varón', 'male']) {
      assert.deepEqual(generoEscrito(valor), { codigo: 'masculino' }, valor);
    }
    for (const valor of ['X', 'No binario', '  no   binaria ', 'non-binary', 'Não binário']) {
      assert.deepEqual(generoEscrito(valor), { codigo: 'x' }, valor);
    }
  });

  it('el código que manda el Panel se lee igual', () => {
    assert.deepEqual(generoEscrito('femenino'), { codigo: 'femenino' });
    assert.deepEqual(generoEscrito('x'), { codigo: 'x' });
  });

  it('vacío es que falta, no que es desconocido', () => {
    for (const valor of [undefined, null, '', '   ']) {
      assert.deepEqual(generoEscrito(valor), { falta: true });
    }
  });

  it('lo que no se reconoce no se adivina', () => {
    assert.deepEqual(generoEscrito('otro'), { desconocido: true });
    assert.deepEqual(generoEscrito('fm'), { desconocido: true });
  });
});
