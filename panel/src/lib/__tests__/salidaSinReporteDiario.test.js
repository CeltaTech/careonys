import { describe, expect, it, vi } from 'vitest';

/* La «Salida sin Reporte Diario» en el Panel: el semáforo, los «Reportes que faltan» del tablero y
   las faltas del Legajo del Asistente. Con el sistema roto —el estado nuevo leído como un turno
   programado, la excepción que sólo mira los turnos completados o la falta que desaparece cuando
   llega el reporte— alguna de estas pruebas falla. Datos inventados. */

const respuestas = new Map();
const pedidos = [];

function consulta(tabla) {
  const pedido = { tabla, filtros: [] };
  pedidos.push(pedido);
  const cadena = {
    select: () => cadena,
    eq: (columna, valor) => { pedido.filtros.push(['eq', columna, valor]); return cadena; },
    in: (columna, valor) => { pedido.filtros.push(['in', columna, valor]); return cadena; },
    order: () => cadena,
    then: (listo, fallo) => Promise.resolve(respuestas.get(tabla) ?? { data: [], error: null }).then(listo, fallo),
  };
  return cadena;
}

vi.mock('../supabaseClient', () => ({ supabase: { from: (tabla) => consulta(tabla) } }));

import { SITUACION, estaActiva, situacionDeTurnoGuardia, tonoDeTurnoGuardia } from '../semaforoTurnoGuardia';
import { excepcionPorId, faltaElReporteDiario, resumenDeExcepciones } from '../excepciones';
import { TONO, tonoDeEstado } from '../tonos';
import { FALTA, cargarFaltasDelAsistente, faltaDelTurnoGuardia } from '../faltasDelAsistente';
import { T as translations } from '../../i18n/translations';

const turno = (cambios = {}) => ({
  id: 'g1',
  fecha: '2026-11-20',
  hora_inicio: '08:00:00',
  hora_fin: '20:00:00',
  dias_hasta_el_fin: 0,
  asistente_id: 'a1',
  checkin_at: '2026-11-20T11:00:00Z',
  checkout_at: '2026-11-20T23:00:00Z',
  estado: 'salida_sin_reporte',
  ...cambios,
});

describe('el semáforo con la salida sin Reporte Diario', () => {
  it('tiene su propia situación, en el tono de atención y nunca en rojo', () => {
    expect(situacionDeTurnoGuardia(turno())).toBe(SITUACION.SALIDA_SIN_REPORTE);
    expect(tonoDeTurnoGuardia(turno())).toBe(TONO.ATENCION);
    expect(tonoDeEstado('salida_sin_reporte')).toBe(TONO.ATENCION);
  });

  it('el turno ya no espera a nadie en la casa', () => {
    expect(estaActiva(turno())).toBe(false);
  });
});

describe('«Reportes que faltan» del tablero', () => {
  it('cuenta el turno en «Salida sin Reporte Diario» aunque no esté en la lista de los completados sin reporte', () => {
    expect(faltaElReporteDiario(turno(), { turnosGuardiaSinReporte: new Set() })).toBe(true);
    expect(excepcionPorId('reportes').aplica(turno(), {})).toBe(true);
  });

  it('sigue contando el turno completado al que le falta el reporte, y no el que lo tiene', () => {
    const completado = turno({ estado: 'completada' });
    expect(faltaElReporteDiario(completado, { turnosGuardiaSinReporte: new Set(['g1']) })).toBe(true);
    expect(faltaElReporteDiario(completado, { turnosGuardiaSinReporte: new Set() })).toBe(false);
  });

  it('nunca va en rojo', () => {
    const reportes = resumenDeExcepciones([turno()], {}).find((e) => e.id === 'reportes');
    expect(reportes.cantidad).toBe(1);
    expect(reportes.critica).toBe(false);
  });

  it('un turno que ya salió no cuenta como documentación por vencer', () => {
    const ctx = { asistentesConDocumentoPorVencer: new Set(['a1']) };
    expect(excepcionPorId('documentacion').aplica(turno(), ctx)).toBe(false);
    expect(excepcionPorId('documentos_pendientes').aplica(turno(), { asistentesConDocumentosPendientes: new Set(['a1']) })).toBe(false);
  });
});

describe('las faltas del Legajo del Asistente', () => {
  it('la falta queda aunque el reporte haya llegado, con la fecha en que llegó', () => {
    const falta = faltaDelTurnoGuardia({ id: 'g1', fecha: '2026-11-20', reporte_diario_llego_at: '2026-11-21T13:00:00Z' });
    expect(falta.falta).toBe(FALTA.SALIDA_SIN_REPORTE);
    expect(falta.reporteLlegoAt).toBe('2026-11-21T13:00:00Z');
  });

  it('mientras el reporte no llega, la fecha queda vacía', () => {
    expect(faltaDelTurnoGuardia({ id: 'g1', fecha: '2026-11-20' }).reporteLlegoAt).toBeNull();
  });

  it('se piden sólo los turnos del Asistente con la falta anotada, y vienen con el Paciente', async () => {
    respuestas.set('turnos_guardia', {
      data: [{ id: 'g1', fecha: '2026-11-20', hora_inicio: '08:00:00', paciente_id: 'p1', reporte_diario_llego_at: null }],
      error: null,
    });
    respuestas.set('turno_guardia_pacientes', { data: [{ turno_guardia_id: 'g1', paciente_id: 'p1' }], error: null });
    respuestas.set('pacientes', { data: [{ id: 'p1', persona: { nombre_visible: 'Elsa Prueba' } }], error: null });

    const faltas = await cargarFaltasDelAsistente('a1');

    const pedido = pedidos.find((p) => p.tabla === 'turnos_guardia');
    expect(pedido.filtros).toContainEqual(['eq', 'asistente_id', 'a1']);
    expect(pedido.filtros).toContainEqual(['eq', 'salio_sin_reporte_diario', true]);
    expect(faltas).toHaveLength(1);
    expect(faltas[0].pacientes_nombres).toEqual(['Elsa Prueba']);
    expect(faltas[0].reporteLlegoAt).toBeNull();
  });

  it('un error de la base se lanza para que lo muestre la pantalla', async () => {
    respuestas.set('turnos_guardia', { data: null, error: { message: 'falla inventada' } });
    await expect(cargarFaltasDelAsistente('a1')).rejects.toBeTruthy();
  });
});

describe('los textos en los tres idiomas', () => {
  it.each(Object.keys(translations))('%s nombra el estado, la situación y el bloque de faltas', (idioma) => {
    const t = translations[idioma];
    expect(t.turnos_guardia.estado_salida_sin_reporte).toBeTruthy();
    expect(t.turnos_guardia.situacion.salida_sin_reporte).toBeTruthy();
    for (const clave of ['titulo', 'col_fecha', 'col_paciente', 'col_falta', 'col_reporte', 'salida_sin_reporte', 'pendiente']) {
      expect(t.asistentes.faltas[clave]).toBeTruthy();
    }
  });
});
