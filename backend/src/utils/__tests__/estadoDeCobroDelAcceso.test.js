import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { estadoDeCobroDeCadaAcceso } from '../estadoDeCobroDelAcceso.js';

const A = 'acceso-a';
const B = 'acceso-b';

describe('el estado de cobro de cada acceso', () => {
  it('el estado es el del período más nuevo, aunque haya llegado antes', () => {
    const mapa = estadoDeCobroDeCadaAcceso([
      { acceso_id: A, estado_cobro: 'pendiente', periodo: '2026-10-01', created_at: '2026-10-01T00:00:00Z', monto: 10, moneda: 'ARS' },
      { acceso_id: A, estado_cobro: 'exitoso', periodo: '2026-09-01', created_at: '2026-10-02T00:00:00Z', fecha_cobro: '2026-09-05', monto: 10, moneda: 'ARS' },
    ]);
    assert.equal(mapa.get(A).estado_cobro, 'pendiente');
    assert.deepEqual(mapa.get(A).ultimo_cobro, { fecha_cobro: '2026-09-05', monto: 10, moneda: 'ARS', periodo: '2026-09-01' });
  });

  it('dentro del mismo período manda el último aviso que llegó', () => {
    const mapa = estadoDeCobroDeCadaAcceso([
      { acceso_id: A, estado_cobro: 'exitoso', periodo: '2026-10-01', created_at: '2026-10-06T00:00:00Z', fecha_cobro: '2026-10-06', monto: 10, moneda: 'USD' },
      { acceso_id: A, estado_cobro: 'fallido', periodo: '2026-10-01', created_at: '2026-10-05T00:00:00Z', monto: 10, moneda: 'USD' },
    ]);
    assert.equal(mapa.get(A).estado_cobro, 'exitoso');
    assert.equal(mapa.get(A).ultimo_cobro.moneda, 'USD');
  });

  it('sin ningún cobro exitoso no hay último cobro, y cada acceso va por su lado', () => {
    const mapa = estadoDeCobroDeCadaAcceso([
      { acceso_id: A, estado_cobro: 'fallido', periodo: '2026-10-01', created_at: '2026-10-05T00:00:00Z', monto: 10, moneda: 'ARS' },
      { acceso_id: B, estado_cobro: 'exitoso', periodo: '2026-08-01', created_at: '2026-08-05T00:00:00Z', fecha_cobro: '2026-08-05', monto: 20, moneda: 'ARS' },
    ]);
    assert.equal(mapa.get(A).estado_cobro, 'fallido');
    assert.equal(mapa.get(A).ultimo_cobro, null);
    assert.equal(mapa.get(B).ultimo_cobro.monto, 20);
  });

  it('sin avisos, el mapa queda vacío', () => {
    assert.equal(estadoDeCobroDeCadaAcceso([]).size, 0);
    assert.equal(estadoDeCobroDeCadaAcceso(null).size, 0);
  });
});
