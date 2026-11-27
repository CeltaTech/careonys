/*
 * Los archivos que se guardan de una importación.
 *
 * El original de cada lote se guarda entero al confirmar, para que el Administrador de la
 * Prestadora pueda volver a verlo: `originales-importacion/<prestadora>/<lote>/<archivo>`. Y cada
 * documento de la historia anterior de un Paciente se guarda en
 * `historia-anterior-pacientes/<prestadora>/<paciente>/<lote>/<identificador>-<archivo>`.
 *
 * En los dos depósitos nadie reemplaza ni borra un archivo: cada ruta es única. La del original
 * lleva el lote, que es uno por archivo; la del documento lleva además un identificador nuevo, para
 * que dos documentos de un mismo lote con el mismo nombre no choquen.
 *
 * Los suben la cuenta de la importación. Se leen con la sesión de quien pide, por un enlace
 * temporal de 60 segundos: el depósito decide quién alcanza cada archivo.
 */

import { randomUUID } from 'node:crypto';

export const DEPOSITO_DE_ORIGINALES = 'originales-importacion';
export const DEPOSITO_DE_LA_HISTORIA = 'historia-anterior-pacientes';
export const SEGUNDOS_DEL_ENLACE = 60;

/** El nombre de un archivo, sin barras ni caracteres que la ruta de un depósito no admite. */
export function nombreParaGuardar(nombre) {
  const limpio = String(nombre ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^\.+/, '')
    .slice(-120);
  return limpio || 'archivo';
}

export function rutaDelOriginal({ prestadoraId, loteId, nombre }) {
  return `${prestadoraId}/${loteId}/${nombreParaGuardar(nombre)}`;
}

export function rutaDelDocumento({ prestadoraId, pacienteId, loteId, nombre }) {
  return `${prestadoraId}/${pacienteId}/${loteId}/${randomUUID()}-${nombreParaGuardar(nombre)}`;
}

function tipoDelArchivo(archivo) {
  return archivo.mimetype || 'application/octet-stream';
}

async function subir(db, deposito, ruta, archivo) {
  const { error } = await db.storage.from(deposito).upload(ruta, archivo.buffer, {
    contentType: tipoDelArchivo(archivo),
    upsert: false,
  });
  if (error) throw new Error(error.message);
}

/**
 * Guarda el original del lote y lo anota en el lote. `db` es la cuenta de la importación.
 */
export async function guardarOriginal(db, { prestadoraId, loteId, archivo }) {
  const ruta = rutaDelOriginal({ prestadoraId, loteId, nombre: archivo.originalname });
  await subir(db, DEPOSITO_DE_ORIGINALES, ruta, archivo);
  const { error } = await db
    .from('importaciones_prestadora')
    .update({ archivo_ruta: ruta, archivo_tipo: tipoDelArchivo(archivo), archivo_tamano: archivo.buffer.length })
    .eq('id', loteId)
    .eq('prestadora_id', prestadoraId);
  if (error) throw new Error(error.message);
  return ruta;
}

/** Guarda un documento de la historia anterior de un Paciente y devuelve su ruta. */
export async function guardarDocumento(db, { prestadoraId, pacienteId, loteId, archivo }) {
  const ruta = rutaDelDocumento({ prestadoraId, pacienteId, loteId, nombre: archivo.originalname });
  await subir(db, DEPOSITO_DE_LA_HISTORIA, ruta, archivo);
  return ruta;
}

/**
 * El enlace temporal de un archivo, pedido con la sesión de quien lo va a ver, o null si el
 * depósito no se lo deja ver.
 */
export async function enlaceTemporal(dbDeQuienPide, deposito, ruta) {
  if (!ruta) return null;
  const { data, error } = await dbDeQuienPide.storage.from(deposito).createSignedUrl(ruta, SEGUNDOS_DEL_ENLACE);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
