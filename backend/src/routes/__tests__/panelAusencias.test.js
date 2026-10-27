/**
 * El certificado médico de una ausencia: subirlo y volver a verlo.
 *
 *   node --test backend/src/routes/__tests__/panelAusencias.test.js
 *
 * POR QUÉ EXISTE ESTA PRUEBA. La ruta (`../panelAusencias.js`) entra a la base y al depósito con
 * la credencial de quien pide, y es la base la que decide qué ausencias alcanza: el Administrador,
 * las de su Prestadora; quien coordina, las de su zona (`coordinador_gestiona_ausencias_de_su_zona`).
 * Lo que hay que sostener acá es que ninguna consulta vuelva a la llave maestra.
 *
 * La base es de mentira y contesta por HTTP como la de verdad. Con la credencial de quien pide imita
 * la política: las ausencias de su Prestadora, y a quien coordina sólo si el Asistente es de su
 * zona. Con la llave maestra contesta todas, sin mirar a nadie. Con el sistema roto —una consulta de
 * vuelta con la llave maestra— la ausencia ajena y la de otra zona aparecen y la prueba falla.
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
const AUSENCIA = '33333333-3333-3333-3333-333333333333';
const ASISTENTE = '44444444-4444-4444-4444-444444444444';

/** La llave maestra, tal como la manda la conexión del backend. */
const LLAVE_MAESTRA = 'Bearer clave-de-mentira';

const respuestas = new Map();
let llamadas = [];
let rolDelUsuario = 'admin_prestadora';
let asistenteEnLaZona = true;

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    llamadas.push({ clave, url: req.url, credencial: req.headers.authorization });

    if (ruta.startsWith('/storage/v1/')) {
      const cuerpo = ruta.includes('/object/sign/')
        ? { signedURL: `${ruta.replace('/storage/v1', '')}?token=enlace-de-mentira` }
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
const { panelAusenciasRouter } = await import('../panelAusencias.js');

const app = express();
app.use(express.json());
app.use('/api/panel/ausencias', panelAusenciasRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/panel/ausencias`;

after(() => {
  backend.close();
  baseFalsa.close();
});

async function subir(ausenciaId) {
  const cuerpo = new FormData();
  cuerpo.append('archivo', new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: 'application/pdf' }), 'certificado.pdf');
  const respuesta = await fetch(`${DIRECCION}/${ausenciaId}/certificado`, {
    method: 'POST',
    headers: { Authorization: sesionDePrueba(USUARIO) },
    body: cuerpo,
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

async function pedirDireccion(ausenciaId) {
  const respuesta = await fetch(`${DIRECCION}/${ausenciaId}/certificado-url`, {
    headers: { Authorization: sesionDePrueba(USUARIO) },
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

function unaAusencia(cambios = {}) {
  return {
    id: AUSENCIA,
    prestadora_id: PRESTADORA,
    asistente_id: ASISTENTE,
    certificado_url: `${PRESTADORA}/${AUSENCIA}/certificado.pdf`,
    ...cambios,
  };
}

/** Las ausencias que hay en la base, para leerlas o escribirlas. */
function ausenciasEnLaBase(...filas) {
  const contestar = (credencial) => {
    if (credencial === LLAVE_MAESTRA) return filas;
    if (rolDelUsuario === 'coordinador' && !asistenteEnLaZona) return [];
    return filas.filter((fila) => fila.prestadora_id === PRESTADORA);
  };
  respuestas.set('GET /rest/v1/ausencias', contestar);
  respuestas.set('PATCH /rest/v1/ausencias', (credencial) =>
    contestar(credencial).map((fila) => ({ id: fila.id })));
}

beforeEach(() => {
  llamadas = [];
  rolDelUsuario = 'admin_prestadora';
  asistenteEnLaZona = true;
  respuestas.clear();
  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol: rolDelUsuario, prestadora_id: PRESTADORA }]);
  respuestas.set('POST /rest/v1/rpc/tiene_permiso_la_sesion', () => true);
  respuestas.set('POST /rest/v1/registro_actividad', () => []);
});

/** Nada de lo que hizo la ruta fue con la llave maestra. */
function conLaCredencialDeQuienPide() {
  for (const llamada of llamadas) {
    assert.notEqual(llamada.credencial, LLAVE_MAESTRA, `${llamada.clave} fue con la llave maestra`);
  }
}

describe('subir el certificado de una ausencia', () => {
  it('quien coordina sube el certificado de una ausencia de su zona', async () => {
    rolDelUsuario = 'coordinador';
    ausenciasEnLaBase(unaAusencia());

    const { estado, cuerpo } = await subir(AUSENCIA);

    assert.equal(estado, 200);
    assert.equal(cuerpo.ok, true);
    const subida = llamadas.find((l) => l.clave.startsWith('POST /storage/v1/object/'));
    assert.equal(subida.clave, `POST /storage/v1/object/certificados-medicos/${PRESTADORA}/${AUSENCIA}/certificado.pdf`);
    conLaCredencialDeQuienPide();
  });

  it('la ausencia de otra zona no existe para quien coordina, y nada se sube', async () => {
    rolDelUsuario = 'coordinador';
    asistenteEnLaZona = false;
    ausenciasEnLaBase(unaAusencia());

    const { estado } = await subir(AUSENCIA);

    assert.equal(estado, 404);
    assert.equal(llamadas.some((l) => l.clave.startsWith('POST /storage/v1/')), false);
  });

  it('la ausencia de otra Prestadora no existe para ésta, y nada se sube a su nombre', async () => {
    ausenciasEnLaBase(unaAusencia({ prestadora_id: OTRA_PRESTADORA }));

    const { estado } = await subir(AUSENCIA);

    assert.equal(estado, 404);
    assert.equal(llamadas.some((l) => l.clave.startsWith('POST /storage/v1/')), false);
  });
});

describe('el enlace temporal del certificado', () => {
  it('quien coordina ve el certificado de una ausencia de su zona', async () => {
    rolDelUsuario = 'coordinador';
    ausenciasEnLaBase(unaAusencia());

    const { estado, cuerpo } = await pedirDireccion(AUSENCIA);

    assert.equal(estado, 200);
    assert.ok(cuerpo.url.includes(`/object/sign/certificados-medicos/${PRESTADORA}/${AUSENCIA}/certificado.pdf`));
    conLaCredencialDeQuienPide();
  });

  it('la ausencia de otra zona no recibe enlace', async () => {
    rolDelUsuario = 'coordinador';
    asistenteEnLaZona = false;
    ausenciasEnLaBase(unaAusencia());

    const { estado } = await pedirDireccion(AUSENCIA);

    assert.equal(estado, 404);
    assert.equal(llamadas.some((l) => l.clave.startsWith('POST /storage/v1/')), false);
  });

  it('la ausencia de otra Prestadora no recibe enlace', async () => {
    ausenciasEnLaBase(unaAusencia({ prestadora_id: OTRA_PRESTADORA }));

    const { estado } = await pedirDireccion(AUSENCIA);

    assert.equal(estado, 404);
    assert.equal(llamadas.some((l) => l.clave.startsWith('POST /storage/v1/')), false);
  });
});
