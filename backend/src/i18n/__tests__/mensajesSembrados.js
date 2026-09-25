/* Las frases que siembra la migración, leídas del archivo de la migración.
   ========================================================================

   POR QUÉ SE LEEN DE AHÍ Y NO DE LA BASE. Las pruebas del backend corren sin base levantada. Si
   estas pruebas se armaran con frases escritas acá adentro, comprobarían que el archivo de pruebas
   está de acuerdo consigo mismo y nada más: una prueba que no puede fallar no prueba nada
   (`celtatech\CLAUDE.md` §12). Leyendo la siembra de verdad, una clave que el código pide y que la
   migración nunca sembró rompe acá.

   LA FORMA DEL RENGLÓN ES EL CONTRATO. La migración escribe cada fila en un renglón, con la forma
   ('clave', true|false, '{...}'), y así lo dice arriba del bloque. Un renglón partido en dos deja
   de contarse, y por eso más abajo se comprueba que la cuenta no se caiga. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const RUTA_DE_LA_MIGRACION = fileURLToPath(
  new URL(
    '../../../../supabase/migrations/20261002180000_los_mensajes_del_sistema_se_editan_desde_afuera.sql',
    import.meta.url
  )
);

const RENGLON = /^\s*\('([a-z_.]+)',\s*(true|false),\s*'(\{.*\})'\),?$/;

/** Las filas sembradas por la migración, en la forma en que las devuelve la base. */
export function filasSembradas() {
  const sql = readFileSync(RUTA_DE_LA_MIGRACION, 'utf8');
  const filas = [];
  for (const renglon of sql.split(/\r?\n/)) {
    const partes = RENGLON.exec(renglon);
    if (!partes) continue;
    const [, clave, admite, json] = partes;
    filas.push({
      clave,
      prestadora_id: null,
      activo: true,
      admite_texto_propio: admite === 'true',
      // En SQL una comilla simple adentro de un texto se escribe dos veces. Ningún texto del
      // catálogo lleva dos comillas seguidas, así que deshacerlo no tiene vuelta de hoja.
      i18n: JSON.parse(json.replace(/''/g, "'")),
    });
  }
  return filas;
}
