// ---------------------------------------------------------------------------
// erroresDeDocumentos.js — lo que la base rechaza por los documentos del Asistente, dicho como
// motivo.
//
// La base avisa con texto: `documentos_bloquean:<nombres separados por ", ">:`,
// `sin_permiso_para_asignar_con_documentos_pendientes`, `documento_sin_gracia`,
// `organismo_no_otorga_ese_documento`. Ese texto no sale nunca hacia afuera
// (`celtatech/CLAUDE.md` §6): se convierte acá en un `ErrorConMotivo`, que `responderError`
// sabe contestar. Los nombres de los documentos sí viajan, en su propia lista: son lo que la
// pantalla necesita para decir qué falta, y son nombres que la misma Prestadora escribió.
// ---------------------------------------------------------------------------

import { ErrorConMotivo } from './errorConMotivo.js';

const BLOQUEO = /documentos_bloquean:(.*?):/s;

const MOTIVOS_SUELTOS = [
  'sin_permiso_para_asignar_con_documentos_pendientes',
  'documento_sin_gracia',
  'organismo_no_otorga_ese_documento',
];

/** Los nombres de los documentos que traban, o `null` si el error no es ése. */
export function documentosDelBloqueo(error) {
  const texto = String(error?.message ?? '');
  const hallado = BLOQUEO.exec(texto);
  if (!hallado) return null;
  return hallado[1]
    .split(', ')
    .map((nombre) => nombre.trim())
    .filter(Boolean);
}

/**
 * El error de la base convertido en `ErrorConMotivo`, o `null` si no es ninguno de los de
 * documentos (y entonces lo contesta quien llamó, como siempre).
 */
export function errorDeDocumentos(error) {
  const documentos = documentosDelBloqueo(error);
  if (documentos) {
    const convertido = new ErrorConMotivo('documentos_bloquean', String(error?.message ?? ''));
    convertido.documentos = documentos;
    return convertido;
  }
  const texto = String(error?.message ?? '');
  const motivo = MOTIVOS_SUELTOS.find((m) => texto.includes(m));
  return motivo ? new ErrorConMotivo(motivo, texto) : null;
}
