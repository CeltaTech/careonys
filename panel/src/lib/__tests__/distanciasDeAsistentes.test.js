/**
 * La cercanía en la lista de candidatos, con la distancia calculada por la base.
 *
 * QUÉ SE PRUEBA ACÁ. La distancia del Asistente hasta el Paciente ya no se mide en el navegador
 * con el domicilio del Asistente: la pide `cargarDistanciasDeAsistentes` a la base, que devuelve
 * sólo metros, y la lista de candidatos la lee de `datos.distancias`.
 *
 * Qué daría con el sistema roto: si la lista volviera a buscar coordenadas en el Asistente, las
 * tres primeras pruebas no encontrarían el motivo de cercanía; si el pedido a la base mandara
 * algo distinto de Asistentes, Pacientes y fecha —por ejemplo, coordenadas—, falla la cuarta; y
 * si un error de la base volteara la pantalla, falla la quinta.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('../supabaseClient', () => ({ supabase: { rpc: (...args) => rpc(...args) } }));

const { candidatosParaGuardia, MOTIVO } = await import('../candidatos');
const { cargarDistanciasDeAsistentes } = await import('../distanciasDeAsistentes');

const HUECO = {
  id: 'g-hueco',
  fecha: '2026-09-20',
  hora_inicio: '08:00',
  hora_fin: '16:00',
  canal_modalidad: 'directa',
  paciente_ids: ['p-uno', 'p-dos'],
};

const activo = (id, nombre) => ({
  id,
  nombre,
  estado: 'activo',
  canales: ['directa'],
  disponible: true,
});

const CERCANA = activo('a-cerca', 'Ana Prueba');
const LEJANA = activo('a-lejos', 'Beatriz Prueba');
const SIN_MAPA = activo('a-sin-mapa', 'Carla Prueba');

const evaluar = (distancias) =>
  candidatosParaGuardia(HUECO, {
    asistentes: [CERCANA, LEJANA, SIN_MAPA],
    distancias,
    ahora: new Date('2026-09-18T10:00:00'),
  });

const buscar = (lista, asistente) => lista.find((c) => c.asistente.id === asistente.id);
const claves = (motivos) => motivos.map((m) => m.clave);

describe('la cercanía sale de la distancia que calcula la base', () => {
  const DISTANCIAS = { [CERCANA.id]: 2300, [LEJANA.id]: 31000 };

  it('quien vive cerca lo tiene a favor, con los kilómetros', () => {
    const c = buscar(evaluar(DISTANCIAS), CERCANA);
    const cerca = c.aFavor.find((m) => m.clave === MOTIVO.CERCA);
    expect(cerca).toBeTruthy();
    expect(cerca.valores.km).toBeCloseTo(2.3, 1);
  });

  it('quien vive lejos lo tiene en contra', () => {
    const c = buscar(evaluar(DISTANCIAS), LEJANA);
    expect(claves(c.enContra)).toContain(MOTIVO.LEJOS);
  });

  it('sin distancia no se dice nada de la cercanía', () => {
    const c = buscar(evaluar(DISTANCIAS), SIN_MAPA);
    expect(claves(c.aFavor)).not.toContain(MOTIVO.CERCA);
    expect(claves(c.enContra)).not.toContain(MOTIVO.LEJOS);

    const sinNada = buscar(evaluar(undefined), CERCANA);
    expect(claves(sinNada.aFavor)).not.toContain(MOTIVO.CERCA);
  });
});

describe('cargarDistanciasDeAsistentes', () => {
  beforeEach(() => rpc.mockReset());

  it('pide a la base sólo Asistentes, Pacientes y fecha, y devuelve metros por Asistente', async () => {
    rpc.mockResolvedValue({
      data: [
        { asistente_id: CERCANA.id, metros: 2300 },
        { asistente_id: LEJANA.id, metros: 31000 },
      ],
      error: null,
    });

    const distancias = await cargarDistanciasDeAsistentes(HUECO, [CERCANA.id, LEJANA.id, CERCANA.id]);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('distancias_de_asistentes_a_pacientes', {
      p_asistentes: [CERCANA.id, LEJANA.id],
      p_pacientes: ['p-uno', 'p-dos'],
      p_fecha: '2026-09-20',
    });
    expect(distancias).toEqual({ [CERCANA.id]: 2300, [LEJANA.id]: 31000 });
  });

  it('si la base falla, devuelve vacío y no voltea la pantalla', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'falla' } });
    await expect(cargarDistanciasDeAsistentes(HUECO, [CERCANA.id])).resolves.toEqual({});
  });

  it('sin Pacientes o sin Asistentes no pregunta', async () => {
    expect(await cargarDistanciasDeAsistentes({ ...HUECO, paciente_ids: [] }, [CERCANA.id])).toEqual({});
    expect(await cargarDistanciasDeAsistentes(HUECO, [])).toEqual({});
    expect(rpc).not.toHaveBeenCalled();
  });
});
