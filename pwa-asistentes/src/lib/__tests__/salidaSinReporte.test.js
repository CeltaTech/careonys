// La salida sin Reporte en la aplicación del Asistente: el aviso al que salió con el Reporte
// pendiente y el estado nuevo en la lista de turnos de guardia.
//
// UNA PRUEBA QUE NO PUEDE FALLAR NO PRUEBA NADA: si falta alguna frase en un idioma, si el relevo
// vuelve a enterarse de que el que sale no presentó el Reporte, o si el que salió pierde el camino
// para presentarlo, alguna de estas falla.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { T } from '../../i18n/translations.js';

const pantalla = readFileSync(new URL('../../pages/TurnoGuardiaActivo.jsx', import.meta.url), 'utf8');

for (const idioma of Object.keys(T)) {
  test(`${idioma}: nombra el estado nuevo y trae el aviso`, () => {
    assert.ok(T[idioma].turnos_guardia.estado_salida_sin_reporte);
    assert.ok(T[idioma].turno_guardia_activo.reporte_pendiente);
  });
}

test('los avisos en castellano, de usted y en imperativo', () => {
  assert.equal(T['es-AR'].turnos_guardia.estado_salida_sin_reporte, 'Sin Reporte');
  assert.equal(T['es-AR'].turno_guardia_activo.reporte_pendiente, 'Su Reporte está pendiente. Preséntelo ahora.');
});

test('el relevo no se entera de si el que sale presentó el Reporte', () => {
  assert.doesNotMatch(pantalla, /salienteSinReporte|saliente_sin_reporte/);
  for (const idioma of Object.keys(T)) assert.equal(T[idioma].turno_guardia_activo.saliente_sin_reporte, undefined);
});

test('el que salió sin reporte ve el aviso y el camino para presentarlo', () => {
  assert.match(pantalla, /'salida_sin_reporte'/);
  assert.match(pantalla, /t\.turno_guardia_activo\.reporte_pendiente/);
  assert.match(pantalla, /\/reporte\/\$\{p\.id\}/);
});
