/* Las condiciones con las que se le cobra a cada Cliente.
   ==========================================================================

   Cada decisión se toma en tres capas que se pisan en orden:

     1. el valor de fábrica, escrito acá abajo;
     2. el de la Prestadora, en `configuracion_facturacion_clientes.regla`;
     3. el del Servicio, en las columnas de `condiciones_comerciales_servicio`.

   Gana la última capa que tenga un valor válido. Vacío quiere decir «rige el de arriba», y un
   valor que no sirve para esa clave también se ignora: así una fila vieja o mal cargada no deja
   una factura sin forma de calcularse.

   Hay cuatro clases de valor:
     - de una lista: un texto que tiene que estar en la lista;
     - sí o no: un booleano;
     - un entero entre dos bordes;
     - un código: un texto con algo adentro, que sale de la base (el índice).

   Lo usan el panel y el backend. El original es éste; la copia del backend la genera
   `scripts/sincronizar_copias.mjs`, y no se edita a mano. */

// Cómo se llega al precio de una prestación: desde una lista de precios, o negociado.
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

// Cómo se aplica el ajuste por índice: solo, o propuesto para que la administración lo acepte.
export const AJUSTES_POR_INDICE = Object.freeze({
  AUTOMATICO: 'automatico',
  REVISION_PREVIA: 'revision_previa',
});

// El valor que un Servicio guarda para decir «sin índice», aunque la Prestadora tenga uno.
export const SIN_INDICE = 'ninguno';

export const FORMAS_DE_PRECIO_POSIBLES = Object.freeze(Object.values(FORMAS_DE_PRECIO));
export const FRECUENCIAS_DE_COBRO_POSIBLES = Object.freeze(Object.values(FRECUENCIAS_DE_COBRO_AL_CLIENTE));
export const MEDICIONES_POSIBLES = Object.freeze(Object.values(MEDICIONES));
export const AJUSTES_POR_INDICE_POSIBLES = Object.freeze(Object.values(AJUSTES_POR_INDICE));

// El tiempo entre actualizaciones por índice: mensual, trimestral o semestral.
export const MESES_ENTRE_ACTUALIZACIONES_POSIBLES = Object.freeze([1, 3, 6]);

// Los bordes de los valores enteros.
export const BORDES = Object.freeze({
  recargo_del_adicional: Object.freeze({ minimo: 0, maximo: 500 }),
});

// Lo que rige cuando ni la Prestadora ni el Servicio dijeron nada.
//   La medición de fábrica: se descuenta lo que no se prestó por causa de la Prestadora o del
//   Asistente, se cobra lo que canceló el Cliente, y lo adicional se cobra al valor proporcional
//   del precio pactado, sin recargo.
export const VALORES_DE_FABRICA_DEL_CLIENTE = Object.freeze({
  forma_de_precio: FORMAS_DE_PRECIO.DIRECTO,
  frecuencia_de_cobro: FRECUENCIAS_DE_COBRO_AL_CLIENTE.MES,
  medicion: MEDICIONES.PACTADO_MAS_EXCEDENTE,
  cobra_cancelada_por_el_cliente: true,
  descuenta_lo_no_prestado: true,
  cobra_guardias_adicionales: true,
  cobra_horas_adicionales: true,
  recargo_del_adicional: 0,
  indice_de_actualizacion: null,
  meses_entre_actualizaciones: 1,
  ajuste_por_indice: AJUSTES_POR_INDICE.REVISION_PREVIA,
});

// Qué clase de valor acepta cada clave.
const TIPOS = Object.freeze({
  forma_de_precio: { lista: FORMAS_DE_PRECIO_POSIBLES },
  frecuencia_de_cobro: { lista: FRECUENCIAS_DE_COBRO_POSIBLES },
  medicion: { lista: MEDICIONES_POSIBLES },
  cobra_cancelada_por_el_cliente: { siNo: true },
  descuenta_lo_no_prestado: { siNo: true },
  cobra_guardias_adicionales: { siNo: true },
  cobra_horas_adicionales: { siNo: true },
  recargo_del_adicional: { entero: BORDES.recargo_del_adicional },
  indice_de_actualizacion: { codigo: true },
  meses_entre_actualizaciones: { entero: { valores: MESES_ENTRE_ACTUALIZACIONES_POSIBLES } },
  ajuste_por_indice: { lista: AJUSTES_POR_INDICE_POSIBLES },
});

export const CLAVES_DE_LAS_CONDICIONES = Object.freeze(Object.keys(VALORES_DE_FABRICA_DEL_CLIENTE));

// Las claves que son sí o no, y las que son enteros: la interfaz las dibuja distinto.
export const CLAVES_SI_NO = Object.freeze(CLAVES_DE_LAS_CONDICIONES.filter((c) => TIPOS[c].siNo));
export const CLAVES_ENTERAS = Object.freeze(CLAVES_DE_LAS_CONDICIONES.filter((c) => TIPOS[c].entero));

const existe = (clave) => Object.prototype.hasOwnProperty.call(TIPOS, clave);

// Si un valor sirve para una clave. Una clave que no existe no acepta nada: falla cerrado.
export function esValorDeLaCondicion(clave, valor) {
  if (!existe(clave)) return false;
  const tipo = TIPOS[clave];
  if (tipo.siNo) return typeof valor === 'boolean';
  if (tipo.entero) {
    if (!Number.isInteger(valor)) return false;
    if (tipo.entero.valores) return tipo.entero.valores.includes(valor);
    return valor >= tipo.entero.minimo && valor <= tipo.entero.maximo;
  }
  if (typeof valor !== 'string' || valor.trim() === '') return false;
  if (tipo.codigo) return true;
  return tipo.lista.includes(valor);
}

/* Lo que llega de un casillero viene como texto: 'true', '3'. Esto lo pasa a la clase de valor
   de la clave. Vacío o null devuelve null («rige el de arriba»). Un texto que no se puede leer
   se devuelve tal cual, para que la revisión lo rechace y diga cuál clave está mal. */
export function leerValorDeLaCondicion(clave, llega) {
  if (llega === undefined || llega === null || llega === '') return null;
  if (!existe(clave)) return llega;
  const tipo = TIPOS[clave];
  if (tipo.siNo) {
    if (llega === true || llega === 'true') return true;
    if (llega === false || llega === 'false') return false;
    return llega;
  }
  if (tipo.entero) {
    if (typeof llega === 'number') return llega;
    if (typeof llega === 'string' && /^\s*-?\d+\s*$/.test(llega)) return Number(llega.trim());
    return llega;
  }
  return llega;
}

/* La condición que rige para un Servicio.
   - clave: una de CLAVES_DE_LAS_CONDICIONES.
   - deLaPrestadora: la `regla` de la Prestadora (o null).
   - delServicio: la fila de `condiciones_comerciales_servicio` (o null).
   El índice que queda en SIN_INDICE devuelve null: no hay ajuste por índice. */
export function condicionDe(clave, deLaPrestadora, delServicio) {
  if (!existe(clave)) return undefined;

  let valor = VALORES_DE_FABRICA_DEL_CLIENTE[clave];
  if (esValorDeLaCondicion(clave, deLaPrestadora?.[clave])) valor = deLaPrestadora[clave];
  if (esValorDeLaCondicion(clave, delServicio?.[clave])) valor = delServicio[clave];

  if (clave === 'indice_de_actualizacion' && valor === SIN_INDICE) return null;
  return valor;
}

// Todas las condiciones juntas.
export function condicionesDe(deLaPrestadora, delServicio) {
  const resultado = {};
  for (const clave of CLAVES_DE_LAS_CONDICIONES) {
    resultado[clave] = condicionDe(clave, deLaPrestadora, delServicio);
  }
  return resultado;
}

// Para comparar contra lo que rige: el índice null y SIN_INDICE son lo mismo.
function igualA(clave, a, b) {
  if (clave === 'indice_de_actualizacion') return (a ?? SIN_INDICE) === (b ?? SIN_INDICE);
  return a === b;
}

/* Revisa lo que llega para guardar como valores de la Prestadora.
   Devuelve { ok: true, valor } con sólo lo que difiere de fábrica —una regla que repite lo de
   fábrica hace creer que alguien lo decidió—, o { ok: false, clave } con la primera clave mal.
   Una clave ausente, null o vacía quiere decir «la de fábrica» y no se guarda. Los valores que
   llegan como texto desde un casillero se leen con `leerValorDeLaCondicion`. */
export function condicionesQueSePuedenGuardar(entrada) {
  const valor = {};
  for (const clave of CLAVES_DE_LAS_CONDICIONES) {
    const llega = leerValorDeLaCondicion(clave, entrada?.[clave]);
    if (llega === null) continue;
    if (!esValorDeLaCondicion(clave, llega)) return { ok: false, clave };
    if (!igualA(clave, llega, VALORES_DE_FABRICA_DEL_CLIENTE[clave])) valor[clave] = llega;
  }
  return { ok: true, valor };
}

/* Revisa una sola condición propia de un Servicio.
   Devuelve { ok: true, valor } o { ok: false, clave }. El valor null quiere decir «rige el de la
   Prestadora». Si se pasa `deLaPrestadora`, un valor igual al que ya rige desde arriba también
   se guarda como null: el casillero muestra siempre lo que rige, y elegir eso mismo no es una
   decisión propia del Servicio. */
export function condicionDelServicioQueSePuedeGuardar(clave, llegaCrudo, deLaPrestadora) {
  const llega = leerValorDeLaCondicion(clave, llegaCrudo);
  if (llega === null) return { ok: true, valor: null };
  if (!esValorDeLaCondicion(clave, llega)) return { ok: false, clave };
  if (deLaPrestadora !== undefined) {
    const deArriba = condicionDe(clave, deLaPrestadora, null);
    if (igualA(clave, llega, deArriba)) return { ok: true, valor: null };
  }
  return { ok: true, valor: llega };
}
