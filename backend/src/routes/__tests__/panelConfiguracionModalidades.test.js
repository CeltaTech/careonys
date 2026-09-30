/**
 * Apagar una modalidad de negocio que todavía tiene gente adentro.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. El casillero de Configuración > La Prestadora > Modalidades
 * contratadas se apagaba sin mirar nada. Apagarlo no es un ajuste de pantalla: la Prestadora
 * quedaba con Asistentes trabajando de una forma que su propia configuración ya no habilita, y
 * —en el Match— con Clientes pagando un acceso cuya pantalla de cobros acababa de
 * desaparecer del Panel. Nadie se enteraba hasta que algo fallaba más adelante, lejos del
 * casillero que lo causó.
 *
 * Lo que se prueba es el camino entero: se levanta el router de verdad contra una base de
 * mentira, se pide apagar la modalidad en cada situación y se mira qué contesta. En los casos
 * que se rechazan se comprueba, además, que **no haya escrito nada**: un rechazo que igual
 * apagó la modalidad no rechazó nada.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const USUARIO = '22222222-2222-2222-2222-222222222222';

/** Qué contesta la base a cada `MÉTODO /ruta`. Cada prueba prepara lo suyo. */
const respuestas = new Map();
/** Todo lo que el backend le pidió a la base, para poder afirmar que NO pidió algo. */
let llamadas = [];

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
      consulta: direccion.searchParams,
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
// en el momento en que se importa, y con la dirección que haya en ese instante.
const { default: express } = await import('express');
await import('express-async-errors');
const { panelConfiguracionRouter } = await import('../panelConfiguracion.js');

const app = express();
app.use(express.json());
app.use('/api/panel/configuracion', panelConfiguracionRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/panel/configuracion`;

after(() => {
  backend.close();
  baseFalsa.close();
});

async function apagar(modalidad, activa = false) {
  const respuesta = await fetch(`${DIRECCION}/modalidades/${modalidad}`, {
    method: 'PATCH',
    headers: { Authorization: sesionDePrueba(USUARIO), 'Content-Type': 'application/json' },
    body: JSON.stringify({ activa }),
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

/** Un Asistente cualquiera, de los que el backend sólo mira si hay o no hay. */
const UN_ASISTENTE = [{ id: '44444444-4444-4444-4444-444444444444' }];
/** Un acceso del Match, ídem. */
const UN_ACCESO = [{ id: '55555555-5555-5555-5555-555555555555' }];

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol: 'admin_prestadora', prestadora_id: PRESTADORA }]);
  // Por omisión no hay nada colgando de ninguna modalidad, y guardar sale bien.
  respuestas.set('GET /rest/v1/asistentes', () => []);
  respuestas.set('GET /rest/v1/accesos_match', () => []);
  respuestas.set('POST /rest/v1/prestadora_modalidades', () => []);
});

/** Que el rechazo haya sido de verdad: la modalidad quedó como estaba. */
function noApago() {
  const escrituras = llamadas.filter((l) => l.clave === 'POST /rest/v1/prestadora_modalidades');
  assert.deepEqual(escrituras, [], 'el backend apagó la modalidad igual, después de decir que no');
}

/**
 * Que el mensaje no describa la base (CLAUDE.md §6). Se mira el texto, no el motivo: el motivo
 * es un código que la pantalla traduce y nunca se muestra tal cual.
 */
function noFiltraLaBase(cuerpo) {
  const texto = String(cuerpo?.error ?? '');
  assert.doesNotMatch(
    texto,
    /accesos_match|prestadora_modalidades|deleted_at|canales|select|column|relation|PGRST/i,
    `el mensaje nombra algo de la base: ${texto}`
  );
}

// ---------------------------------------------------------------------------------------

describe('no se apaga una modalidad que todavía tiene gente adentro', () => {
  it('con Asistentes que trabajan de esa forma', async () => {
    respuestas.set('GET /rest/v1/asistentes', () => UN_ASISTENTE);
    const { estado, cuerpo } = await apagar('match');
    assert.equal(estado, 409);
    assert.equal(cuerpo.motivo, 'modalidad_con_asistentes');
    noApago();
    noFiltraLaBase(cuerpo);
  });

  it('con Clientes con el acceso vigente', async () => {
    respuestas.set('GET /rest/v1/accesos_match', () => UN_ACCESO);
    const { estado, cuerpo } = await apagar('match');
    assert.equal(estado, 409);
    assert.equal(cuerpo.motivo, 'modalidad_con_accesos');
    noApago();
    noFiltraLaBase(cuerpo);
  });

  it('con las dos cosas a la vez lo dice de una sola vez', async () => {
    // Si contestara sólo una, quien apaga resolvería eso, volvería a intentar y se encontraría
    // con el otro rechazo. Se dicen las dos juntas.
    respuestas.set('GET /rest/v1/asistentes', () => UN_ASISTENTE);
    respuestas.set('GET /rest/v1/accesos_match', () => UN_ACCESO);
    const { estado, cuerpo } = await apagar('match');
    assert.equal(estado, 409);
    assert.equal(cuerpo.motivo, 'modalidad_con_asistentes_y_accesos');
    noApago();
    noFiltraLaBase(cuerpo);
  });

  it('también en prestación directa, donde atan los Asistentes', async () => {
    respuestas.set('GET /rest/v1/asistentes', () => UN_ASISTENTE);
    const { estado, cuerpo } = await apagar('directa');
    assert.equal(estado, 409);
    assert.equal(cuerpo.motivo, 'modalidad_con_asistentes');
    noApago();
  });

  it('y en prestación directa no se pregunta por accesos, que no existen ahí', async () => {
    await apagar('directa');
    const preguntas = llamadas.map((l) => l.clave);
    assert.ok(!preguntas.includes('GET /rest/v1/accesos_match'));
  });
});

describe('cuando no hay nada colgando, se apaga', () => {
  it('contesta que sí y lo guarda', async () => {
    const { estado, cuerpo } = await apagar('match');
    assert.equal(estado, 200);
    assert.equal(cuerpo.ok, true);
    const escritura = llamadas.find((l) => l.clave === 'POST /rest/v1/prestadora_modalidades');
    assert.ok(escritura, 'dijo que apagó y no escribió nada');
    assert.equal(escritura.cuerpo.activa, false);
    assert.equal(escritura.cuerpo.prestadora_id, PRESTADORA);
  });

  it('pregunta acotando a la Prestadora de quien pide, con la llave maestra', async () => {
    // Con la credencial de la persona, la política restrictiva de `asistentes` esconde a los
    // importados que esperan conformidad, y la de `accesos_match` no alcanza a superadmin:
    // la comprobación dejaría de ver lo que ata la modalidad. Por eso pregunta con la maestra y
    // el filtro de la Prestadora escrito en la consulta.
    await apagar('match');
    for (const tabla of ['asistentes', 'accesos_match']) {
      const pregunta = llamadas.find((l) => l.clave === `GET /rest/v1/${tabla}`);
      assert.ok(pregunta, `apagó sin mirar ${tabla}`);
      assert.equal(pregunta.credencial, 'Bearer clave-de-mentira');
      assert.equal(pregunta.consulta.get('prestadora_id'), `eq.${PRESTADORA}`);
    }
  });
});

describe('superadmin también enciende y apaga', () => {
  beforeEach(() => {
    respuestas.set('GET /rest/v1/usuarios', () => [{ rol: 'superadmin', prestadora_id: PRESTADORA }]);
    respuestas.set('GET /rest/v1/configuracion_plataforma', () => [{ mfa_admin_obligatorio: false }]);
    respuestas.set('GET /rest/v1/permisos_de_acceso', () => []);
  });

  it('guarda en la Prestadora sobre la que trabaja', async () => {
    // La política de escritura de `prestadora_modalidades` sólo deja a admin_prestadora; la ruta
    // escribe con la maestra para que superadmin conserve lo que podía hacer.
    const { estado, cuerpo } = await apagar('match');
    assert.equal(estado, 200);
    assert.equal(cuerpo.ok, true);
    const escritura = llamadas.find((l) => l.clave === 'POST /rest/v1/prestadora_modalidades');
    assert.ok(escritura, 'superadmin no pudo guardar');
    assert.equal(escritura.credencial, 'Bearer clave-de-mentira');
    assert.equal(escritura.cuerpo.prestadora_id, PRESTADORA);
    assert.equal(escritura.cuerpo.activa, false);
  });

  it('y ve los accesos vigentes que impiden apagar el Match', async () => {
    respuestas.set('GET /rest/v1/accesos_match', () => UN_ACCESO);
    const { estado, cuerpo } = await apagar('match');
    assert.equal(estado, 409);
    assert.equal(cuerpo.motivo, 'modalidad_con_accesos');
    noApago();
  });
});

describe('encender no comprueba nada', () => {
  it('no hay nada que se rompa por encender una modalidad', async () => {
    // Y si se comprobara, se estaría trabando justo el camino de salida de una Prestadora que
    // quedó con la modalidad apagada y gente adentro.
    respuestas.set('GET /rest/v1/asistentes', () => UN_ASISTENTE);
    respuestas.set('GET /rest/v1/accesos_match', () => UN_ACCESO);
    const { estado, cuerpo } = await apagar('match', true);
    assert.equal(estado, 200);
    assert.equal(cuerpo.ok, true);
    const preguntas = llamadas.map((l) => l.clave);
    assert.ok(!preguntas.includes('GET /rest/v1/asistentes'));
  });
});

describe('si no se pudo comprobar, no se apaga', () => {
  it('deja la modalidad como está', async () => {
    // Falla cerrado (CLAUDE.md §5): apagarla sin haber mirado es justamente lo que esta
    // comprobación vino a impedir. La respuesta sin preparar hace que la base conteste error.
    respuestas.delete('GET /rest/v1/asistentes');
    const { estado, cuerpo } = await apagar('match');
    assert.equal(estado, 500);
    noApago();
    noFiltraLaBase(cuerpo);
  });
});
