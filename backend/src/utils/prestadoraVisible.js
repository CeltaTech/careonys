import { ErrorConMotivo, responderError } from './errorConMotivo.js';

/* La Prestadora de quien pide, tal como la base se la deja ver.
   =============================================================

   Una ruta que entra con `clienteDelPedido(req)` no filtra por la Prestadora de la sesión: la base
   le contesta sólo lo suyo. Pero cuando escribe una fila nueva, tiene que decir de qué Prestadora
   es, y ese dato sale de acá: de la fila de `prestadoras` que la base deja ver, nunca de la sesión
   ni del pedido. Toda cuenta del Panel ve una sola: la suya. Si no ve ninguna, o ve más de una, no
   se sabe para quién se escribe y no se escribe nada. */

/** El id de la Prestadora que la base deja ver con la conexión `db`. Lanza si no hay una sola. */
export async function prestadoraVisible(db) {
  const { data, error } = await db.from('prestadoras').select('id').maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new ErrorConMotivo('no_encontrado', 'la base no deja ver la Prestadora de quien pide');
  return data.id;
}

/** La misma, para un manejador: si no se la puede saber, contesta el error y devuelve `null`. */
export async function prestadoraVisibleOContestar(db, res) {
  try {
    return await prestadoraVisible(db);
  } catch (error) {
    responderError(res, error);
    return null;
  }
}
