/* Qué descuentos del Servicio se aplican en un período de facturación, y cuánto resta cada uno.
   ==========================================================================

   Un descuento es de un Cliente en su Servicio (`descuentos_del_servicio`): un porcentaje, o un
   monto con su moneda, desde una fecha, por una cantidad de períodos de facturación, hasta una
   fecha o sin fin. Se ve aparte en la liquidación: cada descuento que se aplica es un renglón propio, que
   dice de qué descuento sale y cuánto resta, nunca un número suelto metido en el total.

   CUÁNDO SE APLICA EN UN PERÍODO
     - empieza a más tardar el último día del período;
     - si termina por fecha, termina a partir del primer día del período;
     - si termina por cantidad de períodos, el período es uno de esos: el primero es el que
       contiene el día de comienzo (`ordenDelPeriodo`);
     - si alguien lo dio por terminado, sólo alcanza a los períodos que cerraron antes del día de la
       terminación. Un período ya cerrado se le debía al Cliente aunque todavía no se haya
       facturado; uno que sigue abierto ya no lo lleva.
     Un descuento que no toca el período no aparece en ninguna lista: no es que no se aplicó,
     es que no le correspondía.

   CÓMO SE CALCULA
     - el porcentaje se calcula siempre sobre el subtotal, no sobre lo que dejó el descuento
       anterior: dos descuentos del 10 % restan el 20 %, en cualquier orden;
     - el monto se resta tal cual, si está en la moneda del subtotal. En otra moneda no se aplica
       y se informa: aplicarlo sería convertir sin cotización;
     - el total nunca queda negativo: se aplican en orden de comienzo, y el que ya no entra entero
       se recorta a lo que queda; el que no entra nada se informa.
   Todo se cuenta en centavos enteros, así que la suma de los renglones da exactamente lo restado.

   El original es éste; la copia del backend la genera `scripts/sincronizar_copias.mjs`, y no se
   edita a mano. No depende de ningún otro archivo: la cuenta de cuántos períodos van desde el
   comienzo la hace quien llama, con su frecuencia (`ordenDelPeriodo`). */

export const CLASES_DE_DESCUENTO = Object.freeze({
  PORCENTAJE: 'porcentaje',
  MONTO: 'monto',
});

export const CLASES_DE_DESCUENTO_POSIBLES = Object.freeze(Object.values(CLASES_DE_DESCUENTO));

// Por qué un descuento que tocaba el período no restó nada.
export const MOTIVOS_SIN_APLICAR = Object.freeze({
  MONEDA_DISTINTA: 'moneda_distinta',
  SIN_SALDO: 'sin_saldo',
  SIN_ORDEN: 'sin_orden',
  DATO_INVALIDO: 'dato_invalido',
});

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function fecha(valor) {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).slice(0, 10);
  return FECHA.test(texto) ? texto : null;
}

function aCentavos(valor) {
  const n = Number(valor);
  if (valor === null || valor === undefined || valor === '' || !Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function aImporte(centavos) {
  return centavos / 100;
}

/** Si el descuento está bien escrito: clase conocida, valor positivo y a lo sumo un fin. */
export function descuentoValido(descuento) {
  if (!descuento || !CLASES_DE_DESCUENTO_POSIBLES.includes(descuento.clase)) return false;
  const valor = Number(descuento.valor);
  if (!Number.isFinite(valor) || valor <= 0) return false;
  if (descuento.clase === CLASES_DE_DESCUENTO.PORCENTAJE && valor > 100) return false;
  if (!fecha(descuento.vigente_desde)) return false;
  const conPeriodos = descuento.cantidad_de_periodos !== null && descuento.cantidad_de_periodos !== undefined;
  const conFecha = Boolean(fecha(descuento.vigente_hasta));
  // Termina por una de dos, o no termina: el descuento sin fin rige hasta que se cambie.
  if (conPeriodos && conFecha) return false;
  if (conPeriodos && !(Number.isInteger(Number(descuento.cantidad_de_periodos)) && Number(descuento.cantidad_de_periodos) >= 1)) return false;
  if (conFecha && fecha(descuento.vigente_hasta) < fecha(descuento.vigente_desde)) return false;
  return true;
}

/**
 * El número de orden del período contado desde el comienzo del descuento: 1 para el período que
 * contiene el día de comienzo. 0 si el período termina antes de que el descuento empiece.
 *
 * @param periodosQueTocan (desde, hasta) => Array — los períodos de cobro del Servicio que tocan
 *   ese tramo, en orden. En el backend: `(d, h) => periodosDeCobroQueTocan(d, h, frecuencia)`.
 */
export function ordenDelPeriodo(descuento, periodo, periodosQueTocan) {
  const desde = fecha(descuento?.vigente_desde);
  const hasta = fecha(periodo?.hasta);
  if (!desde || !hasta || typeof periodosQueTocan !== 'function') return null;
  if (hasta < desde) return 0;
  const lista = periodosQueTocan(desde, hasta);
  return Array.isArray(lista) ? lista.length : null;
}

/**
 * Si el descuento toca el período. Devuelve true, false, o el motivo por el que no se puede
 * saber (`sin_orden`): fallar cerrado, nunca aplicar un descuento que no se sabe si corresponde.
 */
export function tocaElPeriodo(descuento, periodo, orden) {
  const desde = fecha(descuento.vigente_desde);
  const pDesde = fecha(periodo?.desde);
  const pHasta = fecha(periodo?.hasta);
  if (!pDesde || !pHasta) return false;
  if (desde > pHasta) return false;

  const terminado = fecha(descuento.terminado_en);
  if (terminado && pHasta >= terminado) return false;

  const hasta = fecha(descuento.vigente_hasta);
  if (hasta) return hasta >= pDesde;

  // Sin fin: alcanza a todo período desde que empieza.
  if (descuento.cantidad_de_periodos === null || descuento.cantidad_de_periodos === undefined) return true;

  const n = Number(orden);
  if (orden === null || orden === undefined || !Number.isInteger(n)) return MOTIVOS_SIN_APLICAR.SIN_ORDEN;
  return n >= 1 && n <= Number(descuento.cantidad_de_periodos);
}

function enOrden(a, b) {
  const da = fecha(a.vigente_desde) ?? '';
  const db = fecha(b.vigente_desde) ?? '';
  if (da !== db) return da < db ? -1 : 1;
  const ca = String(a.cargado_en ?? '');
  const cb = String(b.cargado_en ?? '');
  if (ca !== cb) return ca < cb ? -1 : 1;
  return String(a.id ?? '') < String(b.id ?? '') ? -1 : String(a.id ?? '') > String(b.id ?? '') ? 1 : 0;
}

/**
 * Los descuentos de un Servicio en un período.
 *
 * @param {object} p
 * @param {Array} p.descuentos — renglones de `descuentos_del_servicio` de ese Servicio.
 * @param {{desde: string, hasta: string, orden?: number}} p.periodo — `orden` vale para todos los
 *   descuentos; si cada uno empieza en otra fecha, se pasa `ordenDe`.
 * @param {number} p.subtotal — lo que suma la liquidación antes de los descuentos.
 * @param {string|null} p.moneda — la moneda del subtotal.
 * @param {(descuento) => number} [p.ordenDe] — el orden del período para ese descuento.
 * @returns {{
 *   renglones: Array<{descuento_id, clase, valor, importe: number, moneda, recortado: boolean}>,
 *   no_aplicados: Array<{descuento_id, motivo}>,
 *   total_descontado: number,
 *   total: number,
 *   moneda: string|null,
 * }}
 */
export function descuentosDelPeriodo({ descuentos, periodo, subtotal, moneda, ordenDe }) {
  const subtotalEnCentavos = Math.max(aCentavos(subtotal) ?? 0, 0);
  const monedaDelSubtotal = moneda ?? null;
  const ordenDelDescuento = typeof ordenDe === 'function' ? ordenDe : () => periodo?.orden;

  const renglones = [];
  const noAplicados = [];
  let queda = subtotalEnCentavos;

  for (const descuento of [...(descuentos ?? [])].sort(enOrden)) {
    if (!descuentoValido(descuento)) {
      noAplicados.push({ descuento_id: descuento?.id ?? null, motivo: MOTIVOS_SIN_APLICAR.DATO_INVALIDO });
      continue;
    }

    const toca = tocaElPeriodo(descuento, periodo, ordenDelDescuento(descuento));
    if (toca === false) continue;
    if (toca !== true) {
      noAplicados.push({ descuento_id: descuento.id, motivo: toca });
      continue;
    }

    let pedido;
    if (descuento.clase === CLASES_DE_DESCUENTO.PORCENTAJE) {
      pedido = Math.round((subtotalEnCentavos * Number(descuento.valor)) / 100);
    } else {
      if (!monedaDelSubtotal || descuento.moneda !== monedaDelSubtotal) {
        noAplicados.push({ descuento_id: descuento.id, motivo: MOTIVOS_SIN_APLICAR.MONEDA_DISTINTA });
        continue;
      }
      pedido = aCentavos(descuento.valor);
    }

    const aplicado = Math.min(pedido, queda);
    if (aplicado <= 0) {
      noAplicados.push({ descuento_id: descuento.id, motivo: MOTIVOS_SIN_APLICAR.SIN_SALDO });
      continue;
    }
    queda -= aplicado;
    renglones.push({
      descuento_id: descuento.id,
      clase: descuento.clase,
      valor: Number(descuento.valor),
      importe: aImporte(aplicado),
      moneda: monedaDelSubtotal,
      recortado: aplicado < pedido,
    });
  }

  return {
    renglones,
    no_aplicados: noAplicados,
    total_descontado: aImporte(subtotalEnCentavos - queda),
    total: aImporte(queda),
    moneda: monedaDelSubtotal,
  };
}

/**
 * Los renglones de descuento como renglones de `facturas_cliente_items`: el monto va en negativo,
 * sin unidad, con `descuento_id` para reconocerlo y con el concepto `descuento`.
 *
 * @param descripcionDe (renglon) => string — el texto del renglón en la factura.
 */
export function renglonesDeFactura(resultado, servicioId, descripcionDe) {
  return (resultado?.renglones ?? []).map((r) => ({
    paciente_id: null,
    servicio_id: servicioId ?? null,
    descuento_id: r.descuento_id,
    descripcion: typeof descripcionDe === 'function' ? descripcionDe(r) : '',
    monto: -r.importe,
    cantidad: null,
    unidad: null,
    precio_unitario: null,
    concepto: 'descuento',
    recargo_del_adicional: null,
  }));
}
