import { describe, expect, it } from 'vitest';
import { candidatosParaGuardia, estaEnElPadron } from '../candidatos';
import { enlaceDelTurno, MOTIVO_SIN_CERRAR } from '../turnosQueTraban';

// Datos inventados.
const ACTIVO = { id: 'a1', nombre: 'Asistente inventado', estado: 'activo', canales: ['directa'], disponible: true, cuenta_desactivada: false };
const DESACTIVADO = { ...ACTIVO, id: 'a2', cuenta_desactivada: true };

describe('un Asistente desactivado no se ofrece', () => {
  it('el activo sigue en el Padrón', () => {
    expect(estaEnElPadron(ACTIVO)).toBe(true);
  });

  it('el desactivado sale del Padrón aunque su estado siga activo', () => {
    expect(estaEnElPadron(DESACTIVADO)).toBe(false);
  });

  it('el que no vino con el dato —la vista del coordinador ya lo excluye— no se descarta', () => {
    const { cuenta_desactivada: _omitido, ...sinDato } = ACTIVO;
    expect(estaEnElPadron(sinDato)).toBe(true);
  });

  it('no aparece entre los candidatos de una guardia', () => {
    const hueco = { id: 'g-1', fecha: '2027-03-11', hora_inicio: '08:00', hora_fin: '16:00', canal_modalidad: 'directa', paciente_ids: [] };
    const ids = candidatosParaGuardia(hueco, { asistentes: [ACTIVO, DESACTIVADO], ahora: new Date('2027-03-10T10:00:00') })
      .map((c) => c.asistente.id);
    expect(ids).toEqual(['a1']);
  });
});

describe('a dónde lleva cada turno que traba la desactivación', () => {
  const HOY = '2027-03-10';

  it('el turno por delante abre Guardias desde ese día', () => {
    expect(enlaceDelTurno({ tipo: 'guardia', fecha: '2027-03-12', motivo: 'desactivacion_con_turnos_por_delante' }, HOY))
      .toBe('/guardias?desde=2027-03-12');
  });

  it('el turno sin cerrar abre la sección de Guardias sin cerrar', () => {
    expect(enlaceDelTurno({ tipo: 'guardia', fecha: '2027-03-08', motivo: MOTIVO_SIN_CERRAR }, HOY))
      .toBe('/guardias?desde=2027-03-08#guardias-sin-cerrar');
  });

  it('una serie que empezó antes abre Guardias desde hoy', () => {
    expect(enlaceDelTurno({ tipo: 'serie', fecha: '2027-01-01', motivo: 'desactivacion_con_turnos_por_delante' }, HOY))
      .toBe('/guardias?desde=2027-03-10');
  });
});
