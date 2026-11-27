/* Lo que trajo la importación de antes de que la Prestadora usara el sistema.
   ==========================================================================

   La Historia anterior del Paciente, los Antecedentes del Legajo y los Antecedentes del Cliente
   se leen por la misma ruta del backend, que decide qué alcanza quien pregunta. Son de sólo ver.

   Si la ruta no contesta —porque no hay permiso o por cualquier otra falla—, el bloque no se
   muestra: no hay nada que la persona pueda hacer con él. */

import { llamadorDe } from './apiPanel';

const llamarApi = llamadorDe('/antecedentes');

export const SUJETOS_DE_ANTECEDENTES = ['paciente', 'asistente', 'cliente'];

/**
 * @param {'paciente'|'asistente'|'cliente'} sujeto
 * @param {string} id
 * @returns {Promise<object[]|null>} Los antecedentes, o `null` si no se pudieron leer.
 */
export async function pedirAntecedentes(sujeto, id) {
  if (!SUJETOS_DE_ANTECEDENTES.includes(sujeto) || !id) return null;
  try {
    const resultado = await llamarApi(`/${sujeto}/${encodeURIComponent(id)}`);
    return Array.isArray(resultado?.antecedentes) ? resultado.antecedentes : [];
  } catch (err) {
    console.error(err);
    return null;
  }
}

/** Lo que se muestra de un antecedente: su valor, o sus datos uno al lado del otro. */
export function valorDelAntecedente(antecedente) {
  if (antecedente?.valor != null && String(antecedente.valor).trim() !== '') return String(antecedente.valor);
  const datos = antecedente?.datos;
  if (!datos || typeof datos !== 'object') return '';
  return Object.entries(datos)
    .filter(([, valor]) => valor != null && String(valor).trim() !== '')
    .map(([clave, valor]) => `${clave}: ${typeof valor === 'object' ? JSON.stringify(valor) : valor}`)
    .join(' · ');
}

/** Ordenados del más reciente al más antiguo; los que no tienen fecha, al final. */
export function antecedentesOrdenados(antecedentes) {
  return [...(antecedentes ?? [])].sort((a, b) => {
    const fa = a.fecha ?? '';
    const fb = b.fecha ?? '';
    if (fa === fb) return (a.fila ?? 0) - (b.fila ?? 0);
    if (!fa) return 1;
    if (!fb) return -1;
    return fb.localeCompare(fa);
  });
}
