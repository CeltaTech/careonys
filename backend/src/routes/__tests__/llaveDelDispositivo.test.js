/**
 * Entrar con la llave del teléfono: los caminos que no dependen de la criptografía.
 *
 *   npm test --prefix backend
 *
 * Verificar una firma lo hace una librería y no tiene sentido probarla de nuevo. Lo que sí hay que
 * probar es todo lo que la rodea, que es lo que deja pasar o no, y que está escrito acá adentro.
 * Los casos están por el error que evitan:
 *
 *   1. QUE LA PANTALLA DE INGRESO SIRVA PARA AVERIGUAR QUIÉN TIENE CUENTA. La llave que no existe
 *      y la que fue revocada tienen que contestar exactamente lo mismo —mismo código, mismo
 *      cuerpo— o alguien puede ir probando hasta saber quién es cliente de quién
 *      (`celtatech/CLAUDE.md` §6).
 *   2. QUE UNA LLAVE CRUCE DE APLICACIÓN. Una llave dada de alta en la aplicación del Asistente no
 *      puede servir para entrar a la de la Familia: son dos permisos distintos.
 *   3. QUE UNA PRESTADORA ALCANCE LA LLAVE DE OTRA. La puerta de calle trabaja adentro de la
 *      Prestadora de la dirección, con la credencial del trabajo sin persona: el desafío nace con
 *      ella, y la llave y el desafío se buscan sólo ahí. La llave maestra se usa para una sola
 *      cosa, pedir el pase de entrada, y la prueba lo afirma mirando con qué credencial llegó
 *      cada pedido.
 *   4. QUE SE PUEDA SACAR UNA LLAVE AJENA. La baja filtra por la persona de la sesión, así que
 *      tener el identificador de la llave de otro no alcanza.
 *   5. QUE LA PANTALLA VEA LA CREDENCIAL. Lo que se lista son fechas, nunca la mitad pública de la
 *      llave ni su identificador.
 *
 * La base falsa honra los filtros de la dirección a propósito: si alguien saca el filtro por
 * Prestadora, la prueba de aislamiento deja de pasar.
 *
 * Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import crypto from 'node:crypto';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';

const PRESTADORA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTRA_PRESTADORA = '99999999-9999-4999-8999-999999999999';
const USUARIO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
// El Legajo de esa persona en esta Prestadora, que es otro número que el de la cuenta.
const LEGAJO = 'bbbbbbbb-bbbb-4bbb-8bbb-b0000000000b';
const OTRA_PERSONA = '88888888-8888-4888-8888-888888888888';
// Quien entra por la aplicación de Familias, y el Legajo de su Familia.
const FAMILIAR = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const FAMILIA = 'ffffffff-ffff-4fff-8fff-f0000000000f';
const LLAVE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LLAVE_AJENA = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const LLAVE_DE_OTRA_PRESTADORA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const CREDENCIAL_VIVA = 'Y3JlZGVuY2lhbC12aXZh';
const CREDENCIAL_REVOCADA = 'Y3JlZGVuY2lhbC1yZXZvY2FkYQ';
const CREDENCIAL_DESCONOCIDA = 'Y3JlZGVuY2lhbC1xdWUtbm8tZXhpc3Rl';

/** Qué contesta la base a cada `MÉTODO /ruta`. Cada prueba prepara lo suyo. */
const respuestas = new Map();
/** Todo lo que el backend le pidió a la base, con la dirección entera: los filtros van ahí. */
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    const cuerpo = crudo ? JSON.parse(crudo) : null;
    llamadas.push({
      clave,
      url: req.url,
      cuerpo,
      credencial: credencialDe(req.headers.authorization),
      autorizacion: req.headers.authorization ?? null,
    });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada({ cuerpo, url: req.url }) : preparada;
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
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? valor[0] ?? null : valor));
  });
});

/**
 * Con qué credencial llegó cada pedido: la maestra, o la del trabajo sin persona con su
 * Prestadora. Es lo que deja afirmar que la puerta de calle trabaja adentro de una Prestadora y
 * que la maestra se usa sólo para el pase de entrada.
 */
function credencialDe(autorizacion) {
  const token = String(autorizacion || '').replace(/^Bearer /, '');
  if (token === 'clave-de-mentira') return { maestra: true };
  try {
    const cuerpo = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return { maestra: false, rol: cuerpo.role, prestadoraId: cuerpo.prestadora_id ?? null };
  } catch {
    return { maestra: false, rol: null, prestadoraId: null };
  }
}

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-mentira';
process.env.SUPABASE_ANON_KEY = 'llave-publica-de-mentira';
// La clave con la que el backend firma la credencial del trabajo sin persona. Se genera acá, para
// esta prueba y nada más: la base falsa no la comprueba, sólo lee qué dice la credencial.
{
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  process.env.CLAVE_DEL_TRABAJO_SIN_PERSONA = JSON.stringify({
    ...privateKey.export({ format: 'jwk' }),
    kid: 'clave-de-prueba',
  });
}
process.env.PWA_ASISTENTES_URL = 'https://asistentes.ejemplo.com';
process.env.PWA_FAMILIAS_URL = 'https://familias.ejemplo.com';

// El import va después de dejar puestas las variables de entorno: la conexión a la base se arma
// en el momento en que se importa, y con la dirección que haya en ese instante.
const { default: express } = await import('express');
await import('express-async-errors');
const { llaveDelDispositivoRouter, routerDeLlavesConSesion } = await import('../llaveDelDispositivo.js');
const { requiereRolAsistente } = await import('../../middleware/requiereRolAsistente.js');
const { requiereRolFamilia } = await import('../../middleware/requiereRolFamilia.js');
const { olvidarPedidos } = await import('../../middleware/topeDePedidos.js');

const app = express();
app.use(express.json());
app.use('/api/llave-de-dispositivo', llaveDelDispositivoRouter);
app.use('/api/app-asistentes/llaves', requiereRolAsistente, routerDeLlavesConSesion('asistente'));
app.use('/api/app-familias/llaves', requiereRolFamilia, routerDeLlavesConSesion('familia'));
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const RAIZ = `http://127.0.0.1:${backend.address().port}`;

after(() => {
  backend.close();
  baseFalsa.close();
});

async function pedir(metodo, ruta, cuerpo, { usuario = USUARIO } = {}) {
  const opciones = {
    method: metodo,
    headers: { Authorization: sesionDePrueba(usuario), 'Content-Type': 'application/json' },
  };
  if (cuerpo !== undefined) opciones.body = JSON.stringify(cuerpo);
  const respuesta = await fetch(`${RAIZ}${ruta}`, opciones);
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

/**
 * La base falsa filtra de verdad por los `eq` y los `is` que vengan en la dirección.
 *
 * Es lo que convierte la prueba de aislamiento en una prueba: una base que contestara siempre la
 * misma fila daría 200 aunque el backend consultara sin filtrar por Prestadora.
 */
function filasQuePasanLosFiltros(url, filas) {
  const parametros = new URL(url, 'http://interno').searchParams;
  return filas.filter((fila) =>
    [...parametros.entries()].every(([campo, condicion]) => {
      if (!Object.hasOwn(fila, campo)) return true;
      if (condicion === 'is.null') return fila[campo] === null || fila[campo] === undefined;
      if (condicion === 'not.is.null') return fila[campo] !== null && fila[campo] !== undefined;
      if (condicion.startsWith('eq.')) return String(fila[campo]) === condicion.slice(3);
      return true;
    })
  );
}

/** Las llaves que hay en la base falsa, de tres dueños distintos. */
let llavesEnLaBase;

function llaveDePrueba(extra = {}) {
  return {
    id: LLAVE,
    prestadora_id: PRESTADORA,
    usuario_id: USUARIO,
    rol: 'asistente',
    credencial_id: CREDENCIAL_VIVA,
    clave_publica: 'bWl0YWQtcHVibGljYQ',
    contador: 3,
    transportes: ['internal'],
    creada_en: '2026-09-01T10:00:00Z',
    ultimo_uso_en: '2026-09-14T08:00:00Z',
    revocada_en: null,
    ...extra,
  };
}

beforeEach(() => {
  llamadas = [];
  respuestas.clear();

  llavesEnLaBase = [
    llaveDePrueba(),
    llaveDePrueba({
      id: LLAVE_AJENA,
      usuario_id: OTRA_PERSONA,
      credencial_id: 'Y3JlZGVuY2lhbC1hamVuYQ',
      creada_en: '2026-09-02T10:00:00Z',
    }),
    llaveDePrueba({
      id: LLAVE_DE_OTRA_PRESTADORA,
      prestadora_id: OTRA_PRESTADORA,
      credencial_id: 'Y3JlZGVuY2lhbC1kZS1vdHJh',
      creada_en: '2026-09-03T10:00:00Z',
    }),
    llaveDePrueba({
      id: '77777777-7777-4777-8777-777777777777',
      credencial_id: CREDENCIAL_REVOCADA,
      revocada_en: '2026-09-10T10:00:00Z',
      creada_en: '2026-09-04T10:00:00Z',
    }),
  ];

  // La sesión que llega: un Asistente de la Prestadora de prueba.
  respuestas.set('GET /auth/v1/user', { id: USUARIO, aud: 'authenticated' });
  respuestas.set('GET /rest/v1/usuarios', ({ url }) =>
    filasQuePasanLosFiltros(url, [
      { id: USUARIO, rol: 'asistente', prestadora_id: PRESTADORA, nombre: 'Ana Prueba', email: 'ana@ejemplo.com' },
      { id: OTRA_PERSONA, rol: 'asistente', prestadora_id: PRESTADORA, nombre: 'Bruno Prueba', email: 'bruno@ejemplo.com' },
      { id: FAMILIAR, rol: 'familia', prestadora_id: PRESTADORA, nombre: 'Carla Prueba', email: 'carla@ejemplo.com' },
    ])
  );
  // El Legajo de la Familia con el que entra la sesión de la aplicación de Familias.
  respuestas.set('GET /rest/v1/familias', ({ url }) =>
    filasQuePasanLosFiltros(url, [{ id: FAMILIA, usuario_id: FAMILIAR, prestadora_id: PRESTADORA }])
  );
  respuestas.set('GET /rest/v1/llaves_de_dispositivo', ({ url }) =>
    filasQuePasanLosFiltros(url, llavesEnLaBase)
  );
  // El Legajo con el que entra la sesión: lo busca el middleware por la cuenta y la Prestadora.
  respuestas.set('GET /rest/v1/asistentes', [{ id: LEGAJO, prestadora_id: PRESTADORA }]);
  respuestas.set('POST /rest/v1/desafios_de_llave', []);

  // La puerta: de qué Prestadora es cada dirección. Sólo una existe.
  respuestas.set('POST /rest/v1/rpc/prestadora_de_la_direccion', ({ cuerpo }) =>
    cuerpo?.p_direccion === PUERTA ? PRESTADORA : null
  );
  respuestas.set('GET /rest/v1/configuracion_prestadora', ({ url }) =>
    filasQuePasanLosFiltros(url, [{ prestadora_id: PRESTADORA, dominio: PUERTA }])
  );
});

const PUERTA = 'prestadora-de-prueba';
const entrar = (cuerpo, puerta = PUERTA) =>
  pedir('POST', `/api/llave-de-dispositivo/${puerta}/entrar`, cuerpo);
const pedirDesafio = (cuerpo, puerta = PUERTA) =>
  pedir('POST', `/api/llave-de-dispositivo/${puerta}/entrar/desafio`, cuerpo);
const misLlaves = () => pedir('GET', '/api/app-asistentes/llaves');

/** Una respuesta del navegador con el mínimo que la ruta lee antes de verificar nada. */
function respuestaDelNavegador(credencialId, desafio = 'un-desafio') {
  const clientData = Buffer.from(JSON.stringify({ challenge: desafio })).toString('base64url');
  return {
    id: credencialId,
    rawId: credencialId,
    type: 'public-key',
    response: { clientDataJSON: clientData, authenticatorData: 'YQ', signature: 'YQ' },
    clientExtensionResults: {},
  };
}

/** Los desafíos que hay en la base falsa. Sólo los usa la prueba con firma de verdad. */
let desafiosEnLaBase = [];

function desafioDePrueba(extra = {}) {
  return {
    id: crypto.randomUUID(),
    para: 'entrada',
    rol: 'asistente',
    usuario_id: null,
    prestadora_id: PRESTADORA,
    vence_en: new Date(Date.now() + 60 * 1000).toISOString(),
    usado_en: null,
    ...extra,
  };
}

/**
 * Un teléfono de mentira: una llave P-256 que firma lo mismo que firmaría un teléfono de verdad.
 *
 * Hace falta para llegar al final del camino —hasta el pase— y así poder afirmar con qué
 * credencial se pidió cada cosa. Lo que se firma es lo que define WebAuthn: los datos del
 * aparato (resumen de la parte confiable, marcas de presencia y verificación, contador) seguidos
 * del resumen de lo que armó el navegador.
 */
function llaveQueFirma({ contador = 4, origen = 'https://asistentes.ejemplo.com' } = {}) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const { x, y } = publicKey.export({ format: 'jwk' });
  // La mitad pública en el formato en que la guarda la base: COSE, en base64url.
  const cose = Buffer.concat([
    Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]),
    Buffer.from(x, 'base64url'),
    Buffer.from([0x22, 0x58, 0x20]),
    Buffer.from(y, 'base64url'),
  ]);

  return {
    clavePublica: cose.toString('base64url'),
    firmar(desafio) {
      const datosDelAparato = Buffer.alloc(37);
      crypto.createHash('sha256').update(new URL(origen).hostname).digest().copy(datosDelAparato, 0);
      datosDelAparato[32] = 0x05; // presencia y verificación de la persona
      datosDelAparato.writeUInt32BE(contador, 33);
      const delNavegador = Buffer.from(
        JSON.stringify({ type: 'webauthn.get', challenge: desafio, origin: origen })
      );
      const firma = crypto
        .createSign('sha256')
        .update(Buffer.concat([datosDelAparato, crypto.createHash('sha256').update(delNavegador).digest()]))
        .sign(privateKey);
      return {
        id: CREDENCIAL_VIVA,
        rawId: CREDENCIAL_VIVA,
        type: 'public-key',
        response: {
          clientDataJSON: delNavegador.toString('base64url'),
          authenticatorData: datosDelAparato.toString('base64url'),
          signature: firma.toString('base64url'),
        },
        clientExtensionResults: {},
      };
    },
  };
}

describe('la pantalla de ingreso no dice quién tiene cuenta', () => {
  it('la credencial desconocida y la revocada contestan exactamente lo mismo', async () => {
    const desconocida = await entrar({
      rol: 'asistente',
      respuesta: respuestaDelNavegador(CREDENCIAL_DESCONOCIDA),
    });
    const revocada = await entrar({
      rol: 'asistente',
      respuesta: respuestaDelNavegador(CREDENCIAL_REVOCADA),
    });

    assert.equal(desconocida.estado, 401);
    assert.deepEqual(desconocida, revocada);
    assert.equal(desconocida.cuerpo.motivo, 'llave_no_sirve');
  });

  it('el aviso no nombra ninguna tabla, columna ni identificador', async () => {
    const { cuerpo } = await entrar({
      rol: 'asistente',
      respuesta: respuestaDelNavegador(CREDENCIAL_REVOCADA),
    });
    const texto = JSON.stringify(cuerpo);
    assert.ok(!texto.includes('llaves_de_dispositivo'));
    assert.ok(!texto.includes('revocada'));
    assert.ok(!texto.includes(CREDENCIAL_REVOCADA));
  });

  it('no se pide el correo para entrar: el desafío se emite sin saber de quién es', async () => {
    const { estado, cuerpo } = await pedirDesafio({ rol: 'asistente' });
    assert.equal(estado, 200);
    assert.ok(cuerpo.challenge);
    assert.deepEqual(cuerpo.allowCredentials ?? [], []);
  });

  it('el desafío queda guardado con vencimiento y con la Prestadora de la puerta, sin persona', async () => {
    await pedirDesafio({ rol: 'asistente' });
    const guardado = llamadas.find((l) => l.clave === 'POST /rest/v1/desafios_de_llave');
    assert.equal(guardado.cuerpo.para, 'entrada');
    assert.equal(guardado.cuerpo.rol, 'asistente');
    assert.equal(guardado.cuerpo.prestadora_id, PRESTADORA);
    assert.equal(guardado.cuerpo.usuario_id, null);
    assert.ok(new Date(guardado.cuerpo.vence_en) > new Date());
  });

  it('y se guarda con la credencial del trabajo sin persona de esa Prestadora, no con la maestra', async () => {
    await pedirDesafio({ rol: 'asistente' });
    const guardado = llamadas.find((l) => l.clave === 'POST /rest/v1/desafios_de_llave');
    assert.deepEqual(guardado.credencial, {
      maestra: false,
      rol: 'trabajo_sin_persona',
      prestadoraId: PRESTADORA,
    });
  });

  it('una dirección que no es de ninguna Prestadora no emite ningún desafío', async () => {
    const { estado } = await pedirDesafio({ rol: 'asistente' }, 'no-existe');
    assert.equal(estado, 404);
    assert.equal(llamadas.filter((l) => l.clave === 'POST /rest/v1/desafios_de_llave').length, 0);
  });

  it('un rol que no tiene aplicación no emite ningún desafío', async () => {
    const { estado } = await pedirDesafio({ rol: 'coordinador' });
    assert.equal(estado, 400);
    assert.equal(llamadas.filter((l) => l.clave === 'POST /rest/v1/desafios_de_llave').length, 0);
  });
});

describe('la entrada trabaja adentro de la Prestadora de la puerta', () => {
  it('la llave de otra Prestadora contesta lo mismo que una que no existe', async () => {
    const deOtra = await entrar({
      rol: 'asistente',
      respuesta: respuestaDelNavegador('Y3JlZGVuY2lhbC1kZS1vdHJh'),
    });
    const desconocida = await entrar({
      rol: 'asistente',
      respuesta: respuestaDelNavegador(CREDENCIAL_DESCONOCIDA),
    });
    assert.equal(deOtra.estado, 401);
    assert.deepEqual(deOtra, desconocida);
  });

  it('la llave se busca nombrando la Prestadora, con la credencial de esa Prestadora', async () => {
    await entrar({ rol: 'asistente', respuesta: respuestaDelNavegador(CREDENCIAL_VIVA) });
    const consulta = llamadas.find((l) => l.clave === 'GET /rest/v1/llaves_de_dispositivo');
    assert.ok(consulta.url.includes(`prestadora_id=eq.${PRESTADORA}`));
    assert.deepEqual(consulta.credencial, {
      maestra: false,
      rol: 'trabajo_sin_persona',
      prestadoraId: PRESTADORA,
    });
  });

  it('una dirección que no es de ninguna Prestadora no busca ninguna llave', async () => {
    const { estado } = await entrar(
      { rol: 'asistente', respuesta: respuestaDelNavegador(CREDENCIAL_VIVA) },
      'no-existe'
    );
    assert.equal(estado, 404);
    assert.equal(llamadas.filter((l) => l.clave === 'GET /rest/v1/llaves_de_dispositivo').length, 0);
  });

  describe('con una firma de verdad', () => {
    let firmante;

    beforeEach(() => {
      firmante = llaveQueFirma();
      llavesEnLaBase[0] = llaveDePrueba({ clave_publica: firmante.clavePublica });
      desafiosEnLaBase = [
        desafioDePrueba({ desafio: 'desafio-de-esta', prestadora_id: PRESTADORA }),
        desafioDePrueba({ desafio: 'desafio-de-otra', prestadora_id: OTRA_PRESTADORA }),
      ];
      respuestas.set('GET /rest/v1/desafios_de_llave', ({ url }) =>
        filasQuePasanLosFiltros(url, desafiosEnLaBase)
      );
      respuestas.set('PATCH /rest/v1/desafios_de_llave', ({ url }) =>
        filasQuePasanLosFiltros(url, desafiosEnLaBase).map((fila) => ({ id: fila.id }))
      );
      respuestas.set('PATCH /rest/v1/llaves_de_dispositivo', ({ url }) =>
        filasQuePasanLosFiltros(url, llavesEnLaBase).map((fila) => ({ id: fila.id }))
      );
      respuestas.set('POST /auth/v1/admin/generate_link', {
        id: USUARIO,
        email: 'ana@ejemplo.com',
        action_link: 'https://ejemplo.com/pase',
        email_otp: '000000',
        hashed_token: 'pase-de-mentira',
        redirect_to: 'https://ejemplo.com',
        verification_type: 'magiclink',
      });
    });

    it('entra, y el pase es lo único que se pide con la llave maestra', async () => {
      const { estado, cuerpo } = await entrar({
        rol: 'asistente',
        respuesta: firmante.firmar('desafio-de-esta'),
      });
      assert.equal(estado, 200);
      assert.equal(cuerpo.pase, 'pase-de-mentira');

      const conLaMaestra = llamadas.filter((l) => l.credencial.maestra).map((l) => l.clave);
      assert.deepEqual(conLaMaestra, ['POST /auth/v1/admin/generate_link']);

      const gastado = llamadas.find((l) => l.clave === 'PATCH /rest/v1/desafios_de_llave');
      assert.ok(gastado.url.includes(`prestadora_id=eq.${PRESTADORA}`));
    });

    it('un desafío emitido por la puerta de otra Prestadora no sirve', async () => {
      const { estado } = await entrar({
        rol: 'asistente',
        respuesta: firmante.firmar('desafio-de-otra'),
      });
      assert.equal(estado, 401);
      assert.equal(llamadas.filter((l) => l.clave === 'POST /auth/v1/admin/generate_link').length, 0);
    });
  });
});

describe('una llave no cruza de aplicación', () => {
  it('la llave del Asistente no sirve para entrar a la de la Familia', async () => {
    const { estado } = await entrar({
      rol: 'familia',
      respuesta: respuestaDelNavegador(CREDENCIAL_VIVA),
    });
    assert.equal(estado, 401);
  });

  it('y la consulta filtra por rol, no lo comprueba después', async () => {
    await entrar({ rol: 'familia', respuesta: respuestaDelNavegador(CREDENCIAL_VIVA) });
    const consulta = llamadas.find((l) => l.clave === 'GET /rest/v1/llaves_de_dispositivo');
    assert.ok(consulta.url.includes('rol=eq.familia'));
  });
});

describe('las llaves propias', () => {
  it('se listan las propias y ninguna más', async () => {
    const { estado, cuerpo } = await misLlaves();
    assert.equal(estado, 200);
    assert.deepEqual(
      cuerpo.llaves.map((l) => l.id),
      [LLAVE]
    );
  });

  it('la consulta filtra por Prestadora, que es lo único que aísla', async () => {
    await misLlaves();
    const consulta = llamadas.find(
      (l) => l.clave === 'GET /rest/v1/llaves_de_dispositivo' && l.url.includes('creada_en')
    );
    assert.ok(consulta.url.includes(`prestadora_id=eq.${PRESTADORA}`));
    assert.ok(consulta.url.includes(`usuario_id=eq.${USUARIO}`));
    assert.ok(consulta.url.includes('revocada_en=is.null'));
  });

  it('lo que se manda son fechas, nunca la credencial ni la mitad pública de la llave', async () => {
    const { cuerpo } = await misLlaves();
    const texto = JSON.stringify(cuerpo);
    assert.ok(!texto.includes(CREDENCIAL_VIVA));
    assert.ok(!texto.includes('bWl0YWQtcHVibGljYQ'));
    assert.deepEqual(Object.keys(cuerpo.llaves[0]).sort(), ['agregadaEn', 'id', 'ultimoUsoEn']);
  });
});

describe('la baja', () => {
  beforeEach(() => {
    respuestas.set('PATCH /rest/v1/llaves_de_dispositivo', ({ url }) =>
      filasQuePasanLosFiltros(url, llavesEnLaBase).map((fila) => ({ id: fila.id }))
    );
  });

  it('saca la propia', async () => {
    const { estado, cuerpo } = await pedir('DELETE', `/api/app-asistentes/llaves/${LLAVE}`);
    assert.equal(estado, 200);
    assert.equal(cuerpo.ok, true);
  });

  it('marca en vez de borrar, para que quede constancia', async () => {
    await pedir('DELETE', `/api/app-asistentes/llaves/${LLAVE}`);
    const baja = llamadas.find((l) => l.clave === 'PATCH /rest/v1/llaves_de_dispositivo');
    assert.ok(baja.cuerpo.revocada_en);
    assert.equal(llamadas.filter((l) => l.clave.startsWith('DELETE ')).length, 0);
  });

  it('la de otra persona no se puede sacar, aunque se tenga el identificador', async () => {
    const { estado } = await pedir('DELETE', `/api/app-asistentes/llaves/${LLAVE_AJENA}`);
    assert.equal(estado, 404);
  });

  it('la de otra Prestadora tampoco, y contesta lo mismo que una que no existe', async () => {
    const deOtra = await pedir('DELETE', `/api/app-asistentes/llaves/${LLAVE_DE_OTRA_PRESTADORA}`);
    const inventada = await pedir('DELETE', '/api/app-asistentes/llaves/00000000-0000-4000-8000-000000000000');
    assert.equal(deOtra.estado, 404);
    assert.deepEqual(deOtra, inventada);
  });
});

describe('el alta de una llave lee la ficha propia con la credencial de la persona', () => {
  const pedirAlta = (ruta = '/api/app-asistentes/llaves/desafio', usuario = USUARIO) =>
    pedir('POST', ruta, {}, { usuario });
  const lecturaDeLaFicha = () =>
    llamadas.find((l) => l.clave === 'GET /rest/v1/usuarios' && l.url.includes('email'));

  beforeEach(() => olvidarPedidos());

  it('el nombre y el correo salen de la fila propia, pedida con la credencial de quien entró', async () => {
    const { estado, cuerpo } = await pedirAlta();
    assert.equal(estado, 200);
    assert.equal(cuerpo.user.name, 'ana@ejemplo.com');
    assert.equal(cuerpo.user.displayName, 'Ana Prueba');

    const ficha = lecturaDeLaFicha();
    assert.ok(ficha, 'no se leyó la ficha propia');
    assert.equal(ficha.autorizacion, sesionDePrueba(USUARIO));
    assert.equal(ficha.credencial.maestra, false);
    assert.ok(ficha.url.includes(`id=eq.${USUARIO}`));
  });

  it('ninguna lectura de `usuarios` va con la maestra', async () => {
    await pedirAlta();
    const conLaMaestra = llamadas.filter((l) => l.clave === 'GET /rest/v1/usuarios' && l.credencial.maestra);
    assert.deepEqual(conLaMaestra, []);
  });

  it('lo mismo desde la aplicación de Familias', async () => {
    const { estado, cuerpo } = await pedirAlta('/api/app-familias/llaves/desafio', FAMILIAR);
    assert.equal(estado, 200);
    assert.equal(cuerpo.user.name, 'carla@ejemplo.com');

    const ficha = lecturaDeLaFicha();
    assert.equal(ficha.autorizacion, sesionDePrueba(FAMILIAR));
    assert.ok(ficha.url.includes(`id=eq.${FAMILIAR}`));

    const guardado = llamadas.find((l) => l.clave === 'POST /rest/v1/desafios_de_llave');
    assert.equal(guardado.cuerpo.rol, 'familia');
    assert.equal(guardado.cuerpo.usuario_id, FAMILIAR);
    assert.equal(guardado.cuerpo.prestadora_id, PRESTADORA);
  });

  it('si la base no le devuelve la ficha propia, no se emite ningún desafío', async () => {
    respuestas.set('GET /rest/v1/usuarios', ({ url }) =>
      url.includes('email') ? [] : filasQuePasanLosFiltros(url, [
        { id: USUARIO, rol: 'asistente', prestadora_id: PRESTADORA },
      ])
    );
    const { estado, cuerpo } = await pedirAlta();
    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'faltan_datos');
    assert.equal(llamadas.filter((l) => l.clave === 'POST /rest/v1/desafios_de_llave').length, 0);
  });

  it('no ofrece como nuevas las llaves que la persona ya tiene, y sólo ésas', async () => {
    const { cuerpo } = await pedirAlta();
    assert.deepEqual(
      cuerpo.excludeCredentials.map((c) => c.id),
      [CREDENCIAL_VIVA]
    );
  });

  it('las llaves y los desafíos van con la credencial de la persona, filtrados por ella y su Prestadora', async () => {
    await pedirAlta();
    await misLlaves();
    const deLlaves = llamadas.filter((l) =>
      ['GET /rest/v1/llaves_de_dispositivo', 'POST /rest/v1/desafios_de_llave'].includes(l.clave)
    );
    assert.ok(deLlaves.length >= 3);
    for (const llamada of deLlaves) {
      assert.equal(llamada.credencial.maestra, false, llamada.clave);
      assert.equal(llamada.autorizacion, sesionDePrueba(USUARIO), llamada.clave);
    }
    for (const lectura of deLlaves.filter((l) => l.clave.startsWith('GET '))) {
      assert.ok(lectura.url.includes(`prestadora_id=eq.${PRESTADORA}`));
      assert.ok(lectura.url.includes(`usuario_id=eq.${USUARIO}`));
    }
  });
});

describe('sin sesión no se administra nada', () => {
  it('listar las llaves propias pide sesión', async () => {
    respuestas.set('GET /auth/v1/user', { __estado: 401, __cuerpo: { message: 'sin token' } });
    const { estado } = await misLlaves();
    assert.equal(estado, 401);
  });

  it('y un rol que no es el de la aplicación tampoco entra', async () => {
    respuestas.set('GET /rest/v1/usuarios', [{ rol: 'familia', prestadora_id: PRESTADORA }]);
    const { estado } = await misLlaves();
    assert.equal(estado, 403);
  });
});
