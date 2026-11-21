// Las cuentas de las ACCIONES DE A MUCHOS sobre turnos de guardia, sin tocar la base.
// ============================================================================
//
// La barra de acciones de a muchos deja elegir una acción y la aplica a todos los turnos de
// guardia elegidos. Antes de guardar hay que saber dos cosas por cada turno: si la acción le
// corresponde —un turno que ya empezó no cambia de horario ni de Asistente— y cómo queda
// después. Esas dos cuentas viven acá, separadas de la parte que guarda, para poder probarlas.

import { diasEntre, finDeTurnoGuardia, horaDeReloj, inicioDeTurnoGuardia, sumarDias } from './horarios';
import { fechaDelMomento, textoDelHorario } from './horarioDeTurnoGuardia';
import { seArrastra, yaEmpezo } from './moverTurnoGuardia';

const DIAS_POR_SEMANA = 7;
const MS_POR_MINUTO = 60 * 1000;

/**
 * Cómo queda un turno de guardia si se corre su horario una cantidad de minutos.
 *
 * Se corren el momento de inicio y el de fin, no las dos horas de reloj sueltas. Así la duración
 * no cambia y el día se corre cuando hace falta: un turno de 22:00 a 06:00 corrido tres horas
 * pasa al día siguiente, de 01:00 a 09:00, y termina el mismo día que empieza. Los días hasta el
 * fin no tienen tope: un turno de cuatro días corrido sigue durando cuatro días.
 *
 * La grilla usa la misma cuenta al soltar un turno en otra hora: el corrimiento es la distancia
 * entre el comienzo nuevo y el de antes.
 *
 * @returns {{fecha, hora_inicio, hora_fin, dias_hasta_el_fin} | null} `null` si el turno o los
 *          minutos no se entienden.
 */
export function horarioCorrido(turno_guardia, minutos) {
  const corrimiento = Number(minutos) * MS_POR_MINUTO;
  if (!turno_guardia || !Number.isFinite(corrimiento)) return null;
  const inicioDeAntes = inicioDeTurnoGuardia(turno_guardia);
  const finDeAntes = finDeTurnoGuardia(turno_guardia);
  if (!inicioDeAntes || !finDeAntes || Number.isNaN(inicioDeAntes.getTime()) || Number.isNaN(finDeAntes.getTime())) return null;
  const inicio = new Date(inicioDeAntes.getTime() + corrimiento);
  const fin = new Date(finDeAntes.getTime() + corrimiento);
  const fecha = fechaDelMomento(inicio);
  const dias = diasEntre(fecha, fechaDelMomento(fin));
  if (dias === null || dias < 0) return null;
  return { fecha, hora_inicio: horaDeReloj(inicio), hora_fin: horaDeReloj(fin), dias_hasta_el_fin: dias };
}

/**
 * El adelanto de «correr el horario» sobre un turno de guardia: cómo está y cómo queda, escritos
 * con el mismo formato que la grilla. Si el turno pasa a terminar otro día, el día del fin se ve:
 * «lun 3 nov 20:00–23:00 → lun 3 nov 23:00 – mar 4 nov 02:00».
 *
 * @param {object} opciones  Las mismas de `textoDelHorario`: idioma, hoy y textos.
 * @returns {string | null} `null` si el horario corrido no se puede calcular.
 */
export function vistaPreviaDelHorarioCorrido(turno_guardia, minutos, opciones) {
  const corrido = horarioCorrido(turno_guardia, minutos);
  if (!corrido) return null;
  const formato = { ...opciones, conDuracion: false };
  return `${textoDelHorario(turno_guardia, formato)} → ${textoDelHorario({ ...turno_guardia, ...corrido }, formato)}`;
}

/** El día del turno de guardia copiado, una cantidad de semanas más adelante. */
export function fechaDuplicada(turno_guardia, semanas) {
  return sumarDias(turno_guardia.fecha, DIAS_POR_SEMANA * Number(semanas));
}

/**
 * ¿La acción le corresponde a este turno de guardia?
 *
 * - Cambiar el Asistente: sólo uno programado que todavía no empezó. Cubrir una ausencia pide un
 *   motivo por cada turno, y eso se hace desde el turno, uno por uno.
 * - Correr el horario: sólo uno que todavía no empezó, igual que arrastrarlo en la grilla.
 * - Cancelar: uno programado o en curso, igual que desde el turno.
 * - Duplicar: cualquiera. La copia nace nueva, sin nada de lo que pasó en el original.
 *
 * Una acción desconocida no le corresponde a ninguno: no se adivina qué se quiso hacer.
 */
export function correspondeLaAccion(accion, turno_guardia) {
  if (!turno_guardia) return false;
  if (accion === 'reasignar') return turno_guardia.estado === 'programada' && !yaEmpezo(turno_guardia);
  if (accion === 'correr') return seArrastra(turno_guardia);
  if (accion === 'cancelar') return turno_guardia.estado === 'programada' || turno_guardia.estado === 'activa';
  if (accion === 'duplicar') return true;
  return false;
}

/** Los turnos de guardia elegidos a los que la acción les corresponde. */
export function turnosParaLaAccion(accion, turnos_guardia) {
  return (turnos_guardia ?? []).filter((g) => correspondeLaAccion(accion, g));
}
