/**
 * El género como lo escribe una planilla, convertido al código del catálogo.
 *
 *   npm test --prefix backend
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { generoEscrito, generoParecido } from '../generoEscrito.js';

describe('el género escrito', () => {
  it('reconoce la letra, la palabra entera y los tres idiomas', () => {
    for (const valor of ['F', 'f.', 'Femenino', 'MUJER', 'Hembra', 'Fémina', 'female', 'Feminino', 'Fêmea']) {
      assert.deepEqual(generoEscrito(valor), { codigo: 'femenino' }, valor);
    }
    for (const valor of ['M', 'Masculino', 'Varón', 'Macho', 'male', 'Homem']) {
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

describe('el error de tipeo evidente', () => {
  it('corrige una letra de más, de menos, cambiada o dada vuelta', () => {
    assert.deepEqual(generoParecido('Femenio'), { codigo: 'femenino' });
    assert.deepEqual(generoParecido('Mascluino'), { codigo: 'masculino' });
    assert.deepEqual(generoParecido('Hombr'), { codigo: 'masculino' });
    assert.deepEqual(generoParecido('Mujerr'), { codigo: 'femenino' });
    assert.deepEqual(generoParecido('No binarios'), { codigo: 'x' });
  });

  it('una palabra corta no se corrige, porque una letra ya es otra palabra', () => {
    assert.equal(generoParecido('mala'), null);
    assert.equal(generoParecido('mam'), null);
  });

  it('a dos letras o más no se corrige', () => {
    assert.equal(generoParecido('Femnio'), null);
    assert.equal(generoParecido('otro'), null);
    assert.equal(generoParecido('no informa'), null);
  });
});
