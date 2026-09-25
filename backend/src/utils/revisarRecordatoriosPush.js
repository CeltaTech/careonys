import { supabase } from '../db/connection.js';
import { enviarPushAsistente } from './push.js';
import { avisarPorWhatsapp } from './whatsapp.js';
import { configuracionEvento } from './email.js';
import { aviso } from '../i18n/avisos.js';
import { idiomaDeLaPrestadora } from '../i18n/idiomaDeLaPrestadora.js';

// Recorre los 3 eventos de push a Asistentes listados en
// docs/PRD_04_05_App_Servicio.md:115 ("Nueva guardia asignada, mensajes del coordinador,
// recordatorios"). Mismo patrón de "ya notificado" que revisarNotificacionesCoordinador.js:
// cada evento tiene su propia columna *_enviado_at, se manda una sola vez, y el cron corre
// cada pocos minutos recorriendo TODAS las prestadoras por igual.

// Cuánto antes se le recuerda a la Asistente su próxima guardia, mientras la Prestadora no
// haya elegido otra cosa. Es el mismo valor que la columna `prestadoras.minutos_aviso_previo_guardia`
// tiene por defecto: está escrito en los dos lados a propósito, así una Prestadora que nunca
// tocó el número se comporta igual que una que guardó el de fábrica.
export const MINUTOS_ANTES_RECORDATORIO = 60;

// Los mismos topes que la regla de la base (migración 20260811150000). Se exponen para que el
// backend rechace el número antes que la base, y el Panel reciba un mensaje en castellano en
// vez del error crudo de Postgres.
export const LIMITES_AVISO_PREVIO_GUARDIA = { minimo: 5, maximo: 1440 };

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
  // Que el canal esté encendido y tenga plantilla aprobada lo mira `avisarPorWhatsapp`, en un
  // solo lugar. Acá sólo se mira si la Prestadora apagó el aviso entero.
  if (config?.activo === false) return;

  const { data: asistente } = await supabase
    .from('asistentes')
    .select('telefono')
    .eq('prestadora_id', prestadoraId)
    .eq('id', asistenteId)
    .maybeSingle();
  if (!asistente?.telefono) return;

  try {
    // Lo empieza la Prestadora, así que va por la plantilla que le eligió al aviso. Sin plantilla
    // aprobada no sale nada: éste es un aviso de rutina y no tiene otro canal atrás.
    await avisarPorWhatsapp({
      config,
      prestadoraId,
      telefono: asistente.telefono,
      valores: [titulo, cuerpo],
    });
  } catch (err) {
    console.error(`Error enviando WhatsApp de respaldo (${EVENTO_AVISO_RUTINA}) a asistente ${asistenteId}:`, err.message);
  }
}

// Se recorre de a una Prestadora por vez, y ninguna consulta mezcla dos: el motor entra con la
// llave de servicio, que se saltea la protección por fila, así que lo único que mantiene cerrado
// cada cajón es que cada consulta diga para cuál trabaja. Con cuánta anticipación se avisa lo
// elige cada Prestadora, y ese número viene en la misma fila que trae la lista.
export async function revisarRecordatoriosPush() {
  const { data: prestadoras, error } = await supabase
    .from('prestadoras')
    .select('id, minutos_aviso_previo_guardia')
    .eq('estado', 'certificada');

  if (error) {
    console.error('Error consultando prestadoras para los avisos al Asistente:', error.message);
    return;
  }

  const ahora = new Date();

  for (const prestadora of prestadoras ?? []) {
    const prestadoraId = prestadora.id;
    const minutosAntes = prestadora.minutos_aviso_previo_guardia ?? MINUTOS_ANTES_RECORDATORIO;
    await revisarGuardiasAsignadas(prestadoraId);
    await revisarMensajesCoordinador(prestadoraId);
    await revisarRecordatoriosGuardiaProxima(prestadoraId, minutosAntes, ahora);
  }
}

async function revisarGuardiasAsignadas(prestadoraId) {
  const { data: guardias, error } = await supabase
    .from('guardias')
    .select('id, asistente_id, fecha, hora_inicio')
    .eq('prestadora_id', prestadoraId)
    .is('push_asignacion_enviado_at', null)
    .not('asistente_id', 'is', null);

  if (error) {
    console.error(`Error consultando guardias para push de asignación (prestadora ${prestadoraId}):`, error.message);
    return;
  }
  if (!guardias?.length) return;

  // Una sola vez por Prestadora: todos los avisos de esta vuelta los lee la misma gente.
  const idioma = await idiomaDeLaPrestadora(prestadoraId);

  for (const guardia of guardias) {
    const { titulo, cuerpo } = aviso('guardia_asignada', idioma, {
      fecha: guardia.fecha,
      horaInicio: guardia.hora_inicio,
    });

    const enviadoPorPush = await enviarPushAsistente(prestadoraId, guardia.asistente_id, {
      titulo,
      cuerpo,
      url: `/guardias/${guardia.id}`,
    });
    await respaldoWhatsappSiFalla({ prestadoraId, asistenteId: guardia.asistente_id, enviadoPorPush, titulo, cuerpo });

    await supabase
      .from('guardias')
      .update({ push_asignacion_enviado_at: new Date().toISOString() })
      .eq('prestadora_id', prestadoraId)
      .eq('id', guardia.id);
  }
}

async function revisarMensajesCoordinador(prestadoraId) {
  const { data: mensajes, error } = await supabase
    .from('mensajes_asistente')
    .select('id, asistente_id, mensaje')
    .eq('prestadora_id', prestadoraId)
    .is('push_enviado_at', null);

  if (error) {
    console.error(`Error consultando mensajes_asistente para push (prestadora ${prestadoraId}):`, error.message);
    return;
  }
  if (!mensajes?.length) return;

  const idioma = await idiomaDeLaPrestadora(prestadoraId);

  for (const mensaje of mensajes) {
    const { titulo } = aviso('mensaje_del_coordinador', idioma);

    const enviadoPorPush = await enviarPushAsistente(prestadoraId, mensaje.asistente_id, {
      titulo,
      cuerpo: mensaje.mensaje,
      url: '/perfil',
    });
    await respaldoWhatsappSiFalla({ prestadoraId, asistenteId: mensaje.asistente_id, enviadoPorPush, titulo, cuerpo: mensaje.mensaje });

    await supabase
      .from('mensajes_asistente')
      .update({ push_enviado_at: new Date().toISOString() })
      .eq('prestadora_id', prestadoraId)
      .eq('id', mensaje.id);
  }
}

async function revisarRecordatoriosGuardiaProxima(prestadoraId, minutosAntes, ahora) {
  const { data: guardias, error } = await supabase
    .from('guardias')
    .select('id, asistente_id, fecha, hora_inicio')
    .eq('prestadora_id', prestadoraId)
    .is('push_recordatorio_enviado_at', null)
    .is('checkin_at', null)
    .eq('estado', 'programada')
    .not('asistente_id', 'is', null);

  if (error) {
    console.error(`Error consultando guardias para recordatorio push (prestadora ${prestadoraId}):`, error.message);
    return;
  }
  if (!guardias?.length) return;

  const limite = new Date(ahora.getTime() + minutosAntes * 60_000);
  const idioma = await idiomaDeLaPrestadora(prestadoraId);

  for (const guardia of guardias) {
    const inicio = new Date(`${guardia.fecha}T${guardia.hora_inicio}`);
    if (inicio.getTime() > limite.getTime() || inicio.getTime() < ahora.getTime()) continue;

    const { titulo, cuerpo } = aviso('recordatorio_de_guardia', idioma, {
      fecha: guardia.fecha,
      horaInicio: guardia.hora_inicio,
    });

    const enviadoPorPush = await enviarPushAsistente(prestadoraId, guardia.asistente_id, {
      titulo,
      cuerpo,
      url: `/guardias/${guardia.id}`,
    });
    await respaldoWhatsappSiFalla({ prestadoraId, asistenteId: guardia.asistente_id, enviadoPorPush, titulo, cuerpo });

    await supabase
      .from('guardias')
      .update({ push_recordatorio_enviado_at: new Date().toISOString() })
      .eq('prestadora_id', prestadoraId)
      .eq('id', guardia.id);
  }
}
