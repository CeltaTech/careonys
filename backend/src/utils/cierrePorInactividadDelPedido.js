// CUÁNTO QUEDA ABIERTA UNA SESIÓN SIN NADIE DELANTE, PARA LAS DOS APLICACIONES.
//
// Es la misma configuración que usa el Panel: la Prestadora lo enciende o lo apaga y elige los
// minutos, y vale para todas las pantallas de su gente. El Panel la lee pegada al usuario; las
// aplicaciones la reciben con el perfil, que es lo primero que piden al abrir.
//
// SE LEE CON LA SESIÓN DE QUIEN PIDE. La base le deja ver al Asistente y al Cliente una sola
// Prestadora, la suya, y esas dos columnas.
//
// Si no se pudo leer, contesta `null` y la aplicación no cierra por inactividad: es lo mismo que
// hace el Panel cuando no tiene la fila de la Prestadora.
export async function cierrePorInactividadDelPedido(db, prestadoraId) {
  if (!prestadoraId) return null;
  const { data, error } = await db
    .from('prestadoras')
    .select('cierre_por_inactividad_activo, cierre_por_inactividad_minutos')
    .eq('id', prestadoraId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    activo: data.cierre_por_inactividad_activo,
    minutos: data.cierre_por_inactividad_minutos,
  };
}
