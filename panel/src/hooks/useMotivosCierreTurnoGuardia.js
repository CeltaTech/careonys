import { useMemo } from 'react';
import { useCatalogo } from './useCatalogo';
import { motivosQueSeEligen } from '../lib/cierreDelTurnoGuardia';

// Por qué se cierra un turno de guardia desde el Panel, según esta Prestadora. Nace con los
// motivos que trae el producto y a partir de ahí la lista es de ella.
//
// Se descartan los que escribe la base sola, como el permiso para que el Paciente quede solo: ese
// cierre sale de otra operación y no se elige acá.
export function useMotivosCierreTurnoGuardia(prestadoraId) {
  const { filas: traidos, estado, error, recargar } = useCatalogo('motivos_cierre_turno_guardia', {
    filtros: { prestadora_id: prestadoraId, activo: true },
    requiere: [prestadoraId],
  });

  const filas = useMemo(() => motivosQueSeEligen(traidos), [traidos]);

  return {
    filas,
    estado: estado === 'listo' && filas.length === 0 ? 'vacio' : estado,
    error,
    recargar,
  };
}
