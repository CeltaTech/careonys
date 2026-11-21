import { enLaPrestadora } from '../db/connection.js';

// EL AJUSTE PERIÓDICO DEL VALOR DEL LEGAJO POR ÍNDICE.
//
// Es el mismo ajuste que el del precio de las prestaciones, del lado de lo que se le paga a cada
// Asistente: la Prestadora elige en la configuración del pago a los Asistentes el índice, cada
// cuántos meses se actualiza y si el valor nuevo se aplica solo o queda propuesto para que la
// administración lo revise. La base hace todo (`ajustar_valores_del_legajo_por_indice`): elige
// los Legajos a los que les toca, calcula el valor nuevo y lo aplica, guardando el anterior en la
// historia, o deja la propuesta. Acá sólo se la llama, de a una Prestadora por vez y con la
// credencial del trabajo de esa Prestadora: la base no deja correrla a nadie más.
//
// Una vuelta que falla no deja nada a medias —la función corre entera o no corre— y lo que no se
// ajustó hoy se ajusta mañana.
const NADA = Object.freeze({ aplicados: 0, propuestos: 0, sin_efecto: 0 });

export async function ajustarLosValoresDelLegajoPorIndice(prestadoraId) {
  if (!prestadoraId) return { ...NADA };

  const { data, error } = await enLaPrestadora(prestadoraId, 'ajuste del valor del Legajo por índice', (db) =>
    db.rpc('ajustar_valores_del_legajo_por_indice'));

  if (error) {
    console.error(`No se pudo ajustar el valor del Legajo por índice (prestadora ${prestadoraId}):`, error.message);
    return { ...NADA };
  }
  const fila = Array.isArray(data) ? data[0] : data;
  return {
    aplicados: Number(fila?.aplicados ?? 0),
    propuestos: Number(fila?.propuestos ?? 0),
    sin_efecto: Number(fila?.sin_efecto ?? 0),
  };
}
