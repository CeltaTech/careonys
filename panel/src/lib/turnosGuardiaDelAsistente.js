// Los TURNOS DE GUARDIA DE UN ASISTENTE, de a una página por vez.
// ============================================================================
//
// El Legajo del Asistente muestra dos listas: la de hoy en adelante y la de antes de hoy. Las dos
// se piden de a páginas, sin tope: un Asistente con años de antigüedad tiene cientos de turnos, y
// la persona sigue pidiendo más mientras quiera mirar.
//
// La cuenta de las páginas vive acá, separada de la pantalla, para poder probarla. La situación
// de cada turno sale del semáforo y los Pacientes, de `pacientesDeTurnoGuardia`: esto no decide
// nada propio.

import { supabase } from './supabaseClient';
import { cargarPacientesDeTurnosGuardia, conPacientes } from './pacientesDeTurnoGuardia';
import { situacionDeTurnoGuardia, tonoDeTurnoGuardia } from './semaforoTurnoGuardia';
import { FICHA_NOMBRE, conSusFichas } from './fichaDelPaciente';

/** Cuántos turnos de guardia trae cada página. */
export const TURNOS_POR_PAGINA = 20;

/** Las dos listas del Legajo. */
export const TRAMOS = { PROXIMOS: 'proximos', ANTERIORES: 'anteriores' };

/* Las columnas que hacen falta. Las cuatro últimas no se muestran como tales: las necesita el
   semáforo para decidir en qué situación quedó cada turno, y `dias_hasta_el_fin` dice qué día
   termina. */
const COLUMNAS =
  'id, fecha, hora_inicio, hora_fin, dias_hasta_el_fin, paciente_id, estado, asistente_id, checkin_at, checkout_at';

/**
 * Qué filas pedir para una página. Se pide una de más: si llega, hay otra página después.
 * @returns {{ desde: number, hasta: number }} los dos extremos, incluidos, como los pide `.range()`.
 */
export function filasDeLaPagina(yaCargados, porPagina = TURNOS_POR_PAGINA) {
  const desde = Math.max(0, Number(yaCargados) || 0);
  return { desde, hasta: desde + porPagina };
}

/** Separa la fila de más que se pidió para saber si sigue habiendo. */
export function cortarLaPagina(filas, porPagina = TURNOS_POR_PAGINA) {
  const lista = filas ?? [];
  return { filas: lista.slice(0, porPagina), hayMas: lista.length > porPagina };
}

/**
 * Una página de turnos de guardia del Asistente.
 *
 * - Hoy y próximos: desde hoy, del más cercano al más lejano.
 * - Anteriores: antes de hoy, del más reciente al más viejo.
 *
 * @returns {Promise<{ filas: object[], hayMas: boolean }>} las filas con sus Pacientes, su
 *          situación y su tono. Un error de la base se lanza tal cual: lo traduce la pantalla.
 */
export async function cargarPaginaDeTurnosGuardia({ asistenteId, tramo, yaCargados, hoy, umbrales }) {
  const proximos = tramo === TRAMOS.PROXIMOS;
  const { desde, hasta } = filasDeLaPagina(yaCargados);
  let consulta = supabase.from('turnos_guardia').select(COLUMNAS).eq('asistente_id', asistenteId);
  consulta = proximos ? consulta.gte('fecha', hoy) : consulta.lt('fecha', hoy);
  const { data, error } = await consulta
    .order('fecha', { ascending: proximos })
    .order('hora_inicio', { ascending: proximos })
    .order('id', { ascending: true })
    .range(desde, hasta);
  if (error) throw error;

  const { filas: turnos_guardia, hayMas } = cortarLaPagina(data);
  const porTurnoGuardia = await cargarPacientesDeTurnosGuardia(turnos_guardia.map((g) => g.id));

  // Los nombres se piden aparte y en una sola consulta: pedirlos anidados traería el mismo
  // nombre repetido una vez por turno.
  const idsPacientes = [
    ...new Set([...porTurnoGuardia.values()].flat().concat(turnos_guardia.map((g) => g.paciente_id))),
  ].filter(Boolean);
  const { data: pacientes, error: errorPacientes } = idsPacientes.length
    ? await supabase.from('pacientes').select(`id, ${FICHA_NOMBRE}`).in('id', idsPacientes)
    : { data: [], error: null };
  if (errorPacientes) throw errorPacientes;

  const nombres = Object.fromEntries(conSusFichas(pacientes).map((p) => [p.id, p.nombre]));
  const ctx = { umbrales };
  const filas = conPacientes(turnos_guardia, porTurnoGuardia, nombres).map((g) => ({
    ...g,
    situacion: situacionDeTurnoGuardia(g, ctx),
    tono: tonoDeTurnoGuardia(g, ctx),
  }));
  return { filas, hayMas };
}
