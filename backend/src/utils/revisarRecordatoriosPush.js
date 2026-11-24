import { enLaPrestadora } from '../db/connection.js';
import { estaCertificada, exigirLaPrestadora } from './prestadoraCertificada.js';
import { enviarPushAsistente } from './push.js';
import { avisarPorWhatsapp } from './whatsapp.js';
import { configuracionEvento } from './email.js';
import { mensajeDelSistema } from '../i18n/avisos.js';
import { idiomaDeLaPrestadora } from '../i18n/idiomaDeLaPrestadora.js';
import { turnosGuardiaEnLicenciaAdentro } from './turnoGuardiaDeLicencia.js';
import { inicioDeTurnoGuardiaEnLaZona, finDeTurnoGuardiaEnLaZona } from './relojDeLaPrestadora.js';
import { pacientesDeTurnosGuardia } from './pacientesDeTurnoGuardia.js';

// Recorre los 3 eventos de push a Asistentes listados en
// docs/PRD_04_05_App_Servicio.md:115 ("Nuevo turno de guardia asignado, mensajes del coordinador,
// recordatorios"). Mismo patrón de "ya notificado" que revisarNotificacionesCoordinador.js:
// cada evento tiene su propia columna *_enviado_at, se manda una sola vez, y el trabajo corre
// cada pocos minutos, una vez por cada Prestadora certificada.

// Cuánto antes se le recuerda a la Asistente su próximo turno de guardia, mientras la Prestadora no
// haya elegido otra cosa. Es el mismo valor que la columna `prestadoras.minutos_aviso_previo_turno_guardia`
// tiene por defecto: está escrito en los dos lados a propósito, así una Prestadora que nunca
// tocó el número se comporta igual que una que guardó el de fábrica.
export const MINUTOS_ANTES_RECORDATORIO = 60;

// Los mismos topes que la regla de la base (`prestadoras_minutos_aviso_previo_turno_guardia_check`). Se exponen para que el
// backend rechace el número antes que la base, y el Panel reciba un mensaje en castellano en
// vez del error crudo de Postgres.
export const LIMITES_PREAVISO_TURNO_GUARDIA = { minimo: 5, maximo: 1440 };

// Cuánto antes del fin del turno de guardia se le recuerda al Asistente que presente el Reporte
// Diario, mientras la Prestadora no haya elegido otra cosa. Es el valor por defecto de la columna
// `prestadoras.minutos_recordatorio_reporte_diario`, con el mismo criterio que el de arriba.
export const MINUTOS_ANTES_RECORDATORIO_REPORTE = 30;

// Los mismos topes que la regla de la base (`prestadoras_minutos_recordatorio_reporte_diario_check`).
export const LIMITES_RECORDATORIO_REPORTE_DIARIO = { minimo: 5, maximo: 1440 };

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

  const { data: asistente } = await enLaPrestadora(prestadoraId, 'teléfono del Asistente para el respaldo', (db) => db
    .from('asistentes')
    .select('telefono')
    .eq('prestadora_id', prestadoraId)
    .eq('id', asistenteId)
    .maybeSingle());
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

// Trabaja en una sola Prestadora, la que le pasa `programar` en server.js, y sólo si está
// certificada. Con cuánta anticipación se avisa lo elige cada Prestadora.
export async function revisarRecordatoriosPush(prestadoraId, ahora = new Date()) {
  exigirLaPrestadora(prestadoraId, 'revisarRecordatoriosPush');
  if (!(await estaCertificada(prestadoraId))) return;
  await revisarLosRecordatoriosDeUnaPrestadora(prestadoraId, ahora);
}

/** Lo de una sola Prestadora, con la credencial del trabajo de esa Prestadora. */
export function revisarLosRecordatoriosDeUnaPrestadora(prestadoraId, ahora) {
  return enLaPrestadora(prestadoraId, 'revisar los avisos al Asistente', async (db) => {
    const { data: prestadora, error } = await db
      .from('prestadoras')
      .select('minutos_aviso_previo_turno_guardia, minutos_recordatorio_reporte_diario, zona_horaria')
      .eq('id', prestadoraId)
      .maybeSingle();
    if (error) {
      console.error(`Error consultando la anticipación de los avisos (prestadora ${prestadoraId}):`, error.message);
      return;
    }
    const minutosAntes = prestadora?.minutos_aviso_previo_turno_guardia ?? MINUTOS_ANTES_RECORDATORIO;
    await revisarTurnosGuardiaAsignados(db, prestadoraId);
    await revisarMensajesCoordinador(db, prestadoraId);
    // El recordatorio se mide contra la hora del turno, que es la de la casa del Paciente. Sin la
    // zona de la Prestadora no se manda: saldría horas corrido.
    if (!prestadora?.zona_horaria) {
      console.error(`La Prestadora ${prestadoraId} no tiene zona horaria: no se revisan los recordatorios de turno próximo.`);
      return;
    }
    await revisarRecordatoriosTurnoGuardiaProximo(db, prestadoraId, minutosAntes, ahora, prestadora.zona_horaria);
    const minutosAntesDelFin = prestadora.minutos_recordatorio_reporte_diario ?? MINUTOS_ANTES_RECORDATORIO_REPORTE;
    await revisarRecordatoriosReporteDiario(db, prestadoraId, minutosAntesDelFin, ahora, prestadora.zona_horaria);
  });
}

async function revisarTurnosGuardiaAsignados(db, prestadoraId) {
  const { data: turnos_guardia, error } = await db
    .from('turnos_guardia')
    .select('id, asistente_id, fecha, hora_inicio')
    .eq('prestadora_id', prestadoraId)
    .is('push_asignacion_enviado_at', null)
    .not('asistente_id', 'is', null);

  if (error) {
    console.error(`Error consultando guardias para push de asignación (prestadora ${prestadoraId}):`, error.message);
    return;
  }
  if (!turnos_guardia?.length) return;

  // Una sola vez por Prestadora: todos los mensajes de esta vuelta los lee la misma gente.
  const idioma = await idiomaDeLaPrestadora(db, prestadoraId);

  for (const turno_guardia of turnos_guardia) {
    const { titulo, cuerpo } = mensajeDelSistema('turno_guardia_asignado', idioma, {
      fecha: turno_guardia.fecha,
      horaInicio: turno_guardia.hora_inicio,
    });

    const enviadoPorPush = await enviarPushAsistente(prestadoraId, turno_guardia.asistente_id, {
      titulo,
      cuerpo,
      url: `/turnos-guardia/${turno_guardia.id}`,
    });
    await respaldoWhatsappSiFalla({ prestadoraId, asistenteId: turno_guardia.asistente_id, enviadoPorPush, titulo, cuerpo });

    await db
      .from('turnos_guardia')
      .update({ push_asignacion_enviado_at: new Date().toISOString() })
      .eq('prestadora_id', prestadoraId)
      .eq('id', turno_guardia.id);
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

async function revisarRecordatoriosTurnoGuardiaProximo(db, prestadoraId, minutosAntes, ahora, zona) {
  const { data: turnos_guardia, error } = await db
    .from('turnos_guardia')
    .select('id, asistente_id, fecha, hora_inicio, hora_fin, dias_hasta_el_fin, estado, checkin_at')
    .eq('prestadora_id', prestadoraId)
    .is('push_recordatorio_enviado_at', null)
    .is('checkin_at', null)
    .eq('estado', 'programada')
    .not('asistente_id', 'is', null);

  if (error) {
    console.error(`Error consultando guardias para recordatorio push (prestadora ${prestadoraId}):`, error.message);
    return;
  }
  if (!turnos_guardia?.length) return;

  const limite = new Date(ahora.getTime() + minutosAntes * 60_000);
  const proximas = turnos_guardia.filter((turno_guardia) => {
    const inicio = inicioDeTurnoGuardiaEnLaZona(turno_guardia, zona);
    return inicio.getTime() <= limite.getTime() && inicio.getTime() >= ahora.getTime();
  });
  if (!proximas.length) return;

  // Durante la licencia no tiene turnos de guardia, así que tampoco recordatorio. No se marca como
  // enviado: si el Coordinador anota la vuelta a tiempo, el recordatorio sale en la próxima vuelta.
  const deLicencia = await turnosGuardiaEnLicenciaAdentro(db, prestadoraId, proximas);
  const idioma = await idiomaDeLaPrestadora(db, prestadoraId);

  for (const turno_guardia of proximas) {
    if (deLicencia.has(turno_guardia.id)) continue;

    const { titulo, cuerpo } = mensajeDelSistema('recordatorio_de_turno_guardia', idioma, {
      fecha: turno_guardia.fecha,
      horaInicio: turno_guardia.hora_inicio,
    });

    const enviadoPorPush = await enviarPushAsistente(prestadoraId, turno_guardia.asistente_id, {
      titulo,
      cuerpo,
      url: `/turnos-guardia/${turno_guardia.id}`,
    });
    await respaldoWhatsappSiFalla({ prestadoraId, asistenteId: turno_guardia.asistente_id, enviadoPorPush, titulo, cuerpo });

    await db
      .from('turnos_guardia')
      .update({ push_recordatorio_enviado_at: new Date().toISOString() })
      .eq('prestadora_id', prestadoraId)
      .eq('id', turno_guardia.id);
  }
}

// Cuando faltan los minutos que eligió la Prestadora para que termine un turno de guardia en curso
// y el Asistente todavía no presentó el Reporte Diario, se lo recuerda. Una sola vez por turno.
// El reporte está presentado cuando cada Paciente del turno tiene el suyo: es la misma cuenta que
// decide si el turno se puede cerrar en la aplicación del Asistente.
async function revisarRecordatoriosReporteDiario(db, prestadoraId, minutosAntes, ahora, zona) {
  const { data: turnos_guardia, error } = await db
    .from('turnos_guardia')
    .select('id, asistente_id, paciente_id, fecha, hora_inicio, hora_fin, dias_hasta_el_fin')
    .eq('prestadora_id', prestadoraId)
    .is('push_recordatorio_reporte_enviado_at', null)
    .is('checkout_at', null)
    .eq('estado', 'activa')
    .not('asistente_id', 'is', null);

  if (error) {
    console.error(`Error consultando guardias para el recordatorio del Reporte Diario (prestadora ${prestadoraId}):`, error.message);
    return;
  }
  if (!turnos_guardia?.length) return;

  const desde = ahora.getTime() + minutosAntes * 60_000;
  const porTerminar = turnos_guardia.filter((turno_guardia) => {
    const fin = finDeTurnoGuardiaEnLaZona(turno_guardia, zona).getTime();
    return fin <= desde && fin > ahora.getTime();
  });
  if (!porTerminar.length) return;

  // Sólo se pregunta qué Paciente tiene reporte en cada turno: nunca el contenido del reporte.
  const pacientes = await pacientesDeTurnosGuardia(db, prestadoraId, porTerminar, 'id');
  const { data: reportes, error: errorReportes } = await db
    .from('reportes')
    .select('turno_guardia_id, paciente_id')
    .eq('prestadora_id', prestadoraId)
    .in('turno_guardia_id', porTerminar.map((g) => g.id));
  if (errorReportes) {
    console.error(`Error consultando los reportes para el recordatorio del Reporte Diario (prestadora ${prestadoraId}):`, errorReportes.message);
    return;
  }
  const conReporte = new Set((reportes ?? []).map((r) => `${r.turno_guardia_id}:${r.paciente_id}`));

  const sinReporte = porTerminar.filter((turno_guardia) => {
    const delTurno = pacientes.get(turno_guardia.id) ?? [];
    return delTurno.some((p) => !conReporte.has(`${turno_guardia.id}:${p.id}`));
  });
  if (!sinReporte.length) return;

  const idioma = await idiomaDeLaPrestadora(db, prestadoraId);
  const { titulo, cuerpo } = mensajeDelSistema('recordatorio_del_reporte_diario', idioma);

  for (const turno_guardia of sinReporte) {
    const enviadoPorPush = await enviarPushAsistente(prestadoraId, turno_guardia.asistente_id, {
      titulo,
      cuerpo,
      url: `/turnos-guardia/${turno_guardia.id}`,
    });
    await respaldoWhatsappSiFalla({ prestadoraId, asistenteId: turno_guardia.asistente_id, enviadoPorPush, titulo, cuerpo });

    await db
      .from('turnos_guardia')
      .update({ push_recordatorio_reporte_enviado_at: new Date().toISOString() })
      .eq('prestadora_id', prestadoraId)
      .eq('id', turno_guardia.id);
  }
}
