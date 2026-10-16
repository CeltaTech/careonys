/**
 * La suscripción a las notificaciones se guarda con el trabajo de esa Prestadora, nunca con la
 * llave maestra ni con la de otra, y el cambio de dueño deja rastro.
 *
 *   node --test src/utils/__tests__/suscripcionesPush.test.js
 *
 * La base es de mentira y anota con qué credencial le llegó cada consulta. Qué filas le deja ver y
 * escribir la base al trabajo lo deciden sus políticas, y eso no se prueba sin base.
 *
 * Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ASISTENTE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTRO = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SUSCRIPCION = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

/** Lo que lleva adentro la credencial con la que llegó un pedido: quién es y de qué Prestadora. */
function leerCredencial(autorizacion) {
  try {
    return JSON.parse(Buffer.from(autorizacion.replace('Bearer ', '').split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

let llamadas = [];
/** La anotación que ese aparato ya tiene en la Prestadora, o null. */
let anterior = null;

const baseFalsa = createServer((req, res) => {
  let cuerpo = '';
  req.on('data', (parte) => {
    cuerpo += parte;
  });
  req.on('end', () => {
    const url = new URL(req.url, 'http://interno');
    llamadas.push({
      metodo: req.method,
      ruta: url.pathname,
      cuerpo: cuerpo ? JSON.parse(cuerpo) : null,
      credencial: leerCredencial(req.headers.authorization ?? ''),
    });
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (req.method === 'GET') {
      res.end(JSON.stringify(unoSolo ? anterior : anterior ? [anterior] : []));
      return;
    }
    res.end(JSON.stringify(unoSolo ? { id: SUSCRIPCION } : [{ id: SUSCRIPCION }]));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

// El import va después de las variables de entorno: la conexión se arma al importar.
const { guardarSuscripcionPush } = await import('../suscripcionesPush.js');

after(() => {
  baseFalsa.close();
});

beforeEach(() => {
  llamadas = [];
  anterior = null;
});

const guardar = (prestadoraId = PRESTADORA) =>
  guardarSuscripcionPush({
    prestadoraId,
    rol: 'asistente',
    usuarioId: ASISTENTE,
    endpoint: 'https://avisos.test/aparato',
    keys: { p256dh: 'clave-de-mentira', auth: 'auth-de-mentira' },
    userAgent: 'navegador de prueba',
  });

/** Que cada pedido haya salido con el trabajo de esa Prestadora. */
function todasConElTrabajoDe(prestadoraId) {
  assert.ok(llamadas.length > 0, 'llegó a preguntarle a la base');
  for (const llamada of llamadas) {
    assert.equal(llamada.credencial?.role, 'trabajo_sin_persona', llamada.ruta);
    assert.equal(llamada.credencial?.prestadora_id, prestadoraId, llamada.ruta);
  }
}

describe('la suscripción a las notificaciones', () => {
  it('se guarda con el trabajo de esa Prestadora, y no con la llave maestra', async () => {
    assert.deepEqual(await guardar(), { error: null });
    assert.deepEqual(llamadas.map((l) => `${l.metodo} ${l.ruta}`), [
      'GET /rest/v1/push_subscriptions',
      'POST /rest/v1/push_subscriptions',
    ]);
    assert.equal(llamadas[1].cuerpo.prestadora_id, PRESTADORA);
    assert.equal(llamadas[1].cuerpo.asistente_id, ASISTENTE);
    assert.ok(!('cliente_id' in llamadas[1].cuerpo), 'la otra audiencia no se manda');
    todasConElTrabajoDe(PRESTADORA);
  });

  it('si el aparato era de otra persona, deja el rastro con el mismo trabajo', async () => {
    anterior = { id: SUSCRIPCION, asistente_id: OTRO, cliente_id: null };
    assert.deepEqual(await guardar(), { error: null });
    const rastro = llamadas.find((l) => l.ruta === '/rest/v1/auditoria_cambio_dueno_push');
    assert.ok(rastro, 'quedó el rastro');
    assert.equal(rastro.cuerpo.prestadora_anterior, PRESTADORA);
    assert.equal(rastro.cuerpo.prestadora_nueva, PRESTADORA);
    assert.equal(rastro.cuerpo.usuario_anterior, OTRO);
    assert.equal(rastro.cuerpo.usuario_nuevo, ASISTENTE);
    todasConElTrabajoDe(PRESTADORA);
  });

  it('si el aparato ya era de la misma persona, no deja rastro', async () => {
    anterior = { id: SUSCRIPCION, asistente_id: ASISTENTE, cliente_id: null };
    await guardar();
    assert.ok(!llamadas.some((l) => l.ruta === '/rest/v1/auditoria_cambio_dueno_push'));
  });

  it('sin Prestadora devuelve error, y ni siquiera le pregunta a la base', async () => {
    const { error } = await guardar(null);
    assert.ok(error);
    assert.equal(llamadas.length, 0);
  });
});
