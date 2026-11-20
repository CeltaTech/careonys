import { supabase } from '../db/connection.js';
import { enviarEmail } from './email.js';
import { necesitaNotificar } from './insistencia.js';
import { pacientesDeTurnosGuardia } from './pacientesDeTurnoGuardia.js';
import { equipoDeUnServicio } from './equipoDeUnServicio.js';
import { mensajeDelSistema } from '../i18n/avisos.js';
import { idiomaDeLaPrestadora } from '../i18n/idiomaDeLaPrestadora.js';
import {
  CIERRES,
  REGLA_QUE_SE_PUEDE_TOCAR,
  reglaDelIncidenteDe,
} from './incidenteTurnoGuardiaSinCubrir.js';
import { diaEnLaZona, inicioDeTurnoGuardiaEnLaZona } from './relojDeLaPrestadora.js';
import { reglaDeLaToma, tomadasAhora } from './tomasDeAlarma.js';
import { TIPOS_DE_ALARMA } from './alarmasTomadas.js';
import { escalonesYaAvisados, escalarSiCorresponde, minutosDesde } from './avisosDeEscalon.js';
import { FICHA_NOMBRE } from './fichaDelPaciente.js';

// El turno que llega sin nadie abre un incidente, y el incidente no se va solo.
// ============================================================================
//
// POR QUÉ NO ALCANZABA CON LO QUE YA HABÍA. `revisarTurnosGuardiaSinCubrir.js` avisa y nada más: el
// mensaje sale, llega y se termina, y al día siguiente ese turno ya no entra en la ventana que ese
// proceso mira. El turno queda en `programada` para siempre y nadie tiene que dar cuenta de él.
// Un turno que nunca se cubrió es una falla del servicio, y una falla del servicio queda abierta
// hasta que alguien la cierre diciendo cómo terminó.
//
// LOS DOS CONVIVEN Y NO SE PISAN. El mensaje sale temprano, con la anticipación que cada Prestadora
// configuró; el incidente se abre recién cuando el turno está cerca y ya es grave. Cuándo es eso
// lo contesta `incidenteTurnoGuardiaSinCubrir.js`, que es el mismo archivo que usa el Panel.
//
// SALVO QUE ALGUIEN LE HAYA QUITADO EL ASISTENTE. Ahí el incidente lo abre la base en el momento
// (`asignar_turno_guardia`), falte lo que falte, y esta tarea lo recuerda y lo cierra igual que a los suyos.
//
// EL RECORDATORIO NO VA AL DESTINO GENERAL DE LA PRESTADORA, VA A QUIEN COORDINA ESE SERVICIO.
// Un mensaje que le llega a seis personas no le llega a ninguna, y acá hay alguien que puede tapar
// el turno ahora mismo. Por eso sale por correo a esa persona, con el equipo del Servicio adentro
// —primero quien cubre francos— para que no tenga que ir a buscar a quién llamar.
//
// Y POR ESO NO ESTÁ EN EL CATÁLOGO DE MENSAJES. Ese catálogo sirve para elegir a qué dirección va
// cada mensaje y si se manda o no; acá el destinatario no es una dirección elegible sino la persona
// que coordina ese Servicio, y el recordatorio de un defecto grave no se apaga. Lo que sí decide
// cada Prestadora son los dos números: a cuántas horas se abre y cada cuánto se insiste.
//
// QUÉ CIERRA SOLO Y QUÉ NO. Cierra solo lo que la base ya dice: apareció una Asistente asignada
// —`cubierto`— o el turno se canceló —`ya_no_hacía_falta`—. Que el turno haya quedado en manos de
// el cliente no lo sabe nadie más que quien lo vivió, así que ése lo cierra una persona desde el
// Panel, y queda escrito como defecto grave que no se pudo solucionar.
//
// Corre como tarea programada, adentro del trabajo de una sola Prestadora por vez
// (`paraCadaPrestadora`, en `server.js`): la base no le deja ver ninguna otra.

const MS_POR_HORA = 60 * 60 * 1000;
const MS_POR_DIA = 24 * MS_POR_HORA;

// Cuánto se sigue mirando un turno después de su hora de inicio. El incidente ya abierto no se
// cierra solo cuando pasa este plazo —sigue abierto hasta que alguien diga cómo terminó—; lo que
// deja de pasar es abrir uno nuevo y seguir insistiendo por un turno que ya no se puede tapar.
const DIAS_HACIA_ATRAS = 1;

// Hasta dónde se mira hacia adelante al traer los turnos. Es el máximo que una Prestadora puede
// configurar; el recorte fino lo hace después la regla de cada una.
const DIAS_HACIA_ADELANTE = Math.ceil(REGLA_QUE_SE_PUEDE_TOCAR.horas_para_abrirlo.maximo / 24);

const EVENTO = 'incidente_turno_guardia_sin_cubrir';

export async function revisarIncidentesTurnoGuardiaSinCubrir() {
  const ahora = new Date();

  const { data: prestadoras, error } = await supabase
    .from('prestadoras')
    .select('id, zona_horaria')
    .eq('estado', 'certificada');

  if (error) {
    console.error('Error consultando prestadoras para el incidente de turno sin cubrir:', error.message);
    return;
  }

  for (const { id: prestadoraId, zona_horaria: zona } of prestadoras ?? []) {
    // Los turnos se cargan con la hora de la casa del Paciente: los días de la ventana y el
    // momento en que empieza cada turno se leen en la zona de la Prestadora, no en la del
    // servidor. Sin zona, la Prestadora no se revisa: avisar a deshora es peor que esperar.
    let desde;
    let hasta;
    try {
      desde = diaEnLaZona(new Date(ahora.getTime() - DIAS_HACIA_ATRAS * MS_POR_DIA), zona);
      hasta = diaEnLaZona(new Date(ahora.getTime() + DIAS_HACIA_ADELANTE * MS_POR_DIA), zona);
    } catch (e) {
      console.error(`Error leyendo la zona horaria para el incidente de turno sin cubrir (prestadora ${prestadoraId}):`, e.message);
      continue;
    }
    await revisarPrestadora({ prestadoraId, desde, hasta, ahora, zona });
  }
}

async function revisarPrestadora({ prestadoraId, desde, hasta, ahora, zona }) {
  const { data: turnos_guardia, error: errorTurnosGuardia } = await supabase
    .from('turnos_guardia')
    .select('id, servicio_id, asistente_id, paciente_id, fecha, hora_inicio, hora_fin, estado')
    .eq('prestadora_id', prestadoraId)
    .gte('fecha', desde)
    .lte('fecha', hasta);

  if (errorTurnosGuardia) {
    console.error(
      `Error consultando turnos para el incidente de turno sin cubrir (prestadora ${prestadoraId}):`,
      errorTurnosGuardia.message
    );
    return;
  }

  // Sin fila de configuración corren los valores de fábrica: que una Prestadora no haya tocado
  // nada no puede dejarla sin incidentes.
  const { data: configuracion, error: errorConfig } = await supabase
    .from('configuracion_incidentes_turno_guardia_sin_cubrir')
    .select('regla')
    .eq('prestadora_id', prestadoraId)
    .maybeSingle();

  if (errorConfig) {
    console.error(
      `Error leyendo la configuracion del incidente de turno sin cubrir (prestadora ${prestadoraId}):`,
      errorConfig.message
    );
    return;
  }

  const regla = reglaDelIncidenteDe(configuracion?.regla);

  const { data: abiertos, error: errorAbiertos } = await supabase
    .from('incidentes_turno_guardia_sin_cubrir')
    .select('id, turno_guardia_id, abierto_at, ultimo_recordatorio_at, veces_recordado')
    .eq('prestadora_id', prestadoraId)
    .is('resuelto_at', null);

  if (errorAbiertos) {
    console.error(
      `Error leyendo los incidentes abiertos (prestadora ${prestadoraId}):`,
      errorAbiertos.message
    );
    return;
  }

  const porTurnoGuardia = new Map((abiertos ?? []).map((i) => [i.turno_guardia_id, i]));
  const turnoGuardiaPorId = new Map((turnos_guardia ?? []).map((g) => [g.id, g]));

  // Un incidente puede haberse abierto mucho antes de la ventana: el que abre la base cuando el
  // Coordinador le quita el Asistente a un turno. Ése también se recuerda y se cierra, así que sus
  // turnos se traen aparte.
  const faltan = [...porTurnoGuardia.keys()].filter((id) => !turnoGuardiaPorId.has(id));
  if (faltan.length) {
    const { data: lejanas, error: errorLejanas } = await supabase
      .from('turnos_guardia')
      .select('id, servicio_id, asistente_id, paciente_id, fecha, hora_inicio, hora_fin, estado')
      .eq('prestadora_id', prestadoraId)
      .in('id', faltan);
    if (errorLejanas) {
      console.error(
        `Error consultando los turnos de incidentes abiertos (prestadora ${prestadoraId}):`,
        errorLejanas.message
      );
    }
    for (const g of lejanas ?? []) turnoGuardiaPorId.set(g.id, g);
  }

  await cerrarLosQueYaNoCorresponden({ abiertos: abiertos ?? [], turnoGuardiaPorId, prestadoraId, ahora });

  // Una sola vez por Prestadora: todos los recordatorios de esta vuelta los lee la misma gente.
  const idioma = await idiomaDeLaPrestadora(supabase, prestadoraId);

  // De cuáles ya se hizo cargo alguien. Un incidente tomado no recuerda: recordar existe porque
  // nadie reaccionó, y acá alguien reaccionó. El incidente sigue abierto igual, y cuando a la toma
  // se le cumple el rato el recordatorio vuelve.
  const tomados = await tomadasAhora({
    prestadoraId,
    tipo: TIPOS_DE_ALARMA.TURNO_GUARDIA_SIN_CUBRIR,
    ahora,
    regla: await reglaDeLaToma(prestadoraId),
  });

  // El incidente que lleva demasiado abierto deja de ser asunto de quien coordina ese Servicio.
  // Cuándo pasa eso, y a quién le llega, está en `avisosDeEscalon.js`. Dos consultas por vuelta,
  // no dos por incidente.
  const configEscalada = await configuracionDeLaEscalada(prestadoraId);
  const escalonesQueSalieron = await escalonesYaAvisados({
    prestadoraId,
    tipo: TIPOS_DE_ALARMA.TURNO_GUARDIA_SIN_CUBRIR,
  });

  for (const turno_guardia of turnoGuardiaPorId.values()) {
    // El que ya tiene incidente se sigue recordando mientras siga sin nadie, aunque falte mucho:
    // la alarma la abrió alguien que ya sabía que el turno tenía un problema.
    const yaAbierto = porTurnoGuardia.has(turno_guardia.id) && !turno_guardia.asistente_id && turno_guardia.estado === 'programada';
    const horas = horasHastaElTurnoGuardia(turno_guardia, ahora, zona);
    if (!yaAbierto && !elTurnoGuardiaYaEsGrave({ turno_guardia, regla, horas })) continue;

    // Ya pasó el plazo en que taparlo servía de algo: no se abre uno nuevo.
    const yaNoSePuedeTapar = horas !== null && horas < -DIAS_HACIA_ATRAS * 24;

    let incidente = porTurnoGuardia.get(turno_guardia.id);
    if (!incidente) {
      if (yaNoSePuedeTapar) continue;
      incidente = await abrirIncidente({ turno_guardia, prestadoraId });
      if (!incidente) continue;
      porTurnoGuardia.set(turno_guardia.id, incidente);
    }

    if (yaNoSePuedeTapar) continue;
    if (tomados.has(incidente.id)) continue;

    await escalarSiCorresponde({
      prestadoraId,
      tipo: TIPOS_DE_ALARMA.TURNO_GUARDIA_SIN_CUBRIR,
      referenciaId: incidente.id,
      minutosPremura: minutosDesde(incidente.abierto_at, ahora),
      config: configEscalada,
      idioma,
      // El cuerpo se arma sólo si hay un escalón para mandar: la mayoría de las vueltas no escala
      // nada, y armarlo cuesta una consulta por los Pacientes del turno.
      texto: async () =>
        (
          await armarElRecordatorio({
            turno_guardia,
            prestadoraId,
            idioma,
            horas,
            veces: (incidente.veces_recordado ?? 0) + 1,
            ahora,
            zona,
          })
        ).mensaje.texto,
      yaSalieron: escalonesQueSalieron,
      ahora,
    });

    if (
      !necesitaNotificar({
        ultimaNotificacionAt: incidente.ultimo_recordatorio_at,
        intervaloMinutos: regla.horas_entre_recordatorios * 60,
        ahora,
      })
    ) {
      continue;
    }

    await recordar({ incidente, turno_guardia, prestadoraId, idioma, horas, ahora, zona });
  }
}

/**
 * Los que la base ya dice cómo terminaron.
 *
 * No es una deducción: que el turno tenga Asistente asignada o esté cancelado está escrito. Lo
 * que nadie puede saber mirando la base es si el turno terminó en manos del cliente, y ése es
 * justamente el final que importa: lo cierra una persona, desde el Panel.
 */
async function cerrarLosQueYaNoCorresponden({ abiertos, turnoGuardiaPorId, prestadoraId, ahora }) {
  for (const incidente of abiertos) {
    const turno_guardia = turnoGuardiaPorId.get(incidente.turno_guardia_id);
    // El turno quedó fuera de la ventana que se mira: no se sabe nada nuevo de él y sigue abierto.
    if (!turno_guardia) continue;

    const comoTermino = turno_guardia.asistente_id
      ? CIERRES.LLEGO_UN_RELEVO
      : turno_guardia.estado === 'cancelada'
        ? CIERRES.YA_NO_HACIA_FALTA
        : null;
    if (!comoTermino) continue;

    const { error } = await supabase
      .from('incidentes_turno_guardia_sin_cubrir')
      .update({ resuelto_at: ahora.toISOString(), resuelto_como: comoTermino })
      .eq('prestadora_id', prestadoraId)
      .eq('id', incidente.id);
    if (error) {
      console.error(`Error cerrando el incidente de turno sin cubrir (${incidente.id}):`, error.message);
    }
  }
}

/**
 * Los minutos a los que esta Prestadora hace subir de escalón una alarma.
 *
 * Sin fila configurada no hay escalones, y eso no es una falla: es una Prestadora que todavía no
 * armó su escalada. Devuelve un objeto vacío, que `escalonesQueCorresponden` lee como «apagado».
 */
async function configuracionDeLaEscalada(prestadoraId) {
  const { data, error } = await supabase
    .from('configuracion_escalada_coordinador')
    .select('minutos_antes_todos_los_coordinadores, minutos_antes_administracion')
    .eq('prestadora_id', prestadoraId)
    .maybeSingle();

  if (error) {
    console.error(
      `Error leyendo la escalada del Coordinador (prestadora ${prestadoraId}):`,
      error.message
    );
    return {};
  }
  return data ?? {};
}

async function abrirIncidente({ turno_guardia, prestadoraId }) {
  const { data, error } = await supabase
    .from('incidentes_turno_guardia_sin_cubrir')
    .insert({ prestadora_id: prestadoraId, turno_guardia_id: turno_guardia.id })
    .select('id, turno_guardia_id, abierto_at, ultimo_recordatorio_at, veces_recordado')
    .single();

  if (error) {
    // El índice único deja un solo incidente abierto por turno: si dos vueltas se cruzaron, la
    // segunda pierde y no pasa nada. Cualquier otro error sí se anota.
    if (error.code !== '23505') {
      console.error(`Error abriendo el incidente del turno ${turno_guardia.id}:`, error.message);
    }
    return null;
  }
  return data;
}

/**
 * El mensaje de un turno sin cubrir, y a quién coordina se lo escribe.
 *
 * Vive aparte porque lo piden dos: el recordatorio, que se lo manda a quien coordina, y el
 * escalón, que le manda lo mismo a más gente. El escalón no cuenta otra cosa.
 */
async function armarElRecordatorio({ turno_guardia, prestadoraId, idioma, horas, veces, ahora, zona }) {
  let pacientes = [];
  try {
    pacientes = (await pacientesDeTurnosGuardia(supabase, prestadoraId, [turno_guardia], `id, ${FICHA_NOMBRE}`)).get(turno_guardia.id) ?? [];
  } catch (e) {
    console.error(`Error leyendo los Pacientes del turno ${turno_guardia.id}:`, e.message);
  }

  const { destinatarios, candidatos, cubrenFrancos } = await aQuienSeLeAvisa({
    servicioId: turno_guardia.servicio_id,
    prestadoraId,
    ahora,
    zona,
  });

  return {
    destinatarios,
    mensaje: mensajeDelSistema(EVENTO, idioma, {
      fecha: turno_guardia.fecha,
      horaInicio: turno_guardia.hora_inicio,
      horaFin: turno_guardia.hora_fin,
      pacientes: pacientes.map((p) => p.nombre),
      yaEmpezo: (horas ?? 0) <= 0,
      horas: Math.round(Math.abs(horas ?? 0)),
      veces,
      candidatos,
      cubrenFrancos,
    }),
  };
}

async function recordar({ incidente, turno_guardia, prestadoraId, idioma, horas, ahora, zona }) {
  const veces = (incidente.veces_recordado ?? 0) + 1;
  const { destinatarios, mensaje: texto } = await armarElRecordatorio({
    turno_guardia,
    prestadoraId,
    idioma,
    horas,
    veces,
    ahora,
    zona,
  });

  if (!destinatarios.length) {
    // Sin nadie a quien escribirle no se marca el recordatorio: el incidente sigue abierto y la
    // vuelta siguiente lo intenta de nuevo. Marcarlo sería dar por avisado a nadie.
    console.error(`El turno ${turno_guardia.id} no tiene a quien coordine con correo cargado.`);
    return;
  }

  for (const to of destinatarios) {
    try {
      await enviarEmail({ to, ...texto, prestadoraId });
    } catch (e) {
      console.error(`Error mandando el recordatorio del turno ${turno_guardia.id}:`, e.message);
    }
  }

  const { error } = await supabase
    .from('incidentes_turno_guardia_sin_cubrir')
    .update({ ultimo_recordatorio_at: ahora.toISOString(), veces_recordado: veces })
    .eq('prestadora_id', prestadoraId)
    .eq('id', incidente.id);
  if (error) {
    console.error(`Error marcando el recordatorio del incidente (${incidente.id}):`, error.message);
  }
  incidente.ultimo_recordatorio_at = ahora.toISOString();
  incidente.veces_recordado = veces;
}

/**
 * A quién se le escribe y con qué lista de nombres adentro.
 *
 * El equipo es del Servicio del turno, aunque el turno cubra a más de un Paciente —un matrimonio,
 * una residencia—: lo atiende un solo equipo.
 */
async function aQuienSeLeAvisa({ servicioId, prestadoraId, ahora, zona }) {
  const equipo = await equipoDeUnServicio({ servicioId, prestadoraId, ahora, zona });
  const nombres = (lista) => [...new Set(lista.map((a) => a.nombre).filter(Boolean))];
  return {
    destinatarios: [...new Set(equipo.coordinadores.map((c) => c.email).filter(Boolean))],
    candidatos: nombres(equipo.asistentes),
    cubrenFrancos: nombres(equipo.cubrenFrancos),
  };
}

/**
 * Cuántas horas faltan para que este turno empiece, con su hora leída en la zona de la
 * Prestadora. Negativo si ya empezó; `null` si al turno le falta la fecha o la hora.
 *
 * Es la misma cuenta que `horasHastaElTurnoGuardia` de `incidenteTurnoGuardiaSinCubrir.js`, que es
 * copia del Panel y lee la hora en el aparato de quien mira. En el servidor ese aparato cuenta en
 * hora universal, y el turno de las 08:00 de Argentina quedaba tres horas antes de tiempo.
 */
function horasHastaElTurnoGuardia(turno_guardia, ahora, zona) {
  if (!turno_guardia?.fecha || !turno_guardia?.hora_inicio) return null;
  let inicio;
  try {
    inicio = inicioDeTurnoGuardiaEnLaZona(turno_guardia, zona);
  } catch {
    return null;
  }
  return (inicio.getTime() - ahora.getTime()) / MS_POR_HORA;
}

/**
 * Si este turno ya es grave y tiene que tener un incidente abierto: sin nadie asignado, en pie y
 * dentro de las horas que decidió la Prestadora. Las tres condiciones son las de
 * `elTurnoGuardiaYaEsGrave` del Panel; acá las horas llegan ya contadas en la zona de la Prestadora.
 */
function elTurnoGuardiaYaEsGrave({ turno_guardia, regla, horas }) {
  if (!turno_guardia) return false;
  if (turno_guardia.asistente_id) return false;
  if (turno_guardia.estado !== 'programada') return false;
  if (horas === null) return false;
  return horas <= reglaDelIncidenteDe(regla).horas_para_abrirlo;
}
