/**
 * Lo que el Panel anota de cada pedido queda escrito antes de que salga la respuesta.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. El borrado de datos, la descarga y lo que cambia el rol técnico con
 * un permiso de acceso se anotaban cuando la respuesta ya había salido. La escritura quedaba
 * suelta: si fallaba, la acción quedaba hecha y sin constancia, y nadie se enteraba.
 *
 * Los casos están escritos por el error que evitan:
 *
 *   1. QUE QUIEN BORRÓ O DESCARGÓ RECIBA LA RESPUESTA ANTES DE QUE EL RENGLÓN EXISTA. Se mira qué
 *      llegó a la base en el instante en que llega la respuesta, sin esperar nada más.
 *   2. QUE SE ANOTE UN BORRADO QUE NO SALIÓ BIEN.
 *   3. QUE EL ROL TÉCNICO CAMBIE ALGO SIN CONSTANCIA. Con un permiso de acceso, el renglón se
 *      escribe antes de que la ruta corra; si no se pudo escribir, la ruta no corre.
 *
 * Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COORDINADORA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SOPORTE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PERMISO = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const respuestas = new Map();
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    const cuerpo = crudo ? JSON.parse(crudo) : null;
    llamadas.push({ clave, cuerpo });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada({ cuerpo, url: req.url }) : preparada;
    if (valor === undefined || valor?.__estado) {
      res.writeHead(valor?.__estado ?? 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `la prueba no dejó escribir ${clave}` }));
      return;
    }
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? valor[0] ?? null : valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

const { default: express } = await import('express');
const { requiereRolPanel } = await import('../requiereRolPanel.js');
const { anotarExportacion, ACCION_BORRADO_DE_DATOS, ACCION_EXPORTACION } = await import('../../utils/registroDeActividad.js');

/** Lo que hizo cada ruta de mentira, en el orden en que pasó, junto con lo que llegó a la base. */
const app = express();
app.use(express.json());
app.delete('/api/panel/cosas/:id', requiereRolPanel, (req, res) => {
  llamadas.push({ clave: 'la ruta corrió' });
  if (req.params.id === 'no-existe') return res.status(404).json({ error: 'No se encontró' });
  res.json({ ok: true });
});
app.patch('/api/panel/cosas/:id', requiereRolPanel, (req, res) => {
  llamadas.push({ clave: 'la ruta corrió' });
  res.json({ ok: true });
});
app.get('/api/panel/descarga', requiereRolPanel, anotarExportacion(), (req, res) => {
  llamadas.push({ clave: 'la ruta corrió' });
  res.send('contenido de mentira');
});
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/panel`;

after(() => {
  backend.close();
  baseFalsa.close();
});

let quienPide;

async function pedir(metodo, ruta) {
  const respuesta = await fetch(`${DIRECCION}${ruta}`, {
    method: metodo,
    headers: { Authorization: sesionDePrueba(quienPide), 'Content-Type': 'application/json' },
  });
  // Lo que había llegado a la base en el instante en que llegó la respuesta.
  const enLaBase = llamadas.slice();
  await respuesta.text();
  return { estado: respuesta.status, enLaBase };
}

const renglonesDelRegistro = (enLaBase, accion) =>
  enLaBase
    .filter((l) => l.clave === 'POST /rest/v1/registro_actividad')
    .map((l) => (Array.isArray(l.cuerpo) ? l.cuerpo[0] : l.cuerpo))
    .filter((r) => r.accion === accion);

const auditoriasDeMutacion = (enLaBase) =>
  enLaBase
    .filter((l) => l.clave === 'POST /rest/v1/auditoria_de_accesos')
    .map((l) => (Array.isArray(l.cuerpo) ? l.cuerpo[0] : l.cuerpo))
    .filter((r) => r.tipo_evento === 'mutacion');

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  quienPide = COORDINADORA;
  respuestas.set('GET /auth/v1/user', () => ({ id: quienPide, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () =>
    (quienPide === SOPORTE
      ? [{ rol: 'superadmin', prestadora_id: null, desactivada_en: null }]
      : [{ rol: 'coordinador', prestadora_id: PRESTADORA, desactivada_en: null }]));
  respuestas.set('GET /rest/v1/permisos_de_acceso', () => [{
    id: PERMISO,
    prestadora_id: PRESTADORA,
    expira_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    ultima_actividad_at: new Date().toISOString(),
  }]);
  respuestas.set('PATCH /rest/v1/permisos_de_acceso', () => []);
  respuestas.set('POST /rest/v1/registro_actividad', () => []);
  respuestas.set('POST /rest/v1/auditoria_de_accesos', () => []);
});

describe('el borrado de datos', () => {
  it('queda anotado antes de que la respuesta llegue a quien borró', async () => {
    const { estado, enLaBase } = await pedir('DELETE', '/cosas/una');
    assert.equal(estado, 200);
    const [renglon] = renglonesDelRegistro(enLaBase, ACCION_BORRADO_DE_DATOS);
    assert.ok(renglon, 'el borrado tiene que estar anotado cuando llega la respuesta');
    assert.deepEqual(renglon.detalle, { metodo: 'DELETE', ruta: '/api/panel/cosas/una' });
  });

  it('un borrado que la ruta rechazó no se anota', async () => {
    const { estado, enLaBase } = await pedir('DELETE', '/cosas/no-existe');
    assert.equal(estado, 404);
    assert.equal(renglonesDelRegistro(enLaBase, ACCION_BORRADO_DE_DATOS).length, 0);
  });

  it('si el renglón no se pudo escribir, la respuesta sale igual: el dato ya no está', async () => {
    respuestas.set('POST /rest/v1/registro_actividad', { __estado: 500 });
    const { estado } = await pedir('DELETE', '/cosas/una');
    assert.equal(estado, 200);
  });
});

describe('la descarga', () => {
  it('queda anotada antes de que el archivo llegue a quien lo pidió', async () => {
    const { estado, enLaBase } = await pedir('GET', '/descarga');
    assert.equal(estado, 200);
    assert.equal(renglonesDelRegistro(enLaBase, ACCION_EXPORTACION).length, 1);
  });
});

describe('lo que cambia el rol técnico con un permiso de acceso', () => {
  it('queda anotado antes de que la ruta corra', async () => {
    quienPide = SOPORTE;
    const { estado, enLaBase } = await pedir('PATCH', '/cosas/una');
    assert.equal(estado, 200);
    const [auditoria] = auditoriasDeMutacion(enLaBase);
    assert.ok(auditoria, 'el cambio tiene que estar anotado');
    assert.equal(auditoria.admin_id, SOPORTE);
    assert.equal(auditoria.prestadora_id, PRESTADORA);
    assert.deepEqual(auditoria.detalle, { metodo: 'PATCH', ruta: '/api/panel/cosas/una' });
    const posicionDeLaAuditoria = enLaBase.findIndex((l) => l.clave === 'POST /rest/v1/auditoria_de_accesos');
    const posicionDeLaRuta = enLaBase.findIndex((l) => l.clave === 'la ruta corrió');
    assert.ok(posicionDeLaAuditoria < posicionDeLaRuta, 'la constancia va antes del cambio');
  });

  it('si la constancia no se pudo escribir, el cambio no se hace', async () => {
    quienPide = SOPORTE;
    respuestas.set('POST /rest/v1/auditoria_de_accesos', { __estado: 500 });
    const { estado, enLaBase } = await pedir('PATCH', '/cosas/una');
    assert.equal(estado, 503);
    assert.equal(enLaBase.some((l) => l.clave === 'la ruta corrió'), false);
  });

  it('lo que hace una persona de la Prestadora no pasa por esta constancia', async () => {
    respuestas.set('POST /rest/v1/auditoria_de_accesos', { __estado: 500 });
    const { estado, enLaBase } = await pedir('PATCH', '/cosas/una');
    assert.equal(estado, 200);
    assert.equal(auditoriasDeMutacion(enLaBase).length, 0);
  });
});
