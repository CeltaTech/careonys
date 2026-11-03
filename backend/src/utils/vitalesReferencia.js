import { enLaPrestadora } from '../db/connection.js';
import { SIGNOS_VITALES, SIGNOS_CON_PUNCION } from './signosVitales.js';

// Qué signos vitales toma un Asistente de un Paciente, y con qué rangos se los compara.
//
// Dos caminos, y ninguno más:
//   - El tipo del Asistente tiene habilitado el monitoreo biométrico (la enfermera): los toma
//     todos, también los que se toman pinchando, sin autorización del Cliente.
//   - Cualquier otro Asistente: sólo con una autorización aceptada para ese Paciente, y nunca los
//     que se toman pinchando, que no entran en el documento.
// Sin ninguno de los dos, la sección no se muestra.
//
// El rango de un Paciente pisa al de la Prestadora cuando existe. Nunca hay un valor fijo en
// código.
//
// CON QUÉ CREDENCIAL. Con la del trabajo de la Prestadora del Paciente, que lee sólo las
// autorizaciones y los rangos de la suya. No con la de quien pide: los rangos generales de la
// Prestadora no son de ningún Paciente, y ni el Asistente ni el Cliente los alcanzan.
//
// Si no se pudo saber, la sección no se muestra.

export const TAREA_MONITOREO_BIOMETRICO = 'monitoreo_y_registro_biometrico';

const SIN_SIGNOS = Object.freeze({ habilitados: false, signos: [], rangos: {} });

/** ¿El tipo del Asistente tiene habilitado el monitoreo biométrico? Recibe `tareas` de tipoConSusTareas. */
export function tomaTodosLosSignos(tareas) {
  return (tareas?.habilitada ?? []).some((tarea) => tarea.clave === TAREA_MONITOREO_BIOMETRICO);
}

export async function vitalesDelAsistente(pacienteId, prestadoraId, tareas) {
  if (!pacienteId || !prestadoraId) return SIN_SIGNOS;
  try {
    return await enLaPrestadora(prestadoraId, 'resolver los signos vitales del Asistente', async (db) => {
      let signos;
      if (tomaTodosLosSignos(tareas)) {
        signos = SIGNOS_VITALES;
      } else {
        const { data: autorizacion, error } = await db
          .from('autorizaciones_monitoreo_paciente')
          .select('id')
          .eq('prestadora_id', prestadoraId)
          .eq('paciente_id', pacienteId)
          .eq('estado', 'aceptada')
          .maybeSingle();
        if (error) throw error;
        if (!autorizacion) return SIN_SIGNOS;
        signos = SIGNOS_VITALES.filter((signo) => !SIGNOS_CON_PUNCION.includes(signo));
      }
      return { habilitados: true, signos, rangos: await rangosConLaConexion(db, pacienteId, prestadoraId) };
    });
  } catch (falla) {
    console.error('Error resolviendo los signos vitales del Asistente:', falla.message);
    return SIN_SIGNOS;
  }
}

/** Deja en los signos cargados sólo los que ese Asistente puede tomar. */
export function filtrarSignos(signosVitales, signos) {
  if (!signosVitales || !signos?.length) return null;
  const quedan = Object.fromEntries(
    Object.entries(signosVitales).filter(([signo, valor]) => signos.includes(signo) && valor !== null && valor !== '')
  );
  return Object.keys(quedan).length ? quedan : null;
}

// Del lado del Cliente, los rangos sólo tienen sentido junto a los valores: sin ningún signo
// cargado en los reportes que se le muestran, mandar el semáforo es mandar información clínica de
// esa persona sin nada a lo que aplicarla.
export async function rangosParaLosReportes(pacienteId, prestadoraId, reportes) {
  const conSignos = (reportes ?? []).some((reporte) => reporte?.signos_vitales && Object.keys(reporte.signos_vitales).length);
  if (!conSignos || !pacienteId || !prestadoraId) return { rangos: null };
  try {
    return {
      rangos: await enLaPrestadora(prestadoraId, 'los rangos de los signos vitales', (db) =>
        rangosConLaConexion(db, pacienteId, prestadoraId)
      ),
    };
  } catch (falla) {
    console.error('Error leyendo los rangos de los signos vitales:', falla.message);
    return { rangos: null };
  }
}

async function rangosConLaConexion(db, pacienteId, prestadoraId) {
  const { data: filas, error } = await db
    .from('rangos_referencia_vitales')
    .select('signo, valor_min, valor_max, unidad, paciente_id')
    .eq('prestadora_id', prestadoraId)
    .or(`paciente_id.eq.${pacienteId},paciente_id.is.null`);
  if (error) throw error;

  const rangos = {};
  for (const fila of (filas || []).filter((f) => f.paciente_id === null)) {
    rangos[fila.signo] = { min: fila.valor_min, max: fila.valor_max, unidad: fila.unidad };
  }
  for (const fila of (filas || []).filter((f) => f.paciente_id === pacienteId)) {
    rangos[fila.signo] = { min: fila.valor_min, max: fila.valor_max, unidad: fila.unidad };
  }
  return rangos;
}
