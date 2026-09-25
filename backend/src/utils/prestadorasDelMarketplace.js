/* Las Prestadoras, de a una, para los trabajos de fondo del Marketplace.
   =====================================================================

   QUÉ RESUELVE. Los tres trabajos diarios del Marketplace —armar los cobros del período, cortar los
   accesos dados de baja y suspender los que agotaron la gracia— barrían `accesos_marketplace` con
   una sola consulta que mezclaba todas las Prestadoras. Cada Prestadora es un cajón cerrado
   (`celtatech\CLAUDE.md` §5): una consulta que alcanza a dos ya abrió el cajón, aunque después el
   código las separe en la memoria. Desde acá salen los identificadores, y cada trabajo consulta de
   a una Prestadora por vez, nombrándola.

   DE DÓNDE SALE LA LISTA. De `configuracion_cobro_marketplace`, que tiene una fila por Prestadora
   —la escribe el alta— y es la misma tabla de la que los tres trabajos ya leen sus plazos
   (`plazosDeCobroMarketplace.js`). No se lee de `prestadora_modalidades`: una Prestadora que apagó
   la modalidad puede conservar accesos que todavía hay que cortar o suspender, y dejarlos afuera los
   dejaría vigentes para siempre.

   ESTA CONSULTA ES LA ÚNICA ANTERIOR A CONOCER LA PRESTADORA, y lo es porque su resultado **es** la
   lista de Prestadoras: no trae ningún dato de ninguna, sólo sus identificadores. Es el mismo lugar
   que ocupan `configuracion_ausencia_automatica` en `ausenciaAutomatica.js` y
   `configuracion_escalada_coordinador` en `revisarNotificacionesCoordinador.js`. */

import { supabase } from '../db/connection.js';

/**
 * Los identificadores de las Prestadoras, para recorrerlas de a una.
 *
 * Devuelve la lista vacía ante cualquier error. Falla cerrado: sin saber a quiénes hay que
 * recorrer, no se recorre a nadie, que es preferible a una vuelta que trabaje sobre un cajón
 * equivocado. Lo que no se hizo hoy se hace mañana, porque ninguno de los tres trabajos apaga
 * la condición que elige lo que le toca.
 *
 * @returns {Promise<string[]>}
 */
export async function prestadorasDelMarketplace() {
  // SIN PRESTADORA A PROPÓSITO
  // Es el arranque de los trabajos de fondo del Marketplace, que no tienen sesión de nadie. No trae
  // dato de ninguna Prestadora: trae nada más que sus identificadores, y a partir de ahí cada
  // trabajo recorre de a una, nombrándola en cada consulta de adentro. Pedirle el filtro a ésta
  // sería pedirle que ya sepa la lista que viene a buscar.
  const { data, error } = await supabase
    .from('configuracion_cobro_marketplace')
    .select('prestadora_id');

  if (error) {
    console.error('Error consultando las Prestadoras del Marketplace:', error.message);
    return [];
  }

  return (data ?? []).map((fila) => fila.prestadora_id).filter(Boolean);
}
