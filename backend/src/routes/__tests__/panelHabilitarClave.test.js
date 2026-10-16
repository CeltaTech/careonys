/**
 * La búsqueda de a quién habilitarle un cambio de clave, sólo adentro de la Prestadora de quien pide.
 *
 *   npm test --prefix backend
 *   node --test backend/src/routes/__tests__/panelHabilitarClave.test.js
 *
 * POR QUÉ EXISTE ESTA PRUEBA. La búsqueda (`../panelHabilitarClave.js`, `/buscar`) lee cuentas de
 * otras personas, y la base le deja leer a cada una sólo la suya: por eso va con la credencial del
 * trabajo de la Prestadora activa, que la base acota a las cuentas y los Legajos de esa Prestadora.
 * Lo que hay que sostener acá es que la búsqueda y la foto vayan con esa credencial y con ninguna
 * otra, que la lista salga sin quien pide y sin quien no puede habilitar, y que no devuelva ningún
 * número de teléfono.
 *
 * La base es de mentira y contesta por HTTP como la de verdad: con la credencial del trabajo
 * contesta las cuentas y los Legajos de la Prestadora que lleva adentro, y con la de quien pide,
 * sólo su propia cuenta. El portero de permisos todavía entra con la llave maestra
 * (`utils/permisos.js` sigue en la lista de pendientes), así que se le da una de mentira: con ella
 * la base sólo contesta esa pregunta.
 *
 * Con el sistema roto —la búsqueda con otra credencial, con la de otra Prestadora, o sin los dos
 * filtros— las pruebas de la credencial y de la lista dan al revés.
 *
 * Datos inventados, como manda CLAUDE.md §6.
 */
import { strict as assert } from 'node:assert';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const OTRA_PRESTADORA = '99999999-9999-9999-9999-999999999999';
const USUARIO = '22222222-2222-2222-2222-222222222222';
const ASISTENTE = '33333333-3333-3333-3333-333333333333';
const CLIENTE = '44444444-4444-4444-4444-444444444444';
const ADMINISTRACION = '55555555-5555-5555-5555-555555555555';
const DE_LA_OTRA = '66666666-6666-6666-6666-666666666666';

/** Las cuentas que hay en la base, de las dos Prestadoras. */
const CUENTAS = [
  { id: USUARIO, nombre: 'Rosa Prueba', email: 'rosa@ejemplo.test', rol: 'coordinador', telefono: '+5400000001', telefono_verificado_en: '2026-09-01T10:00:00Z', prestadora_id: PRESTADORA },
  { id: ASISTENTE, nombre: 'Rosario Inventada', email: 'rosario@ejemplo.test', rol: 'asistente', telefono: '+5400000002', telefono_verificado_en: '2026-09-02T10:00:00Z', prestadora_id: PRESTADORA },
  { id: CLIENTE, nombre: 'Rosana Ficticia', email: 'rosana@ejemplo.test', rol: 'cliente', telefono: null, telefono_verificado_en: null, prestadora_id: PRESTADORA },
  { id: ADMINISTRACION, nombre: 'Rosalía Supuesta', email: 'rosalia@ejemplo.test', rol: 'admin_prestadora', telefono: '+5400000003', telefono_verificado_en: null, prestadora_id: PRESTADORA },
  { id: DE_LA_OTRA, nombre: 'Rosita Ajena', email: 'rosita@ejemplo.test', rol: 'asistente', telefono: '+5400000004', telefono_verificado_en: null, prestadora_id: OTRA_PRESTADORA },
];

/** Los Legajos que hay en la base. Sólo el Asistente tiene foto. */
const LEGAJOS = [
  { usuario_id: ASISTENTE, foto_url: 'fotos/rosario.jpg', prestadora_id: PRESTADORA },
  { usuario_id: DE_LA_OTRA, foto_url: 'fotos/rosita.jpg', prestadora_id: OTRA_PRESTADORA },
];

/** Todo lo que el backend le pidió a la base, con la dirección entera: los filtros van ahí. */
let llamadas = [];
let rolDelUsuario = 'coordinador';

/** Lo que dice adentro una credencial, o `null` si no se puede leer. */
function leerCredencial(autorizacion) {
  try {
    return JSON.parse(Buffer.from(autorizacion.replace('Bearer ', '').split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

function contestar(req, url) {
  const ruta = url.pathname;
  const credencial = leerCredencial(req.headers.authorization ?? '');
  const delTrabajo = credencial?.role === 'trabajo_sin_persona';

  if (ruta === '/auth/v1/user') return { id: USUARIO, aud: 'authenticated' };
  if (ruta === '/rest/v1/rpc/tiene_permiso_de') return true;

  if (ruta === '/rest/v1/usuarios') {
    // Con la credencial de quien pide, la base le contesta sólo su propia cuenta: es lo que lee el
    // portero del Panel.
    if (!delTrabajo) return [{ rol: rolDelUsuario, prestadora_id: PRESTADORA }];
    return CUENTAS.filter((cuenta) => cuenta.prestadora_id === credencial.prestadora_id);
  }

  if (ruta === '/rest/v1/asistentes') {
    if (!delTrabajo) return [];
    const usuarioId = url.searchParams.get('usuario_id')?.replace('eq.', '');
    return LEGAJOS.filter((legajo) => legajo.prestadora_id === credencial.prestadora_id && legajo.usuario_id === usuarioId);
  }

  return undefined;
}

const baseFalsa = createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    const url = new URL(req.url, 'http://interno');
    llamadas.push({ clave: `${req.method} ${url.pathname}`, url, credencial: req.headers.authorization });

    const valor = contestar(req, url);
    if (valor === undefined) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `la prueba no preparó respuesta para ${req.method} ${url.pathname}` }));
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

// El import va después de dejar puestas las variables de entorno: la conexión a la base se arma
// en el momento en que se importa, y con la dirección que haya en ese instante.
const { default: express } = await import('express');
await import('express-async-errors');
const { panelHabilitarClaveRouter } = await import('../panelHabilitarClave.js');

const app = express();
app.use(express.json());
app.use('/api/panel/habilitar-clave', panelHabilitarClaveRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/panel/habilitar-clave`;

after(() => {
  backend.close();
  baseFalsa.close();
});

async function buscar(texto) {
  const respuesta = await fetch(`${DIRECCION}/buscar`, {
    method: 'POST',
    headers: { Authorization: sesionDePrueba(USUARIO), 'Content-Type': 'application/json' },
    body: JSON.stringify({ texto }),
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

/** Lo que la búsqueda le pidió a la base: las cuentas con el texto buscado y las fotos. */
function consultasDeLaBusqueda() {
  return llamadas.filter((l) =>
    (l.clave === 'GET /rest/v1/usuarios' && l.url.searchParams.has('or')) || l.clave === 'GET /rest/v1/asistentes');
}

beforeEach(() => {
  llamadas = [];
  rolDelUsuario = 'coordinador';
});

// Cada consulta de la búsqueda fue con la credencial del trabajo de la Prestadora de quien pide, y
// con ninguna otra.
afterEach(() => {
  for (const llamada of consultasDeLaBusqueda()) {
    const credencial = leerCredencial(llamada.credencial ?? '');
    assert.equal(credencial?.role, 'trabajo_sin_persona', `${llamada.clave} fue con otra credencial`);
    assert.equal(credencial.prestadora_id, PRESTADORA, `${llamada.clave} fue fuera de la Prestadora`);
  }
});

describe('buscar a quién habilitarle un cambio de clave', () => {
  it('va a la base con la credencial del trabajo y filtra por la Prestadora', async () => {
    const { estado } = await buscar('Ros');

    assert.equal(estado, 200);
    const cuentas = consultasDeLaBusqueda().filter((l) => l.clave === 'GET /rest/v1/usuarios');
    assert.equal(cuentas.length, 1);
    assert.equal(cuentas[0].url.searchParams.get('prestadora_id'), `eq.${PRESTADORA}`);
    for (const foto of consultasDeLaBusqueda().filter((l) => l.clave === 'GET /rest/v1/asistentes')) {
      assert.equal(foto.url.searchParams.get('prestadora_id'), `eq.${PRESTADORA}`);
    }
  });

  it('quien coordina ve a los Asistentes y a los Clientes de su Prestadora, y a nadie más', async () => {
    const { cuerpo } = await buscar('Ros');

    assert.deepEqual(cuerpo.cuentas.map((c) => c.id).sort(), [ASISTENTE, CLIENTE].sort());
    assert.equal(typeof cuerpo.minutos, 'number');
  });

  it('la administración ve también a quien coordina, pero nunca a sí misma', async () => {
    rolDelUsuario = 'admin_prestadora';
    const { cuerpo } = await buscar('Ros');

    // Quien pide es USUARIO, que en la base figura como coordinador: con el rol de administración
    // de la sesión lo alcanzaría, y no aparece porque es él.
    assert.deepEqual(cuerpo.cuentas.map((c) => c.id).sort(), [ASISTENTE, CLIENTE].sort());
    assert.equal(cuerpo.cuentas.some((c) => c.id === ADMINISTRACION), false);
  });

  it('dice si hay teléfono y si está verificado, sin devolver el número', async () => {
    const { cuerpo } = await buscar('Ros');

    const asistente = cuerpo.cuentas.find((c) => c.id === ASISTENTE);
    const cliente = cuerpo.cuentas.find((c) => c.id === CLIENTE);
    assert.equal(asistente.telefonoCargado, true);
    assert.equal(asistente.telefonoVerificado, true);
    assert.equal(cliente.telefonoCargado, false);
    assert.equal(cliente.telefonoVerificado, false);
    assert.equal(JSON.stringify(cuerpo).includes('+54'), false);
    assert.equal('telefono' in asistente, false);
  });

  it('trae la foto del Legajo del Asistente, y nada a quien no tiene Legajo', async () => {
    const { cuerpo } = await buscar('Ros');

    assert.equal(cuerpo.cuentas.find((c) => c.id === ASISTENTE).foto, 'fotos/rosario.jpg');
    assert.equal(cuerpo.cuentas.find((c) => c.id === CLIENTE).foto, null);
  });

  it('con menos de tres letras no busca', async () => {
    const { estado, cuerpo } = await buscar('Ro');

    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'faltan_datos');
    assert.equal(consultasDeLaBusqueda().length, 0);
  });
});
