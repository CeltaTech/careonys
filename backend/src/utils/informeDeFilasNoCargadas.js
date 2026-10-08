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

// Los formatos de Excel que pueden llevar una lista desplegable en una columna. Los demás salen sin
// ella: el texto separado no tiene dónde guardarla, y los otros la biblioteca no la escribe.
const CON_LISTA = new Set(['xlsx', 'xlsm']);

// Lo que va después de la lista en la hoja: la lista tiene que quedar antes del primero que
// aparezca, porque Excel exige ese orden.
const DESPUES_DE_LA_LISTA = [
  'hyperlinks', 'printOptions', 'pageMargins', 'pageSetup', 'headerFooter', 'rowBreaks', 'colBreaks',
  'customProperties', 'cellWatches', 'ignoredErrors', 'smartTags', 'drawing', 'legacyDrawing',
  'picture', 'oleObjects', 'controls', 'webPublishItems', 'tableParts', 'extLst',
];

const escaparXml = (texto) => String(texto)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Le suma a la hoja, ya escrita, una lista desplegable por columna, de la segunda fila a la última.
function conListas(contenido, columnas, listas, cantidadDeFilas) {
  const reglas = Object.entries(listas)
    .filter(([columna, opciones]) => columnas.includes(columna) && opciones.length)
    .map(([columna, opciones]) => {
      const letra = XLSX.utils.encode_col(columnas.indexOf(columna));
      const formula = escaparXml(`"${opciones.join(',')}"`);
      return `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${letra}2:${letra}${cantidadDeFilas + 1}"><formula1>${formula}</formula1></dataValidation>`;
    });
  if (!reglas.length) return contenido;

  const zip = XLSX.CFB.read(contenido, { type: 'buffer' });
  const hoja = XLSX.CFB.find(zip, '/xl/worksheets/sheet1.xml');
  const xml = Buffer.from(hoja.content).toString('utf8');
  const bloque = `<dataValidations count="${reglas.length}">${reglas.join('')}</dataValidations>`;
  const siguiente = DESPUES_DE_LA_LISTA
    .map((etiqueta) => xml.indexOf(`<${etiqueta}`))
    .filter((posicion) => posicion >= 0);
  const donde = siguiente.length ? Math.min(...siguiente) : xml.lastIndexOf('</worksheet>');
  hoja.content = Buffer.from(`${xml.slice(0, donde)}${bloque}${xml.slice(donde)}`, 'utf8');
  hoja.size = hoja.content.length;
  return Buffer.from(XLSX.CFB.write(zip, { fileType: 'zip', type: 'buffer', compression: true }));
}

/**
 * `listas`: por encabezado, las opciones que se pueden elegir en esa columna.
 * @returns {{ contenido: Buffer, tipo: string, nombre: string }} `nombre` es el del archivo
 *   original con la extensión con la que sale.
 */
export function informeDeFilasNoCargadas({ archivoNombre, encabezados, filas, listas = {} }) {
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
  let contenido = extension === 'txt'
    ? Buffer.from(`﻿${XLSX.utils.sheet_to_csv(hoja, { FS: '\t' })}`, 'utf8')
    : XLSX.write(libro, { type: 'buffer', bookType: FORMATOS[extension] });
  if (CON_LISTA.has(extension)) contenido = conListas(contenido, columnas, listas, filas.length);
  return { contenido, tipo: TIPOS[extension], nombre: `${sinExtension}.${extension}` };
}
