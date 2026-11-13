/**
 * Los períodos con los que se le cobra al Cliente.
 *
 *   npx vitest run src/lib/__tests__/frecuenciaDeCobroAlCliente.test.js
 *
 * La prueba que importa es la de cobertura: recorriendo dos años día por día, cada día cae en
 * exactamente un período y los períodos no se pisan. Qué daría con el sistema roto: si la
 * quincena se emparejara según la fecha preguntada y no desde un origen fijo, dos fechas de la
 * misma quincena darían pares distintos y la cobertura fallaría.
 */
import { describe, expect, it } from 'vitest';
import {
  FRECUENCIAS_POSIBLES,
  diaCorrido,
  diaDeLaSemanaDe,
  periodoDeCobroQueContiene,
  periodosDeCobroQueTocan,
} from '../frecuenciaDePago';

describe('periodoDeCobroQueContiene', () => {
  it('el día es ese mismo día', () => {
    expect(periodoDeCobroQueContiene('2026-11-13', 'dia')).toEqual({ desde: '2026-11-13', hasta: '2026-11-13' });
  });

  it('la semana va de lunes a domingo si no se dijo otro corte', () => {
    expect(periodoDeCobroQueContiene('2026-11-13', 'semana')).toEqual({ desde: '2026-11-09', hasta: '2026-11-15' });
    expect(diaDeLaSemanaDe('2026-11-15')).toBe(7);
  });

  it('la semana respeta otro día de corte', () => {
    expect(periodoDeCobroQueContiene('2026-11-13', 'semana', 5)).toEqual({ desde: '2026-11-07', hasta: '2026-11-13' });
  });

  it('la quincena son catorce días, y las dos mitades dan el mismo par', () => {
    const q = periodoDeCobroQueContiene('2026-11-13', 'quincena');
    expect(diaCorrido(q.desde, 13)).toBe(q.hasta);
    expect(periodoDeCobroQueContiene(q.desde, 'quincena')).toEqual(q);
    expect(periodoDeCobroQueContiene(q.hasta, 'quincena')).toEqual(q);
    expect(periodoDeCobroQueContiene(diaCorrido(q.desde, 7), 'quincena')).toEqual(q);
  });

  it('el mes es el mes calendario, y una frecuencia desconocida también', () => {
    expect(periodoDeCobroQueContiene('2027-02-10', 'mes')).toEqual({ desde: '2027-02-01', hasta: '2027-02-28' });
    expect(periodoDeCobroQueContiene('2027-02-10', 'trimestre')).toEqual({ desde: '2027-02-01', hasta: '2027-02-28' });
  });

  it('el día está en la misma lista que ven los Asistentes', () => {
    expect(FRECUENCIAS_POSIBLES).toEqual(['dia', 'semana', 'quincena', 'mes']);
  });
});

describe('cada día cae en exactamente un período', () => {
  for (const frecuencia of ['dia', 'semana', 'quincena', 'mes']) {
    it(frecuencia, () => {
      const periodos = periodosDeCobroQueTocan('2026-01-01', '2027-12-31', frecuencia);
      for (let i = 1; i < periodos.length; i += 1) {
        expect(periodos[i].desde).toBe(diaCorrido(periodos[i - 1].hasta, 1));
      }
      let dia = '2026-01-01';
      while (dia <= '2027-12-31') {
        const p = periodoDeCobroQueContiene(dia, frecuencia);
        expect(p.desde <= dia && dia <= p.hasta).toBe(true);
        expect(periodos.filter((x) => x.desde <= dia && dia <= x.hasta)).toHaveLength(1);
        dia = diaCorrido(dia, 1);
      }
    });
  }
});

describe('periodosDeCobroQueTocan', () => {
  it('un tramo al revés no da nada', () => {
    expect(periodosDeCobroQueTocan('2026-11-30', '2026-11-01', 'mes')).toEqual([]);
  });
  it('trae los que se superponen aunque sea un día', () => {
    expect(periodosDeCobroQueTocan('2026-11-01', '2026-11-30', 'semana')[0]).toEqual({ desde: '2026-10-26', hasta: '2026-11-01' });
  });
});
