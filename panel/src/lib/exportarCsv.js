// Una lista que se ve en pantalla, bajada como planilla. Se arma del lado del navegador con lo que
// la pantalla ya tiene cargado: no se le pide nada nuevo a la base.

const SEPARADOR = ',';

function celda(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  // Comillas cuando el texto trae el separador, comillas o saltos de renglón; las comillas de
  // adentro se duplican, que es como lo lee cualquier planilla.
  return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/**
 * @param {string[]} encabezados
 * @param {Array<Array<unknown>>} filas
 * @returns {string} El contenido del archivo, con un renglón por fila.
 */
export function armarCsv(encabezados, filas) {
  return [encabezados, ...filas].map((fila) => fila.map(celda).join(SEPARADOR)).join('\r\n');
}

/** Deja el archivo en la carpeta de descargas de quien está mirando. */
export function bajarCsv(nombre, contenido) {
  // La marca del principio hace que las planillas lean bien los acentos.
  const direccion = URL.createObjectURL(new Blob(['﻿', contenido], { type: 'text/csv;charset=utf-8' }));
  const enlace = document.createElement('a');
  enlace.href = direccion;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(direccion);
}
