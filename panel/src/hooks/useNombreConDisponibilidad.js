import { useCallback } from 'react';
import { useListaDeOpciones } from './useListaDeOpciones';
import { nombreConDisponibilidad } from '../lib/disponibilidadDelAsistente';

/* Lo que usan las listas de quién toma una guardia para mostrar a cada Asistente con los horarios
 * en que suele estar disponible. Mientras la lista de opciones no llegó, se ve sólo el nombre. */
export function useNombreConDisponibilidad() {
  const { opciones } = useListaDeOpciones('disponibilidad');
  return useCallback((asistente) => nombreConDisponibilidad(asistente, opciones), [opciones]);
}
