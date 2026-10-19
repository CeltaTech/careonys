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

// Las migraciones posteriores a la foto que siembran o borran una frase. Siembran en la forma
// `('<clave>', '<json>'::jsonb)` —con `admite_texto_propio` y `activo` detrás, si los dicen— y
// borran en la forma `DELETE FROM public.mensajes_del_sistema WHERE prestadora_id IS NULL AND
// clave = '<clave>'`. Se leen en orden, igual que las corre la base.
const MIGRACIONES_POSTERIORES = [
  '20261107000000_codigo_de_prestadora_en_la_activacion.sql',
  '20261118000000_los_turnos_se_asignan.sql',
  '20261121000000_avisos_de_la_asignacion.sql',
  '20261226000000_avisos_del_turno_fijo_y_del_reemplazo.sql',
  '20270101000000_frases_aprobadas_de_la_entrevista_y_la_guardia_sin_cerrar.sql',
  '20270102000000_el_acceso_a_la_entrevista_se_habilita.sql',
  '20270109000000_el_acceso_es_por_nombre_de_usuario.sql',
];

const SIEMBRA = /\('([^']+)',\s*'(\{.*?\})'::jsonb(?:,\s*(true|false),\s*(true|false))?\)/g;
const BORRADO = /DELETE FROM public\.mensajes_del_sistema\s+WHERE prestadora_id IS NULL AND clave = '([^']+)'/g;

/** Lo que hace cada migración posterior, en orden: `{ clave, fila }` siembra, `{ clave }` borra. */
function cambiosPosteriores() {
  return MIGRACIONES_POSTERIORES.flatMap((archivo) => {
    const texto = readFileSync(new URL(`../../../../supabase/migrations/${archivo}`, import.meta.url), 'utf8');
    const cambios = [
      ...[...texto.matchAll(BORRADO)].map((m) => ({ donde: m.index, clave: m[1] })),
      ...[...texto.matchAll(SIEMBRA)].map(([, clave, i18n, admite, activo], i, todos) => ({
        donde: todos[i].index,
        clave,
        fila: {
          clave,
          prestadora_id: null,
          activo: activo !== 'false',
          admite_texto_propio: admite !== 'false',
          i18n: JSON.parse(i18n),
        },
      })),
    ];
    return cambios.sort((a, b) => a.donde - b.donde);
  });
}

/** Las filas sembradas de fábrica, en la forma en que las devuelve la base. */
export function filasSembradas() {
  // Una migración posterior puede reescribir una frase que ya estaba: la última fila de cada
  // clave es la que vale, igual que en la base.
  const porClave = new Map();
  for (const fila of [
    ...filasDeFabrica('mensajes_del_sistema')
      .filter((fila) => fila.prestadora_id === null)
      .map(({ clave, prestadora_id, activo, admite_texto_propio, i18n }) => ({
        clave,
        prestadora_id,
        activo,
        admite_texto_propio,
        i18n,
      })),
  ]) porClave.set(fila.clave, fila);
  for (const cambio of cambiosPosteriores()) {
    if (cambio.fila) porClave.set(cambio.clave, cambio.fila);
    else porClave.delete(cambio.clave);
  }
  return [...porClave.values()];
}
