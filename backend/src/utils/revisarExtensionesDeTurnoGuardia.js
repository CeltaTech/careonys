import { enLaPrestadora } from '../db/connection.js';
import { estaCertificada, exigirLaPrestadora } from './prestadoraCertificada.js';
import { idsDePacientesDeTurnoGuardia } from './pacientesDeTurnoGuardia.js';
import { sumarDias } from './fechas.js';
import { diaEnLaZona, finDeTurnoGuardiaEnLaZona, zonaDeLaPrestadora } from './relojDeLaPrestadora.js';
import {
  cuandoTermino,
  laExtensionCorresponde,
  laExtensionTermino,
  laQueSigue,
} from './extensionDeTurnoGuardia.js';

/* La Asistente que se quedó de más queda anotada, desde la hora en que quedó de más.
   ==================================================================================

   QUÉ MIRA. Los turnos que tienen marca de llegada, no tienen marca de cierre y ya pasaron su
   hora de fin. De ésos, los que no fueron relevados: o no hay ningún turno cargado después, o el
   que hay todavía no tiene a nadie adentro.

   POR QUÉ ES UN PROCESO PROPIO Y NO CUELGA DE NINGÚN EXPEDIENTE. Hay tres maneras de que no venga
   nadie —el turno que nunca tuvo a quién asignarle, la Asistente asignada que faltó y la que
   simplemente todavía no llegó— y cada una abre un expediente distinto, o ninguno. Las tres dejan
   a la misma persona adentro de la casa. Colgar esto de uno de esos expedientes dejaría los otros
   dos casos sin anotar, que es exactamente lo que pasaba hasta hoy.

   ESTO NO AVISA NADA, Y NO ES UN OLVIDO. De que falta el relevo ya se enteró quien coordina, por
   los procesos que miran eso; repetírselo desde acá sería la misma alerta con otro nombre. Lo único
   que sale de esta pieza hacia el Coordinador es el «no puedo continuar», y ése lo manda la ruta
   que lo recibe, en el momento, no este proceso.

   ESTO TAMPOCO DECIDE NADA. No traba el cierre del turno, no asigna a nadie, no marca ninguna
   ausencia y no reclama. Quedarse hasta el relevo es un deber del oficio: se le pide, no se le
   ordena. Lo que este proceso hace es que el rato que se quedó exista escrito, porque hasta ahora
   no existía en ningún lado y esas horas son suyas.

   Trabaja en una sola Prestadora, la que le pasa `programar` en server.js, y sólo si está
   certificada, con la credencial del trabajo de esa Prestadora, que la base acota a ella. */

// Hasta dónde se mira hacia atrás al traer los turnos abiertos. Un turno de 72 horas empieza tres
// días antes de terminar, y todavía uno más para el caso que quedó abierto de ayer.
const DIAS_HACIA_ATRAS = 4;

export async function revisarExtensionesDeTurnoGuardia(prestadoraId, ahora = new Date()) {
  exigirLaPrestadora(prestadoraId, 'revisarExtensionesDeTurnoGuardia');
  if (!(await estaCertificada(prestadoraId))) return;
  await revisarLasExtensionesDeUnaPrestadora(prestadoraId, ahora);
}

/** Lo de una sola Prestadora, con la credencial del trabajo de esa Prestadora. */
export function revisarLasExtensionesDeUnaPrestadora(prestadoraId, ahora) {
  return enLaPrestadora(prestadoraId, 'revisar las extensiones de turno', (db) =>
    revisarPrestadora({ db, prestadoraId, ahora }),
  );
}

async function revisarPrestadora({ db, prestadoraId, ahora }) {
  // Las horas del turno son las de la casa del Paciente, y el servidor cuenta en hora universal: sin
  // la zona de la Prestadora no se revisa nada, porque se abrirían extensiones tres horas antes.
  let zona;
  try {
    zona = await zonaDeLaPrestadora(db, prestadoraId);
  } catch (e) {
    console.error(`Error leyendo la zona horaria para las extensiones (prestadora ${prestadoraId}):`, e.message);
    return;
  }

  const { data: turnos_guardia, error } = await db
    .from('turnos_guardia')
    .select(
      'id, prestadora_id, asistente_id, paciente_id, fecha, hora_inicio, hora_fin, dias_hasta_el_fin, checkin_at, checkout_at'
    )
    .eq('prestadora_id', prestadoraId)
    .not('checkin_at', 'is', null)
    .gte('fecha', sumarDias(diaEnLaZona(ahora, zona), -DIAS_HACIA_ATRAS))
    .lte('fecha', diaEnLaZona(ahora, zona));

  if (error) {
    console.error(`Error consultando turnos para las extensiones (prestadora ${prestadoraId}):`, error.message);
    return;
  }

  // Las que ya están anotadas. Se traen todas las de esta Prestadora de una vez y no una por turno:
  // en una vuelta normal no hay ninguna abierta, y una consulta por turno serían cientos para no
  // encontrar nada.
  const abiertas = await extensionesAbiertas(db, prestadoraId);
  if (abiertas === null) return;

  for (const turno_guardia of turnos_guardia ?? []) {
    await revisarUnTurnoGuardia({ db, turno_guardia, prestadoraId, extension: abiertas.get(turno_guardia.id) ?? null, ahora, zona });
  }

  // Las abiertas cuyo turno ya no aparece en la ventana de arriba: se cerraron solas cuando la
  // persona marcó el cierre, o el turno quedó viejo. Se cierran con el dato que haya, porque una
  // extensión abierta para siempre diría que alguien sigue adentro de una casa hace una semana.
  for (const [turnoGuardiaId, extension] of abiertas) {
    if ((turnos_guardia ?? []).some((g) => g.id === turnoGuardiaId)) continue;
    await cerrar({ db, extension, prestadoraId, hasta: ahora });
  }
}

async function revisarUnTurnoGuardia({ db, turno_guardia, prestadoraId, extension, ahora, zona }) {
  const relevo = await buscarElRelevo({ db, turno_guardia, prestadoraId, zona });

  if (extension) {
    if (!laExtensionTermino({ turno_guardia, relevo })) {
      // Sigue adentro. Si el relevo apareció recién ahora —antes no había ninguno cargado—, se lo
      // anota: es el dato que la pantalla usa para contarle cómo va la búsqueda.
      if (relevo?.id && relevo.id !== extension.relevo_turno_guardia_id) {
        await anotarElRelevo({ db, extension, prestadoraId, relevoId: relevo.id });
      }
      return;
    }
    await cerrar({ db, extension, prestadoraId, hasta: cuandoTermino({ turno_guardia, relevo, ahora }) });
    return;
  }

  if (!laExtensionCorresponde({ turno_guardia, relevo, ahora, zona })) return;
  await abrir({ db, turno_guardia, relevo, zona });
}

/**
 * El turno que tendría que haber empezado cuando éste terminó.
 *
 * Se busca por **todos** los Pacientes del turno, no por uno: si cubre a un matrimonio, el relevo
 * puede estar cargado sobre cualquiera de los dos. Mismo criterio que `marcarAusente.js`, que hace
 * la búsqueda espejo.
 *
 * Devuelve `null` cuando no hay ninguno cargado, y eso no es una falla: es la forma más cruda de
 * que no venga nadie.
 *
 * Sólo hacen falta los identificadores de los Pacientes, y salen de la lista del turno sin pasar
 * por sus datos: así cuentan todos los del turno, cualquiera sea el estado de sus datos.
 */
async function buscarElRelevo({ db, turno_guardia, prestadoraId, zona }) {
  let pacienteIds;
  try {
    pacienteIds = await idsDePacientesDeTurnoGuardia(db, prestadoraId, turno_guardia);
  } catch (e) {
    console.error(`Error leyendo los Pacientes del turno ${turno_guardia.id}:`, e.message);
    return null;
  }
  if (pacienteIds.length === 0) return null;

  // El relevo arranca el día en que éste termina, o al siguiente si hay un hueco entre los dos.
  const diaDelFinal = sumarDias(turno_guardia.fecha, Number(turno_guardia.dias_hasta_el_fin) || 0);

  const { data, error } = await db
    .from('turno_guardia_pacientes')
    .select('turnos_guardia!inner(id, fecha, hora_inicio, asistente_id, checkin_at)')
    .eq('prestadora_id', prestadoraId)
    .in('paciente_id', pacienteIds)
    .in('turnos_guardia.fecha', [diaDelFinal, sumarDias(diaDelFinal, 1)])
    .neq('turnos_guardia.estado', 'cancelada')
    .neq('turnos_guardia.id', turno_guardia.id);

  if (error) {
    console.error(`Error buscando el relevo del turno ${turno_guardia.id}:`, error.message);
    return null;
  }

  const filas = (data ?? []).map((fila) => fila.turnos_guardia).filter(Boolean);
  return laQueSigue(turno_guardia, filas, zona);
}

async function extensionesAbiertas(db, prestadoraId) {
  const porTurnoGuardia = new Map();

  const { data, error } = await db
    .from('extensiones_de_turno_guardia')
    .select('id, turno_guardia_id, relevo_turno_guardia_id, desde_at')
    .eq('prestadora_id', prestadoraId)
    .is('hasta_at', null);

  if (error) {
    // Sin poder leer lo que ya está no se abre ninguna: abrir a ciegas dejaría dos filas del mismo
    // rato, y de ahí saldrían horas de más contadas dos veces.
    console.error(`Error leyendo las extensiones abiertas (prestadora ${prestadoraId}):`, error.message);
    return null;
  }

  for (const fila of data ?? []) porTurnoGuardia.set(fila.turno_guardia_id, fila);
  return porTurnoGuardia;
}

async function abrir({ db, turno_guardia, relevo, zona }) {
  const { error } = await db.from('extensiones_de_turno_guardia').insert({
    prestadora_id: turno_guardia.prestadora_id,
    turno_guardia_id: turno_guardia.id,
    relevo_turno_guardia_id: relevo?.id ?? null,
    // La hora en que su turno terminaba, no la hora en que este proceso pasó. La diferencia son
    // los minutos que el proceso tardó en darse cuenta, y esos minutos ella los estuvo adentro.
    desde_at: finDeTurnoGuardiaEnLaZona(turno_guardia, zona).toISOString(),
  });

  if (error) {
    // El índice único deja una sola extensión abierta por turno: si dos vueltas se cruzaron, la
    // segunda pierde y no pasa nada. Cualquier otro error sí se anota.
    if (error.code !== '23505') {
      console.error(`Error abriendo la extension del turno ${turno_guardia.id}:`, error.message);
    }
  }
}

async function cerrar({ db, extension, prestadoraId, hasta }) {
  // Nunca antes de cuando empezó: si los relojes de dos actos vinieron cruzados, la extensión
  // queda en cero y no en negativo, que la base rechazaría y dejaría la fila abierta para siempre.
  const desde = Date.parse(extension.desde_at);
  const momento = Number.isNaN(desde) ? hasta : new Date(Math.max(desde, hasta.getTime()));

  const { error } = await db
    .from('extensiones_de_turno_guardia')
    .update({ hasta_at: momento.toISOString() })
    .eq('prestadora_id', prestadoraId)
    .eq('id', extension.id);

  if (error) {
    console.error(`Error cerrando la extension ${extension.id}:`, error.message);
  }
}

async function anotarElRelevo({ db, extension, prestadoraId, relevoId }) {
  const { error } = await db
    .from('extensiones_de_turno_guardia')
    .update({ relevo_turno_guardia_id: relevoId })
    .eq('prestadora_id', prestadoraId)
    .eq('id', extension.id);

  if (error) {
    console.error(`Error anotando el relevo de la extension ${extension.id}:`, error.message);
  }
}

