import { test } from 'node:test';
import assert from 'node:assert/strict';

const { elTurnoGuardiaYaTermino } = await import('../revisarNotificacionesCoordinador.js');

const fin = new Date('2026-10-30T06:00:00');

test('antes del fin del turno, el incidente sigue abierto', () => {
  assert.equal(elTurnoGuardiaYaTermino({ fin }, new Date('2026-10-30T05:59:00')), false);
});

test('al llegar el fin del turno, el incidente se cierra', () => {
  assert.equal(elTurnoGuardiaYaTermino({ fin }, new Date('2026-10-30T06:00:00')), true);
});

test('sin fin conocido, el incidente no se cierra', () => {
  assert.equal(elTurnoGuardiaYaTermino({ fin: null }, new Date('2030-01-01T00:00:00')), false);
  assert.equal(elTurnoGuardiaYaTermino(undefined, new Date('2030-01-01T00:00:00')), false);
});
