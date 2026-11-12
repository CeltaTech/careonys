/* La copia nocturna de los archivos, a los dos depósitos de respaldo.
   ====================================================================

   La hace el backend de a una Prestadora, como todo trabajo sin persona (`paraCadaPrestadora`),
   con la cuenta automática de la copia de respaldo de esa Prestadora: la base le deja leer sólo
   su carpeta, y no toca ninguna tabla, no escribe y no borra.

   QUÉ SE COPIA Y CÓMO lo decide `copiaDeDepositos.js`: sólo lo que falta o cambió, y en el
   registro cantidades, nunca rutas.

   Y CADA ARCHIVO SUBE CIFRADO con la clave de su Prestadora (`cifradoDeLosRespaldos.js`). Una
   Prestadora sin clave no se copia. Como lo cifrado no mide lo mismo que el original, el destino
   guarda aparte el tamaño y la fecha del original y compara contra eso. Una copia que quedó de
   antes, sin cifrar, no tiene esa marca: se vuelve a subir cifrada, en el mismo lugar. */

import { S3Client, PutObjectCommand, HeadObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { paraCadaPrestadora } from '../db/connection.js';
import { copiarDepositos, depositosDeSupabase } from './copiaDeDepositos.js';
import { cifradorDeLaPrestadora } from './cifradoDeLosRespaldos.js';

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
 * Un destino de los respaldos, sobre un depósito compatible con S3.
 *
 * Todo lo que sube ya viene cifrado, y queda marcado así. `yaEstaIgual` compara el tamaño y la
 * fecha del original, que se guardaron al subir. Sin esa comparación el respaldo volvería a subir
 * todos los archivos todas las noches, y eso crece hasta que una noche no termina.
 */
export function destinoS3(cliente, bucket) {
  return {
    async yaEstaIgual(clave, archivo) {
      try {
        const actual = await cliente.send(new HeadObjectCommand({ Bucket: bucket, Key: clave }));
        const marca = actual.Metadata ?? {};
        if (marca.cifrado !== 'age') return false;
        if (archivo.tamano != null && marca.tamano !== String(archivo.tamano)) return false;
        if (archivo.actualizado && marca.actualizado !== archivo.actualizado) return false;
        return true;
      } catch {
        return false;
      }
    },
    async subir(clave, cuerpo, archivo = {}) {
      const marca = { cifrado: 'age' };
      if (archivo.tamano != null) marca.tamano = String(archivo.tamano);
      if (archivo.actualizado) marca.actualizado = archivo.actualizado;
      await cliente.send(new PutObjectCommand({ Bucket: bucket, Key: clave, Body: cuerpo, Metadata: marca }));
    },
    async listar(prefijo) {
      const claves = [];
      let siguiente;
      do {
        const r = await cliente.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefijo, ContinuationToken: siguiente }));
        for (const o of r.Contents ?? []) claves.push(o.Key);
        siguiente = r.IsTruncated ? r.NextContinuationToken : undefined;
      } while (siguiente);
      return claves;
    },
    async borrar(clave) {
      await cliente.send(new DeleteObjectCommand({ Bucket: bucket, Key: clave }));
    },
  };
}

/** Los dos destinos: Cloudflare R2, el principal, y Backblaze B2, el espejo. */
export function losDestinos() {
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

/** El almacenamiento de una Prestadora, que entrega cada archivo ya cifrado con su clave. */
function cifrado(almacenamiento, cifrar) {
  return {
    ...almacenamiento,
    async descargar(deposito, ruta) {
      return cifrar(await almacenamiento.descargar(deposito, ruta));
    },
  };
}

/**
 * Copia los archivos de cada Prestadora, de a una, a los dos depósitos de respaldo. Falla —y lo
 * dice en el registro— si algún archivo o alguna Prestadora no se pudo copiar, después de haber
 * intentado con todos.
 */
export async function copiarLosArchivosAlRespaldo({ destinos = losDestinos(), avisar = (t) => console.log(t), claves } = {}) {
  const total = { prestadoras: 0, prestadorasFalladas: 0, copiados: 0, yaEstaban: 0, fallados: 0 };
  await paraCadaPrestadora('copia_de_respaldo', async (prestadoraId, conexion) => {
    total.prestadoras += 1;
    try {
      const cifrar = cifradorDeLaPrestadora(prestadoraId, claves);
      const cuenta = await copiarDepositos({
        almacenamiento: cifrado(depositosDeSupabase(conexion, { carpeta: prestadoraId }), cifrar),
        destinos,
        avisar,
      });
      total.copiados += cuenta.copiados;
      total.yaEstaban += cuenta.yaEstaban;
      total.fallados += cuenta.fallados;
    } catch (err) {
      // `paraCadaPrestadora` lo anota y sigue con la próxima; acá se cuenta para fallar al final.
      total.prestadorasFalladas += 1;
      throw err;
    }
  }, { rol: 'copia_de_respaldo' });
  avisar(
    `Archivos: ${total.prestadoras} Prestadoras, ${total.copiados} copiados, `
    + `${total.yaEstaban} ya estaban, ${total.fallados} fallados.`,
  );
  if (total.prestadorasFalladas > 0) {
    throw new Error(`${total.prestadorasFalladas} Prestadoras no se pudieron copiar.`);
  }
  if (total.fallados > 0) throw new Error(`${total.fallados} archivos no se pudieron copiar.`);
  return total;
}
