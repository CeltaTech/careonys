/* La copia nocturna de los archivos, a los dos depósitos de respaldo.
   ====================================================================

   POR QUÉ CORRE ACÁ Y NO CON EL RESPALDO DE GITHUB. El volcado de la base y el paquete del código
   se arman en GitHub (`scripts/backup_a_buckets.mjs`). Los archivos se bajaban desde ahí también,
   y para eso GitHub guardaba la llave maestra, que alcanza todo. Ahora los baja el backend con la
   credencial de la copia de respaldo (`db/connection.js`), que sólo ve los depósitos y lee lo que
   tienen: no toca ninguna tabla, no escribe y no borra. Esa credencial la firma el backend en el
   momento y no la guarda nadie más.

   QUÉ SE COPIA Y CÓMO lo decide `copiaDeDepositos.js`, que es el mismo de antes: sólo lo que falta
   o cambió, y en el registro cantidades, nunca rutas. */

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { conexionDeLaCopiaDeRespaldo } from '../db/connection.js';
import { lasRegiones } from '../db/regiones.js';
import { copiarDepositos, depositosDeSupabase } from './copiaDeDepositos.js';

function requireEnv(nombre) {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`);
  return valor;
}

function clienteS3({ endpoint, accessKeyId, secretAccessKey, region }) {
  return new S3Client({
    endpoint,
    region: region || 'auto',
    credentials: { accessKeyId, secretAccessKey },
  });
}

/**
 * Un destino de la copia de archivos, sobre un depósito compatible con S3.
 *
 * `yaEstaIgual` compara tamaño y fecha de modificación contra lo que se guardó al subir. Sin esa
 * comparación el respaldo volvería a subir todos los archivos todas las noches, y eso crece
 * hasta que una noche no termina.
 */
export function destinoS3(cliente, bucket) {
  return {
    async yaEstaIgual(clave, archivo) {
      try {
        const actual = await cliente.send(new HeadObjectCommand({ Bucket: bucket, Key: clave }));
        if (archivo.tamano != null && actual.ContentLength !== archivo.tamano) return false;
        if (archivo.actualizado && actual.Metadata?.actualizado !== archivo.actualizado) return false;
        return true;
      } catch {
        return false;
      }
    },
    async subir(clave, cuerpo, archivo) {
      await cliente.send(new PutObjectCommand({
        Bucket: bucket,
        Key: clave,
        Body: cuerpo,
        Metadata: archivo.actualizado ? { actualizado: archivo.actualizado } : undefined,
      }));
    },
  };
}

/** Los dos destinos: Cloudflare R2, el principal, y Backblaze B2, el espejo. */
function losDestinos() {
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
  return [destinoS3(r2, requireEnv('R2_BUCKET')), destinoS3(b2, requireEnv('B2_BUCKET'))];
}

/**
 * Copia los archivos de todas las regiones a los dos depósitos de respaldo. Falla —y lo dice en el
 * registro— si algún archivo no se pudo copiar, después de haber intentado con todos.
 */
export async function copiarLosArchivosAlRespaldo({ destinos = losDestinos(), avisar = (t) => console.log(t) } = {}) {
  const total = { depositos: 0, copiados: 0, yaEstaban: 0, fallados: 0 };
  for (const region of lasRegiones()) {
    const cuenta = await copiarDepositos({
      almacenamiento: depositosDeSupabase(conexionDeLaCopiaDeRespaldo(region)),
      destinos,
      avisar,
    });
    for (const campo of Object.keys(total)) total[campo] += cuenta[campo];
  }
  avisar(
    `Archivos: ${total.depositos} depósitos, ${total.copiados} copiados, `
    + `${total.yaEstaban} ya estaban, ${total.fallados} fallados.`,
  );
  if (total.fallados > 0) throw new Error(`${total.fallados} archivos no se pudieron copiar.`);
  return total;
}
