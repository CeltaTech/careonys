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
 * recorta columnas. Y sólo se busca al del turno de guardia en curso o la próxima.
 *
 * Qué daría con el sistema roto: con la consulta en la credencial de la persona o en cualquier
 * otra que no sea el trabajo de esta Prestadora, o con el teléfono viajando, las comprobaciones de abajo fallan. Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { after, afterEach, beforeEach, describe, it, mock } from 'node:test';
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
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    llamadas.push({ clave, url: req.url, autorizacion: req.headers.authorization, cuerpo: crudo ? JSON.parse(crudo) : null });

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
  respuestas.set('GET /rest/v1/prestadoras', [{ zona_horaria: 'America/Argentina/Buenos_Aires' }]);
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
    respuestas.set('GET /rest/v1/turnos_guardia', [
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
    respuestas.set('GET /rest/v1/turnos_guardia', [
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
    respuestas.set('GET /rest/v1/turnos_guardia', ({ url }) =>
      (url.includes('estado=eq.activa') ? [] : [{ id: 'g-2', estado: 'programada', asistente_id: ASISTENTE }]));

    const { cuerpo } = await pedir(`/pacientes/${PACIENTE}/asistente`);
    assert.equal(cuerpo.turnoGuardiaId, 'g-2');

    const consultas = llamadas.filter((l) => l.clave === 'GET /rest/v1/turnos_guardia').map((l) => l.url);
    assert.equal(consultas.length, 2, consultas.join('\n'));
    assert.ok(consultas[0].includes('estado=eq.activa'), consultas[0]);
    assert.ok(consultas[1].includes('estado=eq.programada') && consultas[1].includes('fecha=gte.'), consultas[1]);
  });

  it('sin guardia en curso ni próxima, no hay Asistente', async () => {
    respuestas.set('GET /rest/v1/turnos_guardia', []);

    const { cuerpo } = await pedir(`/pacientes/${PACIENTE}/asistente`);
    assert.equal(cuerpo.asistente, null);
    assert.equal(llamadas.filter((l) => l.clave === 'GET /rest/v1/asistentes').length, 0);
  });
});

// La base no le da al Cliente los datos del Paciente: no sabe si el titular le dio la
// ficha a quien pide. Esos datos los lee el trabajo de la Prestadora, y el domicilio se pide sólo para
// quien tiene la ficha.
describe('los datos del Paciente que ve el Cliente', () => {
  /** Las consultas a `pacientes` que piden los datos del Paciente. */
  const consultasDeLaFicha = () =>
    llamadas.filter((l) => l.clave === 'GET /rest/v1/pacientes' && decodeURIComponent(l.url).includes('persona:personas'));

  it('la lista se lee con el trabajo de la Prestadora, ni con la credencial de la persona ni con la llave maestra', async () => {
    const { estado } = await pedir('/pacientes');
    assert.equal(estado, 200);

    const consultas = consultasDeLaFicha();
    assert.equal(consultas.length, 1, 'no se consultaron los datos del Paciente');
    assert.notEqual(consultas[0].autorizacion, credencial, 'los datos salieron con la credencial de la persona');
    esElTrabajoDeLaPrestadora(consultas[0].autorizacion, 'los datos salieron con otra credencial');
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
    assert.equal(consultas.length, 1, 'no se consultaron los datos del Paciente');
    const url = decodeURIComponent(consultas[0].url);
    for (const parte of ['calle', 'numero', 'lat', 'lng']) {
      assert.ok(!url.includes(parte), `se pidió ${parte}: ${url}`);
    }
  });
});

describe('el día de hoy que ve el Cliente es el de la Prestadora, no el del reloj del servidor', () => {
  // A las 20 en hora universal del domingo 1 de marzo, en Kiritimati ya es el lunes 2 de marzo.
  beforeEach(() => {
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-03-01T20:00:00Z') });
    respuestas.set('GET /rest/v1/prestadoras', [{ zona_horaria: 'Pacific/Kiritimati' }]);
  });
  afterEach(() => mock.timers.reset());

  /** Que la zona de la Prestadora se haya leído con la sesión de quien pide. */
  function zonaLeidaConLaSesion() {
    const zona = llamadas.find((l) => l.clave === 'GET /rest/v1/prestadoras' && decodeURIComponent(l.url).includes('zona_horaria'));
    assert.ok(zona, 'no se leyó la zona de la Prestadora');
    assert.equal(zona.autorizacion, credencial, 'la zona se leyó con otra conexión');
  }

  it('la próxima guardia se busca desde el día de hoy de la Prestadora', async () => {
    respuestas.set('GET /rest/v1/turnos_guardia', ({ url }) =>
      (url.includes('estado=eq.activa') ? [] : [{ id: 'g-2', estado: 'programada', asistente_id: ASISTENTE }]));
    const { estado } = await pedir(`/pacientes/${PACIENTE}/asistente`);
    assert.equal(estado, 200);
    const proxima = llamadas.find((l) => l.clave === 'GET /rest/v1/turnos_guardia' && l.url.includes('estado=eq.programada'));
    assert.ok(proxima.url.includes('fecha=gte.2026-03-02'), proxima.url);
    zonaLeidaConLaSesion();
  });

  it('sin día pedido, la semana de guardias es la que contiene el día de hoy de la Prestadora', async () => {
    const { estado, cuerpo } = await pedir(`/pacientes/${PACIENTE}/turnos-guardia`);
    assert.equal(estado, 200);
    assert.equal(cuerpo.desde, '2026-03-02');
    zonaLeidaConLaSesion();
  });

  it('el domicilio de la lista de Pacientes es el del día de hoy de la Prestadora', async () => {
    respuestas.set('GET /rest/v1/pacientes', [
      { id: PACIENTE, cliente_id: CLIENTE, prestadora_id: PRESTADORA, persona: { nombre_visible: 'Persona Inventada', calle: 'Calle Inventada' } },
    ]);
    const { estado } = await pedir('/pacientes');
    assert.equal(estado, 200);
    const domicilio = llamadas.find((l) => l.clave === 'POST /rest/v1/rpc/domicilios_de_pacientes_en');
    assert.ok(domicilio, 'no se preguntó el domicilio');
    assert.equal(domicilio.cuerpo.p_fecha, '2026-03-02');
    zonaLeidaConLaSesion();
  });

  it('sin la zona de la Prestadora no muestra la próxima guardia y avisa', async () => {
    respuestas.set('GET /rest/v1/prestadoras', [{ zona_horaria: null }]);
    const { estado, cuerpo } = await pedir(`/pacientes/${PACIENTE}/asistente`);
    assert.equal(estado, 500);
    assert.equal(cuerpo.error, 'falla_del_sistema');
    assert.equal(llamadas.some((l) => l.clave === 'GET /rest/v1/turnos_guardia'), false);
  });
});
