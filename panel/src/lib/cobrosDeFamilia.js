// ---------------------------------------------------------------------------
// cobrosDeFamilia.js — qué se admite como cobro, escrito una sola vez
//
// POR QUÉ EXISTE
// La misma decisión —qué monto es válido, cómo se lee un período, contra qué se
// compara el medio— hacía falta en dos lados: el backend, que la controla antes de
// escribir en la base, y el Panel, que arma el desplegable y decide si el botón
// de guardar está habilitado. Escrita dos veces, el día que se agregue un medio
// nuevo el desplegable y el control se separan, y la pantalla ofrece algo que la
// base después rechaza (regla 12 de CLAUDE.md §7).
//
// QUÉ NO ES
// No reemplaza el control de la base. La restricción de verdad es la de la tabla
// `cobros_familia`: si algo se cuela por acá, la base lo frena igual. Esto sirve
// para contestar antes y con una frase entendible, no para ser la única guarda.
//
// El original vive en el Panel y se copia al backend; la lista de copias está en
// `scripts/copias_entre_apps.mjs` y `verificar_identidad.mjs` corta el build si
// alguna se despegó.
// ---------------------------------------------------------------------------

// Con qué medio se pagó ya no se escribe acá. Sale de la lista `medios_de_pago_de_la_familia` del
// registro de dos pisos —las que trae el producto y las que agregó cada Prestadora—, que es otra
// que la del pago al Asistente porque no son los mismos medios. Quien llama trae esa lista y se la
// pasa a la comprobación de abajo.

// De dónde puede venir un cobro cargado de afuera. 'panel' es el de adentro y
// 'migracion' lo escribe una migración y nadie más, por eso ninguno de los dos
// está en esta lista.
export const ORIGENES_DE_AFUERA = ['importacion', 'api', 'pasarela'];

// Un lote grande de golpe es una transacción que tarda y una respuesta enorme.
// Se corta acá y se le dice a quien envía que mande de a partes; reintentar no le
// cuesta nada porque el envío es idempotente.
export const TOPE_DEL_LOTE = 500;

/* Lo que está mal en un cobro que entra, dicho en una frase, o null si está bien.
 *
 * `mediosAdmitidos` son las claves de la lista `medios_de_pago_de_la_familia` que alcanzan a esta
 * Prestadora.
 * Sin esa lista no se admite ningún medio: un control que no pudo resolver contra qué comparar
 * tiene que negar, nunca dejar pasar. */
export function loQueEstaMalEnElCobro(cobro, mediosAdmitidos) {
  if (!cobro || typeof cobro !== 'object') return 'Falta el cobro';

  const monto = Number(cobro.monto);
  if (!Number.isFinite(monto) || monto <= 0) return 'El monto tiene que ser un número mayor que cero';

  if (cobro.fecha_cobro !== undefined && cobro.fecha_cobro !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(cobro.fecha_cobro))) {
    return 'La fecha del cobro va en formato AAAA-MM-DD';
  }
  const medios = Array.isArray(mediosAdmitidos) ? mediosAdmitidos : [];
  if (!medios.includes(cobro.medio)) return 'El medio de cobro no es uno de los admitidos';
  return null;
}

/** El período AAAA-MM que se pide desde la pantalla, convertido al primer día del mes. */
export function primerDiaDelPeriodo(periodo) {
  if (typeof periodo !== 'string' || !/^\d{4}-\d{2}$/.test(periodo)) return null;
  const mes = Number(periodo.slice(5, 7));
  if (mes < 1 || mes > 12) return null;
  return `${periodo}-01`;
}

/** Los importes redondeados a dos decimales, que es como los guarda la base. */
export function aDosDecimales(valor) {
  return Math.round(Number(valor) * 100) / 100;
}
