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

   LA FACTURA SALE SIEMPRE A NOMBRE DEL CONTRATANTE: el del Servicio o, si no tiene uno, el del
   Cliente. La excepción la pone la Prestadora para un Servicio puntual: en los días en que uno de
   sus Responsables de pagos lleva la indicación, la factura sale a nombre de él. La indicación la
   lleva uno solo por día, aunque el Servicio tenga varios Responsables de pagos a la vez. A nombre
   de quién sale cada tramo lo dice la base, en la vista de los tramos de la factura
   (`responsable_que_recibe_la_factura`, vacío quiere decir el Contratante); acá no se vuelve a
   decidir.

   El período se parte sólo en el día en que cambia la persona a nombre de quien sale la factura:
   una factura por cada parte. Agregar o terminar un Responsable de pagos sin la indicación no
   parte nada. El corte vive en una sola función, `partesDelPeriodo`, y a quién va cada factura,
   en `aNombreDeQuienSaleLaFactura`.

   LA CUENTA NO VIVE ACÁ. Qué se cobra por cada prestación —con la medición que rija y la
   prestación vigente el día de cada guardia— lo calcula `calcularLiquidacion.js`, que es el mismo
   archivo en el Panel y en el backend. Acá sólo se arma lo que va a la base. */

import { calcularLiquidacionDelCliente } from './calcularLiquidacion.js';
import { periodosDeCobroQueTocan } from './frecuenciaDePago.js';
import { CLASES_DE_DESCUENTO, descuentosDelPeriodo, ordenDelPeriodo, renglonesDeFactura } from './descuentosDelPeriodo.js';

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

function diasEntre(desde, hasta) {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000) + 1;
}

function fechaOVacio(valor) {
  const texto = valor ? String(valor).slice(0, 10) : null;
  return texto && esFechaReal(texto) ? texto : null;
}

/* Los tramos tal como los da la vista de la base: `{ rige_desde, rige_hasta,
   responsable_que_recibe_la_factura }`. Qué días cubre cada uno lo decide la base —el primero no
   tiene comienzo, el último no tiene fin—; acá sólo se cruzan con el período. */
function tramosEnOrden(tramos) {
  return [...(tramos ?? [])]
    .map((t) => ({ ...t, rige_desde: fechaOVacio(t.rige_desde), rige_hasta: fechaOVacio(t.rige_hasta) }))
    .sort((a, b) => {
      if (a.rige_desde === b.rige_desde) return 0;
      if (a.rige_desde === null) return -1;
      if (b.rige_desde === null) return 1;
      return a.rige_desde < b.rige_desde ? -1 : 1;
    });
}

function cubreElDia(tramo, dia) {
  return (tramo.rige_desde === null || tramo.rige_desde <= dia)
    && (tramo.rige_hasta === null || tramo.rige_hasta >= dia);
}

/**
 * El tramo de la factura de un Servicio que cubre una fecha, según la vista de la base.
 * Sin ningún tramo que cubra ese día devuelve null.
 */
function tramoEnLaFecha(tramos, fecha) {
  const dia = String(fecha ?? '').slice(0, 10);
  return tramosEnOrden(tramos).find((t) => cubreElDia(t, dia)) ?? null;
}

/** La persona del Responsable de pagos que recibe la factura de un tramo, o null: el Contratante. */
function responsableQueRecibeLaFactura(tramo) {
  return tramo?.responsable_que_recibe_la_factura ?? null;
}

/**
 * A nombre de quién sale la factura de un Servicio en una fecha: el Responsable de pagos si el
 * tramo de ese día lleva la indicación; si no, el Contratante que se pasa.
 */
export function aNombreDeQuienSaleLaFactura(tramos, fecha, contratante) {
  return responsableQueRecibeLaFactura(tramoEnLaFecha(tramos, fecha)) ?? contratante ?? null;
}

/**
 * Las partes de un período, una por cada persona a nombre de quien salió la factura en sus días:
 * `[{ desde, hasta, pagador }]`, con el tramo del primer día de la parte. Se parte en el día en
 * que la factura pasa a salir a nombre de otro. Sin ningún cambio así adentro, es una sola parte
 * con el período entero.
 */
export function partesDelPeriodo(periodo, tramos) {
  const partes = [];
  for (const tramo of tramosEnOrden(tramos)) {
    const desde = tramo.rige_desde && tramo.rige_desde > periodo.desde ? tramo.rige_desde : periodo.desde;
    const hasta = tramo.rige_hasta && tramo.rige_hasta < periodo.hasta ? tramo.rige_hasta : periodo.hasta;
    if (desde > hasta) continue;
    const ultima = partes[partes.length - 1];
    if (ultima && responsableQueRecibeLaFactura(ultima.pagador) === responsableQueRecibeLaFactura(tramo)) {
      ultima.hasta = hasta;
      continue;
    }
    partes.push({ desde, hasta, pagador: tramo });
  }
  if (partes.length === 0) return [{ desde: periodo.desde, hasta: periodo.hasta, pagador: null }];
  // Un día que ningún tramo cubre queda con la parte de antes: el período no pierde días.
  partes[0].desde = periodo.desde;
  for (let i = 1; i < partes.length; i += 1) {
    const esperado = new Date(Date.parse(`${partes[i - 1].hasta}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    if (partes[i].desde !== esperado) partes[i - 1].hasta = new Date(Date.parse(`${partes[i].desde}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  }
  partes[partes.length - 1].hasta = periodo.hasta;
  return partes;
}

/**
 * Los descuentos para la factura de una parte del período. Si un descuento toca el período, y en
 * qué orden, se decide con el período entero. El de importe fijo se reparte entre las partes en
 * proporción a sus días, y lo que se redondea se acumula: las partes suman el importe entero.
 */
export function descuentosDeLaParte({ descuentos, periodo, parte }) {
  if (!parte || (parte.desde === periodo.desde && parte.hasta === periodo.hasta)) return descuentos ?? [];
  const total = diasEntre(periodo.desde, periodo.hasta);
  const antes = diasEntre(periodo.desde, parte.desde) - 1;
  const hastaElFin = diasEntre(periodo.desde, parte.hasta);
  return (descuentos ?? []).map((d) => {
    if (d.clase !== CLASES_DE_DESCUENTO.MONTO) return d;
    const centavos = Math.round(Number(d.valor) * 100);
    const parteEnCentavos = Math.round((centavos * hastaElFin) / total) - Math.round((centavos * antes) / total);
    return { ...d, valor: parteEnCentavos / 100 };
  });
}

/**
 * El período de cobro entero, con esta frecuencia, que contiene a esta parte. Si la parte no cae
 * adentro de un solo período, devuelve la parte misma.
 */
export function periodoEnteroDeLaParte(parte, frecuencia) {
  const [periodo] = periodosDeCobroQueTocan(parte.desde, parte.desde, frecuencia);
  if (!periodo || periodo.desde > parte.desde || periodo.hasta < parte.hasta) return { desde: parte.desde, hasta: parte.hasta };
  return { desde: periodo.desde, hasta: periodo.hasta };
}

/** Si dos tramos de días comparten alguno. */
export function seSuperponen(a, b) {
  return a.desde <= b.hasta && b.desde <= a.hasta;
}

/**
 * La factura de un Servicio en un período: sus renglones, su total y su moneda, o por qué no
 * se puede armar. Con `parte`, sólo la de esos días del período: la cuenta corre sobre el período
 * entero y se cobra lo que cae en la parte.
 *
 * @returns {{
 *   renglones: Array<{paciente_id, servicio_id, descripcion, monto, cantidad, unidad, precio_unitario,
 *     concepto}>,
 *   total: number, moneda: string|null, monedasMezcladas: boolean,
 *   guardiasSinAsignar: number, guardiasAmbiguas: number, sinPrecio: number, sinCantidadPactada: number,
 *   medicionDesconocida: boolean,
 * }}
 */
export function armarLaFacturaDelPeriodo({ periodo, parte = null, medicion, condiciones, prestaciones, guardias, nombresDePacientes }) {
  const liquidacion = calcularLiquidacionDelCliente({
    periodo,
    parte,
    medicion,
    condiciones,
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
      // De dónde sale el ítem: así el ítem descontado o adicional se explica solo, aunque las
      // condiciones cambien después.
      concepto: r.concepto,
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

/* El texto guardado del renglón de un descuento. Es dato, no texto visible: dice la clase y el
   valor con la misma forma que los otros renglones (`valor_hora_extra 10.00 × 2.00 h`), y quien lo
   muestra lo reconoce por `concepto = 'descuento'`. */
function descripcionDelDescuento(renglon) {
  if (renglon.clase === 'porcentaje') return `descuento ${renglon.valor} %`;
  return `descuento ${renglon.moneda ?? ''} ${Number(renglon.valor).toFixed(2)}`.replace('  ', ' ');
}

/**
 * La factura con los descuentos del Servicio que tocan el período: cada uno es un renglón propio
 * en negativo, y el total queda restado. El período se cuenta desde el comienzo de cada descuento
 * con la frecuencia de cobro del Servicio. Con `parte`, el de importe fijo va en proporción.
 *
 * @returns {{ renglones: Array, total: number, noAplicados: Array<{descuento_id, motivo}> }}
 */
export function conLosDescuentos({ factura, descuentos, periodo, parte = null, frecuencia, servicioId }) {
  if (!descuentos || descuentos.length === 0) {
    return { renglones: factura.renglones, total: factura.total, noAplicados: [] };
  }
  const resultado = descuentosDelPeriodo({
    descuentos: descuentosDeLaParte({ descuentos, periodo, parte }),
    periodo,
    subtotal: factura.total,
    moneda: factura.moneda,
    ordenDe: (d) => ordenDelPeriodo(d, periodo, (desde, hasta) => periodosDeCobroQueTocan(desde, hasta, frecuencia)),
  });
  return {
    renglones: [...factura.renglones, ...renglonesDeFactura(resultado, servicioId, descripcionDelDescuento)],
    total: resultado.total,
    noAplicados: resultado.no_aplicados,
  };
}
