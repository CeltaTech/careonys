import { supabase } from './supabaseClient';
import { llamarApiPanel } from './apiPanel';
import { documentosQueBloquean, mensajeDeDocumentos } from './documentos';
import { mensajeDeModalidad } from './modalidades';
import { mensajeDeError } from './errores';
import { con } from './textos';

/* Asignar un turno desde el Panel, o dejarlo sin asignar.
   =========================================================================================

   El turno no pasa a ser de nadie en el momento: queda esperando que el Asistente lo acepte, y
   mientras tanto se sigue viendo sin cubrir. Quien lo tenía —aceptado o esperando respuesta— lo
   pierde en el mismo paso. Todo eso lo hace la base, con la credencial de quien pide, y pasa por
   el backend sólo por los avisos al celular, que el Panel no puede mandar.

   Lo usan la reasignación desde el detalle del turno de guardia y el arrastre en la grilla: un solo
   lugar para las dos (regla del punto único de verdad, CeltaTech §8).

   Si el Asistente tiene documentos pendientes, la asignación vuelve con la lista en
   `documentosPendientes`, y quien tiene el permiso «Asignar con documentos pendientes» puede
   repetirla con un motivo. Sólo un turno de guardia puntual: un turno fijo nunca. */

/**
 * @param {string} turnoGuardiaId
 * @param {string | null} asistenteId  A quién se le asigna, o `null` para dejarlo sin asignar.
 * @param {object} t  Los textos del idioma en que está el Panel.
 * @param {string | null} motivoExcepcion  Por qué se asigna igual con documentos pendientes.
 * @returns {Promise<{ error: string | null, documentosPendientes: string[] | null }>}
 */
export async function asignarTurnoGuardia(turnoGuardiaId, asistenteId, t = null, motivoExcepcion = null) {
  const cuerpo = { asistente_id: asistenteId ?? null };
  if (motivoExcepcion) cuerpo.motivo_excepcion = motivoExcepcion;
  try {
    await llamarApiPanel(`/turnos-guardia/${turnoGuardiaId}/asignar`, {
      method: 'POST',
      body: JSON.stringify(cuerpo),
    });
    return { error: null, documentosPendientes: null };
  } catch (e) {
    return { error: mensajeDeLaAsignacion(e, t), documentosPendientes: documentosQueBloquean(e) };
  }
}

/**
 * Asignar un turno fijo, o dejarlo sin asignar. Igual que un turno: queda esperando que el
 * Asistente lo acepte, y lo contesta una sola vez para todos sus días.
 *
 * @param {string} serieId
 * @param {string | null} asistenteId  A quién se le asigna, o `null` para dejarlo sin asignar.
 * @param {object} t  Los textos del idioma en que está el Panel.
 * @returns {Promise<{ error: string | null }>}
 */
export async function asignarSerie(serieId, asistenteId, t = null) {
  try {
    await llamarApiPanel(`/turnos-guardia/series/${serieId}/asignar`, {
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
 * @param {string} turnoGuardiaId
 * @param {{ pacienteId: string, fecha?: string, horaInicio?: string, horaFin?: string }} destino
 * @param {object} t  Los textos del idioma en que está el Panel.
 * @returns {Promise<{ error: string | null }>}
 */
export async function moverTurnoGuardiaAOtroPaciente(turnoGuardiaId, { pacienteId, fecha = null, horaInicio = null, horaFin = null }, t = null) {
  try {
    await llamarApiPanel(`/turnos-guardia/${turnoGuardiaId}/mover-a-paciente`, {
      method: 'POST',
      body: JSON.stringify({ paciente_id: pacienteId, fecha, hora_inicio: horaInicio, hora_fin: horaFin }),
    });
    return { error: null };
  } catch (e) {
    return { error: mensajeDeLaAsignacion(e, t) };
  }
}

// Los documentos pendientes y la modalidad vuelven como motivo, con el mismo código que levanta la
// base, y tienen su frase. Lo demás, con la frase de su motivo o de su situación.
export function mensajeDeLaAsignacion(e, t) {
  return mensajeDeDocumentos(e, t) ?? mensajeDeModalidad(e?.motivo ?? e, t?.modalidades) ?? mensajeDeError(e, t);
}

/**
 * A quién está esperando cada turno: el Asistente al que se le asignó y que todavía no respondió.
 * Un turno de un turno fijo espera también a quien se le asignó el turno fijo entero; si ese día
 * tiene una asignación propia, manda ésa.
 *
 * @param {{ id: string, serie_id?: string | null }[]} guardias
 * @returns {Promise<Map<string, string>>} guardia → Asistente.
 */
export async function cargarAsignacionesPendientes(turnos_guardia) {
  const mapa = new Map();
  if (!turnos_guardia?.length) return mapa;
  const turnoGuardiaIds = turnos_guardia.map((g) => g.id);
  const serieIds = [...new Set(turnos_guardia.map((g) => g.serie_id).filter(Boolean))];

  const [porTurnoGuardia, porSerie] = await Promise.all([
    supabase
      .from('asignaciones_de_turno_guardia')
      .select('turno_guardia_id, asistente_id')
      .in('turno_guardia_id', turnoGuardiaIds)
      .eq('estado', 'sin_responder'),
    serieIds.length
      ? supabase
          .from('asignaciones_de_turno_guardia')
          .select('serie_id, asistente_id')
          .in('serie_id', serieIds)
          .eq('estado', 'sin_responder')
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (porTurnoGuardia.error) throw porTurnoGuardia.error;
  if (porSerie.error) throw porSerie.error;

  const delTurnoGuardiaFijo = new Map((porSerie.data ?? []).map((fila) => [fila.serie_id, fila.asistente_id]));
  for (const g of turnos_guardia) {
    if (g.serie_id && delTurnoGuardiaFijo.has(g.serie_id)) mapa.set(g.id, delTurnoGuardiaFijo.get(g.serie_id));
  }
  for (const fila of porTurnoGuardia.data ?? []) mapa.set(fila.turno_guardia_id, fila.asistente_id);
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
export function pedidoDeConfirmacion(turno_guardia, asistenteId, nombreNuevo, t) {
  if (!turno_guardia || turno_guardia.estado === 'ausente') return null;
  const tc = t.turnos_guardia.confirmar_asignacion;

  const pendiente = turno_guardia.pendiente_asistente_id ?? null;
  const titular = turno_guardia.asistente_id ?? null;
  const quien = pendiente ?? titular;
  if (!quien || quien === (asistenteId ?? null)) return null;

  const nombre = pendiente ? turno_guardia.pendiente_nombre : turno_guardia.asistente_nombre;
  const clave = `${pendiente ? 'sin_responder' : 'aceptado'}${asistenteId ? '' : '_sin_asignar'}`;
  return {
    texto: con(tc[clave], { nombre, nuevo: nombreNuevo }),
    confirmar: asistenteId ? con(tc.asignar_a, { nuevo: nombreNuevo }) : tc.dejar_sin_asignar,
  };
}

/** Si el turno tiene a alguien que lo va a hacer: el que espera respuesta o, si no, el que lo aceptó. */
export function quienTieneElTurnoGuardia(turno_guardia) {
  if (!turno_guardia || turno_guardia.estado !== 'programada') return null;
  if (turno_guardia.pendiente_asistente_id) return { id: turno_guardia.pendiente_asistente_id, nombre: turno_guardia.pendiente_nombre };
  if (turno_guardia.asistente_id) return { id: turno_guardia.asistente_id, nombre: turno_guardia.asistente_nombre };
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
export function pedidoDeConfirmacionDelMovimiento(turno_guardia, origen, destino, t) {
  const tc = t.turnos_guardia.confirmar_asignacion;
  const quien = quienTieneElTurnoGuardia(turno_guardia);
  return {
    texto: quien
      ? con(tc.mover_con_asistente, { nombre: quien.nombre, origen, destino })
      : con(tc.mover_sin_asistente, { origen, destino }),
    confirmar: con(tc.mover_a, { destino }),
  };
}
