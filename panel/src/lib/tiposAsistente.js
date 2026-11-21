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

// Las tareas que pueden pedir una Especialidad: las que le tocan y las que se
// le pueden acordar aparte. Una tarea prohibida no se asigna, así que no pide
// a nadie. La base rechaza lo mismo con 'tarea_prohibida:'.
export const CLASES_QUE_PIDEN_ESPECIALIDAD = ['habilitada', 'no_incluida'];

export function clasePideEspecialidad(clase) {
  return CLASES_QUE_PIDEN_ESPECIALIDAD.includes(clase);
}

// Los rechazos de la base al guardar la Especialidad que pide una tarea. La
// base los manda como mensaje que empieza con el motivo y dos puntos.
const MOTIVOS_DE_LA_ESPECIALIDAD_DE_LA_TAREA = ['tarea_ajena', 'tarea_prohibida', 'especialidad_de_otro_tipo'];

// Devuelve el motivo del rechazo, o null si el error es de otra clase y lo
// traduce el mensaje general de errores.
export function motivoDeLaEspecialidadDeLaTarea(error) {
  const mensaje = typeof error?.message === 'string' ? error.message : '';
  return MOTIVOS_DE_LA_ESPECIALIDAD_DE_LA_TAREA.find((motivo) => mensaje.startsWith(`${motivo}:`)) ?? null;
}

// Qué Especialidad pide cada tarea, como mapa de tarea a Especialidad, a
// partir de los renglones que devuelve la base.
export function especialidadPorTarea(renglones) {
  const mapa = {};
  for (const renglon of renglones ?? []) {
    if (renglon?.tarea_id && renglon?.especialidad_id) mapa[renglon.tarea_id] = renglon.especialidad_id;
  }
  return mapa;
}

// El nombre de la matrícula que exige una especialidad. Las de fábrica están
// traducidas; una Prestadora puede escribir cualquier otra, y en ese caso se
// muestra tal cual la escribió.
export function nombreMatricula(tipoMatricula, t) {
  if (!tipoMatricula) return null;
  return t.tipos_asistente?.[`matricula_${tipoMatricula}`] || tipoMatricula;
}
