// Qué archivo admite una pieza de Contenidos, cuánto puede pesar y cómo se muestra.
//
// Lo que se sube es lo que la Prestadora no quiere dejar publicado en otro lado: por eso entran
// documentos e imágenes, y no videos, que pesan demasiado y van por enlace. El depósito
// `contenidos-archivos` repite estos mismos tipos y este tamaño, y los hace cumplir aunque alguien
// llegue sin pasar por el backend.
//
// CÓMO SE MUESTRA. La imagen y el PDF se ven adentro de la pantalla. Word y Excel se descargan:
// mostrarlos adentro obligaría a pasarlos por un visor de afuera, y eso es sacar un archivo
// confidencial de Careonys.
//
// Original en el backend; la copia del Panel la regenera `scripts/sincronizar_copias.mjs`.

export const TAMANO_MAXIMO_DE_ARCHIVO_DE_CONTENIDO = 10 * 1024 * 1024; // 10 MB

/** Tipo de archivo → extensión con la que se guarda en el depósito. */
export const TIPOS_DE_ARCHIVO_DE_CONTENIDO = Object.freeze({
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
});

export function esArchivoDeContenidoAceptado(tipo) {
  return Object.hasOwn(TIPOS_DE_ARCHIVO_DE_CONTENIDO, tipo);
}

/** La imagen y el PDF se ven adentro; el resto se descarga. */
export function archivoDeContenidoSeVeAdentro(tipo) {
  return tipo === 'application/pdf' || (typeof tipo === 'string' && tipo.startsWith('image/'));
}
