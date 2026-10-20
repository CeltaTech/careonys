/**
 * Mientras la Prestadora no completó su configuración inicial, no se carga gente.
 *
 *   node --test src/routes/__tests__/configuracionInicial.test.js
 *
 * Se levanta el backend de verdad —las rutas de cuentas y de importación— contra una base de mentira
 * que contesta lo que cada prueba le prepara. Lo que se prueba:
 *
 * - las tres rutas que crean gente (alta desde una postulación, alta a mano y la importación de
 *   Asistentes o de Clientes) contestan con el motivo `configuracion_inicial_incompleta` y no
 *   escriben nada cuando falta alguno de los tres pasos;
 * - con los tres pasos hechos, el candado deja pasar y la ruta sigue con lo suyo;
 * - el Panel recibe el mismo criterio por `GET /configuracion-inicial`, también un Coordinador;
 * - si la base no contesta, el candado no deja pasar.
 *
 * La base de mentira imita la protección por fila en lo que hace falta para que la prueba pueda
 * fallar: los datos de contacto y las zonas los contesta sólo a la credencial del trabajo de esta
 * Prestadora, y la lista de precios sólo a la credencial de quien pide. Si el criterio preguntara
 * con otra credencial, vería todo vacío y las pruebas de «completa» darían al revés.
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

/** Qué contesta la base a cada `MÉTODO /ruta`. */
const respuestas = new Map();
let llamadas = [];

let rolDelUsuario = 'admin_prestadora';
/** Lo que hay cargado en la Prestadora. */
let cargado = {};

function leerCredencial(autorizacion) {
  try {
    return JSON.parse(Buffer.from((autorizacion ?? '').replace('Bearer ', '').split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

const esDelTrabajo = (credencial) => {
  const leida = leerCredencial(credencial);
  return leida?.role === 'trabajo_sin_persona' && leida.prestadora_id === PRESTADORA;
};
const esDeLaPersona = (credencial) => credencial === sesionDePrueba(USUARIO);

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    llamadas.push({ clave, url: req.url, credencial: req.headers.authorization });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada(req.url, req.headers.authorization) : preparada;
    if (valor === undefined) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `la prueba no preparó respuesta para ${clave}` }));
      return;
    }
    if (valor && valor.__estado) {
      res.writeHead(valor.__estado, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'falla de mentira' }));
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
const { panelCuentasRouter } = await import('../panelCuentas.js');
const { panelImportacionRouter } = await import('../panelImportacion.js');
const { pasosDeLaConfiguracionInicial } = await import('../../utils/configuracionInicial.js');

const app = express();
app.use(express.json());
app.use('/api/panel/cuentas', panelCuentasRouter);
app.use('/api/panel/importacion', panelImportacionRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/panel`;

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

const TODO_CARGADO = {
  empresa: { telefono: '+54 11 5555-0000', email: 'contacto@prestadora-de-prueba.test' },
  zonas: [{ id: 'z1' }],
  precios: [{ id: 'p1' }],
};

beforeEach(() => {
  llamadas = [];
  rolDelUsuario = 'admin_prestadora';
  cargado = structuredClone(TODO_CARGADO);
  respuestas.clear();
  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol: rolDelUsuario, prestadora_id: PRESTADORA, desactivada_en: null }]);
  respuestas.set('POST /rest/v1/rpc/tiene_permiso_la_sesion', () => true);
  respuestas.set('GET /rest/v1/configuracion_prestadora', (_url, credencial) =>
    (esDelTrabajo(credencial) && cargado.empresa ? [cargado.empresa] : []));
  respuestas.set('GET /rest/v1/zonas_cobertura', (_url, credencial) => (esDelTrabajo(credencial) ? cargado.zonas : []));
  respuestas.set('GET /rest/v1/lista_precios', (_url, credencial) => (esDeLaPersona(credencial) ? cargado.precios : []));
});

const escrituras = () => llamadas.filter((l) => l.clave.startsWith('POST /rest/v1/') && !l.clave.includes('/rpc/'));

/** Las tres rutas que crean gente, con un cuerpo vacío: si el candado deja pasar, la ruta lo rechaza
 *  por datos faltantes, que es como se sabe que llegó hasta ella sin crear nada. */
const RUTAS_DE_ALTA = [
  ['alta desde una postulación', '/cuentas/asistente', {}],
  ['alta a mano de un Asistente', '/cuentas/asistente-directo', {}],
  ['importación de Asistentes', '/importacion/confirmar', { tipo: 'asistente' }],
  ['importación de Clientes', '/importacion/confirmar', { tipo: 'cliente' }],
];

describe('el criterio de la configuración inicial', () => {
  it('son tres pasos, en este orden: datos, zonas y precios', () => {
    const pasos = pasosDeLaConfiguracionInicial({ empresa: null, hayZonas: false, hayPrecios: false });
    assert.deepEqual(pasos.map((p) => p.clave), ['datos', 'zonas', 'precios']);
    assert.ok(pasos.every((p) => p.hecho === false));
  });

  it('los datos piden teléfono y email, los dos', () => {
    const [soloTelefono] = pasosDeLaConfiguracionInicial({ empresa: { telefono: '1', email: '' } });
    const [losDos] = pasosDeLaConfiguracionInicial({ empresa: { telefono: '1', email: 'a@b.test' } });
    assert.equal(soloTelefono.hecho, false);
    assert.equal(losDos.hecho, true);
  });

  it('una respuesta que no es exactamente sí no cuenta como hecho', () => {
    const pasos = pasosDeLaConfiguracionInicial({ empresa: {}, hayZonas: undefined, hayPrecios: 1 });
    assert.ok(pasos.every((p) => p.hecho === false));
  });
});

describe('el Panel pregunta cuánto falta', () => {
  it('con todo cargado contesta completa, y lee cada tabla con su credencial', async () => {
    const { estado, cuerpo } = await pedir('GET', '/cuentas/configuracion-inicial');
    assert.equal(estado, 200);
    assert.equal(cuerpo.completa, true);
    assert.deepEqual(cuerpo.pasos.map((p) => p.clave), ['datos', 'zonas', 'precios']);
    const precios = llamadas.find((l) => l.clave === 'GET /rest/v1/lista_precios');
    assert.ok(precios.url.includes(`prestadora_id=eq.${PRESTADORA}`));
    assert.ok(precios.url.includes('activo=eq.true'));
    const zonas = llamadas.find((l) => l.clave === 'GET /rest/v1/zonas_cobertura');
    assert.ok(zonas.url.includes('activa=eq.true'));
  });

  it('sin zonas activas dice que falta ese paso, y sólo ése', async () => {
    cargado.zonas = [];
    const { cuerpo } = await pedir('GET', '/cuentas/configuracion-inicial');
    assert.equal(cuerpo.completa, false);
    assert.deepEqual(cuerpo.pasos.filter((p) => !p.hecho).map((p) => p.clave), ['zonas']);
  });

  it('un Coordinador recibe la misma respuesta que la Administración', async () => {
    rolDelUsuario = 'coordinador';
    cargado.precios = [];
    const { estado, cuerpo } = await pedir('GET', '/cuentas/configuracion-inicial');
    assert.equal(estado, 200);
    assert.deepEqual(cuerpo.pasos.filter((p) => !p.hecho).map((p) => p.clave), ['precios']);
  });
});

describe('sin la configuración inicial completa no se carga gente', () => {
  for (const [que, ruta, cuerpo] of RUTAS_DE_ALTA) {
    for (const falta of ['empresa', 'zonas', 'precios']) {
      it(`${que}: se rechaza si falta ${falta}`, async () => {
        cargado[falta] = falta === 'empresa' ? null : [];
        const respuesta = await pedir('POST', ruta, cuerpo);
        assert.equal(respuesta.estado, 409);
        assert.equal(respuesta.cuerpo.motivo, 'configuracion_inicial_incompleta');
        // Ningún detalle interno sale hacia afuera: sólo el código.
        assert.deepEqual(Object.keys(respuesta.cuerpo).sort(), ['error', 'motivo']);
        assert.equal(escrituras().length, 0);
      });
    }

    it(`${que}: con todo cargado el candado deja pasar`, async () => {
      const respuesta = await pedir('POST', ruta, cuerpo);
      assert.notEqual(respuesta.cuerpo.motivo, 'configuracion_inicial_incompleta');
      // La ruta siguió con lo suyo y rechazó el cuerpo vacío por datos faltantes.
      assert.equal(respuesta.estado, 400);
    });
  }

  it('también para un Coordinador con el alta habilitada: decide la Prestadora, no quién pide', async () => {
    rolDelUsuario = 'coordinador';
    cargado.empresa = null;
    const respuesta = await pedir('POST', '/cuentas/asistente-directo', {});
    assert.equal(respuesta.estado, 409);
    assert.equal(respuesta.cuerpo.motivo, 'configuracion_inicial_incompleta');
  });

  it('si la base no contesta no deja pasar, y no dice que falta configurar', async () => {
    respuestas.set('GET /rest/v1/lista_precios', { __estado: 500 });
    const respuesta = await pedir('POST', '/cuentas/asistente-directo', {});
    assert.equal(respuesta.estado, 500);
    assert.notEqual(respuesta.cuerpo.motivo, 'configuracion_inicial_incompleta');
    assert.equal(escrituras().length, 0);
  });
});
