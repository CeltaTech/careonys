/* Lo que tiene cada Cliente en las dos modalidades.
   ==========================================================================

   Los Clientes de prestación directa y los de Match están en la misma tabla `clientes`: lo que
   cambia es lo que cada uno tiene colgado. De la prestación directa, sus Servicios (`servicios`,
   por `cliente_id`); de Match, sus accesos (`accesos_intermediacion`, también por `cliente_id`,
   uno por Paciente). La sección Clientes del Panel los muestra juntos, y esto es lo único que
   decide cómo se reparten y en qué estado queda el Cliente. La pantalla sólo dibuja. */

// Agrupa filas por su `cliente_id`. Las que no lo traen no son de ningún Cliente y se descartan.
export function porCliente(filas) {
  const mapa = new Map();
  for (const fila of filas ?? []) {
    if (!fila?.cliente_id) continue;
    if (!mapa.has(fila.cliente_id)) mapa.set(fila.cliente_id, []);
    mapa.get(fila.cliente_id).push(fila);
  }
  return mapa;
}

/* El estado del Cliente sale de lo que tiene: activo mientras tenga un Servicio o un acceso de
   Match vigente; con alguno y ninguno vigente, de baja; sin nada, no tiene estado. Los dos usan la
   misma palabra para lo que corre hoy (`vigente`), y cualquier otro valor —uno que todavía no
   existe incluido— cuenta como no vigente: no se da por activo lo que no se entendió. */
export function estadoDelCliente(servicios = [], accesos = []) {
  const todo = [...servicios, ...accesos];
  if (todo.length === 0) return null;
  return todo.some((fila) => fila.estado === 'vigente') ? 'activo' : 'de_baja';
}
