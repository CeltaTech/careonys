import XLSX from 'xlsx';

// Las filas que no se cargaron, de vuelta en un archivo para que la Prestadora complete lo que
// falta y lo vuelva a importar. Sale en el mismo formato que llegó, para que se abra con el mismo
// programa; lo que no es una planilla —un volcado SQL, o lo que interpretó la IA— sale en Excel.
//
// No lee nada de la base: recibe las filas que la pantalla ya tiene, con los encabezados que van
// arriba, que son los del archivo original más los que la pantalla haya sumado.
const FORMATOS = {
  xlsx: 'xlsx', xlsm: 'xlsm', xlsb: 'xlsb', xls: 'biff8', ods: 'ods', fods: 'fods', csv: 'csv', txt: 'txt',
};
const TIPOS = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  xlsb: 'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
  xls: 'application/vnd.ms-excel',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  fods: 'application/vnd.oasis.opendocument.spreadsheet',
  csv: 'text/csv; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
};

/**
 * @returns {{ contenido: Buffer, tipo: string, nombre: string }} `nombre` es el del archivo
 *   original con la extensión con la que sale.
 */
export function informeDeFilasNoCargadas({ archivoNombre, encabezados, filas }) {
  const original = String(archivoNombre ?? '');
  const extensionOriginal = (original.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase();
  const extension = FORMATOS[extensionOriginal] ? extensionOriginal : 'xlsx';
  const sinExtension = original.replace(/\.[a-z0-9]+$/i, '') || 'importacion';

  const columnas = encabezados.map(String);
  const hoja = XLSX.utils.json_to_sheet(
    filas.map((fila) => Object.fromEntries(columnas.map((columna) => [columna, fila?.[columna] ?? '']))),
    { header: columnas },
  );
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Hoja1');
  // El texto separado por tabulaciones se arma aparte: la biblioteca lo escribe en un juego de
  // caracteres que pierde los acentos. Lleva la marca del principio, igual que el CSV, que ya la
  // trae de la biblioteca, para que la planilla lea bien los acentos.
  const contenido = extension === 'txt'
    ? Buffer.from(`﻿${XLSX.utils.sheet_to_csv(hoja, { FS: '\t' })}`, 'utf8')
    : XLSX.write(libro, { type: 'buffer', bookType: FORMATOS[extension] });
  return { contenido, tipo: TIPOS[extension], nombre: `${sinExtension}.${extension}` };
}
