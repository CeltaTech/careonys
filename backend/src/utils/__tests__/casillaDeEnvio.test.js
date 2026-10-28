/**
 * La casilla de envío sale del código de la Prestadora, sin mirar la base.
 *
 * Se corre con:
 *   node --test src/utils/__tests__/casillaDeEnvio.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.REMITENTE_AVISOS = 'avisos@ejemplo.test';

const { casillaDeEnvioDelCodigo, normalizar } = await import('../casillaDeEnvio.js');

test('la casilla es el mismo código', () => {
  assert.equal(casillaDeEnvioDelCodigo('cuidados-del-valle'), 'cuidados-del-valle');
});

test('el código se normaliza: sin tildes, sin mayúsculas, guiones en lugar de lo demás', () => {
  assert.equal(normalizar('Atención Ñandú_2'), 'atencion-nandu-2');
  assert.equal(casillaDeEnvioDelCodigo('Atención Ñandú'), 'atencion-nandu');
});

test('sin código no hay casilla', () => {
  assert.equal(casillaDeEnvioDelCodigo(''), null);
  assert.equal(casillaDeEnvioDelCodigo(undefined), null);
  assert.equal(casillaDeEnvioDelCodigo('___'), null);
});

test('un código igual a la dirección común no da casilla', () => {
  assert.equal(casillaDeEnvioDelCodigo('avisos'), null);
});
