import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { comoSeFactura, diaDeLlegadaDelReporte, fechaDeLiquidacion } from '../reporteDiarioTardio.js';

/* En qué día se factura y se liquida el turno de guardia en el que el Asistente salió sin Reporte
   Diario. Los datos son inventados. */

const ZONA = 'America/Argentina/Buenos_Aires';
const POR_HORA = { zona: ZONA, medicion: 'hora' };
const POR_LO_PACTADO = { zona: ZONA, medicion: 'pactado_mas_excedente' };

const unTurno = (cambios) => ({
  id: 'g-1',
  fecha: '2026-08-30',
  estado: 'completada',
  salio_sin_reporte_diario: false,
  reporte_diario_llego_at: null,
  factura_espera_el_reporte_diario: false,
  ...cambios,
});

describe('el día en que llegó el reporte', () => {
  it('se cuenta en la zona de la Prestadora', () => {
    // Las 2 de la mañana del 1 de septiembre en tiempo universal son las 11 de la noche del 31 de agosto en Buenos Aires.
    const turno = unTurno({ salio_sin_reporte_diario: true, reporte_diario_llego_at: '2026-09-01T02:00:00.000Z' });
    assert.equal(diaDeLlegadaDelReporte(turno, ZONA), '2026-08-31');
  });

  it('no hay día si el turno no salió sin reporte o si el reporte no llegó', () => {
    assert.equal(diaDeLlegadaDelReporte(unTurno({ reporte_diario_llego_at: '2026-09-01T13:00:00.000Z' }), ZONA), null);
    assert.equal(diaDeLlegadaDelReporte(unTurno({ salio_sin_reporte_diario: true }), ZONA), null);
  });
});

describe('la factura del Cliente', () => {
  it('el turno sin reporte se factura como completado si la Prestadora no eligió esperar', () => {
    const turno = unTurno({ estado: 'salida_sin_reporte', salio_sin_reporte_diario: true });
    assert.deepEqual(comoSeFactura(turno, POR_HORA), { ...turno, estado: 'completada' });
  });

  it('el turno sin reporte no se factura mientras espera el reporte', () => {
    const turno = unTurno({ estado: 'salida_sin_reporte', salio_sin_reporte_diario: true, factura_espera_el_reporte_diario: true });
    assert.equal(comoSeFactura(turno, POR_HORA), null);
  });

  it('cuando llega el reporte, se factura el día más tardío entre su fecha y la llegada', () => {
    const tarde = unTurno({ salio_sin_reporte_diario: true, factura_espera_el_reporte_diario: true, reporte_diario_llego_at: '2026-09-02T13:00:00.000Z' });
    assert.equal(comoSeFactura(tarde, POR_HORA).fecha, '2026-09-02');
    const aTiempo = unTurno({ salio_sin_reporte_diario: true, factura_espera_el_reporte_diario: true, reporte_diario_llego_at: '2026-08-30T22:00:00.000Z' });
    assert.equal(comoSeFactura(aTiempo, POR_HORA).fecha, '2026-08-30');
  });

  it('con la medición por lo pactado no se espera', () => {
    const sinReporte = unTurno({ estado: 'salida_sin_reporte', salio_sin_reporte_diario: true, factura_espera_el_reporte_diario: true });
    assert.equal(comoSeFactura(sinReporte, POR_LO_PACTADO).estado, 'completada');
    const tarde = unTurno({ salio_sin_reporte_diario: true, factura_espera_el_reporte_diario: true, reporte_diario_llego_at: '2026-09-02T13:00:00.000Z' });
    assert.equal(comoSeFactura(tarde, POR_LO_PACTADO).fecha, '2026-08-30');
  });

  it('un turno corriente queda como está', () => {
    const turno = unTurno({ estado: 'ausente' });
    assert.equal(comoSeFactura(turno, POR_HORA), turno);
  });
});

describe('la liquidación del Asistente', () => {
  it('mientras falta el reporte, el turno no se liquida', () => {
    assert.equal(fechaDeLiquidacion(unTurno({ estado: 'salida_sin_reporte', salio_sin_reporte_diario: true }), ZONA), null);
  });

  it('el reporte tardío lo pasa al día en que llegó', () => {
    const turno = unTurno({ salio_sin_reporte_diario: true, reporte_diario_llego_at: '2026-09-02T13:00:00.000Z' });
    assert.equal(fechaDeLiquidacion(turno, ZONA), '2026-09-02');
  });

  it('un turno corriente se liquida en su fecha', () => {
    assert.equal(fechaDeLiquidacion(unTurno({}), ZONA), '2026-08-30');
  });
});
