import { diaISO, diasParaVencer, estadoDeVencimiento, ESTADO_VENCIMIENTO } from './reglaVencimientos.js';

// ============================================================================
// Los documentos del Asistente: qué estado se le muestra y si la fecha que
// escribió todavía sirve.
//
// VIVE APARTE DE LA PANTALLA para poder probarse sin teléfono ni red. Son
// decisiones sobre fechas, y una fecha mal contada es un documento vencido que
// se ve como aprobado.
//
// LOS SEIS ESTADOS. La base guarda cuatro —falta, en revisión, aprobado,
// observado—; «por vencer» y «vencido» no se guardan: salen de la fecha de
// vencimiento del último aprobado, con la misma ventana de aviso que usa el
// resto del producto (`reglaVencimientos.js`). El backend ya los manda
// calculados en `estado_visible`, y ése es el que vale; la cuenta de acá queda
// para cuando no viene.
// ============================================================================

export const ESTADOS_VISIBLES = ['falta', 'observado', 'vencido', 'por_vencer', 'en_revision', 'aprobado'];

/** El estado que se le muestra al Asistente, uno de los seis. */
export function estadoVisible(documento, { diasAviso, hoy = new Date() } = {}) {
  if (ESTADOS_VISIBLES.includes(documento?.estado_visible)) return documento.estado_visible;
  const estado = documento?.estado;
  if (estado === 'por_vencer' || estado === 'vencido') return estado;
  if (estado !== 'aprobado') return ESTADOS_VISIBLES.includes(estado) ? estado : 'falta';
  const dias = diasParaVencer(documento.fecha_vencimiento, hoy);
  if (dias === null) return 'aprobado';
  const deVencimiento = estadoDeVencimiento(dias, diasAviso);
  if (deVencimiento === ESTADO_VENCIMIENTO.VENCIDO) return 'vencido';
  if (deVencimiento === ESTADO_VENCIMIENTO.POR_VENCER) return 'por_vencer';
  return 'aprobado';
}

/**
 * El estado del Certificado de Aptitud: vigente, por vencer, vencido o dado de baja. La baja es
 * una decisión de la Prestadora y gana sobre el calendario.
 */
export function estadoDelCertificado(certificado, { diasAviso, hoy = new Date() } = {}) {
  if (!certificado) return null;
  if (certificado.activo === false) return 'dado_de_baja';
  const dias = diasParaVencer(certificado.fecha_vencimiento, hoy);
  if (dias === null) return ESTADO_VENCIMIENTO.VIGENTE;
  return estadoDeVencimiento(dias, diasAviso);
}

/** El problema arriba: lo que falta y lo observado primero, lo aprobado al final. */
export function ordenarDocumentos(documentos, opciones) {
  return [...(documentos || [])].sort(
    (a, b) =>
      ESTADOS_VISIBLES.indexOf(estadoVisible(a, opciones)) - ESTADOS_VISIBLES.indexOf(estadoVisible(b, opciones)) ||
      String(a.nombre).localeCompare(String(b.nombre))
  );
}

/**
 * Suma un plazo a un día, como lo suma la base (`make_interval`): un mes después del 31 de enero
 * es el último día de febrero, no el 3 de marzo.
 */
export function sumarPlazo(dia, cantidad, unidad) {
  const base = diaISO(dia);
  const n = Number(cantidad);
  if (!base || !Number.isFinite(n)) return null;
  const [anio, mes, d] = base.split('-').map(Number);
  if (unidad === 'dia' || unidad === 'semana') {
    const fecha = new Date(anio, mes - 1, d);
    fecha.setDate(fecha.getDate() + n * (unidad === 'semana' ? 7 : 1));
    return diaISO(fecha);
  }
  if (unidad === 'mes' || unidad === 'anio') {
    const meses = unidad === 'anio' ? n * 12 : n;
    const total = mes - 1 + meses;
    const anioFinal = anio + Math.floor(total / 12);
    const mesFinal = ((total % 12) + 12) % 12;
    const ultimoDia = new Date(anioFinal, mesFinal + 1, 0).getDate();
    return diaISO(new Date(anioFinal, mesFinal, Math.min(d, ultimoDia)));
  }
  return null;
}

/**
 * Si la fecha que escribió ya deja el documento vencido hoy, el día que va en el aviso «Suba uno
 * emitido después del {fecha}». Si la fecha sirve, `null`.
 *
 * - Con plazo desde la emisión: vence el día de emisión más el plazo, y vale ese día inclusive
 *   (la base lo da por vencido cuando la fecha de vencimiento es anterior al día). El aviso dice el
 *   último día que ya no alcanza.
 * - Con la fecha que figura en el documento: lo que se escribe es el vencimiento, y si ya pasó, el
 *   reemplazo tiene que ser posterior a esa fecha.
 * - Si no vence, cualquier fecha sirve.
 */
export function fechaYaNoValida(tipo, fecha, hoy = new Date()) {
  const dia = diaISO(fecha);
  const hoyISO = diaISO(hoy);
  if (!dia || !hoyISO || !tipo) return null;
  if (tipo.vencimiento === 'fecha_del_documento') {
    return dia < hoyISO ? dia : null;
  }
  if (tipo.vencimiento === 'plazo_desde_emision') {
    const vence = sumarPlazo(dia, tipo.periodo_cantidad, tipo.periodo_unidad);
    if (!vence || vence >= hoyISO) return null;
    // El primer día de emisión que alcanza es hoy menos el plazo; el aviso nombra el anterior.
    const primero = sumarPlazo(hoyISO, -Number(tipo.periodo_cantidad), tipo.periodo_unidad);
    return sumarPlazo(primero, -1, 'dia');
  }
  return null;
}

/**
 * Qué fecha pide el tipo. Con la fecha que figura en el documento, la de vencimiento; si no, la de
 * emisión, que con plazo es obligatoria —de ella sale el vencimiento— y sin vencimiento es opcional.
 */
export function campoDeFecha(tipo) {
  if (tipo?.vencimiento === 'fecha_del_documento') return { campo: 'fecha_vencimiento', obligatoria: true };
  return { campo: 'fecha_emision', obligatoria: tipo?.vencimiento === 'plazo_desde_emision' };
}
