// Quiénes pueden coordinar un Servicio, en el orden en que el sistema los sugiere.
//
// La cuenta la hace la base, en `coordinadores_sugeridos_para_el_servicio`, y sólo le contesta a la
// administración de la Prestadora: cuántos Servicios vigentes coordina cada uno y si el lugar del
// Servicio —el del domicilio de sus Pacientes, o el del domicilio temporal vigente— está entre los
// lugares que cubre. La lista llega ordenada y acá no se vuelve a ordenar: el orden es de la base.
// El sistema sugiere y la administración elige.

/**
 * @returns {Promise<{ coordinadores: Array<{ id: string, nombre: string, servicios: number, cubreElLugar: boolean|null }>, error: object|null }>}
 *   `cubreElLugar` es `null` cuando el Servicio o el Coordinador no tienen lugar cargado: ahí el
 *   criterio no opina.
 */
export async function coordinadoresSugeridos(supabase, servicioId) {
  const { data, error } = await supabase.rpc('coordinadores_sugeridos_para_el_servicio', {
    p_servicio: servicioId,
  });
  if (error) return { coordinadores: [], error };
  return {
    coordinadores: (data ?? []).map((c) => ({
      id: c.coordinador_id,
      nombre: (c.nombre ?? '').trim() || '—',
      servicios: Number(c.servicios_vigentes) || 0,
      cubreElLugar: c.cubre_el_lugar ?? null,
    })),
    error: null,
  };
}
