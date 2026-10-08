/**
 * Las filas que no se cargaron vuelven en el mismo formato en que llegó la planilla.
 *
 *   npm test --prefix backend
 *
 * La Prestadora las completa y las vuelve a importar, así que el archivo tiene que abrirse con el
 * mismo programa y traer las mismas columnas, en el mismo orden, más las que sumó la pantalla.
 * Se lee de vuelta lo que se escribió, con la misma biblioteca con la que se leen las planillas
 * que llegan: si una columna se perdiera o cambiara de lugar, la importación siguiente fallaría.
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import XLSX from 'xlsx';
import { informeDeFilasNoCargadas } from '../informeDeFilasNoCargadas.js';

// Datos inventados.
const encabezados = ['Nombre', 'Domicilio', 'CUIL del Paciente', 'Motivo'];
const filas = [
  { Nombre: 'Íñigo Peña', Domicilio: 'Calle Inventada 100', Motivo: 'Falta el CUIL del Paciente.' },
  { Nombre: 'Zoe Ruiz', Domicilio: 'Otra Calle 5', 'CUIL del Paciente': '', Motivo: 'Faltan datos.' },
];

function leer(contenido) {
  const libro = XLSX.read(contenido, { type: 'buffer' });
  return XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], { header: 1, defval: '' });
}

describe('el informe de las filas que no se cargaron', () => {
  it('sale en Excel si llegó en Excel, con las columnas en el mismo orden', () => {
    const informe = informeDeFilasNoCargadas({ archivoNombre: 'cartera.xlsx', encabezados, filas });

    assert.equal(informe.nombre, 'cartera.xlsx');
    assert.match(informe.tipo, /spreadsheetml/);
    assert.deepEqual(leer(informe.contenido), [
      encabezados,
      ['Íñigo Peña', 'Calle Inventada 100', '', 'Falta el CUIL del Paciente.'],
      ['Zoe Ruiz', 'Otra Calle 5', '', 'Faltan datos.'],
    ]);
  });

  it('sale en CSV si llegó en CSV, con la marca que hace leer bien los acentos', () => {
    const informe = informeDeFilasNoCargadas({ archivoNombre: 'Cartera.CSV', encabezados, filas });

    assert.equal(informe.nombre, 'Cartera.csv');
    assert.match(informe.tipo, /^text\/csv/);
    assert.deepEqual([...informe.contenido.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    const texto = informe.contenido.subarray(3).toString('utf8');
    assert.equal(texto.split(/\r?\n/)[0], encabezados.join(','));
    assert.match(texto, /Íñigo Peña/);
  });

  it('sale en texto con tabulaciones si llegó así, sin perder los acentos', () => {
    const informe = informeDeFilasNoCargadas({ archivoNombre: 'cartera.txt', encabezados, filas });

    assert.equal(informe.nombre, 'cartera.txt');
    assert.match(informe.tipo, /^text\/plain/);
    assert.deepEqual([...informe.contenido.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    const renglones = informe.contenido.subarray(3).toString('utf8').split(/\r?\n/);
    assert.equal(renglones[0], encabezados.join('\t'));
    assert.equal(renglones[1], ['Íñigo Peña', 'Calle Inventada 100', '', 'Falta el CUIL del Paciente.'].join('\t'));
  });

  it('sale en el formato viejo de Excel si llegó así', () => {
    const informe = informeDeFilasNoCargadas({ archivoNombre: 'cartera.xls', encabezados, filas });

    assert.equal(informe.nombre, 'cartera.xls');
    assert.equal(informe.tipo, 'application/vnd.ms-excel');
    assert.equal(leer(informe.contenido)[1][0], 'Íñigo Peña');
  });

  it('lo que no era una planilla sale en Excel', () => {
    const informe = informeDeFilasNoCargadas({ archivoNombre: 'volcado.sql', encabezados, filas });

    assert.equal(informe.nombre, 'volcado.xlsx');
    assert.match(informe.tipo, /spreadsheetml/);
    assert.deepEqual(leer(informe.contenido)[0], encabezados);
  });

  it('sin nombre de archivo, igual sale con uno', () => {
    const informe = informeDeFilasNoCargadas({ archivoNombre: undefined, encabezados, filas });

    assert.equal(informe.nombre, 'importacion.xlsx');
  });
});
