import { enviarPushAsistente } from './push.js';
import { respaldoWhatsappSiFalla } from './revisarRecordatoriosPush.js';
import { mensajeDelSistema } from '../i18n/avisos.js';
import { idiomaDeLaPrestadora } from '../i18n/idiomaDeLaPrestadora.js';

// Lo que se le avisa a cada Asistente cuando el Panel asigna un turno: al que se lo asignaron, que
// tiene un turno para responder, y a quien lo tenía —aceptado o esperando respuesta—, que ya no es
// suyo. Al Cliente todavía no se le dice nada: el turno cambia de manos recién cuando el nuevo
// acepta, y ahí avisa `avisarCambioDeAsistente`.
//
// Nunca tira: la asignación ya quedó hecha cuando se llega acá, y un aviso que no salió no la
// vuelve fallida.
//
// Entra con la conexión que recibe —la de quien asignó—: la marca de avisado la escribe la misma
// persona que pudo asignar el turno.

async function avisarAlAsistente({ prestadoraId, asistenteId, idioma, clave, datos, url }) {
  try {
    const { titulo, cuerpo } = mensajeDelSistema(clave, idioma, datos);
    const enviadoPorPush = await enviarPushAsistente(prestadoraId, asistenteId, { titulo, cuerpo, url });
    await respaldoWhatsappSiFalla({ prestadoraId, asistenteId, enviadoPorPush, titulo, cuerpo });
  } catch (e) {
    console.error(`Error avisando al Asistente ${asistenteId} (${clave}):`, e.message);
  }
}

export async function avisarAsignacionDeTurno(db, { prestadoraId, guardia, asistenteNuevoId, retirados }) {
  if (!prestadoraId || !guardia) return;

  const idioma = await idiomaDeLaPrestadora(db, prestadoraId);
  const datos = { fecha: guardia.fecha, horaInicio: guardia.hora_inicio, horaFin: guardia.hora_fin };

  // Quien vuelve a recibir el mismo turno —porque cambió de horario— no lo pierde: se lo vuelve a
  // preguntar, y le llega sólo eso.
  const salientes = [...new Set((retirados ?? []).filter(Boolean))].filter((id) => id !== asistenteNuevoId);

  for (const asistenteId of salientes) {
    await avisarAlAsistente({ prestadoraId, asistenteId, idioma, clave: 'turno_retirado', datos, url: '/guardias' });
  }

  if (!asistenteNuevoId) return;

  await avisarAlAsistente({
    prestadoraId,
    asistenteId: asistenteNuevoId,
    idioma,
    clave: 'turno_para_responder',
    datos,
    url: '/asignaciones',
  });

  // Ya avisado: cuando acepte, el turno pasa a su nombre y el aviso de guardia asignada
  // (`revisarRecordatoriosPush.js`) no tiene que volver a llegarle por algo que ya contestó.
  const { error } = await db
    .from('guardias')
    .update({ push_asignacion_enviado_at: new Date().toISOString() })
    .eq('prestadora_id', prestadoraId)
    .eq('id', guardia.id);
  if (error) console.error(`Error marcando avisada la asignación de la guardia ${guardia.id}:`, error.message);
}

// El turno fijo se asigna igual que el de un día, y se contesta una sola vez para todos sus días.
// Los días de la serie que ya existen quedan sin avisar uno por uno: cuando acepta, la base los
// pone a su nombre y los marca avisados.
export async function avisarAsignacionDeSerie(db, { prestadoraId, serie, asistenteNuevoId, retirados }) {
  if (!prestadoraId || !serie) return;

  const idioma = await idiomaDeLaPrestadora(db, prestadoraId);
  const datos = { dias: serie.dias_semana, horaInicio: serie.hora_inicio, horaFin: serie.hora_fin };

  const salientes = [...new Set((retirados ?? []).filter(Boolean))].filter((id) => id !== asistenteNuevoId);

  for (const asistenteId of salientes) {
    await avisarAlAsistente({ prestadoraId, asistenteId, idioma, clave: 'turno_fijo_retirado', datos, url: '/guardias' });
  }

  if (!asistenteNuevoId) return;

  await avisarAlAsistente({
    prestadoraId,
    asistenteId: asistenteNuevoId,
    idioma,
    clave: 'turno_fijo_para_responder',
    datos,
    url: '/asignaciones',
  });
}

// El reemplazo durante una ausencia: el sustituto lo contesta una sola vez para todos sus días.
export async function avisarAsignacionDeAusencia(db, { prestadoraId, asistenteId, desde, hasta }) {
  if (!prestadoraId || !asistenteId) return;

  const idioma = await idiomaDeLaPrestadora(db, prestadoraId);
  await avisarAlAsistente({
    prestadoraId,
    asistenteId,
    idioma,
    clave: 'reemplazo_para_responder',
    datos: { desde, hasta },
    url: '/asignaciones',
  });
}
