/**
 * Los derechos de la persona: las solicitudes en el Panel, la bajada de los datos de una persona y,
 * en la aplicación del Cliente, la bajada de los propios y quién accedió a la información de salud.
 *
 *   npm test --prefix backend
 *
 * La base es de mentira y contesta por HTTP como la de verdad. Lo que se sostiene: todo va con la
 * credencial de quien pide; el registro clínico se lee por la función que anota la lectura, nunca
 * directo de la tabla; la bajada queda en el registro de actividad, y si no se pudo anotar no se
 * entrega nada. La protección por fila y el cálculo del vencimiento no los ve esta prueba: los hace
 * la base. Datos inventados, como manda CLAUDE.md §6.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';
import { traducirPedidoDeSalud, respuestaDeSalud } from '../../__tests__/saludEnLaBaseFalsa.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const USUARIO = '22222222-2222-2222-2222-222222222222';
const PERSONA = '33333333-3333-4333-8333-333333333333';
const PACIENTE = '44444444-4444-4444-8444-444444444444';
const CLIENTE = '55555555-5555-4555-8555-555555555555';
const SOLICITUD = '66666666-6666-4666-8666-666666666666';
const PERSONA_PACIENTE = '77777777-7777-4777-8777-777777777777';

const respuestas = new Map();
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => { crudo += parte; });
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    let clave = `${req.method} ${ruta}`;
    const cuerpo = crudo ? JSON.parse(crudo) : null;
    const salud = traducirPedidoDeSalud(clave, cuerpo);
    if (salud) clave = salud.clave;
    llamadas.push({
      clave, url: decodeURIComponent(salud?.url ?? req.url), credencial: req.headers.authorization,
      cuerpo, porLaFuncion: salud?.porLaFuncion ?? null,
    });

    const preparada = respuestas.get(clave);
    let valor = typeof preparada === 'function' ? preparada(cuerpo) : preparada ?? [];
    if (valor?.__estado) {
      res.writeHead(valor.__estado, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(valor.cuerpo));
      return;
    }
    if (salud) valor = respuestaDeSalud(salud, valor);
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? valor[0] ?? null : valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;

const { default: express } = await import('express');
await import('express-async-errors');
const { panelDerechosDeLaPersonaRouter } = await import('../panelDerechosDeLaPersona.js');
const { appClientesDerechosRouter } = await import('../appClientesDerechos.js');

const app = express();
app.use(express.json());
app.use('/api/panel/derechos-de-la-persona', panelDerechosDeLaPersonaRouter);
app.use('/api/app-clientes/derechos', appClientesDerechosRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api`;

const errorDeVerdad = console.error;
console.error = () => {};

after(() => {
  console.error = errorDeVerdad;
  backend.close();
  baseFalsa.close();
});

let rol = 'admin_prestadora';

beforeEach(() => {
  llamadas = [];
  rol = 'admin_prestadora';
  respuestas.clear();
  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol, prestadora_id: PRESTADORA, desactivada_en: null }]);
  respuestas.set('POST /rest/v1/registro_actividad', () => []);
  respuestas.set('POST /rest/v1/consultas_a_hce', () => []);
  respuestas.set('GET /rest/v1/personas', () => [{ id: PERSONA, prestadora_id: PRESTADORA, nombre: 'Ana', apellido: 'Inventada' }]);
  respuestas.set('GET /rest/v1/pacientes', () => [{ id: PACIENTE, persona_id: PERSONA, prestadora_id: PRESTADORA }]);
  respuestas.set('GET /rest/v1/clientes', () => [{ id: CLIENTE, contratante_persona_id: PERSONA, prestadora_id: PRESTADORA }]);
  respuestas.set('GET /rest/v1/personas_autorizadas', () => []);
  respuestas.set('GET /rest/v1/versiones_registro_clinico', () => [{ id: 'v1', paciente_id: PACIENTE, prestadora_id: PRESTADORA }]);
});

async function pedir(ruta, { metodo = 'GET', cuerpo } = {}) {
  const respuesta = await fetch(`${DIRECCION}${ruta}`, {
    method: metodo,
    headers: { Authorization: sesionDePrueba(USUARIO), 'Content-Type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { estado: respuesta.status, encabezados: respuesta.headers, cuerpo: await respuesta.json() };
}

const llamadasA = (clave) => llamadas.filter((l) => l.clave === clave);

describe('las solicitudes en el Panel', () => {
  it('cargar una solicitud la manda con su Prestadora y con la credencial de quien pide', async () => {
    respuestas.set('POST /rest/v1/solicitudes_de_derechos', (fila) => [{ id: SOLICITUD, ...fila, estado: 'pendiente' }]);
    const { estado, cuerpo } = await pedir('/panel/derechos-de-la-persona', {
      metodo: 'POST', cuerpo: { persona_id: PERSONA, tipo: 'acceso' },
    });
    assert.equal(estado, 201, JSON.stringify(cuerpo));
    const [alta] = llamadasA('POST /rest/v1/solicitudes_de_derechos');
    assert.equal(alta.cuerpo.prestadora_id, PRESTADORA);
    assert.equal(alta.cuerpo.vence_en, undefined, 'el vencimiento lo calcula la base');
    assert.equal(alta.credencial, sesionDePrueba(USUARIO));
  });

  it('un derecho que no existe no llega a la base', async () => {
    const { estado } = await pedir('/panel/derechos-de-la-persona', {
      metodo: 'POST', cuerpo: { persona_id: PERSONA, tipo: 'inventado' },
    });
    assert.equal(estado, 400);
    assert.equal(llamadasA('POST /rest/v1/solicitudes_de_derechos').length, 0);
  });

  it('quien coordina no entra', async () => {
    rol = 'coordinador';
    const { estado } = await pedir('/panel/derechos-de-la-persona');
    assert.equal(estado, 403);
    assert.equal(llamadasA('GET /rest/v1/solicitudes_de_derechos').length, 0);
  });

  it('marcar respondida sólo cambia el estado; una que no está da no encontrada', async () => {
    respuestas.set('PATCH /rest/v1/solicitudes_de_derechos', () => []);
    const { estado } = await pedir(`/panel/derechos-de-la-persona/${SOLICITUD}/respondida`, { metodo: 'POST' });
    assert.equal(estado, 404);
    assert.deepEqual(llamadasA('PATCH /rest/v1/solicitudes_de_derechos')[0].cuerpo, { estado: 'respondida' });
  });

  it('la bajada de los datos lee el registro clínico por la función que anota la lectura y queda en el registro de actividad', async () => {
    const { estado, encabezados, cuerpo } = await pedir(`/panel/derechos-de-la-persona/personas/${PERSONA}/exportacion`);
    assert.equal(estado, 200, JSON.stringify(cuerpo));
    assert.match(encabezados.get('content-disposition'), /attachment/);
    assert.equal(cuerpo.versiones_registro_clinico.length, 1);
    const [lectura] = llamadasA('GET /rest/v1/versiones_registro_clinico');
    assert.equal(lectura.porLaFuncion, 'leer_informacion_de_salud');
    assert.equal(lectura.credencial, sesionDePrueba(USUARIO));
    const [renglon] = llamadasA('POST /rest/v1/registro_actividad');
    assert.equal(renglon.cuerpo.accion, 'exportacion');
    assert.equal(renglon.cuerpo.registro_id, PERSONA);
  });

  it('si la bajada no se pudo anotar, no se entrega nada', async () => {
    respuestas.set('POST /rest/v1/registro_actividad', () => ({ __estado: 500, cuerpo: { message: 'falla' } }));
    const { estado, cuerpo } = await pedir(`/panel/derechos-de-la-persona/personas/${PERSONA}/exportacion`);
    assert.notEqual(estado, 200);
    assert.equal(cuerpo.persona, undefined);
  });
});

describe('los derechos desde la aplicación del Cliente', () => {
  beforeEach(() => {
    rol = 'cliente';
    respuestas.set('GET /rest/v1/pacientes', (/* lectura */) => [
      { id: PACIENTE, persona_id: PERSONA_PACIENTE, cliente_id: CLIENTE, prestadora_id: PRESTADORA },
    ]);
  });

  it('el titular baja sus datos y los de los Pacientes de su Cliente, y queda anotado', async () => {
    const { estado, cuerpo } = await pedir('/app-clientes/derechos/mis-datos');
    assert.equal(estado, 200, JSON.stringify(cuerpo));
    assert.equal(cuerpo.persona.id, PERSONA);
    assert.equal(cuerpo.pacientes_del_cliente.length, 1);
    for (const l of llamadas.filter((x) => x.clave.startsWith('GET /rest/v1/'))) {
      assert.equal(l.credencial, sesionDePrueba(USUARIO), `${l.clave} no fue con la credencial de quien pide`);
    }
    assert.ok(llamadasA('GET /rest/v1/versiones_registro_clinico').every((l) => l.porLaFuncion === 'leer_informacion_de_salud'));
    assert.equal(llamadasA('POST /rest/v1/registro_actividad')[0].cuerpo.accion, 'exportacion');
  });

  it('quién accedió a la información de salud lo contesta la base con la credencial de quien pide', async () => {
    respuestas.set('POST /rest/v1/rpc/accesos_a_la_informacion_de_salud_del_paciente', () => [
      { momento: '2027-03-02T10:00:00Z', quien: 'Usuario inventado', rol: 'coordinador', origen: 'panel', categorias: ['reportes'] },
    ]);
    const { estado, cuerpo } = await pedir(`/app-clientes/derechos/pacientes/${PACIENTE}/accesos`);
    assert.equal(estado, 200, JSON.stringify(cuerpo));
    assert.equal(cuerpo.length, 1);
    const [llamada] = llamadasA('POST /rest/v1/rpc/accesos_a_la_informacion_de_salud_del_paciente');
    assert.deepEqual(llamada.cuerpo, { p_paciente: PACIENTE });
    assert.equal(llamada.credencial, sesionDePrueba(USUARIO));
  });

  it('un Paciente que la base no le contesta da no encontrado', async () => {
    respuestas.set('POST /rest/v1/rpc/accesos_a_la_informacion_de_salud_del_paciente', () => ({
      __estado: 400, cuerpo: { code: 'P0001', message: 'paciente_no_encontrado' },
    }));
    const { estado } = await pedir(`/app-clientes/derechos/pacientes/${PACIENTE}/accesos`);
    assert.equal(estado, 404);
  });
});
