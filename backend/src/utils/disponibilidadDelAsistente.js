/**
 * En qué horarios suele estar disponible un Asistente.
 *
 * Se guarda en `asistentes.disponibilidad` como la lista de las claves que eligió de la lista de
 * opciones `disponibilidad`: la misma que usa la postulación, con lo que trae el producto y lo que
 * agregó cada Prestadora. Es un dato que se muestra; el sistema no decide nada con él.
 */

export const LISTA_DE_DISPONIBILIDAD = 'disponibilidad';

/**
 * Las opciones de la lista: las del producto y las de la Prestadora, en orden. Con `clave` e
 * `i18n`, para que cada pantalla las muestre en su idioma.
 *
 * Se lee con la conexión de quien pide, así que la base ya le contesta sólo esos dos pisos. El
 * filtro por Prestadora se escribe igual, como en `mediosDePago.js`: no deja que la lista dependa
 * sólo de la regla de la base. Sin Prestadora no hay lista, y sin lista no se acepta ninguna.
 */
export async function opcionesDeDisponibilidad(db, prestadoraId) {
  if (!prestadoraId) return [];
  const { data, error } = await db
    .from('opciones_de_lista')
    .select('clave, i18n, orden, listas_de_opciones!inner(clave, prestadora_id)')
    .eq('listas_de_opciones.clave', LISTA_DE_DISPONIBILIDAD)
    .is('listas_de_opciones.prestadora_id', null)
    .eq('activa', true)
    .or(`prestadora_id.is.null,prestadora_id.eq.${prestadoraId}`)
    .order('orden');
  if (error) throw new Error(error.message);
  return (data ?? []).map(({ clave, i18n }) => ({ clave, i18n }));
}

/**
 * Lo que guardó la postulación —claves separadas por coma— como se guarda en el Legajo.
 * Nulo si no indicó ninguna.
 */
export function disponibilidadDeLaPostulacion(texto) {
  const claves = [...new Set(String(texto ?? '').split(',').map((v) => v.trim()).filter(Boolean))];
  return claves.length ? claves : null;
}

/**
 * Lo que llega en el pedido, comprobado contra la lista: sólo claves que existen, sin repetir.
 * Devuelve `{ valida: true, guardar }` —`guardar` es nulo si no eligió ninguna— o
 * `{ valida: false }` si llegó algo que no es de la lista.
 */
export function disponibilidadElegida(pedido, opciones) {
  if (!Array.isArray(pedido) || pedido.some((v) => typeof v !== 'string')) return { valida: false };
  const existentes = new Set(opciones.map((o) => o.clave));
  const claves = [...new Set(pedido)];
  if (claves.some((c) => !existentes.has(c))) return { valida: false };
  return { valida: true, guardar: claves.length ? claves : null };
}
