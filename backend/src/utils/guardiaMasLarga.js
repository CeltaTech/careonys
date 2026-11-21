// Cuántos días dura el turno de guardia más largo de una Prestadora.
//
// Un turno de guardia no tiene tope de días: puede empezar varios días antes del día que se
// mira y seguir corriendo. Quien busca los turnos que rodean un día mira hacia atrás tantos días
// como dura el más largo, en vez de suponer un número fijo.
//
// Sin turnos, o con un dato que no se entiende, da cero: quien llama suma su propio margen.

/**
 * @param {object} db         cliente de la base de esa Prestadora
 * @param {string} prestadoraId
 * @returns {Promise<number>} los días que dura el turno de guardia más largo, cero o más
 */
export async function diasDeLaGuardiaMasLarga(db, prestadoraId) {
  const { data, error } = await db
    .from('turnos_guardia')
    .select('dias_hasta_el_fin')
    .eq('prestadora_id', prestadoraId)
    .order('dias_hasta_el_fin', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const dias = Number(data?.[0]?.dias_hasta_el_fin);
  return Number.isInteger(dias) && dias > 0 ? dias : 0;
}
