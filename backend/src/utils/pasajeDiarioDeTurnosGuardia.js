import { extenderSeriesTurnoGuardiaAbiertas } from './generacionSeriesTurnoGuardia.js';
import { revisarTurnosSinCubrir } from './avisoTurnosSinCubrir.js';

/**
 * El pasaje diario de los turnos de guardia de una Prestadora, en el orden que importa: primero se
 * generan los turnos de guardia de los recurrentes hasta el horizonte, y después se rehace la cuenta
 * de turnos sin cubrir y se avisa. Al revés, la cuenta vería sin cubrir los días que el recurrente
 * todavía no generó.
 *
 * Si la generación falla, la cuenta corre igual: un recurrente activo cuenta como cubierto aunque
 * sus turnos de guardia todavía no estén generados, así que no aparece ningún aviso de más, y lo que
 * de verdad está sin cubrir se avisa. El error de la generación se vuelve a lanzar al final, para que
 * quede en el registro.
 *
 * Las dos tareas se reciben de afuera para poder probar el orden sin base.
 *
 * @param {string} prestadoraId
 */
export async function pasajeDiarioDeTurnosGuardia(
  prestadoraId,
  { generar = extenderSeriesTurnoGuardiaAbiertas, contar = revisarTurnosSinCubrir } = {},
) {
  if (!prestadoraId) throw new Error('pasajeDiarioDeTurnosGuardia: falta la Prestadora');
  let errorDeLaGeneracion = null;
  try {
    await generar(prestadoraId);
  } catch (e) {
    errorDeLaGeneracion = e;
  }
  await contar(prestadoraId);
  if (errorDeLaGeneracion) throw errorDeLaGeneracion;
}
