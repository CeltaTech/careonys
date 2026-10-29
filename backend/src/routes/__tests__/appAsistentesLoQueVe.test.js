/**
 * `/api/app-asistentes/guardias` y `/perfil` — lo que el Asistente ve de lo suyo.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. De sus guardias pasadas el Asistente ve sólo las que todavía no se le
 * pagaron: las que cubre el período de una liquidación pagada salen de la lista. Qué períodos se le
 * pagaron lo contesta la base con `periodos_pagados_de_la_sesion`, con su propia credencial. Los
 * reportes de otros Asistentes los lee sólo con una guardia en curso con ese Paciente, y sólo los
 * del Servicio de esa guardia. Y su perfil no lleva la credencial interna del código QR.
 *
 * Qué daría con el sistema roto: si la lista dejara de preguntar los períodos pagados, la guardia
 * de septiembre volvería a aparecer; si se preguntara con otra credencial, falla la comprobación de
 * cuál viajó; si `qr_token` volviera al `select` del perfil, falla la comprobación del pedido. La
 * base de mentira no aplica políticas: qué períodos contesta la función lo prueba la base.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { olvidarPedidos } from '../../middleware/topeDePedidos.js';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USUARIO = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const LEGAJO = 'bbbbbbbb-bbbb-bbbb-bbbb-b0000000000b';

/** Qué contesta la base a cada `MÉTODO /ruta`. Lo que no se preparó contesta vacío. */
const respuestas = new Map();
/** Todo lo que el backend le pidió a la base, con la dirección entera y la credencial. */
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  let cuerpo = '';
  req.on('data', (parte) => (cuerpo += parte));
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    llamadas.push({ clave, url: decodeURIComponent(req.url), credencial: req.headers.authorization });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada({ url: req.url }) : preparada ?? [];
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? valor[0] ?? null : valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
const SESION = sesionDePrueba(USUARIO);
prepararCredencialDePrueba();

const { default: express } = await import('express');
await import('express-async-errors');
const { appAsistentesRouter } = await import('../appAsistentes.js');

const app = express();
app.use(express.json());
app.use('/api/app-asistentes', appAsistentesRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/app-asistentes`;

after(() => {
  backend.close();
  baseFalsa.close();
});

async function pedir(camino) {
  const respuesta = await fetch(DIRECCION + camino, { headers: { Authorization: SESION } });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

// Datos inventados: una guardia cobrada, una sin cobrar y una que quedó sin cerrar en el período cobrado.
const guardia = (id, fecha, estado) => ({
  id, paciente_id: null, fecha, hora_inicio: '08:00', hora_fin: '16:00', dias_hasta_el_fin: 0,
  modalidad: null, estado, salida_checkin_at: null, medio_transporte: null,
  checkin_at: null, checkout_at: null, checkout_bloqueado: false,
});
const COBRADA = guardia('guardia-cobrada', '2026-09-10', 'completada');
const SIN_COBRAR = guardia('guardia-sin-cobrar', '2026-10-10', 'completada');
const SIN_CERRAR = guardia('guardia-sin-cerrar', '2026-09-20', 'activa');

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  olvidarPedidos();

  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol: 'asistente', prestadora_id: PRESTADORA }]);
  respuestas.set('GET /rest/v1/asistentes', () => [{ id: LEGAJO, prestadora_id: PRESTADORA }]);
  respuestas.set('GET /rest/v1/guardias', () => [SIN_COBRAR, SIN_CERRAR, COBRADA]);
  respuestas.set('POST /rest/v1/rpc/periodos_pagados_de_la_sesion', () => [
    { desde: '2026-09-01', hasta: '2026-09-30' },
  ]);
});

describe('GET /guardias — las pasadas, sólo las que no se le pagaron', () => {
  it('saca la que cubre un período pagado y deja la que sigue sin cerrar', async () => {
    const { estado, cuerpo } = await pedir('/guardias');
    assert.equal(estado, 200);
    assert.deepEqual(cuerpo.guardias.map((g) => g.id), ['guardia-sin-cobrar', 'guardia-sin-cerrar']);
  });

  it('pregunta los períodos pagados con la credencial del Asistente', async () => {
    await pedir('/guardias');
    const pregunta = llamadas.find((l) => l.clave === 'POST /rest/v1/rpc/periodos_pagados_de_la_sesion');
    assert.ok(pregunta, 'no preguntó qué períodos se le pagaron');
    assert.equal(pregunta.credencial, SESION);
  });

  it('sin ningún período pagado no saca ninguna', async () => {
    respuestas.set('POST /rest/v1/rpc/periodos_pagados_de_la_sesion', () => []);
    const { cuerpo } = await pedir('/guardias');
    assert.equal(cuerpo.guardias.length, 3);
  });
});

describe('GET /pacientes/:id/reportes — sólo con una guardia en curso, y de ese Servicio', () => {
  const PACIENTE = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  const SERVICIO = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

  beforeEach(() => {
    respuestas.set('GET /rest/v1/configuracion_visibilidad_app', () => [
      { clave: 'asistente_reportes_anteriores', visible: true },
    ]);
    respuestas.set('POST /rest/v1/rpc/alcanza_la_informacion_de_salud_la_sesion', () => true);
    respuestas.set('GET /rest/v1/reportes', () => [{ id: 'reporte-1', observaciones: 'Inventado', created_at: '2026-10-01T10:00:00Z' }]);
  });

  it('sin una guardia en curso con el Paciente no lee ningún reporte', async () => {
    respuestas.set('GET /rest/v1/guardia_pacientes', () => []);
    const { estado } = await pedir(`/pacientes/${PACIENTE}/reportes`);
    assert.equal(estado, 403);
    assert.ok(!llamadas.some((l) => l.clave === 'GET /rest/v1/reportes'), 'leyó reportes sin guardia en curso');
  });

  it('con una guardia en curso lee sólo los del Servicio de esa guardia', async () => {
    respuestas.set('GET /rest/v1/guardia_pacientes', () => [{ guardias: { servicio_id: SERVICIO } }]);
    const { estado, cuerpo } = await pedir(`/pacientes/${PACIENTE}/reportes`);
    assert.equal(estado, 200);
    assert.equal(cuerpo.reportes.length, 1);

    const enCurso = llamadas.find((l) => l.clave === 'GET /rest/v1/guardia_pacientes');
    assert.ok(enCurso.url.includes('guardias.estado=eq.activa'), 'no pidió que la guardia esté en curso');
    const lectura = llamadas.find((l) => l.clave === 'GET /rest/v1/reportes');
    assert.ok(lectura.url.includes(`guardias.servicio_id=eq.${SERVICIO}`), 'no recortó los reportes al Servicio');
  });
});

describe('GET /perfil — sin la credencial interna del código QR', () => {
  it('no la pide a la base', async () => {
    await pedir('/perfil');
    const lectura = llamadas.find((l) => l.clave === 'GET /rest/v1/asistentes' && l.url.includes('tipo_asistente_id'));
    assert.ok(lectura, 'no leyó el perfil');
    assert.ok(!lectura.url.includes('qr_token'), 'el perfil sigue pidiendo qr_token');
  });
});
