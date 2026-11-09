import { useCatalogo } from './useCatalogo';

// Los motivos que la Prestadora tiene encendidos hoy para reactivar un Servicio dado de baja. El
// catálogo completo se administra desde Configuración y pasa por el backend.
export function useMotivosReactivacionServicio(prestadoraId) {
  return useCatalogo('motivos_reactivacion_servicio', {
    filtros: { prestadora_id: prestadoraId, activo: true },
    requiere: [prestadoraId],
  });
}
