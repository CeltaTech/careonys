// La salida del Asistente que deja la guardia cuando llega el relevo.
//
// El relevo lee con la ubicación el código QR del Asistente que sale y toma la guardia. Esa
// lectura es la salida del que sale: la hora en que se leyó el código es su hora de salida, y la
// lectura comprueba su salida igual que la llegada del relevo.
//
// El que sale no necesita haber presentado el Reporte Diario para irse. Si lo presentó, su turno
// de guardia queda completado. Si no, queda en «Salida sin Reporte Diario»: la salida está hecha,
// la falta queda anotada en su Legajo, y el sistema le repite el aviso hasta que presente el
// reporte. Las horas se le liquidan cuando el reporte llega, en la liquidación del período en que
// llegó si la del período del turno ya estaba hecha. Al Cliente el turno se le factura igual, salvo
// que la Prestadora haya elegido esperar el reporte; la elección queda anotada en el turno de
// guardia en el momento de la salida. Cuando el reporte llega, el turno de guardia pasa a
// completado y conserva la hora de salida que ya tenía. La falta no se borra: queda a la vista con
// la fecha en que llegó el reporte.
//
// CON LA CREDENCIAL DEL TRABAJO DE LA PRESTADORA. El relevo cierra un turno de guardia que no es
// suyo, y el que sale presenta tarde un reporte sobre un turno que ya no puede cambiar de estado
// con su propia sesión. Cada función abre la Prestadora del turno de guardia que recibe.

import { enLaPrestadora } from '../db/connection.js';
import {
  comprobacionCon,
  guardarComprobacion,
  pacientesDelTurnoGuardia,
  turnosGuardiaSalientes,
} from './comprobacionDePresencia.js';
import { idsDePacientesDeTurnoGuardia } from './pacientesDeTurnoGuardia.js';
import { puedeRegistrarUbicacion } from './consentimientoUbicacion.js';
import { cerrarElTurnoGuardia } from './cierreDelTurnoGuardia.js';

export const ESTADO_SALIDA_SIN_REPORTE = 'salida_sin_reporte';
const MEDIO_CODIGO_DEL_SALIENTE = 'codigo_asistente_saliente';

/**
 * ¿A algún Paciente de este turno de guardia le falta el Reporte Diario? Pregunta sólo de quién
 * hay reporte, nunca qué dice.
 */
export async function faltaElReporte(db, turno_guardia) {
  const prestadoraId = turno_guardia.prestadora_id;
  const pacienteIds = await idsDePacientesDeTurnoGuardia(db, prestadoraId, turno_guardia);
  if (pacienteIds.length === 0) return false;

  const { data, error } = await db
    .from('reportes')
    .select('paciente_id')
    .eq('prestadora_id', prestadoraId)
    .eq('turno_guardia_id', turno_guardia.id);
  if (error) throw new Error(error.message);

  const conReporte = new Set((data ?? []).map((r) => r.paciente_id));
  return pacienteIds.some((id) => !conReporte.has(id));
}

/**
 * Cierra el turno de guardia del Asistente que sale, cuando el relevo marcó la llegada leyendo su
 * código. Se llama después de marcar la llegada del relevo. Si la llegada no se comprobó con el
 * código del que sale, no hace nada.
 *
 * `lat` y `lng` son los de la lectura: el que sale estaba en la casa en ese momento, y la
 * coordenada se guarda sólo si su consentimiento de ubicación está vigente.
 */
export async function cerrarLaSalidaDelSaliente({ relevo, lat, lng }) {
  return enLaPrestadora(relevo?.prestadora_id, 'Salida del Asistente que deja la guardia al relevo', (db) =>
    cerrarCon(db, { relevo, lat, lng }));
}

async function cerrarCon(db, { relevo, lat, lng }) {
  const prestadoraId = relevo.prestadora_id;
  const llegada = await comprobacionCon(db, { prestadoraId, turnoGuardiaId: relevo.id, momento: 'checkin' });
  if (llegada?.estado !== 'comprobada' || llegada.medio !== MEDIO_CODIGO_DEL_SALIENTE) {
    return;
  }
  if (llegada.sujeto_tipo !== 'asistente' || !llegada.sujeto_id || !llegada.comprobada_en) {
    return;
  }

  // La hora de salida es la de la lectura, que guardó la base, y no la de este momento.
  const hora = llegada.comprobada_en;
  const salientes = (await turnosGuardiaSalientes(db, relevo, await pacientesDelTurnoGuardia(db, relevo)))
    .filter((s) => s.asistente_id === llegada.sujeto_id);

  for (const saliente of salientes) {
    const turno_guardia = { ...saliente, prestadora_id: prestadoraId };

    const suya = await comprobacionCon(db, { prestadoraId, turnoGuardiaId: saliente.id, momento: 'checkout' });
    if (suya?.estado !== 'comprobada') {
      await guardarComprobacion(db, {
        prestadora_id: prestadoraId,
        turno_guardia_id: saliente.id,
        asistente_id: saliente.asistente_id,
        momento: 'checkout',
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
        estado: 'comprobada',
        medio: MEDIO_CODIGO_DEL_SALIENTE,
        sujeto_tipo: 'asistente',
        sujeto_id: saliente.asistente_id,
        comprobada_en: hora,
        autorizada_por: null,
        motivo_sin_comprobar: null,
        motivo_detalle: null,
      });
    }

    // El cierre pasa por el único camino, que decide el Reporte pendiente y avisa. La ubicación
    // se guarda sólo si el consentimiento del que sale está vigente.
    const registraUbicacion = await puedeRegistrarUbicacion(saliente.asistente_id, prestadoraId);
    try {
      await cerrarElTurnoGuardia(db, {
        turno_guardia,
        hora,
        lat: registraUbicacion ? lat : null,
        lng: registraUbicacion ? lng : null,
      });
    } catch (error) {
      // Otro camino lo cerró mientras tanto: la salida ya está hecha.
      if (error?.motivo !== 'turno_guardia_ya_cerrado') throw error;
    }
  }
}

/**
 * Llegó un Reporte Diario de un turno de guardia que espera el reporte. Si ya no le falta el de
 * ningún Paciente, el turno de guardia pasa a completado, conserva la hora de salida y anota
 * cuándo llegó el reporte. Devuelve verdadero si lo completó.
 */
export async function completarSiLlegoElReporte(turno_guardia) {
  if (turno_guardia?.estado !== ESTADO_SALIDA_SIN_REPORTE) return false;
  return enLaPrestadora(turno_guardia.prestadora_id, 'Llegada del Reporte pendiente', async (db) => {
    if (await faltaElReporte(db, turno_guardia)) return false;

    const { data, error } = await db
      .from('turnos_guardia')
      .update({ estado: 'completada', reporte_llego_at: new Date().toISOString() })
      .eq('prestadora_id', turno_guardia.prestadora_id)
      .eq('id', turno_guardia.id)
      .eq('estado', ESTADO_SALIDA_SIN_REPORTE)
      .select('id');
    if (error) throw new Error(error.message);
    return Boolean(data?.length);
  });
}
