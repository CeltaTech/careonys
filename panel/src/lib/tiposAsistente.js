// El catálogo de tipos de Asistente, visto desde el Panel.
//
// Cómo se llama un tipo —los generales se traducen, los propios de cada
// Prestadora no— vive en `tipoDeAsistente.js`, que es el mismo archivo en las
// tres aplicaciones. Acá quedan solamente las cosas que solo existen en el
// Panel: las tareas y la matrícula.

import { esTipoGeneral, nombreTipo, nombreTarea, detalleTarea } from './tipoDeAsistente';

export { esTipoGeneral, nombreTipo, nombreTarea, detalleTarea };

// Las tres listas de tareas: lo que le toca hacer, lo que no le toca y lo que
// tiene prohibido. Los mismos tres valores que acepta la base en
// `tareas_tipo_asistente.clase`.
export const CLASES_TAREA = ['habilitada', 'no_incluida', 'prohibida'];

// El nombre de la matrícula que exige un tipo. Las tres de fábrica están
// traducidas; una Prestadora puede escribir cualquier otra, y en ese caso se
// muestra tal cual la escribió.
export function nombreMatricula(tipoMatricula, t) {
  if (!tipoMatricula) return null;
  return t.tipos_asistente?.[`matricula_${tipoMatricula}`] || tipoMatricula;
}
