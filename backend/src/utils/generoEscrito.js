// El género como llega escrito —una letra, la palabra entera, en cualquiera de los tres idiomas— y
// el código del catálogo que le corresponde. El Panel ya manda el código; una planilla manda lo que
// la Prestadora haya escrito, y puede llamar a la columna «sexo». Qué códigos acepta cada país lo
// decide el catálogo de la base, que es quien rechaza lo que no esté.
const EQUIVALENCIAS = {
  femenino: ['f', 'fem', 'femenino', 'femenina', 'mujer', 'female', 'woman', 'feminino'],
  masculino: ['m', 'masc', 'masculino', 'masculina', 'varon', 'hombre', 'male', 'man'],
  x: ['x', 'no binario', 'no binaria', 'nobinario', 'non binary', 'non-binary', 'nao binario'],
};

const CODIGO_DE = new Map(
  Object.entries(EQUIVALENCIAS).flatMap(([codigo, palabras]) => palabras.map((p) => [p, codigo]))
);

/**
 * `{ codigo }` si se reconoce, `{ falta: true }` si viene vacío, `{ desconocido: true }` si no.
 */
export function generoEscrito(valor) {
  const limpio = String(valor ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\./g, '').trim().replace(/\s+/g, ' ');
  if (!limpio) return { falta: true };
  const codigo = CODIGO_DE.get(limpio);
  return codigo ? { codigo } : { desconocido: true };
}
