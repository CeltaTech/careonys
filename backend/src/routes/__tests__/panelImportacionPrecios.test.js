/**
 * La lista de precios es de la facturación del Cliente.
 *
 *   node --test src/routes/__tests__/panelImportacionPrecios.test.js
 *
 * Importar la lista de precios, y abrir el lote que dejó, pide además de la acción de importar la
 * de la facturación del Cliente. El lote de una importación de personas no la pide.
 *
 * Se levanta el backend de verdad contra una base de mentira. La base contesta el permiso según la
 * acción que se le pregunta: así la prueba distingue «tiene la de importar y no la de facturación»,
 * que es justo el caso que se cierra.
 *
 * Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const USUARIO = '22222222-2222-2222-2222-222222222222';
const LOTE = '33333333-3333-4333-8333-333333333333';

const respuestas = new Map();
let llamadas = [];
/** Las acciones que la persona tiene habilitadas. */
let habilitadas = new Set();

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    const cuerpo = crudo ? JSON.parse(crudo) : null;
    llamadas.push({ clave, url: req.url, cuerpo });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada(cuerpo) : preparada;
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
prepararCredencialDePrueba();

const { default: express } = await import('express');
await import('express-async-errors');
const { panelImportacionRouter } = await import('../panelImportacion.js');

const app = express();
app.use(express.json());
app.use('/api/panel/importacion', panelImportacionRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/panel/importacion`;

after(() => {
  backend.close();
  baseFalsa.close();
});

async function pedir(metodo, ruta, cuerpo) {
  const respuesta = await fetch(`${DIRECCION}${ruta}`, {
    method: metodo,
    headers: { Authorization: sesionDePrueba(USUARIO), 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

/** El lote guardado, del tipo que diga la prueba. */
function unLote(tipo) {
  return {
    id: LOTE,
    prestadora_id: PRESTADORA,
    tipo,
    estado_conformidad: tipo === 'lista_precios' ? 'confirmada' : 'pendiente',
    errores: tipo === 'lista_precios' ? [{ fila: 2, motivo: 'precio_ilegible' }] : [],
  };
}

beforeEach(() => {
  llamadas = [];
  habilitadas = new Set(['importar_datos_masivos']);
  respuestas.clear();
  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol: 'coordinador', prestadora_id: PRESTADORA, desactivada_en: null }]);
  respuestas.set('POST /rest/v1/rpc/tiene_permiso_la_sesion', (cuerpo) => habilitadas.has(cuerpo?.p_accion));
  respuestas.set('POST /rest/v1/rpc/importar_lista_de_precios', () => ({ agregados: 1, cambiados: 0, sin_cambio: 0, dudosos: [] }));
  respuestas.set('POST /rest/v1/importaciones_prestadora', () => [{ id: LOTE }]);
  respuestas.set('GET /rest/v1/asistentes', () => []);
});

const LISTA = {
  filas: [{ Servicio: 'Acompañamiento', Modalidad: 'hora', Precio: '1000' }],
  mapeo: { tipo_servicio: 'Servicio', modalidad: 'Modalidad', precio: 'Precio' },
  archivoNombre: 'lista.csv',
  desde: '2026-09-01',
};

describe('la lista de precios pide la facturación del Cliente', () => {
  it('con la acción de importar y sin la de facturación, no se importa ni se analiza', async () => {
    const confirmar = await pedir('POST', '/precios/confirmar', LISTA);
    assert.equal(confirmar.estado, 403);
    assert.equal(confirmar.cuerpo.error, 'La Prestadora no habilitó esta acción');

    const analizar = await pedir('POST', '/precios/analizar', {});
    assert.equal(analizar.estado, 403);

    assert.ok(!llamadas.some((l) => l.clave === 'POST /rest/v1/rpc/importar_lista_de_precios'));
    assert.ok(!llamadas.some((l) => l.clave === 'POST /rest/v1/importaciones_prestadora'));
  });

  it('con las dos acciones, la lista entra', async () => {
    habilitadas.add('ver_facturacion_cliente');
    const { estado, cuerpo } = await pedir('POST', '/precios/confirmar', LISTA);
    assert.equal(estado, 200, JSON.stringify(cuerpo));
    assert.equal(cuerpo.agregados, 1);
    assert.ok(llamadas.some((l) => l.clave === 'POST /rest/v1/rpc/importar_lista_de_precios'));
  });

  it('sin la de facturación, el lote de una lista de precios no se abre', async () => {
    respuestas.set('GET /rest/v1/importaciones_prestadora', () => [unLote('lista_precios')]);
    const { estado, cuerpo } = await pedir('GET', `/revision/${LOTE}`);
    assert.equal(estado, 403);
    assert.equal(cuerpo.error, 'sin_permiso');
    assert.equal(cuerpo.lote, undefined);
  });

  it('con la de facturación, el lote de una lista de precios se abre', async () => {
    habilitadas.add('ver_facturacion_cliente');
    respuestas.set('GET /rest/v1/importaciones_prestadora', () => [unLote('lista_precios')]);
    respuestas.set('GET /rest/v1/clientes', () => []);
    const { estado, cuerpo } = await pedir('GET', `/revision/${LOTE}`);
    assert.equal(estado, 200, JSON.stringify(cuerpo));
    assert.equal(cuerpo.lote.id, LOTE);
  });

  it('el lote de una importación de Asistentes no pide la de facturación', async () => {
    respuestas.set('GET /rest/v1/importaciones_prestadora', () => [unLote('asistente')]);
    const { estado, cuerpo } = await pedir('GET', `/revision/${LOTE}`);
    assert.equal(estado, 200, JSON.stringify(cuerpo));
    assert.equal(cuerpo.lote.tipo, 'asistente');
  });
});
