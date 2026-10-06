/* Las frases que siembra la base, leídas de la foto de la base.
   ============================================================

   POR QUÉ SE LEEN DE AHÍ Y NO DE LA BASE. Las pruebas del backend corren sin base levantada. Si
   estas pruebas se armaran con frases escritas acá adentro, comprobarían que el archivo de pruebas
   está de acuerdo consigo mismo y nada más: una prueba que no puede fallar no prueba nada
   (`celtatech\CLAUDE.md` §12). Leyendo la siembra de verdad, una clave que el código pide y que
   la base no trae rompe acá.

   La forma de la siembra la lee `src/__tests__/laFotoDeLaBase.js`. Una migración posterior que
   siembre frases nuevas se suma acá. */

import { filasDeFabrica } from '../../__tests__/laFotoDeLaBase.js';

/** Las filas sembradas de fábrica, en la forma en que las devuelve la base. */
export function filasSembradas() {
  return filasDeFabrica('mensajes_del_sistema')
    .filter((fila) => fila.prestadora_id === null)
    .map(({ clave, prestadora_id, activo, admite_texto_propio, i18n }) => ({
      clave,
      prestadora_id,
      activo,
      admite_texto_propio,
      i18n,
    }));
}
