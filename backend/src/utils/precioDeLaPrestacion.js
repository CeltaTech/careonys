/* El precio de una Prestación.
   ==========================================================================

   Se llega de una de dos formas (las de `FORMAS_DE_PRECIO`, en condicionesDelCliente.js):

     lista   — el precio de un renglón de la Lista de Precios, con un ajuste optativo: un
               descuento o un recargo, cada uno por porcentaje o por monto fijo.
     directo — el precio que escribe quien carga, sin pasar por la lista.

   Y un precio se cambia desde una fecha sin pisar el anterior: el nuevo es otra Prestación que
   dice a cuál reemplaza (`prestacion_anterior_id`), y la base cierra la anterior el día antes.
   Por eso, en un período de cobro, una misma cadena de reemplazos puede tener dos eslabones que
   lo tocan; `lasQueSeCobranEnElPeriodo` se queda con uno solo, para no cobrar dos veces lo mismo.

   Lo usan el panel y el backend. El original es éste; la copia del backend se genera con
   `scripts/sincronizar_copias.mjs` y no se edita a mano. */

import { FORMAS_DE_PRECIO } from './condicionesDelCliente.js';

// Hacia dónde mueve el ajuste el precio de la lista. Son los valores de `sentido_del_ajuste`.
export const SENTIDOS_DEL_AJUSTE = Object.freeze({
  DESCUENTO: 'descuento',
  RECARGO: 'recargo',
});

// Cómo se mide el ajuste. Son los valores de `tipo_descuento`, que vale para los dos sentidos.
export const TIPOS_DE_AJUSTE = Object.freeze({
  PORCENTAJE: 'porcentaje',
  MONTO_FIJO: 'monto_fijo',
});

export const SENTIDOS_DEL_AJUSTE_POSIBLES = Object.freeze(Object.values(SENTIDOS_DEL_AJUSTE));
export const TIPOS_DE_AJUSTE_POSIBLES = Object.freeze(Object.values(TIPOS_DE_AJUSTE));

// Un número que se puede usar como importe: escrito, finito y no negativo. Vacío no es cero.
function importe(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const redondear = (n) => Math.round(n * 100) / 100;

/* El precio final, o null si con lo cargado no se puede calcular.
   - forma: 'lista' | 'directo'.
   - precioLista: el precio del renglón elegido (forma 'lista').
   - sentido, tipo, valor: el ajuste. Sin sentido no hay ajuste.
   - precioEscrito: el que escribió quien carga (forma 'directo').
   Un descuento nunca deja el precio por debajo de cero. */
export function calcularPrecioFinal({ forma, precioLista, sentido, tipo, valor, precioEscrito } = {}) {
  if (forma === FORMAS_DE_PRECIO.DIRECTO) {
    const escrito = importe(precioEscrito);
    return escrito === null ? null : redondear(escrito);
  }
  if (forma !== FORMAS_DE_PRECIO.LISTA) return null;

  const base = importe(precioLista);
  if (base === null) return null;
  if (!sentido) return redondear(base);
  if (!SENTIDOS_DEL_AJUSTE_POSIBLES.includes(sentido) || !TIPOS_DE_AJUSTE_POSIBLES.includes(tipo)) return null;

  const cuanto = importe(valor);
  if (cuanto === null) return null;
  const ajuste = tipo === TIPOS_DE_AJUSTE.PORCENTAJE ? (base * cuanto) / 100 : cuanto;
  const resultado = sentido === SENTIDOS_DEL_AJUSTE.DESCUENTO ? base - ajuste : base + ajuste;
  return redondear(Math.max(0, resultado));
}

/* Qué casilleros del precio faltan o están mal, por nombre de casillero. Vacío = se puede guardar.
   - forma: falta elegirla.
   - precio_lista_id: con forma 'lista', falta el renglón.
   - tipo_de_ajuste / valor_del_ajuste: con un sentido elegido, falta cómo o cuánto.
   - tipo_servicio / precio_escrito: con forma 'directo', falta qué se presta o el precio. */
export function faltantesDelPrecio({ forma, renglon, sentido, tipo, valor, tipoServicio, precioEscrito } = {}) {
  const faltan = [];
  if (forma === FORMAS_DE_PRECIO.LISTA) {
    if (!renglon || importe(renglon.precio) === null) faltan.push('precio_lista_id');
    if (sentido) {
      if (!TIPOS_DE_AJUSTE_POSIBLES.includes(tipo)) faltan.push('tipo_de_ajuste');
      if (importe(valor) === null) faltan.push('valor_del_ajuste');
    }
  } else if (forma === FORMAS_DE_PRECIO.DIRECTO) {
    if (!tipoServicio || !String(tipoServicio).trim()) faltan.push('tipo_servicio');
    if (importe(precioEscrito) === null) faltan.push('precio_escrito');
  } else {
    faltan.push('forma_de_precio');
  }
  return faltan;
}

/* Las columnas del precio para guardar en `prestaciones`, o null si falta algo.
   Con forma 'lista' guarda la copia del precio de ese día (`precio_lista_snapshot`), para que un
   cambio posterior de la lista no altere lo pactado. Con forma 'directo' no apunta a ningún
   renglón y no lleva ajuste: la base lo exige así. */
export function columnasDelPrecio({ forma, renglon, sentido, tipo, valor, tipoServicio, precioEscrito } = {}) {
  if (faltantesDelPrecio({ forma, renglon, sentido, tipo, valor, tipoServicio, precioEscrito }).length > 0) return null;

  if (forma === FORMAS_DE_PRECIO.DIRECTO) {
    return {
      forma_de_precio: FORMAS_DE_PRECIO.DIRECTO,
      tipo_servicio: String(tipoServicio).trim(),
      precio_lista_id: null,
      precio_lista_snapshot: null,
      sentido_del_ajuste: null,
      tipo_descuento: null,
      valor_descuento: null,
      precio_final: calcularPrecioFinal({ forma, precioEscrito }),
    };
  }

  const conAjuste = Boolean(sentido);
  return {
    forma_de_precio: FORMAS_DE_PRECIO.LISTA,
    tipo_servicio: [renglon.tipo_servicio, renglon.modalidad].filter(Boolean).join(' — '),
    precio_lista_id: renglon.id,
    precio_lista_snapshot: Number(renglon.precio),
    sentido_del_ajuste: conAjuste ? sentido : null,
    tipo_descuento: conAjuste ? tipo : null,
    valor_descuento: conAjuste ? Number(valor) : null,
    precio_final: calcularPrecioFinal({
      forma,
      precioLista: renglon.precio,
      sentido: conAjuste ? sentido : null,
      tipo,
      valor,
    }),
  };
}

// El día anterior a una fecha 'AAAA-MM-DD', en el mismo formato. Sin husos horarios de por medio.
export function diaAnterior(fecha) {
  const [a, m, d] = String(fecha).split('-').map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d));
  if (Number.isNaN(dia.getTime())) return null;
  dia.setUTCDate(dia.getUTCDate() - 1);
  return dia.toISOString().slice(0, 10);
}

/* Si una Prestación puede cambiar de precio desde `desde`. Es la misma regla que aplica la base
   al guardar: la anterior sigue en pie, no fue reemplazada ya, y la nueva fecha cae después de su
   arranque y dentro de su período. Se pregunta acá para avisar antes, con palabras de quien carga. */
export function cambioDePrecioValido(anterior, desde, yaReemplazadas = new Set()) {
  if (!anterior || anterior.estado !== 'vigente' || !anterior.vigente_desde) return false;
  if (yaReemplazadas.has(anterior.id)) return false;
  if (!desde || !/^\d{4}-\d{2}-\d{2}$/.test(desde)) return false;
  if (desde <= anterior.vigente_desde) return false;
  return !anterior.vigente_hasta || desde <= anterior.vigente_hasta;
}

// Los ids de las Prestaciones que ya tienen un precio nuevo que las reemplaza.
export function idsReemplazados(prestaciones) {
  return new Set((prestaciones ?? []).map((p) => p.prestacion_anterior_id).filter((id) => id !== null && id !== undefined));
}

/* De las Prestaciones que tocan un período, una sola por cadena de reemplazos.

   Sin esto, un cambio de precio a mitad del período deja dos Prestaciones que lo tocan —la
   vieja hasta el día antes y la nueva desde ese día—, y se cobrarían las dos enteras. Se cobra el
   eslabón que corre el primer día del período; si ninguno corre ese día (la cadena arrancó a
   mitad del período), el primero que arranca adentro.

   - prestaciones: filas con id, prestacion_anterior_id, vigente_desde, vigente_hasta.
   - primerDia, ultimoDia: el período, 'AAAA-MM-DD', los dos incluidos.
   Devuelve las filas elegidas, en el orden en que llegaron. */
export function lasQueSeCobranEnElPeriodo(prestaciones, primerDia, ultimoDia) {
  const filas = prestaciones ?? [];
  const tocan = filas.filter(
    (p) => p.vigente_desde && p.vigente_desde <= ultimoDia && (!p.vigente_hasta || p.vigente_hasta >= primerDia),
  );

  // La raíz de cada cadena se busca entre todas las que llegaron. Los eslabones de una cadena
  // son contiguos, así que entre dos que tocan el período no queda ninguno afuera.
  const porId = new Map(filas.map((p) => [p.id, p]));
  const raizDe = (p) => {
    let actual = p;
    const vistos = new Set();
    while (actual.prestacion_anterior_id != null && porId.has(actual.prestacion_anterior_id) && !vistos.has(actual.id)) {
      vistos.add(actual.id);
      actual = porId.get(actual.prestacion_anterior_id);
    }
    return actual.id;
  };

  const elegida = new Map();
  for (const p of tocan) {
    const raiz = raizDe(p);
    const actual = elegida.get(raiz);
    if (!actual) {
      elegida.set(raiz, p);
      continue;
    }
    const pCorre = p.vigente_desde <= primerDia;
    const actualCorre = actual.vigente_desde <= primerDia;
    if (pCorre && !actualCorre) elegida.set(raiz, p);
    else if (pCorre === actualCorre && p.vigente_desde < actual.vigente_desde) elegida.set(raiz, p);
  }

  const quedan = new Set(elegida.values());
  return tocan.filter((p) => quedan.has(p));
}
