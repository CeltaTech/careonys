import { supabase } from '../db/connection.js';
import { enviarPushAsistente } from './push.js';
import { enviarWhatsApp } from './whatsapp.js';
import { configuracionEvento } from './email.js';

// Recorre los 3 eventos de push a Asistentes listados en
// docs/PRD_04_05_App_Servicio.md:115 ("Nueva guardia asignada, mensajes del coordinador,
// recordatorios"). Mismo patrón de "ya notificado" que revisarNotificacionesCoordinador.js:
// cada evento tiene su propia columna *_enviado_at, se manda una sola vez, y el cron corre
// cada pocos minutos recorriendo TODAS las prestadoras por igual.

const MINUTOS_ANTES_RECORDATORIO = 60;
const EVENTO_AVISO_RUTINA = 'aviso_rutina_asistente';

// Fase 11: estos avisos son de rutina, no críticos — van solo por push. Si el push falla
// (o la Asistente no tiene ninguna suscripción activa) y la Prestadora activó
// whatsapp_activo para este evento, recién ahí se manda por WhatsApp. Nunca en paralelo,
// para no generar costo de mensajería en cada aviso de rutina — mismo criterio que
// notificarCoordinador() en whatsapp.js, pero con el respaldo condicionado al fallo del
// push en vez de ser el canal preferido.
async function respaldoWhatsappSiFalla({ prestadoraId, asistenteId, enviadoPorPush, titulo, cuerpo }) {
  if (enviadoPorPush) return;

  const config = await configuracionEvento(EVENTO_AVISO_RUTINA, prestadoraId);
  if (!config || config.activo === false || !config.whatsapp_activo) return;

  const { data: asistente } = await supabase
    .from('asistentes')
    .select('telefono')
    .eq('id', asistenteId)
    .single();
  if (!asistente?.telefono) return;

  try {
    await enviarWhatsApp({ prestadoraId, telefono: asistente.telefono, texto: `${titulo}\n\n${cuerpo}` });
  } catch (err) {
    console.error(`Error enviando WhatsApp de respaldo (${EVENTO_AVISO_RUTINA}) a asistente ${asistenteId}:`, err.message);
  }
}

export async function revisarRecordatoriosPush() {
  await revisarGuardiasAsignadas();
  await revisarMensajesCoordinador();
  await revisarRecordatoriosGuardiaProxima();
}

async function revisarGuardiasAsignadas() {
  const { data: guardias, error } = await supabase
    .from('guardias')
    .select('id, asistente_id, prestadora_id, fecha, hora_inicio')
    .is('push_asignacion_enviado_at', null)
    .not('asistente_id', 'is', null);

  if (error) {
    console.error('Error consultando guardias para push de asignación:', error.message);
    return;
  }

  for (const guardia of guardias ?? []) {
    const titulo = 'Nueva guardia asignada';
    const cuerpo = `Tenés una guardia asignada el ${guardia.fecha} a las ${guardia.hora_inicio}.`;

    const enviadoPorPush = await enviarPushAsistente(guardia.asistente_id, {
      titulo,
      cuerpo,
      url: `/guardias/${guardia.id}`,
    });
    await respaldoWhatsappSiFalla({ prestadoraId: guardia.prestadora_id, asistenteId: guardia.asistente_id, enviadoPorPush, titulo, cuerpo });

    await supabase
      .from('guardias')
      .update({ push_asignacion_enviado_at: new Date().toISOString() })
      .eq('id', guardia.id);
  }
}

async function revisarMensajesCoordinador() {
  const { data: mensajes, error } = await supabase
    .from('mensajes_asistente')
    .select('id, asistente_id, prestadora_id, mensaje')
    .is('push_enviado_at', null);

  if (error) {
    console.error('Error consultando mensajes_asistente para push:', error.message);
    return;
  }

  for (const mensaje of mensajes ?? []) {
    const titulo = 'Nuevo mensaje del coordinador';

    const enviadoPorPush = await enviarPushAsistente(mensaje.asistente_id, {
      titulo,
      cuerpo: mensaje.mensaje,
      url: '/perfil',
    });
    await respaldoWhatsappSiFalla({ prestadoraId: mensaje.prestadora_id, asistenteId: mensaje.asistente_id, enviadoPorPush, titulo, cuerpo: mensaje.mensaje });

    await supabase
      .from('mensajes_asistente')
      .update({ push_enviado_at: new Date().toISOString() })
      .eq('id', mensaje.id);
  }
}

async function revisarRecordatoriosGuardiaProxima() {
  const ahora = new Date();
  const limite = new Date(ahora.getTime() + MINUTOS_ANTES_RECORDATORIO * 60_000);

  const { data: guardias, error } = await supabase
    .from('guardias')
    .select('id, asistente_id, prestadora_id, fecha, hora_inicio')
    .is('push_recordatorio_enviado_at', null)
    .is('checkin_at', null)
    .eq('estado', 'programada')
    .not('asistente_id', 'is', null);

  if (error) {
    console.error('Error consultando guardias para recordatorio push:', error.message);
    return;
  }

  for (const guardia of guardias ?? []) {
    const inicio = new Date(`${guardia.fecha}T${guardia.hora_inicio}`);
    if (inicio.getTime() > limite.getTime() || inicio.getTime() < ahora.getTime()) continue;

    const titulo = 'Recordatorio de guardia';
    const cuerpo = `Tu guardia del ${guardia.fecha} empieza a las ${guardia.hora_inicio}.`;

    const enviadoPorPush = await enviarPushAsistente(guardia.asistente_id, {
      titulo,
      cuerpo,
      url: `/guardias/${guardia.id}`,
    });
    await respaldoWhatsappSiFalla({ prestadoraId: guardia.prestadora_id, asistenteId: guardia.asistente_id, enviadoPorPush, titulo, cuerpo });

    await supabase
      .from('guardias')
      .update({ push_recordatorio_enviado_at: new Date().toISOString() })
      .eq('id', guardia.id);
  }
}
