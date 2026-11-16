import { useCallback, useMemo } from 'react';
import { useCatalogo } from './useCatalogo';
import { usePrestadoraActual } from './usePrestadoraActual';

// Las Ramas de esta Prestadora y en cuál cae cada tipo de Asistente. La Rama no es del
// Asistente: sale de su tipo, así que quien la necesite pregunta por el tipo.
//
// Las dos listas las recorta la base a la Prestadora de la sesión; la consulta pregunta además
// por la Prestadora actual, y no pregunta mientras no se sepa cuál es.
export function useRamas() {
  const prestadoraId = usePrestadoraActual();
  const ramas = useCatalogo('agrupaciones_tipos_asistente', {
    columnas: 'id, nombre, orden',
    filtros: { prestadora_id: prestadoraId },
    requiere: [prestadoraId],
  });
  const agrupados = useCatalogo('tipos_asistente_agrupados', {
    columnas: 'tipo_asistente_id, agrupacion_id',
    orden: 'tipo_asistente_id',
    filtros: { prestadora_id: prestadoraId },
    requiere: [prestadoraId],
  });

  const porId = useMemo(() => new Map(ramas.filas.map((rama) => [rama.id, rama])), [ramas.filas]);
  const ramaIdDeCadaTipo = useMemo(
    () => new Map(agrupados.filas.map((fila) => [fila.tipo_asistente_id, fila.agrupacion_id])),
    [agrupados.filas],
  );

  const ramaDelTipo = useCallback(
    (tipoId) => porId.get(ramaIdDeCadaTipo.get(tipoId)) ?? null,
    [porId, ramaIdDeCadaTipo],
  );

  return { ramas: ramas.filas, ramaDelTipo };
}
