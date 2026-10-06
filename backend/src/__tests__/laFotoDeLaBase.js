/* Lo que dice la foto de la base, leído del archivo de la migración.
   ================================================================

   Las pruebas del backend corren sin base levantada. Para comprobar que lo que el backend espera es
   lo que la base de verdad tiene, se lee la foto —la migración que arma la base entera— y no una
   copia escrita acá adentro, que sólo estaría de acuerdo consigo misma.

   LA FORMA ES EL CONTRATO. Las filas de fábrica van como un arreglo JSON, una fila por renglón,
   entre `jsonb_populate_recordset(NULL::public.<tabla>, $fila$[` y `]$fila$`. Las funciones van
   como las escribe pg_dump: desde `CREATE FUNCTION <nombre>(` hasta el `$$;` que las cierra. Si la
   forma cambia, estas lecturas devuelven nada y las pruebas que las usan lo dicen. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const RUTA_DE_LA_FOTO = fileURLToPath(new URL(
  '../../../supabase/migrations/20261016000000_foto_de_la_base.sql', import.meta.url
));

let texto;

/** El texto entero de la foto. */
export function laFoto() {
  texto ??= readFileSync(RUTA_DE_LA_FOTO, 'utf8');
  return texto;
}

/** Las filas que la foto siembra de fábrica en una tabla de `public`, tal como las devuelve la base. */
export function filasDeFabrica(tabla) {
  const inicio = `jsonb_populate_recordset(NULL::public.${tabla}, $fila$[`;
  const desde = laFoto().indexOf(inicio);
  if (desde === -1) return [];
  const hasta = laFoto().indexOf(']$fila$', desde);
  return JSON.parse(laFoto().slice(desde + inicio.length - 1, hasta + 1));
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
