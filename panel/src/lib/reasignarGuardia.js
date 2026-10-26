import { supabase } from './supabaseClient';
import { documentosQueBloquean } from './documentos';
import { mensajeDeError } from './errores';
import { avisarCambioDeAsistente } from './avisarCambioDeAsistente';
import { asignarTurno, mensajeDeLaAsignacion } from './asignarTurno';

/* Cambiarle el Asistente a una guardia desde su detalle.
   =========================================================================================

   Hay dos caminos, y los decide el estado de la guardia.

   Si estaba programada, se le asigna al Asistente elegido y queda esperando que la acepte
   (`lib/asignarTurno.js`). Quien la tenía la pierde en el mismo paso, y los avisos los manda el
   backend. Elegir «sin asignar» la deja sin nadie.

   Si estaba marcada como ausente, el turno ya empezó y nadie lo está haciendo. Es la única
   emergencia en la que una guardia empezada cambia de Asistente, y la base sólo la deja pasar por
   `reasignar_guardia_por_emergencia`, que pide el motivo y deja registro de quién, cuándo, el
   Asistente anterior, el nuevo y el motivo. La fecha y el horario no cambian. Quien la cubre entra
   ahora, sin esperar respuesta. Son tres cosas que van juntas:

     1. Se cambia el Asistente por la función de emergencia, con el motivo.
     2. Se cierra el incidente de relevo abierto por la ausencia. Si no, la alerta de "necesita
        relevo" sigue encendida aunque el Paciente ya tenga quien lo cuide.
     3. Se avisa el cambio, porque a la casa del Paciente entra otra persona. El aviso sale
        después de guardar y no puede voltear la reasignación: la guardia ya cambió. */

/**
 * @param {object} guardia  La guardia entera, como está hoy — hace falta para saber si estaba
 *                          ausente. Con el id solo no alcanzaría.
 * @param {string | null} asistenteId  Quién pasa a hacerla, o `null` para dejarla sin asignar.
 * @param {string} fecha  En qué fecha queda. Puede ser la misma que ya tenía. En la emergencia no
 *                          se usa: la guardia ya empezó y su fecha no cambia.
 * @param {object} t  Los textos del idioma en que está el Panel. Se piden desde afuera porque
 *                          acá no se sabe en qué idioma está, y hacen falta para las cosas
 *                          que nunca deben verse crudas: el rechazo por documentos pendientes, el
 *                          rechazo por modalidad de trabajo y cualquier otro error de la base.
 * @param {string} motivo  Por qué se la cubre. Sólo se usa en la emergencia, y ahí es obligatorio.
 * @param {string | null} motivoExcepcion  Por qué se asigna igual con documentos pendientes.
 * @returns {Promise<{ error: string | null, documentosPendientes: string[] | null }>}
 */
export async function reasignarGuardia(guardia, asistenteId, fecha, t = null, motivo = '', motivoExcepcion = null) {
  const estabaSinCobertura = guardia?.estado === 'ausente';

  // Un turno que ya está en curso y se quedó sin quien lo haga no espera respuesta: quien lo
  // cubre entra ahora. Todo lo demás se asigna y queda esperando que el Asistente acepte.
  if (!estabaSinCobertura) return asignarConFecha(guardia, asistenteId, fecha, t, motivoExcepcion);

  const argumentos = {
    p_guardia_id: guardia.id,
    p_asistente_id: asistenteId,
    p_motivo: motivo ?? '',
  };
  if (motivoExcepcion) argumentos.p_motivo_excepcion = motivoExcepcion;
  const { error: errorUpdate } = await supabase.rpc('reasignar_guardia_por_emergencia', argumentos);
  if (errorUpdate) {
    // Los rechazos de la base no se muestran crudos: los documentos pendientes y la modalidad de
    // trabajo tienen su frase.
    return { error: mensajeDeLaAsignacion(errorUpdate, t), documentosPendientes: documentosQueBloquean(errorUpdate) };
  }

  const { error: errorIncidente } = await supabase
    .from('incidentes_relevo')
    .update({
      resuelto_at: new Date().toISOString(),
      resuelto_por_tipo: 'suplente',
      resuelto_por_id: asistenteId,
    })
    .eq('guardia_entrante_id', guardia.id)
    .is('resuelto_at', null);
  if (errorIncidente) return { error: mensajeDeError(errorIncidente, t), documentosPendientes: null };

  if (guardia?.asistente_id !== asistenteId) {
    await avisarCambioDeAsistente({
      guardiaIds: [guardia.id],
      asistenteNuevoId: asistenteId,
      asistenteAnteriorId: guardia?.asistente_id ?? null,
    });
  }

  return { error: null, documentosPendientes: null };
}

/**
 * La fecha primero y la asignación después: los documentos se controlan contra el día en que el
 * turno termina, y tiene que ser el día nuevo. Si la asignación no pasa, la fecha vuelve a la que
 * tenía, para que el turno no quede corrido sin que nadie lo haya pedido así.
 *
 * Elegir a quien ya lo tiene no lo vuelve a asignar: le quitaría el turno aceptado para
 * preguntarle otra vez si lo quiere.
 */
export async function asignarConFecha(guardia, asistenteId, fecha, t = null, motivoExcepcion = null) {
  const cambiaFecha = Boolean(fecha) && fecha !== guardia.fecha;
  const cambiaAsistente = asistenteId !== (guardia.asistente_id ?? null) || Boolean(guardia.pendiente_asistente_id);
  const yaEsSuyo = asistenteId !== null && asistenteId === guardia.asistente_id;

  if (cambiaFecha) {
    const { error } = await supabase.from('guardias').update({ fecha }).eq('id', guardia.id);
    if (error) return { error: mensajeDeError(error, t), documentosPendientes: null };
  }

  if (!cambiaAsistente || yaEsSuyo) return { error: null, documentosPendientes: null };

  const { error, documentosPendientes } = await asignarTurno(guardia.id, asistenteId, t, motivoExcepcion);
  if (error && cambiaFecha) {
    await supabase.from('guardias').update({ fecha: guardia.fecha }).eq('id', guardia.id);
  }
  return { error, documentosPendientes };
}
