import { huecosDeTurnosSinCubrir } from './sugerenciasDeAsistentes';
import { hoyISO, sumarDias } from './horarios';

/**
 * Los turnos del cronograma de guardias de un Servicio que nadie cubre, ya como huecos para
 * ordenar la lista de Asistentes.
 *
 * Mira desde hoy hasta donde la Prestadora genera los turnos de guardia, el mismo plazo con el que
 * la base avisa los turnos sin cubrir. Lee con la sesión de quien mira: si la base no contesta
 * —error o sin permiso—, devuelve una lista vacía, y la lista de Asistentes se ordena igual con los
 * turnos de guardia vacantes o sólo con los criterios del Servicio.
 *
 * @param supabase      el cliente con la sesión de quien mira.
 * @param prestadoraId  la Prestadora de la sesión.
 * @param servicioId    el Servicio.
 * @param hoy           la fecha de hoy, `AAAA-MM-DD`.
 */
export async function cargarTurnosSinCubrirDelServicio(supabase, prestadoraId, servicioId, hoy = hoyISO()) {
  if (!prestadoraId || !servicioId) return [];
  const { data: prestadora, error: errorPrestadora } = await supabase
    .from('prestadoras')
    .select('dias_generacion_series_turno_guardia')
    .eq('id', prestadoraId)
    .maybeSingle();
  if (errorPrestadora) {
    console.error(errorPrestadora);
    return [];
  }
  const dias = Number(prestadora?.dias_generacion_series_turno_guardia);
  if (!Number.isInteger(dias) || dias <= 0) return [];

  const { data, error } = await supabase.rpc('turnos_sin_cubrir', {
    p_servicio: servicioId,
    p_desde: hoy,
    p_hasta: sumarDias(hoy, dias),
  });
  if (error) {
    console.error(error);
    return [];
  }
  return huecosDeTurnosSinCubrir(data, servicioId);
}
