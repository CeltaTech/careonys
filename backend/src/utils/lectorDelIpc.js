/* El lector de la serie del IPC que publica el INDEC.
   ==========================================================================

   QUÉ LEE. `serie_ipc_divisiones.csv`, la serie mensual del índice de precios al consumidor por
   división y región. El archivo separa las columnas con punto y coma, escribe los decimales con
   coma y viene en Latin-1. Sus columnas son:

     Codigo;Descripcion;Clasificador;Periodo;Indice_IPC;v_m_IPC;v_i_a_IPC;Region

   De todo eso sirve un solo renglón por mes: el nivel general (`Codigo` 0) de la región
   `Nacional`. `Periodo` viene como AAAAMM.

   ES UNA FUNCIÓN PURA. Recibe el texto y devuelve los valores; no baja nada ni escribe nada. Así se
   prueba con un fragmento inventado, y un cambio de formato del archivo se descubre en la prueba y
   no en la base.

   FALLA CERRADO. Si el encabezado no trae las columnas que hacen falta, no se adivina: se lanza un
   error. Un renglón con un número que no se entiende se descarta, nunca se guarda como cero. */

const COLUMNAS_NECESARIAS = ['Codigo', 'Periodo', 'Indice_IPC', 'Region'];

/** El texto de los bytes del archivo, que viene en Latin-1. */
export function decodificarLatin1(bytes) {
  return new TextDecoder('latin1').decode(bytes);
}

function sinComillas(celda) {
  const limpia = String(celda ?? '').trim();
  return limpia.startsWith('"') && limpia.endsWith('"') && limpia.length >= 2
    ? limpia.slice(1, -1).trim()
    : limpia;
}

/** «12785,9321» → 12785.9321. Con coma decimal acepta el punto de miles; sin coma, el punto es el
    decimal. Devuelve null si no es un número. */
export function numeroConComa(texto) {
  const crudo = sinComillas(texto);
  const limpio = crudo.includes(',') ? crudo.replace(/\./g, '').replace(',', '.') : crudo;
  if (!/^-?\d+(\.\d+)?$/.test(limpio)) return null;
  const numero = Number(limpio);
  return Number.isFinite(numero) ? numero : null;
}

/** «202610» → «2026-10-01». Devuelve null si no es un mes. */
export function periodoDeAAAAMM(texto) {
  const limpio = sinComillas(texto);
  const coincide = /^(\d{4})(\d{2})$/.exec(limpio);
  if (!coincide) return null;
  const mes = Number(coincide[2]);
  if (mes < 1 || mes > 12) return null;
  return `${coincide[1]}-${coincide[2]}-01`;
}

/**
 * Los valores mensuales del nivel general nacional.
 *
 * @param {string} texto  El contenido del archivo, ya decodificado.
 * @returns {Array<{periodo: string, valor: number}>}  Ordenados por período, uno por mes.
 */
export function leerIpcNacional(texto) {
  const renglones = String(texto ?? '')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((r) => r.trim() !== '');
  if (renglones.length === 0) throw new Error('El archivo del IPC llegó vacío.');

  const encabezado = renglones[0].split(';').map(sinComillas);
  const posicion = Object.fromEntries(COLUMNAS_NECESARIAS.map((c) => [c, encabezado.indexOf(c)]));
  const faltan = COLUMNAS_NECESARIAS.filter((c) => posicion[c] === -1);
  if (faltan.length > 0) {
    throw new Error(`El archivo del IPC no trae las columnas ${faltan.join(', ')}.`);
  }

  const porPeriodo = new Map();
  for (const renglon of renglones.slice(1)) {
    const celdas = renglon.split(';');
    if (sinComillas(celdas[posicion.Codigo]) !== '0') continue;
    if (sinComillas(celdas[posicion.Region]).toLowerCase() !== 'nacional') continue;
    const periodo = periodoDeAAAAMM(celdas[posicion.Periodo]);
    const valor = numeroConComa(celdas[posicion.Indice_IPC]);
    if (!periodo || valor === null || valor <= 0) continue;
    porPeriodo.set(periodo, valor);
  }

  return [...porPeriodo.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodo, valor]) => ({ periodo, valor }));
}
