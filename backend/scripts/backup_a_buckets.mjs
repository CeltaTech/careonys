/* El respaldo diario del código, a los dos depósitos de respaldo.
   ================================================================

   Empaqueta el repositorio entero —todas las ramas, todas las etiquetas, toda la historia— en un
   solo archivo que se restaura con `git clone <archivo>`. El código está en GitHub, pero eso es
   una sola copia, en una sola cuenta y en manos de un tercero.

   Los datos y los archivos de las Prestadoras no se respaldan acá: los respalda el backend cada
   noche, de a una Prestadora y cifrados con la clave de cada una (`src/utils/respaldoDeLosDatos.js`
   y `src/utils/copiaDeLosArchivos.js`). No hay ninguna cuenta que copie la base entera.

   Exige que la copia de trabajo tenga la historia completa: con una copia de un solo commit el
   paquete sale igual y no sirve para nada. */

import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { IDENTIDAD } from '../src/config/identidadProducto.js';

function requireEnv(nombre) {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`);
  return valor;
}

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
  // marca cambia, los respaldos viejos y los nuevos tienen que seguir compartiendo prefijo.
  const nombrePaquete = `${IDENTIDAD.codigo}_codigo_${timestamp}.bundle`;
  const rutaPaquete = `/tmp/${nombrePaquete}`;

  const r2 = clienteS3({
    endpoint: requireEnv('R2_ENDPOINT'),
    accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
  });
  const b2 = clienteS3({
    endpoint: `https://${requireEnv('B2_ENDPOINT')}`,
    accessKeyId: requireEnv('B2_KEY_ID'),
    secretAccessKey: requireEnv('B2_APPLICATION_KEY'),
    region: 'us-east-005',
  });

  console.log('Empaquetando el código...');
  await generarPaqueteDelCodigo(rutaPaquete);
  await subirA(r2, requireEnv('R2_BUCKET'), nombrePaquete, rutaPaquete);
  await subirA(b2, requireEnv('B2_BUCKET'), nombrePaquete, rutaPaquete);
  await unlink(rutaPaquete);
  console.log(`Código: ${nombrePaquete} subido a los dos depósitos.`);
}

main().catch((error) => {
  console.error('Error en el respaldo del código:', error);
  process.exit(1);
});
