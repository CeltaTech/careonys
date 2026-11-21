import { enLaPrestadora } from '../db/connection.js';
import { configuracionEvento, enviarEmail } from './email.js';
import { notificarCoordinador } from './whatsapp.js';
import { avisarAlAsistente } from './avisoAsignacionDeTurnoGuardia.js';
import { mensajeDelSistema } from '../i18n/avisos.js';
import { idiomaDeLaPrestadora } from '../i18n/idiomaDeLaPrestadora.js';
import { zonaDeLaPrestadora } from './relojDeLaPrestadora.js';

// LOS AVISOS DE UN VETO (paso 27, punto 4, docs/PLAN_HASTA_PRODUCCION.md).
//
// El veto ya quedó hecho en la base (`vetar_decision`) cuando se llega acá. Esto avisa:
//
//   - al Coordinador que tomó la decisión, por correo y por WhatsApp, a su propio correo y a su
//     propio teléfono. El aviso en el Panel no sale de acá: es la decisión vetada sin ver, que el
//     Panel lee de la base;
//   - a cada Asistente que perdió un turno de guardia con el veto, que ya no lo tiene;
//   - a cada Asistente al que el veto le devolvió un turno de guardia o una asignación, igual que
//     en una asignación: tiene un turno para responder.
//
// Nunca tira: un aviso que no salió no deshace el veto, sólo se registra.
//
// Se lee con el trabajo de la Prestadora, de a una por vez, y cada consulta la nombra.

export const EVENTO_VETO_DE_DECISION = 'veto_de_decision';

const TRABAJO = 'aviso de veto de una decisión';

/** El día en que se tomó la decisión, escrito como se lee en ese idioma y en la hora de la Prestadora. */
export function fechaDeLaDecision(momento, idioma, zona) {
  if (!momento) return '';
  const instante = new Date(momento);
  if (Number.isNaN(instante.getTime())) return '';
  return instante.toLocaleDateString(idioma, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: zona });
}

/**
 * A qué Asistente se le avisa qué cosa, a partir de lo que devolvió el veto.
 *
 * Es puro: no consulta nada, así que se prueba sin base. Un mismo Asistente que pierde un turno y
 * a la vez lo recupera —el veto lo devolvió a como estaba— recibe sólo el aviso de que tiene un
 * turno para responder.
 *
 * @returns {{ retirados: Array<{asistenteId: string, turnoGuardiaId: string|null}>, devueltos: Array<{asistenteId: string, turnoGuardiaId: string|null}> }}
 */
export function avisosALosAsistentes(resultado) {
  const devueltos = [];
  const yaDevuelto = new Set();
  for (const fila of resultado?.asignaciones_devueltas ?? []) {
    if (!fila?.asistente_id) continue;
    const clave = `${fila.asistente_id}|${fila.turno_guardia_id ?? ''}`;
    if (yaDevuelto.has(clave)) continue;
    yaDevuelto.add(clave);
    devueltos.push({ asistenteId: fila.asistente_id, turnoGuardiaId: fila.turno_guardia_id ?? null });
  }

  const retirados = [];
  const yaRetirado = new Set();
  const filas = [
    ...(resultado?.turnos_retirados ?? []),
    ...(resultado?.asignaciones_retiradas ?? []),
  ];
  for (const fila of filas) {
    if (!fila?.asistente_id) continue;
    const clave = `${fila.asistente_id}|${fila.turno_guardia_id ?? ''}`;
    if (yaRetirado.has(clave) || yaDevuelto.has(clave)) continue;
    yaRetirado.add(clave);
    retirados.push({ asistenteId: fila.asistente_id, turnoGuardiaId: fila.turno_guardia_id ?? null });
  }

  return { retirados, devueltos };
}

async function turnosPorId(prestadoraId, ids) {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return new Map();
  const { data, error } = await enLaPrestadora(prestadoraId, TRABAJO, (db) => db
    .from('turnos_guardia')
    .select('id, fecha, hora_inicio, hora_fin')
    .eq('prestadora_id', prestadoraId)
    .in('id', unicos));
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((t) => [t.id, t]));
}

async function avisarAlCoordinador({ prestadoraId, resultado, motivo, idioma }) {
  const config = await configuracionEvento(EVENTO_VETO_DE_DECISION, prestadoraId);
  if (config && config.activo === false) return;

  const [{ data: coordinador }, { data: servicio }, zona] = await Promise.all([
    enLaPrestadora(prestadoraId, TRABAJO, (db) => db
      .from('usuarios')
      .select('email, telefono')
      .eq('prestadora_id', prestadoraId)
      .eq('id', resultado.decidida_por)
      .maybeSingle()),
    resultado.servicio_id
      ? enLaPrestadora(prestadoraId, TRABAJO, (db) => db
        .from('servicios')
        .select('etiqueta')
        .eq('prestadora_id', prestadoraId)
        .eq('id', resultado.servicio_id)
        .maybeSingle())
      : Promise.resolve({ data: null }),
    enLaPrestadora(prestadoraId, TRABAJO, (db) => zonaDeLaPrestadora(db, prestadoraId)),
  ]);
  if (!coordinador) return;

  const { asunto, texto } = mensajeDelSistema(EVENTO_VETO_DE_DECISION, idioma, {
    fecha: fechaDeLaDecision(resultado.decidida_at, idioma, zona),
    servicio: servicio?.etiqueta ?? '',
    motivo,
  }, prestadoraId);

  if (coordinador.email) {
    try {
      await enviarEmail({ to: coordinador.email, asunto, texto, prestadoraId });
    } catch (err) {
      console.error(`${TRABAJO}: el correo al Coordinador no salió:`, err.message);
    }
  }

  // Al teléfono del Coordinador y a ningún otro: sin número propio no sale por esta vía, porque el
  // de contacto de la Prestadora no es de él. El correo ya salió arriba.
  if (coordinador.telefono) {
    await notificarCoordinador({
      evento: EVENTO_VETO_DE_DECISION,
      prestadoraId,
      asunto,
      texto,
      telefono: coordinador.telefono,
      sinCorreo: true,
    });
  }
}

/**
 * Manda los avisos de un veto ya hecho.
 *
 * @param {string} prestadoraId
 * @param {object} resultado  lo que devolvió `vetar_decision`
 * @param {string} motivo     el motivo que escribió la administración
 */
export async function avisarElVeto(prestadoraId, resultado, motivo) {
  if (!prestadoraId || !resultado) return;

  try {
    const idioma = await enLaPrestadora(prestadoraId, TRABAJO, (db) => idiomaDeLaPrestadora(db, prestadoraId));

    try {
      await avisarAlCoordinador({ prestadoraId, resultado, motivo, idioma });
    } catch (err) {
      console.error(`${TRABAJO}: el aviso al Coordinador no salió:`, err.message);
    }

    const { retirados, devueltos } = avisosALosAsistentes(resultado);
    if (!retirados.length && !devueltos.length) return;

    // Un turno retirado ya no existe para el Asistente, así que su día y su horario vienen en lo
    // que devolvió el veto. Los demás se leen de la base.
    const retiradoConHorario = new Map((resultado.turnos_retirados ?? [])
      .filter((t) => t?.turno_guardia_id)
      .map((t) => [t.turno_guardia_id, t]));
    const turnos = await turnosPorId(prestadoraId, [...retirados, ...devueltos]
      .map((a) => a.turnoGuardiaId)
      .filter((id) => id && !retiradoConHorario.has(id)));
    const datosDe = (turnoGuardiaId) => {
      const turno = retiradoConHorario.get(turnoGuardiaId) ?? turnos.get(turnoGuardiaId) ?? {};
      return { fecha: turno.fecha ?? '', horaInicio: turno.hora_inicio ?? '', horaFin: turno.hora_fin ?? '' };
    };

    for (const { asistenteId, turnoGuardiaId } of retirados) {
      await avisarAlAsistente({
        prestadoraId, asistenteId, idioma, clave: 'turno_guardia_retirado', datos: datosDe(turnoGuardiaId), url: '/turnos-guardia',
      });
    }
    for (const { asistenteId, turnoGuardiaId } of devueltos) {
      await avisarAlAsistente({
        prestadoraId, asistenteId, idioma, clave: 'turno_guardia_para_responder', datos: datosDe(turnoGuardiaId), url: '/asignaciones',
      });
    }
  } catch (err) {
    console.error(`${TRABAJO}:`, err.message);
  }
}
