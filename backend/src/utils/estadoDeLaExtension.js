import { enLaPrestadora } from '../db/connection.js';
import { pasosDeLaBusqueda } from './extensionDeTurno.js';

/* Lo que se le muestra a la que quedó de más.
   ==========================================================================

   Tres cosas, y ninguna más: desde qué hora está de más, cuándo avisó por última vez que no puede
   continuar, y en qué anda la búsqueda del relevo.

   SIN NINGÚN NOMBRE. Quién faltó, quién viene, a quién se le asignó el turno: nada de eso se le
   cuenta. No es información que le sirva —no puede llamar a nadie desde adentro de un turno— y
   decirle que faltó una compañera es hablar de una persona a sus espaldas, con el agravante de que
   quien lo escucha está enojada con razón. Lo que sí le sirve, y es lo único que se manda, son los
   pasos ya dados: saber que alguien está buscando es lo que hace tolerable esperar.

   TAMPOCO SE LE PROMETE NADA. No hay hora estimada de llegada del relevo, ni «falta poco». Una
   hora que después no se cumple es peor que no decir nada. */

/**
 * El estado de la extensión abierta de un turno, o `null` si no hay ninguna.
 *
 * Cuesta hasta cinco consultas, así que se llama sólo cuando hace falta: la enorme mayoría de los
 * turnos no tiene extensión, y la primera consulta corta ahí.
 *
 * Las cinco van con la credencial del trabajo de esa Prestadora, que la base acota a ella. Si no
 * se pudo leer, no hay nada que mostrar: lo mismo que cuando una consulta falla.
 */
export async function estadoDeLaExtension({ guardiaId, prestadoraId }) {
  if (!prestadoraId) return null;
  try {
    return await enLaPrestadora(prestadoraId, 'leer la extension del turno', (db) =>
      leerLaExtension(db, { guardiaId, prestadoraId }),
    );
  } catch (error) {
    console.error(`No se pudo leer la extension del turno ${guardiaId}:`, error.message);
    return null;
  }
}

async function leerLaExtension(db, { guardiaId, prestadoraId }) {
  const { data: extension, error } = await db
    .from('extensiones_de_turno')
    .select('id, desde_at, relevo_guardia_id')
    .eq('guardia_id', guardiaId)
    .eq('prestadora_id', prestadoraId)
    .is('hasta_at', null)
    .maybeSingle();

  if (error) {
    console.error(`Error leyendo la extension del turno ${guardiaId}:`, error.message);
    return null;
  }
  if (!extension) return null;

  const noPuedeContinuarAt = await ultimoRelevoDeEmergencia(db, { guardiaId, prestadoraId, desde: extension.desde_at });
  const relevo = await elRelevo(db, extension.relevo_guardia_id, prestadoraId);
  const { coordinacionAvisada, escalado } = await comoVaElMensaje(db, {
    guardiaId,
    relevoId: extension.relevo_guardia_id,
    prestadoraId,
  });

  return {
    desdeAt: extension.desde_at,
    noPuedeContinuarAt,
    pasos: pasosDeLaBusqueda({ relevo, coordinacionAvisada, escalado }),
  };
}

/**
 * La última vez que pidió el Relevo de emergencia desde que quedó de más. Se puede pedir más de una
 * vez, y cada pedido es una emergencia de la guardia con su hora.
 */
async function ultimoRelevoDeEmergencia(db, { guardiaId, prestadoraId, desde }) {
  const { data, error } = await db
    .from('emergencias_guardia')
    .select('reportado_at')
    .eq('guardia_id', guardiaId)
    .eq('prestadora_id', prestadoraId)
    .eq('relevo_de_emergencia', true)
    .gte('reportado_at', desde)
    .order('reportado_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(`Error leyendo el relevo de emergencia del turno ${guardiaId}:`, error.message);
    return null;
  }
  return data?.reportado_at ?? null;
}

async function elRelevo(db, relevoId, prestadoraId) {
  if (!relevoId) return null;

  const { data, error } = await db
    .from('guardias')
    .select('id, asistente_id, checkin_at')
    .eq('id', relevoId)
    .eq('prestadora_id', prestadoraId)
    .maybeSingle();

  if (error) {
    console.error(`Error leyendo el relevo ${relevoId}:`, error.message);
    return null;
  }
  return data ?? null;
}

/**
 * Si quien coordina ya está enterado, y si el mensaje ya subió de escalón.
 *
 * Se pregunta por los dos expedientes que puede haber abiertos, porque hay dos maneras distintas
 * de que falte el relevo y cada una abre el suyo: el que se abre cuando la Asistente asignada no
 * llegó —cuelga del turno que quedó esperando, que es justamente éste— y el que se abre cuando el
 * turno se acercaba sin nadie asignado, que cuelga del turno vacío.
 *
 * «Avisada» quiere decir que el mensaje salió, no que se abrió el expediente: un expediente abierto
 * del que todavía no salió ningún correo no enteró a nadie, y decirle que sí sería mentirle.
 */
async function comoVaElMensaje(db, { guardiaId, relevoId, prestadoraId }) {
  const referencias = [];
  let coordinacionAvisada = false;

  const { data: relevoFallado, error: errorRelevo } = await db
    .from('incidentes_relevo')
    .select('id, ultima_notificacion_at')
    .eq('prestadora_id', prestadoraId)
    .eq('guardia_saliente_id', guardiaId)
    .is('resuelto_at', null);

  if (errorRelevo) {
    console.error(`Error leyendo el incidente de relevo del turno ${guardiaId}:`, errorRelevo.message);
  }
  for (const fila of relevoFallado ?? []) {
    referencias.push(fila.id);
    if (fila.ultima_notificacion_at) coordinacionAvisada = true;
  }

  if (relevoId) {
    const { data: sinCubrir, error: errorSinCubrir } = await db
      .from('incidentes_turno_sin_cubrir')
      .select('id, ultimo_recordatorio_at')
      .eq('prestadora_id', prestadoraId)
      .eq('guardia_id', relevoId)
      .is('resuelto_at', null);

    if (errorSinCubrir) {
      console.error(`Error leyendo el incidente del turno ${relevoId}:`, errorSinCubrir.message);
    }
    for (const fila of sinCubrir ?? []) {
      referencias.push(fila.id);
      if (fila.ultimo_recordatorio_at) coordinacionAvisada = true;
    }
  }

  if (referencias.length === 0) return { coordinacionAvisada, escalado: false };

  const { data: escalones, error: errorEscalones } = await db
    .from('escalones_de_alarma_avisados')
    .select('referencia_id')
    .eq('prestadora_id', prestadoraId)
    .in('referencia_id', referencias);

  if (errorEscalones) {
    console.error('Error leyendo los escalones ya avisados de la extension:', errorEscalones.message);
    return { coordinacionAvisada, escalado: false };
  }

  return { coordinacionAvisada, escalado: (escalones ?? []).length > 0 };
}
