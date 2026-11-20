// El cronograma de guardias de una Prestación: qué días y en qué horario el Servicio tiene que
// estar cubierto para ese Paciente. Una guardia es una fila del cronograma: o se repite los días
// de la semana marcados, o es de una sola fecha.
//
// Acá viven las cuentas que necesitan dos pantallas —el editor del cronograma y el alta del turno
// de guardia—, para que la regla no quede escrita dos veces. La regla que manda es la de la base:
// esto sólo evita mandarle algo que va a rechazar.

import { correElDia } from './vigenciaPrestacion';

export const DIAS_SEMANA = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

/** Los días que puede durar una guardia o un turno de guardia después del día en que empieza. */
export const DIAS_HASTA_EL_FIN = [0, 1, 2, 3];

const DIA_DE_LA_FECHA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

/** El día de la semana de una fecha `AAAA-MM-DD`, leída como día local. */
export function diaDeLaSemana(fechaISO) {
  if (!fechaISO) return null;
  const momento = new Date(`${fechaISO}T00:00:00`);
  return Number.isNaN(momento.getTime()) ? null : DIA_DE_LA_FECHA[momento.getDay()];
}

/** La hora como la devuelve la base (`08:00:00`) recortada a como la usa un casillero (`08:00`). */
export function horaCorta(hora) {
  return hora ? String(hora).slice(0, 5) : '';
}

function minutos(hora) {
  const [h, m] = horaCorta(hora).split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

/** Inicio y fin en minutos contados desde la medianoche del día en que empieza. */
function tramo({ hora_inicio, hora_fin, dias_hasta_el_fin }) {
  const inicio = minutos(hora_inicio);
  const fin = minutos(hora_fin);
  if (inicio === null || fin === null) return null;
  return { inicio, fin: Number(dias_hasta_el_fin ?? 0) * 24 * 60 + fin };
}

/** Si la guardia dura algo: con 0 días hasta el fin, la hora de fin tiene que ser posterior. */
export function duraAlgo(horario) {
  const t = tramo(horario);
  return Boolean(t) && t.fin > t.inicio;
}

/**
 * Qué le falta a una guardia antes de mandarla a la base. Devuelve un objeto con un motivo por
 * casillero; vacío quiere decir que está completa.
 */
export function faltantesDeLaGuardia({ repite, dias_semana, fecha, hora_inicio, hora_fin, dias_hasta_el_fin }) {
  const faltan = {};
  if (repite && (!dias_semana || dias_semana.length === 0)) faltan.dias_semana = 'faltan_dias';
  if (!repite && !fecha) faltan.fecha = 'falta_fecha';
  if (!hora_inicio) faltan.hora_inicio = 'falta_hora';
  if (!hora_fin) faltan.hora_fin = 'falta_hora';
  if (hora_inicio && hora_fin && !duraAlgo({ hora_inicio, hora_fin, dias_hasta_el_fin })) {
    faltan.hora_fin = 'no_dura';
  }
  return faltan;
}

/** Si la guardia corresponde a esa fecha: por el día de la semana, o por ser de esa fecha. */
export function guardiaDelDia(guardia, fechaISO) {
  if (!guardia || !fechaISO) return false;
  if (guardia.fecha) return guardia.fecha === fechaISO;
  return (guardia.dias_semana ?? []).includes(diaDeLaSemana(fechaISO));
}

/**
 * Las guardias que le sirven a un turno de guardia suelto de esa fecha: las que corresponden al
 * día y cuya Prestación corre ese día. Cada guardia trae su Prestación en `prestaciones`.
 */
export function guardiasParaLaFecha(guardias, fechaISO) {
  if (!fechaISO) return [];
  return (guardias ?? []).filter((g) => guardiaDelDia(g, fechaISO) && correElDia(g.prestaciones, fechaISO));
}

/**
 * Las guardias que le sirven a un turno de guardia recurrente que empieza ese día: las que se
 * repiten por día de la semana y cuya Prestación corre ese día.
 */
export function guardiasParaElRecurrente(guardias, desdeISO) {
  if (!desdeISO) return [];
  return (guardias ?? []).filter((g) => !g.fecha && (g.dias_semana ?? []).length > 0 && correElDia(g.prestaciones, desdeISO));
}

/**
 * Elegir o soltar una guardia. Se elige una sola por Prestación: elegir otra de la misma
 * Prestación reemplaza a la anterior.
 */
export function alternarGuardia(elegidas, guardia) {
  if (elegidas.some((g) => g.id === guardia.id)) return elegidas.filter((g) => g.id !== guardia.id);
  return [...elegidas.filter((g) => g.prestacion_id !== guardia.prestacion_id), guardia];
}

/** Los Pacientes de las guardias elegidas, sin repetir y en el orden en que se eligieron. */
export function pacientesDeLasGuardias(elegidas) {
  const ids = [];
  for (const g of elegidas ?? []) {
    const id = g.prestaciones?.paciente_id;
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Los días de la semana que tienen todas las guardias elegidas, en el orden de la semana. */
export function diasEnComun(elegidas) {
  if (!elegidas || elegidas.length === 0) return [];
  return DIAS_SEMANA.filter((dia) => elegidas.every((g) => (g.dias_semana ?? []).includes(dia)));
}

/** Si el horario del turno de guardia queda adentro del horario de la guardia. Se puede achicar, no agrandar. */
export function cabeEnLaGuardia(horario, guardia) {
  const turno = tramo(horario);
  const deLaGuardia = tramo(guardia);
  if (!turno || !deLaGuardia || turno.fin <= turno.inicio) return false;
  return turno.inicio >= deLaGuardia.inicio && turno.fin <= deLaGuardia.fin;
}

/** Si el horario del turno de guardia queda adentro de cada una de las guardias elegidas. */
export function cabeEnTodas(horario, elegidas) {
  return (elegidas ?? []).length > 0 && elegidas.every((g) => cabeEnLaGuardia(horario, g));
}
