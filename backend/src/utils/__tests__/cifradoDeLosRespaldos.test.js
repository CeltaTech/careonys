import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { Decrypter, generateIdentity, identityToRecipient } from 'age-encryption';

import { clavesPublicasDeLosRespaldos, cifradorDeLaPrestadora } from '../cifradoDeLosRespaldos.js';

const UNA = '11111111-1111-4111-8111-111111111111';

describe('el cifrado de los respaldos', () => {
  it('lee las claves de la variable, y sin variable no hay ninguna', () => {
    assert.deepEqual(clavesPublicasDeLosRespaldos(''), {});
    assert.deepEqual(clavesPublicasDeLosRespaldos(`{"${UNA}":"age1x"}`), { [UNA]: 'age1x' });
  });

  it('una variable mal escrita falla, no se toma como vacía', () => {
    assert.throws(() => clavesPublicasDeLosRespaldos('{no es json'));
    assert.throws(() => clavesPublicasDeLosRespaldos('["age1x"]'));
  });

  it('sin clave, o con algo que no es una clave, no hay cifrador', () => {
    assert.throws(() => cifradorDeLaPrestadora(UNA, {}), /no tiene clave/);
    assert.throws(() => cifradorDeLaPrestadora(UNA, { [UNA]: 'texto' }), /no tiene clave/);
  });

  it('lo cifrado sólo lo abre la clave de esa Prestadora', async () => {
    const propia = await generateIdentity();
    const ajena = await generateIdentity();
    const cifrar = cifradorDeLaPrestadora(UNA, { [UNA]: await identityToRecipient(propia) });
    const cuerpo = await cifrar(Buffer.from('datos de mentira'));
    assert.equal(cuerpo.includes(Buffer.from('datos de mentira')), false);

    const abre = new Decrypter();
    abre.addIdentity(propia);
    assert.equal(await abre.decrypt(new Uint8Array(cuerpo), 'text'), 'datos de mentira');

    const noAbre = new Decrypter();
    noAbre.addIdentity(ajena);
    await assert.rejects(noAbre.decrypt(new Uint8Array(cuerpo)));
  });
});
