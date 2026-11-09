import { useCatalogo } from './useCatalogo';

// Lo que la Prestadora pide comprobar antes de dar de baja un Servicio: los renglones encendidos
// hoy. La lista completa, con los apagados, se administra desde Configuración y pasa por el backend.
export function useListaDeComprobacionBaja(prestadoraId) {
  return useCatalogo('lista_de_comprobacion_baja_servicio', {
    filtros: { prestadora_id: prestadoraId, activo: true },
    requiere: [prestadoraId],
  });
}
