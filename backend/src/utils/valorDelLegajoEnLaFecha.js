// ---------------------------------------------------------------------------
// valorDelLegajoEnLaFecha.js — con qué valor del Legajo se paga un día
//
// El valor del Legajo cambia con el tiempo: lo corrige la administración o lo ajusta el índice.
// Cada cambio deja el valor anterior en la historia, con el día desde el que rigió. Una
// liquidación paga cada turno de guardia con el valor que regía el día de ese turno, no con el
// de hoy.
//
// LA MISMA ELECCIÓN QUE LA BASE. La base tiene la función `valor_del_legajo_en`, que contesta
// para un Asistente y un día. Llamarla una vez por turno de guardia serían miles de pedidos por
// mes, así que la liquidación lee las dos tablas una sola vez y elige acá, con la misma regla:
// rige la fila con el día de inicio más reciente que no sea posterior a la fecha; si la fecha es
// anterior a todas, la más antigua.
//
// Sin base adentro: entran filas y una fecha, sale la fila.
// ---------------------------------------------------------------------------

// Una fila sin día de inicio rige desde siempre. La base no la deja guardar así; el caso
// queda cubierto para que un dato incompleto no saque a nadie de la liquidación.
const desdeCuando = (fila) => fila.rige_desde ?? '';

/**
 * Las filas del Legajo de cada Asistente: la vigente y las anteriores, juntas.
 *
 * La vigente trae además cosas que la historia no guarda, como la frecuencia de pago. Esas
 * siguen saliendo de la vigente, que es lo que se arregló hoy con la persona.
 */
export function filasDelLegajoPorAsistente(vigentes, anteriores) {
  const porAsistente = new Map();
  for (const fila of [...(vigentes || []), ...(anteriores || [])]) {
    if (!porAsistente.has(fila.asistente_id)) porAsistente.set(fila.asistente_id, []);
    porAsistente.get(fila.asistente_id).push(fila);
  }
  return porAsistente;
}

/** La fila que rige en esa fecha, o null si el Asistente no tiene ninguna. */
export function valorDelLegajoEnLaFecha(filas, fecha) {
  if (!filas || filas.length === 0) return null;
  let vigente = null;
  let laMasAntigua = null;
  for (const fila of filas) {
    const desde = desdeCuando(fila);
    if (desde <= fecha && (vigente === null || desde > desdeCuando(vigente))) vigente = fila;
    if (laMasAntigua === null || desde < desdeCuando(laMasAntigua)) laMasAntigua = fila;
  }
  return vigente ?? laMasAntigua;
}

// El día anterior a una fecha `AAAA-MM-DD`, en hora universal para que ningún cambio de hora
// corra un día.
function diaAnterior(fecha) {
  const dia = new Date(`${fecha}T00:00:00Z`);
  dia.setUTCDate(dia.getUTCDate() - 1);
  return dia.toISOString().slice(0, 10);
}

/**
 * Los tramos de un período, cada uno con la fila del Legajo que rigió en sus días.
 *
 * Devuelve `[{ desde, hasta, fila }]`, seguidos y sin huecos, que cubren el período entero. El
 * primero empieza el primer día con la fila que regía ese día, y cada fila que empieza a regir
 * adentro del período abre un tramo nuevo. Sin filas, devuelve una lista vacía.
 */
export function tramosDelLegajoEnElPeriodo(filas, { desde, hasta }) {
  if (!filas || filas.length === 0) return [];
  const inicios = [...new Set(filas.map(desdeCuando).filter((inicio) => inicio > desde && inicio <= hasta))].sort();
  const tramos = [];
  for (const inicio of [desde, ...inicios]) {
    const fila = valorDelLegajoEnLaFecha(filas, inicio);
    const anterior = tramos[tramos.length - 1];
    // Dos tramos seguidos con la misma fila son uno solo.
    if (anterior && anterior.fila === fila) continue;
    if (anterior) anterior.hasta = diaAnterior(inicio);
    tramos.push({ desde: inicio, hasta, fila });
  }
  return tramos;
}
