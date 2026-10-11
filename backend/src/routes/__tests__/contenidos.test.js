/**
 * Contenidos, de las tres puntas: el Panel que escribe y las dos aplicaciones que leen.
 *
 *   npm test --prefix backend
 *
 * Se prueban juntas porque son las mitades de la misma decisión: lo que no está publicado no
 * sale, cada pieza llega sólo a los destinatarios marcados, y lo de una Prestadora no se ve desde
 * otra. Separadas, cada archivo podría pasar solo y el conjunto fallar.
 *
 * Los casos están escritos por el error que evitan:
 *
 *   1. QUE UNA PRESTADORA VEA O TOQUE EL CONTENIDO DE OTRA. Todo va con la credencial de quien
 *      pide, y lo que separa a una de otra es la protección por fila de la base: lo que se
 *      sostiene acá es que cada consulta vaya de verdad con esa credencial.
 *   2. QUE UN BORRADOR, O UNA PIEZA PARA OTROS, LLEGUE A UNA APLICACIÓN. Cada aplicación pide
 *      sólo lo publicado y sólo lo suyo.
 *   3. QUE ESCRIBA QUIEN LA PRESTADORA NO HABILITÓ. Escribir y publicar es una acción del
 *      catálogo de permisos, y quien niega de verdad es el backend, además de la base.
 *   4. QUE UN ENLACE LLEVE A CUALQUIER LADO. Lo que se guarda termina en un enlace que toca a
 *      alguien, así que se admite una dirección cifrada y nada más.
 *
 * Lo que la base hace cumplir —qué filas ve cada uno— no se ve desde acá: esta base es de mentira.
 *
 * Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';

const PRESTADORA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USUARIO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CLIENTE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CONTENIDO = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ASISTENTE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

/** Qué contesta la base a cada `MÉTODO /ruta`. Cada prueba prepara lo suyo. */
const respuestas = new Map();
/** Todo lo que el backend le pidió a la base, con la dirección entera: los filtros van ahí. */
let llamadas = [];

let rolDelUsuario = 'admin_prestadora';
let permisoOtorgado = true;

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    llamadas.push({ clave, url: req.url, cuerpo: crudo ? JSON.parse(crudo) : null, credencial: req.headers.authorization });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada({ url: req.url, cuerpo: crudo ? JSON.parse(crudo) : null }) : preparada;
    if (valor === undefined) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `la prueba no preparó respuesta para ${clave}` }));
      return;
    }

    // Así se imita el choque contra el índice único del título.
    if (valor && valor.__estado) {
      res.writeHead(valor.__estado, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(valor.__cuerpo));
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
// en el momento en que se importa, y con la dirección que haya en ese instante.
const { default: express } = await import('express');
await import('express-async-errors');
const { panelContenidosRouter } = await import('../panelContenidos.js');
const { appClientesRouter } = await import('../appClientes.js');
const { appAsistentesRouter } = await import('../appAsistentes.js');

const app = express();
app.use(express.json());
app.use('/api/panel/contenidos', panelContenidosRouter);
app.use('/api/app-clientes', appClientesRouter);
app.use('/api/app-asistentes', appAsistentesRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const RAIZ = `http://127.0.0.1:${backend.address().port}`;

after(() => {
  backend.close();
  baseFalsa.close();
});

/** La credencial que mandó el último pedido. */
let credencialEnviada = null;

async function pedir(metodo, ruta, cuerpo) {
  credencialEnviada = sesionDePrueba(USUARIO);
  const respuesta = await fetch(`${RAIZ}${ruta}`, {
    method: metodo,
    headers: { Authorization: credencialEnviada, 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

const enElPanel = (ruta, metodo = 'GET', cuerpo) => pedir(metodo, `/api/panel/contenidos${ruta}`, cuerpo);
const enElCliente = (ruta) => pedir('GET', `/api/app-clientes${ruta}`);
const enElAsistente = (ruta) => pedir('GET', `/api/app-asistentes${ruta}`);

const CONTENIDO_EN_LA_BASE = {
  id: CONTENIDO,
  titulo: 'Cómo levantar a alguien de la cama sin lastimarse',
  cuerpo: 'Primero se acerca la silla…',
  enlace_url: null,
  orden: 0,
  destinatarios: [],
  publicado: false,
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-01T10:00:00Z',
};

const PIEZA_PUBLICADA = { id: CONTENIDO, titulo: 'Algo', cuerpo: 'Texto', enlace_url: null, updated_at: '2026-09-01T10:00:00Z' };

/** La sesión de alguien del Panel. El rol y el permiso los cambia cada prueba. */
function sesionDelPanel() {
  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol: rolDelUsuario, prestadora_id: PRESTADORA }]);
  respuestas.set('POST /rest/v1/rpc/tiene_permiso_de', () => permisoOtorgado);
}

/** La sesión de la titular de un Cliente. */
function sesionDelCliente() {
  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol: 'cliente', prestadora_id: PRESTADORA }]);
  respuestas.set('GET /rest/v1/clientes', () => [{ id: CLIENTE }]);
  respuestas.set('GET /rest/v1/personas_autorizadas', () => []);
}

/** La sesión de un Asistente. */
function sesionDelAsistente() {
  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol: 'asistente', prestadora_id: PRESTADORA }]);
  respuestas.set('GET /rest/v1/asistentes', () => [{ id: ASISTENTE }]);
}

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  rolDelUsuario = 'admin_prestadora';
  permisoOtorgado = true;
  sesionDelPanel();
});

/** Todas las direcciones con las que se consultó la biblioteca en este pedido. */
function consultasALaBiblioteca() {
  return llamadas.filter((l) => l.clave.endsWith('/rest/v1/contenidos'));
}

// ---------------------------------------------------------------------------------------
// Qué se admite antes de tocar la base
// ---------------------------------------------------------------------------------------

describe('qué contenido se admite', () => {
  it('sin título no hay contenido', async () => {
    const { estado, cuerpo } = await enElPanel('/', 'POST', { titulo: '   ', cuerpo: 'algo' });
    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'faltan_datos');
    assert.equal(consultasALaBiblioteca().length, 0);
  });

  it('sin texto tampoco', async () => {
    const { estado, cuerpo } = await enElPanel('/', 'POST', { titulo: 'Algo', cuerpo: '' });
    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'faltan_datos');
  });

  it('un enlace que no es una dirección cifrada se rechaza', async () => {
    for (const enlace of ['http://ejemplo.invalido/a', 'javascript:alert(1)', 'ejemplo.invalido']) {
      const { estado, cuerpo } = await enElPanel('/', 'POST', {
        titulo: 'Algo',
        cuerpo: 'Texto',
        enlace_url: enlace,
      });
      assert.equal(estado, 400, `este enlace no debería haberse admitido: ${enlace}`);
      assert.equal(cuerpo.motivo, 'enlace_invalido');
    }
    assert.equal(consultasALaBiblioteca().length, 0);
  });

  it('un orden que no es un número entero se rechaza', async () => {
    const { estado, cuerpo } = await enElPanel('/', 'POST', { titulo: 'Algo', cuerpo: 'Texto', orden: '2,5' });
    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'orden_invalido');
  });

  it('un destinatario que no existe se rechaza', async () => {
    for (const destinatarios of [['familias'], 'clientes', [null]]) {
      const { estado } = await enElPanel('/', 'POST', { titulo: 'Algo', cuerpo: 'Texto', destinatarios });
      assert.equal(estado, 400, `estos destinatarios no deberían haberse admitido: ${JSON.stringify(destinatarios)}`);
    }
    assert.equal(consultasALaBiblioteca().length, 0);
  });

  it('publicada sin destinatarios no se guarda', async () => {
    const { estado, cuerpo } = await enElPanel('/', 'POST', { titulo: 'Algo', cuerpo: 'Texto', publicado: true, destinatarios: [] });
    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'faltan_datos');
    assert.equal(consultasALaBiblioteca().length, 0);
  });

  it('los destinatarios se guardan sin repetir y en el orden de la lista', async () => {
    respuestas.set('POST /rest/v1/contenidos', ({ cuerpo }) => [{ ...CONTENIDO_EN_LA_BASE, ...cuerpo }]);
    await enElPanel('/', 'POST', { titulo: 'Algo', cuerpo: 'Texto', destinatarios: ['personal', 'clientes', 'personal'] });

    const escritura = llamadas.find((l) => l.clave === 'POST /rest/v1/contenidos');
    assert.deepEqual(escritura.cuerpo.destinatarios, ['clientes', 'personal']);
  });

  it('el enlace vacío se guarda sin enlace, no con una cadena vacía', async () => {
    respuestas.set('POST /rest/v1/contenidos', ({ cuerpo }) => [{ ...CONTENIDO_EN_LA_BASE, ...cuerpo }]);
    await enElPanel('/', 'POST', { titulo: 'Algo', cuerpo: 'Texto', enlace_url: '   ' });

    const escritura = llamadas.find((l) => l.clave === 'POST /rest/v1/contenidos');
    assert.equal(escritura.cuerpo.enlace_url, null);
  });

  it('una pieza nueva nace sin publicar', async () => {
    respuestas.set('POST /rest/v1/contenidos', ({ cuerpo }) => [{ ...CONTENIDO_EN_LA_BASE, ...cuerpo }]);
    await enElPanel('/', 'POST', { titulo: 'Algo', cuerpo: 'Texto' });

    const escritura = llamadas.find((l) => l.clave === 'POST /rest/v1/contenidos');
    assert.equal(escritura.cuerpo.publicado, false);
    assert.equal(escritura.cuerpo.prestadora_id, PRESTADORA);
    assert.equal(escritura.cuerpo.creado_por, USUARIO);
  });

  it('dos piezas con el mismo título no conviven, y se dice cuál es el problema', async () => {
    respuestas.set('POST /rest/v1/contenidos', () => ({
      __estado: 409,
      __cuerpo: { code: '23505', message: 'duplicate key value violates unique constraint' },
    }));

    const { estado, cuerpo } = await enElPanel('/', 'POST', { titulo: 'Algo', cuerpo: 'Texto' });
    assert.equal(estado, 409);
    assert.equal(cuerpo.motivo, 'titulo_de_contenido_repetido');
  });
});

// ---------------------------------------------------------------------------------------
// Quién escribe y quién lee, del lado del Panel
// ---------------------------------------------------------------------------------------

describe('quién toca la biblioteca', () => {
  it('sin el permiso no se escribe, aunque la pantalla haya mostrado el botón', async () => {
    permisoOtorgado = false;
    rolDelUsuario = 'coordinador';

    for (const [metodo, ruta, cuerpo] of [
      ['POST', '/', { titulo: 'Algo', cuerpo: 'Texto' }],
      ['PATCH', `/${CONTENIDO}`, { titulo: 'Otro' }],
      ['DELETE', `/${CONTENIDO}`, undefined],
    ]) {
      const { estado } = await enElPanel(ruta, metodo, cuerpo);
      assert.equal(estado, 403, `${metodo} ${ruta} debería haberse negado`);
    }
    assert.equal(consultasALaBiblioteca().length, 0);
  });

  it('el permiso que se pide es el de publicar contenidos', async () => {
    respuestas.set('POST /rest/v1/contenidos', ({ cuerpo }) => [{ ...CONTENIDO_EN_LA_BASE, ...cuerpo }]);
    rolDelUsuario = 'coordinador';
    await enElPanel('/', 'POST', { titulo: 'Algo', cuerpo: 'Texto' });

    const consulta = llamadas.find((l) => l.clave === 'POST /rest/v1/rpc/tiene_permiso_de');
    assert.ok(consulta, 'la ruta tenía que preguntar el permiso');
    assert.equal(consulta.cuerpo.p_accion, 'publicar_contenidos');
  });

  it('cuánto ve cada uno lo decide la base: la lectura no lleva filtros propios', async () => {
    permisoOtorgado = false;
    rolDelUsuario = 'coordinador';
    respuestas.set('GET /rest/v1/contenidos', () => [CONTENIDO_EN_LA_BASE]);

    const { estado, cuerpo } = await enElPanel('/');
    assert.equal(estado, 200);
    assert.equal(cuerpo.contenidos.length, 1);
  });

  it('el menú pregunta si hay algo, y la respuesta es sí o no', async () => {
    respuestas.set('GET /rest/v1/contenidos', () => []);
    assert.deepEqual((await enElPanel('/hay')).cuerpo, { hay: false });

    respuestas.set('GET /rest/v1/contenidos', () => [{ id: CONTENIDO }]);
    assert.deepEqual((await enElPanel('/hay')).cuerpo, { hay: true });
  });

  it('quien no es del Panel no entra', async () => {
    rolDelUsuario = 'cliente';
    const { estado } = await enElPanel('/');
    assert.equal(estado, 403);
  });
});

// ---------------------------------------------------------------------------------------
// El aislamiento entre Prestadoras
// ---------------------------------------------------------------------------------------

describe('el contenido de una Prestadora no se ve ni se toca desde otra', () => {
  it('todo lo del Panel va con la credencial de quien pide, nunca con la llave maestra', async () => {
    respuestas.set('GET /rest/v1/contenidos', () => [CONTENIDO_EN_LA_BASE]);
    respuestas.set('POST /rest/v1/contenidos', ({ cuerpo }) => [{ ...CONTENIDO_EN_LA_BASE, ...cuerpo }]);
    respuestas.set('PATCH /rest/v1/contenidos', () => [CONTENIDO_EN_LA_BASE]);
    respuestas.set('DELETE /rest/v1/contenidos', () => [{ id: CONTENIDO }]);

    const credenciales = [];
    for (const [metodo, ruta, cuerpo] of [
      ['GET', '/', undefined],
      ['GET', '/hay', undefined],
      ['POST', '/', { titulo: 'Algo', cuerpo: 'Texto' }],
      ['PATCH', `/${CONTENIDO}`, { publicado: false }],
      ['DELETE', `/${CONTENIDO}`, undefined],
    ]) {
      llamadas = [];
      await enElPanel(ruta, metodo, cuerpo);
      const consultas = consultasALaBiblioteca();
      assert.ok(consultas.length > 0, `${metodo} ${ruta} tenía que consultar la base`);
      for (const consulta of consultas) credenciales.push([`${metodo} ${ruta}`, consulta.credencial, credencialEnviada]);
    }
    for (const [donde, usada, esperada] of credenciales) {
      assert.equal(usada, esperada, `${donde} no salió con la credencial de quien pide`);
    }
  });

  it('una pieza de otra Prestadora no existe para ésta, y se contesta lo mismo que si no existiera', async () => {
    respuestas.set('GET /rest/v1/contenidos', () => []);
    respuestas.set('DELETE /rest/v1/contenidos', () => []);

    const cambio = await enElPanel(`/${CONTENIDO}`, 'PATCH', { publicado: true });
    assert.equal(cambio.estado, 404);
    assert.equal(cambio.cuerpo.motivo, 'no_encontrado');

    const borrado = await enElPanel(`/${CONTENIDO}`, 'DELETE');
    assert.equal(borrado.estado, 404);
    assert.equal(borrado.cuerpo.motivo, 'no_encontrado');
  });

  it('un cambio que trae sólo el interruptor no borra lo que ya estaba', async () => {
    respuestas.set('GET /rest/v1/contenidos', () => [{ ...CONTENIDO_EN_LA_BASE, destinatarios: ['asistentes'] }]);
    respuestas.set('PATCH /rest/v1/contenidos', ({ cuerpo }) => [{ ...CONTENIDO_EN_LA_BASE, ...cuerpo }]);

    const { estado } = await enElPanel(`/${CONTENIDO}`, 'PATCH', { publicado: true });
    assert.equal(estado, 200);

    const escritura = llamadas.find((l) => l.clave === 'PATCH /rest/v1/contenidos');
    assert.equal(escritura.cuerpo.titulo, CONTENIDO_EN_LA_BASE.titulo);
    assert.equal(escritura.cuerpo.cuerpo, CONTENIDO_EN_LA_BASE.cuerpo);
    assert.deepEqual(escritura.cuerpo.destinatarios, ['asistentes']);
    assert.equal(escritura.cuerpo.publicado, true);
    assert.ok(escritura.cuerpo.updated_at, 'la fecha de modificación la escribe la ruta');
  });

  it('publicar una pieza guardada sin destinatarios se rechaza', async () => {
    respuestas.set('GET /rest/v1/contenidos', () => [CONTENIDO_EN_LA_BASE]);

    const { estado, cuerpo } = await enElPanel(`/${CONTENIDO}`, 'PATCH', { publicado: true });
    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'faltan_datos');
    assert.ok(!llamadas.some((l) => l.clave === 'PATCH /rest/v1/contenidos'));
  });
});

// ---------------------------------------------------------------------------------------
// Lo que llega a cada aplicación
// ---------------------------------------------------------------------------------------

for (const [quien, preparar, pedirLa, destinatario, rolAjeno] of [
  ['el Cliente', sesionDelCliente, enElCliente, 'clientes', 'coordinador'],
  ['el Asistente', sesionDelAsistente, enElAsistente, 'asistentes', 'cliente'],
]) {
  describe(`los contenidos del lado de ${quien}`, () => {
    beforeEach(() => {
      respuestas.clear();
      llamadas = [];
      preparar();
    });

    it('sale lo publicado para él, con su credencial, y nada más', async () => {
      respuestas.set('GET /rest/v1/contenidos', () => [PIEZA_PUBLICADA]);

      const { estado, cuerpo } = await pedirLa('/contenidos');
      assert.equal(estado, 200);
      assert.equal(cuerpo.contenidos.length, 1);

      const consulta = consultasALaBiblioteca()[0];
      assert.equal(consulta.credencial, credencialEnviada, 'la biblioteca no salió con la credencial de la persona');
      const filtros = new URL(consulta.url, 'http://interno').searchParams;
      assert.equal(filtros.get('publicado'), 'eq.true', `un borrador no sale hacia ${quien}: ${consulta.url}`);
      assert.equal(filtros.get('destinatarios'), `cs.{${destinatario}}`, `una pieza para otros no sale hacia ${quien}: ${consulta.url}`);
    });

    it('no se manda nada de lo que es de adentro de la Prestadora', async () => {
      respuestas.set('GET /rest/v1/contenidos', () => [PIEZA_PUBLICADA]);

      await pedirLa('/contenidos');

      const consulta = consultasALaBiblioteca()[0];
      const pedido = new URL(consulta.url, 'http://interno').searchParams.get('select');
      for (const columna of ['creado_por', 'publicado', 'orden', 'destinatarios']) {
        assert.ok(!pedido.includes(columna), `esta columna no tiene por qué viajar: ${columna}`);
      }
    });

    it('quien no es de los suyos no entra', async () => {
      respuestas.set('GET /rest/v1/usuarios', () => [{ rol: rolAjeno, prestadora_id: PRESTADORA }]);
      const { estado } = await pedirLa('/contenidos');
      assert.equal(estado, 403);
    });
  });
}
