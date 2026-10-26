import { diasParaVencer, diaISO, estadoDeVencimiento, ESTADO_VENCIMIENTO } from './reglaVencimientos.js';

// Cómo se muestra un documento del Asistente, y qué fechas valen al cargarlo.
//
// La base guarda cuatro estados —falta, en revisión, aprobado, observado— y no sabe nada del
// calendario. Que un documento aprobado esté por vencer o ya vencido sale de su fecha y de la
// ventana de aviso de la Prestadora, con la misma regla que usa todo el producto
// (`reglaVencimientos.js`). Acá se junta todo eso una sola vez, para que el Panel, el teléfono
// del Asistente y la aplicación del Cliente no lo cuenten cada uno a su manera.

export const ESTADO_VISIBLE = {
  FALTA: 'falta',
  EN_REVISION: 'en_revision',
  APROBADO: 'aprobado',
  OBSERVADO: 'observado',
  POR_VENCER: 'por_vencer',
  VENCIDO: 'vencido',
};

/** El estado que se muestra: el de la base, y si está aprobado, el que dice su vencimiento. */
export function estadoVisible(fila, diasAviso, hoy = new Date()) {
  const estado = fila?.estado ?? ESTADO_VISIBLE.FALTA;
  if (estado !== ESTADO_VISIBLE.APROBADO) return estado;
  const vencimiento = estadoDeVencimiento(diasParaVencer(fila.fecha_vencimiento, hoy), diasAviso);
  if (vencimiento === ESTADO_VENCIMIENTO.VENCIDO) return ESTADO_VISIBLE.VENCIDO;
  if (vencimiento === ESTADO_VENCIMIENTO.POR_VENCER) return ESTADO_VISIBLE.POR_VENCER;
  return ESTADO_VISIBLE.APROBADO;
}

/** ¿Este documento cuenta como enviado? Lo que falta o lo observado todavía le toca al Asistente. */
export function estaEnviado(fila) {
  const estado = fila?.estado ?? ESTADO_VISIBLE.FALTA;
  return estado !== ESTADO_VISIBLE.FALTA && estado !== ESTADO_VISIBLE.OBSERVADO;
}

/** ¿Este documento vale hoy? Aprobado y sin vencer. */
export function estaAlDia(fila, hoy = new Date()) {
  if (fila?.estado !== ESTADO_VISIBLE.APROBADO) return false;
  const dias = diasParaVencer(fila.fecha_vencimiento, hoy);
  return dias === null || dias >= 0;
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Un día `AAAA-MM-DD` que existe de verdad, o null. */
export function diaValido(valor) {
  if (typeof valor !== 'string' || !DIA.test(valor)) return null;
  const fecha = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor) return null;
  return valor;
}

/**
 * Corre un día `AAAA-MM-DD` una cantidad de períodos, hacia adelante o hacia atrás. Cuenta igual
 * que la base (`make_interval`): el mes y el año se corren en el calendario, y un 31 que no existe
 * en el mes de llegada cae en el último día de ese mes.
 */
export function correrDia(dia, cantidad, unidad) {
  const [a, m, d] = dia.split('-').map(Number);
  if (unidad === 'dia' || unidad === 'semana') {
    const fecha = new Date(Date.UTC(a, m - 1, d + cantidad * (unidad === 'semana' ? 7 : 1)));
    return fecha.toISOString().slice(0, 10);
  }
  const meses = unidad === 'anio' ? cantidad * 12 : cantidad;
  const mesTotal = (m - 1) + meses;
  const anio = a + Math.floor(mesTotal / 12);
  const mes = ((mesTotal % 12) + 12) % 12;
  const ultimo = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(anio, mes, Math.min(d, ultimo))).toISOString().slice(0, 10);
}

/**
 * Las fechas de un documento que se está cargando, según cómo vence su tipo. Devuelve lo que se
 * guarda (`fecha_emision`, `fecha_vencimiento`), o `{ motivo }` si el dato vino mal.
 *
 * - `no_vence`: no se pide ninguna fecha.
 * - `fecha_del_documento`: se pide el vencimiento que trae el documento.
 * - `plazo_desde_emision`: se pide la emisión; el vencimiento lo calcula la base.
 */
export function fechasDelDocumento(tipo, cuerpo) {
  if (tipo.vencimiento === 'no_vence') {
    const emision = cuerpo.fecha_emision ? diaValido(cuerpo.fecha_emision) : null;
    if (cuerpo.fecha_emision && !emision) return { motivo: 'fecha_invalida' };
    return { fecha_emision: emision, fecha_vencimiento: null };
  }
  if (tipo.vencimiento === 'plazo_desde_emision') {
    if (!cuerpo.fecha_emision) return { motivo: 'faltan_datos' };
    const emision = diaValido(cuerpo.fecha_emision);
    if (!emision) return { motivo: 'fecha_invalida' };
    return { fecha_emision: emision, fecha_vencimiento: null };
  }
  if (!cuerpo.fecha_vencimiento) return { motivo: 'faltan_datos' };
  const vencimiento = diaValido(cuerpo.fecha_vencimiento);
  if (!vencimiento) return { motivo: 'fecha_invalida' };
  const emision = cuerpo.fecha_emision ? diaValido(cuerpo.fecha_emision) : null;
  if (cuerpo.fecha_emision && !emision) return { motivo: 'fecha_invalida' };
  return { fecha_emision: emision, fecha_vencimiento: vencimiento };
}

/**
 * ¿Lo que se está cargando ya llega vencido hoy? Devuelve null si vale, o `{ fecha }` con el día
 * que va en «Suba uno emitido después del {fecha}». Es la misma cuenta que hace el teléfono
 * (`pwa-asistentes/src/lib/documentos.js`, `fechaYaNoValida`), para que el aviso diga lo mismo
 * venga de donde venga:
 *
 * - Con plazo desde la emisión: vale si la emisión más el plazo llega a hoy, así que el último día
 *   que ya no alcanza es hoy menos el plazo, menos un día.
 * - Con la fecha que figura en el documento: el reemplazo tiene que ser posterior a ese vencimiento.
 */
export function llegaVencido(tipo, fechas, hoy = new Date()) {
  const dia = diaISO(hoy);
  if (tipo.vencimiento === 'plazo_desde_emision') {
    const vence = correrDia(fechas.fecha_emision, tipo.periodo_cantidad, tipo.periodo_unidad);
    if (vence >= dia) return null;
    return { fecha: correrDia(correrDia(dia, -tipo.periodo_cantidad, tipo.periodo_unidad), -1, 'dia') };
  }
  if (tipo.vencimiento === 'fecha_del_documento') {
    return fechas.fecha_vencimiento >= dia ? null : { fecha: fechas.fecha_vencimiento };
  }
  return null;
}
