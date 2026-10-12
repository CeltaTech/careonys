// Los archivos de una pieza de Contenidos, del lado de quien lee: cómo se piden junto con la pieza
// y cómo se abre uno. Lo usan el Panel y las dos aplicaciones, que leen igual y con la credencial
// de cada uno: quién ve qué archivo lo decide la base, por la pieza a la que pertenece.

import { ErrorConMotivo } from './errorConMotivo.js';
import { archivoDeContenidoSeVeAdentro } from '../config/archivosDeContenidos.js';

export const DEPOSITO_DE_CONTENIDOS = 'contenidos-archivos';

/** Lo que se pide de cada archivo junto con su pieza. La ruta del depósito no sale nunca. */
export const ARCHIVOS_DE_LA_PIEZA = 'archivos:contenidos_archivos(id, nombre, tipo, tamano, created_at)';

/** Los archivos de cada pieza, en el orden en que se subieron. */
export function conArchivosEnOrden(contenidos) {
  return (contenidos ?? []).map((contenido) => ({
    ...contenido,
    archivos: [...(contenido.archivos ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }));
}

/**
 * Un enlace temporal para abrir un archivo. La ruta se lee de la base con la credencial de quien
 * pide, nunca del pedido: si la base no le deja ver la fila, el archivo no existe para él.
 *
 * Las aplicaciones mandan `destinatario`, y entonces se repite acá lo que la base ya hace cumplir:
 * que la pieza esté publicada y sea para ellas, igual que en la lista.
 */
export async function enlaceDelArchivo(db, archivoId, { destinatario } = {}) {
  // SIN PRESTADORA A PROPÓSITO
  // `db` es siempre la conexión de quien pide, y la Prestadora la pone la protección por fila de
  // la tabla. Las tres rutas que llaman acá le pasan `clienteDelPedido(req)`.
  let consulta = db.from('contenidos_archivos')
    .select(destinatario ? 'ruta, nombre, tipo, contenidos!inner(id)' : 'ruta, nombre, tipo')
    .eq('id', archivoId);
  if (destinatario) {
    consulta = consulta.eq('contenidos.publicado', true).contains('contenidos.destinatarios', [destinatario]);
  }
  const { data: archivo, error } = await consulta.maybeSingle();
  if (error) throw error;
  if (!archivo) throw new ErrorConMotivo('no_encontrado', 'Archivo de contenido inexistente o ajeno');

  // Lo que se ve adentro se abre tal cual; lo demás se descarga con el nombre con que se subió.
  const opciones = archivoDeContenidoSeVeAdentro(archivo.tipo) ? undefined : { download: archivo.nombre };
  const { data, error: errorEnlace } = await db.storage
    .from(DEPOSITO_DE_CONTENIDOS)
    .createSignedUrl(archivo.ruta, 60, opciones);
  if (errorEnlace) throw errorEnlace;
  return data.signedUrl;
}
