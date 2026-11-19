// Punto único de verdad de la cobertura de un turno de guardia dentro del Panel
// (regla 12 de CLAUDE.md §7).
//
// "Cobertura" responde una sola pregunta: ¿este turno de guardia tiene a alguien que la haga?
// Es una pregunta distinta de `turnos_guardia.estado` (programada / activa / completada /
// cancelada / ausente), que responde en qué momento de su vida está el turno de guardia. Las dos
// conviven: un turno de guardia puede estar programada y sin cubrir al mismo tiempo.
//
// Se decidió NO agregar un valor 'sin_cubrir' a `estado` justamente por eso: serían dos
// datos que dicen lo mismo y que pueden contradecirse. La cobertura se deriva siempre de
// `asistente_id`, que es el dato real, y este archivo es el único lugar donde esa derivación
// está escrita.
//
// Ver las restricciones CHECK `turnos_guardia_sin_cubrir_estado_check` y
// `turnos_guardia_sin_cubrir_sin_marcas_check`, que sostienen la misma regla del lado de la base.

/** Los dos valores posibles. No hay un tercero. */
export const COBERTURA = {
  CUBIERTA: 'cubierta',
  SIN_CUBRIR: 'sin_cubrir',
};

/**
 * Estado de cobertura de un turno de guardia.
 *
 * - 'cubierta'   → hay un Asistente asignado.
 * - 'sin_cubrir' → no hay nadie: es un hueco de la agenda.
 */
export function coberturaDeTurnoGuardia(turno_guardia) {
  return turno_guardia?.asistente_id ? COBERTURA.CUBIERTA : COBERTURA.SIN_CUBRIR;
}

/** ¿Es un hueco? */
export function estaSinCubrir(turno_guardia) {
  return coberturaDeTurnoGuardia(turno_guardia) !== COBERTURA.CUBIERTA;
}

/**
 * Clave de traducción del estado de cobertura, dentro de t.turnos_guardia.
 * Se devuelve la clave y no el texto para que este archivo no dependa del idioma.
 */
export function claveTextoCobertura(turno_guardia) {
  return `cobertura_${coberturaDeTurnoGuardia(turno_guardia)}`;
}

/**
 * Identificador de la fila de la grilla a la que pertenece el turno de guardia.
 *
 * La grilla agrupa por Asistente. Los turnos de guardia sin cubrir no tienen a quién agruparse, así
 * que van todas juntas a una fila propia. Se usa una cadena y no `null` porque `null` como
 * clave de Map se confunde con "todavía no cargó el nombre".
 */
export const FILA_SIN_CUBRIR = 'sin-cubrir';

export function filaDeTurnoGuardia(turno_guardia) {
  return turno_guardia?.asistente_id ?? FILA_SIN_CUBRIR;
}
