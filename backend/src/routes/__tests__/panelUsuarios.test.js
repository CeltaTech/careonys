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
let rolDeQuienLlama = 'admin_prestadora';
let choqueAlReactivar = null;
let conTurnosPorDelante = false;
let turnosQueTraban = [];
let asistenteExiste = true;
const ASISTENTE = '55555555-5555-4555-8555-555555555555';

const DESACTIVADA = {
  id: CUENTA,
  rol: 'coordinador',
  nombre: 'Desactivada inventada',
  email: 'desactivada@ejemplo.invalid',
  nombre_de_usuario: 'desactivada_demo',
  desactivada_en: '2027-01-01T10:00:00Z',
  motivo_de_la_desactivacion: 'Motivo inventado',
};
const RENGLON_DEL_HISTORIAL = {
  id: '44444444-4444-4444-8444-444444444444',
  usuario_id: QUIEN_LLAMA,
  accion: 'desactivacion_de_cuenta',
  detalle: { rol_anterior: 'coordinador' },
  created_at: '2027-01-01T10:00:00Z',
};

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
      const pideDesactivadas = url.searchParams.get('desactivada_en') === 'not.is.null';
      const rolPedido = (url.searchParams.get('rol') ?? '').replace('eq.', '');
      const fila = credencial?.role === 'trabajo_sin_persona'
        ? (!cuentaExiste ? null
          : pideDesactivadas ? { ...DESACTIVADA, rol: rolPedido }
            : { id: CUENTA, rol: 'coordinador', prestadora_id: PRESTADORA })
        : pideDesactivadas
          ? (cuentaExiste ? DESACTIVADA : null)
          : { id: QUIEN_LLAMA, rol: rolDeQuienLlama, prestadora_id: PRESTADORA };
      respuesta = unoSolo ? fila : (fila ? [fila] : []);
    }
    if (clave === 'GET /rest/v1/registro_actividad') respuesta = [RENGLON_DEL_HISTORIAL];
    if (clave === 'GET /rest/v1/asistentes') {
      const fila = credencial?.role === 'trabajo_sin_persona' && asistenteExiste ? { usuario_id: CUENTA } : null;
      respuesta = unoSolo ? fila : (fila ? [fila] : []);
    }
    if (clave === 'POST /rest/v1/rpc/turnos_que_traban_la_desactivacion') {
      respuesta = credencial?.role === 'trabajo_sin_persona' ? turnosQueTraban : [];
    }
    if (clave === 'POST /rest/v1/rpc/reactivar_la_cuenta') {
      if (choqueAlReactivar) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 'P0001', message: choqueAlReactivar }));
        return;
      }
      respuesta = cuentaExiste;
    }
    if (clave === 'PATCH /rest/v1/usuarios') respuesta = cuentaExiste ? [{ id: CUENTA }] : [];
    if (clave === 'POST /rest/v1/rpc/desactivar_la_cuenta') {
      if (conTurnosPorDelante) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 'P0001', message: 'desactivacion_con_turnos_por_delante' }));
        return;
      }
      respuesta = true;
    }
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
  rolDeQuienLlama = 'admin_prestadora';
  choqueAlReactivar = null;
  conTurnosPorDelante = false;
  turnosQueTraban = [];
  asistenteExiste = true;
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

  // Con turnos de guardia por delante la base no desactiva; el backend lo contesta con su motivo y
  // no anota ninguna baja. Lo que la base hace cumplir lo prueba `scripts/probar_desactivar_con_turnos.mjs`.
  it('una cuenta con turnos por delante no se da de baja', async () => {
    conTurnosPorDelante = true;
    const { estado, cuerpo } = await pedir('DELETE', `/${CUENTA}`, { motivo: 'Motivo inventado' });
    assert.equal(estado, 409);
    assert.equal(cuerpo.motivo, 'desactivacion_con_turnos_por_delante');
    assert.ok(!llamadas.some((l) => l.clave === 'POST /rest/v1/registro_actividad'),
      'quedó anotada una baja que no se hizo');
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

// Las cuentas desactivadas. Lo que la base hace cumplir —que nadie más que el Administrador vea la
// fila ni la reactive— lo prueba `scripts/probar_reactivar_cuentas.mjs` contra la base; acá se
// prueba el candado del backend, con la base contestando datos cargados: si el candado se
// abriera, la base de mentira le entregaría la cuenta a quien no corresponde.
describe('las cuentas desactivadas', () => {
  for (const rol of ['coordinador', 'superadmin']) {
    it(`un ${rol} no las lista, no las abre y no las reactiva`, async () => {
      rolDeQuienLlama = rol;
      const lista = await pedir('GET', '/desactivadas');
      const datos = await pedir('GET', `/desactivadas/${CUENTA}`);
      const reactivar = await pedir('POST', `/${CUENTA}/reactivar`);

      assert.equal(lista.estado, 403);
      assert.equal(datos.estado, 403);
      assert.equal(reactivar.estado, 403);
      assert.ok(!JSON.stringify([lista.cuerpo, datos.cuerpo]).includes('Desactivada inventada'),
        'la cuenta desactivada le llegó');
      assert.ok(!llamadas.some((l) => l.clave === 'POST /rest/v1/rpc/reactivar_la_cuenta'),
        'el pedido de reactivar llegó a la base');
      assert.ok(!llamadas.some((l) => l.url.searchParams.get('desactivada_en') === 'not.is.null'),
        'la consulta de desactivadas llegó a la base');
    });
  }

  it('el Administrador las lista con su propia credencial', async () => {
    const { estado, cuerpo } = await pedir('GET', '/desactivadas');
    assert.equal(estado, 200);
    assert.deepEqual(cuerpo.usuarios.map((u) => u.nombre), ['Desactivada inventada']);
    const lista = llamadas.find((l) => l.clave === 'GET /rest/v1/usuarios'
      && l.url.searchParams.get('desactivada_en') === 'not.is.null');
    assert.equal(leerCredencial(lista.credencial ?? '')?.sub, QUIEN_LLAMA, 'la lista fue con otra credencial');
    assert.equal(lista.url.searchParams.get('prestadora_id'), `eq.${PRESTADORA}`);
  });

  it('el Administrador abre una con sus datos y su historial', async () => {
    const { estado, cuerpo } = await pedir('GET', `/desactivadas/${CUENTA}`);
    assert.equal(estado, 200);
    assert.equal(cuerpo.cuenta.motivo_de_la_desactivacion, 'Motivo inventado');
    assert.deepEqual(cuerpo.historial.map((r) => r.accion), ['desactivacion_de_cuenta']);
    const historial = llamadas.find((l) => l.clave === 'GET /rest/v1/registro_actividad');
    assert.equal(leerCredencial(historial.credencial ?? '')?.sub, QUIEN_LLAMA);
    assert.equal(historial.url.searchParams.get('or'), `(registro_id.eq.${CUENTA},usuario_id.eq.${CUENTA})`);
  });

  it('una que no está desactivada o no es de la Prestadora no se abre', async () => {
    cuentaExiste = false;
    const { estado } = await pedir('GET', `/desactivadas/${CUENTA}`);
    assert.equal(estado, 404);
  });

  it('el Administrador la reactiva con su propia credencial', async () => {
    const { estado } = await pedir('POST', `/${CUENTA}/reactivar`);
    assert.equal(estado, 200);
    const reactivacion = llamadas.filter((l) => l.clave === 'POST /rest/v1/rpc/reactivar_la_cuenta');
    assert.equal(reactivacion.length, 1);
    assert.equal(leerCredencial(reactivacion[0].credencial ?? '')?.sub, QUIEN_LLAMA);
    assert.deepEqual(JSON.parse(reactivacion[0].cuerpo), { p_usuario: CUENTA });
  });

  it('si la base no la reactiva, se contesta como inexistente', async () => {
    cuentaExiste = false;
    const { estado } = await pedir('POST', `/${CUENTA}/reactivar`);
    assert.equal(estado, 404);
  });

  for (const motivo of ['reactivacion_usuario_en_uso', 'reactivacion_correo_en_uso']) {
    it(`un choque al reactivar sale como ${motivo}`, async () => {
      choqueAlReactivar = motivo;
      const { estado, cuerpo } = await pedir('POST', `/${CUENTA}/reactivar`);
      assert.equal(estado, 409);
      assert.equal(cuerpo.motivo, motivo);
    });
  }
});

// La baja de un Asistente, desde su Legajo. Lo que la base hace cumplir —qué turnos traban y que un
// Asistente desactivado no se elige— lo prueban `scripts/probar_desactivar_con_turnos.mjs` y
// `scripts/probar_asistente_desactivado.mjs`; acá, el candado, la Prestadora y la respuesta.
const PASADO_MANANA = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString().slice(0, 10);
const ANTEAYER = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString().slice(0, 10);
const POR_DELANTE = { tipo: 'guardia', id: 'g1', fecha: PASADO_MANANA, hora_inicio: '08:00:00', hora_fin: '16:00:00', checkin_at: null, cliente: 'Cliente inventado' };
const SIN_CERRAR = { tipo: 'guardia', id: 'g2', fecha: ANTEAYER, hora_inicio: '08:00:00', hora_fin: '16:00:00', checkin_at: null, cliente: 'Otro cliente inventado' };

describe('la baja de un Asistente', () => {
  const RUTA = `/asistentes/${ASISTENTE}/desactivar`;

  it('sin turnos sin terminar se desactiva su cuenta, con el trabajo de la Prestadora, y queda registrada', async () => {
    const { estado } = await pedir('POST', RUTA, { motivo: ' Motivo inventado ' });
    assert.equal(estado, 200);
    const busqueda = llamadas.find((l) => l.clave === 'GET /rest/v1/asistentes');
    conElTrabajoDeLaPrestadora(busqueda);
    assert.equal(busqueda.url.searchParams.get('id'), `eq.${ASISTENTE}`);
    assert.equal(busqueda.url.searchParams.get('prestadora_id'), `eq.${PRESTADORA}`);
    const desactivacion = llamadas.filter((l) => l.clave === 'POST /rest/v1/rpc/desactivar_la_cuenta');
    assert.equal(desactivacion.length, 1);
    conElTrabajoDeLaPrestadora(desactivacion[0]);
    assert.deepEqual(JSON.parse(desactivacion[0].cuerpo), { p_usuario: CUENTA, p_motivo: 'Motivo inventado' });
    const registro = llamadas.find((l) => l.clave === 'POST /rest/v1/registro_actividad');
    assert.ok(registro, 'la desactivación no quedó registrada');
    const fila = [].concat(JSON.parse(registro.cuerpo))[0];
    assert.equal(fila.accion, 'desactivacion_de_cuenta');
    assert.deepEqual(fila.detalle, { rol_anterior: 'asistente' });
  });

  it('con turnos por delante no se desactiva, y dice cuáles reasignar', async () => {
    conTurnosPorDelante = true;
    turnosQueTraban = [POR_DELANTE];
    const { estado, cuerpo } = await pedir('POST', RUTA, { motivo: 'Motivo inventado' });
    assert.equal(estado, 409);
    assert.equal(cuerpo.motivo, 'desactivacion_con_turnos_por_delante');
    assert.deepEqual(cuerpo.motivos, ['desactivacion_con_turnos_por_delante']);
    assert.deepEqual(cuerpo.turnos.map((t) => [t.id, t.motivo, t.cliente]),
      [['g1', 'desactivacion_con_turnos_por_delante', 'Cliente inventado']]);
    conElTrabajoDeLaPrestadora(llamadas.find((l) => l.clave === 'POST /rest/v1/rpc/turnos_que_traban_la_desactivacion'));
    assert.ok(!llamadas.some((l) => l.clave === 'POST /rest/v1/registro_actividad'), 'quedó anotada una baja que no se hizo');
  });

  it('con turnos terminados sin cerrar no se desactiva, y dice cuáles cerrar', async () => {
    conTurnosPorDelante = true;
    turnosQueTraban = [SIN_CERRAR];
    const { estado, cuerpo } = await pedir('POST', RUTA, { motivo: 'Motivo inventado' });
    assert.equal(estado, 409);
    assert.equal(cuerpo.motivo, 'desactivacion_con_turnos_sin_cerrar');
    assert.deepEqual(cuerpo.motivos, ['desactivacion_con_turnos_sin_cerrar']);
    assert.deepEqual(cuerpo.turnos.map((t) => [t.id, t.motivo]), [['g2', 'desactivacion_con_turnos_sin_cerrar']]);
    assert.ok(!llamadas.some((l) => l.clave === 'POST /rest/v1/registro_actividad'));
  });

  it('con los dos casos dice los dos motivos', async () => {
    conTurnosPorDelante = true;
    turnosQueTraban = [SIN_CERRAR, POR_DELANTE];
    const { estado, cuerpo } = await pedir('POST', RUTA, { motivo: 'Motivo inventado' });
    assert.equal(estado, 409);
    assert.deepEqual(cuerpo.motivos, ['desactivacion_con_turnos_por_delante', 'desactivacion_con_turnos_sin_cerrar']);
    assert.equal(cuerpo.turnos.length, 2);
  });

  it('un coordinador no desactiva a un Asistente', async () => {
    rolDeQuienLlama = 'coordinador';
    const { estado } = await pedir('POST', RUTA, { motivo: 'Motivo inventado' });
    assert.equal(estado, 403);
    assert.ok(!llamadas.some((l) => l.clave === 'POST /rest/v1/rpc/desactivar_la_cuenta'));
  });

  it('un Asistente de otra Prestadora o sin cuenta se contesta como inexistente', async () => {
    asistenteExiste = false;
    const { estado } = await pedir('POST', RUTA, { motivo: 'Motivo inventado' });
    assert.equal(estado, 404);
    assert.ok(!llamadas.some((l) => l.clave === 'POST /rest/v1/rpc/desactivar_la_cuenta'));
  });

  it('una baja sin motivo no llega a la base', async () => {
    const { estado } = await pedir('POST', RUTA, { motivo: '  ' });
    assert.equal(estado, 400);
    assert.ok(!llamadas.some((l) => l.clave === 'POST /rest/v1/rpc/desactivar_la_cuenta'));
  });

  it('el Administrador abre la cuenta desactivada de un Asistente con el trabajo de la Prestadora', async () => {
    const { estado, cuerpo } = await pedir('GET', `/desactivadas/${CUENTA}?rol=asistente`);
    assert.equal(estado, 200);
    assert.equal(cuerpo.cuenta.rol, 'asistente');
    const lectura = llamadas.find((l) => l.clave === 'GET /rest/v1/usuarios' && l.url.searchParams.get('id') === `eq.${CUENTA}`);
    conElTrabajoDeLaPrestadora(lectura);
    assert.equal(lectura.url.searchParams.get('rol'), 'eq.asistente');
  });

  it('un coordinador no abre la cuenta desactivada de un Asistente', async () => {
    rolDeQuienLlama = 'coordinador';
    const { estado } = await pedir('GET', `/desactivadas/${CUENTA}?rol=asistente`);
    assert.equal(estado, 403);
    assert.ok(!llamadas.some((l) => l.url.searchParams.get('desactivada_en') === 'not.is.null'));
  });
});

describe('qué hacer con cada turno que traba', async () => {
  const { motivoDelTurnoQueTraba } = await import('../../utils/cuentasPanel.js');
  const AHORA = new Date('2027-03-10T12:00:00');
  it('el que no empezó se reasigna', () => {
    assert.equal(motivoDelTurnoQueTraba({ tipo: 'guardia', fecha: '2027-03-11', hora_inicio: '08:00:00' }, AHORA),
      'desactivacion_con_turnos_por_delante');
  });
  it('el que ya pasó se cierra', () => {
    assert.equal(motivoDelTurnoQueTraba({ tipo: 'guardia', fecha: '2027-03-09', hora_inicio: '08:00:00' }, AHORA),
      'desactivacion_con_turnos_sin_cerrar');
  });
  it('el que tiene llegada registrada se cierra, aunque la hora de inicio no haya llegado', () => {
    assert.equal(motivoDelTurnoQueTraba({ tipo: 'guardia', fecha: '2027-03-10', hora_inicio: '13:00:00', checkin_at: '2027-03-10T11:50:00Z' }, AHORA),
      'desactivacion_con_turnos_sin_cerrar');
  });
  it('una serie vigente se reasigna', () => {
    assert.equal(motivoDelTurnoQueTraba({ tipo: 'serie', fecha: '2027-01-01', hora_inicio: '08:00:00' }, AHORA),
      'desactivacion_con_turnos_por_delante');
  });
});
