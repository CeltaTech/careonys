import { describe, it, expect } from 'vitest';
import { T } from '../../i18n/translations.js';
import {
  MOTIVOS_DE_LA_HORA,
  errorDeLaHora,
  horaPropuestaDeSalida,
  motivosQueSeEligen,
  nombreDelMotivoDeSalida,
  revisarCierre,
} from '../cierreDelTurnoGuardia.js';

const t = T['es-AR'];

describe('errorDeLaHora', () => {
  it('lleva al pie del casillero cada motivo de la hora, en los tres idiomas', () => {
    for (const idioma of Object.keys(T)) {
      for (const motivo of MOTIVOS_DE_LA_HORA) {
        const texto = errorDeLaHora({ motivo }, T[idioma]);
        expect(texto, `${idioma} ${motivo}`).toBeTruthy();
        expect(T[idioma].errores.motivos[motivo]).toBe(texto);
      }
    }
  });

  it('deja los demás errores para la franja de la ventana', () => {
    expect(errorDeLaHora({ motivo: 'sin_permiso' }, t)).toBeNull();
    expect(errorDeLaHora(new Error('cualquiera'), t)).toBeNull();
    expect(errorDeLaHora(null, t)).toBeNull();
  });
});

describe('horaPropuestaDeSalida', () => {
  const ahora = new Date('2026-11-20T20:00:00Z');

  it('propone la última vez que se supo que el Asistente estaba en la casa', () => {
    const turno = { checkin_at: '2026-11-20T08:00:00Z', ubicacion_actual_at: '2026-11-20T15:00:00Z' };
    const comprobaciones = [{ comprobada_en: '2026-11-20T17:30:00Z' }, { comprobada_en: null }];
    expect(horaPropuestaDeSalida(turno, comprobaciones, ahora).toISOString()).toBe('2026-11-20T17:30:00.000Z');
  });

  it('sin otro dato propone la llegada', () => {
    expect(horaPropuestaDeSalida({ checkin_at: '2026-11-20T08:00:00Z' }, [], ahora).toISOString()).toBe(
      '2026-11-20T08:00:00.000Z',
    );
  });

  it('nunca propone una hora posterior a este momento', () => {
    const turno = { checkin_at: '2026-11-20T08:00:00Z', ubicacion_actual_at: '2026-11-21T08:00:00Z' };
    expect(horaPropuestaDeSalida(turno, [], ahora).toISOString()).toBe('2026-11-20T08:00:00.000Z');
  });

  it('sin ningún dato no propone nada', () => {
    expect(horaPropuestaDeSalida({}, [], ahora)).toBeNull();
    expect(horaPropuestaDeSalida(null, null, ahora)).toBeNull();
  });
});

describe('motivosQueSeEligen', () => {
  it('deja afuera los motivos que escribe el sistema', () => {
    const filas = [
      { clave: 'otro', lo_escribe_el_sistema: false },
      { clave: 'paciente_solo_con_permiso', lo_escribe_el_sistema: true },
    ];
    expect(motivosQueSeEligen(filas).map((f) => f.clave)).toEqual(['otro']);
    expect(motivosQueSeEligen(null)).toEqual([]);
  });
});

describe('nombreDelMotivoDeSalida', () => {
  it('traduce los motivos del producto por su clave en los tres idiomas', () => {
    const claves = [
      'fallo_el_telefono_del_asistente',
      'fallo_la_ubicacion_del_asistente',
      'lo_cubrio_el_coordinador',
      'se_olvido_de_marcar_la_salida',
      'paciente_solo_con_permiso',
      'otro',
    ];
    for (const idioma of Object.keys(T)) {
      for (const clave of claves) {
        expect(nombreDelMotivoDeSalida({ clave, nombre: 'x' }, T[idioma]), `${idioma} ${clave}`).toBe(
          T[idioma].cierre_turno_guardia.motivos[clave],
        );
      }
    }
  });

  it('muestra tal cual el nombre de un motivo propio de la Prestadora', () => {
    expect(nombreDelMotivoDeSalida({ clave: 'propio_1', nombre: 'Corte de luz' }, t)).toBe('Corte de luz');
    expect(nombreDelMotivoDeSalida({ clave: null, nombre: 'Corte de luz' }, t)).toBe('Corte de luz');
    expect(nombreDelMotivoDeSalida(null, t)).toBe('');
  });
});

describe('revisarCierre', () => {
  it('marca a la vez todos los casilleros que faltan', () => {
    expect(revisarCierre({ motivo: null, detalle: '', hora: '' }, t)).toEqual({
      motivo: t.cierre_turno_guardia.falta_motivo,
      hora: t.cierre_turno_guardia.errores_hora.hora_de_salida_obligatoria,
    });
  });

  it('pide el detalle sólo cuando el motivo lo pide', () => {
    expect(revisarCierre({ motivo: { pide_detalle: true }, detalle: '  ', hora: 'x' }, t)).toEqual({
      detalle: t.cierre_turno_guardia.falta_detalle,
    });
    expect(revisarCierre({ motivo: { pide_detalle: false }, detalle: '', hora: 'x' }, t)).toEqual({});
  });
});
