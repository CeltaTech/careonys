/* En qué día se le factura al Cliente y se le liquida al Asistente un turno de guardia en el que
   el Asistente salió sin presentar el Reporte Diario.
   ============================================================

   EL TURNO SE FACTURA IGUAL. Que falte el reporte no es motivo para dejar de cobrarle al Cliente
   el turno de guardia: se prestó. Sale en la factura de su fecha, como cualquier turno completado.

   SALVO QUE LA PRESTADORA HAYA ELEGIDO ESPERAR. Esa elección queda anotada en el turno en el
   momento de la salida (`factura_espera_el_reporte_diario`). Mientras el reporte no llega, el
   turno no se factura. Cuando llega, se factura en el día más tardío entre su fecha y el día en
   que llegó el reporte, contado en la zona horaria de la Prestadora. Así, si el reporte llegó
   después de cerrado el período de su fecha, el turno entra en el período siguiente y no se
   pierde; y como cada turno tiene un solo día de facturación, tampoco se factura dos veces.

   Con la medición por lo pactado no se espera: el turno ya está adentro del precio del período, y
   pasarlo al período siguiente lo contaría como trabajado de más.

   AL ASISTENTE SE LE LIQUIDA CUANDO LLEGA EL REPORTE, siempre, con la misma cuenta del día más
   tardío. Mientras falta, el turno no se liquida.

   Todo es cuenta pura: no toca la base. */

import { diaEnLaZona } from './relojDeLaPrestadora.js';
import { MEDICIONES } from './condicionesDelCliente.js';

const ESTADO_SIN_REPORTE = 'salida_sin_reporte';

/** El día en que llegó el Reporte Diario tardío, en la zona de la Prestadora, o null. */
export function diaDeLlegadaDelReporte(turno, zona) {
  if (!turno?.salio_sin_reporte_diario || !turno.reporte_diario_llego_at) return null;
  const momento = new Date(turno.reporte_diario_llego_at);
  if (Number.isNaN(momento.getTime())) return null;
  return diaEnLaZona(momento, zona);
}

const fechaDe = (turno) => String(turno?.fecha ?? '').slice(0, 10);
const masTardio = (a, b) => (b && b > a ? b : a);

/**
 * El turno de guardia como lo cuenta la factura del Cliente, o null si todavía no se factura.
 *
 * @param {object} turno   la fila del turno, con `fecha`, `estado`, `salio_sin_reporte_diario`,
 *                         `reporte_diario_llego_at` y `factura_espera_el_reporte_diario`
 * @param {object} p
 * @param {string} p.zona       la zona horaria de la Prestadora
 * @param {string} p.medicion   la medición del Servicio
 * @returns {object|null}  el turno con `estado` y `fecha` de facturación
 */
export function comoSeFactura(turno, { zona, medicion }) {
  const espera = turno?.factura_espera_el_reporte_diario === true && medicion !== MEDICIONES.PACTADO_MAS_EXCEDENTE;
  if (turno?.estado === ESTADO_SIN_REPORTE) {
    if (espera) return null;
    return { ...turno, estado: 'completada' };
  }
  if (espera && turno.estado === 'completada') {
    const llegada = diaDeLlegadaDelReporte(turno, zona);
    if (!llegada) return null;
    return { ...turno, fecha: masTardio(fechaDe(turno), llegada) };
  }
  return turno;
}

/**
 * El día en que se le liquida al Asistente el turno de guardia, o null si todavía no se liquida.
 * El turno sin reporte espera al reporte; el que salió sin reporte y lo presentó después, se
 * liquida el día más tardío entre su fecha y el día de llegada.
 */
export function fechaDeLiquidacion(turno, zona) {
  if (turno?.estado === ESTADO_SIN_REPORTE) return null;
  const fecha = fechaDe(turno);
  if (!turno?.salio_sin_reporte_diario) return fecha;
  return masTardio(fecha, diaDeLlegadaDelReporte(turno, zona));
}
