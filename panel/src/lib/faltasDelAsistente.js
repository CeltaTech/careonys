// Las FALTAS DEL ASISTENTE, que muestra su Legajo.
// ============================================================================
//
// Una falta es un turno de guardia en el que el Asistente dejó la guardia al relevo sin haber
// presentado el Reporte Diario. Nadie la carga: sale de los turnos de guardia, que guardan para
// siempre que el Asistente salió sin el reporte y, si después lo presentó, cuándo llegó.
//
// La falta no se borra cuando el reporte llega: queda a la vista con la fecha en que llegó. El
// sistema no aplica ninguna consecuencia; la lista es para que la Prestadora la vea.

import { supabase } from './supabaseClient';
import { cargarPacientesDeTurnosGuardia, conPacientes } from './pacientesDeTurnoGuardia';
import { FICHA_NOMBRE, conSusFichas } from './fichaDelPaciente';

/** Las clases de falta que hoy existen. Cada una tiene su nombre en las traducciones. */
export const FALTA = { SALIDA_SIN_REPORTE: 'salida_sin_reporte' };

const COLUMNAS = 'id, fecha, hora_inicio, paciente_id, reporte_llego_at';

/**
 * Convierte un turno de guardia con la falta anotada en la fila que muestra el Legajo.
 * `reporteLlegoAt` queda vacío mientras el reporte siga pendiente.
 */
export function faltaDelTurnoGuardia(turno_guardia) {
  return {
    id: turno_guardia.id,
    fecha: turno_guardia.fecha,
    pacientes_nombres: turno_guardia.pacientes_nombres ?? [],
    falta: FALTA.SALIDA_SIN_REPORTE,
    reporteLlegoAt: turno_guardia.reporte_llego_at ?? null,
  };
}

/**
 * Todas las faltas del Asistente, de la más reciente a la más vieja.
 * Un error de la base se lanza tal cual: lo traduce la pantalla.
 */
export async function cargarFaltasDelAsistente(asistenteId) {
  const { data, error } = await supabase
    .from('turnos_guardia')
    .select(COLUMNAS)
    .eq('asistente_id', asistenteId)
    .eq('salio_sin_reporte', true)
    .order('fecha', { ascending: false })
    .order('hora_inicio', { ascending: false })
    .order('id', { ascending: true });
  if (error) throw error;

  const turnos_guardia = data ?? [];
  if (turnos_guardia.length === 0) return [];

  const porTurnoGuardia = await cargarPacientesDeTurnosGuardia(turnos_guardia.map((g) => g.id));
  const idsPacientes = [
    ...new Set([...porTurnoGuardia.values()].flat().concat(turnos_guardia.map((g) => g.paciente_id))),
  ].filter(Boolean);
  const { data: pacientes, error: errorPacientes } = idsPacientes.length
    ? await supabase.from('pacientes').select(`id, ${FICHA_NOMBRE}`).in('id', idsPacientes)
    : { data: [], error: null };
  if (errorPacientes) throw errorPacientes;

  const nombres = Object.fromEntries(conSusFichas(pacientes).map((p) => [p.id, p.nombre]));
  return conPacientes(turnos_guardia, porTurnoGuardia, nombres).map(faltaDelTurnoGuardia);
}
