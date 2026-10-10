import { describe, expect, it } from 'vitest';
import { tareasQueSePuedenAcordar } from './tareasQueSePuedenAcordar';

const cuidador = { id: 'cuidador', recibe_solo_sus_tareas: false };
const enfermero = { id: 'enfermero', recibe_solo_sus_tareas: false };
const medico = { id: 'medico', recibe_solo_sus_tareas: true };

const tareas = [
  { id: 'aseo', tipo_asistente_id: 'cuidador', clase: 'habilitada' },
  { id: 'compras', tipo_asistente_id: 'cuidador', clase: 'no_incluida' },
  { id: 'no_inyectar', tipo_asistente_id: 'cuidador', clase: 'prohibida' },
  { id: 'inyectable', tipo_asistente_id: 'enfermero', clase: 'habilitada' },
  { id: 'curacion', tipo_asistente_id: 'enfermero', clase: 'habilitada' },
  { id: 'receta', tipo_asistente_id: 'medico', clase: 'habilitada' },
];

const alcances = [{ prohibicion_id: 'no_inyectar', tarea_id: 'inyectable' }];

const ids = (lista) => lista.map((tarea) => tarea.id);

describe('tareasQueSePuedenAcordar', () => {
  it('ofrece tareas de cualquier tipo, menos las prohibiciones', () => {
    expect(ids(tareasQueSePuedenAcordar(enfermero, tareas, alcances))).toEqual([
      'aseo',
      'compras',
      'inyectable',
      'curacion',
      'receta',
    ]);
  });

  it('saca las que alcanza una prohibición de ese tipo', () => {
    expect(ids(tareasQueSePuedenAcordar(cuidador, tareas, alcances))).toEqual(['aseo', 'compras', 'curacion', 'receta']);
  });

  it('una prohibición de otro tipo no alcanza a éste', () => {
    expect(ids(tareasQueSePuedenAcordar(enfermero, tareas, alcances))).toContain('inyectable');
  });

  it('el tipo que recibe sólo sus tareas no ve las de otro', () => {
    expect(ids(tareasQueSePuedenAcordar(medico, tareas, alcances))).toEqual(['receta']);
  });

  it('sin tipo no hay nada que ofrecer', () => {
    expect(tareasQueSePuedenAcordar(null, tareas, alcances)).toEqual([]);
  });
});
