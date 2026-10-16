/**
 * Los avisos al celular, con las suscripciones leídas y borradas sólo adentro de su Prestadora.
 *
 *   npm test --prefix backend
 *   node --test backend/src/utils/__tests__/push.test.js
 *
 * POR QUÉ EXISTE ESTA PRUEBA. `../push.js` lee a qué aparatos mandar el aviso y borra los que ya no
 * existen con la credencial del trabajo de la Prestadora, que la base acota a ella. Lo que hay que
 * sostener acá es que las dos cosas vayan con esa credencial y con ninguna otra, filtradas por la
 * Prestadora, y que sin Prestadora no se lea nada.
 *
 * La base es de mentira y contesta por HTTP como la de verdad: con la credencial del trabajo
 * contesta las suscripciones de la Prestadora que lleva adentro, y con cualquier otra, ninguna. El
 * envío al celular se reemplaza por uno que contesta que el aparato ya no existe: así el aviso
 * termina en el borrado.
 *
 * Con el sistema roto —la lectura o el borrado con otra credencial, con la de otra Prestadora, o sin
 * el filtro de la Prestadora— las pruebas dan al revés.
 *
 * Datos inventados, como manda CLAUDE.md §6.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import webpush from 'web-push';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const ASISTENTE = '22222222-2222-2222-2222-222222222222';

/** Todo lo que el backend le pidió a la base, con la dirección entera: los filtros van ahí. */
let llamadas = [];

/** Lo que dice adentro una credencial, o `null` si no se puede leer. */
function leerCredencial(autorizacion) {
  try {
    return JSON.parse(Buffer.from(autorizacion.replace('Bearer ', '').split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

const baseFalsa = createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    const url = new URL(req.url, 'http://interno');
    llamadas.push({ ruta: url.pathname, metodo: req.method, url, credencial: req.headers.authorization });

    const credencial = leerCredencial(req.headers.authorization ?? '');
    const puede = credencial?.role === 'trabajo_sin_persona' && credencial.prestadora_id === PRESTADORA;
    const filas = puede && url.pathname === '/rest/v1/push_subscriptions' && req.method === 'GET'
      ? [{ id: 'suscripcion-1', endpoint: 'https://avisos.ejemplo.test/aparato', p256dh: 'clave-de-prueba', auth: 'secreto-de-prueba' }]
      : [];
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo ? (filas[0] ?? null) : filas));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
const vapid = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
prepararCredencialDePrueba();

// El aparato ya no existe: el servicio de avisos del celular contesta 410.
webpush.sendNotification = async () => {
  const error = new Error('El aparato ya no existe.');
  error.statusCode = 410;
  throw error;
};

// El import va después de dejar puestas las variables de entorno: la conexión a la base se arma
// en el momento en que se importa, y con la dirección que haya en ese instante.
const { enviarPushAsistente } = await import('../push.js');

after(() => {
  baseFalsa.close();
});

beforeEach(() => {
  llamadas = [];
});

/** La llamada fue con la credencial del trabajo de la Prestadora, y filtrada por ella. */
function dentroDeLaPrestadora(llamada) {
  const credencial = leerCredencial(llamada.credencial ?? '');
  assert.equal(credencial?.role, 'trabajo_sin_persona', `${llamada.metodo} fue con otra credencial`);
  assert.equal(credencial.prestadora_id, PRESTADORA, `${llamada.metodo} fue fuera de la Prestadora`);
  assert.equal(llamada.url.searchParams.get('prestadora_id'), `eq.${PRESTADORA}`, `${llamada.metodo} no filtró por la Prestadora`);
}

describe('los avisos al celular', () => {
  it('las suscripciones se leen con la credencial del trabajo de la Prestadora', async () => {
    await enviarPushAsistente(PRESTADORA, ASISTENTE, { titulo: 'Prueba', cuerpo: 'Texto de prueba' });

    const lectura = llamadas.find((l) => l.ruta === '/rest/v1/push_subscriptions' && l.metodo === 'GET');
    assert.ok(lectura, 'tendría que haber leído las suscripciones');
    dentroDeLaPrestadora(lectura);
  });

  it('el aparato que ya no existe se borra con la misma credencial', async () => {
    const llego = await enviarPushAsistente(PRESTADORA, ASISTENTE, { titulo: 'Prueba', cuerpo: 'Texto de prueba' });

    assert.equal(llego, false);
    const borrado = llamadas.find((l) => l.ruta === '/rest/v1/push_subscriptions' && l.metodo === 'DELETE');
    assert.ok(borrado, 'tendría que haber borrado la suscripción vencida');
    dentroDeLaPrestadora(borrado);
    assert.equal(borrado.url.searchParams.get('id'), 'eq.suscripcion-1');
  });

  it('sin Prestadora no lee nada', async () => {
    assert.equal(await enviarPushAsistente(null, ASISTENTE, { titulo: 'Prueba' }), false);
    assert.equal(llamadas.length, 0);
  });
});
