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
// clave = '<clave>'` y renombran en la forma `SET clave = replace(clave, '<de>', '<a>') WHERE clave IN
// ('<clave>', …)`. Se leen en orden, igual que las corre la base.
const MIGRACIONES_POSTERIORES = [
  '20270326000000_alarma_de_las_cuentas_automaticas.sql',
  '20270401000800_la_frase_antes_del_enlace.sql',
  '20270401001200_los_avisos_de_llegada_y_de_reporte.sql',
  '20270402000200_el_mensaje_del_cierre_del_servicio_cambia_de_nombre.sql',
  '20270415000000_turno_de_guardia.sql',
  '20270417000000_cronograma_de_guardias_y_turnos_sin_cubrir.sql',
  '20270422000000_veto_de_decisiones.sql',
  '20270428000000_recordatorio_del_reporte_diario.sql',
  '20270429000000_salida_sin_reporte_diario.sql',
  '20270430000000_turno_sin_reporte_diario_se_factura.sql',
  '20270502000000_el_reporte_diario_se_llama_reporte.sql',
  '20270503000000_los_nombres_guardados_dicen_reporte.sql',
  '20270504000000_no_olvide_enviar_el_reporte.sql',
  '20270505000000_el_reporte_pendiente_dice_la_fecha.sql',
  '20270506000000_el_reporte_pendiente_en_voz_activa.sql',
];

const SIEMBRA = /\('([^']+)',\s*'(\{.*?\})'::jsonb(?:,\s*(true|false),\s*(true|false))?\)/g;
// La otra forma de sembrar: `(NULL, '<clave>', '<json>')`, con la Prestadora delante y sin el tipo.
const SIEMBRA_CON_PRESTADORA = /\(NULL,\s*'([^']+)',\s*'(\{[^\n]*?\})'\)/g;
const BORRADO = /DELETE FROM public\.mensajes_del_sistema\s+WHERE prestadora_id IS NULL AND clave = '([^']+)'/g;
const RENOMBRE = /SET clave = replace\(clave, '([^']+)', '([^']+)'\)\s+WHERE clave IN \(([^)]*)\)/g;
// Renombre por pares: `UPDATE public.mensajes_del_sistema x SET clave = m.nuevo FROM (VALUES ('<de>', '<a>'), …)
// m(viejo, nuevo)`.
const RENOMBRE_POR_PARES = /UPDATE public\.mensajes_del_sistema x SET clave = m\.nuevo FROM \(VALUES([\s\S]*?)\)\s*m\(viejo, nuevo\)/g;
// Un marcador que cambia de nombre en todas las frases: `SET i18n = replace(i18n::text, '<de>', '<a>')::jsonb`.
const MARCADOR = /UPDATE public\.mensajes_del_sistema SET i18n = replace\(i18n::text, '([^']+)', '([^']+)'\)::jsonb/g;
// Una frase de fábrica que se reescribe en un idioma: `SET i18n = jsonb_set(i18n, '{<idioma>}',
// to_jsonb('<frase>'::text)) WHERE prestadora_id IS NULL AND clave = '<clave>'`, con la frase anterior
// como condición si la dice (`AND i18n->>'<idioma>' = '<frase anterior>'`).
const FRASE = /UPDATE public\.mensajes_del_sistema SET i18n = jsonb_set\(i18n, '\{([^}]+)\}', to_jsonb\('((?:[^']|'')*)'::text\)\) WHERE prestadora_id IS NULL AND clave = '([^']+)'(?: AND i18n->>'[^']+' = '((?:[^']|'')*)')?/g;
// Una frase que se reescribe entera, en los tres idiomas a la vez: `SET i18n = '<json>'::jsonb WHERE
// clave = '<clave>'`, con la frase anterior como condición si la dice (`AND i18n = '<json>'::jsonb`).
const REESCRITA = /UPDATE public\.mensajes_del_sistema\s+SET i18n = '(\{[^\n]*?\})'::jsonb\s+WHERE clave = '([^']+)'(?:\s+AND i18n = '(\{[^\n]*?\})'::jsonb)?/g;
const sinComillasDobles = (texto) => texto.replace(/''/g, "'");

/** Lo que hace cada migración posterior, en orden: `{ clave, fila }` siembra, `{ clave }` borra y
    `{ clave, nueva }` renombra. */
function cambiosPosteriores() {
  return MIGRACIONES_POSTERIORES.flatMap((archivo) => {
    const texto = readFileSync(new URL(`../../../../supabase/migrations/${archivo}`, import.meta.url), 'utf8');
    const cambios = [
      ...[...texto.matchAll(BORRADO)].map((m) => ({ donde: m.index, clave: m[1] })),
      ...[...texto.matchAll(RENOMBRE)].flatMap((m) => [...m[3].matchAll(/'([^']+)'/g)].map(([, clave]) => ({
        donde: m.index,
        clave,
        nueva: clave.replace(m[1], m[2]),
      }))),
      ...[...texto.matchAll(RENOMBRE_POR_PARES)].flatMap((m) =>
        [...m[1].matchAll(/\('([^']+)',\s*'([^']+)'\)/g)].map(([, clave, nueva]) => ({ donde: m.index, clave, nueva }))),
      ...[...texto.matchAll(MARCADOR)].map((m) => ({ donde: m.index, marcador: { de: m[1], a: m[2] } })),
      ...[...texto.matchAll(FRASE)].map((m) => ({
        donde: m.index,
        clave: m[3],
        frase: { idioma: m[1], texto: sinComillasDobles(m[2]), antes: m[4] === undefined ? null : sinComillasDobles(m[4]) },
      })),
      ...[...texto.matchAll(REESCRITA)].map((m) => ({
        donde: m.index,
        clave: m[2],
        reescrita: {
          i18n: JSON.parse(sinComillasDobles(m[1])),
          antes: m[3] === undefined ? null : JSON.parse(sinComillasDobles(m[3])),
        },
      })),
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
      ...[...texto.matchAll(SIEMBRA_CON_PRESTADORA)].map((m) => ({
        donde: m.index,
        clave: m[1],
        fila: { clave: m[1], prestadora_id: null, activo: true, admite_texto_propio: true, i18n: JSON.parse(m[2]) },
      })),
    ];
    return cambios.sort((a, b) => a.donde - b.donde);
  });
}

// Dos frases en sus idiomas son iguales si dicen lo mismo en cada idioma, como compara la base un
// jsonb: el orden de los idiomas no cuenta.
function mismaFrase(a, b) {
  const idiomas = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  return [...idiomas].every((idioma) => a?.[idioma] === b?.[idioma]);
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
    if (cambio.marcador) {
      for (const [clave, fila] of porClave) {
        const i18n = JSON.parse(JSON.stringify(fila.i18n).split(cambio.marcador.de).join(cambio.marcador.a));
        porClave.set(clave, { ...fila, i18n });
      }
    } else if (cambio.frase) {
      const fila = porClave.get(cambio.clave);
      const { idioma, texto, antes } = cambio.frase;
      if (fila && (antes === null || fila.i18n?.[idioma] === antes)) {
        porClave.set(cambio.clave, { ...fila, i18n: { ...fila.i18n, [idioma]: texto } });
      }
    } else if (cambio.reescrita) {
      const fila = porClave.get(cambio.clave);
      const { i18n, antes } = cambio.reescrita;
      if (fila && (antes === null || mismaFrase(fila.i18n, antes))) {
        porClave.set(cambio.clave, { ...fila, i18n });
      }
    } else if (cambio.fila) porClave.set(cambio.clave, cambio.fila);
    else if (cambio.nueva) {
      const fila = porClave.get(cambio.clave);
      porClave.delete(cambio.clave);
      if (fila) porClave.set(cambio.nueva, { ...fila, clave: cambio.nueva });
    } else porClave.delete(cambio.clave);
  }
  return [...porClave.values()];
}
