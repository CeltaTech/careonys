import { supabase } from '../db/connection.js';

// Mientras no exista una autorización de monitoreo vigente y firmada para el Paciente, la
// sección de signos vitales no se muestra en absoluto en el Reporte Diario (decisión del
// Desarrollador, 2026-07-21 — deslinde de responsabilidades). El rango de un Paciente pisa
// al de la Prestadora cuando existe override; nunca hay un valor fijo en código (regla 1 y
// 10 de CLAUDE.md). Usado tanto por la PWA de Asistentes (para mostrar el formulario) como
// por la de Familias (para el indicador de color al leer un reporte ya cargado).
export async function resolverVitalesHabilitados(pacienteId, prestadoraId) {
  const { data: autorizacion } = await supabase
    .from('autorizaciones_monitoreo_paciente')
    .select('id')
    .eq('prestadora_id', prestadoraId)
    .eq('paciente_id', pacienteId)
    .eq('vigente', true)
    .maybeSingle();

  if (!autorizacion) {
    return { habilitados: false, rangos: {} };
  }

  const { data: filas } = await supabase
    .from('rangos_referencia_vitales')
    .select('signo, valor_min, valor_max, unidad, paciente_id')
    .eq('prestadora_id', prestadoraId)
    .or(`paciente_id.eq.${pacienteId},paciente_id.is.null`);

  const rangos = {};
  for (const fila of (filas || []).filter((f) => f.paciente_id === null)) {
    rangos[fila.signo] = { min: fila.valor_min, max: fila.valor_max, unidad: fila.unidad };
  }
  for (const fila of (filas || []).filter((f) => f.paciente_id === pacienteId)) {
    rangos[fila.signo] = { min: fila.valor_min, max: fila.valor_max, unidad: fila.unidad };
  }

  return { habilitados: true, rangos };
}
