/**
 * El pedido de soporte técnico, desde el Panel de una Prestadora.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. Es la única pantalla del Panel que habla con el soporte técnico, y
 * tiene cuatro cosas que no pueden fallar:
 *
 *  1. Que una solicitud o un hilo de otra Prestadora se alcancen con su identificador. Todas las
 *     consultas tienen que filtrar por la Prestadora de quien pide, también las que buscan por id.
 *  2. Que la Prestadora se fabrique una respuesta que parezca venir del soporte. El autor lo pone
 *     el backend y no se lee del pedido.
 *  3. Que el estado venga en el pedido. Una solicitud nace abierta, y a `en_curso` la pasa quien
 *     la toma, que no entra por acá.
 *  4. Que la pida alguien que no es la administración de la Prestadora.
 *
 * Se levanta el router de verdad contra una base de mentira y se mira qué contesta y qué escribe.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const USUARIO = '22222222-2222-2222-2222-222222222222';
const SOLICITUD = '33333333-3333-3333-3333-333333333333';

/** Qué contesta la base a cada `MÉTODO /ruta`. Cada prueba prepara lo suyo. */
const respuestas = new Map();
/** Todo lo que el backend le pidió a la base, con los filtros de la dirección incluidos. */
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

    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? valor[0] ?? null : valor));
  });
});
await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-mentira';

// El import va después de dejar puestas las variables de entorno: la conexión a la base se lee en
// el momento del import.
const { default: express } = await import('express');
await import('express-async-errors');
const { panelSoporteTecnicoRouter } = await import('../panelSoporteTecnico.js');

const app = express();
app.use(express.json());
app.use('/api/panel/soporte-tecnico', panelSoporteTecnicoRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const RAIZ = `http://127.0.0.1:${backend.address().port}/api/panel/soporte-tecnico`;

after(() => {
  backend.close();
  baseFalsa.close();
});

async function pedir(metodo, ruta, cuerpo) {
  const respuesta = await fetch(`${RAIZ}${ruta}`, {
    method: metodo,
    headers: { Authorization: 'Bearer token-de-mentira', 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

/** Lo que el backend escribió en esa tabla, o `undefined` si no escribió nada. */
function loEscritoEn(tabla) {
  return llamadas.find((l) => l.clave === `POST /rest/v1/${tabla}`)?.cuerpo;
}

/** Los filtros con los que el backend consultó esa tabla por ese método. */
function filtrosDe(metodo, tabla) {
  return llamadas.find((l) => l.clave === `${metodo} /rest/v1/${tabla}`)?.filtros;
}

/** Quién dice la base que es quien llama. Cambiarlo es cambiar de rol en la prueba. */
let quienLlama = { rol: 'admin_prestadora', prestadora_id: PRESTADORA };

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  quienLlama = { rol: 'admin_prestadora', prestadora_id: PRESTADORA };
  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [quienLlama]);
  respuestas.set('GET /rest/v1/solicitudes_de_soporte_tecnico', () => [
    { id: SOLICITUD, asunto: 'No entra una Asistente', estado: 'abierta' },
  ]);
  respuestas.set('POST /rest/v1/solicitudes_de_soporte_tecnico', () => [{ id: SOLICITUD }]);
  respuestas.set('PATCH /rest/v1/solicitudes_de_soporte_tecnico', () => [{ id: SOLICITUD }]);
  respuestas.set('GET /rest/v1/mensajes_de_soporte_tecnico', () => []);
  respuestas.set('POST /rest/v1/mensajes_de_soporte_tecnico', () => [{ id: 'mensaje' }]);
});

// ---------------------------------------------------------------------------------------

describe('abrir una solicitud', () => {
  it('queda con la Prestadora de quien pide y con quién la abrió', async () => {
    const { estado } = await pedir('POST', '/', {
      asunto: 'No entra una Asistente',
      problema: 'Desde ayer la aplicación le rechaza la clave.',
    });
    assert.equal(estado, 200);
    const escrito = loEscritoEn('solicitudes_de_soporte_tecnico');
    assert.equal(escrito.prestadora_id, PRESTADORA);
    assert.equal(escrito.abierta_por, USUARIO);
  });

  it('el estado no se lee del pedido: nace abierta', async () => {
    await pedir('POST', '/', {
      asunto: 'Algo',
      problema: 'Otra cosa',
      estado: 'en_curso',
      cerrada_at: '2026-01-01T00:00:00Z',
    });
    const escrito = loEscritoEn('solicitudes_de_soporte_tecnico');
    assert.equal(escrito.estado, undefined);
    assert.equal(escrito.cerrada_at, undefined);
  });

  it('sin descripción del problema no se abre nada', async () => {
    const { estado } = await pedir('POST', '/', { asunto: 'Algo', problema: '   ' });
    assert.equal(estado, 400);
    assert.equal(loEscritoEn('solicitudes_de_soporte_tecnico'), undefined);
  });

  it('quien coordina no pide soporte en nombre de la Prestadora', async () => {
    quienLlama = { rol: 'coordinador', prestadora_id: PRESTADORA };
    const { estado } = await pedir('POST', '/', { asunto: 'Algo', problema: 'Otra cosa' });
    assert.equal(estado, 403);
    assert.equal(loEscritoEn('solicitudes_de_soporte_tecnico'), undefined);
  });
});

describe('el hilo', () => {
  it('leer una solicitud filtra por la Prestadora, y sus mensajes también', async () => {
    const { estado } = await pedir('GET', `/${SOLICITUD}`);
    assert.equal(estado, 200);
    assert.equal(
      filtrosDe('GET', 'solicitudes_de_soporte_tecnico').get('prestadora_id'),
      `eq.${PRESTADORA}`,
    );
    assert.equal(
      filtrosDe('GET', 'mensajes_de_soporte_tecnico').get('prestadora_id'),
      `eq.${PRESTADORA}`,
    );
  });

  it('una solicitud de otra Prestadora no existe acá', async () => {
    respuestas.set('GET /rest/v1/solicitudes_de_soporte_tecnico', () => []);
    const { estado } = await pedir('GET', `/${SOLICITUD}`);
    assert.equal(estado, 404);
  });

  it('lo que agrega la Prestadora queda con autor de este lado, diga lo que diga el pedido', async () => {
    const { estado } = await pedir('POST', `/${SOLICITUD}/mensajes`, {
      texto: 'Sigue pasando hoy.',
      autor: 'soporte',
      escrito_por: null,
    });
    assert.equal(estado, 200);
    const escrito = loEscritoEn('mensajes_de_soporte_tecnico');
    assert.equal(escrito.autor, 'prestadora');
    assert.equal(escrito.escrito_por, USUARIO);
    assert.equal(escrito.prestadora_id, PRESTADORA);
  });

  it('una solicitud cerrada no sigue conversando', async () => {
    respuestas.set('GET /rest/v1/solicitudes_de_soporte_tecnico', () => [
      { id: SOLICITUD, estado: 'cerrada' },
    ]);
    const { estado } = await pedir('POST', `/${SOLICITUD}/mensajes`, { texto: 'Algo más' });
    assert.equal(estado, 400);
    assert.equal(loEscritoEn('mensajes_de_soporte_tecnico'), undefined);
  });
});

describe('cerrarla', () => {
  it('escribe el cierre acotado a la Prestadora y sólo si estaba abierta', async () => {
    const { estado } = await pedir('POST', `/${SOLICITUD}/cerrar`);
    assert.equal(estado, 200);
    const cierre = llamadas.find((l) => l.clave === 'PATCH /rest/v1/solicitudes_de_soporte_tecnico');
    assert.equal(cierre.cuerpo.estado, 'cerrada');
    assert.ok(cierre.cuerpo.cerrada_at);
    assert.equal(cierre.filtros.get('prestadora_id'), `eq.${PRESTADORA}`);
    assert.equal(cierre.filtros.get('estado'), 'neq.cerrada');
  });

  it('la que no está abierta, o no es de esta Prestadora, no se cierra', async () => {
    respuestas.set('PATCH /rest/v1/solicitudes_de_soporte_tecnico', () => []);
    const { estado } = await pedir('POST', `/${SOLICITUD}/cerrar`);
    assert.equal(estado, 404);
  });
});
