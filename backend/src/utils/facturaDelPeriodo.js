/* Qué facturas sale a generar una tanda, y qué renglones lleva cada una.
   ============================================================

   UNA FACTURA POR SERVICIO Y POR PERÍODO, Y EL PERÍODO SALE DE LA FRECUENCIA. Cada Servicio se le
   cobra al Cliente cada día, cada semana, cada quincena o cada mes, según lo que rija para él
   (`condicionesDelCliente.js`: lo del Servicio, si no lo de la Prestadora, si no lo de fábrica).
   Quien genera la tanda dice un tramo de fechas —o un mes, como antes—, y para cada Servicio se
   arman los períodos de su frecuencia que EMPIEZAN dentro de ese tramo. Así un período nunca
   queda partido entre dos tandas, ni se cuenta en las dos.

   SÓLO SE FACTURA LO TERMINADO. Un período cuyo último día es hoy o después todavía tiene trabajo
   por anotar, y la medición sale de ese trabajo: facturarlo ahora cobraría de menos, y la factura
   no se puede rehacer porque la base no deja dos facturas del mismo Servicio sobre el mismo día.

   LA CUENTA NO VIVE ACÁ. Qué se cobra por cada prestación —con la medición que rija y la
   prestación vigente el día de cada guardia— lo calcula `calcularLiquidacion.js`, que es el mismo
   archivo en el Panel y en el backend. Acá sólo se arma lo que va a la base. */

import { calcularLiquidacionDelCliente } from './calcularLiquidacion.js';
import { periodosDeCobroQueTocan } from './frecuenciaDePago.js';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** El último día del mes de un período `2026-08-01`. */
export function ultimoDiaDelPeriodo(periodo) {
  const anio = Number(String(periodo).slice(0, 4));
  const mes = Number(String(periodo).slice(5, 7));
  // El día cero del mes siguiente es el último del mes pedido, y así no hay ninguna lista de
  // cuántos días tiene cada uno ni ninguna excepción de año bisiesto.
  return new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
}

/** Si el acuerdo de esta prestación corre en algún día del mes que empieza en `periodo`. */
export function correEnElPeriodo(prestacion, periodo) {
  const desde = String(prestacion.vigente_desde ?? '').slice(0, 10);
  const hasta = prestacion.vigente_hasta ? String(prestacion.vigente_hasta).slice(0, 10) : null;
  if (!desde) return false;
  return desde <= ultimoDiaDelPeriodo(periodo) && (hasta === null || hasta >= periodo);
}

function esFechaReal(texto) {
  if (typeof texto !== 'string' || !FECHA.test(texto)) return false;
  return new Date(`${texto}T00:00:00Z`).toISOString().slice(0, 10) === texto;
}

/**
 * El tramo que pidió quien genera la tanda: `{ desde, hasta }` con dos fechas, o el mes de antes,
 * `periodo: 'AAAA-MM'`. Devuelve null si no se entiende o si está al revés.
 */
export function tramoPedido(cuerpo) {
  const desde = cuerpo?.desde;
  const hasta = cuerpo?.hasta;
  if (desde !== undefined || hasta !== undefined) {
    if (!esFechaReal(desde) || !esFechaReal(hasta) || hasta < desde) return null;
    return { desde, hasta };
  }
  const periodo = cuerpo?.periodo;
  if (typeof periodo !== 'string' || !/^\d{4}-\d{2}$/.test(periodo)) return null;
  const mes = Number(periodo.slice(5, 7));
  if (mes < 1 || mes > 12) return null;
  const primero = `${periodo}-01`;
  return { desde: primero, hasta: ultimoDiaDelPeriodo(primero) };
}

/**
 * Los períodos de esta frecuencia que empiezan en el tramo, separados en los que ya terminaron
 * (se facturan) y los que todavía no (se cuentan aparte).
 */
export function periodosDelTramo({ tramo, frecuencia, hoy }) {
  const todos = periodosDeCobroQueTocan(tramo.desde, tramo.hasta, frecuencia).filter(
    (p) => p.desde >= tramo.desde && p.desde <= tramo.hasta
  );
  return {
    terminados: todos.filter((p) => p.hasta < hoy),
    sinTerminar: todos.filter((p) => p.hasta >= hoy),
  };
}

/**
 * Cómo se nombra un período hacia afuera: `AAAA-MM` si es un mes calendario entero —como hasta
 * ahora—, y si no `desde/hasta`, con las dos fechas.
 */
export function etiquetaDelPeriodo(desde, hasta) {
  const d = String(desde ?? '').slice(0, 10);
  const h = String(hasta ?? '').slice(0, 10);
  if (!esFechaReal(d)) return '';
  if (!esFechaReal(h)) return d.slice(0, 7);
  if (d.endsWith('-01') && h === ultimoDiaDelPeriodo(d)) return d.slice(0, 7);
  return `${d}/${h}`;
}

/**
 * El tramo que nombra un cobro de afuera: un mes `AAAA-MM`, un día `AAAA-MM-DD` o
 * `desde/hasta`. Devuelve null si no se entiende.
 */
export function tramoNombrado(texto) {
  if (typeof texto !== 'string') return null;
  if (texto.includes('/')) {
    const [desde, hasta] = texto.split('/');
    return tramoPedido({ desde, hasta });
  }
  if (esFechaReal(texto)) return { desde: texto, hasta: texto };
  return tramoPedido({ periodo: texto });
}

/** Si dos tramos de días comparten alguno. */
export function seSuperponen(a, b) {
  return a.desde <= b.hasta && b.desde <= a.hasta;
}

/**
 * La factura de un Servicio en un período: sus renglones, su total y su moneda, o por qué no
 * se puede armar.
 *
 * @returns {{
 *   renglones: Array<{paciente_id, servicio_id, descripcion, monto, cantidad, unidad, precio_unitario}>,
 *   total: number, moneda: string|null, monedasMezcladas: boolean,
 *   guardiasSinAsignar: number, guardiasAmbiguas: number, sinPrecio: number, sinCantidadPactada: number,
 *   medicionDesconocida: boolean,
 * }}
 */
export function armarLaFacturaDelPeriodo({ periodo, medicion, prestaciones, guardias, nombresDePacientes }) {
  const liquidacion = calcularLiquidacionDelCliente({
    periodo,
    medicion,
    prestaciones: prestaciones ?? [],
    guardias: guardias ?? [],
    nombresDePacientes: nombresDePacientes ?? new Map(),
  });
  const monedas = liquidacion.monedas.filter(Boolean);
  return {
    renglones: liquidacion.renglones.map((r) => ({
      paciente_id: r.paciente_id,
      servicio_id: r.servicio_id ?? null,
      descripcion: r.descripcion,
      monto: r.monto,
      cantidad: r.cantidad,
      unidad: r.unidad,
      precio_unitario: r.precio_unitario,
    })),
    total: liquidacion.total,
    // Una factura tiene una sola moneda. Si en el mismo Servicio hay dos, no se arma: elegir una
    // sería convertir sin cotización.
    moneda: monedas.length === 1 ? monedas[0] : null,
    monedasMezcladas: monedas.length > 1,
    guardiasSinAsignar: liquidacion.guardiasSinAsignar,
    guardiasAmbiguas: liquidacion.guardiasAmbiguas,
    sinPrecio: liquidacion.sinPrecio.length,
    sinCantidadPactada: liquidacion.sinCantidadPactada.length,
    medicionDesconocida: liquidacion.medicionDesconocida,
  };
}
