import { llamarApiPanel } from './apiPanel.js';

// Punto único del lado del Panel para avisar que una o varios turnos de guardia cambiaron de Asistente.
//
// El Panel no puede mandar el mensaje: escribe el turno de guardia contra la base, pero no tiene push, ni
// WhatsApp, ni correo. Los tres viven en el backend, así que acá sólo se le pide.
//
// **El mensaje nunca voltea la operación.** Cuando se llega a esta función el turno de guardia ya cambió de
// manos: contestar un error haría que la pantalla muestre como fallido algo que salió bien. Si el
// pedido no sale, queda en la consola y la reasignación sigue en pie.
//
// Se llama desde los tres lugares donde un turno de guardia cambia de Asistente: `reasignarTurnoGuardia.js`,
// `moverTurnoGuardia.js` en la vista por Asistente, y la asignación de cobertura de una ausencia.
export async function avisarCambioDeAsistente({ turnoGuardiaIds, asistenteNuevoId, asistenteAnteriorId = null }) {
  if (!turnoGuardiaIds?.length || !asistenteNuevoId) return;

  try {
    await llamarApiPanel('/turnos-guardia/aviso-cambio-asistente', {
      method: 'POST',
      body: JSON.stringify({
        turno_guardia_ids: turnoGuardiaIds,
        asistente_nuevo_id: asistenteNuevoId,
        asistente_anterior_id: asistenteAnteriorId,
      }),
    });
  } catch (e) {
    console.error('No se pudo avisar el cambio de Asistente:', e);
  }
}
