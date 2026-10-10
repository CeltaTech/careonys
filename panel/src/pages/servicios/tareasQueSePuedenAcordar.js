// Qué tareas se le pueden acordar a un tipo de Asistente en un Servicio.
//
// Es la misma cuenta que hace la base al guardar, en el disparador que frena una tarea
// prohibida; acá sirve para no ofrecer lo que la base va a rechazar. La que manda es la base.
//
// Las tareas llegan ya cortadas por la Prestadora y su país, porque la protección por fila de
// la base no devuelve otras. Quedan afuera:
//   · las prohibiciones, que no son tareas que se acuerden;
//   · las que alcanza una prohibición de ese tipo;
//   · las de otro tipo, cuando ese tipo recibe sólo las suyas.

export function tareasQueSePuedenAcordar(tipo, tareas, alcances) {
  if (!tipo) return [];

  const prohibicionesDelTipo = new Set(
    tareas.filter((tarea) => tarea.clase === 'prohibida' && tarea.tipo_asistente_id === tipo.id).map((tarea) => tarea.id),
  );
  const alcanzadas = new Set(
    alcances.filter((alcance) => prohibicionesDelTipo.has(alcance.prohibicion_id)).map((alcance) => alcance.tarea_id),
  );

  return tareas.filter(
    (tarea) =>
      tarea.clase !== 'prohibida' &&
      !alcanzadas.has(tarea.id) &&
      (!tipo.recibe_solo_sus_tareas || tarea.tipo_asistente_id === tipo.id),
  );
}
