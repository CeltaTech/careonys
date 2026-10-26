/**
 * Cómo se muestra un documento del Asistente y qué fechas valen al cargarlo.
 *
 *   npm test --prefix backend
 *
 * Qué daría con el sistema roto: si un documento en revisión u observado se diera por al día, la
 * prueba de `estaAlDia` lo dice; si el corrimiento de meses desbordara un 31 al mes siguiente, la
 * del 31 de enero da marzo; si se aceptara un vencimiento pasado, la de `llegaVencido` no devuelve
 * fecha.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ESTADO_VISIBLE,
  correrDia,
  diaValido,
  estaAlDia,
  estaEnviado,
  estadoVisible,
  fechasDelDocumento,
  llegaVencido,
} from '../estadoDelDocumento.js';

const HOY = new Date('2026-09-15T10:00:00');

describe('el estado que se muestra', () => {
  it('sin fila es «falta»', () => {
    assert.equal(estadoVisible(null, 30, HOY), ESTADO_VISIBLE.FALTA);
  });

  it('en revisión y observado se muestran tal cual, aunque la fecha esté vencida', () => {
    assert.equal(estadoVisible({ estado: 'en_revision', fecha_vencimiento: '2026-01-01' }, 30, HOY), 'en_revision');
    assert.equal(estadoVisible({ estado: 'observado', fecha_vencimiento: '2026-01-01' }, 30, HOY), 'observado');
  });

  it('un aprobado se vuelve por vencer dentro de la ventana y vencido después', () => {
    assert.equal(estadoVisible({ estado: 'aprobado', fecha_vencimiento: '2027-01-01' }, 30, HOY), 'aprobado');
    assert.equal(estadoVisible({ estado: 'aprobado', fecha_vencimiento: '2026-10-01' }, 30, HOY), 'por_vencer');
    assert.equal(estadoVisible({ estado: 'aprobado', fecha_vencimiento: '2026-09-01' }, 30, HOY), 'vencido');
  });

  it('un aprobado que no vence queda aprobado', () => {
    assert.equal(estadoVisible({ estado: 'aprobado', fecha_vencimiento: null }, 30, HOY), 'aprobado');
  });
});

describe('enviado y al día', () => {
  it('lo que falta o fue observado no cuenta como enviado', () => {
    assert.equal(estaEnviado(null), false);
    assert.equal(estaEnviado({ estado: 'observado' }), false);
    assert.equal(estaEnviado({ estado: 'en_revision' }), true);
    assert.equal(estaEnviado({ estado: 'aprobado' }), true);
  });

  it('al día está sólo lo aprobado y sin vencer', () => {
    assert.equal(estaAlDia({ estado: 'en_revision', fecha_vencimiento: null }, HOY), false);
    assert.equal(estaAlDia({ estado: 'aprobado', fecha_vencimiento: null }, HOY), true);
    assert.equal(estaAlDia({ estado: 'aprobado', fecha_vencimiento: '2026-09-15' }, HOY), true);
    assert.equal(estaAlDia({ estado: 'aprobado', fecha_vencimiento: '2026-09-14' }, HOY), false);
  });
});

describe('las fechas', () => {
  it('un día que no existe no es válido', () => {
    assert.equal(diaValido('2026-02-30'), null);
    assert.equal(diaValido('2026-2-3'), null);
    assert.equal(diaValido(20260203), null);
    assert.equal(diaValido('2026-02-28'), '2026-02-28');
  });

  it('correr un 31 de mes cae en el último día del mes de llegada, como la base', () => {
    assert.equal(correrDia('2026-01-31', 1, 'mes'), '2026-02-28');
    assert.equal(correrDia('2028-02-29', 1, 'anio'), '2029-02-28');
    assert.equal(correrDia('2026-03-31', -1, 'mes'), '2026-02-28');
    assert.equal(correrDia('2026-12-31', 1, 'dia'), '2027-01-01');
    assert.equal(correrDia('2026-09-15', 2, 'semana'), '2026-09-29');
  });
});

describe('las fechas que se piden según cómo vence el tipo', () => {
  const noVence = { vencimiento: 'no_vence' };
  const conPlazo = { vencimiento: 'plazo_desde_emision', periodo_cantidad: 1, periodo_unidad: 'anio' };
  const conFecha = { vencimiento: 'fecha_del_documento' };

  it('si no vence no pide nada, y no guarda vencimiento', () => {
    assert.deepEqual(fechasDelDocumento(noVence, {}), { fecha_emision: null, fecha_vencimiento: null });
  });

  it('con plazo pide la emisión y deja el vencimiento a la base', () => {
    assert.deepEqual(fechasDelDocumento(conPlazo, {}), { motivo: 'faltan_datos' });
    assert.deepEqual(fechasDelDocumento(conPlazo, { fecha_emision: '2026-13-01' }), { motivo: 'fecha_invalida' });
    assert.deepEqual(fechasDelDocumento(conPlazo, { fecha_emision: '2026-01-10', fecha_vencimiento: '2030-01-01' }), {
      fecha_emision: '2026-01-10',
      fecha_vencimiento: null,
    });
  });

  it('con fecha del documento pide el vencimiento', () => {
    assert.deepEqual(fechasDelDocumento(conFecha, {}), { motivo: 'faltan_datos' });
    assert.deepEqual(fechasDelDocumento(conFecha, { fecha_vencimiento: '2027-05-01' }), {
      fecha_emision: null,
      fecha_vencimiento: '2027-05-01',
    });
  });

  it('un documento con plazo que ya no alcanza hoy llega vencido, y dice desde cuándo tiene que estar emitido', () => {
    assert.equal(llegaVencido(conPlazo, { fecha_emision: '2025-09-15' }, HOY), null);
    assert.deepEqual(llegaVencido(conPlazo, { fecha_emision: '2025-09-14' }, HOY), { fecha: '2025-09-14' });
  });

  it('uno con fecha pasada llega vencido con esa fecha', () => {
    assert.deepEqual(llegaVencido(conFecha, { fecha_vencimiento: '2026-09-14' }, HOY), { fecha: '2026-09-14' });
    assert.equal(llegaVencido(conFecha, { fecha_vencimiento: '2026-09-15' }, HOY), null);
    assert.equal(llegaVencido(noVence, {}, HOY), null);
  });
});
