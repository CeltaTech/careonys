// La salida sin Reporte Diario en la aplicación del Asistente: el aviso al relevo, el aviso al que
// salió con el reporte pendiente y el estado nuevo en la lista de turnos de guardia.
//
// UNA PRUEBA QUE NO PUEDE FALLAR NO PRUEBA NADA: si falta alguna frase en un idioma, si la pantalla
// deja de mostrar el aviso al relevo cuando el backend contesta que el que sale no presentó el
// reporte, o si el que salió pierde el camino para presentarlo, alguna de estas falla.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { T } from '../../i18n/translations.js';

const pantalla = readFileSync(new URL('../../pages/TurnoGuardiaActivo.jsx', import.meta.url), 'utf8');

for (const idioma of Object.keys(T)) {
  test(`${idioma}: nombra el estado nuevo y trae los dos avisos`, () => {
    assert.ok(T[idioma].turnos_guardia.estado_salida_sin_reporte);
    assert.ok(T[idioma].turno_guardia_activo.saliente_sin_reporte);
    assert.ok(T[idioma].turno_guardia_activo.reporte_pendiente);
  });
}

test('los avisos en castellano, de usted y en imperativo', () => {
  assert.equal(T['es-AR'].turnos_guardia.estado_salida_sin_reporte, 'Salida sin Reporte Diario');
  assert.equal(T['es-AR'].turno_guardia_activo.saliente_sin_reporte, 'El Asistente saliente no presentó el Reporte Diario.');
  assert.equal(T['es-AR'].turno_guardia_activo.reporte_pendiente, 'Su Reporte Diario está pendiente. Preséntelo ahora.');
});

test('el relevo ve el aviso cuando el backend contesta que el que sale no presentó el reporte', () => {
  assert.match(pantalla, /resultado\.salienteSinReporte\)\s*advertencias\.push\(t\.turno_guardia_activo\.saliente_sin_reporte\)/);
});

test('el que salió sin reporte ve el aviso y el camino para presentarlo', () => {
  assert.match(pantalla, /'salida_sin_reporte'/);
  assert.match(pantalla, /t\.turno_guardia_activo\.reporte_pendiente/);
  assert.match(pantalla, /\/reporte\/\$\{p\.id\}/);
});
