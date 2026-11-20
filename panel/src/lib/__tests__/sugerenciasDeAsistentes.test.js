/**
 * El orden en que se proponen Asistentes para un turno de guardia, y lo que lleva cada nombre.
 *
 *   npm test --prefix panel
 *
 * Qué daría con el sistema roto: si quien se pisa con otro turno de guardia subiera arriba de quien
 * está libre, falla «el orden de la lista»; si «nunca atendió a este Paciente» volviera a
 * mostrarse como advertencia, falla «las etiquetas»; si al juntar varios turnos de guardia se
 * quedara con el mejor grupo en vez del peor, falla «varios turnos de guardia a la vez».
 */
import { describe, expect, it } from 'vitest';
import { MOTIVO } from '../candidatos';
import { ADVERTENCIA } from '../avisosAsignacion';
import {
  advertenciasPara,
  combinarCandidatos,
  etiquetasDe,
  filtrarPorNombre,
  grupoDe,
  rangoDeFechas,
  sugerenciasPara,
} from '../sugerenciasDeAsistentes';

const HUECO = {
  id: 'g-hueco',
  fecha: '2026-09-20',
  hora_inicio: '08:00',
  hora_fin: '16:00',
  canal_modalidad: 'directa',
  paciente_ids: [],
};

const activo = (id, nombre, canales = ['directa']) => ({ id, nombre, estado: 'activo', canales, disponible: true });

const LIBRE = activo('a-libre', 'Zulema Prueba');
const OCUPADA = activo('a-ocupada', 'Beatriz Prueba');
const DE_LICENCIA = activo('a-licencia', 'Carla Prueba');
const DE_OTRA_MODALIDAD = activo('a-modalidad', 'Ángela Prueba', ['intermediacion']);
const TODOS = [DE_OTRA_MODALIDAD, OCUPADA, DE_LICENCIA, LIBRE];

const DATOS = {
  asistentes: TODOS,
  turnos_guardia: [
    { id: 'g-otra', asistente_id: OCUPADA.id, fecha: '2026-09-20', hora_inicio: '08:00', hora_fin: '16:00', estado: 'programada', paciente_ids: [] },
  ],
  ausencias: [{ asistente_id: DE_LICENCIA.id, fecha_inicio: '2026-09-15', fecha_fin: null }],
  ahora: new Date('2026-09-18T10:00:00'),
};

const ids = (lista) => lista.map((c) => c.asistente.id);

describe('el orden de la lista', () => {
  it('primero quien está libre, después quien lleva advertencias, al final quien la base rechaza', () => {
    const lista = sugerenciasPara([HUECO], DATOS);
    expect(ids(lista)[0]).toBe(LIBRE.id);
    expect(lista.map(grupoDe)).toEqual([0, 1, 1, 2]);
    expect(ids(lista)[3]).toBe(DE_OTRA_MODALIDAD.id);
  });

  it('quien se excluye no aparece, como quien está ausente', () => {
    const lista = sugerenciasPara([HUECO], DATOS, { excluir: [LIBRE.id] });
    expect(ids(lista)).not.toContain(LIBRE.id);
    expect(lista).toHaveLength(3);
  });

  it('sin turnos de guardia que mirar queda el Padrón por nombre y sin advertencias', () => {
    const lista = sugerenciasPara([], DATOS);
    expect(lista.map((c) => c.asistente.nombre)).toEqual(['Ángela Prueba', 'Beatriz Prueba', 'Carla Prueba', 'Zulema Prueba']);
    expect(lista.every((c) => grupoDe(c) === 0 && etiquetasDe(c).length === 0)).toBe(true);
  });
});

describe('las etiquetas al lado del nombre', () => {
  it('muestran la superposición y la ausencia', () => {
    const lista = sugerenciasPara([HUECO], DATOS);
    const claves = (id) => etiquetasDe(lista.find((c) => c.asistente.id === id)).map((m) => m.clave);
    expect(claves(OCUPADA.id)).toContain(MOTIVO.OCUPADO);
    expect(claves(DE_LICENCIA.id)).toContain(MOTIVO.AUSENCIA);
  });

  it('no muestran que nunca atendió a este Paciente', () => {
    const candidato = {
      asistente: LIBRE,
      enContra: [
        { clave: MOTIVO.SIN_CONTINUIDAD },
        { clave: MOTIVO.OCUPADO, valores: { desde: '08:00', hasta: '16:00' } },
        { clave: MOTIVO.OCUPADO, valores: { desde: '20:00', hasta: '22:00' } },
      ],
    };
    expect(etiquetasDe(candidato)).toEqual([{ clave: MOTIVO.OCUPADO, valores: { desde: '08:00', hasta: '16:00' } }]);
  });
});

describe('varios turnos de guardia a la vez', () => {
  it('cada Asistente queda en el peor grupo que tuvo y con la suma de sus puntajes', () => {
    const primero = [
      { asistente: LIBRE, puntaje: 10, aFavor: [], enContra: [], bloqueado: false, desaconsejado: false },
      { asistente: OCUPADA, puntaje: 5, aFavor: [], enContra: [], bloqueado: false, desaconsejado: false },
    ];
    const segundo = [
      { asistente: LIBRE, puntaje: 10, aFavor: [], enContra: [{ clave: MOTIVO.OCUPADO }], bloqueado: false, desaconsejado: true },
      { asistente: OCUPADA, puntaje: 5, aFavor: [], enContra: [], bloqueado: false, desaconsejado: false },
    ];
    const lista = combinarCandidatos([primero, segundo]);
    expect(ids(lista)).toEqual([OCUPADA.id, LIBRE.id]);
    expect(lista[0].puntaje).toBe(10);
    expect(lista[1].puntaje).toBe(20);
    expect(grupoDe(lista[1])).toBe(1);
  });
});

describe('las advertencias del Asistente elegido', () => {
  it('a quien se pisa le avisa la superposición', () => {
    const claves = advertenciasPara([HUECO], OCUPADA.id, DATOS).map((a) => a.clave);
    expect(claves).toContain(ADVERTENCIA.SUPERPOSICION);
  });

  it('a quien está libre no le avisa nada, y sin elegir a nadie tampoco', () => {
    expect(advertenciasPara([HUECO], LIBRE.id, DATOS)).toEqual([]);
    expect(advertenciasPara([HUECO], '', DATOS)).toEqual([]);
  });
});

describe('la búsqueda por nombre', () => {
  const lista = sugerenciasPara([], DATOS);

  it('no distingue tildes ni mayúsculas', () => {
    expect(ids(filtrarPorNombre(lista, 'angela'))).toEqual([DE_OTRA_MODALIDAD.id]);
    expect(ids(filtrarPorNombre(lista, 'CARLA'))).toEqual([DE_LICENCIA.id]);
  });

  it('vacía deja la lista entera', () => {
    expect(filtrarPorNombre(lista, '')).toHaveLength(4);
  });
});

describe('los días que se traen de la base', () => {
  it('desde el día anterior al comienzo de la semana del primero hasta una semana después del último', () => {
    const rango = rangoDeFechas([{ fecha: '2026-09-25' }, { fecha: '2026-09-23' }], { dia_inicio_semana: 1 });
    expect(rango).toEqual({ desde: '2026-09-20', hasta: '2026-10-02' });
  });

  it('sin turnos de guardia no hay días', () => {
    expect(rangoDeFechas([])).toBeNull();
  });
});
