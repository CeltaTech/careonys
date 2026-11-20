// Traer todas las filas de una consulta, de a una página por vez.
//
// La base devuelve como mucho una página de filas por pedido (`max_rows` en
// `supabase/config.toml`). Una consulta que puede pasar de ese número y la corta sin avisar deja
// afuera filas que la pantalla cree tener: por ejemplo, un turno de guardia que se pisa y no se ve.

/** El tamaño de cada página. Es el `max_rows` de `supabase/config.toml`: no puede pasarlo. */
export const FILAS_POR_PAGINA = 1000;

/**
 * @param {(desde: number, hasta: number) => PromiseLike<{ data: any[] | null, error: any }>} pagina
 *   Arma la consulta entera —con su orden, que tiene que ser estable— y le aplica `.range(desde, hasta)`.
 * @returns {Promise<any[]>}  Todas las filas. Si una página falla, lanza el error.
 */
export async function traerTodasLasFilas(pagina) {
  const filas = [];
  for (let desde = 0; ; desde += FILAS_POR_PAGINA) {
    const { data, error } = await pagina(desde, desde + FILAS_POR_PAGINA - 1);
    if (error) throw error;
    const recibidas = data ?? [];
    filas.push(...recibidas);
    if (recibidas.length < FILAS_POR_PAGINA) return filas;
  }
}
