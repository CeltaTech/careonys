/*
 * El lote de la carga uno por uno.
 *
 * Al lado de «Importar datos», la Prestadora puede cargar Asistentes o Clientes de a uno con los
 * formularios de alta de siempre. Lo que carga así entra en un lote de importación y pasa por la
 * misma revisión que una planilla: se conforma o se rechaza entero.
 *
 * Un lote de carga uno por uno se reconoce porque no tiene archivo y nació sin renglones. Cada
 * persona del Panel tiene a lo sumo uno abierto por día y por clase: si ya lo abrió hoy y todavía
 * no lo revisó, se le devuelve ése.
 */

import { ErrorConMotivo } from './errorConMotivo.js';
import { diaEnLaZona, zonaDeLaPrestadora } from './relojDeLaPrestadora.js';

export const TIPOS_DE_CARGA_MANUAL = ['asistente', 'cliente'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Si el texto tiene la forma de un identificador. */
export function esIdentificador(valor) {
  return typeof valor === 'string' && UUID.test(valor);
}

/**
 * Abre el lote de carga uno por uno de hoy, o devuelve el que ya estaba abierto.
 * `db` es la conexión de la importación de esa Prestadora.
 *
 * @returns {Promise<string>} el identificador del lote
 */
export async function abrirLoteManual(db, { prestadoraId, usuarioPanelId, tipo, ahora = new Date() }) {
  if (!TIPOS_DE_CARGA_MANUAL.includes(tipo)) throw new ErrorConMotivo('dato_invalido');
  const zona = await zonaDeLaPrestadora(db, prestadoraId);
  const hoy = diaEnLaZona(ahora, zona);

  const { data: abiertos, error } = await db
    .from('importaciones_prestadora')
    .select('id, created_at')
    .eq('prestadora_id', prestadoraId)
    .eq('usuario_id', usuarioPanelId)
    .eq('tipo', tipo)
    .eq('estado_conformidad', 'pendiente')
    .is('archivo_nombre', null)
    .eq('filas_totales', 0)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  const deHoy = (abiertos ?? []).find((lote) => diaEnLaZona(new Date(lote.created_at), zona) === hoy);
  if (deHoy) return deHoy.id;

  return anotarLote(db, { prestadoraId, usuarioPanelId, tipo, archivoNombre: null, filasTotales: 0 });
}

/**
 * Anota un lote nuevo de importación, de cualquier clase, y devuelve su identificador.
 *
 * Es el único lugar que crea un lote. La cuenta de la importación sólo puede escribir, al crearlo,
 * la Prestadora, quién importa, la clase, el nombre del archivo y cuántos renglones trae. El
 * resultado (filas creadas, errores, conformidad) se completa después, con una actualización.
 * `db` es la conexión de la importación de esa Prestadora.
 *
 * @returns {Promise<string>} el identificador del lote
 */
export async function anotarLote(db, { prestadoraId, usuarioPanelId, tipo, archivoNombre, filasTotales }) {
  const { data: nuevo, error } = await db
    .from('importaciones_prestadora')
    .insert({
      prestadora_id: prestadoraId,
      usuario_id: usuarioPanelId,
      tipo,
      archivo_nombre: archivoNombre || null,
      filas_totales: filasTotales,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return nuevo.id;
}

/**
 * Comprueba que el lote sea de esta Prestadora, de esta clase y que todavía no se haya revisado.
 * Si no, falla con `lote_no_abierto`: lo cargado no entra en un lote ajeno ni en uno cerrado.
 * `db` es la conexión de la importación de esa Prestadora.
 */
export async function exigirLoteAbierto(db, { prestadoraId, importacionId, tipo }) {
  if (!esIdentificador(importacionId)) throw new ErrorConMotivo('lote_no_abierto');
  const { data: lote, error } = await db
    .from('importaciones_prestadora')
    .select('id, tipo, estado_conformidad')
    .eq('id', importacionId)
    .eq('prestadora_id', prestadoraId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!lote || lote.tipo !== tipo || lote.estado_conformidad !== 'pendiente') {
    throw new ErrorConMotivo('lote_no_abierto');
  }
  return lote;
}
