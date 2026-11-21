// Guardar las ACCIONES DE A MUCHOS sobre turnos de guardia.
// ============================================================================
//
// La barra de acciones de a muchos dice qué se eligió; esto lo guarda, turno por turno, con las
// mismas operaciones que se usan desde un turno solo. No hay una segunda forma de reasignar, de
// cancelar ni de asignar: se llaman las que ya existen (regla del punto único de verdad).
//
// Cada turno se guarda por separado y en orden. Si uno falla, los demás siguen: quien eligió
// veinte turnos y uno no se pudo cambiar tiene que encontrar diecinueve cambiados, y el aviso
// dice cuántos salieron de cuántos.

import { supabase } from './supabaseClient';
import { resolver } from './resoluciones';
import { mensajeDeError } from './errores';
import { reasignarTurnoGuardia } from './reasignarTurnoGuardia';
import { asignarTurnoGuardia } from './asignarTurnoGuardia';
import { correspondeLaAccion, fechaDuplicada, horarioCorrido } from './accionesMasivasTurnosGuardia';

/** Cambiar el Asistente. Queda esperando que el nuevo acepte, igual que desde el turno. */
async function reasignar(turno_guardia, { asistenteId }, t) {
  const { error } = await reasignarTurnoGuardia(turno_guardia, asistenteId ?? null, turno_guardia.fecha, t);
  return error;
}

/** Correr el horario sin cambiar quién lo hace ni cuánto dura. */
async function correr(turno_guardia, { minutos }, t) {
  const nuevo = horarioCorrido(turno_guardia, minutos);
  if (!nuevo) return mensajeDeError(new Error('El horario corrido no se puede guardar'), t, 'correrHorario');
  const { error } = await supabase.from('turnos_guardia').update(nuevo).eq('id', turno_guardia.id);
  return error ? mensajeDeError(error, t) : null;
}

/** Cancelar, con el motivo elegido. El estado en que queda lo decide el motivo, en la base. */
async function cancelar(turno_guardia, { origen, alcance, motivoId, detalle }, t) {
  const { error: errorResolucion } = await resolver({
    tabla: 'turnos_guardia',
    filaId: turno_guardia.id,
    motivoId,
    detalle,
  });
  if (errorResolucion) return mensajeDeError(errorResolucion, t);
  const { error } = await supabase
    .from('turnos_guardia')
    .update({ cancelacion_origen: origen, cancelacion_alcance: alcance })
    .eq('id', turno_guardia.id);
  return error ? mensajeDeError(error, t) : null;
}

/**
 * Duplicar a otra semana. La copia nace sin nadie, con los mismos Pacientes, el mismo Servicio
 * y el mismo horario, igual que un turno nuevo. Si el original tenía Asistente, se le asigna la
 * copia y queda esperando que la acepte: nadie se entera de un turno nuevo sin que se lo pidan.
 */
async function duplicar(turno_guardia, { semanas }, t, prestadoraId) {
  const { data: copia, error } = await supabase
    .from('turnos_guardia')
    .insert({
      prestadora_id: prestadoraId,
      asistente_id: null,
      paciente_id: turno_guardia.paciente_id,
      servicio_id: turno_guardia.servicio_id,
      fecha: fechaDuplicada(turno_guardia, semanas),
      hora_inicio: turno_guardia.hora_inicio,
      hora_fin: turno_guardia.hora_fin,
      dias_hasta_el_fin: Number(turno_guardia.dias_hasta_el_fin ?? 0),
      modalidad: turno_guardia.modalidad,
    })
    .select('id')
    .single();
  if (error) return mensajeDeError(error, t);

  const otros = (turno_guardia.pacientes ?? [])
    .map((p) => p.id)
    .filter((id) => id && id !== turno_guardia.paciente_id);
  if (otros.length) {
    const { error: errorPacientes } = await supabase
      .from('turno_guardia_pacientes')
      .insert(otros.map((id) => ({ turno_guardia_id: copia.id, paciente_id: id, prestadora_id: prestadoraId })));
    if (errorPacientes) return mensajeDeError(errorPacientes, t);
  }

  if (turno_guardia.asistente_id) {
    const { error: errorAsignacion } = await asignarTurnoGuardia(copia.id, turno_guardia.asistente_id, t);
    if (errorAsignacion) return errorAsignacion;
  }
  return null;
}

const OPERACIONES = { reasignar, correr, cancelar, duplicar };

/**
 * @param {object[]} turnos_guardia  Los turnos elegidos, como están en la pantalla.
 * @param {object} orden  Lo que manda la barra: `{ accion, ...parámetros }`.
 * @param {object} t  Los textos del idioma del Panel, para que ningún error llegue crudo.
 * @param {string} prestadoraId  La Prestadora de la sesión, nunca la que trae el turno.
 * @returns {Promise<{ ok: number, total: number, error: string | null }>} cuántos salieron, de
 *          cuántos elegidos, y el primer motivo de los que no salieron. Un turno al que la
 *          acción no le corresponde cuenta como no hecho.
 */
export async function aplicarAccionesMasivas(turnos_guardia, { accion, ...parametros }, t, prestadoraId) {
  const lista = turnos_guardia ?? [];
  const operacion = OPERACIONES[accion];
  if (!operacion || !prestadoraId) {
    return { ok: 0, total: lista.length, error: mensajeDeError(new Error(`Acción desconocida: ${String(accion)}`), t, 'accionesMasivas') };
  }

  let ok = 0;
  let primerError = null;
  for (const g of lista) {
    if (!correspondeLaAccion(accion, g)) continue;
    let falla;
    try {
      falla = await operacion(g, parametros, t, prestadoraId);
    } catch (e) {
      falla = mensajeDeError(e, t);
    }
    if (falla) primerError ??= falla;
    else ok += 1;
  }
  return { ok, total: lista.length, error: primerError };
}
