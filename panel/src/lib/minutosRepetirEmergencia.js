/* Cada cuánto se repite el aviso de una emergencia que nadie tomó. Los bordes son los de la
   columna en la base y los de `MINUTOS_INSISTENCIA_EMERGENCIA` en el backend. */
export const MINUTOS_REPETIR_EMERGENCIA = { minimo: 1, maximo: 10 };

/* El casillero no deja un número fuera de borde, así que no hay error que avisar: lo que se
   escribe por encima queda en el tope, lo de abajo en el mínimo, y lo que no es número no cambia
   nada. */
export const minutosRepetirEmergenciaAjustados = (texto, anterior) => {
  const minutos = Number.parseInt(texto, 10);
  if (Number.isNaN(minutos)) return anterior;
  return Math.min(MINUTOS_REPETIR_EMERGENCIA.maximo, Math.max(MINUTOS_REPETIR_EMERGENCIA.minimo, minutos));
};
