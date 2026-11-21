
/* Cubrir un turno de guardia con un sustituto: el turno pasa a nombre de quien lo hace
   ==========================================================================

   QUÉ HACE Y POR QUÉ ACÁ. Cuando quien tenía el turno de guardia falta y se manda a otro, el turno sigue
   siendo uno solo y con una sola persona: la que lo hace. El turno de guardia pasa a nombre del sustituto,
   y con ella sus entradas y salidas, que son las suyas. Lo que queda escrito aparte es a quién le
   tocaba y por qué lo terminó haciendo otro: eso es la fila de `turnos_guardia_cobertura`.

   QUE EL TITULAR FALTÓ NO SE ESCRIBE ACÁ. Eso es su ausencia, que ya está cargada en `ausencias`
   con su justificación y su certificado, y es lo que se ve en su legajo.

   Antes el Panel anotaba al sustituto en `turnos_guardia_cobertura` y dejaba el turno de guardia a nombre del que
   faltó. La aplicación del Asistente lista por `turnos_guardia.asistente_id`, así que el sustituto no la
   veía y no la podía fichar, y el ausente la seguía viendo como suya.

   POR QUÉ ESTO DEJA BIEN LO QUE SE PAGA. La liquidación agrupa por Asistente y paga con el valor
   de cada uno —`routes/panelLiquidaciones.js`—. Con el turno de guardia a nombre del sustituto, la cobra
   él, con su propio valor, que puede no ser el del titular; y al titular ese turno no le suma
   nada. Lo que se informa al Pagador tampoco cambia: sigue siendo un turno, contado una vez.

   POR QUÉ ESTO NO ABRE UN INCIDENTE DE RELEVO, y `marcarAusente.js` sí. Ese incidente existe para
   avisar que alguien quedó esperando que lo releven. Acá no quedó nadie esperando: el turno de guardia se
   está cubriendo en el mismo acto. Marcar la ausencia sin sustituto sigue siendo trabajo de
   `marcarAusenteYCrearIncidente`, y no se toca.

   Entra con la conexión que le pasa quien llama, que en los dos caminos es la del trabajo de la
   Prestadora de ese turno de guardia: la ruta del Panel, después de que la base le dejó ver el turno de guardia a
   quien pide, y el reemplazo aceptado. */

/**
 * Anota la sustitución y pasa el turno de guardia a nombre del sustituto.
 *
 * `turno_guardia` tiene que traer la fila entera del turno de guardia a cubrir.
 *
 * Devuelve `{ ok: true }`, o `{ ok: false, motivo }` con un texto para registrar. No levanta
 * excepciones.
 */
export async function cubrirTurnoGuardiaConSustituto({
  db,
  turno_guardia,
  asistenteSustitutoId,
  ausenciaId = null,
  coberturaDeAusenciaId = null,
  motivo = null,
  motivoDetalle = null,
  costoAdicional = null,
}) {
  const prestadoraId = turno_guardia.prestadora_id;

  // La constancia se escribe antes de mover el turno de guardia. Si fallara, el turno queda como estaba y
  // no se perdió nada. Al revés —el turno de guardia ya a nombre del sustituto y sin nadie anotado— se
  // perdería para siempre a quién le tocaba, que es justamente lo que hay que conservar.
  //
  // Ninguna función de la base hace las dos escrituras en una sola transacción, así que lo que no
  // puede quedar es la mitad: si la base rechaza el cambio de nombre —una tarea prohibida para el
  // sustituto, una modalidad que no le corresponde—, la constancia recién escrita se borra, porque
  // esa sustitución no ocurrió.
  const { data: constancias, error: errorCobertura } = await db.from('turnos_guardia_cobertura').insert({
    prestadora_id: prestadoraId,
    ausencia_id: ausenciaId,
    cobertura_de_ausencia_id: coberturaDeAusenciaId,
    turno_guardia_original_id: turno_guardia.id,
    asistente_titular_id: turno_guardia.asistente_id,
    asistente_sustituto_id: asistenteSustitutoId,
    motivo,
    motivo_detalle: motivoDetalle,
    costo_adicional: costoAdicional,
  }).select('id');
  if (errorCobertura) return { ok: false, motivo: errorCobertura.message };
  const constanciaId = constancias?.[0]?.id ?? null;

  // El turno no cambia en nada más: mismo Paciente, mismo día, mismo horario, misma modalidad.
  // Cambia quién lo hace.
  const { error: errorReasignar } = await db
    .from('turnos_guardia')
    .update({ asistente_id: asistenteSustitutoId })
    .eq('prestadora_id', prestadoraId)
    .eq('id', turno_guardia.id);
  if (errorReasignar) {
    await borrarConstancia({ db, prestadoraId, constanciaId, turnoGuardiaId: turno_guardia.id });
    // Quien llama recibe el rechazo de la base tal cual, para poder reconocer su motivo.
    return { ok: false, motivo: errorReasignar.message };
  }

  return { ok: true };
}

/** Borra la constancia de una sustitución que la base no dejó hacer. */
async function borrarConstancia({ db, prestadoraId, constanciaId, turnoGuardiaId }) {
  if (!constanciaId) {
    console.error(`[cubrirTurnoGuardia] la constancia del turno de guardia ${turnoGuardiaId} no devolvió su identificador y no se pudo borrar`);
    return;
  }
  const { error } = await db
    .from('turnos_guardia_cobertura')
    .delete()
    .eq('prestadora_id', prestadoraId)
    .eq('id', constanciaId);
  if (error) {
    console.error(`[cubrirTurnoGuardia] no se pudo borrar la constancia ${constanciaId} del turno de guardia ${turnoGuardiaId}:`, error.message);
  }
}
