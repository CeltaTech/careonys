/**
 * El Apoderado de un Cliente, visto desde el Panel y desde la aplicación del Cliente.
 *
 *   node --test backend/src/routes/__tests__/apoderado.test.js
 *
 * POR QUÉ EXISTE ESTA PRUEBA. Lo que se sostiene acá:
 *
 *   1. QUE EN LA APLICACIÓN LO MANEJE SÓLO EL TITULAR. La persona autorizada no lo ve ni lo toca.
 *   2. QUE CADA LADO SALGA CON SU CREDENCIAL: el Panel con la de quien pide; la aplicación con el
 *      trabajo de la Prestadora, diciéndole a la base en nombre de quién.
 *   3. QUE EL CLIENTE QUE LA BASE NO LE MUESTRA A QUIEN PIDE NO EXISTA: no se sube nada a su nombre.
 *   4. QUE EL PODER QUE LA BASE NO ACEPTÓ NO QUEDE SUELTO en el depósito.
 *   5. QUE EL APODERADO DE PAGOS REALINEE EL CONSENTIMIENTO, y el de signos vitales no toque ninguno.
 *
 * La base es de mentira. Lo que ella comprueba por dentro —que quien pide sea el titular o la
 * administración, que el archivo esté en la carpeta de su Cliente— no se ve desde acá.
 *
 * Datos inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-1111-4111-8111-111111111111';
const USUARIO = '22222222-2222-4222-8222-222222222222';
const CLIENTE = '33333333-3333-4333-8333-333333333333';
const CLIENTE_AJENO = '39393939-3939-4939-8939-393939393939';
const APODERADO = '44444444-4444-4444-8444-444444444444';
const DEPOSITO = 'poderes';
const FILA_APODERADO = {
  id: APODERADO,
  prestadora_id: PRESTADORA,
  cliente_id: CLIENTE,
  funcion: 'signos_vitales',
  estado: 'en_revision',
  motivo_observacion: null,
  archivo_url: `${PRESTADORA}/${CLIENTE}/signos_vitales/poder-1.pdf`,
  persona: { id: 'p', nombre_visible: 'Teresa Inventada' },
};

const respuestas = new Map();
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  const partes = [];
  req.on('data', (parte) => partes.push(parte));
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    const crudo = Buffer.concat(partes).toString();
    let cuerpo = null;
    if ((req.headers['content-type'] || '').includes('json') && crudo) {
      try { cuerpo = JSON.parse(crudo); } catch { cuerpo = null; }
    }
    llamadas.push({ clave, url: req.url, cuerpo, autorizacion: req.headers.authorization });

    const preparada = respuestas.get(clave) ?? respuestaDelDeposito(req.method, ruta);
    const valor = typeof preparada === 'function' ? preparada({ url: req.url, cuerpo }) : preparada;
    if (valor === undefined) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `la prueba no preparó respuesta para ${clave}` }));
      return;
    }
    if (valor && valor.__estado) {
      res.writeHead(valor.__estado, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(valor.__cuerpo));
      return;
    }
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    if (unoSolo && Array.isArray(valor) && valor.length === 0) {
      res.writeHead(406, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 'PGRST116', message: 'no hay filas' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? valor[0] ?? null : valor));
  });
});

function respuestaDelDeposito(metodo, ruta) {
  if (!ruta.startsWith('/storage/v1/')) return undefined;
  if (metodo === 'POST' && ruta.startsWith(`/storage/v1/object/sign/${DEPOSITO}/`)) {
    return { signedURL: `${ruta.replace('/storage/v1', '')}?token=enlace-de-mentira` };
  }
  if (metodo === 'POST' && ruta.startsWith(`/storage/v1/object/${DEPOSITO}/`)) {
    return { Key: ruta.replace('/storage/v1/object/', ''), Id: 'archivo-de-mentira' };
  }
  if (metodo === 'DELETE' && ruta === `/storage/v1/object/${DEPOSITO}`) return [];
  return undefined;
}

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

const { default: express } = await import('express');
await import('express-async-errors');
const { panelApoderadoRouter } = await import('../panelApoderado.js');
const { appClientesApoderadoRouter } = await import('../appClientesApoderado.js');

const app = express();
app.use(express.json());
app.use('/panel', panelApoderadoRouter);
app.use('/app', appClientesApoderadoRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}`;

after(() => {
  backend.close();
  baseFalsa.close();
});

const credencial = () => sesionDePrueba(USUARIO);
const llamadasA = (clave) => llamadas.filter((l) => l.clave === clave);
const rpc = (nombre) => llamadasA(`POST /rest/v1/rpc/${nombre}`);
const subidas = () => llamadas.filter((l) => l.clave.startsWith(`POST /storage/v1/object/${DEPOSITO}/`));
const borrados = () => llamadasA(`DELETE /storage/v1/object/${DEPOSITO}`);

function contenidoDe(autorizacion) {
  return JSON.parse(Buffer.from(String(autorizacion).replace(/^Bearer /, '').split('.')[1] ?? '', 'base64url').toString() || '{}');
}

async function pedir(metodo, ruta, cuerpo) {
  const opciones = { method: metodo, headers: { Authorization: credencial() } };
  if (cuerpo !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }
  const respuesta = await fetch(`${DIRECCION}${ruta}`, opciones);
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

async function conFormulario(ruta, datos = {}, { conArchivo = true } = {}) {
  const cuerpo = new FormData();
  for (const [campo, valor] of Object.entries(datos)) cuerpo.append(campo, valor);
  if (conArchivo) {
    cuerpo.append('archivo', new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: 'application/pdf' }), 'poder.pdf');
  }
  const respuesta = await fetch(`${DIRECCION}${ruta}`, {
    method: 'POST',
    headers: { Authorization: credencial() },
    body: cuerpo,
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

const DATOS = { nombre: ' Teresa ', apellido: 'Inventada', cuil: '27000000000' };

function sesionDelPanel() {
  respuestas.set('GET /auth/v1/user', { id: USUARIO, aud: 'authenticated' });
  respuestas.set('GET /rest/v1/usuarios', [{ rol: 'admin_prestadora', prestadora_id: PRESTADORA, desactivada_en: null }]);
  respuestas.set('POST /rest/v1/rpc/tiene_permiso_la_sesion', () => true);
  // Quien pide ve sólo a su Cliente, como con la política.
  respuestas.set('GET /rest/v1/clientes', ({ url }) => (
    url.includes(`id=eq.${CLIENTE}`) ? [{ id: CLIENTE, prestadora_id: PRESTADORA }] : []
  ));
  respuestas.set('POST /rest/v1/registro_actividad', () => []);
}

function sesionDelCliente({ titular = true } = {}) {
  respuestas.set('GET /auth/v1/user', { id: USUARIO, aud: 'authenticated' });
  respuestas.set('GET /rest/v1/usuarios', [{ rol: 'cliente', prestadora_id: PRESTADORA, desactivada_en: null }]);
  respuestas.set('GET /rest/v1/clientes', titular ? [{ id: CLIENTE }] : []);
  respuestas.set('GET /rest/v1/personas_autorizadas', titular ? [] : [{ cliente_id: CLIENTE }]);
  respuestas.set('GET /rest/v1/configuracion_visibilidad_app', []);
  respuestas.set('GET /rest/v1/permisos_personas_autorizadas', []);
}

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  respuestas.set('GET /rest/v1/apoderados', () => [FILA_APODERADO]);
  respuestas.set('GET /rest/v1/consentimientos_pagador', () => []);
  // El Apoderado es del Cliente; el consentimiento, de cada uno de sus Servicios.
  respuestas.set('GET /rest/v1/servicios', () => [{ id: '55555555-5555-4555-8555-555555555555' }]);
  respuestas.set('POST /rest/v1/rpc/nombrar_apoderado', () => APODERADO);
  respuestas.set('POST /rest/v1/rpc/reemplazar_poder_del_apoderado', () => APODERADO);
  respuestas.set('POST /rest/v1/rpc/quitar_apoderado', () => true);
  respuestas.set('POST /rest/v1/rpc/revisar_apoderado', () => true);
});

describe('desde el Panel', () => {
  beforeEach(sesionDelPanel);

  it('lee con la credencial de quien pide y atado a la Prestadora', async () => {
    const { estado, cuerpo } = await pedir('GET', `/panel/cliente/${CLIENTE}/signos_vitales`);

    assert.equal(estado, 200, JSON.stringify(cuerpo));
    assert.equal(cuerpo.apoderado.id, APODERADO);
    assert.equal(cuerpo.apoderado.nombre, 'Teresa Inventada');
    assert.equal(cuerpo.apoderado.estado, 'en_revision');
    assert.equal(cuerpo.apoderado.tienePoder, true);
    assert.equal(Object.hasOwn(cuerpo.apoderado, 'archivo_url'), false, 'la ruta del archivo no sale');
    const [lectura] = llamadasA('GET /rest/v1/apoderados');
    assert.equal(lectura.autorizacion, credencial());
    assert.ok(lectura.url.includes(`prestadora_id=eq.${PRESTADORA}`), lectura.url);
    assert.ok(lectura.url.includes(`cliente_id=eq.${CLIENTE}`), lectura.url);
  });

  it('una función que no existe es que no se encontró', async () => {
    const { estado, cuerpo } = await pedir('GET', `/panel/cliente/${CLIENTE}/otra_cosa`);

    assert.equal(estado, 404);
    assert.equal(cuerpo.motivo, 'no_encontrado');
    assert.equal(llamadasA('GET /rest/v1/apoderados').length, 0);
  });

  it('el Cliente que la base no muestra no existe: no se sube nada a su nombre', async () => {
    const { estado } = await conFormulario(`/panel/cliente/${CLIENTE_AJENO}/pagos`, DATOS);

    assert.equal(estado, 404);
    assert.equal(subidas().length, 0);
    assert.equal(rpc('nombrar_apoderado').length, 0);
  });

  it('nombrar sube el poder a la carpeta del Cliente y le pasa a la base los datos limpios', async () => {
    const { estado, cuerpo } = await conFormulario(`/panel/cliente/${CLIENTE}/signos_vitales`, DATOS);

    assert.equal(estado, 200, JSON.stringify(cuerpo));
    const [subida] = subidas();
    assert.ok(subida.url.includes(`/${PRESTADORA}/${CLIENTE}/signos_vitales/`), subida.url);
    assert.equal(subida.autorizacion, credencial());
    const [nombrar] = rpc('nombrar_apoderado');
    assert.equal(nombrar.cuerpo.p_nombre, 'Teresa');
    assert.equal(nombrar.cuerpo.p_usuario, null);
    assert.equal(llamadasA('POST /rest/v1/registro_actividad').length, 1);
  });

  it('sin el poder, o sin un dato, no se sube nada', async () => {
    const sinArchivo = await conFormulario(`/panel/cliente/${CLIENTE}/pagos`, DATOS, { conArchivo: false });
    const sinCuil = await conFormulario(`/panel/cliente/${CLIENTE}/pagos`, { nombre: 'Teresa', apellido: 'Inventada' });

    assert.equal(sinArchivo.estado, 400);
    assert.equal(sinCuil.estado, 400);
    assert.equal(subidas().length, 0);
    assert.equal(rpc('nombrar_apoderado').length, 0);
  });

  it('si la base no acepta, el poder subido se borra y el error se traduce', async () => {
    respuestas.set('POST /rest/v1/rpc/nombrar_apoderado', () => ({
      __estado: 400,
      __cuerpo: { message: 'sin_permiso' },
    }));

    const { estado, cuerpo } = await conFormulario(`/panel/cliente/${CLIENTE}/pagos`, DATOS);

    assert.equal(estado, 403);
    assert.equal(cuerpo.motivo, 'sin_permiso');
    assert.equal(subidas().length, 1);
    assert.equal(borrados().length, 1);
  });

  it('el de signos vitales no toca ningún consentimiento; el de pagos lo revisa', async () => {
    await pedir('POST', `/panel/cliente/${CLIENTE}/signos_vitales/quitar`);
    assert.equal(llamadasA('GET /rest/v1/consentimientos_pagador').length, 0);

    await pedir('POST', `/panel/cliente/${CLIENTE}/pagos/quitar`);
    assert.equal(llamadasA('GET /rest/v1/consentimientos_pagador').length, 1);
  });

  it('quitar a quien no está es que no se encontró', async () => {
    respuestas.set('POST /rest/v1/rpc/quitar_apoderado', () => false);

    const { estado } = await pedir('POST', `/panel/cliente/${CLIENTE}/pagos/quitar`);

    assert.equal(estado, 404);
    assert.equal(llamadasA('POST /rest/v1/registro_actividad').length, 0);
  });

  it('aprobar y observar pasan por la base, y lo ya resuelto se dice', async () => {
    const aprobado = await pedir('POST', `/panel/${APODERADO}/aprobar`);
    assert.equal(aprobado.estado, 200, JSON.stringify(aprobado.cuerpo));
    assert.deepEqual(
      { id: rpc('revisar_apoderado')[0].cuerpo.p_id, aprobar: rpc('revisar_apoderado')[0].cuerpo.p_aprobar },
      { id: APODERADO, aprobar: true },
    );

    const observado = await pedir('POST', `/panel/${APODERADO}/observar`, { motivo: 'No corresponde al Cliente' });
    assert.equal(observado.estado, 200);
    assert.equal(rpc('revisar_apoderado')[1].cuerpo.p_motivo, 'No corresponde al Cliente');

    respuestas.set('POST /rest/v1/rpc/revisar_apoderado', () => false);
    const otraVez = await pedir('POST', `/panel/${APODERADO}/aprobar`);
    assert.equal(otraVez.estado, 409);
    assert.equal(otraVez.cuerpo.motivo, 'ya_resuelta');
  });

  it('el que la base no le deja ver a quien pide no se revisa', async () => {
    respuestas.set('GET /rest/v1/apoderados', () => []);

    const { estado } = await pedir('POST', `/panel/${APODERADO}/aprobar`);

    assert.equal(estado, 404);
    assert.equal(rpc('revisar_apoderado').length, 0);
  });

  it('observar sin motivo lo rechaza la base y se traduce', async () => {
    respuestas.set('POST /rest/v1/rpc/revisar_apoderado', () => ({
      __estado: 400,
      __cuerpo: { message: 'falta_el_motivo' },
    }));

    const { estado, cuerpo } = await pedir('POST', `/panel/${APODERADO}/observar`, {});

    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'falta_el_motivo');
  });

  it('el enlace al poder dura lo que un enlace temporal y sale con la credencial de quien pide', async () => {
    const { estado, cuerpo } = await pedir('GET', `/panel/cliente/${CLIENTE}/signos_vitales/poder`);

    assert.equal(estado, 200, JSON.stringify(cuerpo));
    assert.ok(cuerpo.url.includes('token=enlace-de-mentira'), cuerpo.url);
    const firma = llamadas.find((l) => l.clave.startsWith(`POST /storage/v1/object/sign/${DEPOSITO}/`));
    assert.equal(firma.autorizacion, credencial());
  });
});

describe('desde la aplicación del Cliente', () => {
  it('la persona autorizada no lo ve ni lo toca', async () => {
    sesionDelCliente({ titular: false });

    const intentos = [
      await pedir('GET', '/app/pagos'),
      await conFormulario('/app/pagos', DATOS),
      await conFormulario('/app/pagos/poder'),
      await pedir('POST', '/app/pagos/quitar'),
      await pedir('GET', '/app/pagos/poder'),
    ];

    for (const intento of intentos) {
      assert.equal(intento.estado, 403);
      assert.equal(intento.cuerpo.motivo, 'sin_acceso');
    }
    assert.equal(llamadasA('GET /rest/v1/apoderados').length, 0);
    assert.equal(subidas().length, 0);
    assert.equal(llamadas.some((l) => l.clave.startsWith('POST /rest/v1/rpc/')), false);
  });

  it('el titular nombra con el trabajo de la Prestadora, y la base recibe en nombre de quién', async () => {
    sesionDelCliente();

    const { estado, cuerpo } = await conFormulario('/app/pagos', DATOS);

    assert.equal(estado, 200, JSON.stringify(cuerpo));
    const [nombrar] = rpc('nombrar_apoderado');
    assert.equal(nombrar.cuerpo.p_usuario, USUARIO);
    assert.equal(nombrar.cuerpo.p_cliente, CLIENTE);
    const trabajo = contenidoDe(nombrar.autorizacion);
    assert.equal(trabajo.role, 'trabajo_sin_persona');
    assert.equal(trabajo.prestadora_id, PRESTADORA);
    assert.equal(contenidoDe(subidas()[0].autorizacion).role, 'trabajo_sin_persona');
  });

  it('el titular ve el estado de su Cliente, y el Cliente no sale del pedido', async () => {
    sesionDelCliente();

    const { estado, cuerpo } = await pedir('GET', `/app/signos_vitales?cliente_id=${CLIENTE_AJENO}`);

    assert.equal(estado, 200, JSON.stringify(cuerpo));
    const [lectura] = llamadasA('GET /rest/v1/apoderados');
    assert.ok(lectura.url.includes(`cliente_id=eq.${CLIENTE}`), lectura.url);
    assert.equal(lectura.url.includes(CLIENTE_AJENO), false);
  });

  it('el titular quita en su nombre', async () => {
    sesionDelCliente();

    const { estado } = await pedir('POST', '/app/signos_vitales/quitar');

    assert.equal(estado, 200);
    assert.equal(rpc('quitar_apoderado')[0].cuerpo.p_usuario, USUARIO);
  });
});
