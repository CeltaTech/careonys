/* Quién lleva el reclutamiento de una Prestadora.
   ===============================================

   QUÉ ES. El Responsable del reclutamiento es la persona del Panel que agenda las entrevistas de
   los postulantes y decide quién las hace. Lo elige la Administración de la Prestadora en
   Configuración → Reclutamiento (`configuracion_reclutamiento.responsable_id`).

   SIN ELECCIÓN, ES EL ADMINISTRADOR. La fila puede no existir y la columna puede estar vacía:
   entonces el Responsable es la única cuenta `admin_prestadora` de esa Prestadora. Lo mismo si la
   persona elegida dejó de ser del Panel de esa Prestadora.

   FALLA CERRADO. Si no se puede resolver a nadie —no hay Administrador, o hay más de uno y nadie
   eligió—, la respuesta es `null`, y `null` no es nadie: ninguna cuenta queda como Responsable.

   ÉSTA ES LA ÚNICA FUNCIÓN QUE LO RESUELVE. La pantalla de Configuración y las entrevistas la
   consumen las dos, y ninguna repite la regla. */

import { enLaPrestadora } from '../db/connection.js';

/** Los roles de quien trabaja en el Panel de una Prestadora. */
export const ROLES_DEL_PANEL = ['admin_prestadora', 'coordinador'];

/** Las personas del Panel de una Prestadora, por nombre. Son las que se pueden elegir como
 *  Responsable del reclutamiento o como Entrevistador. Se piden con el trabajo de la Prestadora
 *  porque la tabla `usuarios` sólo le deja a cada persona leer su propia fila. */
export async function personasDelPanel(prestadoraId) {
  if (!prestadoraId) return [];
  const { data, error } = await enLaPrestadora(prestadoraId, 'Personas del Panel de la Prestadora', (db) => db
    .from('usuarios')
    .select('id, nombre, rol')
    .eq('prestadora_id', prestadoraId)
    .in('rol', ROLES_DEL_PANEL)
    .is('desactivada_en', null)
    .order('nombre'));
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** La persona elegida, si la hay. Sin fila o sin elección, null. */
async function responsableElegido(prestadoraId) {
  const { data, error } = await enLaPrestadora(prestadoraId, 'Responsable del reclutamiento elegido', (db) => db
    .from('configuracion_reclutamiento')
    .select('responsable_id')
    .eq('prestadora_id', prestadoraId)
    .maybeSingle());
  if (error) throw new Error(error.message);
  return data?.responsable_id ?? null;
}

/** La regla, sobre datos ya leídos: la elegida si sigue en el Panel; si no, el único
 *  Administrador; si no, nadie. */
export function resolverResponsable(elegidoId, personas) {
  if (elegidoId && personas.some((p) => p.id === elegidoId)) return elegidoId;
  const administradores = personas.filter((p) => p.rol === 'admin_prestadora');
  return administradores.length === 1 ? administradores[0].id : null;
}

/** El Responsable del reclutamiento de una Prestadora, o null si no se puede resolver a nadie. */
export async function responsableDelReclutamiento(prestadoraId, personas = null) {
  if (!prestadoraId) return null;
  const [elegido, lista] = await Promise.all([
    responsableElegido(prestadoraId),
    personas ? Promise.resolve(personas) : personasDelPanel(prestadoraId),
  ]);
  return resolverResponsable(elegido, lista);
}

/** Si dos identificadores nombran a la misma cuenta. Vacío nunca coincide con vacío: una
 *  comparación entre dos ausencias no puede dar un permiso. */
export function esLaMismaCuenta(a, b) {
  return Boolean(a) && Boolean(b) && String(a) === String(b);
}
