import { ErrorConMotivo } from './errorConMotivo.js';

/* Las aclaraciones al pie de un Reporte.
   =====================================

   El Reporte presentado no se modifica nunca: se corrige con una aclaración al pie, que guarda
   quién la escribió, la fecha y la hora. La aclaración tampoco se modifica ni se borra. La base
   lo hace cumplir; acá están las piezas que comparten las rutas que la leen y la escriben. */

// El mismo tope que la base pone a la columna. Se mira antes para responder con el motivo.
export const LARGO_MAXIMO_DE_LA_ACLARACION = 5000;

// Lo que sale de una aclaración hacia cualquier pantalla: el texto y la firma.
export const COLUMNAS_DE_LA_ACLARACION = 'id, reporte_id, texto, escrita_por_nombre, escrita_at';

/** El texto que llegó en el pedido, listo para guardar. Si no sirve, un error con motivo. */
export function textoDeLaAclaracion(texto) {
  if (typeof texto !== 'string') throw new ErrorConMotivo('faltan_datos', 'aclaración sin texto');
  const limpio = texto.trim();
  if (!limpio) throw new ErrorConMotivo('faltan_datos', 'aclaración vacía');
  if (limpio.length > LARGO_MAXIMO_DE_LA_ACLARACION) {
    throw new ErrorConMotivo('texto_demasiado_largo', `aclaración de ${limpio.length} caracteres`);
  }
  return limpio;
}

/**
 * Las aclaraciones de varios Reportes, agrupadas por Reporte y en el orden en que se escribieron.
 * `db` es la conexión con la que se leyeron esos Reportes: la de la persona, o el trabajo de su
 * Prestadora después de comprobar con la de la persona que alcanza la información de salud.
 */
export async function aclaracionesDeLosReportes(db, reporteIds) {
  const porReporte = new Map();
  const ids = [...new Set((reporteIds ?? []).filter(Boolean))];
  if (!ids.length) return porReporte;
  // SIN PRESTADORA A PROPÓSITO
  // Se leen sólo las aclaraciones de los Reportes que quien llama ya leyó con esta misma conexión,
  // y la conexión es la de la persona —la Prestadora la pone la protección por fila— o el trabajo
  // atado a una sola Prestadora.
  const { data, error } = await db
    .from('aclaraciones_reporte')
    .select(COLUMNAS_DE_LA_ACLARACION)
    .in('reporte_id', ids)
    .order('escrita_at', { ascending: true });
  if (error) throw error;
  for (const fila of data ?? []) {
    const { reporte_id: reporteId, ...aclaracion } = fila;
    if (!porReporte.has(reporteId)) porReporte.set(reporteId, []);
    porReporte.get(reporteId).push(aclaracion);
  }
  return porReporte;
}

/** Cada Reporte con sus aclaraciones al pie. */
export async function conSusAclaraciones(db, reportes) {
  const lista = reportes ?? [];
  const porReporte = await aclaracionesDeLosReportes(db, lista.map((r) => r.id));
  return lista.map((r) => ({ ...r, aclaraciones: porReporte.get(r.id) ?? [] }));
}

/** Si alguno de los Reportes tiene aclaraciones: entonces también se anota que se leyeron. */
export function hayAclaraciones(reportes) {
  return (reportes ?? []).some((r) => r.aclaraciones?.length);
}
