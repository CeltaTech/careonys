/**
 * Los criterios del Servicio que contesta la base (`criterios_de_candidatas`) y cómo pesan en la
 * lista de Asistentes.
 *
 *   npx vitest run src/lib/__tests__/criteriosDeCandidatas.test.js
 *
 * Qué daría con el sistema roto: si una tarea prohibida no bloqueara, falla «la tarea prohibida
 * bloquea»; si un valor vacío de la base sumara o restara, falla «lo vacío no opina»; si sin
 * turnos de guardia la lista volviera a puntaje cero, falla «sin turnos de guardia»; si el rechazo
 * de la base llegara crudo a la pantalla, falla «el rechazo al asignar».
 */
import { describe, expect, it } from 'vitest';
import {
  MOTIVO,
  candidatosParaTurnoGuardia,
  criteriosDelAsistente,
  evaluarCriteriosDelServicio,
} from '../candidatos';
import {
  PESOS,
  PESOS_QUE_SE_PUEDEN_TOCAR,
  TOPES,
  TOPES_QUE_SE_PUEDEN_TOCAR,
  bordeEnPantalla,
  topeGuardado,
} from '../perfilesDeCandidatos';
import { grupoDe, sugerenciasPara } from '../sugerenciasDeAsistentes';
import { esRechazoPorTareaProhibida, mensajeDeModalidad, mensajeDeTareaProhibida } from '../modalidades';

const SERVICIO = 's-prueba';
const fila = (asistente_id, cambios = {}) => ({
  asistente_id,
  acepta_lugar: null,
  tarea_prohibida: false,
  tareas_no_incluidas: null,
  falta_especialidad: 0,
  promedio_estrellas: null,
  cantidad_calificaciones: 0,
  faltas_sin_aviso: 0,
  llegadas_tarde: 0,
  encaja_valor: null,
  ...cambios,
});
const criterios = (...filas) => new Map([[SERVICIO, new Map(filas.map((f) => [f.asistente_id, f]))]]);
const claves = (lista) => lista.map((m) => m.clave);

const activo = (id, nombre) => ({ id, nombre, estado: 'activo', canales: ['directa'], disponible: true });

describe('criteriosDelAsistente', () => {
  it('devuelve la fila de ese Asistente en ese Servicio, o null', () => {
    const c = criterios(fila('a-1'));
    expect(criteriosDelAsistente(c, SERVICIO, 'a-1')?.asistente_id).toBe('a-1');
    expect(criteriosDelAsistente(c, SERVICIO, 'a-2')).toBeNull();
    expect(criteriosDelAsistente(c, 'otro', 'a-1')).toBeNull();
    expect(criteriosDelAsistente(undefined, SERVICIO, 'a-1')).toBeNull();
  });
});

describe('evaluarCriteriosDelServicio', () => {
  it('lo vacío no opina: sin fila o con todo null no suma ni resta', () => {
    const nada = { aFavor: [], enContra: [], puntaje: 0, bloqueado: false };
    expect(evaluarCriteriosDelServicio(null)).toEqual(nada);
    expect(evaluarCriteriosDelServicio(fila('a-1'))).toEqual(nada);
  });

  it('la tarea prohibida bloquea, con su propio motivo', () => {
    const r = evaluarCriteriosDelServicio(fila('a-1', { tarea_prohibida: true }));
    expect(r.bloqueado).toBe(true);
    expect(claves(r.enContra)).toEqual([MOTIVO.TAREA_PROHIBIDA]);
    expect(r.puntaje).toBe(PESOS.tarea_prohibida);
  });

  it('el lugar no aceptado va en contra y pesa', () => {
    const r = evaluarCriteriosDelServicio(fila('a-1', { acepta_lugar: false }));
    expect(claves(r.enContra)).toEqual([MOTIVO.LUGAR_NO_ACEPTADO]);
    expect(r.puntaje).toBe(PESOS.lugar_no_aceptado);
    expect(r.bloqueado).toBe(false);
    expect(evaluarCriteriosDelServicio(fila('a-1', { acepta_lugar: true })).enContra).toEqual([]);
  });

  it('tareas no incluidas, especialidad que falta y valor que no encaja son advertencias sin peso', () => {
    const r = evaluarCriteriosDelServicio(
      fila('a-1', { tareas_no_incluidas: 2, falta_especialidad: 1, encaja_valor: false })
    );
    expect(claves(r.enContra)).toEqual([MOTIVO.TAREAS_NO_INCLUIDAS, MOTIVO.FALTA_ESPECIALIDAD, MOTIVO.VALOR_NO_ENCAJA]);
    expect(r.enContra[0].valores).toEqual({ n: 2 });
    expect(r.enContra[1].valores).toEqual({ n: 1 });
    expect(r.puntaje).toBe(0);
  });

  it('las estrellas suman y las faltas y llegadas tarde restan, con los meses mirados', () => {
    const r = evaluarCriteriosDelServicio(
      fila('a-1', { promedio_estrellas: '4.26', cantidad_calificaciones: 5, faltas_sin_aviso: 1, llegadas_tarde: 2 }),
      PESOS,
      { ...TOPES, meses_de_antecedentes: 12 }
    );
    expect(r.aFavor).toEqual([{ clave: MOTIVO.CALIFICACION, valores: { estrellas: 4.3, n: 5, meses: 12 } }]);
    expect(claves(r.enContra)).toEqual([MOTIVO.FALTAS_SIN_AVISO, MOTIVO.LLEGADAS_TARDE]);
    expect(r.enContra[1].valores).toEqual({ n: 2, meses: 12 });
    expect(r.puntaje).toBeCloseTo(
      4.26 * PESOS.calificacion_por_estrella + PESOS.falta_sin_aviso + 2 * PESOS.llegada_tarde
    );
  });

  it('un promedio sin calificaciones no opina', () => {
    const r = evaluarCriteriosDelServicio(fila('a-1', { promedio_estrellas: 5, cantidad_calificaciones: 0 }));
    expect(r.aFavor).toEqual([]);
  });
});

describe('dentro del cálculo de un turno de guardia', () => {
  const HUECO = {
    id: 'g-hueco',
    servicio_id: SERVICIO,
    fecha: '2026-09-20',
    hora_inicio: '08:00',
    hora_fin: '16:00',
    canal_modalidad: 'directa',
    paciente_ids: [],
  };
  const BUENA = activo('a-buena', 'Zulema Prueba');
  const PROHIBIDA = activo('a-prohibida', 'Beatriz Prueba');
  const datos = {
    asistentes: [PROHIBIDA, BUENA],
    turnos_guardia: [],
    ausencias: [],
    ahora: new Date('2026-09-18T10:00:00'),
    criterios: criterios(
      fila(PROHIBIDA.id, { tarea_prohibida: true }),
      fila(BUENA.id, { promedio_estrellas: 5, cantidad_calificaciones: 3 })
    ),
  };

  it('la tarea prohibida deja al Asistente bloqueado y al final', () => {
    const lista = candidatosParaTurnoGuardia(HUECO, datos);
    const prohibida = lista.find((c) => c.asistente.id === PROHIBIDA.id);
    expect(prohibida.bloqueado).toBe(true);
    expect(claves(prohibida.enContra)).toContain(MOTIVO.TAREA_PROHIBIDA);
    expect(lista[0].asistente.id).toBe(BUENA.id);
  });

  it('si la base no devolvió criterios, el resto del cálculo sigue igual', () => {
    const sin = candidatosParaTurnoGuardia(HUECO, { ...datos, criterios: undefined });
    expect(sin).toHaveLength(2);
    expect(sin.every((c) => !c.bloqueado)).toBe(true);
  });
});

describe('sin turnos de guardia', () => {
  const A = activo('a-a', 'Ana Prueba');
  const B = activo('a-b', 'Berta Prueba');
  const C = activo('a-c', 'Celia Prueba');

  it('ordena con los criterios del Servicio en vez de dar puntaje cero', () => {
    const lista = sugerenciasPara([], {
      asistentes: [A, B, C],
      servicio_id: SERVICIO,
      criterios: criterios(
        fila(A.id, { tarea_prohibida: true }),
        fila(C.id, { promedio_estrellas: 4, cantidad_calificaciones: 2 })
      ),
    });
    expect(lista.map((c) => c.asistente.id)).toEqual([C.id, B.id, A.id]);
    expect(lista[0].puntaje).toBe(Math.round(4 * PESOS.calificacion_por_estrella));
    expect(grupoDe(lista[2])).toBe(2);
  });

  it('sin Servicio nadie suma ni resta', () => {
    const lista = sugerenciasPara([], { asistentes: [A, B] });
    expect(lista.every((c) => c.puntaje === 0 && !c.bloqueado)).toBe(true);
  });
});

describe('los pesos y el tope nuevos', () => {
  it('se pueden tocar dentro de sus bordes, salvo la tarea prohibida, que bloquea', () => {
    for (const clave of ['lugar_no_aceptado', 'calificacion_por_estrella', 'falta_sin_aviso', 'llegada_tarde']) {
      const borde = PESOS_QUE_SE_PUEDEN_TOCAR[clave];
      expect(borde).toBeTruthy();
      expect(PESOS[clave]).toBeGreaterThanOrEqual(borde.minimo);
      expect(PESOS[clave]).toBeLessThanOrEqual(borde.maximo);
    }
    expect(PESOS_QUE_SE_PUEDEN_TOCAR.tarea_prohibida).toBeUndefined();
    expect(TOPES.meses_de_antecedentes).toBe(6);
    expect(TOPES_QUE_SE_PUEDEN_TOCAR.meses_de_antecedentes).toEqual({ minimo: 1, maximo: 24 });
  });

  it('los meses se escriben y se guardan enteros', () => {
    expect(bordeEnPantalla('meses_de_antecedentes', TOPES_QUE_SE_PUEDEN_TOCAR.meses_de_antecedentes).paso).toBe(1);
    expect(topeGuardado('meses_de_antecedentes', 7.6)).toBe(8);
    expect(topeGuardado('meses_de_antecedentes', '')).toBe('');
  });
});

describe('el rechazo al asignar', () => {
  const tm = { error_tarea_prohibida: 'Frase de prueba', error_bloquea: 'x {modalidad}', directa: 'directa' };

  it('reconoce el motivo del Backend y el mensaje de la base', () => {
    expect(esRechazoPorTareaProhibida('tarea_prohibida_bloquea')).toBe(true);
    expect(esRechazoPorTareaProhibida({ motivo: 'tarea_prohibida_bloquea' })).toBe(true);
    expect(esRechazoPorTareaProhibida({ code: '23514', message: 'tarea_prohibida_bloquea: turno g-1' })).toBe(true);
    expect(esRechazoPorTareaProhibida({ message: 'otra cosa tarea_prohibida_bloquea' })).toBe(false);
    expect(esRechazoPorTareaProhibida(null)).toBe(false);
  });

  it('toda pantalla que ya consulta la modalidad recibe la frase, nunca el texto crudo', () => {
    expect(mensajeDeTareaProhibida({ message: 'tarea_prohibida_bloquea:x' }, tm)).toBe('Frase de prueba');
    expect(mensajeDeModalidad({ message: 'tarea_prohibida_bloquea:x' }, tm)).toBe('Frase de prueba');
    expect(mensajeDeModalidad('tarea_prohibida_bloquea', tm)).toBe('Frase de prueba');
    expect(mensajeDeModalidad({ message: 'modalidad_bloquea:directa:' }, tm)).toBe('x directa');
    expect(mensajeDeModalidad({ message: 'Failed to fetch' }, tm)).toBeNull();
  });
});
