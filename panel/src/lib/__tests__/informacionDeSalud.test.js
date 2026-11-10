// Lo que manda el Panel cuando pide información de salud: la consulta paso por paso, a la ruta de
// su tabla, y vuelve con la misma forma que una consulta de Supabase, sin levantar excepciones.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llamadas = [];
let contestar = () => ({ data: [], count: null });

vi.mock('../apiPanel', () => ({
  llamadorDe: (prefijo) => async (path, opciones) => {
    llamadas.push({ ruta: `${prefijo}${path}`, opciones });
    return contestar();
  },
}));

const { informacionDeSalud } = await import('../informacionDeSalud');

beforeEach(() => {
  llamadas.length = 0;
  contestar = () => ({ data: [], count: null });
});

describe('informacionDeSalud', () => {
  it('manda los pasos a la ruta de la tabla, sin los argumentos vacíos del final', async () => {
    contestar = () => ({ data: [{ id: 'r1' }], count: null });
    const r = await informacionDeSalud.from('reportes').select('id').eq('paciente_id', 'p').order('created_at', { ascending: false }).limit(5);
    expect(r).toEqual({ data: [{ id: 'r1' }], count: null, error: null });
    expect(llamadas[0].ruta).toBe('/informacion-de-salud/reportes');
    expect(llamadas[0].opciones.method).toBe('POST');
    expect(JSON.parse(llamadas[0].opciones.body).pasos).toEqual([
      { m: 'select', a: ['id'] },
      { m: 'eq', a: ['paciente_id', 'p'] },
      { m: 'order', a: ['created_at', { ascending: false }] },
      { m: 'limit', a: [5] },
    ]);
  });

  it('el conteo vuelve en count', async () => {
    contestar = () => ({ data: null, count: 3 });
    const { count, error } = await informacionDeSalud.from('alertas').select('id', { count: 'exact', head: true }).eq('resuelta', false);
    expect(count).toBe(3);
    expect(error).toBeNull();
  });

  it('un error del backend vuelve en error, no como excepción', async () => {
    const falla = Object.assign(new Error('x'), { status: 403 });
    contestar = () => { throw falla; };
    const r = await informacionDeSalud.from('alertas').update({ resuelta: true }).eq('id', 'a');
    expect(r).toEqual({ data: null, count: null, error: falla });
  });
});
