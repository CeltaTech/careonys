/**
 * La importación no pierde nada: un libro con varias hojas entra con todas, una copia de una base
 * con texto difícil y varias tablas da una hoja por tabla, los renglones contados que no se
 * leyeron se notan, y el texto pegado entra como un archivo más. Todo con datos inventados.
 *
 *   npm test --prefix backend
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import XLSX from 'xlsx';
import { archivoDelTexto, leerArchivo } from '../lecturaDeArchivos.js';
import {
  analizarLaImportacion, archivoDelPedido, faltanRenglones, hojasConfirmadas, leerLaImportacion, tamanoMaximoDeImportacion,
  textoDeLasHojas,
} from '../analisisDeLaImportacion.js';

function libroDeVariasHojas() {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([
    ['Nombre', 'DNI'], ['Ana Prueba', '20111222'], ['Beto Ficticio', '20333444'],
  ]), 'Asistentes');
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([
    ['Nombre', 'Especialidad'], ['Ana Prueba', 'Geriatría'],
  ]), 'Especialidades');
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([
    ['Nota'], ['Hoja con una sola columna'],
  ]), 'Notas');
  return {
    buffer: XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }),
    originalname: 'personal.xlsx',
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

const COPIA_DE_BASE = [
  '-- Copia inventada',
  'CREATE TABLE pacientes (id int, nombre text, nota text);',
  "INSERT INTO pacientes (id, nombre, nota) VALUES (1, 'O''Brien, Juana', 'dice: \"hola\"; y sigue'),",
  "(2, 'Pérez (hijo)', 'línea con ; punto y coma, coma y paréntesis )');",
  'CREATE TABLE medicacion (id int, paciente int, droga text);',
  "INSERT INTO medicacion (id, paciente, droga) VALUES (10, 1, 'Paracetamol 500 mg');",
  "INSERT INTO medicacion (id, paciente, droga) VALUES (11, 2, 'Ibuprofeno; 400 mg');",
].join('\n');

describe('un libro con varias hojas', () => {
  it('entra con todas sus hojas, cada una con su nombre y sus filas', async () => {
    const lectura = await leerArchivo(libroDeVariasHojas());
    assert.equal(lectura.esDocumento, false);
    assert.deepEqual(lectura.hojas.map((h) => h.nombre), ['Asistentes', 'Especialidades', 'Notas']);
    assert.equal(lectura.hojas[0].filas.length, 2);
    assert.equal(lectura.hojas[1].filas[0].Especialidad, 'Geriatría');
    assert.equal(lectura.hojas[2].filas.length, 1);
  });

  it('el análisis propone un mapeo por hoja', async () => {
    const analisis = await analizarLaImportacion(
      { tipo: 'asistente', archivo: libroDeVariasHojas(), prestadoraId: 'p' },
      { proponerMapeoIA: async ({ headers }) => ({ mapeo: Object.fromEntries(headers.map((h) => [h, null])), advertencias: [] }) },
    );
    assert.equal(analisis.hojas.length, 3);
    assert.deepEqual(Object.keys(analisis.hojas[1].mapeoPropuesto), ['Nombre', 'Especialidad']);
  });
});

describe('una copia de una base con texto difícil y varias tablas', () => {
  it('da una hoja por tabla, con el texto entero aunque traiga comillas, punto y coma y paréntesis', async () => {
    const lectura = await leerArchivo({ buffer: Buffer.from(COPIA_DE_BASE), originalname: 'copia.sql', mimetype: 'application/sql' });
    assert.equal(lectura.esDocumento, false);
    const [pacientes, medicacion] = lectura.hojas;
    assert.equal(lectura.hojas.length, 2);
    assert.equal(pacientes.filas.length, 2);
    assert.equal(pacientes.filas[0].nombre, "O'Brien, Juana");
    assert.equal(pacientes.filas[0].nota, 'dice: "hola"; y sigue');
    assert.equal(pacientes.filas[1].nota, 'línea con ; punto y coma, coma y paréntesis )');
    assert.equal(medicacion.filas.length, 2);
    assert.equal(medicacion.filas[1].droga, 'Ibuprofeno; 400 mg');
  });

  it('cuenta los renglones de cada tabla y coinciden con los leídos', async () => {
    const lectura = await leerArchivo({ buffer: Buffer.from(COPIA_DE_BASE), originalname: 'copia.sql', mimetype: 'application/sql' });
    for (const hoja of lectura.hojas) assert.equal(faltanRenglones(hoja), false);
  });
});

describe('los renglones contados', () => {
  it('se nota cuando faltan renglones leídos', () => {
    assert.equal(faltanRenglones({ renglonesContados: 3, filas: [{}, {}] }), true);
    assert.equal(faltanRenglones({ renglonesContados: 2, filas: [{}, {}] }), false);
  });
  it('una hoja sin cuenta no se compara', () => {
    assert.equal(faltanRenglones({ renglonesContados: null, filas: [{}] }), false);
    assert.equal(faltanRenglones({ filas: [] }), false);
  });
});

describe('el texto pegado', () => {
  it('entra como un archivo de texto', () => {
    const archivo = archivoDelPedido({ texto: 'Nombre;DNI\nAna Prueba;20111222' });
    assert.equal(archivo.originalname, 'texto-pegado.txt');
    assert.equal(archivo.mimetype, 'text/plain');
    assert.equal(archivo.buffer.toString('utf8'), 'Nombre;DNI\nAna Prueba;20111222');
  });

  it('con forma de tabla, se lee como tabla', async () => {
    const lectura = await leerArchivo(archivoDelTexto('Nombre;DNI\nAna Prueba;20111222\nBeto Ficticio;20333444'));
    assert.equal(lectura.esDocumento, false);
    assert.equal(lectura.hojas[0].filas.length, 2);
  });

  it('sin forma de tabla y sin IA, queda como documento con su texto entero', async () => {
    const texto = 'La paciente toma una pastilla a la mañana.';
    const lectura = await leerLaImportacion(
      { archivo: archivoDelTexto(texto), prestadoraId: 'p' },
      { leerEstructuraIA: async () => ({ esTabla: false, advertencias: ['ia_no_configurada'] }) },
    );
    assert.equal(lectura.esDocumento, true);
    assert.equal(lectura.documento.texto, texto);
    assert.deepEqual(lectura.advertencias, ['ia_no_configurada']);
  });

  it('el archivo subido manda sobre el texto, y sin ninguno de los dos falta el archivo', () => {
    const subido = { buffer: Buffer.from('x'), originalname: 'a.csv' };
    assert.equal(archivoDelPedido({ archivo: subido, texto: 'otro' }), subido);
    assert.throws(() => archivoDelPedido({ texto: '   ' }), (e) => e.motivo === 'falta_el_archivo');
  });
});

describe('lo que confirma la pantalla por cada hoja', () => {
  const hojasLeidas = [
    { indice: 0, nombre: 'A', headers: ['Nombre', 'Raro'], filas: [] },
    { indice: 1, nombre: 'B', headers: ['Otra'], filas: [] },
  ];

  it('una hoja que la pantalla no mandó entra igual, sin mapeo', () => {
    const hojas = hojasConfirmadas({ tipo: 'asistente', hojasLeidas, hojasMandadas: [{ indice: 0, mapeo: { Nombre: 'nombre' } }] });
    assert.equal(hojas.length, 2);
    assert.equal(hojas[0].mapeo.Nombre, 'nombre');
    assert.deepEqual(hojas[1].mapeo, { Otra: null });
  });

  it('un campo que no existe se descarta, y la columna queda sin lugar', () => {
    const [hoja] = hojasConfirmadas({ tipo: 'asistente', hojasLeidas, hojasMandadas: [{ indice: 0, mapeo: { Raro: 'no_existe' } }] });
    assert.equal(hoja.mapeo.Raro, null);
  });

  it('una hoja que no está en el archivo es un dato inválido con su número de hoja', () => {
    assert.throws(
      () => hojasConfirmadas({ tipo: 'asistente', hojasLeidas, hojasMandadas: [{ indice: 7, mapeo: {} }] }),
      (e) => e.motivo === 'dato_invalido' && e.hoja === 7,
    );
  });
});

describe('el texto de las hojas y el tope de tamaño', () => {
  it('el texto de una tabla guardada como documento lleva todas sus celdas', () => {
    const texto = textoDeLasHojas([{ nombre: 'A', headers: ['x', 'y'], filas: [{ x: 1, y: 'dos' }] }]);
    assert.equal(texto, 'A\nx\ty\n1\tdos');
  });
  it('el tope sale de la configuración, con 20 megabytes si no está', () => {
    assert.equal(tamanoMaximoDeImportacion({}), 20 * 1024 * 1024);
    assert.equal(tamanoMaximoDeImportacion({ TAMANO_MAXIMO_IMPORTACION_MB: '5' }), 5 * 1024 * 1024);
  });
});
