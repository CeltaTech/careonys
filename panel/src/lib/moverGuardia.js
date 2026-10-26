import { supabase } from './supabaseClient';
import { cambiarPacienteDeGuardia } from './cambiarPacienteDeGuardia';
import { mensajeDeError } from './errores';
import { FILA_SIN_CUBRIR, filaDeGuardia } from './cobertura';
import { asignarConFecha } from './reasignarGuardia';
import { moverTurnoAOtroPaciente, quienTieneElTurno } from './asignarTurno';

/* Arrastrar una guardia dentro de la grilla: un solo lugar para lo que eso significa.
   =========================================================================================

   POR QUÉ ESTÁ ACÁ Y NO DENTRO DE UNA PANTALLA. Soltar una guardia en otra celda no es
   escribir una columna: son tres decisiones distintas, y cuál se toma depende de qué está
   mostrando la grilla en ese momento.

     1. Si las filas son Asistentes, mover la guardia a otra fila se la asigna a ese Asistente, y
        queda esperando que la acepte (`lib/reasignarGuardia.js`). Soltarla en la fila de las
        guardias sin cubrir la deja sin nadie.
     2. Si las filas son Pacientes y el turno tiene Asistente, el turno no se mueve: queda sin
        nadie para sus Pacientes, y para el otro nace uno nuevo que el mismo Asistente tiene que
        aceptar (`moverTurnoAOtroPaciente`). Sin Asistente, mover la guardia cambia a quién
        cubre — y eso no es una columna, porque un turno puede cubrir a varias personas a la
        vez. Esa cuenta vive en `lib/cambiarPacienteDeGuardia.js` y acá solo se la llama.
     3. En cualquiera de las dos, la columna nueva es la fecha; y en la vista de línea de
        tiempo, además, la posición horizontal ES la hora, así que vienen las dos horas ya
        calculadas por la grilla, que es la única que sabe cuánto duraba el turno.

   Dos pantallas usan la misma grilla —el Estado actual y la de Guardias—, así que todo esto se
   escribe una sola vez y las dos la llaman (regla del punto único de verdad, CeltaTech §8).

   POR QUÉ FALLA CERRADO ANTE UNA VISTA DESCONOCIDA. Las dos ramas escriben en lugares
   distintos: una guarda un identificador en `asistente_id` y la otra rehace la lista de
   Pacientes del turno. Si la vista llegara vacía o con un valor que no se entiende, elegir
   cualquiera de las dos guardaría el dato en el lugar equivocado — un Paciente metido en la
   columna del Asistente, o al revés. Adivinar no es una opción, así que no se mueve nada y se
   avisa (regla «todo control de acceso falla cerrado», CeltaTech §5). */

/** Las dos únicas cosas que puede haber en las filas de la grilla. */
const VISTAS = ['asistente', 'paciente'];

/** Los estados de una guardia que todavía no empezó. Cualquier otro cuenta como empezada. */
const SIN_EMPEZAR = ['programada', 'pausada', 'cancelada'];

/**
 * Si la guardia ya empezó: tiene el check-in, o su estado ya no es uno de antes de empezar
 * (activa, ausente, completada). Un estado desconocido cuenta como empezada. Una guardia empezada
 * no cambia de Asistente, de día ni de horario, ni de lista de Pacientes, y la base tampoco lo
 * deja. La única excepción es cubrir una ausente, por `reasignarGuardia`, con el motivo.
 */
export function yaEmpezo(guardia) {
  return Boolean(guardia?.checkin_at) || !SIN_EMPEZAR.includes(guardia?.estado);
}

/** Si la grilla ofrece arrastrar esta guardia: sólo si todavía no empezó. */
export function seArrastra(guardia) {
  return Boolean(guardia) && !yaEmpezo(guardia);
}

/**
 * @param {object} guardia  La guardia entera, como está hoy — hacen falta `paciente_id` y
 *                          `prestadora_id` para rehacer la lista de Pacientes. Con el id solo no alcanzaría.
 * @param {object} movimiento  Lo que informa la grilla al soltar:
 *   - `fila`: a qué fila se la llevó (un Asistente o un Paciente, según la vista).
 *   - `filaOrigen`: de qué fila se la sacó. Solo se usa en la vista por Paciente.
 *   - `fecha`: en qué día quedó.
 *   - `vista`: qué hay en las filas, `'asistente'` o `'paciente'`. Viene con el movimiento y no
 *     se lee del estado de la pantalla: la grilla puede estar mostrando otra cosa de la que la
 *     pantalla cree si nadie la controla.
 *   - `horaInicio` y `horaFin`: solo desde la línea de tiempo. Si no vienen, el horario no se
 *     toca.
 * @param {object} t  Los textos del idioma en que está el Panel. Se piden desde afuera porque
 *                          acá no se sabe en qué idioma está, y hacen falta para que ningún
 *                          error de la base llegue crudo a la pantalla.
 * @param {string | null} motivoExcepcion  Por qué se asigna igual con documentos pendientes.
 * @returns {Promise<{ error: string | null, documentosPendientes?: string[] | null }>} El motivo si
 *          algo falló, o null si salió todo; y los documentos, si la asignación la frenaron ellos.
 */
export async function moverGuardia(guardia, { fila, filaOrigen, fecha, vista, horaInicio, horaFin }, t = null, motivoExcepcion = null) {
  if (!guardia?.id || !seArrastra(guardia)) return { error: null };

  if (!VISTAS.includes(vista)) {
    return { error: mensajeDeError(new Error(`Vista de grilla desconocida: ${String(vista)}`), t, 'moverGuardia') };
  }

  if (vista === 'paciente') {
    // Con alguien que lo va a hacer, el turno no cambia de Paciente: queda donde estaba, sin
    // nadie, y el Asistente tiene que aceptar uno nuevo para el otro Paciente.
    if (fila !== filaOrigen && quienTieneElTurno(guardia)) {
      return moverTurnoAOtroPaciente(guardia.id, { pacienteId: fila, fecha, horaInicio, horaFin }, t);
    }
    const { error: falla } = await cambiarPacienteDeGuardia(guardia, filaOrigen, fila, t);
    if (falla) return { error: falla };
    return moverEnElCalendario(guardia, { fecha, horaInicio, horaFin }, t);
  }

  // Del lado de los Asistentes. Si se la soltó en su misma fila, sólo cambian el día o la hora.
  if (fila === filaDeGuardia(guardia)) return moverEnElCalendario(guardia, { fecha, horaInicio, horaFin }, t);

  // La hora se corre antes de asignar, y la fecha la corre la asignación: los documentos se miran
  // contra el día nuevo.
  if (horaInicio && horaFin) {
    const { error } = await supabase
      .from('guardias')
      .update({ hora_inicio: horaInicio, hora_fin: horaFin })
      .eq('id', guardia.id);
    if (error) return { error: mensajeDeError(error, t) };
  }

  const asistenteId = fila === FILA_SIN_CUBRIR ? null : fila;

  return asignarConFecha(guardia, asistenteId, fecha, t, motivoExcepcion);
}

/** Correr una guardia de día o de hora sin cambiarle quién la hace. */
async function moverEnElCalendario(guardia, { fecha, horaInicio, horaFin }, t) {
  const cambios = { fecha };
  if (horaInicio && horaFin) {
    cambios.hora_inicio = horaInicio;
    cambios.hora_fin = horaFin;
  }

  const { error } = await supabase.from('guardias').update(cambios).eq('id', guardia.id);
  if (error) return { error: mensajeDeError(error, t) };
  return { error: null };
}
