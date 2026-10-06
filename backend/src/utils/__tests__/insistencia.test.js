/**
 * Pruebas de cuándo toca volver a avisar.
 *
 *   npm test --prefix backend
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { necesitaNotificar } from '../insistencia.js';

const ULTIMA = '2026-10-06T12:00:00.000Z';
const a = (segundos) => new Date(new Date(ULTIMA).getTime() + segundos * 1000);

describe('necesitaNotificar', () => {
  it('sin aviso anterior, avisa', () => {
    assert.equal(necesitaNotificar({ ultimaNotificacionAt: null, intervaloMinutos: 1, ahora: a(0) }), true);
  });

  it('cumplido el minuto, avisa', () => {
    assert.equal(necesitaNotificar({ ultimaNotificacionAt: ULTIMA, intervaloMinutos: 1, ahora: a(60) }), true);
  });

  it('la vuelta que arranca unos segundos antes del minuto no saltea el aviso', () => {
    assert.equal(necesitaNotificar({ ultimaNotificacionAt: ULTIMA, intervaloMinutos: 1, ahora: a(59.9) }), true);
    assert.equal(necesitaNotificar({ ultimaNotificacionAt: ULTIMA, intervaloMinutos: 1, ahora: a(56) }), true);
  });

  it('lejos del minuto, no repite', () => {
    assert.equal(necesitaNotificar({ ultimaNotificacionAt: ULTIMA, intervaloMinutos: 1, ahora: a(30) }), false);
    assert.equal(necesitaNotificar({ ultimaNotificacionAt: ULTIMA, intervaloMinutos: 1, ahora: a(54) }), false);
  });
});
