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

   CON QUÉ CREDENCIAL. Ninguna de las tres pregunta por todas las Prestadoras a la vez. La lista
   de a quiénes recorrer la da la base al trabajo sin Prestadora (`prestadoras_a_recorrer`), y cada
   una se mira después con el trabajo de esa Prestadora, que sólo ve su propia fila. */

import { paraCadaPrestadora } from '../db/connection.js';

/**
 * Las Prestadoras que cumplen `cumple`, preguntada de a una con la credencial de cada una.
 *
 * Falla cerrado: la que no se pudo mirar queda afuera, y sin la lista de a quiénes recorrer no se
 * recorre a nadie. Lo que no se hizo hoy se hace mañana, porque ningún trabajo apaga la condición
 * que elige lo que le toca.
 *
 * @param {string} trabajo
 * @param {(db: object) => Promise<boolean>} cumple
 * @returns {Promise<string[]>}
 */
async function prestadorasQue(trabajo, cumple) {
  const elegidas = [];
  await paraCadaPrestadora(trabajo, async (prestadoraId, db) => {
    if (await cumple(db, prestadoraId)) elegidas.push(prestadoraId);
  });
  return elegidas;
}

/** Si la consulta trajo alguna fila, sin error. El error se anota y cuenta como que no. */
function trajoFila(trabajo) {
  return ({ data, error }) => {
    if (error) {
      console.error(`Error consultando ${trabajo}:`, error.message);
      return false;
    }
    return (data ?? []).length > 0;
  };
}

/**
 * Las Prestadoras del Match, para sus tres trabajos diarios.
 *
 * Sale de `configuracion_cobro_intermediacion`, que tiene una fila por Prestadora. No de
 * `prestadora_modalidades`: una que apagó la modalidad puede conservar accesos que todavía hay que
 * cortar o suspender.
 *
 * @returns {Promise<string[]>}
 */
export function prestadorasDeLaIntermediacion() {
  return prestadorasQue('las Prestadoras del Match', async (db, prestadoraId) =>
    trajoFila('las Prestadoras del Match')(
      await db.from('configuracion_cobro_intermediacion').select('prestadora_id').eq('prestadora_id', prestadoraId).limit(1),
    ),
  );
}

/**
 * Las Prestadoras que tienen encendida la ausencia automática. Cuánta tolerancia tiene cada una lo
 * lee el trabajo adentro.
 *
 * @returns {Promise<string[]>}
 */
export function prestadorasConAusenciaAutomatica() {
  return prestadorasQue('las Prestadoras con la ausencia automática', async (db, prestadoraId) =>
    trajoFila('las Prestadoras con la ausencia automática')(
      await db
        .from('configuracion_ausencia_automatica')
        .select('prestadora_id')
        .eq('prestadora_id', prestadoraId)
        .eq('activo', true)
        .limit(1),
    ),
  );
}

/**
 * Las Prestadoras certificadas, para los demás trabajos de fondo.
 *
 * @returns {Promise<string[]>}
 */
export function prestadorasCertificadas() {
  return prestadorasQue('las Prestadoras certificadas', async (db, prestadoraId) =>
    trajoFila('las Prestadoras certificadas')(
      await db.from('prestadoras').select('id').eq('id', prestadoraId).eq('estado', 'certificada').limit(1),
    ),
  );
}
