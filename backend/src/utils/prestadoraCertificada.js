/* La Prestadora de un trabajo de fondo: que venga, y si está certificada.
   =====================================================================

   CÓMO CORREN LOS TRABAJOS DE FONDO. `programar`, en server.js, ya recorre las Prestadoras de a una
   y le pasa cada una al trabajo. El trabajo hace lo de esa Prestadora y nada más: si además
   recorriera todas por su cuenta, con tres Prestadoras daría nueve vueltas en vez de tres, y cada
   Prestadora recibiría sus avisos tres veces.

   SIN PRESTADORA NO SE TRABAJA. Un trabajo que llega sin Prestadora está mal programado, y lo dice
   fallando: no trabaja callado sobre nada.

   CERTIFICADA. Los trabajos que sólo corren para las Prestadoras certificadas lo miran acá, en un
   solo lugar, con la credencial del trabajo de esa Prestadora, que sólo ve su propia fila. Falla
   cerrado: si la consulta da error, cuenta como que no está certificada, y lo que no se hizo en
   esta vuelta se hace en la siguiente. */

import { enLaPrestadora } from '../db/connection.js';

/**
 * Falla si el trabajo llegó sin Prestadora.
 *
 * @param {string|undefined} prestadoraId
 * @param {string} trabajo
 */
export function exigirLaPrestadora(prestadoraId, trabajo) {
  if (!prestadoraId) throw new Error(`${trabajo}: falta la Prestadora`);
}

/**
 * Si la Prestadora está certificada, preguntado con la credencial del trabajo de esa Prestadora.
 *
 * @param {string} prestadoraId
 * @returns {Promise<boolean>}
 */
export function estaCertificada(prestadoraId) {
  return enLaPrestadora(prestadoraId, 'mirar si la Prestadora está certificada', async (db) => {
    const { data, error } = await db
      .from('prestadoras')
      .select('id')
      .eq('id', prestadoraId)
      .eq('estado', 'certificada')
      .limit(1);
    if (error) {
      console.error(`No se pudo mirar si la Prestadora ${prestadoraId} está certificada:`, error.message);
      return false;
    }
    return (data ?? []).length > 0;
  });
}
