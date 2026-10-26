import { randomUUID } from 'node:crypto';

/* Cómo se nombra y dónde se guarda un archivo que sube alguien.
   ==========================================================================

   POR QUÉ EXISTE ESTE ARCHIVO. Las rutas del backend que reciben un archivo armaban su ruta del
   depósito a mano, y la misma línea que traduce el tipo de archivo a una extensión estaba escrita
   cinco veces. Peor todavía en los documentos del Asistente: la ruta se arma en dos rutas
   distintas —la del teléfono del Asistente y la del Panel— y una tercera la comprueba. Que la
   comprobación y la construcción vivan separadas es cómo se cuelan los agujeros: alcanza con que
   una de las dos cambie.

   La regla de dónde va cada archivo la fija CLAUDE.md §6: la ruta empieza por la Organización, y
   la política del depósito lo exige. Acá vive escrita una sola vez la parte que se repetía. */

/** Los tipos que aceptan las rutas que reciben archivos. */
const EXTENSIONES = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

/**
 * La extensión que le corresponde a un archivo por su tipo.
 *
 * Cae en `jpg` ante cualquier tipo que no conozca, que es lo que hacían las cinco copias: quién
 * entra y quién no ya lo decidió el filtro de la subida, así que acá no vuelve a decidirse.
 */
export function extensionDeArchivo(mimetype) {
  return EXTENSIONES[mimetype] ?? 'jpg';
}

// El documento firmado de una indicación de medicación. Afuera de la carpeta del Paciente, que es la
// que el depósito le deja leer al Asistente.
export function rutaDelPapelFirmado(prestadoraId, pacienteId, consentimientoId, extension) {
  return `${prestadoraId}/firmas-medicacion/${pacienteId}/firma-${consentimientoId}.${extension}`;
}

// Un archivo de una pieza de Contenidos. El nombre lo pone el sistema, nunca quien sube: el nombre
// original se guarda aparte, en la tabla, para mostrarlo.
export function rutaDeArchivoDeContenido(prestadoraId, contenidoId, extension) {
  return `${prestadoraId}/${contenidoId}/${randomUUID()}${extension}`;
}

/**
 * La carpeta donde viven los documentos de un Asistente, en el depósito `documentos-asistente`.
 * Termina en barra a propósito. La política del depósito exige exactamente esta forma:
 * `<Prestadora>/<Asistente>/…`.
 */
export function carpetaDeDocumentos(prestadoraId, asistenteId) {
  return `${prestadoraId}/${asistenteId}/`;
}

/** El nombre completo con el que se guarda un documento nuevo. Lo pone el sistema, nunca quien sube. */
export function rutaDeDocumentoNuevo(prestadoraId, asistenteId, extension) {
  return `${carpetaDeDocumentos(prestadoraId, asistenteId)}${randomUUID()}.${extension}`;
}

/**
 * ¿Esta ruta es la de un documento de este Asistente, de esta Prestadora?
 *
 * Es lo que decide si se genera o no el enlace temporal para ver el archivo, así que **falla
 * cerrado**: si falta cualquiera de los dos identificadores, la respuesta es que no. Sin ese corte,
 * un identificador vacío arma la carpeta `undefined/undefined/` y la comparación pasaría a depender
 * de que nadie guarde nunca un archivo con ese nombre.
 *
 * Se compara el comienzo entero —Prestadora incluida— y se exige que lo que sigue sea un nombre
 * de archivo y nada más.
 */
export function esRutaDeDocumentoDe(ruta, prestadoraId, asistenteId) {
  if (typeof ruta !== 'string' || !prestadoraId || !asistenteId) return false;

  const carpeta = carpetaDeDocumentos(prestadoraId, asistenteId);
  if (!ruta.startsWith(carpeta)) return false;

  const nombre = ruta.slice(carpeta.length);
  return nombre.length > 0 && !nombre.includes('/') && nombre !== '.' && nombre !== '..';
}
