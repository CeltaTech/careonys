// ---------------------------------------------------------------------------
// verificar_regla_de_usuario.mjs — que la regla del nombre de usuario sea una sola
//
// Uso, desde la raíz del repo:
//   node scripts/verificar_regla_de_usuario.mjs
//
// La regla vive en `backend/src/config/reglaDeUsuario.js`, y de ahí la toman el backend y las dos
// aplicaciones. Pero la base exige la suya en `interno.usuario_elegido_bien_escrito`, escrita en
// SQL, que no puede importar nada. Las dos tienen que decir lo mismo, y esto falla si se despegan.
//
// De la base se lee la última migración que define la función, que es la que quedó vigente: acá
// no hay base a la que preguntarle, y la construcción no puede esperar a una.
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRACIONES = join(RAIZ, 'supabase', 'migrations');

const { USUARIO_MINIMO, USUARIO_MAXIMO, usuarioBienEscrito } = await import(
  new URL('../backend/src/config/reglaDeUsuario.js', import.meta.url)
);

const fallas = [];

// 1. La última definición de la función en la base.
const DEFINICION = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+interno\.usuario_elegido_bien_escrito\s*\([\s\S]*?\$(\w*)\$([\s\S]*?)\$\1\$/gi;
let vigente = null;
for (const archivo of readdirSync(MIGRACIONES).filter((a) => a.endsWith('.sql')).sort()) {
  const texto = readFileSync(join(MIGRACIONES, archivo), 'utf8');
  for (const m of texto.matchAll(DEFINICION)) vigente = { archivo, cuerpo: m[2] };
}

if (!vigente) {
  fallas.push('Ninguna migración define interno.usuario_elegido_bien_escrito.');
} else {
  const patron = vigente.cuerpo.match(/~\s*'([^']+)'/);
  if (!patron) {
    fallas.push(`${vigente.archivo}: no se encontró la expresión que compara el nombre.`);
  } else {
    const esperado = `^[a-z0-9._-]{${USUARIO_MINIMO},${USUARIO_MAXIMO}}$`;
    if (patron[1] !== esperado) {
      fallas.push(`${vigente.archivo} exige ${patron[1]} y la regla dice ${esperado}.`);
    }
    // 2. Y la regla de las pantallas contesta lo mismo que la de la base en los bordes.
    const enLaBase = new RegExp(patron[1]);
    const casos = [
      'a'.repeat(USUARIO_MINIMO - 1), 'a'.repeat(USUARIO_MINIMO),
      'a'.repeat(USUARIO_MAXIMO), 'a'.repeat(USUARIO_MAXIMO + 1),
      'ana.lopez', 'ana_l-1', 'ana lopez', 'añoso', 'josé', 'ana@x',
    ];
    for (const caso of casos) {
      if (enLaBase.test(caso) !== usuarioBienEscrito(caso)) {
        fallas.push(`«${caso}»: la base dice ${enLaBase.test(caso)} y las pantallas ${usuarioBienEscrito(caso)}.`);
      }
    }
  }
}

if (fallas.length) {
  console.error('La regla del nombre de usuario no es una sola:');
  for (const f of fallas) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`La regla del nombre de usuario es una sola: entre ${USUARIO_MINIMO} y ${USUARIO_MAXIMO} caracteres.`);
