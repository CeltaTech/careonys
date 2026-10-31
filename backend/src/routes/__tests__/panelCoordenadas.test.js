/**
 * El punto del mapa de un domicilio que el Panel guarda por su cuenta.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. Antes las coordenadas del domicilio temporal se escribían a mano, y
 * nadie sabe de memoria la latitud de una casa. Los agujeros que tapa acá:
 *
 *  1. Que la dirección se busque sin la localidad, que es lo que desempata la misma calle con el
 *     mismo número en decenas de partidos.
 *  2. Que el nombre del lugar se lea de otra Organización.
 *  3. Que un servicio caído trabe el guardado: tiene que volver en nulo, no en error.
 *  4. Que quien coordina no pueda usarla: el domicilio temporal lo carga también la coordinación.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const USUARIO = '22222222-2222-2222-2222-222222222222';
const LUGAR = '55555555-5555-5555-5555-555555555555';

const respuestas = new Map();
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  const direccion = new URL(req.url, 'http://interno');
  const clave = `${req.method} ${direccion.pathname}`;
  llamadas.push({ clave, filtros: direccion.searchParams });
  const preparada = respuestas.get(clave);
  const valor = typeof preparada === 'function' ? preparada(direccion.searchParams) : preparada;
  if (valor === undefined) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: `la prueba no preparó respuesta para ${clave}` }));
    return;
  }
  const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? valor[0] ?? null : valor));
});
await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

/** El servicio de direcciones de mentira. */
let respuestaDelServicio;
let codigoDelServicio = 200;
let consultasAlServicio = [];
const servicioFalso = createServer((req, res) => {
  consultasAlServicio.push(new URL(req.url, 'http://interno').searchParams);
  res.writeHead(codigoDelServicio, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(respuestaDelServicio));
});
await new Promise((listo) => servicioFalso.listen(0, '127.0.0.1', listo));
process.env.GEOREF_API_BASE = `http://127.0.0.1:${servicioFalso.address().port}`;

const { default: express } = await import('express');
await import('express-async-errors');
const { panelCoordenadasRouter } = await import('../panelCoordenadas.js');

const app = express();
app.use(express.json());
app.use('/api/panel/coordenadas', panelCoordenadasRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const RUTA = `http://127.0.0.1:${backend.address().port}/api/panel/coordenadas`;

// Lo que el backend anota cuando el servicio no contesta se junta acá, para no ensuciar la salida.
const avisarDeVerdad = console.warn;
console.warn = () => {};

after(() => {
  console.warn = avisarDeVerdad;
  backend.close();
  baseFalsa.close();
  servicioFalso.close();
});

async function pedir(cuerpo) {
  const respuesta = await fetch(RUTA, {
    method: 'POST',
    headers: { Authorization: sesionDePrueba(USUARIO), 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

let quienLlama;

beforeEach(() => {
  llamadas = [];
  consultasAlServicio = [];
  respuestas.clear();
  quienLlama = { rol: 'coordinador', prestadora_id: PRESTADORA };
  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [quienLlama]);
  respuestas.set('GET /rest/v1/prestadoras', () => [{ id: PRESTADORA, pais: 'AR' }]);
  respuestas.set('GET /rest/v1/lugares', () => [{ nombre: 'Villa Urquiza' }]);
  respuestaDelServicio = {
    direcciones: [{ altura: { valor: 742 }, ubicacion: { lat: -34.57, lon: -58.48 } }],
  };
  codigoDelServicio = 200;
});

describe('las coordenadas de un domicilio', () => {
  it('quien coordina las obtiene, buscadas con la localidad', async () => {
    const { estado, cuerpo } = await pedir({ calle: 'Siempreviva', numero: '742', lugar_id: LUGAR });
    assert.equal(estado, 200);
    assert.deepEqual(cuerpo, { lat: -34.57, lng: -58.48 });
    assert.equal(consultasAlServicio[0].get('localidad'), 'Villa Urquiza');
  });

  it('el nombre del lugar se lee en la Organización de quien llama', async () => {
    await pedir({ calle: 'Siempreviva', numero: '742', lugar_id: LUGAR, prestadora_id: '9'.repeat(8) });
    const lectura = llamadas.find((l) => l.clave === 'GET /rest/v1/lugares');
    assert.equal(lectura.filtros.get('prestadora_id'), `eq.${PRESTADORA}`);
  });

  it('si el servicio se cayó vuelven en nulo, no en error', async () => {
    codigoDelServicio = 503;
    const { estado, cuerpo } = await pedir({ calle: 'Siempreviva', numero: '742', lugar_id: LUGAR });
    assert.equal(estado, 200);
    assert.deepEqual(cuerpo, { lat: null, lng: null });
  });

  it('sin dirección no se le pregunta nada al servicio', async () => {
    const { cuerpo } = await pedir({});
    assert.deepEqual(cuerpo, { lat: null, lng: null });
    assert.equal(consultasAlServicio.length, 0);
  });
});
