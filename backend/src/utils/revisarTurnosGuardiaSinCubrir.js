import { supabase } from '../db/connection.js';
import { notificarCoordinador } from './whatsapp.js';
import { necesitaNotificar } from './insistencia.js';
import { pacientesDeTurnosGuardia } from './pacientesDeTurnoGuardia.js';
import { mensajeDelSistema } from '../i18n/avisos.js';
import { idiomaDeLaPrestadora } from '../i18n/idiomaDeLaPrestadora.js';
import { FICHA_NOMBRE } from './fichaDelPaciente.js';
import { diaEnLaZona, inicioDeTurnoGuardiaEnLaZona } from './relojDeLaPrestadora.js';

// Mensaje al Coordinador cuando se viene un turno de guardia que todavía no tiene a nadie
// (pendiente #106, docs/PLAN_HASTA_PRODUCCION.md).
//
// Por qué hacía falta un proceso aparte y no alcanzaba con tocar el que ya existía: los
// tres mensajes de revisarRecordatoriosPush.js filtran `.not('asistente_id', 'is', null)`
// porque los tres le hablan al Asistente que tiene el turno de guardia asignado. Un hueco no tiene
// Asistente, así que no hay a quién avisarle — el destinatario de este mensaje es el
// Coordinador, que es el único que puede taparlo.
//
// Los dos números que gobiernan el mensaje (con cuánta anticipación, y cada cuánto repetirlo)
// salen de configuracion_aviso_turno_guardia_sin_cubrir, una fila por Prestadora. No hay ningún
// número escrito acá a propósito (regla 1 de CLAUDE.md §7): una Prestadora de guardias fijas
// quiere enterarse con tres días de anticipación y una que cubre urgencias se llenaría de
// mensajes inútiles con ese mismo número.
//
// Corre como tarea programada, adentro del trabajo de una sola Prestadora por vez
// (`paraCadaPrestadora`, en `server.js`): la base no le deja ver ninguna otra.

const EVENTO = 'turno_guardia_sin_cubrir';

// Cuánto se sigue avisando un hueco después de la hora a la que tendría que haber empezado.
// No es una regla de negocio configurable sino el borde de la ventana de búsqueda: pasado un
// día, el turno de guardia ya no se puede cubrir y el mensaje solo sería ruido. Se mide en días porque
// la consulta filtra por el campo `fecha` del turno de guardia.
const DIAS_HACIA_ATRAS = 1;

const MS_POR_HORA = 60 * 60 * 1000;

// Cada consulta nombra además la Prestadora para la que trabaja.
export async function revisarTurnosGuardiaSinCubrir() {
  const { data: prestadoras, error } = await supabase
    .from('prestadoras')
    .select('id, zona_horaria')
    .eq('estado', 'certificada');

  if (error) {
    console.error('Error consultando prestadoras para el aviso de guardia sin cubrir:', error.message);
    return;
  }

  const ahora = new Date();

  for (const { id: prestadoraId, zona_horaria: zona } of prestadoras ?? []) {
    // La hora del turno es la de la casa del Paciente. Sin la zona de la Prestadora no se avisa
    // nada: el mensaje saldría horas corrido.
    if (!zona) {
      console.error(`La Prestadora ${prestadoraId} no tiene zona horaria: no se revisan los turnos de guardia sin cubrir.`);
      continue;
    }
    await revisarPrestadora(prestadoraId, ahora, zona);
  }
}

async function revisarPrestadora(prestadoraId, ahora, zona) {
  const { data: config, error: errorConfig } = await supabase
    .from('configuracion_aviso_turno_guardia_sin_cubrir')
    .select('horas_antes, horas_entre_avisos, activo')
    .eq('prestadora_id', prestadoraId)
    .maybeSingle();

  if (errorConfig) {
    console.error(
      `Error consultando configuracion_aviso_turno_guardia_sin_cubrir (prestadora ${prestadoraId}):`,
      errorConfig.message
    );
    return;
  }
  // Sin fila, o con el mensaje apagado, esta Prestadora no quiere enterarse: no hay número que valga
  // por defecto, porque con cuánta anticipación avisar lo decide cada una.
  if (!config?.activo) return;

  const horasAntes = config.horas_antes;
  const horasEntreAvisos = config.horas_entre_avisos;
  const limite = new Date(ahora.getTime() + horasAntes * MS_POR_HORA);

  // Una sola vez por Prestadora: todos los mensajes de esta vuelta los lee la misma gente.
  const idioma = await idiomaDeLaPrestadora(supabase, prestadoraId);

  // El filtro por `fecha` es solo para no traerse la agenda entera: la ventana fina se
  // decide después contra la hora de inicio, que la base guarda en otra columna.
  const { data: turnos_guardia, error } = await supabase
    .from('turnos_guardia')
    .select('id, serie_id, paciente_id, fecha, hora_inicio, hora_fin, dias_hasta_el_fin, aviso_sin_cubrir_at, aviso_sin_cubrir_veces, asignaciones_de_turno_guardia(estado, asistentes!asignaciones_de_turno_guardia_asistente_id_fkey(nombre))')
    .eq('prestadora_id', prestadoraId)
    .is('asistente_id', null)
    .eq('estado', 'programada')
    .gte('fecha', diaEnLaZona(new Date(ahora.getTime() - DIAS_HACIA_ATRAS * 24 * MS_POR_HORA), zona))
    .lte('fecha', diaEnLaZona(new Date(limite.getTime() + 24 * MS_POR_HORA), zona));

  if (error) {
    console.error(`Error consultando guardias sin cubrir (prestadora ${prestadoraId}):`, error.message);
    return;
  }

  // El turno fijo se asigna entero y no día por día: lo que se le preguntó a quién cuelga de la
  // serie, y vale para cada uno de sus días.
  const series = [...new Set((turnos_guardia ?? []).map((g) => g.serie_id).filter(Boolean))];
  const asignacionesPorSerie = new Map();
  if (series.length) {
    const { data: deLasSeries, error: errorSeries } = await supabase
      .from('asignaciones_de_turno_guardia')
      .select('serie_id, estado')
      .eq('prestadora_id', prestadoraId)
      .in('serie_id', series);
    if (errorSeries) {
      console.error(`Error consultando las asignaciones de los turnos fijos (prestadora ${prestadoraId}):`, errorSeries.message);
      return;
    }
    for (const a of deLasSeries ?? []) {
      asignacionesPorSerie.set(a.serie_id, [...(asignacionesPorSerie.get(a.serie_id) ?? []), a]);
    }
  }

  // A quiénes se queda sin atender cada hueco. Se piden los nombres de todos los Pacientes del
  // turno y no el de uno: un mensaje que nombra a una sola persona cuando el turno cubría a dos
  // le esconde al Coordinador la mitad del problema, y de ese tamaño depende con qué urgencia
  // sale a buscar quien lo tape.
  let pacientesPorTurnoGuardia;
  try {
    pacientesPorTurnoGuardia = await pacientesDeTurnosGuardia(supabase, prestadoraId, turnos_guardia ?? [], `id, ${FICHA_NOMBRE}`);
  } catch (e) {
    console.error(`Error leyendo los Pacientes de las guardias sin cubrir (prestadora ${prestadoraId}):`, e.message);
    return;
  }

  for (const turno_guardia of turnos_guardia ?? []) {
    const inicio = inicioDeTurnoGuardiaEnLaZona(turno_guardia, zona);

    // Todavía falta más que la anticipación configurada: no es momento de molestar.
    if (inicio.getTime() > limite.getTime()) continue;
    // Ya pasó el plazo en que taparla servía de algo.
    if (inicio.getTime() < ahora.getTime() - DIAS_HACIA_ATRAS * 24 * MS_POR_HORA) continue;

    if (!necesitaNotificar({
      ultimaNotificacionAt: turno_guardia.aviso_sin_cubrir_at,
      intervaloMinutos: horasEntreAvisos * 60,
      ahora,
    })) continue;

    const veces = (turno_guardia.aviso_sin_cubrir_veces ?? 0) + 1;
    const asignaciones = [...(turno_guardia.asignaciones_de_turno_guardia ?? []), ...(asignacionesPorSerie.get(turno_guardia.serie_id) ?? [])];
    await notificarCoordinador({
      evento: EVENTO,
      prestadoraId,
      ...mensajeDelSistema('turno_guardia_sin_cubrir', idioma, {
        fecha: turno_guardia.fecha,
        horaInicio: turno_guardia.hora_inicio,
        horaFin: turno_guardia.hora_fin,
        pacientes: (pacientesPorTurnoGuardia.get(turno_guardia.id) ?? []).map((p) => p.nombre),
        yaEmpezo: inicio.getTime() <= ahora.getTime(),
        horas: Math.round(Math.abs(inicio.getTime() - ahora.getTime()) / MS_POR_HORA),
        busqueda: {
          sinResponder: asignaciones.some((a) => a.estado === 'sin_responder'),
          rechazos: asignaciones.filter((a) => a.estado === 'rechazada').length,
        },
        veces,
      }),
    });

    const { error: errorUpdate } = await supabase
      .from('turnos_guardia')
      .update({ aviso_sin_cubrir_at: ahora.toISOString(), aviso_sin_cubrir_veces: veces })
      .eq('prestadora_id', prestadoraId)
      .eq('id', turno_guardia.id);
    if (errorUpdate) {
      console.error(`Error marcando el aviso de guardia sin cubrir (${turno_guardia.id}):`, errorUpdate.message);
    }
  }
}
