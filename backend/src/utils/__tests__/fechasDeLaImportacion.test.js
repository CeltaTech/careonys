/**
 * La fecha desde la que rige el valor hora, leída de una planilla de Asistentes: la fecha buena se
 * guarda, la que no se entiende devuelve la fila con su motivo, y sin valor hora se ignora.
 *
 *   npm test --prefix backend
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import XLSX from 'xlsx';
import { fechaDelValorHora, fechaDeLaCelda, parsearArchivo, CAMPOS_IMPORTACION } from '../importacionIA.js';

// 46086 es el 5 de marzo de 2026 contado como lo cuenta Excel.
const CINCO_DE_MARZO = 46086;

function planillaDeExcel(filas) {
  const hoja = XLSX.utils.aoa_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Asistentes');
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
}

describe('la fecha desde la que rige el valor hora, en la importación', () => {
  it('la planilla ofrece el campo para mapear la columna', () => {
    assert.ok(CAMPOS_IMPORTACION.asistente.includes('valor_hora_rige_desde'));
  });

  it('una fecha buena se guarda, escrita de cualquiera de las tres formas', () => {
    assert.equal(fechaDelValorHora({ valor_hora: '1500', valor_hora_rige_desde: '2026-03-05' }), '2026-03-05');
    assert.equal(fechaDelValorHora({ valor_hora: '1500', valor_hora_rige_desde: '5/3/2026' }), '2026-03-05');
    assert.equal(fechaDelValorHora({ valor_hora: 1500, valor_hora_rige_desde: CINCO_DE_MARZO }), '2026-03-05');
    // La parte decimal es la hora del día y no cambia la fecha.
    assert.equal(fechaDelValorHora({ valor_hora: 1500, valor_hora_rige_desde: CINCO_DE_MARZO + 0.75 }), '2026-03-05');
  });

  it('una fecha que no se entiende devuelve la fila con el motivo de fecha inválida', () => {
    for (const mala of ['marzo', '31/02/2026', '2026-13-01', '05-03-2026', 0]) {
      assert.throws(
        () => fechaDelValorHora({ valor_hora: '1500', valor_hora_rige_desde: mala }),
        (error) => error.motivo === 'fecha_invalida',
        `debió rechazar ${mala}`,
      );
    }
  });

  it('una fecha sin valor hora se ignora, aunque no se entienda', () => {
    assert.equal(fechaDelValorHora({ valor_hora: undefined, valor_hora_rige_desde: '2026-03-05' }), undefined);
    assert.equal(fechaDelValorHora({ valor_hora: undefined, valor_hora_rige_desde: 'marzo' }), undefined);
  });

  it('un valor hora sin fecha no trae fecha, y la base pone la de hoy', () => {
    assert.equal(fechaDelValorHora({ valor_hora: '1500', valor_hora_rige_desde: undefined }), undefined);
    assert.equal(fechaDeLaCelda(''), undefined);
  });
});

describe('las fechas al leer el archivo', () => {
  it('un CSV deja el día adelante: 05/03/2026 es el 5 de marzo, no el 3 de mayo', () => {
    const csv = Buffer.from(['Nombre,Valor hora,Desde', 'Ana Prueba,1500,05/03/2026', ''].join('\n'), 'utf8');
    const { filas } = parsearArchivo(csv, 'asistentes.csv');
    assert.equal(filas[0].Desde, '05/03/2026');
    assert.equal(fechaDeLaCelda(filas[0].Desde), '2026-03-05');
  });

  it('un archivo de Excel entrega la celda de fecha como número, y se lee como fecha', () => {
    const buffer = planillaDeExcel([['Nombre', 'Valor hora', 'Desde'], ['Ana Prueba', 1500, CINCO_DE_MARZO]]);
    const { filas } = parsearArchivo(buffer, 'asistentes.xlsx');
    assert.equal(filas[0]['Valor hora'], 1500);
    assert.equal(fechaDeLaCelda(filas[0].Desde), '2026-03-05');
  });
});
