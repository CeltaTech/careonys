/**
 * Dónde trabaja cada persona: los lugares que acepta cubrir una Asistente y hasta dónde llega una
 * coordinadora.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. Tapa tres agujeros: que se guarden lugares de otra Organización o se
 * borren los de una persona de otra; que cualquiera pueda cambiar hasta dónde llega una
 * coordinadora, que es cambiar qué ve; y que la ruta vuelva a la llave maestra. Todo se lee y se
 * escribe con la credencial del trabajo de la Prestadora sobre la que se está parado, y la prueba
 * arranca sin la llave maestra, así que una consulta que volviera a ella fallaría al pedirla.
 *
 * Se levanta el router de verdad contra una base de mentira y se mira qué contesta, qué escribe y
 * con qué credencial.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const USUARIO = '22222222-2222-2222-2222-222222222222';
const ASISTENTE = '33333333-3333-3333-3333-333333333333';
const COORDINADORA = '44444444-4444-4444-4444-444444444444';
const LUGAR = '55555555-5555-5555-5555-555555555555';
const OTRO_LUGAR = '66666666-6666-6666-6666-666666666666';
const ZONA = '77777777-7777-7777-7777-777777777777';

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
    llamadas.push({
      clave,
      filtros: direccion.searchParams,
      cuerpo: crudo ? JSON.parse(crudo) : null,
      credencial: req.headers.authorization,
    });

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
prepararCredencialDePrueba();

// El import va después de dejar puestas las variables de entorno: la conexión a la base se lee en
// el momento del import.
const { default: express } = await import('express');
await import('express-async-errors');
const { panelLugaresDeTrabajoRouter } = await import('../panelLugaresDeTrabajo.js');

const app = express();
app.use(express.json());
app.use('/api/panel/lugares-de-trabajo', panelLugaresDeTrabajoRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const RAIZ = `http://127.0.0.1:${backend.address().port}/api/panel`;

after(() => {
  backend.close();
  baseFalsa.close();
});

async function pedir(metodo, ruta, cuerpo) {
  const respuesta = await fetch(`${RAIZ}${ruta}`, {
    method: metodo,
    headers: { Authorization: sesionDePrueba(USUARIO), 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

/** Lo que el backend escribió en esa tabla, o `undefined` si no escribió nada. */
function loEscritoEn(tabla) {
  return llamadas.find((l) => l.clave === `POST /rest/v1/${tabla}`)?.cuerpo;
}

/** Lo que va en la credencial con la que se hizo esa llamada. */
function credencialDe(llamada) {
  return JSON.parse(Buffer.from(llamada.credencial.replace('Bearer ', '').split('.')[1], 'base64url').toString());
}

/** Que todo lo que se le pidió así a la base haya ido con el trabajo de esta Prestadora. */
function todoConElTrabajo(clave) {
  const hechas = llamadas.filter((l) => l.clave === clave);
  assert.ok(hechas.length, `no se llamó a ${clave}`);
  for (const llamada of hechas) {
    const credencial = credencialDe(llamada);
    assert.equal(credencial.role, 'trabajo_sin_persona', `${clave} fue con otra credencial`);
    assert.equal(credencial.prestadora_id, PRESTADORA, `${clave} fue fuera de la Prestadora`);
  }
}

/** Quién dice la base que es quien llama. Cambiarlo es cambiar de rol en la prueba. */
let quienLlama = { rol: 'admin_prestadora', prestadora_id: PRESTADORA };
/** Si la coordinadora cuyo alcance se cambia es de esta Organización. */
let coordinadoraEsDeAca = true;

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  quienLlama = { rol: 'admin_prestadora', prestadora_id: PRESTADORA };
  coordinadoraEsDeAca = true;
  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', (filtros) => {
    // La misma ruta contesta dos preguntas distintas: quién llama, y si existe la persona cuyo
    // alcance se está por cambiar.
    if (filtros.get('id') === `eq.${COORDINADORA}`) return coordinadoraEsDeAca ? [{ id: COORDINADORA }] : [];
    return [quienLlama];
  });
  respuestas.set('GET /rest/v1/prestadoras', () => [{ id: PRESTADORA, pais: 'AR' }]);
  respuestas.set('GET /rest/v1/lugares', () => []);
  respuestas.set('GET /rest/v1/asistentes', () => [{ id: ASISTENTE }]);
  respuestas.set('GET /rest/v1/zonas_cobertura', () => [{ id: ZONA }]);
  respuestas.set('GET /rest/v1/zona_lugares', () => []);
  respuestas.set('GET /rest/v1/asistente_lugares', () => []);
  respuestas.set('DELETE /rest/v1/asistente_lugares', () => []);
  respuestas.set('POST /rest/v1/asistente_lugares', () => []);
  respuestas.set('GET /rest/v1/usuario_lugares', () => []);
  respuestas.set('DELETE /rest/v1/usuario_lugares', () => []);
  respuestas.set('POST /rest/v1/usuario_lugares', () => []);
});

// ---------------------------------------------------------------------------------------

describe('dónde acepta trabajar una Asistente', () => {
  it('se guardan lugares, no zonas', async () => {
    const { estado } = await pedir('PUT', `/lugares-de-trabajo/asistente/${ASISTENTE}`, {
      lugares: [LUGAR, OTRO_LUGAR],
    });
    assert.equal(estado, 200);
    assert.deepEqual(loEscritoEn('asistente_lugares'), [
      { asistente_id: ASISTENTE, lugar_id: LUGAR, prestadora_id: PRESTADORA },
      { asistente_id: ASISTENTE, lugar_id: OTRO_LUGAR, prestadora_id: PRESTADORA },
    ]);
  });

  it('se comprueba, se borra y se escribe con el trabajo de esta Prestadora', async () => {
    await pedir('PUT', `/lugares-de-trabajo/asistente/${ASISTENTE}`, { lugares: [LUGAR] });
    for (const clave of ['GET /rest/v1/asistentes', 'DELETE /rest/v1/asistente_lugares', 'POST /rest/v1/asistente_lugares']) {
      todoConElTrabajo(clave);
    }
  });

  it('se leen con el trabajo de esta Prestadora', async () => {
    respuestas.set('GET /rest/v1/asistente_lugares', () => [{ lugar_id: LUGAR }]);
    const { estado, cuerpo } = await pedir('GET', `/lugares-de-trabajo/asistente/${ASISTENTE}`);
    assert.equal(estado, 200);
    assert.deepEqual(cuerpo.lugares, [LUGAR]);
    todoConElTrabajo('GET /rest/v1/asistente_lugares');
  });

  it('una Asistente de otra Organización no llega a borrar nada', async () => {
    respuestas.set('GET /rest/v1/asistentes', () => []);
    const { estado } = await pedir('PUT', `/lugares-de-trabajo/asistente/${ASISTENTE}`, { lugares: [LUGAR] });
    assert.equal(estado, 404);
    assert.equal(llamadas.some((l) => l.clave === 'DELETE /rest/v1/asistente_lugares'), false);
  });

  it('sin lista de lugares no se toca nada', async () => {
    const { estado } = await pedir('PUT', `/lugares-de-trabajo/asistente/${ASISTENTE}`, {});
    assert.equal(estado, 400);
    assert.equal(llamadas.some((l) => l.clave === 'DELETE /rest/v1/asistente_lugares'), false);
  });

  it('quien coordina puede cambiarlos', async () => {
    quienLlama = { rol: 'coordinador', prestadora_id: PRESTADORA };
    const { estado } = await pedir('PUT', `/lugares-de-trabajo/asistente/${ASISTENTE}`, { lugares: [LUGAR] });
    assert.equal(estado, 200);
  });
});

describe('hasta dónde llega una coordinadora', () => {
  it('la administración lo cambia, con el trabajo de esta Prestadora', async () => {
    const { estado } = await pedir('PUT', `/lugares-de-trabajo/usuario/${COORDINADORA}`, { lugares: [LUGAR] });
    assert.equal(estado, 200);
    assert.deepEqual(loEscritoEn('usuario_lugares'), [
      { usuario_id: COORDINADORA, lugar_id: LUGAR, prestadora_id: PRESTADORA },
    ]);
    for (const clave of ['DELETE /rest/v1/usuario_lugares', 'POST /rest/v1/usuario_lugares']) {
      todoConElTrabajo(clave);
    }
    const comprobacion = llamadas.find(
      (l) => l.clave === 'GET /rest/v1/usuarios' && l.filtros.get('id') === `eq.${COORDINADORA}`,
    );
    assert.equal(credencialDe(comprobacion).role, 'trabajo_sin_persona');
  });

  it('una persona de otra Organización no llega a borrar nada', async () => {
    coordinadoraEsDeAca = false;
    const { estado } = await pedir('PUT', `/lugares-de-trabajo/usuario/${COORDINADORA}`, { lugares: [LUGAR] });
    assert.equal(estado, 404);
    assert.equal(llamadas.some((l) => l.clave === 'DELETE /rest/v1/usuario_lugares'), false);
  });

  it('quien coordina no, porque eso es cambiar qué Asistentes ve', async () => {
    quienLlama = { rol: 'coordinador', prestadora_id: PRESTADORA };
    const { estado } = await pedir('PUT', `/lugares-de-trabajo/usuario/${COORDINADORA}`, { lugares: [LUGAR] });
    assert.equal(estado, 403);
    assert.equal(llamadas.some((l) => l.clave === 'DELETE /rest/v1/usuario_lugares'), false);
  });

  it('y tampoco los puede mirar', async () => {
    quienLlama = { rol: 'coordinador', prestadora_id: PRESTADORA };
    const { estado } = await pedir('GET', `/lugares-de-trabajo/usuario/${COORDINADORA}`);
    assert.equal(estado, 403);
    assert.equal(llamadas.some((l) => l.clave === 'GET /rest/v1/usuario_lugares'), false);
  });
});

describe('la lista para elegir', () => {
  it('trae los lugares y las zonas con lo que abarca cada una', async () => {
    respuestas.set('GET /rest/v1/lugares', () => [{ id: LUGAR, nombre: 'Villa Urquiza' }]);
    respuestas.set('GET /rest/v1/zonas_cobertura', () => [{ id: ZONA, nombre: 'Norte' }]);
    respuestas.set('GET /rest/v1/zona_lugares', () => [{ zona_id: ZONA, lugar_id: LUGAR }]);

    const { estado, cuerpo } = await pedir('GET', '/lugares-de-trabajo/catalogo');
    assert.equal(estado, 200);
    assert.deepEqual(cuerpo.lugares.map((l) => l.id), [LUGAR]);
    assert.deepEqual(cuerpo.zonas, [{ id: ZONA, nombre: 'Norte', lugares: [LUGAR] }]);
  });

  it('quien coordina la alcanza, porque elegir no es configurar', async () => {
    quienLlama = { rol: 'coordinador', prestadora_id: PRESTADORA };
    const { estado } = await pedir('GET', '/lugares-de-trabajo/catalogo');
    assert.equal(estado, 200);
  });

  it('se lee sólo la Organización sobre la que se está parado, con su trabajo', async () => {
    await pedir('GET', '/lugares-de-trabajo/catalogo');
    for (const tabla of ['lugares', 'zonas_cobertura', 'zona_lugares']) {
      const leido = llamadas.find((l) => l.clave === `GET /rest/v1/${tabla}`);
      assert.equal(leido.filtros.get('prestadora_id'), `eq.${PRESTADORA}`);
      todoConElTrabajo(`GET /rest/v1/${tabla}`);
    }
  });
});
