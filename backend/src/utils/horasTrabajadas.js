import { finDeTurnoGuardiaEnLaZona, inicioDeTurnoGuardiaEnLaZona } from './relojDeLaPrestadora.js';

/* Las horas que de verdad trabajó un Asistente en un turno de guardia.
   ==========================================================================

   DE DÓNDE SALEN. De las dos marcas que deja el Asistente desde la aplicación: la llegada y el
   cierre del turno de guardia. El horario programado sólo pone el marco.

   LA REGLA, que es la de cualquier liquidación de sueldos con control de presencia:
     - Las horas normales son las que estuvo adentro del horario programado: desde la más tardía
       entre la hora programada y la llegada, hasta la más temprana entre la hora programada de
       fin y el cierre. Quien llega tarde cobra desde que llegó; quien se va antes cobra hasta
       que se fue.
     - Llegar antes de hora no se paga: nadie pidió ese tiempo.
     - Las horas extra son las que se quedó después del fin programado, hasta el cierre. Es el
       mismo criterio de las extensiones del turno de guardia: las horas que se quedó son suyas.
     - Se cuenta al minuto, sin redondeos a favor de nadie.

   SIN LAS DOS MARCAS NO HAY HORAS. Un turno de guardia cerrado al que le falta la llegada o el
   cierre no tiene de dónde contar. Inventar las horas programadas sería pagar un tiempo que nadie
   controló: se cuenta cero y se avisa, para que la Prestadora corrija las marcas y vuelva a
   generar la liquidación.

   Sin base de datos adentro: entra el turno de guardia y la zona horaria, sale la cuenta. */

const MS_POR_MINUTO = 60 * 1000;

function minutosEntre(desde, hasta) {
  return Math.max(0, Math.round((hasta - desde) / MS_POR_MINUTO));
}

function momento(valor) {
  if (!valor) return null;
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/**
 * La cuenta de un turno de guardia, renglón por renglón.
 *
 * @param {object} turno_guardia  con `fecha`, `hora_inicio`, `hora_fin`, `dias_hasta_el_fin`,
 *                                `checkin_at` y `checkout_at`
 * @param {string} zona           la zona horaria de la Prestadora
 * @returns {{ fecha: string, programado_desde: string, programado_hasta: string,
 *             llegada: string|null, cierre: string|null, minutos: number,
 *             minutos_extra: number, sin_marca: boolean }}
 */
export function horasRealesDelTurnoGuardia(turno_guardia, zona) {
  if (!zona) throw new Error('horasRealesDelTurnoGuardia: falta la zona horaria de la Prestadora');
  const inicio = inicioDeTurnoGuardiaEnLaZona(turno_guardia, zona);
  const fin = finDeTurnoGuardiaEnLaZona(turno_guardia, zona);
  const llegada = momento(turno_guardia.checkin_at);
  const cierre = momento(turno_guardia.checkout_at);

  const renglon = {
    turno_guardia_id: turno_guardia.id ?? null,
    fecha: turno_guardia.fecha,
    programado_desde: inicio.toISOString(),
    programado_hasta: fin.toISOString(),
    llegada: llegada ? llegada.toISOString() : null,
    cierre: cierre ? cierre.toISOString() : null,
    minutos: 0,
    minutos_extra: 0,
    sin_marca: !llegada || !cierre,
  };
  if (renglon.sin_marca) return renglon;

  const desde = new Date(Math.max(inicio.getTime(), llegada.getTime()));
  const hasta = new Date(Math.min(fin.getTime(), cierre.getTime()));
  renglon.minutos = minutosEntre(desde, hasta);
  renglon.minutos_extra = minutosEntre(new Date(Math.max(fin.getTime(), llegada.getTime())), cierre);
  return renglon;
}
