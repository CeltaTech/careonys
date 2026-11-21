import { describe, expect, it } from 'vitest';
import {
  UNIDADES_ACORDADAS,
  esFechaRepetida,
  filaDelValorAcordado,
  primerCasilleroConAviso,
  revisarValorAcordado,
  valorAcordadoNuevo,
  valoresDelEquipo,
  vigenteEn,
} from '../valoresAcordadosDelServicio';

// Datos inventados.
const FILAS = [
  { id: 'f-1', asistente_id: 'a-1', rige_desde: '2027-01-01', unidad_medicion: 'hora', valor: 1000, moneda: 'ARS' },
  { id: 'f-2', asistente_id: 'a-1', rige_desde: '2027-03-01', unidad_medicion: 'hora', valor: 1200, moneda: 'ARS' },
  { id: 'f-3', asistente_id: 'a-1', rige_desde: '2027-06-01', unidad_medicion: 'mes', valor: 400000, moneda: 'ARS' },
  { id: 'f-4', asistente_id: 'a-2', rige_desde: '2027-09-01', unidad_medicion: 'turno_guardia', valor: 30000, moneda: 'ARS' },
];

describe('UNIDADES_ACORDADAS', () => {
  it('trae las del Legajo y el mes', () => {
    expect(UNIDADES_ACORDADAS).toEqual(['hora', 'turno_guardia', 'semana', 'mes']);
  });
});

describe('vigenteEn', () => {
  it('elige el de fecha más reciente que no sea posterior', () => {
    expect(vigenteEn(FILAS, 'a-1', '2027-04-15').id).toBe('f-2');
    expect(vigenteEn(FILAS, 'a-1', '2027-03-01').id).toBe('f-2');
    expect(vigenteEn(FILAS, 'a-1', '2027-12-31').id).toBe('f-3');
  });

  it('si todos son posteriores, devuelve el primero que va a regir', () => {
    expect(vigenteEn(FILAS, 'a-2', '2027-04-15').id).toBe('f-4');
  });

  it('sin valores del Asistente devuelve null', () => {
    expect(vigenteEn(FILAS, 'a-3', '2027-04-15')).toBeNull();
    expect(vigenteEn(null, 'a-1', '2027-04-15')).toBeNull();
  });
});

describe('valoresDelEquipo', () => {
  it('suma a cada integrante su valor vigente y respeta el orden', () => {
    const equipo = [
      { asistente_id: 'a-3', nombre: 'Alba Ruiz' },
      { asistente_id: 'a-1', nombre: 'Bruno Sosa' },
    ];
    const renglones = valoresDelEquipo(equipo, FILAS, '2027-04-15');
    expect(renglones.map((r) => r.asistente_id)).toEqual(['a-3', 'a-1']);
    expect(renglones[0].vigente).toBeNull();
    expect(renglones[1].vigente.id).toBe('f-2');
  });
});

describe('valorAcordadoNuevo', () => {
  it('arranca hoy, por hora y en la moneda dada', () => {
    expect(valorAcordadoNuevo({ hoy: '2027-04-15', moneda: 'UYU' })).toEqual({
      rige_desde: '2027-04-15',
      unidad_medicion: 'hora',
      valor: '',
      moneda: 'UYU',
    });
    expect(valorAcordadoNuevo({ hoy: '2027-04-15' }).moneda).toBe('');
  });
});

describe('revisarValorAcordado', () => {
  const completo = { rige_desde: '2027-04-15', unidad_medicion: 'mes', valor: '350000', moneda: 'ARS' };

  it('sin avisos cuando está todo cargado', () => {
    expect(revisarValorAcordado(completo)).toEqual({});
  });

  it('avisa lo que falta', () => {
    expect(revisarValorAcordado({ rige_desde: '', unidad_medicion: 'dia', valor: '', moneda: '' })).toEqual({
      rige_desde: 'falta_el_dato',
      unidad_medicion: 'falta_el_dato',
      valor: 'falta_el_dato',
      moneda: 'falta_el_dato',
    });
  });

  it('un valor cero, negativo o que no es número no es válido', () => {
    expect(revisarValorAcordado({ ...completo, valor: '0' }).valor).toBe('valor_no_valido');
    expect(revisarValorAcordado({ ...completo, valor: '-5' }).valor).toBe('valor_no_valido');
    expect(revisarValorAcordado({ ...completo, valor: 'abc' }).valor).toBe('valor_no_valido');
  });
});

describe('primerCasilleroConAviso', () => {
  it('sigue el orden del formulario', () => {
    expect(primerCasilleroConAviso({ moneda: 'falta_el_dato', valor: 'valor_no_valido' })).toBe('valor');
    expect(primerCasilleroConAviso({})).toBeNull();
  });
});

describe('filaDelValorAcordado', () => {
  it('arma la fila con el valor como número y sin quién lo decidió', () => {
    const fila = filaDelValorAcordado({
      prestadoraId: 'p-1',
      servicioId: 's-1',
      asistenteId: 'a-1',
      escrito: { rige_desde: '2027-04-15', unidad_medicion: 'semana', valor: '90000.5', moneda: 'ARS' },
    });
    expect(fila).toEqual({
      prestadora_id: 'p-1',
      servicio_id: 's-1',
      asistente_id: 'a-1',
      rige_desde: '2027-04-15',
      unidad_medicion: 'semana',
      valor: 90000.5,
      moneda: 'ARS',
    });
  });
});

describe('esFechaRepetida', () => {
  it('reconoce el rechazo por fecha repetida', () => {
    expect(esFechaRepetida({ code: '23505' })).toBe(true);
    expect(esFechaRepetida({ code: '23514' })).toBe(false);
    expect(esFechaRepetida(undefined)).toBe(false);
  });
});
