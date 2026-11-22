import { finDeTurnoGuardiaEnLaZona, inicioDeTurnoGuardiaEnLaZona } from './relojDeLaPrestadora.js';
import { reglaDePagoDe } from './formaDePago.js';

/* Las horas que de verdad trabajó un Asistente en un turno de guardia.
   ==========================================================================

   DE DÓNDE SALEN. De las dos marcas que deja el Asistente desde la aplicación: la llegada y el
   cierre del turno de guardia. El horario programado pone el marco, y la regla de pago de la
   Prestadora decide tres cosas (`reglaDePagoDe` en `formaDePago.js`, con sus valores de fábrica):
     - Llegada antes de hora (`pagar_llegada_anticipada`). Encendida, el tiempo entre la llegada
       y el inicio programado se paga como horas extra. De fábrica no se paga.
     - Llegada tarde y salida antes de hora (`descontar_llegada_tarde_y_salida_anticipada`).
       Encendida, que es la de fábrica, las horas normales son las que estuvo adentro del horario
       programado: desde la más tardía entre el inicio programado y la llegada, hasta la más
       temprana entre el fin programado y el cierre. Apagada, con las dos marcas se pagan como
       horas normales las programadas enteras.
     - Tiempo después del fin (`pagar_tiempo_despues_del_fin`). Encendida, que es la de fábrica,
       el tiempo entre el fin programado y el cierre se paga como horas extra. Apagada, no se
       cuenta.
   Se cuenta al minuto, sin redondeos a favor de nadie.

   SIN LAS DOS MARCAS NO HAY HORAS, con cualquier regla. Un turno de guardia cerrado al que le
   falta la llegada o el cierre no tiene de dónde contar. Inventar las horas programadas sería
   pagar un tiempo que nadie controló: se cuenta cero y se avisa, para que la Prestadora corrija
   las marcas y vuelva a generar la liquidación.

   Sin base de datos adentro: entra el turno de guardia, la zona horaria y la regla, sale la
   cuenta. */

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
 * @param {object} [reglaDePago]  lo que la Prestadora corrió de la regla de pago; lo que falta
 *                                rige de fábrica
 * @returns {{ fecha: string, programado_desde: string, programado_hasta: string,
 *             llegada: string|null, cierre: string|null, minutos: number,
 *             minutos_extra: number, sin_marca: boolean }}
 */
export function horasRealesDelTurnoGuardia(turno_guardia, zona, reglaDePago) {
  if (!zona) throw new Error('horasRealesDelTurnoGuardia: falta la zona horaria de la Prestadora');
  const regla = reglaDePagoDe(reglaDePago);
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

  if (regla.descontar_llegada_tarde_y_salida_anticipada) {
    const desde = new Date(Math.max(inicio.getTime(), llegada.getTime()));
    const hasta = new Date(Math.min(fin.getTime(), cierre.getTime()));
    renglon.minutos = minutosEntre(desde, hasta);
  } else {
    renglon.minutos = minutosEntre(inicio, fin);
  }

  if (regla.pagar_llegada_anticipada) {
    // Hasta el inicio programado, o hasta el cierre si cerró antes de ese inicio.
    const hastaElInicio = new Date(Math.min(inicio.getTime(), cierre.getTime()));
    renglon.minutos_extra += minutosEntre(llegada, hastaElInicio);
  }
  if (regla.pagar_tiempo_despues_del_fin) {
    renglon.minutos_extra += minutosEntre(new Date(Math.max(fin.getTime(), llegada.getTime())), cierre);
  }
  return renglon;
}
