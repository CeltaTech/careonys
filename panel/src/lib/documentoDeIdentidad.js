/* El documento con que se identifica una Persona del Directorio.
   ==========================================================================

   Lo mismo que controla la base al guardar, hecho antes en el navegador para que el aviso aparezca
   al pie del casillero y no como un error suelto. La base lo vuelve a controlar igual: lo de acá
   es para avisar, no para decidir.

   EL DÍGITO VERIFICADOR SE CONTROLA SÓLO DONDE EL CATÁLOGO LO DICE. Qué tipos lo llevan sale de
   la columna `verifica_modulo_11` del catálogo del país, no de una lista escrita acá.

   Y LAS DOS CUENTAS TIENEN QUE DAR LO MISMO. Esta y `interno.cumple_modulo_11` de la base: si
   difieren, la pantalla deja pasar un número que la base rechaza, o al revés. */

const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Once dígitos, y el último es el que sale de la cuenta con los diez anteriores. */
export function cumpleModulo11(numero) {
  if (!/^\d{11}$/.test(numero ?? '')) return false;
  const suma = PESOS.reduce((total, peso, i) => total + peso * Number(numero[i]), 0);
  const resto = 11 - (suma % 11);
  if (resto === 10) return false;
  return (resto === 11 ? 0 : resto) === Number(numero[10]);
}

/** Como lo guarda la base: sin espacios, puntos ni guiones los que llevan dígito verificador, y
    en mayúsculas los demás. */
export function normalizarNumero(numero, verificaModulo11) {
  const texto = (numero ?? '').trim();
  return verificaModulo11 ? texto.replace(/[\s.-]/g, '') : texto.toUpperCase();
}

/** Un número de once dígitos con dígito verificador, escrito como se lo lee: 20-20111222-3.
    Cualquier otro número queda como llegó. */
export function numeroConGuiones(numero) {
  const texto = String(numero ?? '');
  if (!/^\d{11}$/.test(texto)) return texto;
  return `${texto.slice(0, 2)}-${texto.slice(2, 10)}-${texto.slice(10)}`;
}

/** El DNI sin espacios, puntos ni guiones. */
export function normalizarDni(dni) {
  return String(dni ?? '').replace(/[\s.-]/g, '');
}

/** El DNI tiene que ser el que lleva adentro el número fiscal: los ocho dígitos del medio. */
export function dniCoincide(dni, numero) {
  const limpio = normalizarDni(dni);
  if (!/^\d{1,8}$/.test(limpio)) return false;
  return limpio.replace(/^0+/, '') === String(numero ?? '').slice(2, 10).replace(/^0+/, '');
}

/** Qué le falta o qué tiene mal el documento, casillero por casillero. Vacío si está bien.
    `tipo` es la fila del catálogo elegida, o `null` si no se eligió ninguna. El DNI se controla
    sólo si el tipo lo lleva adentro, y el género sólo si se pide (`pideGenero`). */
export function avisosDelDocumento({ tipo, numero, pais, dni, genero, pideGenero = false }) {
  const avisos = {};
  if (pideGenero && !genero) avisos.genero = 'falta_el_genero';
  if (!tipo) return { documento_tipo: 'falta_el_documento', ...avisos };
  const normalizado = normalizarNumero(numero, tipo.verifica_modulo_11);
  const numeroValido = Boolean(normalizado) && (!tipo.verifica_modulo_11 || cumpleModulo11(normalizado));
  if (!normalizado) avisos.documento_numero = 'falta_el_documento';
  else if (!numeroValido) avisos.documento_numero = 'numero_no_valido';
  if (tipo.lleva_pais && !pais) avisos.documento_pais = 'falta_el_pais';
  if (tipo.contiene_dni) {
    if (!normalizarDni(dni)) avisos.dni = 'falta_el_dni';
    else if (numeroValido && !dniCoincide(dni, normalizado)) avisos.dni = 'dni_no_coincide';
  }
  return avisos;
}

/** Cómo se nombra un tipo en pantalla: por su nombre en el idioma de quien mira si lo tiene, y si
    no por la sigla que trae el catálogo, que es como lo dice el país. */
export function nombreDelTipo(tipo, nombres) {
  if (!tipo) return '';
  return nombres?.[tipo.codigo] ?? tipo.sigla;
}
