// ---------------------------------------------------------------------------
// estadoDocumentalParaElCliente.js — qué se le puede contar al Cliente sobre
// los documentos del Asistente que tiene en su casa, y qué no.
//
// POR QUÉ EXISTE, Y POR QUÉ DEVUELVE NÚMEROS Y NO NOMBRES
//
// Quien paga un servicio sin recibirlo ve el cumplimiento, nunca el contenido
// (`celtatech/CLAUDE.md` §6). Acá eso se vuelve concreto: el nombre de un
// documento puede ser dato de salud —un apto médico, una vacuna, un estudio— y
// decir cuál le falta a una persona es contar algo de ella que el Cliente no
// contrató. Así que de este archivo salen cuentas y una palabra de resumen; de
// acá no sale nunca el nombre de un tipo de documento ni su número.
//
// Y LA OTRA MITAD: EXACTITUD LITERAL SOBRE QUÉ SE VERIFICÓ
//
// `docs/PRD_07_Modalidad_Match.md:247` lo pide por su nombre, con el caso
// que lo motiva: a Care.com la sancionaron por afirmar una verificación que no
// hacía. Por eso al día está únicamente lo que la Prestadora aprobó y no venció.
// Lo que falta, lo que espera revisión y lo que la Prestadora observó están
// pendientes: redondear para arriba es justamente la afirmación que se sanciona.
//
// Lo que este archivo NO decide: cuántos días antes se avisa de un vencimiento.
// Esa es la misma pregunta que se hace el Panel, y vive una sola vez en
// `estadoDelDocumento.js`. Acá se la usa, no se la repite.
// ---------------------------------------------------------------------------

import { DIAS_AVISO_POR_DEFECTO } from './reglaVencimientos.js';
import { ESTADO_VISIBLE, estadoVisible } from './estadoDelDocumento.js';

/** Cómo quedan los documentos, en una palabra. La pantalla arma la frase. */
export const RESUMEN_DOCUMENTAL = {
  /** A este Asistente no se le pide ningún documento: no hay nada que informar. */
  SIN_EXIGENCIAS: 'sin_exigencias',
  /** Todo lo que se le pide está aprobado y vigente. */
  AL_DIA: 'al_dia',
  /** Todo aprobado y vigente, pero algo entra en la ventana de preaviso. */
  POR_VENCER: 'por_vencer',
  /** Alguno falta, espera revisión o fue observado. */
  INCOMPLETA: 'incompleta',
  /** Hay al menos uno vencido. */
  VENCIDA: 'vencida',
};

/**
 * Arma el estado documental agregado.
 *
 * @param documentos  un renglón por documento que se le pide, como los da la vista
 *                    `documentos_pedidos_al_asistente`: `[{ estado, fecha_vencimiento }]`.
 * @param diasAviso   la ventana de preaviso de la Prestadora.
 * @param ahora       desde cuándo se cuenta (la prueba manda una fecha fija).
 */
export function estadoDocumentalParaElCliente({
  documentos = [],
  diasAviso = DIAS_AVISO_POR_DEFECTO,
  ahora = new Date(),
} = {}) {
  let alDia = 0;
  let porVencer = 0;
  let vencidos = 0;
  let pendientes = 0;

  for (const documento of documentos) {
    const estado = estadoVisible(documento, diasAviso, ahora);
    if (estado === ESTADO_VISIBLE.VENCIDO) vencidos += 1;
    else if (estado === ESTADO_VISIBLE.POR_VENCER) porVencer += 1;
    else if (estado === ESTADO_VISIBLE.APROBADO) alDia += 1;
    else pendientes += 1;
  }

  return {
    documentosExigidos: documentos.length,
    alDia,
    porVencer,
    vencidos,
    pendientes,
    resumen: resumir({ exigidos: documentos.length, porVencer, vencidos, pendientes }),
  };
}

/**
 * El orden de precedencia es el de la mala noticia primero: lo vencido tapa lo pendiente, y lo
 * pendiente tapa lo que está por vencer. Quien lee esto quiere saber si hay un problema hoy.
 */
function resumir({ exigidos, porVencer, vencidos, pendientes }) {
  if (exigidos === 0) return RESUMEN_DOCUMENTAL.SIN_EXIGENCIAS;
  if (vencidos > 0) return RESUMEN_DOCUMENTAL.VENCIDA;
  if (pendientes > 0) return RESUMEN_DOCUMENTAL.INCOMPLETA;
  if (porVencer > 0) return RESUMEN_DOCUMENTAL.POR_VENCER;
  return RESUMEN_DOCUMENTAL.AL_DIA;
}
