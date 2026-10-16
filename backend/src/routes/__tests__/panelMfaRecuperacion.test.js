/**
 * La puerta de la recuperación del segundo factor.
 *
 *   npm test --prefix backend
 *
 * Sólo pasa Superadmin, y el rol se le pregunta a la base con la credencial de quien pide: con la
 * llave maestra, la prueba falla. Se prueba contra una base de mentira y sin llegar a mandar el
 * código: lo que se mira es quién pasa la puerta.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';

const USUARIO = '22222222-2222-2222-2222-222222222222';

const respuestas = new Map();
let llamadas = [];
let rolDelUsuario = 'superadmin';

const baseFalsa = createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    const direccion = new URL(req.url, 'http://interno');
    const clave = `${req.method} ${direccion.pathname}`;
    llamadas.push({ clave, busqueda: decodeURIComponent(direccion.search), credencial: req.headers.authorization });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada() : preparada;
    if (valor === undefined) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `la prueba no preparó respuesta para ${clave}` }));
      return;
    }

    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? valor[0] ?? null : valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;

const { default: express } = await import('express');
await import('express-async-errors');
const { panelMfaRecuperacionRouter } = await import('../panelMfaRecuperacion.js');

const app = express();
app.use(express.json());
app.use('/api/panel/mfa-recuperacion', panelMfaRecuperacionRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/panel/mfa-recuperacion`;

after(() => {
  backend.close();
  baseFalsa.close();
});

// Sin código, la ruta contesta 400 apenas pasa la puerta: así se sabe quién pasó sin mandar nada.
async function confirmarSinCodigo(autorizacion) {
  const respuesta = await fetch(`${DIRECCION}/confirmar`, {
    method: 'POST',
    headers: { ...(autorizacion ? { Authorization: autorizacion } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  return respuesta.status;
}

beforeEach(() => {
  llamadas = [];
  rolDelUsuario = 'superadmin';
  respuestas.clear();
  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol: rolDelUsuario }]);
});

describe('la puerta de la recuperación del segundo factor', () => {
  it('Superadmin pasa, y su rol se lee con su propia credencial', async () => {
    assert.equal(await confirmarSinCodigo(sesionDePrueba(USUARIO)), 400);
    const rol = llamadas.find((l) => l.clave === 'GET /rest/v1/usuarios');
    assert.equal(rol.credencial, sesionDePrueba(USUARIO), 'el rol se leyó con otra credencial');
    assert.match(rol.busqueda, new RegExp(`id=eq\\.${USUARIO}`));
  });

  it('cualquier otro rol no pasa', async () => {
    rolDelUsuario = 'admin_prestadora';
    assert.equal(await confirmarSinCodigo(sesionDePrueba(USUARIO)), 403);
  });

  it('sin fila propia no pasa', async () => {
    respuestas.set('GET /rest/v1/usuarios', () => []);
    assert.equal(await confirmarSinCodigo(sesionDePrueba(USUARIO)), 403);
  });

  it('sin credencial, o con una que no es de una persona, no pasa', async () => {
    assert.equal(await confirmarSinCodigo(null), 401);
    assert.equal(await confirmarSinCodigo(sesionDePrueba(USUARIO, { rol: 'anon' })), 401);
    assert.equal(llamadas.some((l) => l.clave === 'GET /rest/v1/usuarios'), false);
  });
});
