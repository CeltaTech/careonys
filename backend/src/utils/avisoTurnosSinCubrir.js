import { enLaPrestadora } from '../db/connection.js';
import { notificarCoordinador } from './whatsapp.js';
import { mensajeDelSistema } from '../i18n/avisos.js';
import { idiomaDeLaPrestadora } from '../i18n/idiomaDeLaPrestadora.js';
import { FICHA_NOMBRE, conSuFicha } from './fichaDelPaciente.js';

// Aviso al Coordinador de los turnos sin cubrir (paso 27, punto 3, docs/PLAN_HASTA_PRODUCCION.md).
//
// Un turno sin cubrir es una guardia del cronograma, o una parte de ella, que no tiene ningún
// turno de guardia creado. No es el turno vacante: ése existe y le falta el Asistente, y lo avisa
// `revisarTurnosGuardiaSinCubrir.js`.
//
// Quién encuentra los turnos sin cubrir es la base: la cuenta la hace
// `anotar_turnos_sin_cubrir_de_la_prestadora`, que deja anotado cada turno en
// `turnos_sin_cubrir_avisados`. Acá sólo se avisa lo anotado que todavía no se avisó.
//
// **Un aviso por Servicio, y no uno por turno.** Un Servicio nuevo puede dejar sin cubrir todos los
// días de la semana, y siete mensajes por una sola alta serían siete correos por lo mismo. Los
// Pacientes que comparten día y horario van en un solo renglón: es un solo turno.
//
// **Se avisa una vez.** Un turno queda marcado como avisado sólo después de que el aviso salió.
// Si el envío falla, queda sin marcar y la vuelta siguiente lo vuelve a intentar.
//
// Corre adentro del trabajo de una sola Prestadora por vez: la base no le deja ver ninguna otra.
// Cada consulta nombra además la Prestadora para la que trabaja.

export const EVENTO_TURNO_SIN_CUBRIR = 'turno_sin_cubrir';

const TRABAJO = 'aviso de turnos sin cubrir';

/**
 * El día y la hora de un momento guardado sin zona horaria, tal como lo devuelve la base
 * («2026-11-21T08:00:00» o «2026-11-21 08:00:00»). Es la hora de la Prestadora: no se convierte.
 */
function diaYHora(momento) {
  const [dia = '', hora = ''] = String(momento ?? '').split(/[T ]/);
  return { fecha: dia, hora: hora.slice(0, 5) };
}

/**
 * Los avisos que hay que mandar, uno por Servicio, a partir de las filas pendientes.
 *
 * Es puro: no consulta nada, así que se prueba sin base.
 *
 * @param {Array<{id: string, servicio_id: string, paciente_id: string, inicio: string, fin: string}>} filas
 * @param {Map<string, string|null>} nombrePorPaciente
 * @returns {Array<{servicioId: string, filas: string[], turnos: Array<{fecha: string, horaInicio: string, horaFin: string, pacientes: string[]}>}>}
 */
export function avisosPorServicio(filas, nombrePorPaciente) {
  const porServicio = new Map();

  for (const fila of filas ?? []) {
    if (!porServicio.has(fila.servicio_id)) porServicio.set(fila.servicio_id, { filas: [], turnos: new Map() });
    const aviso = porServicio.get(fila.servicio_id);
    aviso.filas.push(fila.id);

    const horario = `${fila.inicio}|${fila.fin}`;
    if (!aviso.turnos.has(horario)) {
      aviso.turnos.set(horario, { inicio: fila.inicio, fin: fila.fin, pacientes: new Set() });
    }
    aviso.turnos.get(horario).pacientes.add(fila.paciente_id);
  }

  return [...porServicio.entries()].map(([servicioId, aviso]) => ({
    servicioId,
    filas: aviso.filas,
    turnos: [...aviso.turnos.values()]
      .sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)) || String(a.fin).localeCompare(String(b.fin)))
      .map((turno) => {
        const inicio = diaYHora(turno.inicio);
        return {
          fecha: inicio.fecha,
          horaInicio: inicio.hora,
          horaFin: diaYHora(turno.fin).hora,
          pacientes: [...turno.pacientes]
            .map((pacienteId) => nombrePorPaciente?.get(pacienteId))
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b)),
        };
      }),
  }));
}

/** Los nombres de los Pacientes, acotados a la Prestadora. */
async function nombresDePacientes(db, prestadoraId, pacienteIds) {
  if (pacienteIds.length === 0) return new Map();
  const { data, error } = await db
    .from('pacientes')
    .select(`id, ${FICHA_NOMBRE}`)
    .eq('prestadora_id', prestadoraId)
    .in('id', pacienteIds);
  if (error) throw new Error(`No se pudieron leer los Pacientes de los turnos sin cubrir: ${error.message}`);
  return new Map((data ?? []).map((paciente) => {
    const conNombre = conSuFicha(paciente);
    return [conNombre.id, conNombre.nombre ?? null];
  }));
}

/**
 * Lo mismo que `enviarAvisosDeTurnosSinCubrir`, con la conexión y el envío recibidos de afuera.
 * Así se prueba sin base y sin mandar nada.
 *
 * @returns {Promise<{avisados: number, fallidos: number}>} cuántos Servicios se avisaron y en cuántos falló el envío
 */
export async function avisarTurnosSinCubrir(db, prestadoraId, { notificar = notificarCoordinador } = {}) {
  const { data: filas, error } = await db
    .from('turnos_sin_cubrir_avisados')
    .select('id, servicio_id, paciente_id, inicio, fin')
    .eq('prestadora_id', prestadoraId)
    .is('avisado_at', null)
    .is('resuelto_at', null)
    .order('inicio');
  if (error) throw new Error(`No se pudieron leer los turnos sin cubrir: ${error.message}`);
  if (!filas?.length) return { avisados: 0, fallidos: 0 };

  const nombres = await nombresDePacientes(db, prestadoraId, [...new Set(filas.map((f) => f.paciente_id))]);
  const idioma = await idiomaDeLaPrestadora(db, prestadoraId);

  let avisados = 0;
  let fallidos = 0;
  for (const aviso of avisosPorServicio(filas, nombres)) {
    try {
      await notificar({
        evento: EVENTO_TURNO_SIN_CUBRIR,
        prestadoraId,
        ...mensajeDelSistema(EVENTO_TURNO_SIN_CUBRIR, idioma, { turnos: aviso.turnos }, prestadoraId),
      });
    } catch (e) {
      // Sin marcar: la vuelta siguiente lo vuelve a intentar.
      fallidos += 1;
      console.error(`Error avisando los turnos sin cubrir del Servicio ${aviso.servicioId} (prestadora ${prestadoraId}):`, e.message);
      continue;
    }

    const { error: errorMarca } = await db
      .from('turnos_sin_cubrir_avisados')
      .update({ avisado_at: new Date().toISOString() })
      .eq('prestadora_id', prestadoraId)
      .in('id', aviso.filas)
      .is('avisado_at', null);
    if (errorMarca) {
      console.error(`Error anotando como avisados los turnos sin cubrir del Servicio ${aviso.servicioId} (prestadora ${prestadoraId}):`, errorMarca.message);
    }
    avisados += 1;
  }
  return { avisados, fallidos };
}

/**
 * Manda los avisos pendientes de una Prestadora: uno por Servicio, y marca como avisado sólo lo
 * que salió.
 *
 * @param {string} prestadoraId
 */
export function enviarAvisosDeTurnosSinCubrir(prestadoraId) {
  return enLaPrestadora(prestadoraId, TRABAJO, (db) => avisarTurnosSinCubrir(db, prestadoraId));
}

/**
 * Rehace la cuenta de turnos sin cubrir de una Prestadora y manda los avisos pendientes. Es lo que
 * corre el pasaje diario, una vez por Prestadora.
 *
 * Si la cuenta falla, igual se avisa lo que ya estaba anotado: es un turno sin cubrir que nadie
 * vio todavía.
 *
 * @param {string} prestadoraId
 */
export async function revisarTurnosSinCubrir(prestadoraId) {
  const { error } = await enLaPrestadora(prestadoraId, TRABAJO, (db) =>
    db.rpc('anotar_turnos_sin_cubrir_de_la_prestadora'));
  if (error) {
    console.error(`Error contando los turnos sin cubrir (prestadora ${prestadoraId}):`, error.message);
  }
  return enviarAvisosDeTurnosSinCubrir(prestadoraId);
}
