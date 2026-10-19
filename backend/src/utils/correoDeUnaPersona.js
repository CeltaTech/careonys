import { enLaPrestadora } from '../db/connection.js';

// EL CORREO DE UNA PERSONA ESTÁ EN `usuarios`, Y NO DEL LADO DEL ACCESO.
// ============================================================================
//
// Del lado del acceso lo que queda escrito no es el correo: es una dirección armada con el
// identificador de la cuenta, porque se entra con el nombre de usuario y el email es sólo un dato
// de contacto (ver `config/direccionDeAcceso.js`). Pedirle el correo a ese lado devuelve una
// dirección que no existe y a la que no llega nadie.
//
// POR QUÉ ESTE ARCHIVO EXISTE. Porque eso no se ve. Un mensaje mandado a la dirección equivocada no
// falla: se manda, y no llega. Con el correo en un solo lugar, ninguna parte del backend tiene que
// acordarse de cuál de los dos lados preguntar.
//
// SIN CORREO, EL MENSAJE NO SALE PARA ESA PERSONA, pero el proceso sigue: los demás tienen que
// enterarse igual.

/**
 * El correo de una persona, o nulo si no tiene cuenta o la cuenta no tiene correo.
 *
 * LA ORGANIZACIÓN SE NOMBRA Y NO SE SUPONE. Se lee con la credencial del trabajo de esa
 * Prestadora, que la base acota a ella, y la consulta filtra igual. Sin Organización no se busca a
 * nadie.
 */
export async function correoDe({ prestadoraId, usuarioId }) {
  if (!prestadoraId || !usuarioId) return null;
  const { data, error } = await enLaPrestadora(prestadoraId, 'correo de una persona', (db) => db
    .from('usuarios')
    .select('email')
    .eq('prestadora_id', prestadoraId)
    .eq('id', usuarioId)
    .maybeSingle());
  if (error || !data?.email) return null;
  return data.email;
}

/**
 * Los correos de varias personas, sin repetidos y sin los que no tienen.
 *
 * El orden de la lista que entra se conserva.
 */
export async function correosDe({ prestadoraId, usuarioIds }) {
  const ids = (usuarioIds ?? []).filter(Boolean);
  if (!prestadoraId || ids.length === 0) return [];

  const { data, error } = await enLaPrestadora(prestadoraId, 'correos de varias personas', (db) => db
    .from('usuarios')
    .select('id, email')
    .eq('prestadora_id', prestadoraId)
    .in('id', ids));
  if (error) return [];

  const porId = new Map((data ?? []).map((fila) => [fila.id, fila.email]));
  const correos = ids.map((id) => porId.get(id)).filter(Boolean);
  return [...new Set(correos)];
}
