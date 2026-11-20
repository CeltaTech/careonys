import { enLaPrestadora } from '../db/connection.js';
import { estaCertificada, exigirLaPrestadora } from './prestadoraCertificada.js';
import { cubrirTurnoGuardiaConSustituto } from './cubrirTurnoGuardia.js';
import { finEfectivoDeLaAusencia } from './ausenciaQueTapa.js';
import { hoyISO, sumarDias } from './horarios.js';

/* La cobertura de un turno fijo durante una ausencia
   ==================================================

   QUÉ ES. Cuando un Asistente falta varios días, quien coordina no elige un sustituto turno de guardia por
   turno de guardia: elige quién hace cada turno fijo del ausente —cada serie— por toda la ausencia, y quién
   hace sus turnos sueltos. Eso queda anotado en `coberturas_de_ausencia` —las sueltas, con la serie
   vacía—, y este archivo es el que lo convierte en turnos de guardia cubiertos.

   RECIÉN CUANDO EL SUSTITUTO ACEPTA. El reemplazo se le asigna como un turno: lo acepta o lo
   rechaza una sola vez, por todos los días. Hasta que acepta, los turnos de guardia siguen del titular y el
   trabajo programado no aplica esa cobertura.

   POR QUÉ SE VUELVE A APLICAR CADA TANTO. La ausencia se mueve: se le corre la fecha prevista, se
   anota la vuelta antes, o pasa la fecha y nadie dice nada. Aplicar de nuevo cubre lo que entró en
   el rango y devuelve al titular lo que salió. Aplicar dos veces da lo mismo que una.

   LA AUSENCIA ABIERTA SE CUBRE DE A POCO. Si pasó la fecha prevista y nadie anotó la vuelta, no se
   sabe hasta cuándo sigue: se cubre hasta pasado mañana, y el trabajo lo va corriendo día a día
   mientras tanto. Así la cobertura continúa sin inventar un fin.

   LO QUE YA EMPEZÓ NO SE TOCA. Sólo se cubren y se devuelven turnos de guardia programados de hoy en
   adelante: las que están corriendo o ya pasaron son de quien las hizo.

   Entra con la conexión que le pasan. El trabajo programado corre con la credencial de una sola
   Prestadora; la ruta del Panel, con la de quien pide. */

const DIAS_DE_MARGEN_SI_SIGUE_ABIERTA = 2;

/** El último día que hay que cubrir de una ausencia, contando desde hoy. */
export function hastaDondeCubrir(ausencia, hoy = hoyISO()) {
  return finEfectivoDeLaAusencia(ausencia, hoy) ?? sumarDias(hoy, DIAS_DE_MARGEN_SI_SIGUE_ABIERTA);
}

/**
 * Cubre los turnos de guardia de la serie que caen en la ausencia y devuelve al titular las que quedaron
 * afuera. Devuelve `{ cubiertas, devueltas }`, cada una con los identificadores de los turnos de guardia.
 */
export async function aplicarCobertura({ db, cobertura, ausencia, hoy = hoyISO() }) {
  const prestadoraId = cobertura.prestadora_id;
  const titularId = ausencia.asistente_id;
  const desde = ausencia.fecha_inicio > hoy ? ausencia.fecha_inicio : hoy;
  const hasta = hastaDondeCubrir(ausencia, hoy);

  const devueltas = await devolverAlTitular({ db, cobertura, titularId, desde: sumarDias(hasta, 1) });

  const cubiertas = [];
  if (desde > hasta) return { cubiertas, devueltas };

  let consulta = db
    .from('turnos_guardia')
    .select('id, prestadora_id, asistente_id, fecha')
    .eq('prestadora_id', prestadoraId);
  // Sin serie, la cobertura es la de los turnos sueltos del titular.
  consulta = cobertura.serie_id ? consulta.eq('serie_id', cobertura.serie_id) : consulta.is('serie_id', null);
  const { data: turnos_guardia, error } = await consulta
    .eq('asistente_id', titularId)
    .eq('estado', 'programada')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha');
  if (error) {
    console.error(`[coberturaDeAusencia] no se pudieron leer las guardias (${cobertura.id}):`, error.message);
    return { cubiertas, devueltas };
  }

  for (const turno_guardia of turnos_guardia ?? []) {
    const resultado = await cubrirTurnoGuardiaConSustituto({
      db,
      turno_guardia,
      asistenteSustitutoId: cobertura.asistente_sustituto_id,
      ausenciaId: ausencia.id,
      coberturaDeAusenciaId: cobertura.id,
      motivo: cobertura.motivo,
      motivoDetalle: cobertura.motivo_detalle,
      costoAdicional: cobertura.costo_adicional,
    });
    if (resultado.ok) cubiertas.push(turno_guardia.id);
    else console.error(`[coberturaDeAusencia] no se pudo cubrir la guardia ${turno_guardia.id}:`, resultado.motivo);
  }
  return { cubiertas, devueltas };
}

/**
 * Devuelve al titular los turnos de guardia programados de la cobertura desde un día en adelante, y borra
 * la constancia de sustitución de cada una: esa sustitución no llegó a ocurrir.
 */
export async function devolverAlTitular({ db, cobertura, titularId, desde }) {
  const prestadoraId = cobertura.prestadora_id;
  const devueltas = [];

  const { data: filas, error } = await db
    .from('turnos_guardia_cobertura')
    .select('id, turno_guardia_original_id')
    .eq('prestadora_id', prestadoraId)
    .eq('cobertura_de_ausencia_id', cobertura.id);
  if (error) {
    console.error(`[coberturaDeAusencia] no se pudieron leer las guardias cubiertas (${cobertura.id}):`, error.message);
    return devueltas;
  }
  if (!filas?.length) return devueltas;

  const { data: turnos_guardia, error: errorTurnosGuardia } = await db
    .from('turnos_guardia')
    .select('id')
    .eq('prestadora_id', prestadoraId)
    .in('id', filas.map((f) => f.turno_guardia_original_id))
    .eq('estado', 'programada')
    .gte('fecha', desde);
  if (errorTurnosGuardia) {
    console.error(`[coberturaDeAusencia] no se pudieron leer las guardias a devolver (${cobertura.id}):`, errorTurnosGuardia.message);
    return devueltas;
  }

  const aDevolver = new Set((turnos_guardia ?? []).map((g) => g.id));
  for (const fila of filas) {
    if (!aDevolver.has(fila.turno_guardia_original_id)) continue;
    const { error: errorTurnoGuardia } = await db
      .from('turnos_guardia')
      .update({ asistente_id: titularId })
      .eq('prestadora_id', prestadoraId)
      .eq('id', fila.turno_guardia_original_id);
    if (errorTurnoGuardia) {
      console.error(`[coberturaDeAusencia] no se pudo devolver la guardia ${fila.turno_guardia_original_id}:`, errorTurnoGuardia.message);
      continue;
    }
    const { error: errorFila } = await db
      .from('turnos_guardia_cobertura')
      .delete()
      .eq('prestadora_id', prestadoraId)
      .eq('id', fila.id);
    if (errorFila) console.error(`[coberturaDeAusencia] no se pudo borrar la constancia ${fila.id}:`, errorFila.message);
    devueltas.push(fila.turno_guardia_original_id);
  }
  return devueltas;
}

/**
 * El sustituto aceptó el reemplazo: se aplican sus coberturas de esa ausencia. Ya respondió que
 * sí, así que los turnos de guardia que pasan a su nombre se dan por avisadas y no le llega un mensaje por
 * cada día. Devuelve los turnos de guardia que quedaron cubiertos.
 */
export async function aplicarReemplazoAceptado({ db, prestadoraId, ausenciaId, sustitutoId }) {
  const { data: coberturas, error } = await db
    .from('coberturas_de_ausencia')
    .select('id, prestadora_id, ausencia_id, serie_id, asistente_sustituto_id, motivo, motivo_detalle, costo_adicional, ausencias(id, asistente_id, fecha_inicio, fecha_fin, fecha_vuelta_real)')
    .eq('prestadora_id', prestadoraId)
    .eq('ausencia_id', ausenciaId)
    .eq('asistente_sustituto_id', sustitutoId)
    .is('objetada_at', null)
    .not('aceptada_at', 'is', null);
  if (error) {
    console.error(`[coberturaDeAusencia] no se pudieron leer las coberturas aceptadas (ausencia ${ausenciaId}):`, error.message);
    return { cubiertas: [], titularId: null };
  }

  const cubiertas = [];
  let titularId = null;
  for (const cobertura of coberturas ?? []) {
    const ausencia = cobertura.ausencias;
    if (!ausencia?.asistente_id) continue;
    titularId = ausencia.asistente_id;
    const resultado = await aplicarCobertura({ db, cobertura, ausencia });
    cubiertas.push(...resultado.cubiertas);
  }

  if (cubiertas.length) {
    await db.from('turnos_guardia').update({ push_asignacion_enviado_at: new Date().toISOString() })
      .eq('prestadora_id', prestadoraId).in('id', cubiertas);
  }
  return { cubiertas, titularId };
}

/**
 * El trabajo programado: vuelve a aplicar cada cobertura vigente de una sola Prestadora, la que le
 * pasa `programar` en server.js, y sólo si está certificada. Va con la credencial del trabajo de
 * esa Prestadora, que la base acota a ella.
 */
export async function extenderCoberturasDeAusencia(prestadoraId, hoy = hoyISO()) {
  exigirLaPrestadora(prestadoraId, 'extenderCoberturasDeAusencia');
  if (!(await estaCertificada(prestadoraId))) return;
  await enLaPrestadora(prestadoraId, 'extender las coberturas de ausencia', (db) =>
    extenderLasDeUnaPrestadora(db, prestadoraId, hoy),
  );
}

async function extenderLasDeUnaPrestadora(db, prestadoraId, hoy) {
  const { data: coberturas, error } = await db
    .from('coberturas_de_ausencia')
    .select('id, prestadora_id, ausencia_id, serie_id, asistente_sustituto_id, motivo, motivo_detalle, costo_adicional, ausencias(id, asistente_id, fecha_inicio, fecha_fin, fecha_vuelta_real)')
    .eq('prestadora_id', prestadoraId)
    .is('objetada_at', null)
    .not('aceptada_at', 'is', null);
  if (error) {
    console.error(`[coberturaDeAusencia] no se pudieron leer las coberturas (prestadora ${prestadoraId}):`, error.message);
    return;
  }

  for (const cobertura of coberturas ?? []) {
    const ausencia = cobertura.ausencias;
    if (!ausencia?.asistente_id) continue;
    // La que ya terminó y no tiene nada por delante no hace falta mirarla más.
    if (ausencia.fecha_vuelta_real && ausencia.fecha_vuelta_real <= hoy) {
      await devolverAlTitular({ db, cobertura, titularId: ausencia.asistente_id, desde: ausencia.fecha_vuelta_real });
      continue;
    }
    await aplicarCobertura({ db, cobertura, ausencia, hoy });
  }
}
