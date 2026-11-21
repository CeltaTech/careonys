// ---------------------------------------------------------------------------
// ajusteDelPagoPorIndice.js — el ajuste por índice del valor del Legajo, en la configuración
// del pago a los Asistentes
//
// Son las mismas tres decisiones que la Prestadora toma para el precio de las prestaciones: con
// qué índice se actualiza, cada cuántos meses, y si el valor nuevo se aplica solo o queda
// propuesto para que la administración lo revise. Viven en la regla del pago a los Asistentes,
// con las mismas claves, y la base las lee con la misma función que las de las prestaciones.
//
// Por eso no hay validación propia: se revisan con la de las condiciones de cobro al Cliente,
// limitada a estas tres claves. Dos validaciones para las mismas claves terminarían aceptando
// cosas distintas en cada lado.
// ---------------------------------------------------------------------------

import { condicionDe, condicionesQueSePuedenGuardar } from './condicionesDelCliente.js';

export const CLAVES_DEL_AJUSTE_DEL_PAGO = Object.freeze([
  'indice_de_actualizacion',
  'meses_entre_actualizaciones',
  'ajuste_por_indice',
]);

/** Lo que rige para la Prestadora: lo que guardó, y lo de fábrica en lo que no guardó nada. */
export function ajusteDelPagoDe(regla) {
  return Object.fromEntries(CLAVES_DEL_AJUSTE_DEL_PAGO.map((clave) => [clave, condicionDe(clave, regla, null)]));
}

/**
 * Revisa las tres claves que llegan para guardar.
 *
 * Devuelve `{ ok: true, valor }` con sólo lo que difiere de fábrica, o `{ ok: false, clave }` con
 * la primera clave mal. Cualquier otra clave de la entrada no se mira: no es de este ajuste.
 */
export function ajusteDelPagoQueSePuedeGuardar(regla) {
  const entrada = Object.fromEntries(
    CLAVES_DEL_AJUSTE_DEL_PAGO.filter((clave) => regla?.[clave] !== undefined).map((clave) => [clave, regla[clave]])
  );
  return condicionesQueSePuedenGuardar(entrada);
}
