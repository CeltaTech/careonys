/**
 * El acceso de emergencia a la información de salud, el fin de la sesión y las descargas.
 *
 *   node --test backend/src/routes/__tests__/accesoDeEmergenciaYSalidas.test.js
 *
 * POR QUÉ EXISTE ESTA PRUEBA. Las tres cosas dejan constancia de algo que la Prestadora tiene que
 * poder reconstruir después, y ninguna se ve mirando la pantalla:
 *
 *   1. EL ACCESO DE EMERGENCIA LO ABRE LA BASE, con la sesión de quien pide. El backend no escribe
 *      un segundo renglón: la constancia la deja la misma operación que abre el acceso. Sin
 *      Paciente o sin motivo no llega a la base, y cada rechazo de la base vuelve como un código
 *      que la pantalla sabe leer.
 *   2. EL FIN DE LA SESIÓN QUEDA ANOTADO con su causa, a nombre de quien cerró, y una causa
 *      inventada no se anota.
 *   3. TODA DESCARGA QUE SALIÓ BIEN QUEDA ANOTADA, sin lo que viaja después del signo de pregunta;
 *      un pedido rechazado no se llevó nada y no deja renglón.
 *   4. LAS APLICACIONES RECIBEN EL CIERRE POR INACTIVIDAD DE SU PRESTADORA, y sin la fila no
 *      cierran.
 *
 * Qué daría con el sistema roto: si el backend volviera a anotar el acceso por su cuenta, aparece
 * un segundo renglón; si la causa dejara de validarse, la causa inventada deja renglón; si la
 * descarga anotara antes de responder, el pedido rechazado deja renglón.
 *
 * La base es de mentira y contesta por HTTP como la de verdad. Datos inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-1111-4111-8111-111111111111';
const CUENTA_PANEL = '22222222-2222-4222-8222-222222222222';
const CUENTA_ASISTENTE = '33333333-3333-4333-8333-333333333333';
const LEGAJO = '44444444-4444-4444-8444-444444444444';
const PACIENTE = '55555555-5555-4555-8555-555555555555';
const ACCESO = '66666666-6666-4666-8666-666666666666';

const respuestas = new Map();
let llamadas = [];
let quienEntra = CUENTA_PANEL;

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
    llamadas.push({ clave, url, cuerpo: crudo, credencial: leerCredencial(req.headers.authorization ?? '') });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada({ url }) : preparada;
    if (valor === undefined) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `la prueba no preparó respuesta para ${clave}` }));
      return;
    }
    if (valor?.errorDeLaBase) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(valor.errorDeLaBase));
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

// El import va después de dejar puestas las variables de entorno: la conexión a la base se arma
// en el momento en que se importa.
const { default: express } = await import('express');
await import('express-async-errors');
const { panelAccesoDeEmergenciaRouter, estadoDelError } = await import('../panelAccesoDeEmergencia.js');
const { appAsistentesCuentaSeguraRouter } = await import('../appAsistentesCuentaSegura.js');
const { anotarExportacion } = await import('../../utils/registroDeActividad.js');
const { cierrePorInactividadDelPedido } = await import('../../utils/cierrePorInactividadDelPedido.js');

const app = express();
app.use(express.json());
app.use('/emergencia', panelAccesoDeEmergenciaRouter);
app.use('/asistentes', appAsistentesCuentaSeguraRouter);
// Una descarga cualquiera, con una sesión de Panel ya resuelta: lo que se prueba es la anotación.
function sesionDelPanelYaResuelta(req, res, next) {
  req.usuarioPanel = { id: CUENTA_PANEL, prestadoraId: PRESTADORA };
  next();
}
app.get('/descarga', sesionDelPanelYaResuelta, anotarExportacion(), (req, res) => {
  if (req.query.rechazar) return res.status(403).json({ error: 'sin_permiso' });
  res.type('text/csv').send('columna\nvalor inventado\n');
});
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}`;

after(() => {
  backend.close();
  baseFalsa.close();
});

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  quienEntra = CUENTA_PANEL;
  respuestas.set('GET /auth/v1/user', () => ({ id: quienEntra, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => (quienEntra === CUENTA_PANEL
    ? [{ id: CUENTA_PANEL, rol: 'admin_prestadora', prestadora_id: PRESTADORA }]
    : [{ id: CUENTA_ASISTENTE, rol: 'asistente', prestadora_id: PRESTADORA, desactivada_en: null }]));
  respuestas.set('GET /rest/v1/asistentes', () => (quienEntra === CUENTA_ASISTENTE
    ? [{ id: LEGAJO, prestadora_id: PRESTADORA }]
    : []));
  respuestas.set('POST /rest/v1/registro_actividad', () => []);
  respuestas.set('POST /rest/v1/rpc/abrir_acceso_de_emergencia', () => [
    { id: ACCESO, hasta: '2026-11-17T13:00:00Z' },
  ]);
});

async function pedir(metodo, ruta, { cuenta = null, cuerpo } = {}) {
  if (cuenta) quienEntra = cuenta;
  const cabeceras = { 'Content-Type': 'application/json' };
  if (cuenta) cabeceras.Authorization = sesionDePrueba(cuenta);
  const respuesta = await fetch(`${DIRECCION}${ruta}`, {
    method: metodo,
    headers: cabeceras,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await respuesta.text();
  let datos = texto;
  try {
    datos = JSON.parse(texto);
  } catch {
    // La descarga no es JSON.
  }
  return { estado: respuesta.status, cuerpo: datos };
}

function renglones() {
  return llamadas.filter((l) => l.clave === 'POST /rest/v1/registro_actividad').map((l) => JSON.parse(l.cuerpo));
}

function llamadasALaFuncion() {
  return llamadas.filter((l) => l.clave === 'POST /rest/v1/rpc/abrir_acceso_de_emergencia');
}

// La anotación de la descarga sale después de la respuesta: se espera a que llegue a la base.
async function esperarRenglones(cuantos) {
  for (let i = 0; i < 50 && renglones().length < cuantos; i += 1) {
    await new Promise((listo) => setTimeout(listo, 10));
  }
  return renglones();
}

describe('el acceso de emergencia lo abre la base', () => {
  it('con Paciente y motivo, contesta el acceso y hasta cuándo vale', async () => {
    const { estado, cuerpo } = await pedir('POST', '/emergencia', {
      cuenta: CUENTA_PANEL,
      cuerpo: { pacienteId: PACIENTE, motivo: 'Motivo inventado para la prueba' },
    });
    assert.equal(estado, 201);
    assert.deepEqual(cuerpo, { id: ACCESO, hasta: '2026-11-17T13:00:00Z' });
  });

  it('llama a la base con la sesión de quien pide, y con el Paciente y el motivo', async () => {
    await pedir('POST', '/emergencia', {
      cuenta: CUENTA_PANEL,
      cuerpo: { pacienteId: PACIENTE, motivo: 'Motivo inventado para la prueba' },
    });
    const [llamada] = llamadasALaFuncion();
    assert.ok(llamada, 'no se llamó a la base');
    assert.equal(llamada.credencial?.role, 'authenticated');
    assert.equal(llamada.credencial?.sub, CUENTA_PANEL);
    assert.deepEqual(JSON.parse(llamada.cuerpo), { p_paciente: PACIENTE, p_motivo: 'Motivo inventado para la prueba' });
  });

  it('el backend no escribe un segundo renglón: la constancia la deja la base', async () => {
    await pedir('POST', '/emergencia', {
      cuenta: CUENTA_PANEL,
      cuerpo: { pacienteId: PACIENTE, motivo: 'Motivo inventado para la prueba' },
    });
    assert.equal(renglones().length, 0);
  });

  it('sin motivo, o con un Paciente que no es un identificador, no llega a la base', async () => {
    const sinMotivo = await pedir('POST', '/emergencia', { cuenta: CUENTA_PANEL, cuerpo: { pacienteId: PACIENTE, motivo: '   ' } });
    const sinPaciente = await pedir('POST', '/emergencia', { cuenta: CUENTA_PANEL, cuerpo: { pacienteId: 'cualquiera', motivo: 'Motivo' } });
    assert.equal(sinMotivo.estado, 400);
    assert.equal(sinPaciente.estado, 400);
    assert.equal(sinMotivo.cuerpo.motivo, 'faltan_datos');
    assert.equal(llamadasALaFuncion().length, 0);
  });

  it('sin sesión no entra nadie', async () => {
    const { estado } = await pedir('POST', '/emergencia', { cuerpo: { pacienteId: PACIENTE, motivo: 'Motivo' } });
    assert.equal(estado, 401);
    assert.equal(llamadasALaFuncion().length, 0);
  });

  it('cada rechazo de la base vuelve como un código que la pantalla sabe leer, sin el texto de la base', async () => {
    respuestas.set('POST /rest/v1/rpc/abrir_acceso_de_emergencia', () => ({
      errorDeLaBase: { code: 'P0001', message: 'ya_alcanza' },
    }));
    const yaAlcanza = await pedir('POST', '/emergencia', { cuenta: CUENTA_PANEL, cuerpo: { pacienteId: PACIENTE, motivo: 'Motivo' } });
    assert.equal(yaAlcanza.estado, 409);
    assert.deepEqual(yaAlcanza.cuerpo, { error: 'ya_alcanza', motivo: 'ya_alcanza' });

    respuestas.set('POST /rest/v1/rpc/abrir_acceso_de_emergencia', () => ({
      errorDeLaBase: { code: '42501', message: 'texto interno de la base' },
    }));
    const sinPermiso = await pedir('POST', '/emergencia', { cuenta: CUENTA_PANEL, cuerpo: { pacienteId: PACIENTE, motivo: 'Motivo' } });
    assert.equal(sinPermiso.estado, 403);
    assert.ok(!JSON.stringify(sinPermiso.cuerpo).includes('texto interno'));
  });

  it('la traducción de los errores de la base falla cerrada', () => {
    assert.deepEqual(estadoDelError({ code: '42501' }), { estado: 403, motivo: 'sin_permiso' });
    assert.deepEqual(estadoDelError({ code: 'P0002' }), { estado: 404, motivo: 'paciente_no_encontrado' });
    assert.deepEqual(estadoDelError({ code: 'P0001', message: 'ya_alcanza' }), { estado: 409, motivo: 'ya_alcanza' });
    assert.deepEqual(estadoDelError({ code: '23514' }), { estado: 400, motivo: 'faltan_datos' });
    // Un aviso de la base que no se reconoce no se toma por ningún permiso.
    assert.deepEqual(estadoDelError({ code: 'P0001', message: 'otra_cosa' }), { estado: 500, motivo: 'falla_del_sistema' });
    assert.deepEqual(estadoDelError(undefined), { estado: 500, motivo: 'falla_del_sistema' });
  });
});

describe('el fin de la sesión queda anotado', () => {
  it('con la causa, a nombre de quien cerró y en su Prestadora', async () => {
    const { estado } = await pedir('POST', '/asistentes/fin-de-sesion', { cuenta: CUENTA_ASISTENTE, cuerpo: { causa: 'por_inactividad' } });
    assert.equal(estado, 200);
    const [renglon] = renglones();
    assert.ok(renglon, 'no quedó renglón');
    assert.equal(renglon.accion, 'fin_de_sesion');
    assert.deepEqual(renglon.detalle, { causa: 'por_inactividad' });
    assert.equal(renglon.prestadora_id, PRESTADORA);
    assert.equal(renglon.usuario_id, CUENTA_ASISTENTE);
  });

  it('una causa inventada no se anota', async () => {
    const { estado } = await pedir('POST', '/asistentes/fin-de-sesion', { cuenta: CUENTA_ASISTENTE, cuerpo: { causa: 'cualquiera' } });
    assert.equal(estado, 400);
    assert.equal(renglones().length, 0);
  });

  it('sin sesión no se anota nada', async () => {
    const { estado } = await pedir('POST', '/asistentes/fin-de-sesion', { cuerpo: { causa: 'a_mano' } });
    assert.equal(estado, 401);
    assert.equal(renglones().length, 0);
  });
});

describe('toda descarga que salió bien queda anotada', () => {
  it('con la ruta y sin lo que viaja después del signo de pregunta', async () => {
    const { estado } = await pedir('GET', '/descarga?nombre=Persona%20Inventada');
    assert.equal(estado, 200);
    const [renglon] = await esperarRenglones(1);
    assert.ok(renglon, 'no quedó renglón');
    assert.equal(renglon.accion, 'exportacion');
    assert.deepEqual(renglon.detalle, { metodo: 'GET', ruta: '/descarga' });
    assert.equal(renglon.usuario_id, CUENTA_PANEL);
  });

  it('un pedido rechazado no se llevó nada y no deja renglón', async () => {
    const { estado } = await pedir('GET', '/descarga?rechazar=1');
    assert.equal(estado, 403);
    await new Promise((listo) => setTimeout(listo, 100));
    assert.equal(renglones().length, 0);
  });
});

describe('las aplicaciones reciben el cierre por inactividad de su Prestadora', () => {
  // Una base mínima que contesta como la consulta encadenada del cliente de la base.
  function baseDe(respuesta) {
    const pedido = { filtros: [] };
    const consulta = {
      from(tabla) { pedido.tabla = tabla; return consulta; },
      select(columnas) { pedido.columnas = columnas; return consulta; },
      eq(columna, valor) { pedido.filtros.push([columna, valor]); return consulta; },
      maybeSingle: async () => respuesta,
    };
    return { consulta, pedido };
  }

  it('lee la fila de su Prestadora y contesta si está encendido y cuántos minutos', async () => {
    const { consulta, pedido } = baseDe({ data: { cierre_por_inactividad_activo: true, cierre_por_inactividad_minutos: 15 }, error: null });
    assert.deepEqual(await cierrePorInactividadDelPedido(consulta, PRESTADORA), { activo: true, minutos: 15 });
    assert.equal(pedido.tabla, 'prestadoras');
    assert.deepEqual(pedido.filtros, [['id', PRESTADORA]]);
  });

  it('sin la fila, con error o sin Prestadora contesta nada, y la aplicación no cierra', async () => {
    assert.equal(await cierrePorInactividadDelPedido(baseDe({ data: null, error: null }).consulta, PRESTADORA), null);
    assert.equal(await cierrePorInactividadDelPedido(baseDe({ data: null, error: { code: '42501' } }).consulta, PRESTADORA), null);
    assert.equal(await cierrePorInactividadDelPedido(baseDe({ data: null, error: null }).consulta, null), null);
  });
});
