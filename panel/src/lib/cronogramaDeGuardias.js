// El cronograma de guardias de una Prestación: qué días y en qué horario el Servicio tiene que
// estar cubierto para ese Paciente. Una guardia es una fila del cronograma: o se repite los días
// de la semana marcados, o es de una sola fecha.
//
// Acá viven las cuentas que necesitan dos pantallas —el editor del cronograma y el alta del turno
// de guardia—, para que la regla no quede escrita dos veces. La regla que manda es la de la base:
// esto sólo evita mandarle algo que va a rechazar.

import { correElDia } from './vigenciaPrestacion';
import { fechaVisible } from './fechaVisible';
import { horasDeTurnoGuardia, sumarDias } from './horarios';

export const DIAS_SEMANA = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

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

/** Si la guardia dura algo: el fin, contado con sus días, tiene que caer después del comienzo. */
export function duraAlgo(horario) {
  const t = tramo(horario);
  return Boolean(t) && t.fin > t.inicio;
}

/** Si el valor es una cantidad de días hasta el fin que se puede guardar: un entero, cero o más. Sin tope. */
export function esCantidadDeDias(valor) {
  return /^\d+$/.test(String(valor ?? '').trim());
}

/**
 * Qué le falta a una guardia o a un turno de guardia antes de mandarlo a la base. Devuelve un
 * objeto con un motivo por casillero; vacío quiere decir que está completo.
 *
 * Con una sola fecha, `dias_hasta_el_fin` sale de la fecha de fin elegida y puede llegar negativo
 * si el fin quedó antes del comienzo: eso se avisa como «no dura». Cuando se repite por día de la
 * semana, los días se escriben a mano y tienen que ser un entero de cero o más.
 */
export function faltantesDeLaGuardia({ repite, dias_semana, fecha, hora_inicio, hora_fin, dias_hasta_el_fin }) {
  const faltan = {};
  const dias = String(dias_hasta_el_fin ?? '').trim();
  const diasEscritos = /^-?\d+$/.test(dias);
  if (repite && (!dias_semana || dias_semana.length === 0)) faltan.dias_semana = 'faltan_dias';
  if (!repite && !fecha) faltan.fecha = 'falta_fecha';
  if (!hora_inicio) faltan.hora_inicio = 'falta_hora';
  if (repite && !esCantidadDeDias(dias)) faltan.dias_hasta_el_fin = dias === '' ? 'falta_dato' : 'dias_invalidos';
  if (!repite && fecha && !diasEscritos) faltan.fecha_fin = 'falta_fecha';
  if (!hora_fin) faltan.hora_fin = 'falta_hora';
  else if (hora_inicio && diasEscritos && !duraAlgo({ hora_inicio, hora_fin, dias_hasta_el_fin: Number(dias) })) {
    faltan.hora_fin = 'no_dura';
  }
  return faltan;
}

/** El texto que se muestra al pie del casillero para cada motivo de `faltantesDeLaGuardia`. */
export function textoDelFaltante(motivo, t) {
  const textos = t.turnos_guardia.nuevo_turno_guardia;
  if (motivo === 'faltan_dias') return textos.error_dias_semana;
  if (motivo === 'no_dura') return textos.error_fin_antes_del_comienzo;
  if (motivo === 'dias_invalidos') return textos.error_dias_hasta_el_fin;
  return t.formularios.falta_un_dato_obligatorio;
}

/** El día de la semana que cae `n` días después de `dia`. Sin tope: 10 días después de un lunes es jueves. */
export function diaDeLaSemanaDespues(dia, n) {
  const i = DIAS_SEMANA.indexOf(dia);
  if (i < 0 || !Number.isInteger(n)) return null;
  return DIAS_SEMANA[(((i + n) % 7) + 7) % 7];
}

/**
 * Cuándo empieza y cuándo termina una guardia o un turno de guardia, como se le muestra a la
 * persona. Una fecha da un solo tramo, con fecha de comienzo y de fin; una guardia que se repite
 * da un tramo por cada día marcado, en el orden de la semana, con el día de la semana del fin.
 * Cada punta es `{ fecha, hora }` o `{ dia, hora }`.
 */
export function tramosDeLaGuardia({ fecha, dias_semana, hora_inicio, hora_fin, dias_hasta_el_fin }) {
  const dias = Number(dias_hasta_el_fin ?? 0);
  if (!Number.isInteger(dias)) return [];
  const inicio = horaCorta(hora_inicio);
  const fin = horaCorta(hora_fin);
  if (fecha) {
    return [{ comienzo: { fecha, hora: inicio }, fin: { fecha: sumarDias(fecha, dias), hora: fin } }];
  }
  return DIAS_SEMANA.filter((d) => (dias_semana ?? []).includes(d)).map((d) => ({
    comienzo: { dia: d, hora: inicio },
    fin: { dia: diaDeLaSemanaDespues(d, dias), hora: fin },
  }));
}

/** Cuántas horas dura un horario, o `null` si todavía no se puede saber o no dura nada. */
export function horasDelHorario({ hora_inicio, hora_fin, dias_hasta_el_fin }) {
  const dias = String(dias_hasta_el_fin ?? '').trim();
  if (!hora_inicio || !hora_fin || !/^-?\d+$/.test(dias)) return null;
  const horas = horasDeTurnoGuardia({
    fecha: '2000-01-01', // un día cualquiera: cuánto dura no depende de qué día sea
    hora_inicio: horaCorta(hora_inicio),
    hora_fin: horaCorta(hora_fin),
    dias_hasta_el_fin: Number(dias),
  });
  return Number.isFinite(horas) && horas > 0 ? Math.round(horas * 100) / 100 : null;
}

/** Una duración en horas partida en días enteros y horas sueltas: 60 → 2 días y 12 horas. */
export function partesDeLaDuracion(horas) {
  if (!Number.isFinite(horas) || horas <= 0) return null;
  const dias = Math.floor(horas / 24);
  return { horas, dias, resto: Math.round((horas - dias * 24) * 100) / 100 };
}

/** La duración como dato: «60 h (2 días y 12 h)»; los días van sólo cuando pasa de 24 horas. */
export function duracionVisible(horas, t) {
  const textos = t.turnos_guardia.nuevo_turno_guardia;
  const partes = partesDeLaDuracion(horas);
  if (!partes) return '—';
  const enHoras = textos.duracion_en_horas.replace('{horas}', String(partes.horas));
  if (partes.horas <= 24) return enHoras;
  const dias = partes.dias === 1 ? textos.duracion_un_dia : textos.duracion_varios_dias.replace('{dias}', String(partes.dias));
  return partes.resto > 0
    ? textos.duracion_con_dias_y_horas.replace('{horas}', String(partes.horas)).replace('{dias}', dias).replace('{resto}', String(partes.resto))
    : textos.duracion_con_dias.replace('{horas}', String(partes.horas)).replace('{dias}', dias);
}

/** Una punta de un tramo como dato: «Viernes 20:00» o «20/11/2026 20:00». */
export function momentoVisible(momento, t, locale) {
  if (!momento) return '—';
  const cuando = momento.fecha ? fechaVisible(momento.fecha, locale) : t.turnos_guardia.nuevo_turno_guardia.dias[momento.dia] ?? '—';
  return `${cuando} ${momento.hora}`;
}

/** Un tramo entero como dato: «Viernes 20:00 – Lunes 08:00». */
export function tramoVisible(tramoDeLaGuardia, t, locale) {
  return t.turnos_guardia.nuevo_turno_guardia.tramo
    .replace('{comienzo}', momentoVisible(tramoDeLaGuardia.comienzo, t, locale))
    .replace('{fin}', momentoVisible(tramoDeLaGuardia.fin, t, locale));
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
