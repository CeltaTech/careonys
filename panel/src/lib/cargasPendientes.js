// Lo que carga un Coordinador sobre un Paciente que no coordina queda pendiente: la base no lo
// aplica, lo guarda en `cargas_sujetas_a_aprobacion` hasta que lo acepte el Coordinador asignado
// o el Administrador. La escritura sale bien igual, así que quien guardó no se entera si nadie se
// lo dice. Cuándo queda pendiente lo decide la base con `la_carga_queda_pendiente`, el mismo
// criterio que usa el disparador; acá sólo se le pregunta.

import { supabase } from './supabaseClient';
import { avisar } from './mensajeEmergente';

/**
 * Después de guardar algo de un Paciente, avisa si quedó pendiente de aprobación. Si la pregunta
 * falla no avisa nada: lo guardado ya está, y un aviso de error sobre algo que salió bien confunde.
 */
export async function avisarSiQuedoPendiente(pacienteId, t) {
  const { data, error } = await supabase.rpc('la_carga_queda_pendiente', { p_paciente: pacienteId });
  if (!error && data === true) avisar(t.cargas_pendientes.quedo_pendiente);
}
