import { enLaPrestadora } from '../db/connection.js';
import { ausenciaQueTapaLaGuardia, finPrevistoDeLaAusencia, ultimoDiaDeLaGuardia } from './ausenciaQueTapa.js';

// Durante su licencia, el Asistente no tiene guardias.
//
// QUÉ ES ESTE CASO. Al Asistente le registran una licencia y sus guardias de esos días quedan del
// lado del Coordinador, en la lista de las que hay que cubrir. Para el Asistente esas guardias no
// existen: no las ve en la aplicación, no puede abrirlas ni marcar la llegada, y no le llega el
// recordatorio. Si el Coordinador lo convoca, anota en el Panel que volvió —eso adelanta el fin de
// la licencia— y las guardias le reaparecen solas. Es el único camino: no hay botón que avise ni
// rechazo en la puerta, porque lo que no le corresponde no se le muestra.
//
// CUÁLES SE ESCONDEN. Sólo las que todavía no empezaron: `programada` y sin llegada marcada. Una
// guardia que ya está en curso se terminó de decidir cuando empezó, y esconderla a mitad de camino
// dejaría al Asistente sin poder marcar la salida. Las cubiertas no hace falta mirarlas: cubrirla
// le pasa la guardia al sustituto, así que ya no figura a nombre del titular.
//
// CONTRA QUÉ FECHA. Contra la prevista (`finPrevistoDeLaAusencia`): pasado el último día previsto,
// la persona volvió aunque nadie lo haya anotado, y esconderle sus guardias la dejaría afuera de su
// trabajo por algo que no anotó otro.
//
// EL TIPO DE LICENCIA NO ENTRA. La consulta pide las tres columnas que hacen falta para saber si la
// ausencia tapa el día, y ninguna más: por qué esa persona está de licencia es información de salud
// y no sale del legajo (CLAUDE.md §6; la razón larga está en `utils/ausenciaQueTapa.js`).
//
// CON QUÉ CREDENCIAL. Con la del trabajo de la Prestadora, que la base acota a ella: el Asistente no
// ve las licencias con la suya. Sin Prestadora no se consulta nada.
//
// SI LA CONSULTA FALLA, SE MUESTRAN. Una consulta que no se pudo hacer no es motivo para dejar a
// alguien afuera de su trabajo en la puerta de una casa.

/** Si la guardia todavía puede esconderse: no empezó. */
const todaviaNoEmpezo = (g) => g?.estado === 'programada' && !g.checkin_at;

/**
 * Las guardias de la lista que caen en una licencia del Asistente que las tiene.
 *
 * @param {string} prestadoraId La Prestadora de las guardias.
 * @param {object[]} guardias   Como vienen de la base: hacen falta `id`, `asistente_id`, `estado`,
 *                              `checkin_at`, `fecha`, `hora_inicio`, `hora_fin` y `dias_hasta_el_fin`.
 * @returns {Promise<Set<string>>} Los `id` que el Asistente no tiene que ver.
 */
export async function guardiasEnLicencia(prestadoraId, guardias) {
  if (!prestadoraId || !(guardias ?? []).some(todaviaNoEmpezo)) return new Set();
  return enLaPrestadora(prestadoraId, 'ver qué guardias caen en una licencia', (db) =>
    guardiasEnLicenciaAdentro(db, prestadoraId, guardias),
  );
}

/** Lo mismo, con una conexión de la Prestadora que ya tiene quien llama. */
export async function guardiasEnLicenciaAdentro(db, prestadoraId, guardias) {
  const candidatas = (guardias ?? []).filter((g) => todaviaNoEmpezo(g) && g.asistente_id && g.fecha);
  if (!prestadoraId || !candidatas.length) return new Set();

  const asistentes = [...new Set(candidatas.map((g) => g.asistente_id))];
  const ultimoDia = candidatas.map(ultimoDiaDeLaGuardia).sort().at(-1);

  const { data: ausencias, error } = await db
    .from('ausencias')
    .select('asistente_id, fecha_inicio, fecha_fin')
    .eq('prestadora_id', prestadoraId)
    .in('asistente_id', asistentes)
    .lte('fecha_inicio', ultimoDia);
  if (error) {
    console.error('[guardiaDeLicencia] no se pudieron leer las ausencias', error);
    return new Set();
  }

  return new Set(
    candidatas.filter((g) => ausenciaQueTapaLaGuardia(g, ausencias, finPrevistoDeLaAusencia)).map((g) => g.id),
  );
}
