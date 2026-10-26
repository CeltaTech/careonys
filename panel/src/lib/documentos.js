import { con } from './textos';
import { TONO } from './tonos';

/* Los documentos del Asistente, del lado del Panel.
   =========================================================================================

   Un documento que impide trabajar y falta, está observado o venció frena la asignación de un
   turno. La base lo frena con `documentos_bloquean:<nombres separados por ", ">:`, y el backend
   lo devuelve como 409 con `motivo: 'documentos_bloquean'` y la lista en `documentos`. Las dos
   formas llegan acá y salen como una sola: la lista de nombres que faltan. */

export const MOTIVO_DOCUMENTOS = 'documentos_bloquean';

// El mismo par que acota el depósito `documentos-asistente` en la base. Acá está para avisar
// antes de que el archivo viaje; quien decide es la base.
export const TIPOS_ACEPTADOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];
export const TAMANO_MAXIMO = 10 * 1024 * 1024;

/** Los seis estados que se muestran. «Por vencer» y «Vencido» no se guardan: salen de la fecha. */
export const ESTADOS_VISIBLES = ['falta', 'en_revision', 'aprobado', 'observado', 'por_vencer', 'vencido'];

/** Los estados con los que el Asistente puede trabajar. */
const ESTADOS_EN_REGLA = new Set(['aprobado', 'por_vencer']);

/** El tono del sistema que lleva cada estado en la etiqueta. */
export const TONO_DEL_ESTADO = {
  falta: TONO.CRITICO,
  en_revision: TONO.ATENCION,
  aprobado: TONO.EXITO,
  observado: TONO.CRITICO,
  por_vencer: TONO.ATENCION,
  vencido: TONO.CRITICO,
};

/**
 * Los nombres de los documentos que frenaron una asignación, o `null` si el error es otro.
 *
 * @param {object | null} error  Lo que devolvió el backend (con `motivo` y `documentos`) o la base
 *                               (con `message`).
 * @returns {string[] | null}
 */
export function documentosQueBloquean(error) {
  if (!error || typeof error !== 'object') return null;
  if (Array.isArray(error.documentos) && (error.motivo === MOTIVO_DOCUMENTOS || error.error === MOTIVO_DOCUMENTOS)) {
    return error.documentos.map(String);
  }
  for (const texto of [error.motivo, error.message]) {
    if (typeof texto !== 'string' || !texto.startsWith(MOTIVO_DOCUMENTOS)) continue;
    const resto = texto.slice(MOTIVO_DOCUMENTOS.length).replace(/^:/, '').replace(/:\s*$/, '');
    return resto ? resto.split(', ').map((s) => s.trim()).filter(Boolean) : [];
  }
  return null;
}

/**
 * La frase para un rechazo por documentos: «Documentos pendientes: A, B.».
 *
 * @returns {string | null}  `null` si el error no es por documentos.
 */
export function mensajeDeDocumentos(error, t) {
  const documentos = documentosQueBloquean(error);
  if (documentos === null) return null;
  const td = t?.documentos_asistente;
  if (!td) return null;
  return documentos.length ? con(td.pendientes, { documentos: documentos.join(', ') }) : td.pendientes_sin_lista;
}

/**
 * Los documentos que impiden trabajar y no están en regla.
 *
 * @param {{ nombre: string, impide_trabajar: boolean, estado_visible: string }[]} documentos
 * @returns {string[]}
 */
export function documentosPendientes(documentos) {
  return (documentos ?? [])
    .filter((d) => d.impide_trabajar && !ESTADOS_EN_REGLA.has(d.estado_visible))
    .map((d) => d.nombre);
}

/**
 * Si un documento pedido hoy no deja trabajar: impide trabajar, no tiene un aprobado vigente y no
 * está en gracia. La misma cuenta que hace la base al asignar, sobre la fila de la vista
 * `documentos_pedidos_al_asistente`.
 *
 * @param {{ impide_trabajar: boolean, estado: string, fecha_vencimiento?: string | null,
 *           gracia_hasta?: string | null }} fila
 * @param {string} hoy  'AAAA-MM-DD'
 */
export function impideTrabajarHoy(fila, hoy) {
  if (!fila?.impide_trabajar) return false;
  const aprobadoVigente = fila.estado === 'aprobado' && (!fila.fecha_vencimiento || fila.fecha_vencimiento >= hoy);
  if (aprobadoVigente) return false;
  return !(fila.gracia_hasta && fila.gracia_hasta >= hoy);
}

/**
 * La gracia que todavía corre: la fecha más lejana de las que no pasaron, o `null`.
 *
 * @param {{ gracia_hasta?: string | null }[]} documentos
 * @param {string} hoy  'AAAA-MM-DD'
 */
export function graciaVigente(documentos, hoy) {
  const fechas = (documentos ?? []).map((d) => d.gracia_hasta).filter((f) => f && f >= hoy).sort();
  return fechas.length ? fechas[fechas.length - 1] : null;
}
