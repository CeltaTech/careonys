// ---------------------------------------------------------------------------
// documentosQueVencen.js — qué documentos de Asistentes cuentan para «vencido o por vencer»
//
// POR QUÉ EXISTE
// El aviso del Estado actual y el del tablero contaban filas de `documentos_asistente`, y la
// pantalla de Documentación —adonde lleva el aviso— leía otra cosa: sólo el último documento de
// cada tipo, aprobado, de un Asistente activo. El aviso decía 79 y la lista no mostraba ninguno,
// porque los 79 eran documentos que faltaban, no documentos que vencían. Acá se decide una vez.
//
// Lo que entra: el último documento cargado de cada Asistente y tipo —el que dice la vista—,
// aprobado, con fecha de vencimiento, y de un Asistente activo. Un documento que falta o que está
// en revisión no vence: no está, y eso se avisa en otro lado.
// ---------------------------------------------------------------------------

import { supabase } from './supabaseClient';
import { ESTADO_ACTIVO } from './candidatos';

const DOCUMENTO_APROBADO = 'aprobado';

/**
 * Los documentos con vencimiento, con el nombre del Asistente.
 *
 * @param hasta  `AAAA-MM-DD`: si viene, sólo los que vencen hasta ese día —lo vencido incluido—.
 * @returns `{ documentos, error }`. Cada documento trae `documento_id`, `asistente_id`,
 *          `asistente_nombre`, `nombre` (el tipo) y `fecha_vencimiento`.
 */
export async function documentosQueVencen({ hasta } = {}) {
  let consulta = supabase
    .from('documentos_pedidos_al_asistente')
    .select('documento_id, asistente_id, nombre, fecha_vencimiento')
    .eq('estado', DOCUMENTO_APROBADO)
    .not('fecha_vencimiento', 'is', null);
  if (hasta) consulta = consulta.lte('fecha_vencimiento', hasta);

  const { data: docs, error } = await consulta;
  if (error) return { documentos: null, error };

  const ids = [...new Set((docs ?? []).map((d) => d.asistente_id))];
  if (ids.length === 0) return { documentos: [], error: null };

  const { data: asistentes, error: errorAsistentes } = await supabase
    .from('asistentes')
    .select('id, nombre')
    .eq('estado', ESTADO_ACTIVO)
    .in('id', ids);
  if (errorAsistentes) return { documentos: null, error: errorAsistentes };

  const nombrePorId = new Map((asistentes ?? []).map((a) => [a.id, a.nombre]));
  const documentos = (docs ?? [])
    .filter((d) => nombrePorId.has(d.asistente_id))
    .map((d) => ({ ...d, asistente_nombre: nombrePorId.get(d.asistente_id) }));
  return { documentos, error: null };
}
