/* Las frases que siembran las migraciones, leídas de los archivos de las migraciones.
   ==================================================================================

   POR QUÉ SE LEEN DE AHÍ Y NO DE LA BASE. Las pruebas del backend corren sin base levantada. Si
   estas pruebas se armaran con frases escritas acá adentro, comprobarían que el archivo de pruebas
   está de acuerdo consigo mismo y nada más: una prueba que no puede fallar no prueba nada
   (`celtatech\CLAUDE.md` §12). Leyendo la siembra de verdad, una clave que el código pide y que
   ninguna migración sembró rompe acá.

   LA FORMA DE LA FILA ES EL CONTRATO: ('clave', true|false, '{...}'), con el texto en un solo
   renglón. La clave y el texto pueden ir en renglones distintos. Una fila con otra forma deja de
   contarse, y por eso las pruebas comprueban que la cuenta no se caiga.

   Cada migración que siembra frases nuevas se suma a la lista de abajo. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MIGRACIONES_CON_FRASES = [
  '20261002180000_los_mensajes_del_sistema_se_editan_desde_afuera.sql',
  '20261013000000_la_ausencia_tiene_fecha_prevista_y_vuelta.sql',
];

export const RUTAS_DE_LAS_MIGRACIONES = MIGRACIONES_CON_FRASES.map((archivo) => fileURLToPath(
  new URL(`../../../../supabase/migrations/${archivo}`, import.meta.url)
));

const FILA = /^\s*\('([a-z_.]+)',\s*(true|false),\s*'(\{.*\})'\),?\r?$/gm;

// El renombre de las palabras retiradas cambió claves ya sembradas: se aplica encima de la siembra.
const RENOMBRE = fileURLToPath(new URL(
  '../../../../supabase/migrations/20261015000000_renombre_palabras_retiradas.sql', import.meta.url
));
const CLAVE_RENOMBRADA = /^update public\.mensajes_del_sistema set clave = \$r\$([^$]+)\$r\$::text where clave = \$r\$([^$]+)\$r\$::text;\r?$/gm;

function clavesRenombradas() {
  const nuevas = new Map();
  for (const [, nueva, vieja] of readFileSync(RENOMBRE, 'utf8').matchAll(CLAVE_RENOMBRADA)) nuevas.set(vieja, nueva);
  return nuevas;
}

/** Las filas sembradas por las migraciones, en la forma en que las devuelve la base. */
export function filasSembradas() {
  const renombradas = clavesRenombradas();
  const filas = [];
  for (const ruta of RUTAS_DE_LAS_MIGRACIONES) {
    // Se juntan en un renglón la clave y el texto que la migración escribió en dos.
    const sql = readFileSync(ruta, 'utf8').replace(/,\s*(true|false),\r?\n\s*'/g, ", $1, '");
    for (const [, clave, admite, json] of sql.matchAll(FILA)) {
      filas.push({
        clave: renombradas.get(clave) ?? clave,
        prestadora_id: null,
        activo: true,
        admite_texto_propio: admite === 'true',
        // En SQL una comilla simple adentro de un texto se escribe dos veces.
        i18n: JSON.parse(json.replace(/''/g, "'")),
      });
    }
  }
  return filas;
}
