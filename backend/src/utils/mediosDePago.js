// ---------------------------------------------------------------------------
// mediosDePago.js — con qué se pagó, leído de la base y no escrito acá
//
// POR QUÉ EXISTE
// Con qué se pagó sale del registro de listas de opciones, que tiene dos pisos:
// las opciones que trae el producto y las que agregó cada Prestadora. El backend
// necesita esa lista para controlar antes de escribir, y la única forma de que
// no se separe del desplegable del Panel es que los dos la lean del mismo lado.
//
// Y SON DOS LISTAS, UNA POR LADO DEL DINERO
// Cómo la Familia le paga a la Prestadora y cómo se le paga al Asistente no son
// los mismos medios: del lado de la cobranza están todas las posibilidades de un
// negocio que cobra, y del lado del Asistente están las de pagarle a una persona.
// De qué lista sale un medio es, entonces, para qué lado sirve. Quién pone la
// plata no lo dice esta lista: en Match le paga la Familia directamente, y que
// los medios sean los mismos no cambia eso.
//
// QUÉ NO ES
// No reemplaza el control de la base: el disparador de `cobros_familia` y el de
// `liquidaciones_asistente` frenan igual lo que se cuele por acá. Esto sirve para
// contestar antes y con una frase entendible.
//
// Este archivo no tiene copia: habla con la base, así que vive sólo en el backend.
// ---------------------------------------------------------------------------

import { supabase } from '../db/connection.js';
import { laOpcionAlcanzaLasModalidades } from './modalidades.js';

/** Las claves de las dos listas. Escritas una vez, porque las nombran el backend y el Panel. */
export const LISTA_DE_MEDIOS_DE_PAGO_DE_LA_FAMILIA = 'medios_de_pago_de_la_familia';
export const LISTA_DE_MEDIOS_DE_PAGO_AL_ASISTENTE = 'medios_de_pago_al_asistente';

const LAS_LISTAS_QUE_EXISTEN = [
  LISTA_DE_MEDIOS_DE_PAGO_DE_LA_FAMILIA,
  LISTA_DE_MEDIOS_DE_PAGO_AL_ASISTENTE,
];

/**
 * Las claves de los medios de pago de un lado del dinero que alcanzan a esta Prestadora: las del
 * producto y las suyas.
 *
 * Sólo las encendidas: un medio que se apagó sigue nombrando lo que ya se anotó con él, pero no
 * se puede elegir de nuevo.
 *
 * Una lista que no es ninguna de las dos devuelve vacío, y vacío no admite ningún medio: lo que no
 * supo contra qué comparar niega.
 *
 * El backend no pasa por las reglas de acceso de la base, así que el filtro por Prestadora se
 * escribe acá y a mano. Sin él, una Prestadora podría guardar una opción de otra.
 *
 * `modalidadesEnJuego` acota todavía más: un medio marcado con modalidades sólo sirve si ninguna
 * de las que están en juego le queda afuera. Sin ese dato no se filtra por modalidad y la lista
 * sale entera, que es lo que necesita una pantalla de configuración. La cuenta la hace
 * `laOpcionAlcanzaLasModalidades`, la misma que usa el Panel.
 */
export async function mediosDePagoDeLaPrestadora(prestadoraId, claveDeLaLista, modalidadesEnJuego) {
  if (!prestadoraId) return [];
  if (!LAS_LISTAS_QUE_EXISTEN.includes(claveDeLaLista)) return [];

  const { data, error } = await supabase
    .from('opciones_de_lista')
    .select('clave, prestadora_id, modalidades, listas_de_opciones!inner(clave, prestadora_id)')
    .eq('listas_de_opciones.clave', claveDeLaLista)
    .is('listas_de_opciones.prestadora_id', null)
    .eq('activa', true)
    .or(`prestadora_id.is.null,prestadora_id.eq.${prestadoraId}`);

  if (error) throw new Error(error.message);

  const alcanzan = modalidadesEnJuego
    ? (data || []).filter((fila) => laOpcionAlcanzaLasModalidades(fila, modalidadesEnJuego))
    : data || [];
  return [...new Set(alcanzan.map((fila) => fila.clave))];
}
