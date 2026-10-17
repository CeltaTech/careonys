/**
 * Activar una cuenta y recuperar su clave: con qué credencial se le pide cada cosa a la base.
 *
 *   node --test src/routes/__tests__/activarYRecuperarConElTrabajo.test.js
 *
 * Quien llega a estas puertas no tiene sesión. La Prestadora sale del nombre de usuario al pedir, y
 * del código que trae el enlace al activar y al canjear. Buscar el
 * enlace, poner la clave y emitir el enlace nuevo va con el trabajo de esa Prestadora, que alcanza
 * sus cuentas y ninguna otra; y es además la única credencial con la que la base acepta poner
 * una clave con un enlace.
 *
 * Se levantan los routers de verdad contra una base de mentira que contesta por HTTP como la de
 * verdad: además del resultado se mira con qué credencial se le pidió cada cosa. Con el sistema
 * roto —otra credencial u otra Prestadora— las pruebas dan al revés.
 *
 * Datos inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-1111-4111-8111-111111111111';
const CUENTA = '33333333-3333-4333-8333-333333333333';

let llamadas = [];

function leerCredencial(autorizacion) {
  try {
    return JSON.parse(Buffer.from(autorizacion.replace('Bearer ', '').split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const url = new URL(req.url, 'http://interno');
    const clave = `${req.method} ${url.pathname}`;
    const credencial = leerCredencial(req.headers.authorization ?? '');
    llamadas.push({ clave, url, cuerpo: crudo, credencial });
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    const delTrabajo = credencial?.role === 'trabajo_sin_persona' && credencial.prestadora_id === PRESTADORA;
    let filas = [];
    if (clave === 'POST /rest/v1/rpc/prestadora_de_la_direccion') filas = PRESTADORA;
    if (clave === 'GET /rest/v1/configuracion_prestadora') filas = [{ prestadora_id: PRESTADORA, dominio: 'inventada' }];
    if (clave === 'GET /rest/v1/tokens_activacion_cuenta' || clave === 'GET /rest/v1/tokens_recuperacion_clave') {
      // La base sólo le muestra el enlace al trabajo de su Prestadora.
      filas = delTrabajo
        ? [{ id: 'enlace', usuario_id: CUENTA, expira_en: new Date(Date.now() + 3600000).toISOString(), usado_en: null }]
        : [];
    }
    if (clave === 'POST /rest/v1/rpc/poner_clave_con_codigo') filas = delTrabajo ? CUENTA : null;
    if (clave === 'GET /rest/v1/usuarios' && delTrabajo) {
      filas = [{ id: CUENTA, nombre: 'Nombre inventado', rol: 'cliente', prestadora_id: PRESTADORA, email: 'inventado@ejemplo.test', telefono: null, telefono_verificado_en: null }];
    }
    if (req.method === 'HEAD') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Range': '*/0' });
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(Array.isArray(filas) && unoSolo ? (filas[0] ?? null) : filas));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
process.env.PWA_CLIENTES_URL = 'https://clientes.ejemplo.test';
prepararCredencialDePrueba();

const { default: express } = await import('express');
await import('express-async-errors');
const { activarCuentaRouter } = await import('../activarCuenta.js');
const { recuperarClaveRouter } = await import('../recuperarClave.js');

const app = express();
app.use(express.json());
app.use('/api/activar-cuenta', activarCuentaRouter);
app.use('/api/recuperar-clave', recuperarClaveRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const RAIZ = `http://127.0.0.1:${backend.address().port}/api`;

after(() => {
  backend.close();
  baseFalsa.close();
});

beforeEach(() => {
  llamadas = [];
});

async function pedir(ruta, cuerpo) {
  const respuesta = await fetch(`${RAIZ}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

function conElTrabajoDeLaPrestadora(clave) {
  const encontradas = llamadas.filter((l) => l.clave === clave);
  assert.ok(encontradas.length > 0, `no se pidió ${clave}`);
  for (const llamada of encontradas) {
    assert.equal(llamada.credencial?.role, 'trabajo_sin_persona', `${clave} fue con otra credencial`);
    assert.equal(llamada.credencial.prestadora_id, PRESTADORA, `${clave} fue fuera de la Prestadora`);
  }
}

const CLAVE = 'Una-clave-inventada-larga-2026';

describe('activar una cuenta', () => {
  it('el enlace se busca y la clave se pone con el trabajo de la Prestadora', async () => {
    const { estado, cuerpo } = await pedir('/activar-cuenta/inventada', { token: 'enlace-inventado', password: CLAVE });
    assert.equal(estado, 200, JSON.stringify(cuerpo));
    conElTrabajoDeLaPrestadora('GET /rest/v1/tokens_activacion_cuenta');
    conElTrabajoDeLaPrestadora('POST /rest/v1/rpc/poner_clave_con_codigo');
  });
});

describe('recuperar la clave', () => {
  it('el enlace nuevo se emite con el trabajo de la Prestadora que nombra el usuario', async () => {
    const { estado } = await pedir('/recuperar-clave/pedir-del-panel', { usuario: 'Inventado_Inventada' });
    assert.equal(estado, 200);
    const codigo = llamadas.find((l) => l.clave === 'POST /rest/v1/rpc/prestadora_de_la_direccion');
    assert.deepEqual(JSON.parse(codigo.cuerpo), { p_direccion: 'inventada' });
    const busqueda = llamadas.find((l) => l.clave === 'GET /rest/v1/usuarios');
    assert.equal(busqueda.url.searchParams.get('nombre_de_usuario'), 'eq.inventado');
    assert.equal(busqueda.url.searchParams.get('rol'), 'eq.coordinador');
    conElTrabajoDeLaPrestadora('GET /rest/v1/usuarios');
    conElTrabajoDeLaPrestadora('PATCH /rest/v1/tokens_recuperacion_clave');
    conElTrabajoDeLaPrestadora('POST /rest/v1/tokens_recuperacion_clave');
  });

  it('el segundo paso lee el enlace y la cuenta con el trabajo de la Prestadora', async () => {
    const { estado, cuerpo } = await pedir('/recuperar-clave/inventada/segundo-factor', { token: 'enlace-inventado' });
    assert.equal(estado, 200, JSON.stringify(cuerpo));
    assert.equal(cuerpo.requiereCodigo, false);
    conElTrabajoDeLaPrestadora('GET /rest/v1/tokens_recuperacion_clave');
    conElTrabajoDeLaPrestadora('GET /rest/v1/usuarios');
  });

  it('la clave nueva se pone con el trabajo de la Prestadora', async () => {
    const { estado, cuerpo } = await pedir('/recuperar-clave/inventada/canjear', { token: 'enlace-inventado', password: CLAVE });
    assert.equal(estado, 200, JSON.stringify(cuerpo));
    conElTrabajoDeLaPrestadora('GET /rest/v1/tokens_recuperacion_clave');
    conElTrabajoDeLaPrestadora('POST /rest/v1/rpc/poner_clave_con_codigo');
  });
});
