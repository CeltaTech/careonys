// Cómo se lee un renglón del registro de actividad. Lo usan la Auditoría y el historial de una
// cuenta desactivada, así que vive acá y no en cada pantalla.

export function nombreDeLaAccion(fila, t) {
  // Sin frase para esa acción se dice que la acción no tiene nombre, y no se muestra la clave:
  // un identificador interno no le dice nada a quien lee, y además delata cómo se llama algo
  // por dentro.
  return t.auditoria[`accion_${fila.accion}`] || t.auditoria.accion_desconocida;
}

// QUÉ CAMBIÓ, SIN MOSTRAR CONTENIDO NI IDENTIFICADORES INTERNOS.
//
// El registro guarda a propósito muy poco: los nombres de las columnas que se tocaron y unos
// pocos datos con nombre, todos opacos. Acá se traduce lo que tiene traducción —el permiso y
// su alcance salen de las mismas frases que usa la pantalla de Permisos, que es donde viven— y
// lo demás se calla. Una celda vacía es mejor que una celda con el nombre de una tabla adentro.
export function queCambio(fila, t) {
  const detalle = fila.detalle || {};

  if (detalle.moneda_nueva) {
    return detalle.moneda_anterior
      ? `${detalle.moneda_anterior} → ${detalle.moneda_nueva}`
      : detalle.moneda_nueva;
  }

  if (detalle.accion_permiso) {
    const permiso = t.configuracion[`permisos_accion_${detalle.accion_permiso}`];
    const alcance = t.configuracion[`permisos_alcance_${detalle.alcance_nuevo}`];
    return [permiso, alcance].filter(Boolean).join(' — ') || '—';
  }

  const rol = detalle.rol_nuevo || detalle.rol_anterior;
  if (rol) return t.usuarios_panel[`rol_${rol}`] || '—';

  // Los nombres de las columnas que se tocaron quedan guardados, pero no se dibujan: son de la
  // base, no del trabajo. Lo que la persona necesita leer ya lo dice la acción.
  return '—';
}
