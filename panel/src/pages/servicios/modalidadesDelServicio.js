// En qué modalidades trabaja un Servicio y quién administra cada una. Lo usan la lista y la ficha.
//
// La modalidad no está guardada en el Servicio ni en la prestación: la lleva cada guardia, en la
// columna `canal_modalidad` (nombre guardado, no se renombra). Las del Servicio son las que
// aparecen en sus guardias, en el orden fijo de `MODALIDADES_DE_PRESTADORA`.

import { MODALIDAD, MODALIDADES_DE_PRESTADORA } from '../../lib/modalidades';

/** Las modalidades distintas que aparecen en una lista de guardias. */
export function modalidadesDeGuardias(guardias) {
  const presentes = new Set((guardias ?? []).map((g) => g?.canal_modalidad).filter(Boolean));
  return MODALIDADES_DE_PRESTADORA.filter((m) => presentes.has(m));
}

/** El nombre visible de una modalidad. Sale de los textos de Configuración, que ya la nombran. */
export function nombreDeModalidad(modalidad, t) {
  return t.configuracion?.[`modalidades_${modalidad}`] ?? modalidad;
}

/** El cartel de quién administra la operación en esa modalidad, con el tono de la maqueta. */
export function claseDeResponsable(modalidad) {
  if (modalidad === MODALIDAD.DIRECTA) return 'badge badge-exito';
  if (modalidad === MODALIDAD.MARKETPLACE) return 'badge servicios-badge-violeta';
  return 'badge badge-info';
}
