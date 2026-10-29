/**
 * Pruebas de la mirada de la administración sobre dónde cobra un Asistente.
 *
 *   node --test "src/**\/__tests__/*.test.js"   (desde `backend/`)
 *
 * Se levanta el backend de verdad contra una base de mentira que contesta lo que cada prueba le
 * prepara, igual que las pruebas de los cobros. Así se comprueba el camino entero —permiso,
 * filtros, respuesta— y no una imitación.
 *
 * LAS DOS COSAS QUE ESTA PRUEBA CUIDA. La primera es el aislamiento: la ruta entra a la base con
 * la credencial de quien pide, y es la base la que separa una Prestadora de otra. Lo que se
 * sostiene acá es que cada consulta vaya de verdad con esa credencial; que la base la haga
 * cumplir lo prueba `scripts/probar_aislamiento.mjs` contra una base de verdad. La segunda es
 * que el número de cuenta no salga por ningún lado que no sea el cuerpo de la respuesta: ni en
 * la dirección, ni en el registro del servidor, ni en un mensaje de error.
 *
 * Qué darían con el sistema roto: volver a pedir cualquier tabla con la llave maestra deja roja
 * la prueba de la credencial; meter el número de cuenta en un mensaje de error deja rojas las
 * dos que lo persiguen.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';

// ---------------------------------------------------------------------------------------
// La base de mentira
// ---------------------------------------------------------------------------------------

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const USUARIO = '22222222-2222-2222-2222-222222222222';
const ASISTENTE = '33333333-3333-3333-3333-333333333333';

/** Inventado, como manda la regla: nunca datos de una persona real. */
const NUMERO_DE_CUENTA = '0000003100010000000001';

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
    const valor = typeof preparada === 'function' ? preparada(crudo ? JSON.parse(crudo) : null) : preparada;
    if (valor === undefined) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `la prueba no preparó respuesta para ${clave}` }));
      return;
    }

    // Una prueba puede pedir que la base conteste un error, que es como se imita una falla al
    // leer.
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

// El import va después de dejar puestas las variables de entorno: la conexión a la base se arma
// en el momento en que se importa, y con la dirección que haya en ese instante.
const { default: express } = await import('express');
await import('express-async-errors');
const { panelDatosBancariosRouter } = await import('../panelDatosBancarios.js');

const app = express();
app.use(express.json());
app.use('/api/panel/datos-bancarios', panelDatosBancariosRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/panel/datos-bancarios`;

after(() => {
  backend.close();
  baseFalsa.close();
});

async function pedir(ruta) {
  const respuesta = await fetch(`${DIRECCION}${ruta}`, {
    headers: { Authorization: sesionDePrueba(USUARIO) },
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

/** Lo que el backend escribió en el registro del servidor mientras corría lo de adentro. */
async function loQueQuedoEnElRegistro(hacer) {
  const original = console.error;
  const escrito = [];
  console.error = (...partes) => {
    escrito.push(partes.map((p) => (typeof p === 'string' ? p : JSON.stringify(p ?? null))).join(' '));
  };
  try {
    const salida = await hacer();
    return { salida, registro: escrito.join('\n') };
  } finally {
    console.error = original;
  }
}

const CUENTA_EN_LA_BASE = {
  pais: 'AR',
  identificador_clase: 'cbu',
  identificador: NUMERO_DE_CUENTA,
  banco: 'Banco de prueba',
  titular: 'Nombre Inventado',
  updated_at: '2026-09-10T12:00:00Z',
};

beforeEach(() => {
  llamadas = [];
  rolDelUsuario = 'admin_prestadora';
  permisoOtorgado = true;
  respuestas.clear();
  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol: rolDelUsuario, prestadora_id: PRESTADORA }]);
  respuestas.set('POST /rest/v1/rpc/tiene_permiso_la_sesion', () => permisoOtorgado);
  respuestas.set('GET /rest/v1/asistentes', () => [{ id: ASISTENTE, nombre: 'Nombre Inventado' }]);
  respuestas.set('GET /rest/v1/datos_bancarios_asistente', () => [CUENTA_EN_LA_BASE]);
  respuestas.set('GET /rest/v1/catalogo_identificadores_de_cuenta', () => [
    { pais: 'AR', codigo: 'cbu', sigla: 'CBU' },
  ]);
});

/** Todas las consultas de datos que el backend le hizo a la base. */
function consultasDeDatos() {
  return llamadas.filter((l) => l.clave.startsWith('GET /rest/v1/') && !l.clave.endsWith('/usuarios'));
}

// ---------------------------------------------------------------------------------------
// Quién entra
// ---------------------------------------------------------------------------------------

describe('quién puede mirar dónde cobra un Asistente', () => {
  it('sin el permiso habilitado no se llega a la base', async () => {
    permisoOtorgado = false;
    const { estado, cuerpo } = await pedir(`/${ASISTENTE}`);
    assert.equal(estado, 403);
    assert.equal(cuerpo.error, 'La Prestadora no habilitó esta acción');
    assert.deepEqual(consultasDeDatos(), []);
  });

  it('el permiso que se pregunta es el de los datos bancarios, y no otro', async () => {
    await pedir(`/${ASISTENTE}`);
    const pregunta = llamadas.find((l) => l.clave === 'POST /rest/v1/rpc/tiene_permiso_la_sesion');
    assert.equal(pregunta.cuerpo.p_accion, 'ver_datos_bancarios_asistente');
  });

  it('un Asistente de otra Prestadora no existe para esta sesión', async () => {
    respuestas.set('GET /rest/v1/asistentes', () => []);
    const { estado, cuerpo } = await pedir(`/${ASISTENTE}`);
    assert.equal(estado, 404);
    // Y no se llegó a pedir ninguna cuenta bancaria.
    assert.ok(!llamadas.some((l) => l.clave.endsWith('/datos_bancarios_asistente')));
    assert.ok(!JSON.stringify(cuerpo).includes(NUMERO_DE_CUENTA));
  });
});

// ---------------------------------------------------------------------------------------
// Lo que se ve
// ---------------------------------------------------------------------------------------

describe('lo que devuelve', () => {
  it('la cuenta cargada, con la sigla que le pone el catálogo de ese país', async () => {
    const { estado, cuerpo } = await pedir(`/${ASISTENTE}`);
    assert.equal(estado, 200);
    assert.equal(cuerpo.cuentas.length, 1);
    assert.deepEqual(cuerpo.cuentas[0], {
      pais: 'AR',
      clase: 'cbu',
      sigla: 'CBU',
      identificador: NUMERO_DE_CUENTA,
      banco: 'Banco de prueba',
      titular: 'Nombre Inventado',
      actualizado_en: '2026-09-10T12:00:00Z',
    });
  });

  it('un Asistente que todavía no informó nada devuelve la lista vacía, no un error', async () => {
    respuestas.set('GET /rest/v1/datos_bancarios_asistente', () => []);
    const { estado, cuerpo } = await pedir(`/${ASISTENTE}`);
    assert.equal(estado, 200);
    assert.deepEqual(cuerpo.cuentas, []);
    // Sin ninguna cuenta no hay país que consultar, así que el catálogo no se pide.
    assert.ok(!llamadas.some((l) => l.clave.endsWith('/catalogo_identificadores_de_cuenta')));
  });

  it('si el catálogo no tiene la sigla de ese país, se muestra la clase y no un hueco', async () => {
    respuestas.set('GET /rest/v1/catalogo_identificadores_de_cuenta', () => []);
    const { cuerpo } = await pedir(`/${ASISTENTE}`);
    assert.equal(cuerpo.cuentas[0].sigla, 'cbu');
  });
});

// ---------------------------------------------------------------------------------------
// Con quién entra a la base
// ---------------------------------------------------------------------------------------

describe('la credencial', () => {
  it('todo se pide con la credencial de quien llama, y nada con la llave maestra', async () => {
    rolDelUsuario = 'coordinador';
    const credencialDeQuienPide = sesionDePrueba(USUARIO);
    const { estado } = await pedir(`/${ASISTENTE}`);
    assert.equal(estado, 200);
    const consultas = consultasDeDatos();
    assert.equal(consultas.length, 3, 'no se hicieron las tres consultas que mirar');
    for (const consulta of consultas) {
      assert.equal(consulta.credencial, credencialDeQuienPide, `${consulta.clave} no fue con la credencial de quien pide`);
    }
  });

  it('ninguna Prestadora que venga en el pedido llega a la base', async () => {
    await pedir(`/${ASISTENTE}?prestadora_id=99999999-9999-9999-9999-999999999999`);
    for (const consulta of consultasDeDatos()) {
      assert.ok(!consulta.url.includes('99999999-9999-9999-9999-999999999999'));
    }
  });
});

// ---------------------------------------------------------------------------------------
// El número de cuenta
// ---------------------------------------------------------------------------------------

describe('el número de cuenta no sale por ningún lado que no sea la respuesta', () => {
  it('no viaja en ninguna dirección ni queda en el registro del servidor', async () => {
    const { salida, registro } = await loQueQuedoEnElRegistro(() => pedir(`/${ASISTENTE}`));
    assert.equal(salida.estado, 200);
    // Está donde tiene que estar.
    assert.equal(salida.cuerpo.cuentas[0].identificador, NUMERO_DE_CUENTA);
    // Y en ningún otro lado.
    for (const llamada of llamadas) {
      assert.ok(!llamada.url.includes(NUMERO_DE_CUENTA), `el número viajó en una dirección: ${llamada.url}`);
    }
    assert.ok(!registro.includes(NUMERO_DE_CUENTA), 'el número quedó escrito en el registro del servidor');
  });

  it('cuando algo falla, el aviso no lo nombra', async () => {
    respuestas.set('GET /rest/v1/catalogo_identificadores_de_cuenta', () => ({
      __estado: 500,
      __cuerpo: { message: 'relation "catalogo_identificadores_de_cuenta" does not exist' },
    }));
    const { salida, registro } = await loQueQuedoEnElRegistro(() => pedir(`/${ASISTENTE}`));
    assert.equal(salida.estado, 500);
    assert.ok(
      !JSON.stringify(salida.cuerpo).includes(NUMERO_DE_CUENTA),
      'el número de cuenta salió adentro de un mensaje de error',
    );
    assert.ok(
      !registro.includes(NUMERO_DE_CUENTA),
      'el número de cuenta quedó escrito en el registro del servidor',
    );
  });
});
