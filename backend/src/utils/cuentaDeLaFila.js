import { supabase } from '../db/connection.js';

// De qué cuenta cuelga un Legajo de Asistente o una Ficha del cliente, escrito una sola vez.
//
// Desde que una misma persona puede estar en varias Prestadoras, el Legajo de Asistente y el de
// Cliente tienen identificador propio, y ese número ya no es el de la cuenta. Todo lo que cuelga
// del Legajo —guardias, matrículas, pacientes, mensajes— guarda el del Legajo; lo de la persona
// —cómo se llama, qué teléfono tiene, con qué entra— sigue estando en la cuenta.
//
// Preguntarle a `usuarios` con un número de Legajo no devuelve nada, y el defecto no se nota: la
// pantalla muestra un nombre vacío y nadie sabe por qué. Por eso el paso de uno al otro se hace
// acá y en ningún otro lado.

/** La cuenta de un solo renglón. Devuelve el identificador de la cuenta, o `null`. */
export async function cuentaDeLaFila(tabla, filaId, prestadoraId) {
  if (!filaId || !prestadoraId) return null;
  const { data } = await supabase
    .from(tabla)
    .select('usuario_id')
    .eq('id', filaId)
    .eq('prestadora_id', prestadoraId)
    .maybeSingle();
  return data?.usuario_id || null;
}

/**
 * Datos de la cuenta de varios renglones de una vez, en un mapa de renglón a datos.
 *
 * `columnas` son las de `usuarios` que hacen falta —`nombre`, `telefono`—, y nunca todas: lo que
 * no se pide no viaja.
 */
export async function cuentasDeLasFilas(tabla, filaIds, columnas, prestadoraId) {
  const mapa = new Map();
  const unicos = [...new Set((filaIds ?? []).filter(Boolean))];
  if (unicos.length === 0 || !prestadoraId) return mapa;

  const { data, error } = await supabase
    .from(tabla)
    .select(`id, usuarios!inner(${columnas})`)
    .in('id', unicos)
    .eq('prestadora_id', prestadoraId);
  if (error) {
    console.error(`No se pudieron leer las cuentas de ${tabla}:`, error.message);
    return mapa;
  }

  for (const fila of data ?? []) mapa.set(fila.id, fila.usuarios ?? null);
  return mapa;
}
