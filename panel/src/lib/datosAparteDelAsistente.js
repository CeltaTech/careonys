/**
 * Dos partes del Legajo del Asistente viven en tablas aparte, no en `asistentes`.
 *
 * Están separadas a propósito: las reglas de acceso de la base filtran filas, no columnas, así
 * que mientras esos datos estaban dentro de `asistentes` cualquiera que podía ver el Legajo del Asistente
 * podía leerlos. En su propia tabla, la base exige un permiso antes de contestar:
 *
 *   - `remuneraciones_asistente` — lo que cobra. Permiso `ver_pagos_asistente`.
 *   - `datos_reservados_asistente` — por qué quedó excluido de recibir trabajo. Permiso
 *     `ver_datos_reservados_asistente`.
 *
 * Para las pantallas eso es un detalle de dónde está guardado el dato, no una forma nueva de
 * leerlo: se piden junto con el Legajo del Asistente y `conDatosAparte` los vuelve a dejar donde el resto del
 * código los espera, en `asistente.valor_hora`, `asistente.motivo_exclusion_directo` y demás. Quien no tenga
 * el permiso recibe esos campos en `null`, que es lo mismo que recibía cuando el dato no estaba
 * cargado.
 */

/** Lo que hay que agregar al `select` para que la base traiga también los importes. */
export const CAMPOS_PAGO = 'remuneraciones_asistente(unidad_medicion, valor_hora, valor_guardia, valor_semana, valor_hora_extra, frecuencia_pago)';

/** Lo que hay que agregar al `select` para que la base traiga también lo reservado. */
export const CAMPOS_RESERVADOS = 'datos_reservados_asistente(motivo_exclusion_directo, motivo_exclusion_intermediacion)';

/** Una tabla adjunta llega como objeto o como arreglo de un solo elemento, según la consulta. */
function primero(adjunto) {
  return (Array.isArray(adjunto) ? adjunto[0] : adjunto) ?? null;
}

/** Deja los datos de las tablas aparte al mismo nivel que el resto del Legajo del Asistente. */
export function conDatosAparte(asistente) {
  if (!asistente) return asistente;
  const {
    remuneraciones_asistente: adjuntoPago,
    datos_reservados_asistente: adjuntoReservado,
    ...columnas
  } = asistente;
  const pago = primero(adjuntoPago);
  const reservado = primero(adjuntoReservado);
  return {
    ...columnas,
    unidad_medicion: pago?.unidad_medicion ?? null,
    valor_hora: pago?.valor_hora ?? null,
    valor_guardia: pago?.valor_guardia ?? null,
    valor_semana: pago?.valor_semana ?? null,
    valor_hora_extra: pago?.valor_hora_extra ?? null,
    // Cada cuánto cobra esta persona. Vacío quiere decir «lo que diga la Prestadora», y es lo
    // normal: sólo se guarda acá lo que se arregló distinto con ella.
    frecuencia_pago: pago?.frecuencia_pago ?? {},
    motivo_exclusion_directo: reservado?.motivo_exclusion_directo ?? null,
    motivo_exclusion_intermediacion: reservado?.motivo_exclusion_intermediacion ?? null,
  };
}
