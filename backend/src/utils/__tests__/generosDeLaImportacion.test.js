/**
 * El género de una planilla grande: lo reconocido pasa, el tipeo evidente se corrige, la IA lee lo
 * que queda y lo que no da certeza vuelve.
 *
 *   npm test --prefix backend
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { resolverGeneros } from '../generosDeLaImportacion.js';

// Una IA de mentira: contesta lo que dice la tabla y anota lo que le preguntaron.
function ia(respuestas, { falla = false } = {}) {
  const pedidos = [];
  const proponer = async (lote) => {
    pedidos.push(...lote);
    if (falla) throw new Error('caída');
    return lote.map(({ clave, escrito }) => ({ clave, codigo: respuestas[escrito] ?? '' }));
  };
  return { pedidos, proponer };
}

describe('el género de la importación', () => {
  it('lo que se reconoce tal cual no se toca y no se le pregunta a nadie', async () => {
    const { pedidos, proponer } = ia({});
    const corregidos = await resolverGeneros({ valores: ['F', 'Masculino', undefined, ''], proponer });
    assert.equal(corregidos.size, 0);
    assert.equal(pedidos.length, 0);
  });

  it('el tipeo evidente se corrige sin la IA', async () => {
    const { pedidos, proponer } = ia({});
    const corregidos = await resolverGeneros({ valores: ['Femenio', 'Mascluino'], proponer });
    assert.equal(corregidos.get('Femenio'), 'femenino');
    assert.equal(corregidos.get('Mascluino'), 'masculino');
    assert.equal(pedidos.length, 0);
  });

  it('cada forma distinta se le pregunta a la IA una sola vez', async () => {
    const { pedidos, proponer } = ia({ Femeninno0: 'femenino' });
    const valores = Array.from({ length: 500 }, () => 'Femeninno0');
    const corregidos = await resolverGeneros({ valores, proponer });
    assert.equal(pedidos.length, 1);
    assert.equal(corregidos.get('Femeninno0'), 'femenino');
  });

  it('la IA sólo vale si contesta un código del catálogo', async () => {
    const { proponer } = ia({ 'Fe mi ni na': 'femenino', otro: '', raro: 'mujer', peor: 'cualquiera' });
    const corregidos = await resolverGeneros({ valores: ['Fe mi ni na', 'otro', 'raro', 'peor'], proponer });
    assert.deepEqual([...corregidos], [['Fe mi ni na', 'femenino']]);
  });

  it('una clave que la IA inventa no se aplica a nada', async () => {
    const proponer = async () => [{ clave: '7', codigo: 'femenino' }, { clave: 'x', codigo: 'x' }];
    const corregidos = await resolverGeneros({ valores: ['zzzz'], proponer });
    assert.equal(corregidos.size, 0);
  });

  it('sin IA, o con la IA caída, queda lo que se corrigió sin ella', async () => {
    assert.deepEqual([...await resolverGeneros({ valores: ['Femenio', 'zzzz'], proponer: null })], [['Femenio', 'femenino']]);
    const { proponer } = ia({}, { falla: true });
    assert.deepEqual([...await resolverGeneros({ valores: ['Femenio', 'zzzz'], proponer })], [['Femenio', 'femenino']]);
  });
});
