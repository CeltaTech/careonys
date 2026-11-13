/* Las condiciones con las que se le cobra a cada Cliente.
   ==========================================================================

   Son cinco decisiones, y cada una se toma en tres capas que se pisan en orden:

     1. el valor de fábrica, escrito acá abajo;
     2. el de la Prestadora, en `configuracion_facturacion_clientes.regla`;
     3. el del Servicio, en las columnas de `condiciones_comerciales_servicio`.

   Gana la última capa que tenga un valor válido. Vacío quiere decir «rige el de arriba», y un
   valor que no está en la lista también se ignora: así una fila vieja o mal cargada no deja una
   factura sin forma de calcularse.

   Lo usan el panel y el backend. El original es éste; la copia del backend la genera
   `scripts/sincronizar_copias.mjs`, y no se edita a mano. */

// Cómo se llega al precio de una prestación: desde una lista de precios, o escrito directo.
export const FORMAS_DE_PRECIO = Object.freeze({
  LISTA: 'lista',
  DIRECTO: 'directo',
});

// Cada cuánto se le factura al Cliente. La quincena son dos semanas juntas, no la mitad del mes.
export const FRECUENCIAS_DE_COBRO_AL_CLIENTE = Object.freeze({
  DIA: 'dia',
  SEMANA: 'semana',
  QUINCENA: 'quincena',
  MES: 'mes',
});

// Con qué se mide lo que se le cobra.
//   pactado_mas_excedente: lo acordado por período, más lo que se trabajó por encima de lo acordado.
//   hora: cada hora trabajada.
//   dia_de_guardia: cada día en que hubo una guardia.
export const MEDICIONES = Object.freeze({
  PACTADO_MAS_EXCEDENTE: 'pactado_mas_excedente',
  HORA: 'hora',
  DIA_DE_GUARDIA: 'dia_de_guardia',
});

// Cómo se actualizan los precios con el tiempo.
export const FORMAS_DE_ACTUALIZACION = Object.freeze({
  MANUAL: 'manual',
  IMPORTACION: 'importacion',
  INDICE: 'indice',
});

export const FORMAS_DE_PRECIO_POSIBLES = Object.freeze(Object.values(FORMAS_DE_PRECIO));
export const FRECUENCIAS_DE_COBRO_POSIBLES = Object.freeze(Object.values(FRECUENCIAS_DE_COBRO_AL_CLIENTE));
export const MEDICIONES_POSIBLES = Object.freeze(Object.values(MEDICIONES));
export const FORMAS_DE_ACTUALIZACION_POSIBLES = Object.freeze(Object.values(FORMAS_DE_ACTUALIZACION));

// Lo que rige cuando ni la Prestadora ni el Servicio dijeron nada.
export const VALORES_DE_FABRICA_DEL_CLIENTE = Object.freeze({
  forma_de_precio: FORMAS_DE_PRECIO.DIRECTO,
  frecuencia_de_cobro: FRECUENCIAS_DE_COBRO_AL_CLIENTE.MES,
  medicion: MEDICIONES.PACTADO_MAS_EXCEDENTE,
  forma_de_actualizacion: FORMAS_DE_ACTUALIZACION.MANUAL,
  indice_de_actualizacion: null,
});

// Qué valores acepta cada clave. El índice es un código de texto que sale de la base, así que
// acá sólo se le pide que sea un texto con algo adentro.
const VALORES_POSIBLES = Object.freeze({
  forma_de_precio: FORMAS_DE_PRECIO_POSIBLES,
  frecuencia_de_cobro: FRECUENCIAS_DE_COBRO_POSIBLES,
  medicion: MEDICIONES_POSIBLES,
  forma_de_actualizacion: FORMAS_DE_ACTUALIZACION_POSIBLES,
  indice_de_actualizacion: null,
});

export const CLAVES_DE_LAS_CONDICIONES = Object.freeze(Object.keys(VALORES_DE_FABRICA_DEL_CLIENTE));

// Si un valor sirve para una clave. Una clave que no existe no acepta nada: falla cerrado.
export function esValorDeLaCondicion(clave, valor) {
  if (!Object.prototype.hasOwnProperty.call(VALORES_POSIBLES, clave)) return false;
  if (typeof valor !== 'string' || valor.trim() === '') return false;
  const posibles = VALORES_POSIBLES[clave];
  return posibles === null ? true : posibles.includes(valor);
}

/* La condición que rige para un Servicio.
   - clave: una de CLAVES_DE_LAS_CONDICIONES.
   - deLaPrestadora: la `regla` de la Prestadora (o null).
   - delServicio: la fila de `condiciones_comerciales_servicio` (o null).
   El índice sólo rige si la forma de actualización que quedó es 'indice'. */
export function condicionDe(clave, deLaPrestadora, delServicio) {
  if (!Object.prototype.hasOwnProperty.call(VALORES_DE_FABRICA_DEL_CLIENTE, clave)) return undefined;

  let valor = VALORES_DE_FABRICA_DEL_CLIENTE[clave];
  if (esValorDeLaCondicion(clave, deLaPrestadora?.[clave])) valor = deLaPrestadora[clave];
  if (esValorDeLaCondicion(clave, delServicio?.[clave])) valor = delServicio[clave];

  if (clave === 'indice_de_actualizacion') {
    const forma = condicionDe('forma_de_actualizacion', deLaPrestadora, delServicio);
    if (forma !== FORMAS_DE_ACTUALIZACION.INDICE) return null;
  }
  return valor;
}

// Las cinco condiciones juntas.
export function condicionesDe(deLaPrestadora, delServicio) {
  const resultado = {};
  for (const clave of CLAVES_DE_LAS_CONDICIONES) {
    resultado[clave] = condicionDe(clave, deLaPrestadora, delServicio);
  }
  return resultado;
}

/* Revisa lo que llega para guardar como valores de la Prestadora.
   Devuelve { ok: true, valor } con sólo lo que difiere de fábrica —una regla que repite lo de
   fábrica hace creer que alguien lo decidió—, o { ok: false, clave } con la primera clave mal.
   Una clave ausente, null o vacía quiere decir «la de fábrica» y no se guarda. */
export function condicionesQueSePuedenGuardar(entrada) {
  const valor = {};
  for (const clave of CLAVES_DE_LAS_CONDICIONES) {
    const llega = entrada?.[clave];
    if (llega === undefined || llega === null || llega === '') continue;
    if (!esValorDeLaCondicion(clave, llega)) return { ok: false, clave };
    if (llega !== VALORES_DE_FABRICA_DEL_CLIENTE[clave]) valor[clave] = llega;
  }
  const forma = valor.forma_de_actualizacion ?? VALORES_DE_FABRICA_DEL_CLIENTE.forma_de_actualizacion;
  if (forma === FORMAS_DE_ACTUALIZACION.INDICE && !valor.indice_de_actualizacion) {
    return { ok: false, clave: 'indice_de_actualizacion' };
  }
  if (forma !== FORMAS_DE_ACTUALIZACION.INDICE) delete valor.indice_de_actualizacion;
  return { ok: true, valor };
}

/* Revisa una sola condición propia de un Servicio. Vacío se guarda como null, que quiere decir
   «rige el de la Prestadora». */
export function condicionDelServicioQueSePuedeGuardar(clave, llega) {
  if (llega === undefined || llega === null || llega === '') return { ok: true, valor: null };
  if (!esValorDeLaCondicion(clave, llega)) return { ok: false, clave };
  return { ok: true, valor: llega };
}
