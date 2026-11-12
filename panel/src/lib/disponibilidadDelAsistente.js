/* El nombre de un Asistente con los horarios en que suele estar disponible, para la lista de
 * quién toma una guardia: «Ana Pérez — Mañana, Tarde». Sin ninguno cargado, sólo el nombre.
 *
 * Los horarios salen en el orden de la lista de opciones, no en el que se eligieron, para que
 * todos los nombres se lean igual. Una opción que ya no está en la lista no se muestra.
 * Es un dato a la vista de quien asigna: nada se bloquea ni se avisa con él. */
export function nombreConDisponibilidad(asistente, opciones) {
  const elegidas = Array.isArray(asistente?.disponibilidad) ? asistente.disponibilidad : [];
  const horarios = opciones.filter((o) => elegidas.includes(o.clave)).map((o) => o.texto);
  return horarios.length ? `${asistente.nombre} — ${horarios.join(', ')}` : asistente.nombre;
}
