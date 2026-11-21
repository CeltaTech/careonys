/**
 * El ajuste por índice del valor del Legajo: las mismas tres claves y la misma revisión que el
 * ajuste del precio de las prestaciones.
 *
 *   npm test --prefix backend
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { ajusteDelPagoDe, ajusteDelPagoQueSePuedeGuardar } from '../ajusteDelPagoPorIndice.js';

describe('el ajuste del pago por índice', () => {
  it('sin nada guardado rige fábrica: sin índice, mensual y con revisión', () => {
    assert.deepEqual(ajusteDelPagoDe({}), {
      indice_de_actualizacion: null,
      meses_entre_actualizaciones: 1,
      ajuste_por_indice: 'revision_previa',
    });
  });

  it('«ninguno» es lo mismo que sin índice', () => {
    assert.equal(ajusteDelPagoDe({ indice_de_actualizacion: 'ninguno' }).indice_de_actualizacion, null);
    assert.deepEqual(ajusteDelPagoQueSePuedeGuardar({ indice_de_actualizacion: 'ninguno' }), { ok: true, valor: {} });
  });

  it('guarda sólo lo que difiere de fábrica', () => {
    assert.deepEqual(
      ajusteDelPagoQueSePuedeGuardar({ indice_de_actualizacion: 'ipc', meses_entre_actualizaciones: 1, ajuste_por_indice: 'automatico' }),
      { ok: true, valor: { indice_de_actualizacion: 'ipc', ajuste_por_indice: 'automatico' } }
    );
  });

  it('dice cuál clave está mal', () => {
    assert.deepEqual(ajusteDelPagoQueSePuedeGuardar({ meses_entre_actualizaciones: 12 }), {
      ok: false,
      clave: 'meses_entre_actualizaciones',
    });
  });

  it('otras claves de la regla no se miran', () => {
    assert.deepEqual(ajusteDelPagoQueSePuedeGuardar({ prorratear_monto_fijo: false, medicion: 'hora' }), { ok: true, valor: {} });
  });
});
