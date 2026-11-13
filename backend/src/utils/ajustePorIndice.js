import { enLaPrestadora } from '../db/connection.js';

// EL AJUSTE PERIÓDICO DEL PRECIO DE LAS PRESTACIONES POR ÍNDICE.
//
// Cada Servicio con índice —el propio, o si no el de la Prestadora— se ajusta cada tantos meses,
// cuando ya está publicado el valor del índice. La base hace todo (`ajustar_precios_por_indice`):
// elige las prestaciones a las que les toca, calcula el precio nuevo y, según la forma de ajuste,
// lo aplica o deja la propuesta para que la administración la acepte o la rechace. Acá sólo se la
// llama, de a una Prestadora por vez y con la credencial del trabajo de esa Prestadora: la base no
// deja correrla a nadie más.
//
// Una vuelta que falla no deja nada a medias —la función corre entera o no corre— y lo que no se
// ajustó hoy se ajusta mañana.
const NADA = Object.freeze({ aplicados: 0, propuestos: 0, sin_efecto: 0 });

export async function ajustarLosPreciosPorIndice(prestadoraId) {
  if (!prestadoraId) return { ...NADA };

  const { data, error } = await enLaPrestadora(prestadoraId, 'ajuste de precios por índice', (db) =>
    db.rpc('ajustar_precios_por_indice'));

  if (error) {
    console.error(`No se pudo ajustar los precios por índice (prestadora ${prestadoraId}):`, error.message);
    return { ...NADA };
  }
  const fila = Array.isArray(data) ? data[0] : data;
  return {
    aplicados: Number(fila?.aplicados ?? 0),
    propuestos: Number(fila?.propuestos ?? 0),
    sin_efecto: Number(fila?.sin_efecto ?? 0),
  };
}
