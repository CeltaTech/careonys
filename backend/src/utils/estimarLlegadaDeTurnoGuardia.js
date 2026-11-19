import { distanciaMetros } from './reporteIA.js';
import { conPacientes } from './pacientesDeTurnoGuardia.js';
import { conDomicilioDelDia } from './domicilioDelDia.js';
import { horaEstimadaDeLlegada } from './llegadaEstimada.js';
import { FICHA_UBICACION } from './fichaDelPaciente.js';

// A qué hora se estima que llega quien ya marcó la salida (pendiente #101).
//
// LA CUENTA NO ESTÁ ACÁ: está en `llegadaEstimada.js`, que es el punto único de verdad y vive
// también del lado del Panel. Este archivo es lo que le falta a esa cuenta para poder hacerse
// contra la base: de dónde salió la persona, a qué domicilio va, y qué domicilio rige ese día.
//
// CONTRA QUÉ DOMICILIO SE MIDE. Contra el que rige la fecha de ese turno de guardia, no el de sus datos —el
// mismo criterio que ya usa el check-in—: quien está pasando una temporada en la casa de un hijo
// se atiende ahí, y medir contra la casa de siempre daría una estimación falsa. Con varios
// Pacientes se mide contra el más cercano, por el mismo motivo que en el check-in.
//
// DEVUELVE `null` SIN INVENTAR NADA. Sin marca de salida, sin punto de salida o sin coordenadas
// del domicilio no hay estimación, y eso se dice: quien llama tiene que distinguir «no se sabe»
// de «llega a horario». Una hora inventada parece confiable y nadie la vuelve a mirar.
//
// LAS COORDENADAS NO SALEN DE ACÁ. Lo que devuelve es una hora, nunca un punto. El lugar del que
// salió el Asistente es casi siempre su casa, y eso no viaja a ninguna pantalla: ni a la del
// Cliente, ni a la del Coordinador.

/**
 * La hora estimada de llegada de cada turno de guardia, por id.
 *
 * `prestadoraId` es obligatorio: los Pacientes de estos turnos de guardia se leen acotados a
 * ella, y un filtro vacío no acota nada. Sin Prestadora no hay estimación.
 *
 * @param {object} db la conexión con la que se leen los Pacientes de esos turnos de guardia
 * @param {string} prestadoraId
 * @param {Array<object>} turnos de guardia filas con `id`, `fecha`, `paciente_id`, `salida_checkin_at`,
 *   `salida_lat` y `salida_lng`
 * @returns {Promise<Map<string, Date|null>>}
 */
export async function llegadaEstimadaDeTurnosGuardia(db, prestadoraId, turnos_guardia) {
  const lista = (turnos_guardia ?? []).filter(Boolean);
  const estimadas = new Map();
  if (lista.length === 0 || !prestadoraId) return estimadas;

  // Sólo se le pregunta el domicilio a los turnos de guardia que ya tienen salida marcada con punto: las
  // demás no tienen estimación posible y traer sus Pacientes sería una consulta de más.
  const conSalida = lista.filter(
    (g) => g.salida_checkin_at && typeof g.salida_lat === 'number' && typeof g.salida_lng === 'number'
  );
  for (const turno_guardia of lista) estimadas.set(turno_guardia.id, null);
  if (conSalida.length === 0) return estimadas;

  // Acá no se pide `domicilio` a propósito, igual que en el check-in: esto mide una distancia,
  // no muestra una dirección.
  const conSuGente = await conDomicilioDelDia(
    db,
    await conPacientes(db, prestadoraId, conSalida, `id, ${FICHA_UBICACION}`)
  );

  for (const turno_guardia of conSuGente) {
    const distancias = (turno_guardia.pacientes ?? [])
      .filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number')
      .map((p) => distanciaMetros(turno_guardia.salida_lat, turno_guardia.salida_lng, p.lat, p.lng));
    if (distancias.length === 0) continue;

    estimadas.set(
      turno_guardia.id,
      horaEstimadaDeLlegada({ salidaAt: turno_guardia.salida_checkin_at, metros: Math.min(...distancias) })
    );
  }

  return estimadas;
}

/** Lo mismo para un solo turno de guardia. */
export async function llegadaEstimadaDeTurnoGuardia(db, prestadoraId, turno_guardia) {
  if (!turno_guardia || !prestadoraId) return null;
  const estimadas = await llegadaEstimadaDeTurnosGuardia(db, prestadoraId, [turno_guardia]);
  return estimadas.get(turno_guardia.id) ?? null;
}
