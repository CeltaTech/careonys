/**
 * El lector de horarios de la importación: lo que lee sin IA, lo que manda a la IA y cómo
 * comprueba lo que la IA devuelve.
 *
 *   node --test src/utils/__tests__/lectorDeHorarios.test.js
 *
 * La IA es de mentira: anota qué le pidieron y contesta lo que cada prueba prepara.
 * Los textos son inventados.
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { DIAS, leerHorarioSinIA, lectorDeHorarios } from '../lectorDeHorarios.js';

const PRESTADORA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HABILES = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];
const TODOS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

const firme = (dias, horaInicio, horaFin, diasHastaElFin = 0) => ({
  dias, horaInicio, horaFin, diasHastaElFin, dudoso: false,
});
const DUDOSO_VACIO = { dias: null, horaInicio: null, horaFin: null, diasHastaElFin: 0, dudoso: true };

/** Una IA de mentira que contesta `resultados` y anota cada pedido. */
function iaDeMentira(contestar) {
  const pedidos = [];
  return {
    pedidos,
    messages: {
      create: async (pedido) => {
        pedidos.push(pedido);
        const { pedidos: lista } = JSON.parse(pedido.messages[0].content);
        const resultados = contestar(lista);
        return { content: [{ type: 'text', text: JSON.stringify({ resultados }) }], usage: { input_tokens: 1, output_tokens: 1 } };
      },
    },
  };
}
const sinMedidor = { registrarUso: () => {} };

describe('los días son los que guarda la base', () => {
  it('sin tilde, en minúscula y de lunes a domingo', () => {
    assert.deepEqual(DIAS, TODOS);
  });
});

describe('leerHorarioSinIA: días', () => {
  const casos = [
    ['L a V 8 a 16', HABILES],
    ['lun-vie 8 a 16', HABILES],
    ['Lun. a Vie. 8 a 16', HABILES],
    ['de lunes a viernes 8 a 16', HABILES],
    ['Lunes, miércoles y viernes 8 a 16', ['lunes', 'miercoles', 'viernes']],
    ['sáb y dom 8 a 16', ['sabado', 'domingo']],
    ['fines de semana 8 a 16', ['sabado', 'domingo']],
    ['todos los días 8 a 16', TODOS],
    ['7 días 8 a 16', TODOS],
    ['Mon-Fri 8 a 16', HABILES],
    ['Monday to Friday 8 a 16', HABILES],
    ['Mon, Wed and Fri 8 a 16', ['lunes', 'miercoles', 'viernes']],
    ['weekends 8 a 16', ['sabado', 'domingo']],
    ['every day 8 a 16', TODOS],
    ['segunda a sexta 8 a 16', HABILES],
    ['segunda-feira a sexta-feira 8 a 16', HABILES],
    ['sábado e domingo 8 a 16', ['sabado', 'domingo']],
    ['todos os dias 8 a 16', TODOS],
    ['vie a lun 8 a 16', ['lunes', 'viernes', 'sabado', 'domingo']],
    ['días hábiles 8 a 16', HABILES],
  ];
  for (const [texto, dias] of casos) {
    it(texto, () => {
      assert.deepEqual(leerHorarioSinIA(texto), firme(dias, '08:00', '16:00'));
    });
  }
});

describe('leerHorarioSinIA: horario', () => {
  const casos = [
    ['L a V 8 a 16 hs', '08:00', '16:00', 0],
    ['L a V 08:00-16:00', '08:00', '16:00', 0],
    ['L a V 8hs-16hs', '08:00', '16:00', 0],
    ['L a V 8.30 a 12', '08:30', '12:00', 0],
    ['L a V de 8:30 a 12:45', '08:30', '12:45', 0],
    ['L a V 20 a 8', '20:00', '08:00', 1],
    ['L a V 22:00 - 06:00', '22:00', '06:00', 1],
    ['L a V 24 hs', '00:00', '00:00', 1],
    ['L a V 8 a 24', '08:00', '00:00', 1],
    ['L a V 8 a 8', '08:00', '08:00', 1],
    ['Mon-Fri 9am-5pm', '09:00', '17:00', 0],
    ['segunda a sexta das 8h às 16h', '08:00', '16:00', 0],
    ['L a V entre las 8 y las 16', '08:00', '16:00', 0],
  ];
  for (const [texto, horaInicio, horaFin, diasHastaElFin] of casos) {
    it(texto, () => {
      assert.deepEqual(leerHorarioSinIA(texto), firme(HABILES, horaInicio, horaFin, diasHastaElFin));
    });
  }

  it('24x7 son los siete días, todo el día', () => {
    assert.deepEqual(leerHorarioSinIA('24x7'), firme(TODOS, '00:00', '00:00', 1));
    assert.deepEqual(leerHorarioSinIA('24/7'), firme(TODOS, '00:00', '00:00', 1));
  });

  it('todos los días 24 hs', () => {
    assert.deepEqual(leerHorarioSinIA('todos los días 24 hs'), firme(TODOS, '00:00', '00:00', 1));
  });
});

describe('leerHorarioSinIA: dos casilleros separados', () => {
  it('días en uno y horario en otro', () => {
    assert.deepEqual(leerHorarioSinIA('lun-vie', '20 a 8'), firme(HABILES, '20:00', '08:00', 1));
  });
  it('el horario vacío deja los días y queda dudoso', () => {
    assert.deepEqual(leerHorarioSinIA('lun-vie', ''), { ...DUDOSO_VACIO, dias: HABILES });
  });
});

describe('leerHorarioSinIA: nunca inventa', () => {
  for (const texto of ['', '   ', '-', 'mañanas', 'a convenir', 'turno noche', 'rotativo', 'TBD']) {
    it(`«${texto}» queda dudoso con nulos`, () => {
      assert.deepEqual(leerHorarioSinIA(texto), DUDOSO_VACIO);
    });
  }
  it('sin texto ninguno', () => {
    assert.deepEqual(leerHorarioSinIA(undefined, null), DUDOSO_VACIO);
  });
  it('días sin hora: conserva los días y queda dudoso', () => {
    assert.deepEqual(leerHorarioSinIA('lunes a viernes, mañanas'), { ...DUDOSO_VACIO, dias: HABILES });
  });
  it('hora sin días: conserva la hora y queda dudoso', () => {
    assert.deepEqual(leerHorarioSinIA('8 a 16'), {
      dias: null, horaInicio: '08:00', horaFin: '16:00', diasHastaElFin: 0, dudoso: true,
    });
  });
  it('dos horarios en el mismo renglón quedan dudosos', () => {
    assert.deepEqual(leerHorarioSinIA('L a V 8 a 12 y 14 a 18'), { ...DUDOSO_VACIO, dias: HABILES });
  });
  it('un horario completo con «a convenir» queda dudoso', () => {
    assert.equal(leerHorarioSinIA('L a V 8 a 16 a convenir').dudoso, true);
  });
});

describe('leerHorarioSinIA: lo que no entiende va a la IA', () => {
  for (const texto of ['M y J 8 a 16', 'L a V 25 a 30', 'L a V 8:75 a 12', 'desde las 8', 'cuando la familia avise', 'L a']) {
    it(`«${texto}» devuelve null`, () => {
      assert.equal(leerHorarioSinIA(texto), null);
    });
  }
});

describe('lectorDeHorarios', () => {
  it('lo que el analizador entiende no llega a la IA', async () => {
    const ia = iaDeMentira(() => []);
    const leer = lectorDeHorarios({ prestadoraId: PRESTADORA }, { cliente: ia, ...sinMedidor });
    const mapa = await leer(['L a V 8 a 16', 'mañanas', '']);
    assert.equal(ia.pedidos.length, 0);
    assert.deepEqual(mapa.get('L a V 8 a 16'), firme(HABILES, '08:00', '16:00'));
    assert.deepEqual(mapa.get('mañanas'), DUDOSO_VACIO);
    assert.deepEqual(mapa.get(''), DUDOSO_VACIO);
  });

  it('manda a la IA sólo lo que no entiende, una vez por tanda, y anota el consumo', async () => {
    const ia = iaDeMentira((lista) => lista.map((p) => ({
      clave: p.clave, dias: ['martes', 'jueves'], horaInicio: '21:00', horaFin: '07:00',
    })));
    const usos = [];
    const leer = lectorDeHorarios({ prestadoraId: PRESTADORA }, { cliente: ia, registrarUso: (u) => usos.push(u) });
    const mapa = await leer(['Ma y Ju por la noche de 21 a 7?', 'L a V 8 a 16', 'Ma y Ju por la noche de 21 a 7?']);
    assert.equal(ia.pedidos.length, 1);
    const enviados = JSON.parse(ia.pedidos[0].messages[0].content).pedidos;
    assert.deepEqual(enviados.map((p) => p.texto), ['Ma y Ju por la noche de 21 a 7?']);
    assert.deepEqual(mapa.get('Ma y Ju por la noche de 21 a 7?'), firme(['martes', 'jueves'], '21:00', '07:00', 1));
    assert.equal(usos.length, 1);
    assert.equal(usos[0].prestadoraId, PRESTADORA);
    assert.equal(usos[0].modulo, 'importacion_horarios');
  });

  it('una hora inválida de la IA no entra', async () => {
    const ia = iaDeMentira((lista) => lista.map((p) => ({ clave: p.clave, dias: HABILES, horaInicio: '8', horaFin: '25:00' })));
    const leer = lectorDeHorarios({ prestadoraId: PRESTADORA }, { cliente: ia, ...sinMedidor });
    const mapa = await leer(['M a V 8 a 16']);
    assert.deepEqual(mapa.get('M a V 8 a 16'), { ...DUDOSO_VACIO, dias: HABILES });
  });

  it('un día fuera del conjunto válido no entra', async () => {
    const ia = iaDeMentira((lista) => lista.map((p) => ({ clave: p.clave, dias: ['lunes', 'miércoles'], horaInicio: '08:00', horaFin: '16:00' })));
    const leer = lectorDeHorarios({ prestadoraId: PRESTADORA }, { cliente: ia, ...sinMedidor });
    const mapa = await leer(['L y M 8 a 16']);
    assert.deepEqual(mapa.get('L y M 8 a 16'), {
      dias: null, horaInicio: '08:00', horaFin: '16:00', diasHastaElFin: 0, dudoso: true,
    });
  });

  it('lo que la IA deja en null queda dudoso', async () => {
    const ia = iaDeMentira((lista) => lista.map((p) => ({ clave: p.clave, dias: null, horaInicio: null, horaFin: null })));
    const leer = lectorDeHorarios({ prestadoraId: PRESTADORA }, { cliente: ia, ...sinMedidor });
    const mapa = await leer(['cuando la familia avise']);
    assert.deepEqual(mapa.get('cuando la familia avise'), DUDOSO_VACIO);
  });

  it('un pedido que la IA no contestó queda dudoso', async () => {
    const ia = iaDeMentira(() => []);
    const leer = lectorDeHorarios({ prestadoraId: PRESTADORA }, { cliente: ia, ...sinMedidor });
    const mapa = await leer(['M y J 8 a 16']);
    assert.deepEqual(mapa.get('M y J 8 a 16'), DUDOSO_VACIO);
  });

  it('una respuesta que no es JSON queda dudosa', async () => {
    const ia = { messages: { create: async () => ({ content: [{ type: 'text', text: 'lunes a viernes' }] }) } };
    const leer = lectorDeHorarios({ prestadoraId: PRESTADORA }, { cliente: ia, ...sinMedidor });
    const mapa = await leer(['M y J 8 a 16']);
    assert.deepEqual(mapa.get('M y J 8 a 16'), DUDOSO_VACIO);
  });

  it('si la IA falla, queda dudoso y no corta la importación', async () => {
    const ia = { messages: { create: async () => { throw new Error('sin conexión'); } } };
    const leer = lectorDeHorarios({ prestadoraId: PRESTADORA }, { cliente: ia, ...sinMedidor });
    const mapa = await leer(['M y J 8 a 16', 'L a V 8 a 16']);
    assert.deepEqual(mapa.get('M y J 8 a 16'), DUDOSO_VACIO);
    assert.deepEqual(mapa.get('L a V 8 a 16'), firme(HABILES, '08:00', '16:00'));
  });

  it('sin clave de la IA, lo que no entiende queda dudoso', async () => {
    const leer = lectorDeHorarios({ prestadoraId: PRESTADORA }, { cliente: null, ...sinMedidor });
    const mapa = await leer(['M y J 8 a 16']);
    assert.deepEqual(mapa.get('M y J 8 a 16'), DUDOSO_VACIO);
  });
});
