import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { respaldosQueSeBorran, fechaDelRespaldo, borrarLosVencidos } from '../retencionDeRespaldos.js';
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

  it('también reconoce el respaldo de los datos de una Prestadora, cifrado', () => {
    const f = new Date('2026-10-26T03:57:15.961Z');
    const datos = `${CODIGO}_datos_${f.toISOString().replace(/[:.]/g, '-')}.json.gz.age`;
    assert.deepEqual(fechaDelRespaldo(datos, CODIGO), { clase: 'datos', fecha: f });
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

/* Un depósito de mentira: guarda las claves en memoria y anota qué se pidió borrar. */
function depositoDePrueba(claves, { fallaAlBorrar = () => false } = {}) {
  const hay = new Set(claves);
  return {
    hay,
    async listar(prefijo) { return [...hay].filter((c) => c.startsWith(prefijo)); },
    async borrar(clave) {
      if (fallaAlBorrar(clave)) throw new Error('el depósito no dejó borrar');
      hay.delete(clave);
    },
  };
}

describe('borrarLosVencidos, con el paquete del código', () => {
  const PREFIJO = `${CODIGO}_codigo_`;

  it('borra el paquete que pasó el plazo y deja el de hoy y el mensual', async () => {
    const hoy = nombre('codigo', haceDias(0));
    const mensual = nombre('codigo', new Date('2026-08-01T06:00:00.000Z'));
    const vencido = nombre('codigo', new Date('2026-08-02T06:00:00.000Z'));
    const deposito = depositoDePrueba([hoy, mensual, vencido]);
    const borrados = await borrarLosVencidos(deposito, { prefijo: PREFIJO, codigo: CODIGO, ahora: AHORA });
    assert.equal(borrados, 1);
    assert.deepEqual([...deposito.hay].sort(), [hoy, mensual].sort());
  });

  it('no toca el volcado viejo de la base ni los datos de las Prestadoras, aunque estén vencidos', async () => {
    const volcado = nombre('backup', haceDias(400));
    const datos = `datos/abc/${CODIGO}_datos_${haceDias(400).toISOString().replace(/[:.]/g, '-')}.json.gz.age`;
    const deposito = depositoDePrueba([volcado, datos]);
    assert.equal(await borrarLosVencidos(deposito, { prefijo: PREFIJO, codigo: CODIGO, ahora: AHORA }), 0);
    assert.deepEqual([...deposito.hay].sort(), [volcado, datos].sort());
  });

  it('una falla al borrar se anota y sigue con el siguiente', async () => {
    const a = nombre('codigo', new Date('2026-08-02T06:00:00.000Z'));
    const b = nombre('codigo', new Date('2026-08-03T06:00:00.000Z'));
    const mensual = nombre('codigo', new Date('2026-08-01T06:00:00.000Z'));
    const avisos = [];
    const deposito = depositoDePrueba([mensual, a, b], { fallaAlBorrar: (c) => c === a });
    const borrados = await borrarLosVencidos(deposito, { prefijo: PREFIJO, codigo: CODIGO, ahora: AHORA, avisar: (t) => avisos.push(t) });
    assert.equal(borrados, 1);
    assert.equal(avisos.length, 1);
    assert.deepEqual([...deposito.hay].sort(), [mensual, a].sort());
  });

  it('en una carpeta, no mira lo que está más hondo', async () => {
    const hondo = `datos/abc/viejo/${nombre('datos', haceDias(400))}`;
    const deposito = depositoDePrueba([hondo]);
    assert.equal(await borrarLosVencidos(deposito, { carpeta: 'datos/abc/', codigo: CODIGO, ahora: AHORA }), 0);
    assert.ok(deposito.hay.has(hondo));
  });

  it('sin el código del producto no borra nada: falla', async () => {
    const deposito = depositoDePrueba([nombre('codigo', haceDias(400))]);
    await assert.rejects(borrarLosVencidos(deposito, { prefijo: PREFIJO, ahora: AHORA }));
    assert.equal(deposito.hay.size, 1);
  });
});
