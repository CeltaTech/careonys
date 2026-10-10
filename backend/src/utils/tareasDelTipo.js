import { supabase } from '../db/connection.js';

// Qué es esta persona —cuidador/a, enfermero/a…— y qué le toca hacer.
//
// El catálogo vive en dos tablas y se lee siempre de la misma manera: primero el tipo,
// después sus tres listas de tareas. Está acá adentro y no copiado en cada pantalla
// porque es un catálogo, no un dato de cada guardia. Si mañana la Prestadora agrega una
// tarea, la ven todos a la vez (CLAUDE.md, «Ningún patrón repetido sin punto único de verdad»).
//
// Las tres clases: habilitada (es su trabajo), no incluida (no lo es, pero se le puede
// acordar) y prohibida (la ley del país no se la deja hacer). Sólo la prohibida bloquea.
//
// El corte por Prestadora se escribe a mano en las dos consultas. El backend entra a la
// base con la credencial de servicio, así que las cerraduras de la base no lo frenan y el
// corte tiene que estar en el código (CLAUDE.md §6). Un tipo del producto no tiene
// Prestadora y lo ven todas; uno propio, solo la Prestadora que lo creó. Las tareas del
// producto son además de un país: cada Prestadora ve las del suyo y ninguna otra.

export const CLASES_TAREA = ['habilitada', 'no_incluida', 'prohibida'];

function listasVacias() {
  return Object.fromEntries(CLASES_TAREA.map((clase) => [clase, []]));
}

/** El tipo de Asistente, si existe y si esta Prestadora puede verlo. */
export async function tipoDelAsistente(tipoAsistenteId, prestadoraId) {
  if (!tipoAsistenteId) return null;

  const { data } = await supabase
    .from('tipos_asistente')
    .select('id, clave, nombre, prestadora_id')
    .eq('id', tipoAsistenteId)
    .or(`prestadora_id.is.null,prestadora_id.eq.${prestadoraId}`)
    .maybeSingle();

  return data || null;
}

/** El país de la Prestadora, que decide qué tareas del producto le tocan. */
async function paisDeLaPrestadora(prestadoraId) {
  const { data } = await supabase
    .from('prestadoras')
    .select('pais')
    .eq('id', prestadoraId)
    .maybeSingle();
  return data?.pais || null;
}

/** Las tres listas del tipo. Siempre las tres, aunque estén vacías. */
export async function tareasDelTipo(tipoAsistenteId, prestadoraId) {
  const tareas = listasVacias();
  if (!tipoAsistenteId || !prestadoraId) return tareas;

  // Sin país conocido no hay tareas del producto que mostrar: quedan sólo las propias.
  const pais = await paisDeLaPrestadora(prestadoraId);

  const { data: filas } = await supabase
    .from('tareas_tipo_asistente')
    .select('id, prestadora_id, clase, clave, texto, descripcion, orden')
    .eq('tipo_asistente_id', tipoAsistenteId)
    .or(`prestadora_id.eq.${prestadoraId}${pais ? `,and(prestadora_id.is.null,pais.eq.${pais})` : ''}`)
    .order('orden', { ascending: true });

  for (const fila of filas || []) {
    if (tareas[fila.clase]) tareas[fila.clase].push(fila);
  }
  return tareas;
}

// Las dos cosas juntas, que es como las pide cualquier pantalla. Si el tipo no existe, o
// es de otra Prestadora, no se devuelve ninguna tarea: sin tipo no hay lista que mostrar.
export async function tipoConSusTareas(tipoAsistenteId, prestadoraId) {
  const tipo = await tipoDelAsistente(tipoAsistenteId, prestadoraId);
  if (!tipo) return { tipo: null, tareas: listasVacias() };
  return { tipo, tareas: await tareasDelTipo(tipo.id, prestadoraId) };
}
