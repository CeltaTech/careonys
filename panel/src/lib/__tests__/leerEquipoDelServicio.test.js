import { describe, expect, it } from 'vitest';
import { leerEquipoCompletoDelServicio, leerEquipoDelServicio } from '../leerEquipoDelServicio';

// Una base de mentira: cada tabla contesta lo que se le cargó, con cualquier filtro.
function baseDeMentira(tablas, errores = {}) {
  return {
    from(tabla) {
      const respuesta = errores[tabla]
        ? { data: null, error: errores[tabla] }
        : { data: tablas[tabla] ?? [], error: null };
      const consulta = {
        select: () => consulta,
        eq: () => consulta,
        in: () => consulta,
        maybeSingle: () => Promise.resolve({ ...respuesta, data: (respuesta.data ?? [])[0] ?? null }),
        then: (resolver, rechazar) => Promise.resolve(respuesta).then(resolver, rechazar),
      };
      return consulta;
    },
  };
}

// Datos inventados.
const SERVICIO = { id: 's-1', prestadora_id: 'p-1', coordinador_id: null };

describe('leerEquipoDelServicio', () => {
  it('sin turnos ni series el equipo queda vacío', async () => {
    const supabase = baseDeMentira({});
    expect(await leerEquipoDelServicio(supabase, SERVICIO, new Date('2027-04-15T12:00:00Z'))).toEqual([]);
  });

  it('devuelve los del equipo con su nombre, ordenados por nombre', async () => {
    const supabase = baseDeMentira({
      series_turnos_guardia: [
        { id: 'se-1', servicio_id: 's-1', asistente_id: 'a-1', estado: 'activa', vigente_hasta: null },
        { id: 'se-2', servicio_id: 's-1', asistente_id: 'a-2', estado: 'activa', vigente_hasta: null },
      ],
      asistentes: [
        { id: 'a-1', nombre: 'Bruno', apellido: 'Sosa' },
        { id: 'a-2', nombre: 'Alba', apellido: 'Ruiz' },
      ],
    });
    expect(await leerEquipoDelServicio(supabase, SERVICIO)).toEqual([
      { asistente_id: 'a-2', nombre: 'Ruiz Alba' },
      { asistente_id: 'a-1', nombre: 'Sosa Bruno' },
    ]);
  });

  it('el equipo entero trae también a quien quedó afuera, a quien coordina y los turnos de guardia', async () => {
    const supabase = baseDeMentira({
      series_turnos_guardia: [
        { id: 'se-1', servicio_id: 's-1', asistente_id: 'a-1', estado: 'activa', vigente_hasta: null },
      ],
      turnos_guardia: [
        { id: 'tg-1', servicio_id: 's-1', asistente_id: null, fecha: '2099-01-01', estado: 'programada' },
      ],
      equipo_servicio: [
        { servicio_id: 's-1', asistente_id: 'a-3', usuario_id: null, situacion: 'sacada', cubre_francos: false },
      ],
      asistentes: [
        { id: 'a-1', nombre: 'Bruno', apellido: 'Sosa' },
        { id: 'a-3', nombre: 'Ciro', apellido: 'Paz' },
      ],
      usuarios: [{ id: 'u-1', nombre: 'Dora' }],
    });
    const leido = await leerEquipoCompletoDelServicio(supabase, { ...SERVICIO, coordinador_id: 'u-1' });

    expect(leido.equipo.asistentes.map((a) => a.asistente_id)).toEqual(['a-1']);
    expect(leido.equipo.afuera.map((a) => a.asistente_id)).toEqual(['a-3']);
    expect(leido.equipo.coordinadores.map((c) => c.usuario_id)).toEqual(['u-1']);
    expect(leido.idsAsistentes).toEqual(['a-1', 'a-3']);
    expect(leido.turnos_guardia.map((tg) => tg.id)).toEqual(['tg-1']);
    expect(leido.nombreDeAsistente('a-3')).toBe('Paz Ciro');
    expect(leido.nombreDeAsistente('a-9')).toBe('—');
    expect(leido.nombreDeUsuario('u-1')).toBe('Dora');
    expect(leido.nombreDeUsuario('u-9')).toBe('—');
  });

  it('lanza el error de la base', async () => {
    const falla = { code: '42501', message: 'sin permiso' };
    const supabase = baseDeMentira({}, { turnos_guardia: falla });
    await expect(leerEquipoDelServicio(supabase, SERVICIO)).rejects.toBe(falla);
  });
});
