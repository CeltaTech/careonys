/* Las frases que siembra la base, leídas de la foto de la base.
   ============================================================

   POR QUÉ SE LEEN DE AHÍ Y NO DE LA BASE. Las pruebas del backend corren sin base levantada. Si
   estas pruebas se armaran con frases escritas acá adentro, comprobarían que el archivo de pruebas
   está de acuerdo consigo mismo y nada más: una prueba que no puede fallar no prueba nada
   (`celtatech\CLAUDE.md` §12). Leyendo la siembra de verdad, una clave que el código pide y que
   la base no trae rompe acá.

   La forma de la siembra la lee `src/__tests__/laFotoDeLaBase.js`. Una migración posterior que
   siembre frases nuevas se suma acá. */

import { readFileSync } from 'node:fs';
import { filasDeFabrica } from '../../__tests__/laFotoDeLaBase.js';

// Las migraciones posteriores a la foto que siembran una frase, en la forma
// `values ('<clave>', '<json>'::jsonb)`.
const MIGRACIONES_POSTERIORES = [
  '20261107000000_codigo_de_prestadora_en_la_activacion.sql',
  '20261118000000_los_turnos_se_asignan.sql',
];

function filasPosteriores() {
  return MIGRACIONES_POSTERIORES.flatMap((archivo) => {
    const texto = readFileSync(new URL(`../../../../supabase/migrations/${archivo}`, import.meta.url), 'utf8');
    return [...texto.matchAll(/\('([^']+)',\s*'(\{.*?\})'::jsonb\)/g)].map(([, clave, i18n]) => ({
      clave,
      prestadora_id: null,
      activo: true,
      admite_texto_propio: true,
      i18n: JSON.parse(i18n),
    }));
  });
}

/** Las filas sembradas de fábrica, en la forma en que las devuelve la base. */
export function filasSembradas() {
  return [
    ...filasDeFabrica('mensajes_del_sistema')
      .filter((fila) => fila.prestadora_id === null)
      .map(({ clave, prestadora_id, activo, admite_texto_propio, i18n }) => ({
        clave,
        prestadora_id,
        activo,
        admite_texto_propio,
        i18n,
      })),
    ...filasPosteriores(),
  ];
}
