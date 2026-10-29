import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { IDENTIDAD } from '../src/config/identidadProducto.js';

function requireEnv(nombre) {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`);
  return valor;
}

async function generarDump(rutaSalida) {
  const env = {
    ...process.env,
    PGHOST: requireEnv('DB_HOST'),
    PGPORT: process.env.DB_PORT || '5432',
    PGDATABASE: requireEnv('DB_NAME'),
    PGUSER: requireEnv('DB_USER'),
    PGPASSWORD: requireEnv('DB_PASSWORD'),
  };

  await new Promise((resolve, reject) => {
    const proceso = spawn('pg_dump', ['--no-owner', '--no-privileges'], { env });
    const gzip = createGzip();
    const destino = createWriteStream(rutaSalida);
    let stderr = '';
    proceso.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proceso.on('error', reject);
    pipeline(proceso.stdout, gzip, destino).then(resolve).catch(reject);
    proceso.on('close', (codigo) => {
      if (codigo !== 0) reject(new Error(`pg_dump terminó con código ${codigo}: ${stderr}`));
    });
  });
}

/**
 * Empaqueta el repositorio entero —todas las ramas, todas las etiquetas, toda la historia— en un
 * solo archivo que se restaura con `git clone <archivo>`.
 *
 * Va acá por el mismo motivo que el volcado de la base no confía en el respaldo de Supabase: el
 * código está en GitHub, pero eso es una sola copia, en una sola cuenta y en manos de un tercero.
 *
 * Exige que la copia de trabajo tenga la historia completa: con una copia de un solo commit el
 * paquete sale igual y no sirve para nada.
 */
async function generarPaqueteDelCodigo(rutaSalida) {
  await new Promise((resolve, reject) => {
    const proceso = spawn('git', ['bundle', 'create', rutaSalida, '--all'], { cwd: '..' });
    let stderr = '';
    proceso.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proceso.on('error', reject);
    proceso.on('close', (codigo) => {
      if (codigo !== 0) reject(new Error(`git bundle terminó con código ${codigo}: ${stderr}`));
      else resolve();
    });
  });
}

function clienteS3({ endpoint, accessKeyId, secretAccessKey, region }) {
  return new S3Client({
    endpoint,
    region: region || 'auto',
    credentials: { accessKeyId, secretAccessKey },
  });
}

async function subirA(cliente, bucket, nombreArchivo, rutaLocal) {
  await cliente.send(new PutObjectCommand({
    Bucket: bucket,
    Key: nombreArchivo,
    Body: createReadStream(rutaLocal),
  }));
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  // Se nombra por el código técnico del producto, no por su nombre comercial: si mañana la
  // marca cambia, los backups viejos y los nuevos tienen que seguir compartiendo prefijo.
  const nombreArchivo = `${IDENTIDAD.codigo}_backup_${timestamp}.sql.gz`;
  const rutaTemporal = `/tmp/${nombreArchivo}`;

  console.log('Generando dump de la base de datos...');
  await generarDump(rutaTemporal);

  const r2 = clienteS3({
    endpoint: requireEnv('R2_ENDPOINT'),
    accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
  });
  console.log('Subiendo a Cloudflare R2 (principal)...');
  await subirA(r2, requireEnv('R2_BUCKET'), nombreArchivo, rutaTemporal);

  const b2 = clienteS3({
    endpoint: `https://${requireEnv('B2_ENDPOINT')}`,
    accessKeyId: requireEnv('B2_KEY_ID'),
    secretAccessKey: requireEnv('B2_APPLICATION_KEY'),
    region: 'us-east-005',
  });
  console.log('Subiendo a Backblaze B2 (espejo)...');
  await subirA(b2, requireEnv('B2_BUCKET'), nombreArchivo, rutaTemporal);

  await unlink(rutaTemporal);
  console.log(`Volcado de la base: ${nombreArchivo} subido a los dos buckets.`);

  // Los archivos de los depósitos no se copian acá: los copia el backend cada noche, con una
  // credencial que sólo los lee (`src/utils/copiaDeLosArchivos.js`).

  // Y después el código. Va segundo porque tiene otra copia viva en otro lado; si algo se cae, lo
  // que no se puede perder ya está arriba.
  console.log('Empaquetando el código...');
  const nombrePaquete = `${IDENTIDAD.codigo}_codigo_${timestamp}.bundle`;
  const rutaPaquete = `/tmp/${nombrePaquete}`;
  await generarPaqueteDelCodigo(rutaPaquete);
  await subirA(r2, requireEnv('R2_BUCKET'), nombrePaquete, rutaPaquete);
  await subirA(b2, requireEnv('B2_BUCKET'), nombrePaquete, rutaPaquete);
  await unlink(rutaPaquete);
  console.log(`Código: ${nombrePaquete} subido a los dos buckets.`);
  console.log('Respaldo completo: la base y el código.');
}

main().catch((error) => {
  console.error('Error en el backup:', error);
  process.exit(1);
});
