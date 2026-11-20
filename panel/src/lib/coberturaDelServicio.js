import { supabase } from './supabaseClient';

/* La cobertura de un Servicio: su período, y las pausas, suspensiones y cancelaciones.
   ==========================================================================

   Todo lo decide la base, en una sola operación por pedido: qué turnos de guardia alcanza cada
   acción, cuáles no se tocan porque ya pasaron o tienen Asistente, quién la hizo y con qué motivo.
   Este archivo sólo le pasa lo que eligió la persona y devuelve el error tal como vino, para que
   la pantalla lo traduzca con `mensajeDeError`.

   Una acción alcanza a una de cuatro cosas, y cada una viaja con su identificador:
   el Servicio, una Prestación, un turno de guardia recurrente o un solo turno de guardia. */

export const ALCANCES = ['servicio', 'prestacion', 'turno_guardia_recurrente', 'turno_guardia'];

// Pausa: breve y con fecha de vuelta. Suspensión: larga o sin fecha. Cancelación: no vuelve.
export const TIPOS = ['pausa', 'suspension', 'cancelacion'];

// La cancelación del Servicio entero es la baja, que tiene su propia pantalla; la de un solo
// turno de guardia es la que ya está en el detalle del turno.
export const ALCANCES_QUE_SE_CANCELAN_DESDE_UNA_FECHA = ['prestacion', 'turno_guardia_recurrente'];

function lanzarSiFallo({ data, error }) {
  if (error) throw error;
  return data;
}

/** Pausa o suspende la cobertura. Devuelve el identificador de la interrupción. */
export async function interrumpirCobertura({ tipo, alcance, servicioId, prestacionId = null, serieId = null, turnoGuardiaId = null, desde = null, vuelta = null, motivoId, detalle = null }) {
  return lanzarSiFallo(
    await supabase.rpc('interrumpir_cobertura', {
      p_tipo: tipo,
      p_alcance: alcance,
      p_servicio: servicioId,
      p_prestacion: prestacionId,
      p_serie: serieId,
      p_turno_guardia: turnoGuardiaId,
      p_desde: desde,
      p_vuelta: vuelta,
      p_motivo: motivoId,
      p_detalle: detalle,
    }),
  );
}

/** Levanta una pausa o una suspensión. Sin fecha, desde hoy. */
export async function reanudarCobertura(interrupcionId, desde = null) {
  return lanzarSiFallo(await supabase.rpc('reanudar_cobertura', { p_interrupcion: interrupcionId, p_desde: desde }));
}

/** Cancela una Prestación o un turno de guardia recurrente desde una fecha. */
export async function cancelarCoberturaDesde({ alcance, prestacionId = null, serieId = null, desde, motivoId, detalle = null }) {
  return lanzarSiFallo(
    await supabase.rpc('cancelar_cobertura_desde', {
      p_alcance: alcance,
      p_prestacion: prestacionId,
      p_serie: serieId,
      p_desde: desde,
      p_motivo: motivoId,
      p_detalle: detalle,
    }),
  );
}

/** Cambia los días y el horario de un recurrente desde una fecha. Devuelve el recurrente nuevo. */
export async function editarTurnoGuardiaRecurrente({ serieId, desde, diasSemana, horaInicio, horaFin, diasHastaElFin }) {
  return lanzarSiFallo(
    await supabase.rpc('editar_turno_guardia_recurrente', {
      p_serie: serieId,
      p_desde: desde,
      p_dias_semana: diasSemana,
      p_hora_inicio: horaInicio,
      p_hora_fin: horaFin,
      p_dias_hasta_el_fin: diasHastaElFin,
    }),
  );
}

/** Cambia el primer y el último día del Servicio. Sin último día, la duración es indeterminada. */
export async function cambiarPeriodoDelServicio(servicioId, desde, hasta) {
  return lanzarSiFallo(
    await supabase.rpc('cambiar_periodo_del_servicio', { p_servicio: servicioId, p_desde: desde, p_hasta: hasta || null }),
  );
}

/** Las pausas y suspensiones del Servicio que todavía no se levantaron. */
export async function interrupcionesVigentes(servicioId) {
  return lanzarSiFallo(
    await supabase
      .from('interrupciones_de_cobertura')
      .select('id, tipo, alcance, prestacion_id, serie_id, turno_guardia_id, hospitalizacion_id, desde, vuelta, motivo_id, detalle, created_at')
      .eq('servicio_id', servicioId)
      .is('levantada_at', null)
      .order('desde', { ascending: true }),
  );
}

/** Los datos de un recurrente que hacen falta para editarlo. */
export async function datosDelRecurrente(serieId) {
  return lanzarSiFallo(
    await supabase
      .from('series_turnos_guardia')
      .select('id, servicio_id, dias_semana, hora_inicio, hora_fin, dias_hasta_el_fin, vigente_desde, vigente_hasta, estado')
      .eq('id', serieId)
      .single(),
  );
}
