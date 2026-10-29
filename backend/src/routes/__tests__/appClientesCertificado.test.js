/**
 * El Certificado de Aptitud que el Cliente ve del Asistente asignado.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. Una misma persona tiene un Legajo de Asistente por cada Prestadora donde
 * trabaja: si el identificador del Asistente se repitiera, el Cliente vería el Certificado de
 * otra Prestadora y la pantalla se vería igual de bien. No lo encuentra nadie mirando.
 *
 * La consulta sale con el trabajo de la Prestadora, que sólo alcanza a la suya, y con columnas
 * contadas: la base no le deja al Cliente leer Asistentes, porque la protección por fila no
 * recorta columnas. Y sólo se busca al de la guardia en curso o la próxima.
 *
 * Qué daría con el sistema roto: con la consulta en la credencial de la persona o en cualquier
 * otra que no sea el trabajo de esta Prestadora, o con el teléfono viajando, las comprobaciones de abajo fallan. Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USUARIO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CLIENTE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PACIENTE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const ASISTENTE = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

/** Qué contesta la base a cada `MÉTODO /ruta`. Cada prueba prepara lo suyo. */
const respuestas = new Map();
/** Todo lo que el backend le pidió a la base, con la dirección entera: los filtros van ahí. */
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  req.on('data', () => {});
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    llamadas.push({ clave, url: req.url, autorizacion: req.headers.authorization });

    const preparada = respuestas.get(clave);
    // Lo que esta prueba no prepara contesta vacío: acá se mira con qué filtros se consultó una
    // sola tabla, y hacer fallar el pedido entero por una consulta de al lado no probaría eso.
    const valor = typeof preparada === 'function' ? preparada({ url: req.url }) : preparada ?? [];

    // `.single()` y `.maybeSingle()` piden una fila sola con este encabezado.
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? valor[0] ?? null : valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
// El Asistente del Paciente lo lee el trabajo de la Prestadora.
prepararCredencialDePrueba();

// El import va después de dejar puestas las variables de entorno: la conexión a la base se arma
// en el momento en que se importa, y con la dirección que haya en ese instante.
const { default: express } = await import('express');
await import('express-async-errors');
const { appClientesRouter } = await import('../appClientes.js');

const app = express();
app.use(express.json());
app.use('/api/app-clientes', appClientesRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/app-clientes`;

after(() => {
  backend.close();
  baseFalsa.close();
});

/** La credencial de la persona de la prueba. */
let credencial;

/** Que la consulta haya salido con el trabajo de esta Prestadora, y con ninguna otra credencial. */
function esElTrabajoDeLaPrestadora(autorizacion, mensaje) {
  const contenido = JSON.parse(Buffer.from(String(autorizacion).replace(/^Bearer /, '').split('.')[1] ?? '', 'base64url').toString() || '{}');
  assert.equal(contenido.role, 'trabajo_sin_persona', mensaje);
  assert.equal(contenido.prestadora_id, PRESTADORA, mensaje);
}

async function pedir(ruta) {
  credencial = sesionDePrueba(USUARIO);
  const respuesta = await fetch(`${DIRECCION}${ruta}`, {
    headers: { Authorization: credencial },
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

beforeEach(() => {
  respuestas.clear();
  llamadas = [];

  respuestas.set('GET /auth/v1/user', { id: USUARIO });
  respuestas.set('GET /rest/v1/usuarios', [{ rol: 'cliente', prestadora_id: PRESTADORA }]);
  respuestas.set('GET /rest/v1/clientes', [{ id: CLIENTE }]);
  respuestas.set('GET /rest/v1/pacientes', [
    { id: PACIENTE, cliente_id: CLIENTE, prestadora_id: PRESTADORA, persona: { nombre_visible: 'Persona Inventada' } },
  ]);
  respuestas.set('GET /rest/v1/asistentes', [
    { id: ASISTENTE, nombre: 'Asistente Inventado', foto_url: null, tipo_asistente_id: null },
  ]);
  respuestas.set('GET /rest/v1/certificados', [
    { activo: true, fecha_vencimiento: '2027-01-01' },
  ]);
});

describe('el Asistente que ve el Cliente', () => {
  it('se lee con el trabajo de la Prestadora, ni con la credencial de la persona ni con la llave maestra', async () => {
    respuestas.set('GET /rest/v1/guardias', [
      { id: 'g-1', estado: 'activa', asistente_id: ASISTENTE },
    ]);

    const { estado } = await pedir(`/pacientes/${PACIENTE}/asistente`);
    assert.equal(estado, 200);

    for (const tabla of ['asistentes', 'certificados']) {
      const consultas = llamadas.filter((l) => l.clave === `GET /rest/v1/${tabla}`);
      assert.equal(consultas.length, 1, `no se consultó ${tabla}`);
      assert.notEqual(consultas[0].autorizacion, credencial, `${tabla} salió con la credencial de la persona`);
      esElTrabajoDeLaPrestadora(consultas[0].autorizacion, `${tabla} salió con otra credencial`);
      assert.ok(consultas[0].url.includes(ASISTENTE), consultas[0].url);
    }
  });

  it('del Asistente viajan el nombre y la foto, nada más', async () => {
    respuestas.set('GET /rest/v1/guardias', [
      { id: 'g-1', estado: 'activa', asistente_id: ASISTENTE },
    ]);
    respuestas.set('GET /rest/v1/asistentes', [
      { id: ASISTENTE, nombre: 'Asistente Inventado', foto_url: null, tipo_asistente_id: null, telefono: '000' },
    ]);

    const { cuerpo } = await pedir(`/pacientes/${PACIENTE}/asistente`);
    assert.deepEqual(cuerpo.asistente, { nombre: 'Asistente Inventado', foto_url: null });

    const consulta = llamadas.find((l) => l.clave === 'GET /rest/v1/asistentes');
    assert.ok(!consulta.url.includes('telefono') && !consulta.url.includes('domicilio'), consulta.url);
  });

  it('busca sólo la guardia en curso o una próxima', async () => {
    respuestas.set('GET /rest/v1/guardias', ({ url }) =>
      (url.includes('estado=eq.activa') ? [] : [{ id: 'g-2', estado: 'programada', asistente_id: ASISTENTE }]));

    const { cuerpo } = await pedir(`/pacientes/${PACIENTE}/asistente`);
    assert.equal(cuerpo.guardiaId, 'g-2');

    const consultas = llamadas.filter((l) => l.clave === 'GET /rest/v1/guardias').map((l) => l.url);
    assert.equal(consultas.length, 2, consultas.join('\n'));
    assert.ok(consultas[0].includes('estado=eq.activa'), consultas[0]);
    assert.ok(consultas[1].includes('estado=eq.programada') && consultas[1].includes('fecha=gte.'), consultas[1]);
  });

  it('sin guardia en curso ni próxima, no hay Asistente', async () => {
    respuestas.set('GET /rest/v1/guardias', []);

    const { cuerpo } = await pedir(`/pacientes/${PACIENTE}/asistente`);
    assert.equal(cuerpo.asistente, null);
    assert.equal(llamadas.filter((l) => l.clave === 'GET /rest/v1/asistentes').length, 0);
  });
});

// La base no le da al Cliente la Ficha de Persona del Paciente: no sabe si el titular le dio la
// ficha a quien pide. La Ficha la lee el trabajo de la Prestadora, y el domicilio se pide sólo para
// quien tiene la ficha.
describe('la ficha del Paciente que ve el Cliente', () => {
  /** Las consultas a `pacientes` que piden la Ficha de Persona. */
  const consultasDeLaFicha = () =>
    llamadas.filter((l) => l.clave === 'GET /rest/v1/pacientes' && decodeURIComponent(l.url).includes('persona:personas'));

  it('la lista se lee con el trabajo de la Prestadora, ni con la credencial de la persona ni con la llave maestra', async () => {
    const { estado } = await pedir('/pacientes');
    assert.equal(estado, 200);

    const consultas = consultasDeLaFicha();
    assert.equal(consultas.length, 1, 'no se consultó la Ficha');
    assert.notEqual(consultas[0].autorizacion, credencial, 'la Ficha salió con la credencial de la persona');
    esElTrabajoDeLaPrestadora(consultas[0].autorizacion, 'la Ficha salió con otra credencial');
    assert.ok(decodeURIComponent(consultas[0].url).includes('calle'), 'al titular no se le pidió el domicilio');
  });

  it('a la persona autorizada sin la ficha no se le pide el domicilio', async () => {
    // No es el titular: está anotada como persona autorizada y no tiene ningún acceso guardado.
    respuestas.set('GET /rest/v1/clientes', []);
    respuestas.set('GET /rest/v1/personas_autorizadas', [{ cliente_id: CLIENTE }]);
    respuestas.set('GET /rest/v1/permisos_personas_autorizadas', []);

    const { estado } = await pedir('/pacientes');
    assert.equal(estado, 200);

    const consultas = consultasDeLaFicha();
    assert.equal(consultas.length, 1, 'no se consultó la Ficha');
    const url = decodeURIComponent(consultas[0].url);
    for (const parte of ['calle', 'numero', 'lat', 'lng']) {
      assert.ok(!url.includes(parte), `se pidió ${parte}: ${url}`);
    }
  });
});
