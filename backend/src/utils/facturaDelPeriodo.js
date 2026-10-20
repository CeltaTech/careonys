/* Qué renglones lleva la factura de un Cliente en un período.
   ============================================================

   QUÉ RESUELVE. La factura se armaba sumando el precio de todas las prestaciones `vigente` del
   Paciente, sin mirar ni una fecha. Así se cobraba lo que ya no corría, y lo que todavía no había
   empezado: una prestación que terminó en marzo seguía apareciendo en la factura de agosto, porque
   `estado` dice si el acuerdo sigue en pie y las fechas dicen cuándo corre. Son dos cosas distintas
   y hacen falta las dos.

   CÓMO SE MIRA LA VIGENCIA. Una prestación entra en el período si su vigencia se superpone con el
   mes, aunque sea un día: empezó antes de que el mes termine y no terminó antes de que el mes
   empiece. `vigente_hasta` vacío quiere decir que sigue corriendo.

   Y ENTRA POR EL PRECIO ACORDADO, ENTERO. Lo que se cobra es el precio del acuerdo, no una parte
   proporcional a los días: partirlo obligaría a decidir sobre cuántos días se parte, y eso lo
   acuerda cada Prestadora con cada Cliente, no este archivo.

   CADA PRESTACIÓN ES UN RENGLÓN. Se cobra cada una por separado, con su propio precio. */

/** El último día del mes de un período `2026-08-01`. */
export function ultimoDiaDelPeriodo(periodo) {
  const anio = Number(String(periodo).slice(0, 4));
  const mes = Number(String(periodo).slice(5, 7));
  // El día cero del mes siguiente es el último del mes pedido, y así no hay ninguna lista de
  // cuántos días tiene cada uno ni ninguna excepción de año bisiesto.
  return new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
}

/** Si el acuerdo de esta prestación corre en algún día del período. */
export function correEnElPeriodo(prestacion, periodo) {
  const desde = String(prestacion.vigente_desde ?? '').slice(0, 10);
  const hasta = prestacion.vigente_hasta ? String(prestacion.vigente_hasta).slice(0, 10) : null;
  if (!desde) return false;
  return desde <= ultimoDiaDelPeriodo(periodo) && (hasta === null || hasta >= periodo);
}

/**
 * Los renglones de la factura de un Cliente en un período.
 *
 * @param {object} argumentos
 * @param {string} argumentos.periodo        El primer día del mes, `2026-08-01`.
 * @param {Map<string, string>} argumentos.nombresDePacientes
 * @param {Array} argumentos.prestaciones    Las del acuerdo, ya acotadas a este Cliente.
 * @returns {Array<{paciente_id: string, servicio_id: string|null, descripcion: string, monto: number}>}
 */
export function armarLosRenglonesDeLaFactura({ periodo, nombresDePacientes, prestaciones }) {
  return (prestaciones ?? [])
    .filter((p) => correEnElPeriodo(p, periodo))
    .map((prestacion) => ({
      paciente_id: prestacion.paciente_id,
      servicio_id: prestacion.servicio_id ?? null,
      descripcion: `${prestacion.tipo_servicio} — ${nombresDePacientes.get(prestacion.paciente_id) ?? ''}`.trim(),
      monto: Number(prestacion.precio_final),
    }));
}
