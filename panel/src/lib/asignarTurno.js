import { supabase } from './supabaseClient';
import { llamarApiPanel } from './apiPanel';
import { mensajeDeBloqueo } from './matricula';
import { mensajeDeModalidad } from './modalidades';
import { mensajeDeError } from './errores';
import { con } from './textos';

/* Asignar un turno desde el Panel, o dejarlo sin asignar.
   =========================================================================================

   El turno no pasa a ser de nadie en el momento: queda esperando que el Asistente lo acepte, y
   mientras tanto se sigue viendo sin cubrir. Quien lo tenía —aceptado o esperando respuesta— lo
   pierde en el mismo paso. Todo eso lo hace la base, con la credencial de quien pide, y pasa por
   el backend sólo por los avisos al celular, que el Panel no puede mandar.

   Lo usan la reasignación desde el detalle de la guardia y el arrastre en la grilla: un solo
   lugar para las dos (regla del punto único de verdad, CeltaTech §8). */

/**
 * @param {string} guardiaId
 * @param {string | null} asistenteId  A quién se le asigna, o `null` para dejarlo sin asignar.
 * @param {object} t  Los textos del idioma en que está el Panel.
 * @returns {Promise<{ error: string | null }>}
 */
export async function asignarTurno(guardiaId, asistenteId, t = null) {
  try {
    await llamarApiPanel(`/guardias/${guardiaId}/asignar`, {
      method: 'POST',
      body: JSON.stringify({ asistente_id: asistenteId ?? null }),
    });
    return { error: null };
  } catch (e) {
    return { error: mensajeDeLaAsignacion(e, t) };
  }
}

/**
 * Llevar un turno con Asistente al de otro Paciente. El original queda sin nadie y con la alarma
 * abierta, y para el otro Paciente nace un turno nuevo que el mismo Asistente tiene que aceptar.
 * Lo hace la base, todo junto o nada; pasa por el backend por los avisos.
 *
 * @param {string} guardiaId
 * @param {{ pacienteId: string, fecha?: string, horaInicio?: string, horaFin?: string }} destino
 * @param {object} t  Los textos del idioma en que está el Panel.
 * @returns {Promise<{ error: string | null }>}
 */
export async function moverTurnoAOtroPaciente(guardiaId, { pacienteId, fecha = null, horaInicio = null, horaFin = null }, t = null) {
  try {
    await llamarApiPanel(`/guardias/${guardiaId}/mover-a-paciente`, {
      method: 'POST',
      body: JSON.stringify({ paciente_id: pacienteId, fecha, hora_inicio: horaInicio, hora_fin: horaFin }),
    });
    return { error: null };
  } catch (e) {
    return { error: mensajeDeLaAsignacion(e, t) };
  }
}

// La Matrícula y la modalidad vuelven como motivo, con el mismo código que levanta la base, y
// tienen su frase con su «dónde se arregla». Lo demás, con la frase de su motivo o de su situación.
function mensajeDeLaAsignacion(e, t) {
  return mensajeDeBloqueo(e?.motivo, t?.matricula) ?? mensajeDeModalidad(e?.motivo, t?.modalidades) ?? mensajeDeError(e, t);
}

/**
 * A quién está esperando cada turno: el Asistente al que se le asignó y que todavía no respondió.
 *
 * @param {string[]} guardiaIds
 * @returns {Promise<Map<string, string>>} guardia → Asistente.
 */
export async function cargarAsignacionesPendientes(guardiaIds) {
  const mapa = new Map();
  if (!guardiaIds?.length) return mapa;
  const { data, error } = await supabase
    .from('asignaciones_de_turno')
    .select('guardia_id, asistente_id')
    .in('guardia_id', guardiaIds)
    .eq('estado', 'sin_responder');
  if (error) throw error;
  for (const fila of data ?? []) mapa.set(fila.guardia_id, fila.asistente_id);
  return mapa;
}

/**
 * Qué se le pregunta al Coordinador antes de cambiarle el Asistente a un turno que ya tiene uno,
 * aceptado o esperando respuesta. Quien lo tenía lo pierde, y eso se dice antes de hacerlo.
 *
 * No pregunta cuando no hay nadie que pierda el turno, cuando se eligió al mismo que ya lo tiene,
 * ni cuando el turno estaba ausente: ahí no hay nadie haciéndolo, y quien lo cubre entra ahora.
 *
 * @param {object} guardia  Con `asistente_id`, `asistente_nombre`, `pendiente_asistente_id`,
 *                          `pendiente_nombre` y `estado`.
 * @param {string | null} asistenteId  A quién se le asigna, o `null` para dejarlo sin asignar.
 * @param {string | null} nombreNuevo  El nombre de ese Asistente.
 * @param {object} t  Los textos del idioma en que está el Panel.
 * @returns {{ texto: string, confirmar: string } | null}
 */
export function pedidoDeConfirmacion(guardia, asistenteId, nombreNuevo, t) {
  if (!guardia || guardia.estado === 'ausente') return null;
  const tc = t.guardias.confirmar_asignacion;

  const pendiente = guardia.pendiente_asistente_id ?? null;
  const titular = guardia.asistente_id ?? null;
  const quien = pendiente ?? titular;
  if (!quien || quien === (asistenteId ?? null)) return null;

  const nombre = pendiente ? guardia.pendiente_nombre : guardia.asistente_nombre;
  const clave = `${pendiente ? 'sin_responder' : 'aceptado'}${asistenteId ? '' : '_sin_asignar'}`;
  return {
    texto: con(tc[clave], { nombre, nuevo: nombreNuevo }),
    confirmar: asistenteId ? con(tc.asignar_a, { nuevo: nombreNuevo }) : tc.dejar_sin_asignar,
  };
}

/** Si el turno tiene a alguien que lo va a hacer: el que espera respuesta o, si no, el que lo aceptó. */
export function quienTieneElTurno(guardia) {
  if (!guardia || guardia.estado !== 'programada') return null;
  if (guardia.pendiente_asistente_id) return { id: guardia.pendiente_asistente_id, nombre: guardia.pendiente_nombre };
  if (guardia.asistente_id) return { id: guardia.asistente_id, nombre: guardia.asistente_nombre };
  return null;
}

/**
 * Qué se le pregunta al Coordinador antes de llevar un turno a otro Paciente. Se pregunta siempre.
 *
 * @param {object} guardia
 * @param {string} origen  El Paciente o los Pacientes que deja, ya escritos.
 * @param {string} destino  El Paciente al que pasa.
 * @param {object} t  Los textos del idioma en que está el Panel.
 * @returns {{ texto: string, confirmar: string }}
 */
export function pedidoDeConfirmacionDelMovimiento(guardia, origen, destino, t) {
  const tc = t.guardias.confirmar_asignacion;
  const quien = quienTieneElTurno(guardia);
  return {
    texto: quien
      ? con(tc.mover_con_asistente, { nombre: quien.nombre, origen, destino })
      : con(tc.mover_sin_asistente, { origen, destino }),
    confirmar: con(tc.mover_a, { destino }),
  };
}
