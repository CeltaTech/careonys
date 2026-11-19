import { supabase } from './supabaseClient';
import { mensajeDeError } from './errores';

/* Mover un turno de guardia de la fila de un Paciente a la de otro, en la vista por Paciente.
   =========================================================================================

   POR QUÉ ESTO NECESITA SU PROPIO ARCHIVO. Antes un turno de guardia tenía un solo Paciente, así que
   arrastrarla de una fila a otra era escribir una columna: `paciente_id = el nuevo`. Ahora un
   turno de guardia puede cubrir a varios, y "moverla" ya no quiere decir eso.

   Lo que quiere decir es preciso: en ESA fila deja de aparecer y en la otra empieza a
   aparecer. Los demás Pacientes del turno no se tocan. Si un turno cubre a Alberto y a Elena y
   alguien arrastra el turno de la fila de Elena a la de Héctor, queda cubriendo a Alberto y a
   Héctor — Alberto se queda donde estaba, porque nadie lo movió.

   Y hay una trampa que hace falta esquivar. La columna vieja `turnos_guardia.paciente_id` guarda a
   UNO solo de los Pacientes, y un disparador de la base la mantiene sincronizada con la lista.
   Si se escribiera esa columna sin mirar a quién se está moviendo, el disparador sacaría de la
   lista al Paciente que figura ahí, que casi nunca es el que se arrastró. Por eso acá se
   distingue el caso: si el que se mueve es justo el de la columna vieja, se cambia la columna y
   el disparador hace el resto; si es cualquier otro, se toca la lista y la columna no.

   Ver `lib/pacientesDeTurnoGuardia.js` y el disparador
   `sincronizar_paciente_principal` de `turnos_guardia`. */

/**
 * @param {object} guardia  El turno de guardia entero, ya enriquecida por `conPacientes` — hace falta
 *                          `paciente_id` (el de la columna vieja).
 * @param {string} pacienteOrigen  De qué fila se la sacó. Puede no ser un Paciente real: si se
 *                          arrastra desde la fila de "sin Paciente", acá llega esa marca y no
 *                          hay nada que sacar.
 * @param {string} pacienteDestino  A qué fila se la llevó.
 * @param {object} t  Los textos del idioma en que está el Panel, para que un error de la base
 *                          no llegue a la pantalla escrito en inglés. Ver `lib/errores.js`.
 * @param {string} prestadoraId  La Prestadora de la sesión, nunca la que trae el turno de guardia: un dato
 *                          de aislamiento no viaja por la fila que está en pantalla.
 * @returns {Promise<{ error: string | null }>} El motivo si algo falló, o null si salió todo.
 */
export async function cambiarPacienteDeTurnoGuardia(turno_guardia, pacienteOrigen, pacienteDestino, t = null, prestadoraId = null) {
  if (!turno_guardia?.id || !pacienteDestino) return { error: null };
  if (pacienteOrigen === pacienteDestino) return { error: null };

  const esElDeLaColumnaVieja = !turno_guardia.paciente_id || turno_guardia.paciente_id === pacienteOrigen;

  if (esElDeLaColumnaVieja) {
    const { error } = await supabase
      .from('turnos_guardia')
      .update({ paciente_id: pacienteDestino })
      .eq('id', turno_guardia.id);
    return { error: error ? mensajeDeError(error, t) : null };
  }

  // Primero se agrega y después se saca. Al revés, un corte de conexión en el medio dejaría la
  // guardia con un Paciente menos y ninguno nuevo; así, en el peor caso queda con los dos, que
  // se ve raro pero no pierde a nadie.
  const { error: errorAlta } = await supabase
    .from('turno_guardia_pacientes')
    .upsert(
      { turno_guardia_id: turno_guardia.id, paciente_id: pacienteDestino, prestadora_id: prestadoraId },
      { onConflict: 'turno_guardia_id,paciente_id', ignoreDuplicates: true }
    );
  if (errorAlta) return { error: mensajeDeError(errorAlta, t) };

  const { error: errorBaja } = await supabase
    .from('turno_guardia_pacientes')
    .delete()
    .eq('turno_guardia_id', turno_guardia.id)
    .eq('paciente_id', pacienteOrigen);
  if (errorBaja) return { error: mensajeDeError(errorBaja, t) };

  return { error: null };
}
