/**
 * La puerta por la que el Panel lee y escribe la información de salud.
 *
 *   npm test --prefix backend
 *
 * Los casos están escritos por el error que evitan:
 *
 *   1. QUE LA INFORMACIÓN SALGA SIN ANOTAR. Todo lo que pide el Panel llega a la base por las
 *      funciones que anotan, con la credencial de quien pide y con el origen que nombra la tabla.
 *   2. QUE UNA PRESTADORA ALCANCE LO DE OTRA. La base falsa contesta sólo lo de la Prestadora de la
 *      sesión, como la protección por fila: si la ruta llevara otra credencial, aparecería lo ajeno.
 *   3. QUE LA PANTALLA MANDE CUALQUIER COSA. Lo que no está en la lista de pasos no llega a la base.
 *   4. QUE EL ERROR DE LA BASE SALGA HACIA AFUERA. Sale el motivo, nunca el texto.
 *
 * Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';
import { respuestaDeSalud, traducirPedidoDeSalud } from '../../__tests__/saludEnLaBaseFalsa.js';

const PRESTADORA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTRA_PRESTADORA = '99999999-9999-4999-8999-999999999999';
const USUARIO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PACIENTE = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const PACIENTE_AJENO = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const respuestas = new Map();
let llamadas = [];
let credencialEnviada = null;

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => { crudo += parte; });
  req.on('end', () => {
    let clave = `${req.method} ${new URL(req.url, 'http://interno').pathname}`;
    let cuerpo = crudo ? JSON.parse(crudo) : null;
    let url = req.url;
    const credencial = req.headers.authorization;
    const deSalud = traducirPedidoDeSalud(clave, cuerpo);
    if (deSalud) ({ clave, url, cuerpo } = deSalud);
    llamadas.push({ clave, url, cuerpo, credencial, porLaFuncion: deSalud?.porLaFuncion, origen: deSalud?.origen });

    const preparada = respuestas.get(clave);
    let valor = typeof preparada === 'function' ? preparada({ cuerpo, url, credencial }) : preparada;
    // La protección por fila de mentira: con la credencial de quien pide, sólo lo de su Prestadora.
    if (Array.isArray(valor)) {
      valor = credencial === credencialEnviada
        ? valor.filter((f) => !Object.hasOwn(f, 'prestadora_id') || f.prestadora_id === PRESTADORA)
        : [];
    }
    if (deSalud) valor = respuestaDeSalud(deSalud, valor);
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

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

const { default: express } = await import('express');
await import('express-async-errors');
const { panelInformacionDeSaludRouter, pasosValidos } = await import('../panelInformacionDeSalud.js');

const app = express();
app.use(express.json());
app.use('/api/panel/informacion-de-salud', panelInformacionDeSaludRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const RAIZ = `http://127.0.0.1:${backend.address().port}`;

after(() => {
  backend.close();
  baseFalsa.close();
});

let rolDelUsuario = 'admin_prestadora';

async function pedir(tabla, pasos) {
  credencialEnviada = sesionDePrueba(USUARIO);
  const respuesta = await fetch(`${RAIZ}/api/panel/informacion-de-salud/${tabla}`, {
    method: 'POST',
    headers: { Authorization: credencialEnviada, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pasos }),
  });
  const texto = await respuesta.text();
  let cuerpo = null;
  try { cuerpo = JSON.parse(texto); } catch { cuerpo = texto; }
  return { estado: respuesta.status, cuerpo };
}

const delaFuncion = () => llamadas.filter((l) => l.porLaFuncion);

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  rolDelUsuario = 'admin_prestadora';
  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol: rolDelUsuario, prestadora_id: PRESTADORA }]);
  respuestas.set('POST /rest/v1/registro_actividad', () => []);
  respuestas.set('GET /rest/v1/reportes', () => [
    { id: 'r1', prestadora_id: PRESTADORA, paciente_id: PACIENTE, texto_libre: 'Durmió bien.' },
    { id: 'r2', prestadora_id: OTRA_PRESTADORA, paciente_id: PACIENTE_AJENO, texto_libre: 'Ajeno.' },
  ]);
  respuestas.set('GET /rest/v1/pacientes', () => [
    { id: PACIENTE, prestadora_id: PRESTADORA, persona: { nombre_visible: 'Elsa Puig' } },
    { id: PACIENTE_AJENO, prestadora_id: OTRA_PRESTADORA, persona: { nombre_visible: 'Otra' } },
  ]);
});

describe('la información de salud del Panel', () => {
  it('pasa por la función que anota, con la credencial de quien pide y el origen de la tabla', async () => {
    const { estado, cuerpo } = await pedir('reportes', [
      { m: 'select', a: ['id, texto_libre, pacientes(persona:personas!pacientes_persona_de_la_misma_prestadora(nombre_visible))'] },
      { m: 'order', a: ['created_at', { ascending: false }] },
      { m: 'limit', a: [50] },
    ]);
    assert.equal(estado, 200);
    assert.deepEqual(cuerpo.data.map((r) => [r.id, r.texto_libre, r.pacientes?.persona?.nombre_visible]), [
      ['r1', 'Durmió bien.', 'Elsa Puig'],
    ]);
    const [lectura] = delaFuncion();
    assert.equal(lectura.porLaFuncion, 'leer_informacion_de_salud');
    assert.equal(lectura.credencial, credencialEnviada);
    assert.equal(lectura.origen, 'POST /api/panel/informacion-de-salud/reportes');
    // Lo pegado también se lee con la credencial de quien pide.
    const pegado = llamadas.find((l) => l.clave === 'GET /rest/v1/pacientes');
    assert.equal(pegado.credencial, credencialEnviada);
  });

  it('nunca devuelve lo de otra Prestadora', async () => {
    const { cuerpo } = await pedir('reportes', [{ m: 'select', a: ['id, paciente_id'] }]);
    assert.deepEqual(cuerpo.data.map((r) => r.id), ['r1']);
  });

  it('cuenta sin filas', async () => {
    const { estado, cuerpo } = await pedir('reportes', [{ m: 'select', a: ['id', { count: 'exact', head: true }] }]);
    assert.equal(estado, 200);
    assert.equal(cuerpo.count, 1);
    assert.equal(cuerpo.data, null);
  });

  it('modifica por la función que anota', async () => {
    respuestas.set('PATCH /rest/v1/reportes', () => [{ id: 'r1', prestadora_id: PRESTADORA }]);
    const { estado } = await pedir('reportes', [{ m: 'update', a: [{ texto_libre: 'x' }] }, { m: 'eq', a: ['id', 'r1'] }]);
    assert.equal(estado, 200);
    assert.equal(delaFuncion()[0].porLaFuncion, 'modificar_informacion_de_salud');
  });

  it('una tabla que no es de salud no tiene puerta', async () => {
    const { estado } = await pedir('pacientes', [{ m: 'select', a: ['id'] }]);
    assert.equal(estado, 404);
    assert.equal(llamadas.filter((l) => l.clave.startsWith('GET /rest/v1/pacientes')).length, 0);
  });

  it('lo que no está en la lista no llega a la base', async () => {
    for (const pasos of [
      [{ m: 'delete' }],
      [{ m: 'select', a: ['id'] }, { m: 'rpc', a: ['x'] }],
      [{ m: 'select', a: ['id'] }, { m: 'eq', a: ['id; drop', 'x'] }],
      [{ m: 'select', a: ['id', { count: 'planned' }] }],
      [],
    ]) {
      llamadas = [];
      const { estado, cuerpo } = await pedir('reportes', pasos);
      assert.equal(estado, 400, JSON.stringify(pasos));
      assert.equal(cuerpo.motivo, 'faltan_datos');
      assert.equal(delaFuncion().length, 0);
    }
  });

  it('lo que la envoltura no sabe pegar se rechaza sin ir directo a la tabla', async () => {
    const { estado } = await pedir('reportes', [{ m: 'select', a: ['id, alertas(id)'] }]);
    assert.equal(estado, 400);
    assert.equal(llamadas.filter((l) => l.clave === 'GET /rest/v1/reportes' && !l.porLaFuncion).length, 0);
  });

  it('el error de la base sale como motivo, sin su texto', async () => {
    respuestas.set('GET /rest/v1/reportes', () => ({
      __estado: 403, __cuerpo: { code: '42501', message: 'permission denied for table reportes' },
    }));
    const { estado, cuerpo } = await pedir('reportes', [{ m: 'select', a: ['id'] }]);
    assert.equal(estado, 403);
    assert.deepEqual(cuerpo, { error: 'sin_permiso', motivo: 'sin_permiso' });
  });

  it('sin rol de Panel no entra', async () => {
    rolDelUsuario = 'asistente';
    const { estado } = await pedir('reportes', [{ m: 'select', a: ['id'] }]);
    assert.ok(estado === 401 || estado === 403);
    assert.equal(delaFuncion().length, 0);
  });
});

describe('pasosValidos', () => {
  it('acepta las consultas que arma el Panel', () => {
    assert.ok(pasosValidos([
      { m: 'select', a: ['id'] }, { m: 'eq', a: ['prestadora_id', 'x'] }, { m: 'is', a: ['atendida_at', null] },
      { m: 'in', a: ['paciente_id', ['a', 'b']] }, { m: 'gte', a: ['guardias.fecha', '2026-01-01'] },
      { m: 'not', a: ['x', 'is', null] }, { m: 'maybeSingle' },
    ]));
  });
});
