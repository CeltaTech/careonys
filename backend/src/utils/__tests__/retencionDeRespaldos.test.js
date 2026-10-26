import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { respaldosQueSeBorran, fechaDelRespaldo } from '../retencionDeRespaldos.js';
import { IDENTIDAD } from '../../config/identidadProducto.js';

const CODIGO = IDENTIDAD.codigo;

/* Lo que se prueba es lo que no se puede deshacer: qué respaldos se borran. Un error acá no se
   nota hasta el día que hace falta uno viejo y ya no está. */

const nombre = (clase, fecha) => `${CODIGO}_${clase}_${fecha.toISOString().replace(/[:.]/g, '-')}.${clase === 'backup' ? 'sql.gz' : 'bundle'}`;
const AHORA = new Date('2026-10-26T04:00:00.000Z');
const haceDias = (n) => new Date(AHORA - n * 24 * 60 * 60 * 1000);

describe('respaldosQueSeBorran', () => {
  it('lee la fecha del nombre que arma el respaldo', () => {
    const f = new Date('2026-10-26T03:57:15.961Z');
    assert.deepEqual(fechaDelRespaldo(nombre('backup', f), CODIGO), { clase: 'backup', fecha: f });
  });

  it('guarda los diarios de los últimos 30 días', () => {
    const nombres = Array.from({ length: 30 }, (_, i) => nombre('backup', haceDias(i)));
    assert.deepEqual(respaldosQueSeBorran(nombres, CODIGO, AHORA), []);
  });

  it('de lo anterior guarda el más viejo de cada mes y borra el resto', () => {
    const viejo = nombre('backup', new Date('2026-08-01T03:00:00.000Z'));
    const otro = nombre('backup', new Date('2026-08-02T03:00:00.000Z'));
    const fin = nombre('backup', new Date('2026-08-31T03:00:00.000Z'));
    assert.deepEqual(respaldosQueSeBorran([fin, otro, viejo], CODIGO, AHORA), [otro, fin]);
  });

  it('borra el mensual que pasó los doce meses', () => {
    const muyViejo = nombre('backup', new Date('2025-09-01T03:00:00.000Z'));
    const anual = nombre('backup', new Date('2025-10-01T03:00:00.000Z'));
    assert.deepEqual(respaldosQueSeBorran([muyViejo, anual], CODIGO, AHORA), [muyViejo]);
  });

  it('el volcado y el código tienen cada uno su mensual', () => {
    const base = nombre('backup', new Date('2026-08-01T03:00:00.000Z'));
    const codigo = nombre('codigo', new Date('2026-08-05T03:00:00.000Z'));
    assert.deepEqual(respaldosQueSeBorran([base, codigo], CODIGO, AHORA), []);
  });

  it('nunca toca lo que no tiene nombre de respaldo', () => {
    const ajenos = ['marca-prestadoras/abc/logo.png', `${CODIGO}_backup_sin_fecha.sql.gz`, 'otro_backup_2020-01-01T00-00-00-000Z.sql.gz'];
    assert.deepEqual(respaldosQueSeBorran(ajenos, CODIGO, AHORA), []);
  });

  it('con un plazo mal configurado no borra nada: falla', () => {
    assert.throws(() => respaldosQueSeBorran([nombre('backup', haceDias(400))], CODIGO, AHORA, { dias: NaN, meses: 12 }));
  });
});
