import { test } from 'node:test';
import assert from 'node:assert/strict';

const { elTurnoYaTermino } = await import('../revisarNotificacionesCoordinador.js');

const fin = new Date('2026-10-30T06:00:00');

test('antes del fin del turno, el incidente sigue abierto', () => {
  assert.equal(elTurnoYaTermino({ fin }, new Date('2026-10-30T05:59:00')), false);
});

test('al llegar el fin del turno, el incidente se cierra', () => {
  assert.equal(elTurnoYaTermino({ fin }, new Date('2026-10-30T06:00:00')), true);
});

test('sin fin conocido, el incidente no se cierra', () => {
  assert.equal(elTurnoYaTermino({ fin: null }, new Date('2030-01-01T00:00:00')), false);
  assert.equal(elTurnoYaTermino(undefined, new Date('2030-01-01T00:00:00')), false);
});
