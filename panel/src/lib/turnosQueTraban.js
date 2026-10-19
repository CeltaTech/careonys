import { hoyISO } from './horarios';

/* Adónde lleva cada turno que traba la desactivación de una cuenta. */
export const MOTIVO_SIN_CERRAR = 'desactivacion_con_turnos_sin_cerrar';

export function enlaceDelTurno(turno, hoy = hoyISO()) {
  // Una serie vigente puede haber empezado hace meses: se abre desde hoy, que es donde se ve.
  const desde = turno.tipo === 'serie' && turno.fecha < hoy ? hoy : turno.fecha;
  const ancla = turno.motivo === MOTIVO_SIN_CERRAR ? '#guardias-sin-cerrar' : '';
  return `/guardias?desde=${desde}${ancla}`;
}
