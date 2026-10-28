/**
 * `/api/app-asistentes/medicacion` — las órdenes de medicación que ve el Asistente.
 *
 *   npm test --prefix backend
 *
 * Las órdenes y sus recetas se leen con la credencial del trabajo de la Prestadora del Asistente,
 * y con ninguna otra; quién las vio se anota con la credencial del Asistente. La prueba arranca sin
 * la llave maestra, así que una lectura que volviera a ella fallaría al pedirla. Qué filas devuelve
 * cada credencial lo decide la base, no esta prueba.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USUARIO = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const LEGAJO = 'bbbbbbbb-bbbb-bbbb-bbbb-b0000000000b';
const PACIENTE = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ORDEN = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const VIA = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const respuestas = new Map();
const rechazadas = new Set();
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  let cuerpo = '';
  req.on('data', (parte) => (cuerpo += parte));
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    llamadas.push({ clave, url: decodeURIComponent(req.url), credencial: req.headers.authorization, cuerpo });

    if (rechazadas.has(clave)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: '42501', message: 'denegado' }));
      return;
    }
    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada({ url: decodeURIComponent(req.url) }) : preparada ?? [];
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(clave.startsWith('POST') ? 201 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? valor[0] ?? null : valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();
const SESION = sesionDePrueba(USUARIO);

const { default: express } = await import('express');
await import('express-async-errors');
const { appAsistentesMedicacionRouter } = await import('../appAsistentesMedicacion.js');

const app = express();
app.use(express.json());
app.use('/api/app-asistentes/medicacion', appAsistentesMedicacionRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/app-asistentes/medicacion`;

after(() => {
  backend.close();
  baseFalsa.close();
});

async function pedir(camino) {
  const respuesta = await fetch(DIRECCION + camino, { headers: { Authorization: SESION } });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

function delTrabajo(llamada) {
  const cuerpo64 = llamada.credencial.replace('Bearer ', '').split('.')[1];
  return JSON.parse(Buffer.from(cuerpo64, 'base64url').toString());
}

let atiende = true;
let alcanzaLaSalud = true;

beforeEach(() => {
  llamadas = [];
  atiende = true;
  alcanzaLaSalud = true;
  respuestas.clear();
  rechazadas.clear();
  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol: 'asistente', prestadora_id: PRESTADORA }]);
  respuestas.set('GET /rest/v1/asistentes', () => [{ id: LEGAJO, prestadora_id: PRESTADORA, tipo_asistente_id: 'tipo-1' }]);
  respuestas.set('GET /rest/v1/guardia_pacientes', () => (atiende ? [{ guardia_id: 'g1' }] : []));
  respuestas.set('GET /rest/v1/prestadoras', () => [{ pais: 'AR' }]);
  respuestas.set('GET /rest/v1/indicaciones_medicacion', ({ url }) => (url.includes('prescripcion_archivo_url')
    ? [{ id: ORDEN, prescripcion_archivo_url: `${PRESTADORA}/receta.pdf` }]
    : [{ id: ORDEN, medicamento: 'Inventado', via_administracion_id: VIA, via: { clave: 'oral' } }]));
  respuestas.set('POST /rest/v1/consultas_a_hce', () => []);
  respuestas.set('POST /rest/v1/rpc/alcanza_la_informacion_de_salud_la_sesion', () => alcanzaLaSalud);
});

describe('las órdenes de medicación del Asistente', () => {
  it('se leen con el trabajo de su Prestadora, y quién las vio se anota con su credencial', async () => {
    const { estado, cuerpo } = await pedir(`/${PACIENTE}`);
    assert.equal(estado, 200);
    assert.equal(cuerpo.ordenes.length, 1);
    assert.equal(cuerpo.ordenes[0].tiene_receta, true);

    const lecturas = llamadas.filter((l) => l.clave === 'GET /rest/v1/indicaciones_medicacion');
    assert.equal(lecturas.length, 2);
    for (const lectura of lecturas) {
      const credencial = delTrabajo(lectura);
      assert.equal(credencial.role, 'trabajo_sin_persona', 'las órdenes se leyeron con otra credencial');
      assert.equal(credencial.prestadora_id, PRESTADORA, 'las órdenes se leyeron fuera de la Prestadora');
    }

    const anotacion = llamadas.find((l) => l.clave === 'POST /rest/v1/consultas_a_hce');
    assert.equal(anotacion.credencial, SESION, 'la consulta se anotó con otra credencial');
  });

  it('a un Paciente que no atiende no le lee ninguna orden', async () => {
    atiende = false;
    const { estado } = await pedir(`/${PACIENTE}`);
    assert.equal(estado, 404);
    assert.equal(llamadas.some((l) => l.clave === 'GET /rest/v1/indicaciones_medicacion'), false);
  });

  it('si la regla de salud no lo alcanza, no le lee ninguna orden', async () => {
    alcanzaLaSalud = false;
    const { estado } = await pedir(`/${PACIENTE}`);
    assert.equal(estado, 404);
    assert.equal(llamadas.some((l) => l.clave === 'GET /rest/v1/indicaciones_medicacion'), false);
    const pregunta = llamadas.find((l) => l.clave === 'POST /rest/v1/rpc/alcanza_la_informacion_de_salud_la_sesion');
    assert.equal(pregunta.credencial, SESION, 'la regla de salud se preguntó con otra credencial');
  });

  it('si no se puede anotar quién las vio, no las entrega', async () => {
    rechazadas.add('POST /rest/v1/consultas_a_hce');
    const { estado, cuerpo } = await pedir(`/${PACIENTE}`);
    assert.notEqual(estado, 200);
    assert.equal(cuerpo.ordenes, undefined);
  });
});
