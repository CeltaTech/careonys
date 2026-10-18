/**
 * El aviso de bloqueo por Matrícula une dos frases: qué pasó y qué hacer. La primera viene sin
 * punto, y unidas a secas salían pegadas: «No tiene matrícula cargada Cargue la matrícula…».
 */
import { describe, expect, it } from 'vitest';
import { fraseDeBloqueo } from '../matricula';
import { T } from '../../i18n/translations';

describe('la frase de bloqueo por Matrícula', () => {
  for (const idioma of ['es-AR', 'en', 'pt-BR']) {
    it(`separa las dos partes con punto en ${idioma}`, () => {
      const tm = T[idioma].matricula;
      for (const motivo of ['sin_matricula', 'vencida']) {
        const frase = fraseDeBloqueo(motivo, tm);
        expect(frase).toBe(`${tm[`bloqueo_${motivo}`]}. ${tm[`que_hacer_${motivo}`]}`);
      }
    });
  }

  it('no pone dos puntos si la primera parte ya lo trae', () => {
    expect(fraseDeBloqueo('x', { bloqueo_x: 'Pasó algo.', que_hacer_x: 'Haga esto.' })).toBe('Pasó algo. Haga esto.');
  });

  it('sin motivo o sin textos no devuelve nada', () => {
    expect(fraseDeBloqueo(null, {})).toBe(null);
    expect(fraseDeBloqueo('vencida', null)).toBe(null);
  });
});
