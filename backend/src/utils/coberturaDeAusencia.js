import { supabase } from '../db/connection.js';
import { cubrirGuardiaConSustituto } from './cubrirGuardia.js';
import { finEfectivoDeLaAusencia } from './ausenciaQueTapa.js';
import { hoyISO, sumarDias } from './horarios.js';

/* La cobertura de un turno fijo durante una ausencia
   ==================================================

   QUÉ ES. Cuando un Asistente falta varios días, quien coordina no elige un sustituto guardia por
   guardia: elige quién hace cada turno fijo del ausente —cada serie— por toda la ausencia. Eso
   queda anotado en `coberturas_de_ausencia`, y este archivo es el que lo convierte en guardias
   cubiertas.

   POR QUÉ SE VUELVE A APLICAR CADA TANTO. La ausencia se mueve: se le corre la fecha prevista, se
   anota la vuelta antes, o pasa la fecha y nadie dice nada. Aplicar de nuevo cubre lo que entró en
   el rango y devuelve al titular lo que salió. Aplicar dos veces da lo mismo que una.

   LA AUSENCIA ABIERTA SE CUBRE DE A POCO. Si pasó la fecha prevista y nadie anotó la vuelta, no se
   sabe hasta cuándo sigue: se cubre hasta pasado mañana, y el trabajo lo va corriendo día a día
   mientras tanto. Así la cobertura continúa sin inventar un fin.

   LO QUE YA EMPEZÓ NO SE TOCA. Sólo se cubren y se devuelven guardias programadas de hoy en
   adelante: las que están corriendo o ya pasaron son de quien las hizo.

   Entra con la conexión que le pasan. El trabajo programado corre con la credencial de una sola
   Prestadora; la ruta del Panel, con la de quien pide. */

const DIAS_DE_MARGEN_SI_SIGUE_ABIERTA = 2;

/** El último día que hay que cubrir de una ausencia, contando desde hoy. */
export function hastaDondeCubrir(ausencia, hoy = hoyISO()) {
  return finEfectivoDeLaAusencia(ausencia, hoy) ?? sumarDias(hoy, DIAS_DE_MARGEN_SI_SIGUE_ABIERTA);
}

/**
 * Cubre las guardias de la serie que caen en la ausencia y devuelve al titular las que quedaron
 * afuera. Devuelve `{ cubiertas, devueltas }`, cada una con los identificadores de las guardias.
 */
export async function aplicarCobertura({ db, cobertura, ausencia, hoy = hoyISO() }) {
  const prestadoraId = cobertura.prestadora_id;
  const titularId = ausencia.asistente_id;
  const desde = ausencia.fecha_inicio > hoy ? ausencia.fecha_inicio : hoy;
  const hasta = hastaDondeCubrir(ausencia, hoy);

  const devueltas = await devolverAlTitular({ db, cobertura, titularId, desde: sumarDias(hasta, 1) });

  const cubiertas = [];
  if (desde > hasta) return { cubiertas, devueltas };

  const { data: guardias, error } = await db
    .from('guardias')
    .select('id, prestadora_id, asistente_id, fecha')
    .eq('prestadora_id', prestadoraId)
    .eq('serie_id', cobertura.serie_id)
    .eq('asistente_id', titularId)
    .eq('estado', 'programada')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha');
  if (error) {
    console.error(`[coberturaDeAusencia] no se pudieron leer las guardias (${cobertura.id}):`, error.message);
    return { cubiertas, devueltas };
  }

  for (const guardia of guardias ?? []) {
    const resultado = await cubrirGuardiaConSustituto({
      db,
      guardia,
      asistenteSustitutoId: cobertura.asistente_sustituto_id,
      ausenciaId: ausencia.id,
      coberturaDeAusenciaId: cobertura.id,
      motivo: cobertura.motivo,
      motivoDetalle: cobertura.motivo_detalle,
      costoAdicional: cobertura.costo_adicional,
    });
    if (resultado.ok) cubiertas.push(guardia.id);
    else console.error(`[coberturaDeAusencia] no se pudo cubrir la guardia ${guardia.id}:`, resultado.motivo);
  }
  return { cubiertas, devueltas };
}

/**
 * Devuelve al titular las guardias programadas de la cobertura desde un día en adelante, y borra
 * la constancia de sustitución de cada una: esa sustitución no llegó a ocurrir.
 */
export async function devolverAlTitular({ db, cobertura, titularId, desde }) {
  const prestadoraId = cobertura.prestadora_id;
  const devueltas = [];

  const { data: filas, error } = await db
    .from('guardias_cobertura')
    .select('id, guardia_original_id')
    .eq('prestadora_id', prestadoraId)
    .eq('cobertura_de_ausencia_id', cobertura.id);
  if (error) {
    console.error(`[coberturaDeAusencia] no se pudieron leer las guardias cubiertas (${cobertura.id}):`, error.message);
    return devueltas;
  }
  if (!filas?.length) return devueltas;

  const { data: guardias, error: errorGuardias } = await db
    .from('guardias')
    .select('id')
    .eq('prestadora_id', prestadoraId)
    .in('id', filas.map((f) => f.guardia_original_id))
    .eq('estado', 'programada')
    .gte('fecha', desde);
  if (errorGuardias) {
    console.error(`[coberturaDeAusencia] no se pudieron leer las guardias a devolver (${cobertura.id}):`, errorGuardias.message);
    return devueltas;
  }

  const aDevolver = new Set((guardias ?? []).map((g) => g.id));
  for (const fila of filas) {
    if (!aDevolver.has(fila.guardia_original_id)) continue;
    const { error: errorGuardia } = await db
      .from('guardias')
      .update({ asistente_id: titularId })
      .eq('prestadora_id', prestadoraId)
      .eq('id', fila.guardia_original_id);
    if (errorGuardia) {
      console.error(`[coberturaDeAusencia] no se pudo devolver la guardia ${fila.guardia_original_id}:`, errorGuardia.message);
      continue;
    }
    const { error: errorFila } = await db
      .from('guardias_cobertura')
      .delete()
      .eq('prestadora_id', prestadoraId)
      .eq('id', fila.id);
    if (errorFila) console.error(`[coberturaDeAusencia] no se pudo borrar la constancia ${fila.id}:`, errorFila.message);
    devueltas.push(fila.guardia_original_id);
  }
  return devueltas;
}

/**
 * La primera vez que una cobertura cubre guardias, al sustituto le llega el aviso de guardia
 * asignada por la primera de ellas: el resto lo ve en su aplicación. Las demás se dan por
 * avisadas, para que no le llegue un mensaje por cada día.
 */
async function avisarAlSustituto({ db, prestadoraId, cubiertas }) {
  const [primera, ...resto] = cubiertas;
  await db.from('guardias').update({ push_asignacion_enviado_at: null })
    .eq('prestadora_id', prestadoraId).eq('id', primera);
  if (resto.length) {
    await db.from('guardias').update({ push_asignacion_enviado_at: new Date().toISOString() })
      .eq('prestadora_id', prestadoraId).in('id', resto);
  }
}

/** Aplica una cobertura recién creada y le avisa al sustituto. */
export async function estrenarCobertura({ db, cobertura, ausencia }) {
  const resultado = await aplicarCobertura({ db, cobertura, ausencia });
  if (resultado.cubiertas.length) {
    await avisarAlSustituto({ db, prestadoraId: cobertura.prestadora_id, cubiertas: resultado.cubiertas });
  }
  return resultado;
}

/** El trabajo programado: vuelve a aplicar cada cobertura vigente, de a una Prestadora por vez. */
export async function extenderCoberturasDeAusencia() {
  const hoy = hoyISO();
  const { data: prestadoras, error } = await supabase
    .from('prestadoras')
    .select('id')
    .eq('estado', 'certificada');
  if (error) {
    console.error('[coberturaDeAusencia] no se pudieron leer las Prestadoras:', error.message);
    return;
  }
  for (const { id: prestadoraId } of prestadoras ?? []) {
    await extenderLasDeUnaPrestadora(prestadoraId, hoy);
  }
}

async function extenderLasDeUnaPrestadora(prestadoraId, hoy) {
  const { data: coberturas, error } = await supabase
    .from('coberturas_de_ausencia')
    .select('id, prestadora_id, ausencia_id, serie_id, asistente_sustituto_id, motivo, motivo_detalle, costo_adicional, ausencias(id, asistente_id, fecha_inicio, fecha_fin, fecha_vuelta_real)')
    .eq('prestadora_id', prestadoraId)
    .is('objetada_at', null);
  if (error) {
    console.error(`[coberturaDeAusencia] no se pudieron leer las coberturas (prestadora ${prestadoraId}):`, error.message);
    return;
  }

  for (const cobertura of coberturas ?? []) {
    const ausencia = cobertura.ausencias;
    if (!ausencia?.asistente_id) continue;
    // La que ya terminó y no tiene nada por delante no hace falta mirarla más.
    if (ausencia.fecha_vuelta_real && ausencia.fecha_vuelta_real <= hoy) {
      await devolverAlTitular({ db: supabase, cobertura, titularId: ausencia.asistente_id, desde: ausencia.fecha_vuelta_real });
      continue;
    }
    await aplicarCobertura({ db: supabase, cobertura, ausencia, hoy });
  }
}
