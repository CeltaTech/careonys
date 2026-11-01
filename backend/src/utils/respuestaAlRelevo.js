import { llegadaEstimadaDeGuardia } from './estimarLlegadaDeGuardia.js';

// Lo que contesta un Asistente consultado para un relevo, y en cuánto estima el GPS que llega.
//
// LA CUENTA NO ES NUEVA. Es la misma de la llegada estimada de quien ya marcó la salida
// (`estimarLlegadaDeGuardia.js`): el punto desde el que contesta hace de punto de salida, y la hora
// de salida es ahora. Dos cuentas para la misma pregunta darían dos números distintos para lo mismo.
//
// DEL PUNTO NO QUEDA NADA. Se usa para medir y se descarta: lo que se guarda son minutos.

/** Los minutos que dice el Asistente, si vinieron bien: un entero entre cero y un día. */
export function minutosValidos(minutos) {
  return Number.isInteger(minutos) && minutos >= 0 && minutos <= 24 * 60;
}

/** Si lo que llegó es una respuesta que se puede guardar tal cual. */
export function respuestaValida({ respuesta, minutos }) {
  if (respuesta === 'no_disponible') return minutos == null;
  if (respuesta === 'disponible') return minutosValidos(minutos);
  return false;
}

/**
 * En cuántos minutos llegaría a la guardia desde el punto en que contestó, o `null` si no hay con
 * qué medir —sin punto, sin coordenadas del domicilio del día—. Nunca se inventa un número.
 *
 * @param {object} db conexión del trabajo de la Prestadora: el consultado no está en esa guardia y
 *   la base no le deja verla
 * @param {object} guardia fila con `id`, `fecha` y `paciente_id`
 */
export async function minutosPorGps(db, prestadoraId, guardia, lat, lng, ahora = new Date()) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const estimada = await llegadaEstimadaDeGuardia(db, prestadoraId, {
    ...guardia,
    salida_checkin_at: ahora.toISOString(),
    salida_lat: lat,
    salida_lng: lng,
  });
  if (!estimada) return null;
  return Math.max(0, Math.round((estimada.getTime() - ahora.getTime()) / 60000));
}
