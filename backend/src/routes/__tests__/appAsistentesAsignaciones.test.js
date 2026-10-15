/**
 * `/api/app-asistentes/asignaciones` — los turnos que se le asignaron al Asistente y su respuesta.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. La lista, los motivos y el rechazo van con la credencial del
 * Asistente, y aceptar va con la llave maestra y el filtro escrito. Si la lista volviera a la
 * maestra, el aislamiento dependería otra vez de un filtro a mano; si el rechazo dejara de pasar por
 * `resolver`, el motivo dejaría de quedar firmado.
 *
 * Qué daría con el sistema roto: si la lista o el rechazo fueran con la llave maestra, falla la
 * comprobación de la credencial; si aceptar perdiera el filtro de la Prestadora, falla la del
 * aislamiento. La base de mentira no aplica políticas, así que lo que se prueba es con qué
 * credencial y con qué filtros se pregunta, no qué filas devolvería la base real.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { olvidarPedidos } from '../../middleware/topeDePedidos.js';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';

const PRESTADORA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USUARIO = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const LEGAJO = 'bbbbbbbb-bbbb-bbbb-bbbb-b0000000000b';
const GUARDIA = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const MOTIVO = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const LLAVE_MAESTRA = 'Bearer clave-de-mentira';

/** Qué contesta la base a cada `MÉTODO /ruta`. Lo que no se preparó contesta vacío. */
const respuestas = new Map();
/** Todo lo que el backend le pidió a la base, con la dirección entera, la credencial y el cuerpo. */
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  let cuerpo = '';
  req.on('data', (parte) => (cuerpo += parte));
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    llamadas.push({ clave, url: decodeURIComponent(req.url), credencial: req.headers.authorization, cuerpo });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada({ url: req.url }) : preparada ?? [];
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? valor[0] ?? null : valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-mentira';

const { default: express } = await import('express');
await import('express-async-errors');
const { appAsistentesAsignacionesRouter } = await import('../appAsistentesAsignaciones.js');

const app = express();
app.use(express.json());
app.use('/api/app-asistentes/asignaciones', appAsistentesAsignacionesRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/app-asistentes/asignaciones`;

after(() => {
  backend.close();
  baseFalsa.close();
});

async function pedir(camino = '', cuerpo) {
  const respuesta = await fetch(DIRECCION + camino, {
    method: cuerpo ? 'POST' : 'GET',
    headers: { Authorization: sesionDePrueba(USUARIO), 'Content-Type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

const TURNO = {
  id: GUARDIA, paciente_id: null, fecha: '2099-01-01', hora_inicio: '08:00', hora_fin: '16:00',
  dias_hasta_el_fin: 0, modalidad: null, estado: 'programada', asistente_id: null,
};

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  olvidarPedidos();
  delete process.env.TOPE_PEDIDOS_POR_MINUTO;

  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol: 'asistente', prestadora_id: PRESTADORA }]);
  respuestas.set('GET /rest/v1/asistentes', () => [{ id: LEGAJO, prestadora_id: PRESTADORA }]);
  respuestas.set('GET /rest/v1/asignaciones_de_turno', () => [
    { id: 'asignacion-1', estado: 'sin_responder', asignado_at: '2026-09-01T10:00:00Z', guardia_id: GUARDIA, guardias: TURNO },
  ]);
  respuestas.set('GET /rest/v1/motivos_resolucion', () => [
    { id: MOTIVO, nombre_es_ar: 'Problema de salud', nombre_en: 'Health problem', nombre_pt_br: 'Problema de saúde', pide_detalle: false, orden: 10 },
  ]);
  respuestas.set('PATCH /rest/v1/guardias', () => [{ id: GUARDIA }]);
  respuestas.set('PATCH /rest/v1/asignaciones_de_turno', () => [{ id: 'asignacion-1' }]);
  respuestas.set('POST /rest/v1/rpc/resolver', () => ({ id: 'resolucion-1' }));
});

describe('la lista de asignaciones sin responder', () => {
  it('se busca con la credencial del Asistente, y no con la llave maestra', async () => {
    const { estado, cuerpo } = await pedir();
    assert.equal(estado, 200);
    const lecturas = llamadas.filter((l) => l.clave === 'GET /rest/v1/asignaciones_de_turno');
    assert.equal(lecturas.length, 1);
    assert.notEqual(lecturas[0].credencial, LLAVE_MAESTRA, 'la lista fue con la llave maestra');
    assert.ok(lecturas[0].url.includes('estado=eq.sin_responder'), 'falta el filtro de las sin responder');
    assert.equal(cuerpo.asignaciones.length, 1);
    assert.equal(cuerpo.asignaciones[0].id, 'asignacion-1');
  });

  it('trae la lista de motivos de rechazo de la Prestadora, con la credencial del Asistente', async () => {
    const { cuerpo } = await pedir();
    const lecturas = llamadas.filter((l) => l.clave === 'GET /rest/v1/motivos_resolucion');
    assert.equal(lecturas.length, 1);
    assert.notEqual(lecturas[0].credencial, LLAVE_MAESTRA);
    assert.ok(lecturas[0].url.includes('tabla=eq.asignaciones_de_turno'));
    assert.equal(cuerpo.motivos[0].id, MOTIVO);
  });

  it('quien no es Asistente no entra, aunque tenga sesión', async () => {
    respuestas.set('GET /rest/v1/usuarios', () => [{ rol: 'coordinador', prestadora_id: PRESTADORA }]);
    const { estado } = await pedir();
    assert.equal(estado, 403);
  });
});

describe('rechazar', () => {
  it('pasa por `resolver` con la credencial del Asistente y el motivo elegido', async () => {
    const { estado } = await pedir('/asignacion-1/responder', { respuesta: 'rechaza', motivoId: MOTIVO });
    assert.equal(estado, 200);
    const resoluciones = llamadas.filter((l) => l.clave === 'POST /rest/v1/rpc/resolver');
    assert.equal(resoluciones.length, 1);
    assert.notEqual(resoluciones[0].credencial, LLAVE_MAESTRA, 'el rechazo fue con la llave maestra');
    const enviado = JSON.parse(resoluciones[0].cuerpo);
    assert.equal(enviado.p_tabla, 'asignaciones_de_turno');
    assert.equal(enviado.p_fila_id, 'asignacion-1');
    assert.equal(enviado.p_motivo_id, MOTIVO);
  });

  it('sin motivo no se rechaza', async () => {
    const { estado, cuerpo } = await pedir('/asignacion-1/responder', { respuesta: 'rechaza' });
    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'motivo_requerido');
    assert.equal(llamadas.filter((l) => l.clave === 'POST /rest/v1/rpc/resolver').length, 0);
  });

  it('una asignación ya respondida no se vuelve a responder', async () => {
    respuestas.set('GET /rest/v1/asignaciones_de_turno', () => [
      { id: 'asignacion-1', estado: 'rechazada', guardia_id: GUARDIA, guardias: TURNO },
    ]);
    const { estado, cuerpo } = await pedir('/asignacion-1/responder', { respuesta: 'rechaza', motivoId: MOTIVO });
    assert.equal(estado, 409);
    assert.equal(cuerpo.motivo, 'asignacion_ya_respondida');
  });
});

describe('aceptar', () => {
  it('toma el turno y marca la asignación, las dos con la Prestadora escrita', async () => {
    const { estado, cuerpo } = await pedir('/asignacion-1/responder', { respuesta: 'acepta' });
    assert.equal(estado, 200);
    assert.equal(cuerpo.guardiaId, GUARDIA);
    for (const clave of ['PATCH /rest/v1/guardias', 'PATCH /rest/v1/asignaciones_de_turno']) {
      const escrituras = llamadas.filter((l) => l.clave === clave);
      assert.equal(escrituras.length, 1, `falta ${clave}`);
      assert.ok(escrituras[0].url.includes(`prestadora_id=eq.${PRESTADORA}`), `${clave} sin la Prestadora`);
    }
  });

  it('un turno que ya tiene Asistente no se acepta', async () => {
    respuestas.set('GET /rest/v1/asignaciones_de_turno', () => [
      { id: 'asignacion-1', estado: 'sin_responder', guardia_id: GUARDIA, guardias: { ...TURNO, asistente_id: 'otro' } },
    ]);
    const { estado, cuerpo } = await pedir('/asignacion-1/responder', { respuesta: 'acepta' });
    assert.equal(estado, 409);
    assert.equal(cuerpo.motivo, 'guardia_ya_cubierta');
  });
});
