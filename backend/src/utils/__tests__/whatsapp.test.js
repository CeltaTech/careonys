/**
 * Lo que el envío por WhatsApp lee de la base: con qué credencial lo lee.
 *
 *   node --test src/utils/__tests__/whatsapp.test.js
 *
 * Las credenciales del número, la plantilla de un aviso y el teléfono de mensajes de la Prestadora
 * se leen con el trabajo de esa Prestadora, de a una por vez. El token lo entrega la base sólo a
 * quien trabaja para la misma Prestadora que pide.
 *
 * La base es de mentira y contesta por HTTP como la de verdad: además del resultado se mira con qué
 * credencial se le pidió cada cosa. Con el sistema roto —otra credencial u otra Prestadora— las
 * pruebas dan al revés.
 *
 * Datos inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-1111-4111-8111-111111111111';
const PLANTILLA = '66666666-6666-4666-8666-666666666666';

let llamadas = [];

function leerCredencial(autorizacion) {
  try {
    return JSON.parse(Buffer.from(autorizacion.replace('Bearer ', '').split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const url = new URL(req.url, 'http://interno');
    const clave = `${req.method} ${url.pathname}`;
    llamadas.push({ clave, url, cuerpo: crudo, credencial: req.headers.authorization });
    let respuesta = null;
    if (clave === 'GET /rest/v1/configuracion_whatsapp_prestadora') {
      respuesta = { activo: true, phone_number_id: 'numero-inventado', waba_id: 'cuenta-inventada' };
    }
    if (clave === 'POST /rest/v1/rpc/leer_token_whatsapp') respuesta = 'token-inventado';
    if (clave === 'GET /rest/v1/plantillas_whatsapp') {
      respuesta = { id: PLANTILLA, nombre_interno: 'aviso', idioma: 'es-AR', cuerpo_texto: '{{1}}', estado: 'aprobada' };
    }
    if (clave === 'GET /rest/v1/configuracion_prestadora') respuesta = { whatsapp_numero: '+5400000000' };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(respuesta));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

const { credencialesWhatsapp, plantillaDelEvento, telefonoDeMensajes } = await import('../whatsapp.js');

after(() => {
  baseFalsa.close();
});

beforeEach(() => {
  llamadas = [];
});

function conElTrabajoDeLaPrestadora(llamada) {
  const credencial = leerCredencial(llamada.credencial ?? '');
  assert.equal(credencial?.role, 'trabajo_sin_persona', `${llamada.clave} fue con otra credencial`);
  assert.equal(credencial.prestadora_id, PRESTADORA, `${llamada.clave} fue fuera de la Prestadora`);
}

describe('lo que lee el envío por WhatsApp', () => {
  it('las credenciales del número y el token se leen con el trabajo de la Prestadora', async () => {
    const credenciales = await credencialesWhatsapp(PRESTADORA);
    assert.deepEqual(credenciales, { phoneNumberId: 'numero-inventado', wabaId: 'cuenta-inventada', token: 'token-inventado' });
    assert.equal(llamadas.length, 2);
    for (const llamada of llamadas) conElTrabajoDeLaPrestadora(llamada);
    assert.equal(JSON.parse(llamadas[1].cuerpo).p_prestadora_id, PRESTADORA);
  });

  it('la plantilla de un aviso se lee con el trabajo de la Prestadora', async () => {
    const plantilla = await plantillaDelEvento(PLANTILLA, PRESTADORA);
    assert.equal(plantilla.id, PLANTILLA);
    assert.equal(llamadas.length, 1);
    conElTrabajoDeLaPrestadora(llamadas[0]);
  });

  it('el teléfono de mensajes se lee con el trabajo de la Prestadora', async () => {
    assert.equal(await telefonoDeMensajes(PRESTADORA), '+5400000000');
    assert.equal(llamadas.length, 1);
    conElTrabajoDeLaPrestadora(llamadas[0]);
  });

  it('sin Prestadora no consulta nada y contesta que no hay', async () => {
    assert.equal(await credencialesWhatsapp(null), null);
    assert.equal(await plantillaDelEvento(PLANTILLA, null), null);
    assert.equal(await telefonoDeMensajes(null), null);
    assert.equal(llamadas.length, 0);
  });
});
