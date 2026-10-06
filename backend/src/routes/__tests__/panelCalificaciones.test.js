/**
 * Calificaciones en el Panel: valen para las dos modalidades.
 *
 *   npm test --prefix backend
 *
 * El Cliente califica al Asistente que lo atendió, sea de prestación directa o de Match. Hasta que
 * las calificaciones salieron del router de Match, una Prestadora que trabaja sólo en
 * prestación directa no podía verlas. Se prueba el camino entero contra una base de mentira, y que
 * el backend no le pregunte a la base por la modalidad: si lo hiciera, el candado habría vuelto.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const USUARIO = '22222222-2222-2222-2222-222222222222';
const CALIFICACION = '33333333-3333-3333-3333-333333333333';
const ASISTENTE = '77777777-7777-7777-7777-777777777777';

/** Qué contesta la base a cada `MÉTODO /ruta`. Cada prueba prepara lo suyo. */
const respuestas = new Map();
/** Todo lo que el backend le pidió a la base. */
let llamadas = [];

let rolDelUsuario = 'coordinador';
let prestadoraDelUsuario = PRESTADORA;

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const direccion = new URL(req.url, 'http://interno');
    const clave = `${req.method} ${direccion.pathname}`;
    llamadas.push({
      clave,
      busqueda: decodeURIComponent(direccion.search),
      cuerpo: crudo ? JSON.parse(crudo) : null,
      credencial: req.headers.authorization,
    });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada() : preparada;
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
process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-mentira';

// El import va después de dejar puestas las variables de entorno: la conexión a la base se arma
// en el momento en que se importa.
const { default: express } = await import('express');
await import('express-async-errors');
const { panelCalificacionesRouter } = await import('../panelCalificaciones.js');

const app = express();
app.use(express.json());
app.use('/api/panel/calificaciones', panelCalificacionesRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/panel/calificaciones`;

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

beforeEach(() => {
  llamadas = [];
  rolDelUsuario = 'coordinador';
  prestadoraDelUsuario = PRESTADORA;
  respuestas.clear();
  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol: rolDelUsuario, prestadora_id: prestadoraDelUsuario }]);
  respuestas.set('GET /rest/v1/configuracion_plataforma', () => [{ mfa_admin_obligatorio: false }]);
  respuestas.set('GET /rest/v1/permisos_de_acceso', () => []);
  respuestas.set('GET /rest/v1/prestadoras', () => [{ id: PRESTADORA }]);
});

function noPreguntoPorLaModalidad() {
  const preguntas = llamadas.filter((l) => l.clave.includes('modalidad'));
  assert.deepEqual(preguntas, [], 'el backend consultó la modalidad: el candado de Match volvió');
}

describe('las calificaciones no dependen de la modalidad', () => {
  it('el Coordinador las ve, con el nombre del Asistente', async () => {
    respuestas.set('GET /rest/v1/calificaciones_asistente', () => [
      { id: CALIFICACION, asistente_id: ASISTENTE, estrellas: 5, visible_publica: true },
    ]);
    respuestas.set('GET /rest/v1/asistentes', () => [{ id: ASISTENTE, nombre: 'Asistente inventada' }]);

    const { estado, cuerpo } = await pedir('GET', '/');
    assert.equal(estado, 200);
    assert.equal(cuerpo.calificaciones[0].asistente_nombre, 'Asistente inventada');

    const nombres = llamadas.find((l) => l.clave === 'GET /rest/v1/asistentes');
    assert.match(nombres.busqueda, new RegExp(`prestadora_id=eq\\.${PRESTADORA}`), 'los nombres se leyeron sin la Prestadora');
    noPreguntoPorLaModalidad();
  });

  it('cambia la visibilidad sólo adentro de su Prestadora', async () => {
    respuestas.set('PATCH /rest/v1/calificaciones_asistente', () => [{ id: CALIFICACION }]);
    const { estado } = await pedir('PATCH', `/${CALIFICACION}/visibilidad`, { visible_publica: false });
    assert.equal(estado, 200);

    const escritura = llamadas.find((l) => l.clave === 'PATCH /rest/v1/calificaciones_asistente');
    assert.match(escritura.busqueda, new RegExp(`prestadora_id=eq\\.${PRESTADORA}`), 'se escribió sin la Prestadora');
    assert.deepEqual(escritura.cuerpo, { visible_publica: false });
    noPreguntoPorLaModalidad();
  });

  it('una calificación de otra Prestadora se contesta como si no existiera', async () => {
    respuestas.set('PATCH /rest/v1/calificaciones_asistente', () => []);
    const { estado } = await pedir('PATCH', `/${CALIFICACION}/visibilidad`, { visible_publica: true });
    assert.equal(estado, 404);
  });

  it('sin un booleano no escribe nada', async () => {
    const { estado } = await pedir('PATCH', `/${CALIFICACION}/visibilidad`, { visible_publica: 'si' });
    assert.equal(estado, 400);
    assert.equal(llamadas.some((l) => l.clave === 'PATCH /rest/v1/calificaciones_asistente'), false);
  });

  it('sin Prestadora activa contesta que hay que entrar a una', async () => {
    prestadoraDelUsuario = null;
    const { estado, cuerpo } = await pedir('GET', '/');
    assert.equal(estado, 400);
    assert.match(cuerpo.error, /entrar a una prestadora/);
  });
});
