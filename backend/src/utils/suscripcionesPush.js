import { supabase } from '../db/connection.js';

// Guarda la suscripción a las notificaciones de un aparato, y deja rastro si esa suscripción
// cambia de dueño.
//
// Escrito una sola vez porque lo usan las dos aplicaciones —la del Asistente y la de la Familia—
// con el mismo contrato y la misma tabla (regla 12 de CLAUDE.md §7). Tenerlo dos veces es cómo se
// arregla una sola de las dos.
//
// **Por qué existe el rastro.** Adentro de una Prestadora la dirección de entrega que emite el
// navegador es única: quien la mande con sus propias claves se queda con la fila, y el aparato de
// la otra persona deja de mostrar sus notificaciones. No se prohíbe porque el caso legítimo es
// idéntico: cuando dos personas comparten un teléfono, la dirección es la misma y pisarla es lo
// correcto. Lo que se hace es anotarlo, para poder explicar después por qué alguien dejó de
// recibir notificaciones. El
// porqué completo está en la migración
// supabase/migrations/20260823020000_un_cambio_de_dueno_de_una_suscripcion_de_avisos_queda_anotado.sql
//
// **Y el mismo aparato en dos Prestadoras no es el mismo caso.** Un Asistente que trabaja en dos y
// usa un solo teléfono queda anotado dos veces, una por cada una, y cada Prestadora le manda lo
// suyo. Lo hace cumplir el único `(prestadora_id, endpoint)` de la migración
// supabase/migrations/20261006090000_un_aparato_se_anota_una_vez_por_cada_prestadora.sql
//
// `rol` es 'asistente' o 'familia'. Devuelve `{ error }`: el llamador decide qué contestar.
export async function guardarSuscripcionPush({ prestadoraId, rol, usuarioId, endpoint, keys, userAgent }) {
  const columna = rol === 'asistente' ? 'asistente_id' : 'familia_id';

  // Sin Prestadora no se lee nada: un filtro vacío traería la anotación que ese mismo aparato
  // tenga en otra, que acá no existe.
  if (!prestadoraId) return { error: new Error('falta la Prestadora') };

  const { data: anterior, error: errorAnterior } = await supabase
    .from('push_subscriptions')
    .select('id, asistente_id, familia_id')
    .eq('prestadora_id', prestadoraId)
    .eq('endpoint', endpoint)
    .maybeSingle();
  if (errorAnterior) return { error: errorAnterior };

  // Se manda solamente la columna de la audiencia propia, nunca la otra en nulo. Es a propósito:
  // dejando la otra como está, un intento de quedarse con la suscripción de la audiencia contraria
  // choca contra el CHECK `push_subscriptions_una_audiencia` y no llega a escribirse. Mandarla en
  // nulo "para dejar la fila prolija" abriría un camino que hoy la base cierra sola.
  const fila = {
    prestadora_id: prestadoraId,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    user_agent: userAgent || null,
  };
  fila[columna] = usuarioId;

  // El conflicto es por Prestadora y aparato, nunca por el aparato solo: la fila que se pisa es
  // siempre de esta Prestadora, y la que ese mismo teléfono tenga en otra no se toca.
  const { data: guardada, error } = await supabase
    .from('push_subscriptions')
    .upsert(fila, { onConflict: 'prestadora_id,endpoint' })
    .select('id')
    .single();
  if (error) return { error };

  const duenoAnterior = anterior?.asistente_id ?? anterior?.familia_id ?? null;
  if (duenoAnterior && duenoAnterior !== usuarioId) {
    const { error: errorRastro } = await supabase.from('auditoria_cambio_dueno_push').insert({
      suscripcion_id: guardada.id,
      // Las dos son la misma: un cambio de dueño ocurre siempre adentro de una Prestadora. Las dos
      // columnas quedan porque son las que tiene la tabla, y una anotación vieja puede traer dos
      // distintas, de cuando el aparato se anotaba una sola vez en total.
      prestadora_anterior: prestadoraId,
      prestadora_nueva: prestadoraId,
      usuario_anterior: duenoAnterior,
      usuario_nuevo: usuarioId,
      rol_anterior: anterior.asistente_id ? 'asistente' : 'familia',
      rol_nuevo: rol,
      user_agent: userAgent || null,
    });
    // Si falla la anotación, la suscripción ya quedó guardada y el aparato va a recibir sus
    // notificaciones: no
    // se le devuelve un error a quien acaba de suscribirse por algo que no puede resolver. Queda en
    // el registro del servidor, que es donde alguien lo va a ir a buscar. Se anotan identificadores,
    // nunca la dirección de entrega ni el correo de nadie (CLAUDE.md §6).
    if (errorRastro) {
      console.error(
        'No se pudo anotar el cambio de dueño de una suscripción a las notificaciones',
        guardada.id,
        errorRastro.message,
      );
    }
  }

  return { error: null };
}
