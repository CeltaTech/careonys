/* Las Prestadoras, de a una, para los trabajos de fondo.
   =====================================================================

   Son tres listas: la de las Prestadoras del Match, para sus tres trabajos diarios; la de las que
   tienen encendida la ausencia automática, para ese trabajo; y la de las Prestadoras certificadas,
   para los demás trabajos de fondo. Viven acá porque son la única consulta que cada trabajo hace
   antes de conocer la Prestadora.

   QUÉ RESUELVE. Los tres trabajos diarios del Match —armar los cobros del período, cortar los
   accesos dados de baja y suspender los que agotaron la gracia— barrían `accesos_intermediacion` con
   una sola consulta que mezclaba todas las Prestadoras. Cada Prestadora es un cajón cerrado
   (`celtatech\CLAUDE.md` §5): una consulta que alcanza a dos ya abrió el cajón, aunque después el
   código las separe en la memoria. Desde acá salen los identificadores, y cada trabajo consulta de
   a una Prestadora por vez, nombrándola.

   DE DÓNDE SALE LA LISTA. De `configuracion_cobro_intermediacion`, que tiene una fila por Prestadora
   —la escribe el alta— y es la misma tabla de la que los tres trabajos ya leen sus plazos
   (`plazosDeCobroIntermediacion.js`). No se lee de `prestadora_modalidades`: una Prestadora que apagó
   la modalidad puede conservar accesos que todavía hay que cortar o suspender, y dejarlos afuera los
   dejaría vigentes para siempre.

   ESTA CONSULTA ES LA ÚNICA ANTERIOR A CONOCER LA PRESTADORA, y lo es porque su resultado **es** la
   lista de Prestadoras: no trae ningún dato de ninguna, sólo sus identificadores. Es el mismo lugar
   que ocupa `configuracion_escalada_coordinador` en `revisarNotificacionesCoordinador.js`. */

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
export async function prestadorasDeLaIntermediacion() {
  // SIN PRESTADORA A PROPÓSITO
  // Es el arranque de los trabajos de fondo del Match, que no tienen sesión de nadie. No trae
  // dato de ninguna Prestadora: trae nada más que sus identificadores, y a partir de ahí cada
  // trabajo recorre de a una, nombrándola en cada consulta de adentro. Pedirle el filtro a ésta
  // sería pedirle que ya sepa la lista que viene a buscar.
  const { data, error } = await supabase
    .from('configuracion_cobro_intermediacion')
    .select('prestadora_id');

  if (error) {
    console.error('Error consultando las Prestadoras del Match:', error.message);
    return [];
  }

  return (data ?? []).map((fila) => fila.prestadora_id).filter(Boolean);
}

/**
 * Los identificadores de las Prestadoras que tienen encendida la ausencia automática, para que
 * ese trabajo las recorra de a una.
 *
 * Igual que la de arriba: sólo identificadores, y la lista vacía ante cualquier error. Cuánta
 * tolerancia tiene cada una lo lee el trabajo adentro, con la credencial de esa Prestadora.
 *
 * @returns {Promise<string[]>}
 */
export async function prestadorasConAusenciaAutomatica() {
  // SIN PRESTADORA A PROPÓSITO
  // Es el arranque de ese trabajo de fondo, que no tiene sesión de nadie. Trae nada más que los
  // identificadores, y a partir de ahí el trabajo recorre de a una, con la credencial de cada una.
  const { data, error } = await supabase
    .from('configuracion_ausencia_automatica')
    .select('prestadora_id')
    .eq('activo', true);

  if (error) {
    console.error('Error consultando las Prestadoras con la ausencia automática:', error.message);
    return [];
  }

  return (data ?? []).map((fila) => fila.prestadora_id).filter(Boolean);
}

/**
 * Los identificadores de las Prestadoras certificadas, para que los trabajos de fondo las
 * recorran de a una.
 *
 * Igual que la de arriba: sólo identificadores, y la lista vacía ante cualquier error.
 *
 * @returns {Promise<string[]>}
 */
export async function prestadorasCertificadas() {
  const { data, error } = await supabase
    .from('prestadoras')
    .select('id')
    .eq('estado', 'certificada');

  if (error) {
    console.error('Error consultando las Prestadoras certificadas:', error.message);
    return [];
  }

  return (data ?? []).map((fila) => fila.id).filter(Boolean);
}
