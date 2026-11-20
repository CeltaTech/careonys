/**
 * El período de un Servicio que se da de alta desde el Panel.
 *
 *   npm test --prefix backend
 *
 * Las dos fechas son optativas: sin el primer día la base pone el de hoy, y sin el último el
 * Servicio es de duración indeterminada. Lo que llega tiene que ser una fecha real, y el último
 * día no puede ser anterior al primero.
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { periodoDelServicio } from '../cuentasPanel.js';

function motivo(fn) {
  try {
    fn();
  } catch (error) {
    return error.motivo;
  }
  return null;
}

describe('periodoDelServicio', () => {
  it('sin fechas no agrega nada: la base pone hoy y la duración queda indeterminada', () => {
    assert.deepEqual(periodoDelServicio({}), {});
    assert.deepEqual(periodoDelServicio({ vigenteDesde: '', vigenteHasta: null }), {});
  });

  it('con las dos fechas las guarda tal cual', () => {
    assert.deepEqual(
      periodoDelServicio({ vigenteDesde: '2026-03-01', vigenteHasta: '2026-06-30' }),
      { vigente_desde: '2026-03-01', vigente_hasta: '2026-06-30' },
    );
  });

  it('el mismo día de comienzo y de fin vale', () => {
    assert.deepEqual(
      periodoDelServicio({ vigenteDesde: '2026-03-01', vigenteHasta: '2026-03-01' }),
      { vigente_desde: '2026-03-01', vigente_hasta: '2026-03-01' },
    );
  });

  it('rechaza el último día anterior al primero', () => {
    assert.equal(
      motivo(() => periodoDelServicio({ vigenteDesde: '2026-03-02', vigenteHasta: '2026-03-01' })),
      'dato_invalido',
    );
  });

  it('rechaza lo que no es una fecha real', () => {
    assert.equal(motivo(() => periodoDelServicio({ vigenteDesde: '2026-02-30' })), 'dato_invalido');
    assert.equal(motivo(() => periodoDelServicio({ vigenteHasta: '01/03/2026' })), 'dato_invalido');
  });
});
