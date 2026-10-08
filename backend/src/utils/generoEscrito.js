// El género como llega escrito —una letra, la palabra entera, en cualquiera de los tres idiomas— y
// el código del catálogo que le corresponde. El Panel ya manda el código; una planilla manda lo que
// la Prestadora haya escrito, y puede llamar a la columna «sexo». Qué códigos acepta cada país lo
// decide el catálogo de la base, que es quien rechaza lo que no esté.
const EQUIVALENCIAS = {
  femenino: [
    'f', 'fem', 'femenino', 'femenina', 'mujer', 'hembra', 'femina', 'dama',
    'female', 'woman', 'feminino', 'mulher', 'femea',
  ],
  masculino: [
    'm', 'masc', 'masculino', 'masculina', 'varon', 'hombre', 'macho', 'caballero',
    'male', 'man', 'homem',
  ],
  x: ['x', 'no binario', 'no binaria', 'nobinario', 'non binary', 'non-binary', 'nao binario'],
};

export const CODIGOS_DE_GENERO = Object.keys(EQUIVALENCIAS);

const CODIGO_DE = new Map(
  Object.entries(EQUIVALENCIAS).flatMap(([codigo, palabras]) => palabras.map((p) => [p, codigo]))
);

function limpiar(valor) {
  return String(valor ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\./g, '').trim().replace(/\s+/g, ' ');
}

/**
 * `{ codigo }` si se reconoce, `{ falta: true }` si viene vacío, `{ desconocido: true }` si no.
 */
export function generoEscrito(valor) {
  const limpio = limpiar(valor);
  if (!limpio) return { falta: true };
  const codigo = CODIGO_DE.get(limpio);
  return codigo ? { codigo } : { desconocido: true };
}

// Una letra de más, de menos, cambiada o dos letras dadas vuelta.
function aUnaLetra(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  const fila = (n) => Array.from({ length: n + 1 }, (_, i) => i);
  let anterior = null;
  let previa = fila(b.length);
  for (let i = 1; i <= a.length; i += 1) {
    const actual = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      actual[j] = Math.min(previa[j] + 1, actual[j - 1] + 1, previa[j - 1] + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        actual[j] = Math.min(actual[j], anterior[j - 2] + 1);
      }
    }
    anterior = previa;
    previa = actual;
  }
  return previa[b.length] <= 1;
}

/**
 * El error de tipeo evidente: a una letra de una palabra conocida de cinco letras o más, y todas
 * las que quedan a esa distancia dicen el mismo género. Las palabras cortas no se corrigen, porque
 * una letra ahí ya es otra palabra. `{ codigo }` o `null`.
 */
export function generoParecido(valor) {
  const limpio = limpiar(valor);
  if (limpio.length < 5) return null;
  const codigos = new Set();
  for (const [palabra, codigo] of CODIGO_DE) {
    if (palabra.length >= 5 && aUnaLetra(limpio, palabra)) codigos.add(codigo);
  }
  return codigos.size === 1 ? { codigo: [...codigos][0] } : null;
}
