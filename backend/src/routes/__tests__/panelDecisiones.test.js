/**
 * Las decisiones del Coordinador y el veto de la administración, en el Panel.
 *
 *   npm test --prefix backend
 *
 * Se prueba el camino entero contra una base de mentira: quién entra a cada ruta, que todo vaya
 * con la credencial de quien pide, que el motivo sea obligatorio y que cada rechazo de la base
 * llegue a la pantalla con su motivo y no con el texto crudo. Lo que la base hace adentro del veto
 * lo prueba la base local con la prueba del veto.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const USUARIO = '22222222-2222-2222-2222-222222222222';
const COORDINADOR = '44444444-4444-4444-4444-444444444444';
const SERVICIO = '55555555-5555-4555-8555-555555555555';
const DECISION = '66666666-6666-4666-8666-666666666666';
const ASISTENTE = '77777777-7777-4777-8777-777777777777';
const OTRO_ASISTENTE = '88888888-8888-4888-8888-888888888888';

const respuestas = new Map();
let llamadas = [];
let rolDelUsuario = 'admin_prestadora';

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
      busqueda: decodeURIComponent(direccion.search),
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
    if (valor?.errorDeLaBase) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: valor.errorDeLaBase, code: 'P0001' }));
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
const { panelDecisionesRouter, renglonDelCambio } = await import('../panelDecisiones.js');

const app = express();
app.use(express.json());
app.use('/api/panel/decisiones', panelDecisionesRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/panel/decisiones`;

after(() => {
  backend.close();
  baseFalsa.close();
});

async function pedir(metodo, ruta, cuerpo) {
  const respuesta = await fetch(`${DIRECCION}${ruta}`, {
    method: metodo,
    headers: { Authorization: sesionDePrueba(USUARIO), 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

const llamadaA = (clave) => llamadas.find((l) => l.clave === clave);

beforeEach(() => {
  llamadas = [];
  rolDelUsuario = 'admin_prestadora';
  respuestas.clear();
  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ id: COORDINADOR, nombre: 'Coordinadora inventada', rol: rolDelUsuario, prestadora_id: PRESTADORA }]);
  respuestas.set('GET /rest/v1/permisos_de_acceso', () => []);
  respuestas.set('GET /rest/v1/prestadoras', () => [{ id: PRESTADORA }]);
});

describe('las decisiones de un Servicio', () => {
  it('la administración las ve con lo que cambió cada una y los nombres', async () => {
    respuestas.set('GET /rest/v1/decisiones_de_coordinacion', () => [
      { id: DECISION, clase: 'cobertura', decidida_por: COORDINADOR, decidida_at: '2026-11-20T10:00:00Z', vetada_at: null, vetada_por: null, motivo_del_veto: null },
    ]);
    respuestas.set('GET /rest/v1/cambios_de_la_decision', () => [
      {
        decision_id: DECISION, orden: 1, tabla: 'turnos_guardia', operacion: 'cambio',
        antes: { fecha: '2026-11-25', hora_inicio: '08:00:00', hora_fin: '16:00:00', asistente_id: ASISTENTE },
        despues: { fecha: '2026-11-25', hora_inicio: '08:00:00', hora_fin: '16:00:00', asistente_id: OTRO_ASISTENTE },
      },
    ]);
    respuestas.set('GET /rest/v1/asistentes', () => [
      { id: ASISTENTE, nombre: 'Asistente uno' },
      { id: OTRO_ASISTENTE, nombre: 'Asistente dos' },
    ]);

    const { estado, cuerpo } = await pedir('GET', `/servicio/${SERVICIO}`);
    assert.equal(estado, 200);
    const [decision] = cuerpo.decisiones;
    assert.equal(decision.decidida_por_nombre, 'Coordinadora inventada');
    assert.equal(decision.cambios.length, 1);
    assert.equal(decision.cambios[0].asistente_antes_nombre, 'Asistente uno');
    assert.equal(decision.cambios[0].asistente_despues_nombre, 'Asistente dos');
    assert.equal(decision.cambios[0].fecha, '2026-11-25');

    // La lista, con la credencial de quien pide: la base decide qué decisiones ve.
    const lectura = llamadaA('GET /rest/v1/decisiones_de_coordinacion');
    assert.equal(lectura.credencial, sesionDePrueba(USUARIO));
    assert.match(lectura.busqueda, new RegExp(`servicio_id=eq.${SERVICIO}`));
  });

  it('el Coordinador no entra a la lista de un Servicio', async () => {
    rolDelUsuario = 'coordinador';
    const { estado } = await pedir('GET', `/servicio/${SERVICIO}`);
    assert.equal(estado, 403);
    assert.equal(llamadas.some((l) => l.clave === 'GET /rest/v1/decisiones_de_coordinacion'), false);
  });

  it('un Servicio mal escrito no llega a la base', async () => {
    const { estado } = await pedir('GET', '/servicio/no-es-un-servicio');
    assert.equal(estado, 400);
    assert.equal(llamadas.some((l) => l.clave === 'GET /rest/v1/decisiones_de_coordinacion'), false);
  });
});

describe('el veto', () => {
  it('veta con el motivo y la credencial de quien pide', async () => {
    respuestas.set('POST /rest/v1/rpc/vetar_decision', () => ({
      clase: 'cobertura', deshechos: 2, salteados: 1, decidida_at: '2026-11-20T10:00:00Z',
      servicio_id: SERVICIO, decidida_por: COORDINADOR,
      turnos_retirados: [], asignaciones_devueltas: [], asignaciones_retiradas: [],
    }));

    const { estado, cuerpo } = await pedir('POST', `/${DECISION}/vetar`, { motivo: '  El horario es el pactado  ' });
    assert.equal(estado, 200);
    assert.deepEqual(cuerpo, { ok: true, deshechos: 2, salteados: 1 });

    const veto = llamadaA('POST /rest/v1/rpc/vetar_decision');
    assert.equal(veto.credencial, sesionDePrueba(USUARIO), 'se vetó con otra credencial');
    assert.deepEqual(veto.cuerpo, { p_decision: DECISION, p_motivo: 'El horario es el pactado' });
  });

  it('sin motivo no veta', async () => {
    const { estado, cuerpo } = await pedir('POST', `/${DECISION}/vetar`, { motivo: '   ' });
    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'falta_el_motivo');
    assert.equal(llamadas.some((l) => l.clave === 'POST /rest/v1/rpc/vetar_decision'), false);
  });

  it('el Coordinador no veta', async () => {
    rolDelUsuario = 'coordinador';
    const { estado } = await pedir('POST', `/${DECISION}/vetar`, { motivo: 'Motivo inventado' });
    assert.equal(estado, 403);
    assert.equal(llamadas.some((l) => l.clave === 'POST /rest/v1/rpc/vetar_decision'), false);
  });

  for (const [motivo, estadoEsperado] of [
    ['decision_cambiada_despues', 409],
    ['decision_ya_vetada', 409],
    ['decision_inexistente', 404],
  ]) {
    it(`el rechazo ${motivo} llega con su motivo y sin el texto de la base`, async () => {
      respuestas.set('POST /rest/v1/rpc/vetar_decision', () => ({ errorDeLaBase: motivo }));
      const { estado, cuerpo } = await pedir('POST', `/${DECISION}/vetar`, { motivo: 'Motivo inventado' });
      assert.equal(estado, estadoEsperado);
      assert.deepEqual(cuerpo, { error: motivo, motivo });
    });
  }
});

describe('el aviso del veto en el Panel del Coordinador', () => {
  it('lista sólo las suyas vetadas y sin ver, con el Servicio', async () => {
    rolDelUsuario = 'coordinador';
    respuestas.set('GET /rest/v1/decisiones_de_coordinacion', () => [
      { id: DECISION, clase: 'cobertura', servicio_id: SERVICIO, decidida_at: '2026-11-20T10:00:00Z', vetada_at: '2026-11-21T10:00:00Z', motivo_del_veto: 'Motivo inventado' },
    ]);
    respuestas.set('GET /rest/v1/servicios', () => [{ id: SERVICIO, etiqueta: 'Cuidado nocturno' }]);

    const { estado, cuerpo } = await pedir('GET', '/vetadas-sin-ver');
    assert.equal(estado, 200);
    assert.equal(cuerpo.vetadas[0].servicio_etiqueta, 'Cuidado nocturno');
    const lectura = llamadaA('GET /rest/v1/decisiones_de_coordinacion');
    assert.equal(lectura.credencial, sesionDePrueba(USUARIO));
    assert.match(lectura.busqueda, new RegExp(`decidida_por=eq.${USUARIO}`));
    assert.match(lectura.busqueda, /vista_por_el_coordinador_at=is.null/);
  });

  it('marca visto con la credencial de quien pide', async () => {
    rolDelUsuario = 'coordinador';
    respuestas.set('POST /rest/v1/rpc/marcar_veto_visto', () => true);
    const { estado, cuerpo } = await pedir('PATCH', `/${DECISION}/visto`);
    assert.equal(estado, 200);
    assert.deepEqual(cuerpo, { ok: true, primeraVez: true });
    assert.equal(llamadaA('POST /rest/v1/rpc/marcar_veto_visto').credencial, sesionDePrueba(USUARIO));
  });
});

describe('lo que se muestra de cada cambio', () => {
  it('una baja muestra lo que había antes', () => {
    const renglon = renglonDelCambio({
      tabla: 'turnos_guardia', operacion: 'baja',
      antes: { fecha: '2026-11-25', hora_inicio: '08:00:00', hora_fin: '16:00:00', asistente_id: ASISTENTE }, despues: null,
    });
    assert.equal(renglon.fecha, '2026-11-25');
    assert.equal(renglon.asistente_antes, ASISTENTE);
    assert.equal(renglon.asistente_despues, null);
  });

  it('una cobertura muestra al sustituto', () => {
    const renglon = renglonDelCambio({
      tabla: 'coberturas_de_ausencia', operacion: 'alta', antes: null, despues: { asistente_sustituto_id: OTRO_ASISTENTE },
    });
    assert.equal(renglon.asistente_despues, OTRO_ASISTENTE);
  });
});
