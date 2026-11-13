/**
 * La actualización de precios por índice, desde el Panel.
 *
 *   node --test src/routes/__tests__/panelActualizacion.test.js
 *
 * Se levanta el router de verdad contra una base de mentira y se mira qué contesta y qué le pide a
 * la base. Lo que tapa:
 *
 *  1. Que quien no administra actualice precios o cargue un índice.
 *  2. Que la vista previa escriba: tiene que llegar a la base con `p_aplicar` en falso.
 *  3. Que una fecha mal elegida llegue a la base.
 *  4. Que un valor cargado a mano para un mes que ya tiene uno propio cree otro en vez de corregirlo.
 *  5. Que el texto crudo de la base llegue a la pantalla.
 *
 * Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';

import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const USUARIO = '22222222-2222-2222-2222-222222222222';
const INDICE = '33333333-3333-3333-3333-333333333333';

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
    llamadas.push({ clave, filtros: direccion.searchParams, cuerpo: crudo ? JSON.parse(crudo) : null });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada(direccion.searchParams) : preparada;
    if (valor === undefined) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `la prueba no preparó respuesta para ${clave}` }));
      return;
    }
    if (valor?.errorDeLaBase) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(valor.errorDeLaBase));
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
const { panelActualizacionRouter } = await import('../panelActualizacion.js');

const app = express();
app.use(express.json());
app.use('/api/panel/actualizacion', panelActualizacionRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/panel/actualizacion`;

after(() => {
  backend.close();
  baseFalsa.close();
});

async function pedir(ruta, { method = 'GET', cuerpo } = {}) {
  const respuesta = await fetch(`${DIRECCION}${ruta}`, {
    method,
    headers: { Authorization: sesionDePrueba(USUARIO), 'Content-Type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

const llamadaA = (clave) => llamadas.find((l) => l.clave === clave);

let rolDelUsuario = 'admin_prestadora';

beforeEach(() => {
  llamadas = [];
  rolDelUsuario = 'admin_prestadora';
  respuestas.clear();
  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol: rolDelUsuario, prestadora_id: PRESTADORA }]);
  respuestas.set('GET /rest/v1/prestadoras', () => [{ id: PRESTADORA }]);
  respuestas.set('GET /rest/v1/indices_de_actualizacion', () => [
    { id: INDICE, codigo: 'ipc_indec_nacional', nombre: 'IPC', fuente: 'INDEC', periodicidad: 'mensual' },
  ]);
  respuestas.set('GET /rest/v1/valores_de_indice', () => []);
  respuestas.set('POST /rest/v1/valores_de_indice', () => [{ id: 'v-nuevo', periodo: '2026-11-01', valor: 13000, origen: 'manual' }]);
  respuestas.set('PATCH /rest/v1/valores_de_indice', () => [{ id: 'v-propio', periodo: '2026-11-01', valor: 13000, origen: 'manual' }]);
  respuestas.set('POST /rest/v1/rpc/actualizar_precios_por_indice', () => [
    {
      clase: 'lista', renglon_id: 7, renglon_nuevo_id: null, servicio_id: null, descripcion: 'Acompañamiento — Por hora',
      indice: 'ipc_indec_nacional', precio_actual: 4200, precio_nuevo: 4291.2, moneda: 'ARS',
    },
  ]);
});

const ACTUALIZACION = { desde: '2026-12-01', periodoBase: '2026-09', periodoNuevo: '2026-10' };

describe('la actualización', () => {
  it('la vista previa le pide a la base que no escriba', async () => {
    const { estado, cuerpo } = await pedir('/vista-previa', { method: 'POST', cuerpo: ACTUALIZACION });
    assert.equal(estado, 200);
    assert.equal(cuerpo.aplicada, false);
    assert.deepEqual(llamadaA('POST /rest/v1/rpc/actualizar_precios_por_indice').cuerpo, {
      p_desde: '2026-12-01', p_periodo_base: '2026-09-01', p_periodo_nuevo: '2026-10-01', p_aplicar: false,
    });
    assert.equal(cuerpo.renglones[0].precioNuevo, 4291.2);
    assert.equal(cuerpo.renglones[0].moneda, 'ARS');
  });

  it('aplicar le pide a la base que escriba', async () => {
    const { estado } = await pedir('/aplicar', { method: 'POST', cuerpo: ACTUALIZACION });
    assert.equal(estado, 200);
    assert.equal(llamadaA('POST /rest/v1/rpc/actualizar_precios_por_indice').cuerpo.p_aplicar, true);
  });

  it('una fecha que no es día 1 no llega a la base', async () => {
    const { estado, cuerpo } = await pedir('/aplicar', { method: 'POST', cuerpo: { ...ACTUALIZACION, desde: '2026-12-15' } });
    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'dato_invalido');
    assert.equal(llamadaA('POST /rest/v1/rpc/actualizar_precios_por_indice'), undefined);
  });

  it('quien no administra no actualiza', async () => {
    rolDelUsuario = 'coordinador';
    const { estado } = await pedir('/aplicar', { method: 'POST', cuerpo: ACTUALIZACION });
    assert.equal(estado, 403);
    assert.equal(llamadaA('POST /rest/v1/rpc/actualizar_precios_por_indice'), undefined);
  });

  it('el motivo de la base viaja; su texto crudo no', async () => {
    respuestas.set('POST /rest/v1/rpc/actualizar_precios_por_indice', () => ({ errorDeLaBase: { code: 'P0001', message: 'dato_invalido' } }));
    let r = await pedir('/aplicar', { method: 'POST', cuerpo: ACTUALIZACION });
    assert.equal(r.cuerpo.motivo, 'dato_invalido');

    respuestas.set('POST /rest/v1/rpc/actualizar_precios_por_indice', () => ({
      errorDeLaBase: { code: '42P01', message: 'relation "public.lista_precios" does not exist' },
    }));
    r = await pedir('/aplicar', { method: 'POST', cuerpo: ACTUALIZACION });
    assert.equal(r.estado, 500);
    assert.doesNotMatch(JSON.stringify(r.cuerpo), /lista_precios|relation/);
  });
});

describe('los valores del índice', () => {
  it('contesta cada índice con sus valores', async () => {
    respuestas.set('GET /rest/v1/valores_de_indice', () => [
      { id: 'v1', indice_id: INDICE, periodo: '2026-10-01', valor: '12785.9321', origen: 'automatico', prestadora_id: null, updated_at: null },
    ]);
    const { estado, cuerpo } = await pedir('/indices');
    assert.equal(estado, 200);
    assert.equal(cuerpo.indices[0].codigo, 'ipc_indec_nacional');
    assert.equal(cuerpo.indices[0].valores[0].valor, 12785.9321);
  });

  it('un mes sin valor propio se agrega, como manual y de esta Prestadora', async () => {
    const { estado } = await pedir('/indices/ipc_indec_nacional/valores', { method: 'POST', cuerpo: { periodo: '2026-11', valor: '13000' } });
    assert.equal(estado, 201);
    const escrito = llamadaA('POST /rest/v1/valores_de_indice').cuerpo;
    assert.deepEqual(escrito, { indice_id: INDICE, periodo: '2026-11-01', valor: 13000, origen: 'manual', prestadora_id: PRESTADORA });
    assert.equal(llamadaA('PATCH /rest/v1/valores_de_indice'), undefined);
  });

  it('un mes que ya tiene valor propio se corrige, no se duplica', async () => {
    respuestas.set('GET /rest/v1/valores_de_indice', () => [{ id: 'v-propio' }]);
    const { estado } = await pedir('/indices/ipc_indec_nacional/valores', { method: 'POST', cuerpo: { periodo: '2026-11', valor: '13000' } });
    assert.equal(estado, 200);
    assert.equal(llamadaA('POST /rest/v1/valores_de_indice'), undefined);
    const correccion = llamadaA('PATCH /rest/v1/valores_de_indice');
    assert.equal(correccion.filtros.get('id'), 'eq.v-propio');
    assert.equal(correccion.cuerpo.valor, 13000);
  });

  it('un valor que no es un número no se escribe', async () => {
    const { estado } = await pedir('/indices/ipc_indec_nacional/valores', { method: 'POST', cuerpo: { periodo: '2026-11', valor: 'mucho' } });
    assert.equal(estado, 400);
    assert.equal(llamadaA('POST /rest/v1/valores_de_indice'), undefined);
  });

  it('quien no administra no carga valores', async () => {
    rolDelUsuario = 'coordinador';
    const { estado } = await pedir('/indices/ipc_indec_nacional/valores', { method: 'POST', cuerpo: { periodo: '2026-11', valor: '13000' } });
    assert.equal(estado, 403);
    assert.equal(llamadaA('POST /rest/v1/valores_de_indice'), undefined);
  });

  it('sólo se borra un valor manual', async () => {
    respuestas.set('DELETE /rest/v1/valores_de_indice', () => []);
    const { estado } = await pedir('/indices/valores/v-publico', { method: 'DELETE' });
    assert.equal(estado, 404);
    assert.equal(llamadaA('DELETE /rest/v1/valores_de_indice').filtros.get('origen'), 'eq.manual');
  });
});
