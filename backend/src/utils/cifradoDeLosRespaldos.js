/* El cifrado de los respaldos: cada Prestadora con su propia clave.
   ==================================================================

   Todo lo que sale hacia los depósitos de respaldo —los datos y los archivos— sale cifrado con la
   clave pública de la Prestadora de la que es. La clave que lo abre no está en el backend ni en
   los depósitos: la guarda CeltaTech aparte. Así, quien se lleve una copia de los depósitos se
   lleva algo que no puede leer, y quien abra el respaldo de una Prestadora no puede abrir el de
   otra.

   Las claves públicas llegan en la variable de entorno CLAVES_PUBLICAS_DE_LOS_RESPALDOS, un JSON
   con la Prestadora y su clave: {"<prestadora>": "age1…"}. Una clave pública no abre nada, así que
   no es secreta.

   SIN CLAVE NO SE COPIA. Una Prestadora que no tiene clave no se respalda, y el respaldo termina
   con error. Subir la copia sin cifrar «mientras tanto» es justo lo que esto viene a impedir. */

import { Encrypter } from 'age-encryption';

const VARIABLE = 'CLAVES_PUBLICAS_DE_LOS_RESPALDOS';

/** Las claves públicas, leídas de la variable de entorno. Falla si la variable está mal escrita. */
export function clavesPublicasDeLosRespaldos(texto = process.env[VARIABLE]) {
  if (!texto) return {};
  let claves;
  try {
    claves = JSON.parse(texto);
  } catch {
    throw new Error(`La variable ${VARIABLE} no es un JSON válido`);
  }
  if (!claves || typeof claves !== 'object' || Array.isArray(claves)) {
    throw new Error(`La variable ${VARIABLE} tiene que ser un objeto: {"<prestadora>": "age1…"}`);
  }
  return claves;
}

/**
 * La función que cifra para una Prestadora. Falla en el momento si esa Prestadora no tiene clave,
 * antes de leer nada de ella.
 */
export function cifradorDeLaPrestadora(prestadoraId, claves = clavesPublicasDeLosRespaldos()) {
  const clave = claves[prestadoraId];
  if (typeof clave !== 'string' || !clave.startsWith('age1')) {
    throw new Error('La Prestadora no tiene clave para cifrar su respaldo: no se copia');
  }
  const cifrador = new Encrypter();
  cifrador.addRecipient(clave);
  return async (contenido) => Buffer.from(await cifrador.encrypt(new Uint8Array(contenido)));
}
