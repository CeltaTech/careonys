// Las fechas de los documentos del Asistente. Corren sin teléfono ni red.
//
// UNA PRUEBA QUE NO PUEDE FALLAR NO PRUEBA NADA: cada regla se prueba de los dos lados del borde,
// el día que todavía sirve y el día que ya no.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estadoVisible,
  estadoDelCertificado,
  ordenarDocumentos,
  sumarPlazo,
  fechaYaNoValida,
  campoDeFecha,
} from '../documentos.js';

const HOY = new Date(2026, 9, 26); // 2026-10-26

test('los cuatro estados guardados pasan tal cual, salvo el aprobado', () => {
  assert.equal(estadoVisible({ estado: 'falta' }, { hoy: HOY }), 'falta');
  assert.equal(estadoVisible({ estado: 'en_revision' }, { hoy: HOY }), 'en_revision');
  assert.equal(estadoVisible({ estado: 'observado' }, { hoy: HOY }), 'observado');
  assert.equal(estadoVisible({ estado: 'aprobado', fecha_vencimiento: null }, { hoy: HOY }), 'aprobado');
  assert.equal(estadoVisible({}, { hoy: HOY }), 'falta');
});

test('el aprobado se vuelve por vencer y vencido según su fecha', () => {
  assert.equal(estadoVisible({ estado: 'aprobado', fecha_vencimiento: '2026-10-25' }, { hoy: HOY }), 'vencido');
  assert.equal(estadoVisible({ estado: 'aprobado', fecha_vencimiento: '2026-10-26' }, { hoy: HOY }), 'por_vencer');
  assert.equal(estadoVisible({ estado: 'aprobado', fecha_vencimiento: '2026-11-10' }, { hoy: HOY, diasAviso: 30 }), 'por_vencer');
  assert.equal(estadoVisible({ estado: 'aprobado', fecha_vencimiento: '2027-06-01' }, { hoy: HOY, diasAviso: 30 }), 'aprobado');
});

test('el estado calculado por el backend manda', () => {
  assert.equal(estadoVisible({ estado: 'aprobado', estado_visible: 'por_vencer', fecha_vencimiento: '2099-01-01' }), 'por_vencer');
});

test('el certificado: la baja gana sobre la fecha', () => {
  const hoy = new Date('2026-06-01T12:00:00');
  assert.equal(estadoDelCertificado(null), null);
  assert.equal(estadoDelCertificado({ activo: false, fecha_vencimiento: '2099-01-01' }, { hoy }), 'dado_de_baja');
  assert.equal(estadoDelCertificado({ activo: true, fecha_vencimiento: '2026-05-01' }, { hoy }), 'vencido');
  assert.equal(estadoDelCertificado({ activo: true, fecha_vencimiento: '2026-06-10' }, { hoy }), 'por_vencer');
  assert.equal(estadoDelCertificado({ activo: true, fecha_vencimiento: '2027-06-10' }, { hoy }), 'vigente');
});

test('lo que falta va primero y lo aprobado al final', () => {
  const orden = ordenarDocumentos(
    [
      { nombre: 'B', estado: 'aprobado' },
      { nombre: 'A', estado: 'falta' },
      { nombre: 'C', estado: 'observado' },
    ],
    { hoy: HOY }
  ).map((d) => d.nombre);
  assert.deepEqual(orden, ['A', 'C', 'B']);
});

test('el plazo se suma como lo suma la base', () => {
  assert.equal(sumarPlazo('2026-01-31', 1, 'mes'), '2026-02-28');
  assert.equal(sumarPlazo('2024-02-29', 1, 'anio'), '2025-02-28');
  assert.equal(sumarPlazo('2026-10-26', 2, 'semana'), '2026-11-09');
  assert.equal(sumarPlazo('2026-10-26', -1, 'dia'), '2026-10-25');
  assert.equal(sumarPlazo('2026-03-15', -3, 'mes'), '2025-12-15');
});

test('con plazo desde la emisión: sirve hasta el día que vence inclusive', () => {
  const tipo = { vencimiento: 'plazo_desde_emision', periodo_cantidad: 3, periodo_unidad: 'mes' };
  assert.equal(fechaYaNoValida(tipo, '2026-07-26', HOY), null);
  assert.equal(fechaYaNoValida(tipo, '2026-07-25', HOY), '2026-07-25');
  assert.equal(fechaYaNoValida(tipo, '2026-01-01', HOY), '2026-07-25');
});

test('con la fecha del documento: sirve si no pasó', () => {
  const tipo = { vencimiento: 'fecha_del_documento' };
  assert.equal(fechaYaNoValida(tipo, '2026-10-26', HOY), null);
  assert.equal(fechaYaNoValida(tipo, '2026-10-25', HOY), '2026-10-25');
});

test('sin vencimiento, cualquier fecha sirve', () => {
  assert.equal(fechaYaNoValida({ vencimiento: 'no_vence' }, '1990-01-01', HOY), null);
});

test('qué fecha pide cada tipo', () => {
  assert.deepEqual(campoDeFecha({ vencimiento: 'fecha_del_documento' }), { campo: 'fecha_vencimiento', obligatoria: true });
  assert.deepEqual(campoDeFecha({ vencimiento: 'plazo_desde_emision' }), { campo: 'fecha_emision', obligatoria: true });
  assert.deepEqual(campoDeFecha({ vencimiento: 'no_vence' }), { campo: 'fecha_emision', obligatoria: false });
});
