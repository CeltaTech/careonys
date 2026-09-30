/**
 * La autorización firmada para el monitoreo de signos vitales: subirla y volver a verla.
 *
 *   node --test backend/src/routes/__tests__/panelVitalesAutorizacion.test.js
 *
 * POR QUÉ EXISTE ESTA PRUEBA. La ruta (`../panelVitalesAutorizacion.js`) entra a la base y al
 * depósito con la llave maestra, todavía, porque la base es más estrecha que lo que la ruta hace:
 * el depósito sólo deja subir a la administración
 * (`autorizaciones_monitoreo_las_gestiona_quien_administra`), y quien coordina hoy sube la
 * autorización; y `pacientes` le esconde a todos el Paciente importado que espera conformidad
 * (`oculta_pendientes_de_conformidad`). Entonces lo que separa una Prestadora de otra es el filtro
 * escrito en la consulta del Paciente y la comparación de la ruta del archivo, y eso es lo que se
 * sostiene acá.
 *
 * La base es de mentira y contesta por HTTP como la de verdad. Con la llave maestra contesta los
 * Pacientes que pide el filtro de la Prestadora de la dirección, y todos si no hay filtro; con la
 * credencial de quien pide imita las dos políticas: nada para quien coordina y nada pendiente de
 * conformidad. Con el sistema roto —la consulta sin filtro, o de vuelta con la credencial de quien
 * pide— la prueba de otra Prestadora, la de quien coordina o la del Paciente pendiente dan al revés.
 *
 * Datos inventados, como manda CLAUDE.md §6.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const OTRA_PRESTADORA = '99999999-9999-9999-9999-999999999999';
const USUARIO = '22222222-2222-2222-2222-222222222222';
const PACIENTE = '33333333-3333-3333-3333-333333333333';

/** La llave maestra, tal como la manda la conexión del backend. */
const LLAVE_MAESTRA = 'Bearer clave-de-mentira';

const respuestas = new Map();
let llamadas = [];
let rolDelUsuario = 'admin_prestadora';

const baseFalsa = createServer((req, res) => {
  req.on('data', () => {});
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    llamadas.push({ clave, url: req.url, credencial: req.headers.authorization });

    if (ruta.startsWith('/storage/v1/')) {
      // La política del depósito: con la credencial de quien pide, quien coordina no pasa.
      if (req.headers.authorization !== LLAVE_MAESTRA && rolDelUsuario === 'coordinador') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ statusCode: '403', error: 'Unauthorized', message: 'la política no lo deja' }));
        return;
      }
      const cuerpo = ruta.includes('/object/sign/')
        ? { signedURL: `${ruta.replace('/storage/v1', '')}?token=firma-de-mentira` }
        : { Key: ruta };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(cuerpo));
      return;
    }

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function'
      ? preparada(req.headers.authorization, req.url)
      : preparada;
    if (valor === undefined) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `la prueba no preparó respuesta para ${clave}` }));
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

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-mentira';

const { default: express } = await import('express');
await import('express-async-errors');
const { panelVitalesAutorizacionRouter } = await import('../panelVitalesAutorizacion.js');

const app = express();
app.use(express.json());
app.use('/api/panel/vitales-autorizacion', panelVitalesAutorizacionRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/panel/vitales-autorizacion`;

after(() => {
  backend.close();
  baseFalsa.close();
});

async function subir(pacienteId) {
  const cuerpo = new FormData();
  cuerpo.append('archivo', new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: 'application/pdf' }), 'autorizacion.pdf');
  const respuesta = await fetch(`${DIRECCION}/${pacienteId}/archivo`, {
    method: 'POST',
    headers: { Authorization: sesionDePrueba(USUARIO) },
    body: cuerpo,
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

async function pedirDireccion(pacienteId, ruta) {
  const respuesta = await fetch(`${DIRECCION}/${pacienteId}/archivo-url?ruta=${encodeURIComponent(ruta)}`, {
    headers: { Authorization: sesionDePrueba(USUARIO) },
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

function unPaciente(cambios = {}) {
  return { id: PACIENTE, prestadora_id: PRESTADORA, pendiente_conformidad: false, ...cambios };
}

/** Los Pacientes que hay en la base. */
function pacientesEnLaBase(...filas) {
  respuestas.set('GET /rest/v1/pacientes', (credencial, url) => {
    if (credencial !== LLAVE_MAESTRA) {
      // `oculta_pendientes_de_conformidad`, restrictiva, para todos los roles.
      return filas.filter((fila) => fila.prestadora_id === PRESTADORA && !fila.pendiente_conformidad);
    }
    const filtro = url.match(/prestadora_id=eq\.([^&]+)/);
    return filtro ? filas.filter((fila) => fila.prestadora_id === decodeURIComponent(filtro[1])) : filas;
  });
}

function consultasDePacientes() {
  return llamadas.filter((l) => l.clave === 'GET /rest/v1/pacientes');
}

beforeEach(() => {
  llamadas = [];
  rolDelUsuario = 'admin_prestadora';
  respuestas.clear();
  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol: rolDelUsuario, prestadora_id: PRESTADORA }]);
  respuestas.set('POST /rest/v1/registro_actividad', () => []);
});

describe('subir la autorización de monitoreo', () => {
  it('quien coordina sube la autorización, como antes', async () => {
    rolDelUsuario = 'coordinador';
    pacientesEnLaBase(unPaciente());

    const { estado, cuerpo } = await subir(PACIENTE);

    assert.equal(estado, 200);
    assert.ok(cuerpo.archivoUrl.startsWith(`${PRESTADORA}/${PACIENTE}/autorizacion-`));
    const subida = llamadas.find((l) => l.clave.startsWith('POST /storage/v1/object/'));
    assert.ok(subida.clave.startsWith(`POST /storage/v1/object/autorizaciones-monitoreo/${PRESTADORA}/${PACIENTE}/`));
    assert.equal(subida.credencial, LLAVE_MAESTRA);
  });

  it('el Paciente importado que espera conformidad se encuentra igual', async () => {
    pacientesEnLaBase(unPaciente({ pendiente_conformidad: true }));

    const { estado } = await subir(PACIENTE);

    assert.equal(estado, 200);
  });

  it('el Paciente se busca con la llave maestra, atado a la Prestadora de quien pide', async () => {
    pacientesEnLaBase(unPaciente());

    await subir(PACIENTE);

    const consultas = consultasDePacientes();
    assert.equal(consultas.length, 1);
    assert.equal(consultas[0].credencial, LLAVE_MAESTRA);
    assert.ok(consultas[0].url.includes(`prestadora_id=eq.${PRESTADORA}`), consultas[0].url);
  });

  it('el Paciente de otra Prestadora no existe para ésta, y nada se sube a su nombre', async () => {
    pacientesEnLaBase(unPaciente({ prestadora_id: OTRA_PRESTADORA }));

    const { estado } = await subir(PACIENTE);

    assert.equal(estado, 404);
    assert.equal(llamadas.some((l) => l.clave.startsWith('POST /storage/v1/')), false);
  });
});

describe('el enlace temporal de la autorización', () => {
  it('quien coordina ve la autorización de su Prestadora', async () => {
    rolDelUsuario = 'coordinador';
    pacientesEnLaBase(unPaciente());

    const { estado, cuerpo } = await pedirDireccion(PACIENTE, `${PRESTADORA}/${PACIENTE}/autorizacion-1.pdf`);

    assert.equal(estado, 200);
    assert.ok(cuerpo.url.includes(`/object/sign/autorizaciones-monitoreo/${PRESTADORA}/${PACIENTE}/`));
    const firma = llamadas.find((l) => l.clave.startsWith('POST /storage/v1/object/sign/'));
    assert.equal(firma.credencial, LLAVE_MAESTRA);
  });

  it('una ruta que no es la del Paciente se rechaza sin firmar nada', async () => {
    pacientesEnLaBase(unPaciente());

    const { estado } = await pedirDireccion(PACIENTE, `${OTRA_PRESTADORA}/${PACIENTE}/autorizacion-1.pdf`);

    assert.equal(estado, 400);
    assert.equal(llamadas.some((l) => l.clave.startsWith('POST /storage/v1/')), false);
  });
});
