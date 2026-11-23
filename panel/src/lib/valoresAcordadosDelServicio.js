/**
 * El valor acordado con cada Asistente para un Servicio.
 *
 * El valor del Legajo es lo que la persona pretende cobrar. Para un Servicio en particular se puede
 * acordar otro, que rige desde una fecha. Cada acuerdo nuevo es una fila más en
 * `valores_acordados_del_servicio`: no se pisa el anterior, y el que rige en un día es el de fecha
 * más reciente que no sea posterior a ese día.
 *
 * Reglas de la base que esta pantalla respeta:
 *   - Lee quien tenga el permiso `ver_pagos_asistente`; escribe sólo la administración con ese
 *     permiso. El Coordinador no ve nada.
 *   - Un valor por Servicio, Asistente y fecha: repetir la fecha da el error `23505`.
 *   - El valor es mayor que cero. Quién lo decidió lo pone la base.
 */
import { UNIDADES_POSIBLES } from './formaDePago';

/** Las unidades de un valor acordado: las mismas del Legajo. */
export const UNIDADES_ACORDADAS = UNIDADES_POSIBLES;

/** Lo que se pide de cada valor acordado. */
export const CAMPOS_DEL_VALOR_ACORDADO = 'id, asistente_id, rige_desde, unidad_medicion, valor, moneda, created_at';

/** El código con que la base rechaza dos valores del mismo Asistente con la misma fecha. */
export const RECHAZO_FECHA_REPETIDA = '23505';

/** Orden en que se revisan los casilleros, para saltar al primero que tenga un aviso. */
export const ORDEN_DE_LOS_CASILLEROS = ['rige_desde', 'unidad_medicion', 'valor', 'moneda'];

const FECHA_DEL_DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * El valor que rige para un Asistente en una fecha: el de fecha más reciente que no sea posterior.
 * Si todos son posteriores, el primero que va a regir. Sin ninguno, `null`.
 */
export function vigenteEn(filas, asistenteId, fecha) {
  const delAsistente = (filas ?? []).filter((fila) => fila.asistente_id === asistenteId && fila.rige_desde);
  if (delAsistente.length === 0) return null;
  const yaRigen = delAsistente.filter((fila) => fila.rige_desde <= fecha);
  if (yaRigen.length > 0) {
    return yaRigen.reduce((elegida, fila) => (fila.rige_desde > elegida.rige_desde ? fila : elegida));
  }
  return delAsistente.reduce((elegida, fila) => (fila.rige_desde < elegida.rige_desde ? fila : elegida));
}

/**
 * Cada Asistente del equipo con el valor acordado que rige en la fecha. `equipo` es una lista de
 * `{ asistente_id, nombre }`, en el orden en que se muestra.
 */
export function valoresDelEquipo(equipo, filas, fecha) {
  return (equipo ?? []).map((integrante) => ({
    ...integrante,
    vigente: vigenteEn(filas, integrante.asistente_id, fecha),
  }));
}

/** El formulario de un valor nuevo: rige desde hoy, por hora y en la moneda de la Prestadora. */
export function valorAcordadoNuevo({ hoy, moneda }) {
  return { rige_desde: hoy, unidad_medicion: UNIDADES_ACORDADAS[0], valor: '', moneda: moneda ?? '' };
}

/** Qué casillero tiene un dato que falta o está mal, y por qué. Vacío si está todo bien. */
export function revisarValorAcordado(escrito) {
  const avisos = {};
  if (typeof escrito?.rige_desde !== 'string' || !FECHA_DEL_DIA.test(escrito.rige_desde)) {
    avisos.rige_desde = 'falta_el_dato';
  }
  if (!UNIDADES_ACORDADAS.includes(escrito?.unidad_medicion)) avisos.unidad_medicion = 'falta_el_dato';
  if (escrito?.valor === '' || escrito?.valor === null || escrito?.valor === undefined) {
    avisos.valor = 'falta_el_dato';
  } else {
    const numero = Number(escrito.valor);
    if (!Number.isFinite(numero) || numero <= 0) avisos.valor = 'valor_no_valido';
  }
  if (!escrito?.moneda) avisos.moneda = 'falta_el_dato';
  return avisos;
}

/** El primer casillero con aviso, en el orden del formulario. */
export function primerCasilleroConAviso(avisos) {
  return ORDEN_DE_LOS_CASILLEROS.find((casillero) => avisos?.[casillero]) ?? null;
}

/** La fila que se guarda. Quién lo decidió no va: lo pone la base. */
export function filaDelValorAcordado({ prestadoraId, servicioId, asistenteId, escrito }) {
  return {
    prestadora_id: prestadoraId,
    servicio_id: servicioId,
    asistente_id: asistenteId,
    rige_desde: escrito.rige_desde,
    unidad_medicion: escrito.unidad_medicion,
    valor: Number(escrito.valor),
    moneda: escrito.moneda,
  };
}

/** Si la base rechazó el valor por tener la misma fecha que otro del mismo Asistente. */
export function esFechaRepetida(error) {
  return error?.code === RECHAZO_FECHA_REPETIDA;
}
