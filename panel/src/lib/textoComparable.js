// ---------------------------------------------------------------------------
// textoComparable.js — dejar dos textos escritos a mano en condiciones de compararse
//
// Hay datos que en una punta los escribe una persona y en la otra los escribió otra, en otro
// momento y sin ninguna lista de la cual elegir: las especialidades del Legajo del Asistente, el
// tipo de Asistente cargado a mano antes de que existiera el catálogo. "Enfermería", "ENFERMERIA" y
// "Enfermeria " son la misma cosa para cualquiera que las lea, y tres cosas distintas para una
// comparación de cadenas.
//
// Está acá y no adentro del archivo que lo necesitó primero porque ya lo preguntan dos
// (regla «ningún patrón repetido sin punto único de verdad», CLAUDE.md §8).
//
// **Esto no adivina ni corrige**: acerca dos textos lo justo para poder compararlos. Cuando de
// la comparación depende una decisión que no se puede deshacer sola, lo que sale de acá es una
// sugerencia que mira una persona, nunca una conversión automática.
// ---------------------------------------------------------------------------

/**
 * El texto sin mayúsculas, sin tildes y sin nada que no sea letra.
 *
 * `normalize('NFD')` separa la letra de su tilde —la "é" pasa a ser "e" más un signito aparte—;
 * el último paso, que se queda sólo con la a a la z, tira ese signito junto con espacios, puntos
 * y números.
 */
export function comparable(texto) {
  return (texto || '')
    .normalize('NFD')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}
