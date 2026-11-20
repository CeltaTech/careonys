import { enLaPrestadora } from '../db/connection.js';
import { sumarDias } from './fechas.js';
import { pacientesDeSeries, anotarPacientesEnTurnosGuardia } from './pacientesDeTurnoGuardia.js';
import { diaYHoraEnLaZona } from './relojDeLaPrestadora.js';

/** Cuántos días de guardias se generan por delante cuando la consulta no trajo el número. No es el
 *  valor de fábrica: ése lo decide la Prestadora y vive en la base, en el `DEFAULT 90` de
 *  `prestadoras.dias_generacion_series_turno_guardia`, que además es `NOT NULL`. Esto es el resguardo
 *  para que un día sin dato no arme un horizonte inválido y deje de generar turnos de guardia en silencio.
 *  Si alguna vez los dos números se separan, manda el de la base. */
const DIAS_GENERACION_DE_RESGUARDO = 90;
const UN_DIA_MS = 24 * 60 * 60 * 1000;

/** Las fechas entre los dos días, los dos incluidos, que caen en alguno de los días de la semana. */
function generarFechasFaltantes(desdeInclusiveISO, hastaInclusiveISO, diasSemana) {
  const diaIndices = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
  const indicesElegidos = diasSemana.map((d) => diaIndices[d]);
  const inicio = new Date(`${desdeInclusiveISO}T00:00:00Z`);
  const fin = new Date(`${hastaInclusiveISO}T00:00:00Z`);
  const fechas = [];
  for (let f = inicio; f <= fin; f = new Date(f.getTime() + UN_DIA_MS)) {
    if (indicesElegidos.includes(f.getUTCDay())) fechas.push(f.toISOString().slice(0, 10));
  }
  return fechas;
}

// Mantiene siempre `dias_generacion_series_turno_guardia` días de guardias concretas generadas por
// delante de "hoy" para cada serie que sigue rigiendo: la que no tiene último día y la que lo tiene
// de hoy en adelante, porque el Servicio termina ese día. Sin esto, la generación
// única que hace NuevoTurnoGuardiaModal.jsx al crear la serie deja de producir turnos de guardia nuevos en
// silencio pasado ese horizonte. Proceso 100% interno, nunca visible en ninguna pantalla.
//
// UNA PRESTADORA POR LLAMADA. La recorrida de todas las Prestadoras la hace `programar` en
// server.js, que llama esta tarea una vez por cada una y le pasa cuál es. La tarea no vuelve a
// recorrerlas: si lo hiciera, con tres Prestadoras correría nueve veces por día.
//
// "HOY" ES EL DE LA PRESTADORA, no el del servidor: sale de su zona horaria.
export async function extenderSeriesTurnoGuardiaAbiertas(prestadoraId, ahora = new Date()) {
  // Sin Prestadora no hay a quién generarle nada, y callarlo escondería que se la programó mal.
  if (!prestadoraId) throw new Error('extenderSeriesTurnoGuardiaAbiertas: falta la Prestadora');
  await extenderLasSeriesDeUnaPrestadora(prestadoraId, ahora);
}

/** Lo de una sola Prestadora, con la credencial del trabajo de esa Prestadora. */
export function extenderLasSeriesDeUnaPrestadora(prestadoraId, ahora = new Date()) {
  return enLaPrestadora(prestadoraId, 'extender las series de guardias', (db) =>
    extenderLasDeUnaPrestadora(db, prestadoraId, ahora),
  );
}

/**
 * El primer día en que una serie puede recibir un turno de guardia nuevo. Nunca antes de hoy, para
 * que una serie que vuelve de una pausa larga no genere turnos de guardia en fechas que ya pasaron;
 * hoy sólo si el turno todavía no empezó en la hora de la Prestadora; y nunca antes del día desde
 * el que rige la serie.
 */
export function primerDiaAGenerar({ ultimaFecha, hoy, horaAhora, horaInicio, vigenteDesde }) {
  const candidatos = [String(horaInicio ?? '').slice(0, 5) > horaAhora ? hoy : sumarDias(hoy, 1)];
  if (ultimaFecha) candidatos.push(sumarDias(ultimaFecha, 1));
  if (vigenteDesde) candidatos.push(String(vigenteDesde).slice(0, 10));
  return candidatos.sort().at(-1);
}

/**
 * El último día en que una serie puede recibir un turno de guardia nuevo: el horizonte de la
 * Prestadora, o antes si la serie termina antes.
 */
export function ultimoDiaAGenerar({ limite, vigenteHasta }) {
  const hasta = vigenteHasta ? String(vigenteHasta).slice(0, 10) : null;
  return hasta && hasta < limite ? hasta : limite;
}

async function extenderLasDeUnaPrestadora(db, prestadoraId, ahora) {
  const { data: prestadora, error: errorPrestadora } = await db
    .from('prestadoras')
    .select('estado, dias_generacion_series_turno_guardia, zona_horaria')
    .eq('id', prestadoraId)
    .maybeSingle();

  if (errorPrestadora) {
    console.error(`Error consultando los días de generación de ${prestadoraId}:`, errorPrestadora.message);
    return;
  }

  // Sólo las Prestadoras certificadas, como hasta ahora: la que no lo está no genera nada.
  if (prestadora?.estado !== 'certificada') return;

  let hoyISO;
  let horaAhora;
  try {
    ({ dia: hoyISO, hora: horaAhora } = diaYHoraEnLaZona(ahora, prestadora.zona_horaria));
  } catch (e) {
    console.error(`La zona horaria de ${prestadoraId} no sirve, no se generan turnos de guardia:`, e.message);
    return;
  }

  const horizonte = prestadora?.dias_generacion_series_turno_guardia ?? DIAS_GENERACION_DE_RESGUARDO;
  const limiteISO = sumarDias(hoyISO, horizonte);

  const { data: series, error: errorSeries } = await db
    .from('series_turnos_guardia')
    .select('id, asistente_id, paciente_id, dias_semana, hora_inicio, hora_fin, dias_hasta_el_fin, modalidad, vigente_desde, vigente_hasta')
    .eq('prestadora_id', prestadoraId)
    .eq('estado', 'activa')
    .or(`vigente_hasta.is.null,vigente_hasta.gte.${hoyISO}`);

  if (errorSeries) {
    console.error(`Error consultando series abiertas de ${prestadoraId}:`, errorSeries.message);
    return;
  }

  // A quiénes cubre cada serie. Una serie puede cubrir a más de un Paciente —el matrimonio
  // que vive en la misma casa—, y los turnos de guardia que se generan solas tienen que llevarlos a
  // todos. Sin esto, la serie arranca bien y de a poco se le va cayendo el segundo Paciente:
  // los primeros turnos de guardia las creó el Panel con la lista completa, y todas las de más
  // adelante saldrían con uno solo, sin que nadie se entere.
  let pacientesPorSerie;
  try {
    pacientesPorSerie = await pacientesDeSeries(db, prestadoraId, series ?? []);
  } catch (e) {
    console.error(`Error leyendo los Pacientes de las series de ${prestadoraId}:`, e.message);
    return;
  }

  for (const serie of series ?? []) {
    const { data: ultimaTurnoGuardia, error: errorUltima } = await db
      .from('turnos_guardia')
      .select('fecha')
      .eq('prestadora_id', prestadoraId)
      .eq('serie_id', serie.id)
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (errorUltima) {
      console.error(`Error consultando última guardia de la serie ${serie.id}:`, errorUltima.message);
      continue;
    }

    const desde = primerDiaAGenerar({
      ultimaFecha: ultimaTurnoGuardia?.fecha ?? null,
      hoy: hoyISO,
      horaAhora,
      horaInicio: serie.hora_inicio,
      vigenteDesde: serie.vigente_desde,
    });
    const hasta = ultimoDiaAGenerar({ limite: limiteISO, vigenteHasta: serie.vigente_hasta });
    if (desde > hasta) continue;

    const fechasFaltantes = generarFechasFaltantes(desde, hasta, serie.dias_semana);
    if (fechasFaltantes.length === 0) continue;

    // El Servicio no se copia acá: lo copia la base desde la serie, en el mismo lugar donde lo
    // copia para los turnos de guardia que crea el Panel. Ver el disparador
    // `trg_servicio_de_la_serie` de `turnos_guardia`.
    const filas = fechasFaltantes.map((fecha) => ({
      prestadora_id: prestadoraId,
      serie_id: serie.id,
      asistente_id: serie.asistente_id,
      paciente_id: serie.paciente_id,
      fecha,
      hora_inicio: serie.hora_inicio,
      hora_fin: serie.hora_fin,
      // Cuánto dura cada turno es parte de la serie: una serie de guardias de 24 horas tiene
      // que seguir generando turnos de 24 horas, y no de las que salgan de comparar dos horas
      // de reloj.
      dias_hasta_el_fin: serie.dias_hasta_el_fin ?? 0,
      modalidad: serie.modalidad,
    }));

    const { data: creadas, error: errorInsert } = await db.from('turnos_guardia').insert(filas).select('id');
    if (errorInsert) {
      console.error(`Error extendiendo guardias de la serie ${serie.id}:`, errorInsert.message);
      continue;
    }

    // Cada fecha es un turno de guardia distinto y cada una lleva su propia lista de a quiénes
    // atiende: no alcanza con que la lista esté cargada una vez en la serie.
    try {
      await anotarPacientesEnTurnosGuardia(
        db,
        (creadas ?? []).map((g) => g.id),
        pacientesPorSerie.get(serie.id) ?? [],
        prestadoraId
      );
    } catch (e) {
      console.error(`Error anotando los Pacientes de las guardias de la serie ${serie.id}:`, e.message);
    }
  }
}
