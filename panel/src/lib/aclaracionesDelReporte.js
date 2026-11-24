// Las aclaraciones al pie de un Reporte.
//
// El Reporte presentado no se modifica nunca: se corrige con una aclaración al pie, que guarda quién
// la escribió, la fecha y la hora. La aclaración tampoco se modifica ni se borra. Quién puede
// escribirla lo decide la base con `puede_aclarar_el_reporte`, el mismo criterio que usa la
// política de escritura; acá sólo se le pregunta para saber si se muestra el botón.

import { supabase } from './supabaseClient';
import { informacionDeSalud } from './informacionDeSalud';

// El mismo tope que la base pone al texto.
export const LARGO_MAXIMO_DE_LA_ACLARACION = 5000;

const COLUMNAS = 'id, texto, escrita_por_nombre, escrita_at';

/** Las aclaraciones de un Reporte, en el orden en que se escribieron. */
export async function leerAclaraciones(reporteId) {
  const { data, error } = await informacionDeSalud
    .from('aclaraciones_reporte')
    .select(COLUMNAS)
    .eq('reporte_id', reporteId)
    .order('escrita_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Si quien inició sesión puede agregar una aclaración a ese Reporte. Ante la duda, no. */
export async function puedeAclarar(reporteId) {
  const { data, error } = await supabase.rpc('puede_aclarar_el_reporte', { p_reporte: reporteId });
  return !error && data === true;
}

/** Agrega una aclaración. La firma, la fecha y la hora las pone la base. */
export async function agregarAclaracion(reporteId, texto) {
  const { data, error } = await informacionDeSalud
    .from('aclaraciones_reporte')
    .insert({ reporte_id: reporteId, texto: texto.trim() })
    .select(COLUMNAS)
    .single();
  if (error) throw error;
  return data;
}
