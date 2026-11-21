/**
 * El valor del Legajo del Asistente: lo que esta persona pretende cobrar, desde qué fecha rige y
 * cuáles rigieron antes.
 *
 * El valor vigente vive en `remuneraciones_asistente`, una fila por Asistente. Cuando cambia, la
 * base pasa el anterior a `remuneraciones_asistente_anteriores` con hasta cuándo rigió. Las dos
 * tablas piden el permiso `ver_pagos_asistente` para leerse.
 *
 * Reglas de la base que esta pantalla respeta:
 *   - Un cambio de importes, de moneda o de unidad rige desde la fecha que trae.
 *   - Una fecha anterior a la del valor vigente no se acepta: la base contesta con un error cuyo
 *     mensaje empieza con `rige_desde_anterior:`.
 *   - Sin cambio de importes, la fecha no se manda: una fecha posterior correría la del valor
 *     vigente sin dejar historia.
 */
import { COLUMNA_DEL_VALOR, unidadDeMedicionDe } from './formaDePago';

/** Lo que se pide de los valores anteriores para mostrar la historia. */
export const CAMPOS_DE_LOS_VALORES_ANTERIORES =
  'id, unidad_medicion, valor_hora, valor_turno_guardia, valor_semana, valor_hora_extra, moneda, rige_desde, rige_hasta';

/** El comienzo del mensaje con que la base rechaza una fecha anterior a la vigente. */
export const RECHAZO_RIGE_DESDE_ANTERIOR = 'rige_desde_anterior:';

/** Los importes del Legajo que, si cambian, hacen un valor nuevo. */
const IMPORTES = ['valor_hora', 'valor_turno_guardia', 'valor_semana', 'valor_hora_extra'];

const FECHA_DEL_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Si la base rechazó la fecha por ser anterior a la del valor vigente. */
export function esRigeDesdeAnterior(error) {
  return typeof error?.message === 'string' && error.message.startsWith(RECHAZO_RIGE_DESDE_ANTERIOR);
}

/** Un casillero vacío y un dato que no está son lo mismo; un número escrito, el número. */
function importe(valor) {
  if (valor === '' || valor === null || valor === undefined) return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

/** El importe de la unidad con que se mide el trabajo en esa fila. */
export function valorDeLaFila(fila) {
  if (!fila) return null;
  return importe(fila[COLUMNA_DEL_VALOR[unidadDeMedicionDe(fila)]]);
}

/**
 * Si lo escrito en el formulario cambia el valor guardado: la unidad o cualquiera de los importes.
 * `guardado` es el Legajo del Asistente tal como se leyó; `escrito`, el formulario.
 */
export function cambiaElValor(guardado, escrito) {
  if (unidadDeMedicionDe(guardado) !== unidadDeMedicionDe(escrito)) return true;
  return IMPORTES.some((campo) => importe(guardado?.[campo]) !== importe(escrito?.[campo]));
}

/** Qué falta en la fecha desde la que rige el valor nuevo, o `null` si está bien. */
export function revisarRigeDesde(fecha) {
  return typeof fecha === 'string' && FECHA_DEL_DIA.test(fecha) ? null : 'falta_el_dato';
}

/**
 * La fila que se guarda en `remuneraciones_asistente`. La fecha va sólo si cambió el valor.
 * `frecuenciaPago` llega ya resuelta por quien llama.
 */
export function filaDelValorDelLegajo({ asistenteId, prestadoraId, escrito, rigeDesde, cambio, frecuenciaPago }) {
  return {
    asistente_id: asistenteId,
    prestadora_id: prestadoraId,
    unidad_medicion: unidadDeMedicionDe(escrito),
    ...Object.fromEntries(IMPORTES.map((campo) => [campo, importe(escrito?.[campo])])),
    frecuencia_pago: frecuenciaPago,
    ...(cambio && { rige_desde: rigeDesde }),
    updated_at: new Date().toISOString(),
  };
}

/** Un renglón de la historia, con la misma forma para el valor vigente y los anteriores. */
function renglon(fila, vigente) {
  return {
    clave: vigente ? 'vigente' : fila.id ?? `${fila.rige_desde}-${fila.rige_hasta}`,
    vigente,
    unidad_medicion: unidadDeMedicionDe(fila),
    valor: valorDeLaFila(fila),
    valor_hora_extra: importe(fila.valor_hora_extra),
    moneda: fila.moneda ?? null,
    rige_desde: fila.rige_desde ?? null,
    rige_hasta: vigente ? null : fila.rige_hasta ?? null,
  };
}

/**
 * La historia del valor, del más reciente al más viejo: primero el vigente, si hay uno cargado, y
 * después los anteriores. `vigente` trae `rige_desde` y `moneda`; sin `rige_desde` no hay valor
 * cargado todavía.
 */
export function historiaDelValor({ vigente, anteriores }) {
  const filas = [...(anteriores ?? [])]
    .filter((fila) => fila?.rige_desde)
    .sort((a, b) => (a.rige_desde < b.rige_desde ? 1 : a.rige_desde > b.rige_desde ? -1 : 0))
    .map((fila) => renglon(fila, false));
  return vigente?.rige_desde ? [renglon(vigente, true), ...filas] : filas;
}
