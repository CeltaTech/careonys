// Las funciones que en el servidor corren adentro de `enLaPrestadora`, en las pruebas también. Sin
// Prestadora, `supabase` se corta, así que una prueba que llama una de esas funciones de forma
// directa la envuelve acá.
import { enLaPrestadora } from '../db/connection.js';

export const PRESTADORA_DE_PRUEBA = '0a000000-0000-4000-8000-0000000000a1';

/** `fn` corriendo adentro de la Prestadora, con los mismos argumentos y la misma respuesta. */
export function adentro(fn, prestadoraId = PRESTADORA_DE_PRUEBA) {
  return (...argumentos) => enLaPrestadora(prestadoraId, 'prueba', () => fn(...argumentos));
}

/** La conexión de una Prestadora, para la prueba que se la pasa a la función. */
export function conexionDe(prestadoraId = PRESTADORA_DE_PRUEBA) {
  return enLaPrestadora(prestadoraId, 'prueba', (conexion) => conexion);
}
