import { supabase } from './supabaseClient';
import { ESTADO_ACTIVO } from './candidatos';
import { hoyISO } from './horarios';
import { impideTrabajarHoy } from './documentos';

// Los documentos que hoy no dejan trabajar a un Asistente activo: faltan, están observados o
// vencieron, y no tienen gracia que corra. Qué cuenta lo decide `impideTrabajarHoy`, el mismo que
// usa la base para no dejar asignar. El aviso del Estado actual y la lista de Documentación salen
// de acá, para que el número y la lista no puedan discrepar.

// El valor del filtro de Documentación que muestra estos documentos; el aviso lo manda al abrirla.
export const FILTRO_DOCUMENTOS_PENDIENTES = 'pendientes';

export async function documentosQueImpidenTrabajar() {
  const hoy = hoyISO();
  const { data: docs, error } = await supabase
    .from('documentos_pedidos_al_asistente')
    .select('asistente_id, tipo_documento_id, nombre, impide_trabajar, estado, fecha_vencimiento, gracia_hasta')
    .eq('impide_trabajar', true);
  if (error) return { documentos: null, error };

  const pendientes = (docs ?? []).filter((d) => impideTrabajarHoy(d, hoy));
  const ids = [...new Set(pendientes.map((d) => d.asistente_id))];
  if (ids.length === 0) return { documentos: [], error: null };

  const { data: asistentes, error: errorAsistentes } = await supabase
    .from('asistentes')
    .select('id, nombre')
    .eq('estado', ESTADO_ACTIVO)
    .in('id', ids);
  if (errorAsistentes) return { documentos: null, error: errorAsistentes };

  const nombrePorId = new Map((asistentes ?? []).map((a) => [a.id, a.nombre]));
  const documentos = pendientes
    .filter((d) => nombrePorId.has(d.asistente_id))
    .map((d) => ({ ...d, asistente_nombre: nombrePorId.get(d.asistente_id) }));
  return { documentos, error: null };
}
