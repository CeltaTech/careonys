
/* Cubrir un turno de guardia con un sustituto: el turno pasa a nombre de quien lo hace
   ==========================================================================

   QUÉ HACE Y POR QUÉ ACÁ. Cuando quien tenía el turno de guardia falta y se manda a otro, el turno sigue
   siendo uno solo y con una sola persona: la que lo hace. El turno de guardia pasa a nombre del sustituto,
   y con ella sus entradas y salidas, que son las suyas. Lo que queda escrito aparte es a quién le
   tocaba y por qué lo terminó haciendo otro: eso es la fila de `turnos_guardia_cobertura`.

   QUE EL TITULAR FALTÓ NO SE ESCRIBE ACÁ. Eso es su ausencia, que ya está cargada en `ausencias`
   con su justificación y su certificado, y es lo que se ve en su legajo.

   UNA SOLA OPERACIÓN DE LA BASE. `cubrir_turno_guardia_con_sustituto` escribe la constancia y pasa el
   turno de guardia al sustituto en la misma transacción: las dos cosas, o ninguna. Si la base rechaza el
   cambio de nombre —una tarea prohibida para el sustituto, una modalidad que no le corresponde—, la
   constancia tampoco queda. Y cuando lo pide un Coordinador, la base anota la decisión con cómo estaba
   el turno antes, para que la administración la pueda vetar.

   La función decide sola quién puede: la administración, o el Coordinador del Servicio de ese turno de
   guardia. Por eso el sustituto puede ser de otra zona sin que haga falta otra credencial.

   POR QUÉ ESTO DEJA BIEN LO QUE SE PAGA. La liquidación agrupa por Asistente y paga con el valor
   de cada uno —`routes/panelLiquidaciones.js`—. Con el turno de guardia a nombre del sustituto, la cobra
   él, con su propio valor, que puede no ser el del titular; y al titular ese turno no le suma
   nada. Lo que se informa al Pagador tampoco cambia: sigue siendo un turno, contado una vez.

   POR QUÉ ESTO NO ABRE UN INCIDENTE DE RELEVO, y `marcarAusente.js` sí. Ese incidente existe para
   avisar que alguien quedó esperando que lo releven. Acá no quedó nadie esperando: el turno de guardia se
   está cubriendo en el mismo acto. Marcar la ausencia sin sustituto sigue siendo trabajo de
   `marcarAusenteYCrearIncidente`, y no se toca.

   Entra con la conexión que le pasa quien llama: la ruta del Panel, con la de quien pide; el
   reemplazo aceptado, con la del trabajo de la Prestadora. */

/**
 * Anota la sustitución y pasa el turno de guardia a nombre del sustituto.
 *
 * `turno_guardia` tiene que traer al menos el identificador del turno de guardia a cubrir.
 *
 * Devuelve `{ ok: true }`, o `{ ok: false, motivo }` con el texto del rechazo de la base. No levanta
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
  // El turno no cambia en nada más: mismo Paciente, mismo día, mismo horario, misma modalidad.
  // Cambia quién lo hace.
  const { error } = await db.rpc('cubrir_turno_guardia_con_sustituto', {
    p_turno_guardia: turno_guardia.id,
    p_asistente_sustituto: asistenteSustitutoId,
    p_ausencia: ausenciaId,
    p_cobertura_de_ausencia: coberturaDeAusenciaId,
    p_motivo: motivo,
    p_motivo_detalle: motivoDetalle,
    p_costo_adicional: costoAdicional,
  });
  // Quien llama recibe el rechazo de la base tal cual, para poder reconocer su motivo.
  if (error) return { ok: false, motivo: error.message };
  return { ok: true };
}
