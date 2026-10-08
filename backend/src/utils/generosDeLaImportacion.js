import { generoEscrito, generoParecido, CODIGOS_DE_GENERO } from './generoEscrito.js';

// El género de una planilla grande, leído antes de crear a nadie y todo junto: cada forma distinta
// de escribirlo se mira una sola vez, aunque aparezca en mil filas.
//
// Primero lo que se reconoce tal cual; después el error de tipeo evidente, a una letra de una
// palabra conocida; y lo que todavía queda se le pregunta a la IA en un solo pedido. La IA propone
// y nunca confirma: lo que contesta sólo vale si es exactamente uno de los códigos del catálogo, y
// ante la duda contesta vacío. Lo que no se resuelve vuelve en el archivo de no cargados con su
// motivo, como siempre: nadie elige a ojo.

/**
 * `valores`: los géneros como vienen en la planilla, repetidos o no.
 * `proponer`: la IA, o `null` si no hay clave.
 * Devuelve un Map de lo escrito al código, sólo con lo que hubo que corregir.
 */
export async function resolverGeneros({ valores, proponer }) {
  const corregidos = new Map();
  const dudosos = [];
  for (const valor of new Set(valores.filter((v) => v != null).map(String))) {
    if (!generoEscrito(valor).desconocido) continue;
    const parecido = generoParecido(valor);
    if (parecido) corregidos.set(valor, parecido.codigo);
    else dudosos.push(valor);
  }
  if (!dudosos.length || !proponer) return corregidos;

  let resultados = [];
  try {
    resultados = await proponer(dudosos.map((escrito, i) => ({ clave: String(i), escrito })));
  } catch (error) {
    console.error('Importación, géneros:', error?.message ?? error);
    return corregidos;
  }
  for (const { clave, codigo } of Array.isArray(resultados) ? resultados : []) {
    const escrito = dudosos[Number(clave)];
    if (escrito !== undefined && CODIGOS_DE_GENERO.includes(codigo)) corregidos.set(escrito, codigo);
  }
  return corregidos;
}
