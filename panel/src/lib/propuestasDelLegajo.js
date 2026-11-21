/* Las propuestas de ajuste por índice del valor del Legajo, sin dibujar nada.
   ==========================================================================

   Cuando la Prestadora eligió revisar antes de aplicar, la base deja propuesto el valor nuevo del
   Legajo de cada Asistente. Quien revisa lo acepta —el Legajo cambia— o lo rechaza —sigue el
   valor de hoy—. Lo hace la base con `revisar_propuesta_de_ajuste_del_legajo`. */

// Los cuatro valores del Legajo, con la palabra que ya usa el Legajo en la pantalla.
export const VALORES_DEL_LEGAJO = Object.freeze(['valor_hora', 'valor_turno_guardia', 'valor_semana', 'valor_hora_extra']);

// Lo que se lee de la base para cada propuesta pendiente.
export const COLUMNAS_DE_LA_PROPUESTA = [
  'id',
  'asistente_id',
  'indice',
  'rige_desde',
  'moneda',
  'unidad_medicion',
  ...VALORES_DEL_LEGAJO.flatMap((valor) => [`${valor}_actual`, `${valor}_propuesto`]),
  'asistente:asistentes(nombre)',
].join(', ');

// Los valores que la propuesta cambia: los que tienen un número de un lado o del otro.
export function valoresDeLaPropuesta(propuesta) {
  return VALORES_DEL_LEGAJO.map((valor) => ({
    valor,
    actual: propuesta?.[`${valor}_actual`] ?? null,
    propuesto: propuesta?.[`${valor}_propuesto`] ?? null,
  })).filter((fila) => fila.actual !== null || fila.propuesto !== null);
}

// Los rechazos de la base que tienen una frase propia en esta pantalla. Otro error lo traduce el
// mensaje general de errores.
const MOTIVOS_DE_LA_REVISION = ['ya_reemplazado', 'no_encontrado', 'sin_permiso'];

export function motivoDeLaRevisionDelLegajo(error) {
  const mensaje = typeof error?.message === 'string' ? error.message.trim() : '';
  return MOTIVOS_DE_LA_REVISION.find((motivo) => mensaje === motivo || mensaje.startsWith(`${motivo}:`)) ?? null;
}
