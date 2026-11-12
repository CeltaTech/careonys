/**
 * Abre un respaldo de una Prestadora con su clave privada, y lo revisa.
 *
 * LO CORRE EL DESARROLLADOR, Y ESO NO ES UN OLVIDO. La clave privada de cada Prestadora vive en la
 * caja fuerte, que no se abre (`celtatech/CLAUDE.md`, sección 6). El programa lee la clave de un
 * archivo y nunca la imprime; tampoco se la pasa por la línea de comandos, para que no quede en
 * el historial de la consola.
 *
 * DOS USOS.
 *
 *   Los datos, el respaldo más nuevo de una Prestadora, bajado del depósito principal (R2) con las
 *   variables R2_* del respaldo cargadas en el entorno:
 *
 *     node scripts/abrir_respaldo.mjs --prestadora <id> --clave <archivo de la clave>
 *
 *   O un archivo ya bajado a mano, de R2 o de B2:
 *
 *     node scripts/abrir_respaldo.mjs --prestadora <id> --clave <archivo de la clave> --archivo <respaldo .json.gz.age>
 *
 *   Revisa que sea de esa Prestadora, que no traiga ninguna fila de otra y que traiga filas, y
 *   muestra cuántas filas hay por tabla. Con `--salida <archivo.json>` además deja el contenido
 *   abierto en ese archivo, que es lo que se usa para restaurar.
 *
 *   Un archivo de la copia de los archivos (`archivos/...`), que también sube cifrado:
 *
 *     node scripts/abrir_respaldo.mjs --clave <archivo de la clave> --archivo <archivo bajado> --salida <archivo abierto>
 *
 * El archivo de la clave puede tener las claves de varias Prestadoras: se prueban todas, y abre
 * sólo la que corresponde.
 *
 * NO IMPRIME NINGÚN DATO DE NADIE. Nombres de tabla y cantidades. Nunca una fila ni una clave.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { Decrypter } from 'age-encryption';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { elegirElUltimoRespaldo, revisarElRespaldo } from '../src/utils/comprobacionDeRestauracion.js';

const CLAVE_PRIVADA = /AGE-SECRET-KEY-1[0-9A-Z]+/g;
const PRESTADORA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function opciones(argumentos) {
  const salida = {};
  for (let i = 0; i < argumentos.length; i += 2) {
    const nombre = argumentos[i];
    if (!nombre.startsWith('--') || argumentos[i + 1] === undefined) throw new Error(`Opción mal escrita: ${nombre}`);
    salida[nombre.slice(2)] = argumentos[i + 1];
  }
  return salida;
}

function requireEnv(nombre) {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`);
  return valor;
}

async function bajarElUltimo(prestadora) {
  const cliente = new S3Client({
    endpoint: requireEnv('R2_ENDPOINT'),
    region: 'auto',
    credentials: { accessKeyId: requireEnv('R2_ACCESS_KEY_ID'), secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY') },
  });
  const bucket = requireEnv('R2_BUCKET');
  const claves = [];
  let siguiente;
  do {
    const r = await cliente.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `datos/${prestadora}/`, ContinuationToken: siguiente }));
    for (const o of r.Contents ?? []) claves.push(o.Key);
    siguiente = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (siguiente);
  const clave = elegirElUltimoRespaldo(claves);
  const objeto = await cliente.send(new GetObjectCommand({ Bucket: bucket, Key: clave }));
  console.log(`Respaldo: ${clave.slice(clave.lastIndexOf('/') + 1)}`);
  return Buffer.from(await objeto.Body.transformToByteArray());
}

async function main() {
  const o = opciones(process.argv.slice(2));
  if (!o.clave) throw new Error('Falta --clave, con el archivo que guarda la clave privada.');
  if (o.prestadora && !PRESTADORA.test(o.prestadora)) throw new Error('--prestadora no es un identificador de Prestadora.');
  if (!o.prestadora && !(o.archivo && o.salida)) {
    throw new Error('Para los datos, falta --prestadora. Para un archivo de la copia, faltan --archivo y --salida.');
  }

  const privadas = (await readFile(o.clave, 'utf8')).match(CLAVE_PRIVADA) ?? [];
  if (privadas.length === 0) throw new Error('El archivo de la clave no tiene ninguna clave privada.');
  const descifrador = new Decrypter();
  for (const privada of privadas) descifrador.addIdentity(privada);

  const cifrado = o.archivo ? await readFile(o.archivo) : await bajarElUltimo(o.prestadora);
  let abierto;
  try {
    abierto = Buffer.from(await descifrador.decrypt(new Uint8Array(cifrado)));
  } catch {
    throw new Error('No se pudo abrir: el archivo no está cifrado con ninguna de esas claves, o está dañado.');
  }

  if (!o.prestadora) {
    await writeFile(o.salida, abierto);
    console.log(`Archivo abierto: ${abierto.length} bytes.`);
    return;
  }

  const texto = gunzipSync(abierto).toString('utf8');
  const { estado, motivos, filasPorTabla } = revisarElRespaldo(JSON.parse(texto), o.prestadora);
  for (const [tabla, filas] of Object.entries(filasPorTabla).sort()) console.log(`  ${tabla}: ${filas}`);
  console.log(`\nResultado: ${estado}`);
  for (const motivo of motivos) console.log(`  ${motivo}`);
  if (o.salida) {
    await writeFile(o.salida, texto);
    console.log(`Contenido abierto en ${o.salida}`);
  }
  if (estado !== 'bien') process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
