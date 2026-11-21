import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({ supabase: {} }));

import { TURNOS_POR_PAGINA, cortarLaPagina, filasDeLaPagina } from '../turnosGuardiaDelAsistente';

describe('las páginas de turnos de guardia del Asistente', () => {
  it('cada página pide una fila de más, para saber si hay otra después', () => {
    expect(filasDeLaPagina(0)).toEqual({ desde: 0, hasta: TURNOS_POR_PAGINA });
    expect(filasDeLaPagina(20, 20)).toEqual({ desde: 20, hasta: 40 });
  });

  it('un valor raro empieza desde la primera fila, no desde una negativa', () => {
    expect(filasDeLaPagina(undefined, 20)).toEqual({ desde: 0, hasta: 20 });
    expect(filasDeLaPagina(-5, 20)).toEqual({ desde: 0, hasta: 20 });
  });

  it('si llegó la fila de más, hay más; y no se muestra', () => {
    const veintiuno = Array.from({ length: 21 }, (_, i) => ({ id: i }));
    const { filas, hayMas } = cortarLaPagina(veintiuno, 20);
    expect(filas).toHaveLength(20);
    expect(hayMas).toBe(true);
  });

  it('si no llegó, la lista terminó, aunque la página esté justa', () => {
    expect(cortarLaPagina(Array.from({ length: 20 }, (_, i) => ({ id: i })), 20).hayMas).toBe(false);
    expect(cortarLaPagina(null, 20)).toEqual({ filas: [], hayMas: false });
  });
});
