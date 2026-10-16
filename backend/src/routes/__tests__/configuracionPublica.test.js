/**
 * Los datos que muestra el sitio público de una Prestadora.
 *
 *   npm test --prefix backend
 *
 * Las zonas se leen con la credencial del trabajo de la Prestadora de la dirección, y con ninguna
 * otra: ni la llave maestra ni la de otra Prestadora. Se prueba contra una base de mentira.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';

const respuestas = new Map();
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
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
process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-mentira';
prepararCredencialDePrueba();

const { default: express } = await import('express');
await import('express-async-errors');
const { configuracionPublicaRouter } = await import('../configuracionPublica.js');

const app = express();
app.use('/api/publico/:prestadora/configuracion', configuracionPublicaRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/publico`;

after(() => {
  backend.close();
  baseFalsa.close();
});

function credencialDe(llamada) {
  const cuerpo64 = llamada.credencial.replace('Bearer ', '').split('.')[1];
  return JSON.parse(Buffer.from(cuerpo64, 'base64url').toString());
}

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  respuestas.set('POST /rest/v1/rpc/prestadora_de_la_direccion', () => PRESTADORA);
  respuestas.set('GET /rest/v1/configuracion_prestadora', () => [{ prestadora_id: PRESTADORA, nombre: 'Prestadora inventada' }]);
  respuestas.set('GET /rest/v1/zonas_cobertura', () => [{ codigo: 'z1', nombre: 'Zona inventada', categoria: 'a' }]);
});

describe('los datos del sitio público', () => {
  it('lee las zonas sólo adentro de la Prestadora de la dirección', async () => {
    const respuesta = await fetch(`${DIRECCION}/inventada/configuracion`);
    assert.equal(respuesta.status, 200);
    const cuerpo = await respuesta.json();
    assert.equal(cuerpo.empresa.nombre, 'Prestadora inventada');
    assert.equal(cuerpo.zonas[0].nombre, 'Zona inventada');

    const zonas = llamadas.find((l) => l.clave === 'GET /rest/v1/zonas_cobertura');
    const credencial = credencialDe(zonas);
    assert.equal(credencial.role, 'trabajo_sin_persona', 'las zonas se leyeron con otra credencial');
    assert.equal(credencial.prestadora_id, PRESTADORA, 'las zonas se leyeron fuera de la Prestadora');
    assert.match(zonas.busqueda, /activa=eq\.true/);
  });

  it('una dirección que no es de nadie no lee zonas', async () => {
    respuestas.set('POST /rest/v1/rpc/prestadora_de_la_direccion', () => null);
    const respuesta = await fetch(`${DIRECCION}/nadie/configuracion`);
    assert.equal(respuesta.status, 404);
    assert.equal(llamadas.some((l) => l.clave === 'GET /rest/v1/zonas_cobertura'), false);
  });

  it('si la base falla, no devuelve zonas', async () => {
    respuestas.delete('GET /rest/v1/zonas_cobertura');
    const respuesta = await fetch(`${DIRECCION}/inventada/configuracion`);
    assert.notEqual(respuesta.status, 200);
  });
});
