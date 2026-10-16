// ¿Se puede guardar dónde está esta persona?
//
// La única fuente de verdad es `consentimiento_seguimiento_vigente`, la función de la base que
// mira el consentimiento otorgado, no retirado, contra un texto vigente que no sea borrador.
// Acá no se reescribe esa condición: se la consulta.
//
// Retirar el consentimiento no traba nada. El Asistente marca su llegada, marca su salida y
// trabaja igual: lo único que deja de pasar es que quede registrada la coordenada. Por eso esto
// no devuelve un error, devuelve si se puede o no, y quien llama arma el registro sin posición.
//
// Ante cualquier falla de la consulta se contesta que NO. Es un control de privacidad y falla
// cerrado: si no se pudo saber si la persona dio permiso, no se la ubica.
//
// CON QUÉ CREDENCIAL. La pregunta la hace el trabajo de la Prestadora de la guardia, y la función
// contesta sólo por los Asistentes de esa Prestadora: el consentimiento que alguien dio en otra
// no habilita a ubicarlo en ésta. Sin Prestadora no se pregunta.
import { enLaPrestadora } from '../db/connection.js';

export async function puedeRegistrarUbicacion(asistenteId, prestadoraId) {
  if (!asistenteId || !prestadoraId) return false;

  let data, error;
  try {
    ({ data, error } = await enLaPrestadora(prestadoraId, 'consultar el consentimiento de ubicación', (db) =>
      db.rpc('consentimiento_seguimiento_vigente', { p_asistente_id: asistenteId })
    ));
  } catch (falla) {
    error = falla;
  }

  if (error) {
    console.error('Error consultando el consentimiento de seguimiento de ubicación:', error.message);
    return false;
  }

  return data === true;
}
