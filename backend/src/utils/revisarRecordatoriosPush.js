import { enLaPrestadora, supabase } from '../db/connection.js';
import { prestadorasCertificadas } from './prestadorasDeLaIntermediacion.js';
import { enviarPushAsistente } from './push.js';
import { avisarPorWhatsapp } from './whatsapp.js';
import { configuracionEvento } from './email.js';
import { mensajeDelSistema } from '../i18n/avisos.js';
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

// Los mismos topes que la regla de la base (`prestadoras_minutos_aviso_previo_guardia_check`). Se exponen para que el
// backend rechace el número antes que la base, y el Panel reciba un mensaje en castellano en
// vez del error crudo de Postgres.
export const LIMITES_PREAVISO_GUARDIA = { minimo: 5, maximo: 1440 };

const EVENTO_AVISO_RUTINA = 'aviso_rutina_asistente';

// Fase 11: estos mensajes son de rutina, no críticos — van solo por push. Si el push falla
// (o la Asistente no tiene ninguna suscripción activa) y la Prestadora activó
// whatsapp_activo para este evento, recién ahí se manda por WhatsApp. Nunca en paralelo,
// para no generar costo de mensajería en cada mensaje de rutina — mismo criterio que
// notificarCoordinador() en whatsapp.js, pero con el respaldo condicionado al fallo del
// push en vez de ser el canal preferido.
export async function respaldoWhatsappSiFalla({ prestadoraId, asistenteId, enviadoPorPush, titulo, cuerpo }) {
  if (enviadoPorPush) return;

  const config = await configuracionEvento(EVENTO_AVISO_RUTINA, prestadoraId);
  // Que el canal esté encendido y tenga plantilla aprobada lo mira `avisarPorWhatsapp`, en un
  // solo lugar. Acá sólo se mira si la Prestadora apagó el mensaje entero.
  if (config?.activo === false) return;

  const { data: asistente } = await supabase
    .from('asistentes')
    .select('telefono')
    .eq('prestadora_id', prestadoraId)
    .eq('id', asistenteId)
    .maybeSingle();
  if (!asistente?.telefono) return;

  try {
    // Lo empieza la Prestadora, así que va por la plantilla que le eligió al mensaje. Sin plantilla
    // aprobada no sale nada: éste es un mensaje de rutina y no tiene otro canal atrás.
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

// Se recorre de a una Prestadora por vez, y cada una con la credencial del trabajo de esa
// Prestadora, que la base acota a ella. Con cuánta anticipación se avisa lo elige cada Prestadora.
export async function revisarRecordatoriosPush() {
  const ahora = new Date();
  for (const prestadoraId of await prestadorasCertificadas()) {
    try {
      await revisarLosRecordatoriosDeUnaPrestadora(prestadoraId, ahora);
    } catch (error) {
      console.error(`Error revisando los avisos al Asistente (prestadora ${prestadoraId}):`, error.message);
    }
  }
}

/** Lo de una sola Prestadora, con la credencial del trabajo de esa Prestadora. */
export function revisarLosRecordatoriosDeUnaPrestadora(prestadoraId, ahora) {
  return enLaPrestadora(prestadoraId, 'revisar los avisos al Asistente', async (db) => {
    const { data: prestadora, error } = await db
      .from('prestadoras')
      .select('minutos_aviso_previo_guardia')
      .eq('id', prestadoraId)
      .maybeSingle();
    if (error) {
      console.error(`Error consultando la anticipación de los avisos (prestadora ${prestadoraId}):`, error.message);
      return;
    }
    const minutosAntes = prestadora?.minutos_aviso_previo_guardia ?? MINUTOS_ANTES_RECORDATORIO;
    await revisarGuardiasAsignadas(db, prestadoraId);
    await revisarMensajesCoordinador(db, prestadoraId);
    await revisarRecordatoriosGuardiaProxima(db, prestadoraId, minutosAntes, ahora);
  });
}

async function revisarGuardiasAsignadas(db, prestadoraId) {
  const { data: guardias, error } = await db
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

  // Una sola vez por Prestadora: todos los mensajes de esta vuelta los lee la misma gente.
  const idioma = await idiomaDeLaPrestadora(db, prestadoraId);

  for (const guardia of guardias) {
    const { titulo, cuerpo } = mensajeDelSistema('guardia_asignada', idioma, {
      fecha: guardia.fecha,
      horaInicio: guardia.hora_inicio,
    });

    const enviadoPorPush = await enviarPushAsistente(prestadoraId, guardia.asistente_id, {
      titulo,
      cuerpo,
      url: `/guardias/${guardia.id}`,
    });
    await respaldoWhatsappSiFalla({ prestadoraId, asistenteId: guardia.asistente_id, enviadoPorPush, titulo, cuerpo });

    await db
      .from('guardias')
      .update({ push_asignacion_enviado_at: new Date().toISOString() })
      .eq('prestadora_id', prestadoraId)
      .eq('id', guardia.id);
  }
}

async function revisarMensajesCoordinador(db, prestadoraId) {
  const { data: mensajes, error } = await db
    .from('mensajes_asistente')
    .select('id, asistente_id, mensaje')
    .eq('prestadora_id', prestadoraId)
    .is('push_enviado_at', null);

  if (error) {
    console.error(`Error consultando mensajes_asistente para push (prestadora ${prestadoraId}):`, error.message);
    return;
  }
  if (!mensajes?.length) return;

  const idioma = await idiomaDeLaPrestadora(db, prestadoraId);

  for (const mensaje of mensajes) {
    const { titulo } = mensajeDelSistema('mensaje_del_coordinador', idioma);

    const enviadoPorPush = await enviarPushAsistente(prestadoraId, mensaje.asistente_id, {
      titulo,
      cuerpo: mensaje.mensaje,
      url: '/perfil',
    });
    await respaldoWhatsappSiFalla({ prestadoraId, asistenteId: mensaje.asistente_id, enviadoPorPush, titulo, cuerpo: mensaje.mensaje });

    await db
      .from('mensajes_asistente')
      .update({ push_enviado_at: new Date().toISOString() })
      .eq('prestadora_id', prestadoraId)
      .eq('id', mensaje.id);
  }
}

async function revisarRecordatoriosGuardiaProxima(db, prestadoraId, minutosAntes, ahora) {
  const { data: guardias, error } = await db
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
  const idioma = await idiomaDeLaPrestadora(db, prestadoraId);

  for (const guardia of guardias) {
    const inicio = new Date(`${guardia.fecha}T${guardia.hora_inicio}`);
    if (inicio.getTime() > limite.getTime() || inicio.getTime() < ahora.getTime()) continue;

    const { titulo, cuerpo } = mensajeDelSistema('recordatorio_de_guardia', idioma, {
      fecha: guardia.fecha,
      horaInicio: guardia.hora_inicio,
    });

    const enviadoPorPush = await enviarPushAsistente(prestadoraId, guardia.asistente_id, {
      titulo,
      cuerpo,
      url: `/guardias/${guardia.id}`,
    });
    await respaldoWhatsappSiFalla({ prestadoraId, asistenteId: guardia.asistente_id, enviadoPorPush, titulo, cuerpo });

    await db
      .from('guardias')
      .update({ push_recordatorio_enviado_at: new Date().toISOString() })
      .eq('prestadora_id', prestadoraId)
      .eq('id', guardia.id);
  }
}
