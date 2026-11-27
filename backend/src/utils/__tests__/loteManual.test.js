/**
 * El lote de la carga uno por uno.
 *
 *   npm test --prefix backend
 *
 * Lo que se prueba: el lote nace escribiendo sólo las cinco columnas que la cuenta de la
 * importación puede escribir al crearlo; la misma persona recibe el lote que ya abrió hoy y uno
 * nuevo al día siguiente, cortando el día en la zona de la Prestadora; y lo cargado no entra en un
 * lote ajeno, de otra clase o ya revisado. Todo contra una base en memoria.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseEnMemoria } from './baseEnMemoria.js';
import { abrirLoteManual, anotarLote, exigirLoteAbierto, esIdentificador } from '../loteManual.js';

const PRESTADORA = 'prestadora-a';
const OTRA = 'prestadora-b';
const USUARIO = 'usuario-1';
const COLUMNAS_AL_CREAR = ['archivo_nombre', 'filas_totales', 'prestadora_id', 'tipo', 'usuario_id'];

function inicial(lotes = []) {
  return {
    prestadoras: [
      { id: PRESTADORA, zona_horaria: 'America/Argentina/Buenos_Aires' },
      { id: OTRA, zona_horaria: 'America/Argentina/Buenos_Aires' },
    ],
    importaciones_prestadora: lotes,
  };
}

const altasDeLotes = (base) => base.llamadas.filter((l) => l.tabla === 'importaciones_prestadora' && l.op === 'insert');

test('el lote nace sólo con las columnas que la importación puede escribir al crearlo', async () => {
  const base = baseEnMemoria(inicial());
  await abrirLoteManual(base, { prestadoraId: PRESTADORA, usuarioPanelId: USUARIO, tipo: 'cliente' });
  await anotarLote(base, { prestadoraId: PRESTADORA, usuarioPanelId: USUARIO, tipo: 'lista_precios', archivoNombre: 'precios.xlsx', filasTotales: 3 });
  const altas = altasDeLotes(base);
  assert.equal(altas.length, 2);
  for (const alta of altas) assert.deepEqual(Object.keys(alta.valores).sort(), COLUMNAS_AL_CREAR);
  assert.equal(altas[0].valores.archivo_nombre, null);
  assert.equal(altas[0].valores.filas_totales, 0);
  assert.equal(altas[1].valores.archivo_nombre, 'precios.xlsx');
});

test('la misma persona recibe el lote que ya abrió hoy, y no otro', async () => {
  const base = baseEnMemoria(inicial());
  const primero = await abrirLoteManual(base, { prestadoraId: PRESTADORA, usuarioPanelId: USUARIO, tipo: 'asistente' });
  const creado = base.tablas.importaciones_prestadora.find((l) => l.id === primero);
  const segundo = await abrirLoteManual(base, {
    prestadoraId: PRESTADORA, usuarioPanelId: USUARIO, tipo: 'asistente', ahora: new Date(creado.created_at),
  });
  assert.equal(segundo, primero);
  assert.equal(altasDeLotes(base).length, 1);
});

test('el lote de otro día, de otra clase, de otra persona o ya revisado no se reusa', async () => {
  const viejo = (extra) => ({
    id: `lote-${Math.random()}`, prestadora_id: PRESTADORA, usuario_id: USUARIO, tipo: 'cliente',
    estado_conformidad: 'pendiente', archivo_nombre: null, filas_totales: 0,
    created_at: '2026-11-27T15:00:00.000Z', ...extra,
  });
  const base = baseEnMemoria(inicial([
    // Ayer a la noche en Buenos Aires, aunque en hora universal ya sea hoy.
    viejo({ id: 'de-ayer', created_at: '2026-11-27T02:00:00.000Z' }),
    viejo({ id: 'de-otra-clase', tipo: 'asistente' }),
    viejo({ id: 'de-otra-persona', usuario_id: 'usuario-2' }),
    viejo({ id: 'revisado', estado_conformidad: 'confirmada' }),
    viejo({ id: 'de-planilla', archivo_nombre: 'clientes.xlsx', filas_totales: 4 }),
  ]));
  const id = await abrirLoteManual(base, {
    prestadoraId: PRESTADORA, usuarioPanelId: USUARIO, tipo: 'cliente', ahora: new Date('2026-11-27T18:00:00.000Z'),
  });
  assert.ok(!['de-ayer', 'de-otra-clase', 'de-otra-persona', 'revisado', 'de-planilla'].includes(id));
  assert.equal(altasDeLotes(base).length, 1);
});

test('una clase que no se carga de a uno se rechaza sin abrir nada', async () => {
  const base = baseEnMemoria(inicial());
  await assert.rejects(
    abrirLoteManual(base, { prestadoraId: PRESTADORA, usuarioPanelId: USUARIO, tipo: 'servicio' }),
    (e) => e.motivo === 'dato_invalido',
  );
  assert.equal(altasDeLotes(base).length, 0);
});

test('sin zona horaria de la Prestadora no se abre ningún lote', async () => {
  const base = baseEnMemoria({ prestadoras: [{ id: PRESTADORA, zona_horaria: null }], importaciones_prestadora: [] });
  await assert.rejects(abrirLoteManual(base, { prestadoraId: PRESTADORA, usuarioPanelId: USUARIO, tipo: 'cliente' }));
  assert.equal(altasDeLotes(base).length, 0);
});

test('si la base rechaza el alta del lote, el error sube y no se devuelve ningún lote', async () => {
  const base = baseEnMemoria(inicial());
  base.fallas.importaciones_prestadora = { insert: { code: '42501', message: 'permiso denegado' } };
  await assert.rejects(abrirLoteManual(base, { prestadoraId: PRESTADORA, usuarioPanelId: USUARIO, tipo: 'cliente' }));
});

test('lo cargado entra sólo en un lote abierto de esta Prestadora y de esta clase', async () => {
  const ABIERTO = '11111111-1111-4111-8111-111111111111';
  const AJENO = '22222222-2222-4222-8222-222222222222';
  const REVISADO = '33333333-3333-4333-8333-333333333333';
  const base = baseEnMemoria(inicial([
    { id: ABIERTO, prestadora_id: PRESTADORA, tipo: 'asistente', estado_conformidad: 'pendiente' },
    { id: AJENO, prestadora_id: OTRA, tipo: 'asistente', estado_conformidad: 'pendiente' },
    { id: REVISADO, prestadora_id: PRESTADORA, tipo: 'asistente', estado_conformidad: 'rechazada' },
  ]));
  const pedir = (importacionId, tipo = 'asistente') => exigirLoteAbierto(base, { prestadoraId: PRESTADORA, importacionId, tipo });

  assert.equal((await pedir(ABIERTO)).id, ABIERTO);
  for (const [importacionId, tipo] of [['no-es-un-id', 'asistente'], [AJENO, 'asistente'], [ABIERTO, 'cliente'], [REVISADO, 'asistente']]) {
    await assert.rejects(pedir(importacionId, tipo), (e) => e.motivo === 'lote_no_abierto');
  }
  assert.equal(esIdentificador(ABIERTO), true);
  assert.equal(esIdentificador(`${ABIERTO}'; --`), false);
  assert.equal(esIdentificador(null), false);
});
