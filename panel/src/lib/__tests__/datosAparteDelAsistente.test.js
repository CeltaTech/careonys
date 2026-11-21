import { describe, expect, it } from 'vitest';
import { CAMPOS_PAGO, conDatosAparte } from '../datosAparteDelAsistente';

// Datos inventados.
describe('conDatosAparte: valor del Legajo', () => {
  it('pide la moneda y la fecha desde la que rige', () => {
    expect(CAMPOS_PAGO).toContain('moneda');
    expect(CAMPOS_PAGO).toContain('rige_desde');
  });

  it('deja la moneda y la fecha con su propio nombre', () => {
    const asistente = conDatosAparte({
      id: 'a-1',
      nombre: 'Ana Prueba',
      remuneraciones_asistente: [
        { unidad_medicion: 'hora', valor_hora: 1500, moneda: 'ARS', rige_desde: '2027-02-01', frecuencia_pago: {} },
      ],
    });
    expect(asistente).toMatchObject({
      valor_hora: 1500,
      moneda_pago: 'ARS',
      rige_desde_pago: '2027-02-01',
    });
    expect('moneda' in asistente).toBe(false);
    expect('rige_desde' in asistente).toBe(false);
  });

  it('sin valor cargado quedan vacías', () => {
    const asistente = conDatosAparte({ id: 'a-2', nombre: 'Beto Prueba', remuneraciones_asistente: null });
    expect(asistente.moneda_pago).toBeNull();
    expect(asistente.rige_desde_pago).toBeNull();
  });
});
