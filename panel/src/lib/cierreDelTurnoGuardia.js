// El cierre de un turno de guardia desde el Panel: lo que comparten el cierre a mano y la
// autorización de una salida.
//
// Los dos piden la hora de salida en el mismo casillero, y la base la valida en un solo lugar con
// tres límites: no antes de la llegada del turno, no después del momento en que se registra y no
// después de la llegada del turno siguiente del mismo Paciente. Cuando la base rechaza la hora, el
// texto va al pie del casillero de la hora, no a una franja suelta.

/** Los motivos con los que la base rechaza la hora de salida. */
export const MOTIVOS_DE_LA_HORA = [
  'hora_de_salida_obligatoria',
  'hora_de_salida_futura',
  'hora_de_salida_anterior_a_la_llegada',
  'hora_de_salida_posterior_al_relevo',
];

/**
 * El texto para el pie del casillero de la hora, si el error es de la hora. `null` si es otro
 * error, que va a la franja de la ventana.
 */
export function errorDeLaHora(error, t) {
  const motivo = error && typeof error === 'object' ? String(error.motivo ?? '') : '';
  if (!MOTIVOS_DE_LA_HORA.includes(motivo)) return null;
  return t?.cierre_turno_guardia?.errores_hora?.[motivo] ?? null;
}

/**
 * La hora de salida que se propone al cerrar a mano: la última vez que se supo que el Asistente
 * estaba en la casa. Es la más tardía entre la llegada, la última ubicación recibida y las
 * comprobaciones de presencia hechas. Nunca después de `ahora`. `null` si no hay ninguna.
 */
export function horaPropuestaDeSalida(turno_guardia, comprobaciones = [], ahora = new Date()) {
  const momentos = [
    turno_guardia?.checkin_at,
    turno_guardia?.ubicacion_actual_at,
    ...(comprobaciones ?? []).map((c) => c?.comprobada_en),
  ]
    .filter(Boolean)
    .map((valor) => new Date(valor))
    .filter((fecha) => !Number.isNaN(fecha.getTime()) && fecha <= ahora);
  if (momentos.length === 0) return null;
  return new Date(Math.max(...momentos.map((fecha) => fecha.getTime())));
}

/** Los motivos que se ofrecen para elegir: los que escribe la base solos quedan afuera. */
export function motivosQueSeEligen(filas) {
  return (filas ?? []).filter((fila) => !fila.lo_escribe_el_sistema);
}

/** El nombre visible de un motivo: el del producto, traducido por su clave; el de la Prestadora, tal cual. */
export function nombreDelMotivoDeSalida(motivo, t) {
  if (!motivo) return '';
  const delProducto = motivo.clave ? t?.cierre_turno_guardia?.motivos?.[motivo.clave] : null;
  return delProducto ?? motivo.nombre ?? '';
}

/**
 * Qué falta para poder cerrar. Devuelve un objeto con un texto por casillero que falta; vacío si
 * está todo. Se muestra recién al apretar el botón.
 */
export function revisarCierre({ motivo, detalle, hora }, t) {
  const textos = t?.cierre_turno_guardia ?? {};
  const faltan = {};
  if (!motivo) faltan.motivo = textos.falta_motivo;
  if (motivo?.pide_detalle && !String(detalle ?? '').trim()) faltan.detalle = textos.falta_detalle;
  if (!hora) faltan.hora = textos.errores_hora?.hora_de_salida_obligatoria;
  return faltan;
}
