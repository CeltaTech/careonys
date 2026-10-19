/**
 * Las cuentas de coordinación del Panel: con qué credencial se dan de alta, se corrigen y se dan
 * de baja, y que el alta lleve su nombre de usuario.
 *
 *   node --test src/routes/__tests__/panelUsuarios.test.js
 *
 * Corregir una cuenta y buscar la que se va a dar de baja va con el trabajo de la Prestadora activa
 * de quien pide, que alcanza las cuentas de esa Prestadora y ninguna otra.
 *
 * Se levanta el router de verdad contra una base de mentira que contesta por HTTP como la de
 * verdad: además del resultado se mira con qué credencial se le pidió cada cosa. Con el sistema
 * roto —otra credencial u otra Prestadora— las pruebas dan al revés.
 *
 * Datos inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-1111-4111-8111-111111111111';
const QUIEN_LLAMA = '22222222-2222-4222-8222-222222222222';
const CUENTA = '33333333-3333-4333-8333-333333333333';

let llamadas = [];
let cuentaExiste = true;

function leerCredencial(autorizacion) {
  try {
    return JSON.parse(Buffer.from(autorizacion.replace('Bearer ', '').split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const url = new URL(req.url, 'http://interno');
    const clave = `${req.method} ${url.pathname}`;
    const credencial = leerCredencial(req.headers.authorization ?? '');
    llamadas.push({ clave, url, cuerpo: crudo, credencial: req.headers.authorization });
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    let respuesta = unoSolo ? null : [];
    if (clave === 'GET /auth/v1/user') respuesta = { id: QUIEN_LLAMA, aud: 'authenticated' };
    if (clave === 'GET /rest/v1/usuarios') {
      const fila = credencial?.role === 'trabajo_sin_persona'
        ? (cuentaExiste ? { id: CUENTA, rol: 'coordinador', prestadora_id: PRESTADORA } : null)
        : { id: QUIEN_LLAMA, rol: 'admin_prestadora', prestadora_id: PRESTADORA };
      respuesta = unoSolo ? fila : (fila ? [fila] : []);
    }
    if (clave === 'PATCH /rest/v1/usuarios') respuesta = cuentaExiste ? [{ id: CUENTA }] : [];
    if (clave === 'POST /rest/v1/rpc/desactivar_la_cuenta') respuesta = true;
    if (clave === 'POST /rest/v1/rpc/deshacer_el_alta_de_la_cuenta') respuesta = true;
    if (clave === 'POST /rest/v1/rpc/dar_de_alta_la_cuenta') respuesta = CUENTA;
    if (clave === 'GET /rest/v1/configuracion_prestadora') {
      respuesta = unoSolo ? { dominio: 'demo' } : [{ dominio: 'demo' }];
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(respuesta));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

const { default: express } = await import('express');
await import('express-async-errors');
const { panelUsuariosRouter } = await import('../panelUsuarios.js');

const app = express();
app.use(express.json());
app.use('/api/panel/usuarios', panelUsuariosRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const RAIZ = `http://127.0.0.1:${backend.address().port}/api/panel/usuarios`;

after(() => {
  backend.close();
  baseFalsa.close();
});

beforeEach(() => {
  llamadas = [];
  cuentaExiste = true;
});

async function pedir(metodo, ruta, cuerpo) {
  const respuesta = await fetch(`${RAIZ}${ruta}`, {
    method: metodo,
    headers: { Authorization: sesionDePrueba(QUIEN_LLAMA), 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

function conElTrabajoDeLaPrestadora(llamada) {
  const credencial = leerCredencial(llamada.credencial ?? '');
  assert.equal(credencial?.role, 'trabajo_sin_persona', `${llamada.clave} fue con otra credencial`);
  assert.equal(credencial.prestadora_id, PRESTADORA, `${llamada.clave} fue fuera de la Prestadora`);
}

describe('las cuentas de coordinación del Panel', () => {
  it('la lista se lee con la credencial de quien pide y sin las cuentas del soporte técnico', async () => {
    const { estado } = await pedir('GET', '');
    assert.equal(estado, 200);
    const lista = llamadas.find((l) => l.clave === 'GET /rest/v1/usuarios' && l.url.searchParams.has('order'));
    assert.ok(lista, 'no se leyó la lista');
    assert.equal(leerCredencial(lista.credencial ?? '')?.sub, QUIEN_LLAMA, 'la lista fue con otra credencial');
    assert.equal(lista.url.searchParams.get('prestadora_id'), `eq.${PRESTADORA}`);
    assert.equal(lista.url.searchParams.get('rol'), 'in.(admin_prestadora,coordinador)');
    assert.equal(lista.url.searchParams.get('desactivada_en'), 'is.null', 'la lista muestra cuentas desactivadas');
  });

  it('una cuenta se corrige con el trabajo de la Prestadora, y sólo si es de coordinación', async () => {
    const { estado } = await pedir('PATCH', `/${CUENTA}`, { nombre: 'Nombre inventado' });
    assert.equal(estado, 200);
    const cambios = llamadas.filter((l) => l.clave === 'PATCH /rest/v1/usuarios');
    assert.equal(cambios.length, 1);
    conElTrabajoDeLaPrestadora(cambios[0]);
    assert.equal(cambios[0].url.searchParams.get('id'), `eq.${CUENTA}`);
    assert.equal(cambios[0].url.searchParams.get('rol'), 'in.(coordinador)');
  });

  it('una cuenta que la Prestadora no alcanza se contesta como inexistente', async () => {
    cuentaExiste = false;
    const { estado } = await pedir('PATCH', `/${CUENTA}`, { nombre: 'Nombre inventado' });
    assert.equal(estado, 404);
  });

  it('la cuenta a dar de baja se busca con el trabajo de la Prestadora', async () => {
    const { estado } = await pedir('DELETE', `/${CUENTA}`, { motivo: 'Motivo inventado' });
    assert.equal(estado, 200);
    const busqueda = llamadas.find((l) => l.clave === 'GET /rest/v1/usuarios' && l.url.searchParams.get('id') === `eq.${CUENTA}`);
    assert.ok(busqueda, 'no se buscó la cuenta');
    conElTrabajoDeLaPrestadora(busqueda);
    assert.ok(llamadas.some((l) => l.clave === 'POST /rest/v1/rpc/desactivar_la_cuenta'));
  });

  it('el alta lleva el nombre de usuario a la base, con el trabajo de la Prestadora', async () => {
    const { estado, cuerpo } = await pedir('POST', '', {
      email: 'inventada@ejemplo.com', nombre: 'Nombre inventado', usuario: 'Juana.Inventada',
    });
    assert.equal(estado, 200);
    assert.equal(cuerpo.usuario, 'juana.inventada_demo');
    const alta = llamadas.find((l) => l.clave === 'POST /rest/v1/rpc/dar_de_alta_la_cuenta');
    assert.ok(alta, 'no se dio de alta');
    conElTrabajoDeLaPrestadora(alta);
    assert.equal(JSON.parse(alta.cuerpo).p_nombre_de_usuario, 'juana.inventada');
  });

  it('un alta sin nombre de usuario no llega a la base', async () => {
    const { estado } = await pedir('POST', '', { email: 'inventada@ejemplo.com', nombre: 'Nombre inventado' });
    assert.equal(estado, 400);
    assert.ok(!llamadas.some((l) => l.clave === 'POST /rest/v1/rpc/dar_de_alta_la_cuenta'));
  });

  it('una cuenta que la Prestadora no alcanza no se da de baja', async () => {
    cuentaExiste = false;
    const { estado } = await pedir('DELETE', `/${CUENTA}`, { motivo: 'Motivo inventado' });
    assert.equal(estado, 400);
    assert.ok(!llamadas.some((l) => l.clave === 'POST /rest/v1/rpc/desactivar_la_cuenta'));
  });

  // UNA CUENTA NO SE BORRA. Si la baja vuelve a borrar, esta prueba falla.
  it('la baja desactiva la cuenta con su motivo y no la borra', async () => {
    const { estado } = await pedir('DELETE', `/${CUENTA}`, { motivo: '  Motivo inventado  ' });
    assert.equal(estado, 200);

    const desactivacion = llamadas.filter((l) => l.clave === 'POST /rest/v1/rpc/desactivar_la_cuenta');
    assert.equal(desactivacion.length, 1);
    conElTrabajoDeLaPrestadora(desactivacion[0]);
    assert.deepEqual(JSON.parse(desactivacion[0].cuerpo), { p_usuario: CUENTA, p_motivo: 'Motivo inventado' });

    const borrados = llamadas.filter((l) => l.clave === 'POST /rest/v1/rpc/deshacer_el_alta_de_la_cuenta'
      || l.clave === 'POST /rest/v1/rpc/dar_de_baja_la_cuenta'
      || l.clave.startsWith('DELETE ')
      || l.clave.startsWith('POST /auth/') || l.clave.startsWith('DELETE /auth/'));
    assert.deepEqual(borrados.map((l) => l.clave), []);

    const registro = llamadas.find((l) => l.clave === 'POST /rest/v1/registro_actividad');
    assert.ok(registro, 'la desactivación no quedó registrada');
    const fila = [].concat(JSON.parse(registro.cuerpo))[0];
    assert.equal(fila.accion, 'desactivacion_de_cuenta');
    assert.ok(!JSON.stringify(fila).includes('Motivo inventado'), 'el motivo entró en el registro');
  });

  it('una baja sin motivo no llega a la base', async () => {
    for (const cuerpo of [undefined, {}, { motivo: '   ' }]) {
      llamadas = [];
      const { estado } = await pedir('DELETE', `/${CUENTA}`, cuerpo);
      assert.equal(estado, 400);
      assert.ok(!llamadas.some((l) => l.clave.startsWith('POST /rest/v1/rpc/')));
    }
  });
});
