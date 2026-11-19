import { hoyISO } from './horarios';

/* Adónde lleva cada turno que traba la desactivación de una cuenta. */
export const MOTIVO_SIN_CERRAR = 'desactivacion_con_turnos_guardia_sin_cerrar';

export function enlaceDelTurnoGuardia(turno_guardia, hoy = hoyISO()) {
  // Una serie vigente puede haber empezado hace meses: se abre desde hoy, que es donde se ve.
  const desde = turno_guardia.tipo === 'serie' && turno_guardia.fecha < hoy ? hoy : turno_guardia.fecha;
  const ancla = turno_guardia.motivo === MOTIVO_SIN_CERRAR ? '#turnos-guardia-sin-cerrar' : '';
  return `/turnos-guardia?desde=${desde}${ancla}`;
}
