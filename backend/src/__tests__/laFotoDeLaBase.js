/* Lo que dice la foto de la base, leído del archivo de la migración.
   ================================================================

   Las pruebas del backend corren sin base levantada. Para comprobar que lo que el backend espera es
   lo que la base de verdad tiene, se lee la foto —la migración que arma la base entera— y no una
   copia escrita acá adentro, que sólo estaría de acuerdo consigo misma.

   LA FORMA ES EL CONTRATO. Las filas de fábrica van como un arreglo JSON entre
   `jsonb_populate_recordset(NULL::"public"."<tabla>", $datos$[` y `]$datos$`. Las funciones van
   como las escribe `supabase migration squash`: desde `CREATE OR REPLACE FUNCTION "<esquema>"."<nombre>"(`
   hasta el `$$;` que las cierra, con los nombres entre comillas. Las lecturas de estructura le sacan
   esas comillas a los renglones que no son cuerpo de función ni filas, para que las pruebas lean
   `interno.puede_habilitar(` y `TO anon;` como se escriben a mano. Si la forma cambia, estas
   lecturas devuelven nada y las pruebas que las usan lo dicen. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const RUTA_DE_LA_FOTO = fileURLToPath(new URL(
  '../../../supabase/migrations/20270323000000_foto_de_la_base.sql', import.meta.url
));

let crudo;
let texto;

/** El archivo tal cual. */
function elArchivo() {
  // Los renglones se leen terminados en `\n` aunque el archivo llegue con `\r\n`: Git en Windows
  // convierte los finales de línea al sacar una copia nueva del repositorio, y con `\r` el `$$;`
  // que cierra cada función y el `;` al final de cada renglón dejaban de encontrarse.
  crudo ??= readFileSync(RUTA_DE_LA_FOTO, 'utf8').replace(/\r\n/g, '\n');
  return crudo;
}

/** El texto entero de la foto, con los nombres sin comillas fuera de los cuerpos y de las filas. */
export function laFoto() {
  if (texto !== undefined) return texto;
  let enCuerpo = false;
  let enFilas = false;
  texto = elArchivo()
    .split('\n')
    .map((renglon) => {
      const quedaComoEsta = enCuerpo || enFilas;
      if (!quedaComoEsta && /\bAS \$\$/.test(renglon) && !/\$\$;\s*$/.test(renglon)) enCuerpo = true;
      else if (enCuerpo && renglon.startsWith('$$;')) enCuerpo = false;
      const delimitadores = (renglon.match(/\$datos\$/g) ?? []).length;
      if (delimitadores % 2 === 1) enFilas = !enFilas;
      if (quedaComoEsta || delimitadores > 0) return renglon;
      return renglon
        .replace(/^CREATE OR REPLACE FUNCTION /, 'CREATE FUNCTION ')
        .replace(/"([a-z_][a-z0-9_]*)"/g, '$1');
    })
    .join('\n');
  return texto;
}

/** Las filas que la foto siembra de fábrica en una tabla de `public`, tal como las devuelve la base. */
export function filasDeFabrica(tabla) {
  const inicio = `jsonb_populate_recordset(NULL::"public"."${tabla}", $datos$[`;
  const desde = elArchivo().indexOf(inicio);
  if (desde === -1) return [];
  const hasta = elArchivo().indexOf(']$datos$', desde);
  return JSON.parse(elArchivo().slice(desde + inicio.length - 1, hasta + 1));
}

/** La definición de una función, con su encabezado y su cuerpo. `nombre` va con su esquema. */
export function definicionDeFuncion(nombre) {
  const desde = laFoto().indexOf(`\nCREATE FUNCTION ${nombre}(`);
  if (desde === -1) return '';
  const hasta = laFoto().indexOf('\n$$;\n', desde);
  return laFoto().slice(desde + 1, hasta + 4);
}

/** Los permisos que la foto le da y le quita a una función. `nombre` va con su esquema. */
export function permisosDeFuncion(nombre) {
  return laFoto()
    .split('\n')
    .filter((renglon) => /^(GRANT|REVOKE) /.test(renglon) && renglon.includes(` FUNCTION ${nombre}(`));
}
