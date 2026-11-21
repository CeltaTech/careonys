import { describe, expect, it } from 'vitest';
import {
  diaDeLaSemanaDespues,
  duracionVisible,
  esCantidadDeDias,
  faltantesDeLaGuardia,
  horasDelHorario,
  partesDeLaDuracion,
  textoDelFaltante,
  tramosDeLaGuardia,
  tramoVisible,
} from '../cronogramaDeGuardias';

// Textos de prueba con la misma forma que los del catálogo, para que estas pruebas no dependan de
// que las frases nuevas ya estén cargadas en las traducciones.
const t = {
  formularios: { falta_un_dato_obligatorio: 'Falta' },
  turnos_guardia: {
    nuevo_turno_guardia: {
      dias: {
        lunes: 'Lunes',
        martes: 'Martes',
        miercoles: 'Miércoles',
        jueves: 'Jueves',
        viernes: 'Viernes',
        sabado: 'Sábado',
        domingo: 'Domingo',
      },
      duracion_en_horas: '{horas} h',
      duracion_un_dia: '1 día',
      duracion_varios_dias: '{dias} días',
      duracion_con_dias: '{horas} h ({dias})',
      duracion_con_dias_y_horas: '{horas} h ({dias} y {resto} h)',
      tramo: '{comienzo} – {fin}',
      error_dias_semana: 'Marque los días',
      error_fin_antes_del_comienzo: 'Fin antes del comienzo',
      error_dias_hasta_el_fin: 'Días inválidos',
    },
  },
};

describe('diaDeLaSemanaDespues', () => {
  it('da la vuelta a la semana sin tope', () => {
    expect(diaDeLaSemanaDespues('lunes', 0)).toBe('lunes');
    expect(diaDeLaSemanaDespues('viernes', 3)).toBe('lunes');
    expect(diaDeLaSemanaDespues('lunes', 10)).toBe('jueves');
    expect(diaDeLaSemanaDespues('domingo', 14)).toBe('domingo');
  });
});

describe('tramosDeLaGuardia', () => {
  it('una guardia de viernes 20:00 que termina tres días después termina el lunes 08:00', () => {
    const g = { dias_semana: ['viernes'], hora_inicio: '20:00:00', hora_fin: '08:00:00', dias_hasta_el_fin: 3 };
    expect(tramosDeLaGuardia(g)).toEqual([
      { comienzo: { dia: 'viernes', hora: '20:00' }, fin: { dia: 'lunes', hora: '08:00' } },
    ]);
    expect(horasDelHorario(g)).toBe(60);
    expect(tramoVisible(tramosDeLaGuardia(g)[0], t, 'es-AR')).toBe('Viernes 20:00 – Lunes 08:00');
  });

  it('una guardia de una sola fecha da su fecha de fin, aunque dure cuatro días', () => {
    const g = { fecha: '2026-11-20', hora_inicio: '08:00', hora_fin: '08:00', dias_hasta_el_fin: 4 };
    expect(tramosDeLaGuardia(g)).toEqual([
      { comienzo: { fecha: '2026-11-20', hora: '08:00' }, fin: { fecha: '2026-11-24', hora: '08:00' } },
    ]);
    expect(horasDelHorario(g)).toBe(96);
  });

  it('una guardia que se repite da un tramo por día marcado, en el orden de la semana', () => {
    const g = { dias_semana: ['miercoles', 'lunes'], hora_inicio: '22:00', hora_fin: '06:00', dias_hasta_el_fin: 1 };
    expect(tramosDeLaGuardia(g).map((tr) => [tr.comienzo.dia, tr.fin.dia])).toEqual([
      ['lunes', 'martes'],
      ['miercoles', 'jueves'],
    ]);
  });
});

describe('faltantesDeLaGuardia', () => {
  const base = { repite: true, dias_semana: ['lunes'], hora_inicio: '08:00', hora_fin: '08:00' };

  it('guardias de 5 y de 10 días están completas: no hay tope', () => {
    expect(faltantesDeLaGuardia({ ...base, dias_hasta_el_fin: '5' })).toEqual({});
    expect(faltantesDeLaGuardia({ ...base, dias_hasta_el_fin: '10' })).toEqual({});
    expect(faltantesDeLaGuardia({ repite: false, fecha: '2026-11-20', hora_inicio: '08:00', hora_fin: '08:00', dias_hasta_el_fin: '10' })).toEqual({});
  });

  it('un fin anterior al comienzo se avisa en la hora de fin', () => {
    const f = faltantesDeLaGuardia({ repite: false, fecha: '2026-11-20', hora_inicio: '08:00', hora_fin: '20:00', dias_hasta_el_fin: '-1' });
    expect(f).toEqual({ hora_fin: 'no_dura' });
    expect(textoDelFaltante(f.hora_fin, t)).toBe('Fin antes del comienzo');
  });

  it('el mismo día con la hora de fin igual a la de comienzo no dura nada', () => {
    expect(faltantesDeLaGuardia({ ...base, dias_hasta_el_fin: '0' })).toEqual({ hora_fin: 'no_dura' });
  });

  it('los días que se repiten tienen que ser un entero de cero o más', () => {
    expect(faltantesDeLaGuardia({ ...base, dias_hasta_el_fin: '-2' }).dias_hasta_el_fin).toBe('dias_invalidos');
    expect(faltantesDeLaGuardia({ ...base, dias_hasta_el_fin: '1.5' }).dias_hasta_el_fin).toBe('dias_invalidos');
    expect(faltantesDeLaGuardia({ ...base, dias_hasta_el_fin: '' }).dias_hasta_el_fin).toBe('falta_dato');
    expect(esCantidadDeDias('30')).toBe(true);
  });

  it('sin días marcados ni fecha de fin, avisa cada casillero', () => {
    expect(faltantesDeLaGuardia({ ...base, dias_semana: [], dias_hasta_el_fin: '1' }).dias_semana).toBe('faltan_dias');
    expect(faltantesDeLaGuardia({ repite: false, fecha: '2026-11-20', hora_inicio: '08:00', hora_fin: '08:00', dias_hasta_el_fin: '' }).fecha_fin).toBe('falta_fecha');
  });
});

describe('la duración como dato', () => {
  it('parte las horas en días y horas sueltas', () => {
    expect(partesDeLaDuracion(60)).toEqual({ horas: 60, dias: 2, resto: 12 });
    expect(partesDeLaDuracion(0)).toBeNull();
  });

  it('muestra los días sólo cuando pasa de 24 horas', () => {
    expect(duracionVisible(8, t)).toBe('8 h');
    expect(duracionVisible(24, t)).toBe('24 h');
    expect(duracionVisible(36, t)).toBe('36 h (1 día y 12 h)');
    expect(duracionVisible(60, t)).toBe('60 h (2 días y 12 h)');
    expect(duracionVisible(96, t)).toBe('96 h (4 días)');
    expect(duracionVisible(null, t)).toBe('—');
  });
});
