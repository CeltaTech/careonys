// Ninguna tabla nace sin protección, y ningún depósito de archivos tampoco.
//
// Lee el esquema declarado (`supabase/schemas/*.sql`) y corta la publicación si alguna tabla de
// `public` no tiene la protección por fila encendida o no tiene al menos una política. Después lee
// qué depósitos de archivos crean las migraciones y corta si alguno no aparece en ninguna política
// de `storage.objects`.
//
// Es la regla «RLS estricta en toda tabla y todo depósito de archivos nuevo» de
// `celtatech/CLAUDE.md`, sección «Aislamiento entre Organizaciones», hecha cumplir antes de
// publicar. Sin dependencias: corre con Node solo.
//
// Uso: node scripts/verificar_proteccion_por_fila.mjs [carpeta del esquema] [carpeta de migraciones]
// Las dos carpetas se pueden cambiar para probar el script contra una copia rota a propósito.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CARPETA_ESQUEMA = process.argv[2] ?? join(RAIZ, 'supabase', 'schemas');
const CARPETA_MIGRACIONES = process.argv[3] ?? join(RAIZ, 'supabase', 'migrations');

function leerCarpeta(carpeta) {
  return readdirSync(carpeta)
    .filter((nombre) => nombre.endsWith('.sql'))
    .sort()
    .map((nombre) => readFileSync(join(carpeta, nombre), 'utf8').replace(/\r\n/g, '\n'))
    .join('\n');
}

// Un nombre puede venir entre comillas, como lo escribe la herramienta de Supabase, o sin ellas,
// como se escribe a mano.
const NOMBRE = '"?([a-z_][a-z0-9_]*)"?';

const esquema = leerCarpeta(CARPETA_ESQUEMA);
const migraciones = leerCarpeta(CARPETA_MIGRACIONES);

const tablas = new Set(
  [...esquema.matchAll(new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?"?public"?\\.${NOMBRE}`, 'g'))].map((m) => m[1]),
);
const conProteccion = new Set(
  [...esquema.matchAll(new RegExp(`ALTER TABLE (?:ONLY )?"?public"?\\.${NOMBRE} ENABLE ROW LEVEL SECURITY`, 'g'))].map(
    (m) => m[1],
  ),
);
const conPolitica = new Set(
  [...esquema.matchAll(new RegExp(`CREATE POLICY "[^"]+" ON "?public"?\\.${NOMBRE}`, 'g'))].map((m) => m[1]),
);

const fallas = [];
for (const tabla of [...tablas].sort()) {
  if (!conProteccion.has(tabla)) fallas.push(`La tabla public.${tabla} no tiene la protección por fila encendida.`);
  if (!conPolitica.has(tabla)) fallas.push(`La tabla public.${tabla} no tiene ninguna política.`);
}

// Los depósitos se crean como filas de `storage.buckets`: en la foto, como un arreglo JSON entre
// `$datos$`; en una migración escrita a mano, con `VALUES ('nombre', …`.
const depositos = new Set();
for (const m of migraciones.matchAll(/INSERT INTO "?storage"?\."?buckets"?[\s\S]*?\$datos\$(\[[\s\S]*?\])\$datos\$/g)) {
  for (const fila of JSON.parse(m[1])) depositos.add(fila.id);
}
for (const m of migraciones.matchAll(/INSERT INTO "?storage"?\."?buckets"?\s*\([^)]*\)\s*VALUES\s*([\s\S]*?);/g)) {
  for (const fila of m[1].matchAll(/\(\s*'([^']+)'/g)) depositos.add(fila[1]);
}

// Las políticas de `storage.objects` pueden estar en el esquema declarado o en una migración.
const politicasDeArchivos = [...`${esquema}\n${migraciones}`.matchAll(
  /CREATE POLICY "[^"]+" ON "?storage"?\."?objects"?[\s\S]*?;\n/g,
)].map((m) => m[0]);

for (const deposito of [...depositos].sort()) {
  const nombrado = politicasDeArchivos.some((p) => p.includes(`'${deposito}'`));
  if (!nombrado) fallas.push(`El depósito de archivos «${deposito}» no tiene ninguna política.`);
}

if (tablas.size === 0) fallas.push('No se encontró ninguna tabla en el esquema declarado: la lectura no sirve.');
if (depositos.size === 0) fallas.push('No se encontró ningún depósito de archivos en las migraciones: la lectura no sirve.');

if (fallas.length > 0) {
  console.error(fallas.join('\n'));
  console.error(`\n${fallas.length} falla(s). Ninguna tabla ni depósito se publica sin protección.`);
  process.exit(1);
}
console.log(`${tablas.size} tablas y ${depositos.size} depósitos de archivos, todos con protección y política.`);
