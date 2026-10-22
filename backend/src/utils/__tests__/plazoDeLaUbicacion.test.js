/**
 * El aviso a la Prestadora cuando un Asistente deja vencer el plazo para aceptar la ubicación.
 *
 *   node --test src/utils/__tests__/plazoDeLaUbicacion.test.js
 *
 * QUÉ SE PRUEBA. Con la Prestadora en «Viaje y turno», a quien no aceptó cuando venció el plazo se
 * lo avisa una sola vez, con su nombre y los días; a quien aceptó, o todavía está en plazo, no. El
 * plazo de quien entró después del cambio corre desde su alta. En «Sólo viaje» no hay plazo. Todo
 * con el trabajo de la Prestadora.
 *
 * La base es de mentira y contesta por HTTP como la de verdad; el despachante de correo también.
 * Datos inventados.
 */
import { strict as assert } from 'node:assert';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CAMBIO = '2026-09-01T00:00:00Z';
const AHORA = new Date('2026-10-15T00:00:00Z');
const SIN_ACEPTAR = 'a0000000-0000-4000-8000-000000000001';
const ACEPTO = 'a0000000-0000-4000-8000-000000000002';
const NUEVO = 'a0000000-0000-4000-8000-000000000003';

let prestadora;
let asistentes;
let aceptados;
let anotados;
let llamadas;
let enviados;

function leerCredencial(autorizacion) {
  try {
    return JSON.parse(Buffer.from(autorizacion.replace('Bearer ', '').split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

const baseFalsa = createServer((req, res) => {
  let cuerpo = '';
  req.on('data', (parte) => { cuerpo += parte; });
  req.on('end', () => {
    const url = new URL(req.url, 'http://interno');
    const clave = `${req.method} ${url.pathname}`;
    const credencial = leerCredencial(req.headers.authorization ?? '');
    llamadas.push({ clave, url, credencial });

    let filas = [];
    if (clave === 'GET /rest/v1/prestadoras') filas = [prestadora];
    if (clave === 'GET /rest/v1/asistentes') filas = asistentes;
    if (clave === 'GET /rest/v1/consentimientos_asistente') filas = aceptados.map((asistente_id) => ({ asistente_id }));
    if (clave === 'GET /rest/v1/configuracion_notificaciones') {
      filas = [{ emails: ['coordinacion@ejemplo.test'], activo: true, whatsapp_activo: false, mensaje_de_texto_activo: false }];
    }
    if (clave === 'POST /rest/v1/plazos_de_ubicacion_avisados') {
      // Como `ON CONFLICT DO NOTHING`: la anotación repetida no devuelve fila.
      const fila = JSON.parse(cuerpo);
      const repetida = anotados.some((a) => a.asistente_id === fila.asistente_id && a.control_en_el_turno_desde === fila.control_en_el_turno_desde);
      if (!repetida) {
        anotados.push(fila);
        filas = [{ id: `anotado-${anotados.length}` }];
      }
    }

    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo ? (filas[0] ?? null) : filas));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

const { avisarLosPlazosDeUbicacionVencidos } = await import('../plazoDeLaUbicacion.js');
const { sembrarMensajesDelSistema } = await import('../../i18n/mensajesDelSistema.js');
const { filasSembradas } = await import('../../i18n/__tests__/mensajesSembrados.js');

sembrarMensajesDelSistema(filasSembradas());

const fetchOriginal = globalThis.fetch;

after(() => baseFalsa.close());

beforeEach(() => {
  process.env.RESEND_API_KEY = 'clave-del-despachante';
  process.env.REMITENTE_AVISOS = 'avisos@ejemplo.local';
  prestadora = {
    control_de_ubicacion_en_el_turno: true,
    control_de_ubicacion_en_el_turno_desde: CAMBIO,
    dias_para_aceptar_la_ubicacion: 30,
  };
  asistentes = [
    { id: SIN_ACEPTAR, nombre: 'Rita Solano', created_at: '2026-01-10T00:00:00Z' },
    { id: ACEPTO, nombre: 'Marta Ruiz', created_at: '2026-01-10T00:00:00Z' },
    // Entró después del cambio: su plazo corre desde el alta y todavía no venció.
    { id: NUEVO, nombre: 'Elena Paz', created_at: '2026-10-01T00:00:00Z' },
  ];
  aceptados = [ACEPTO];
  anotados = [];
  llamadas = [];
  enviados = [];
  globalThis.fetch = async (url, opciones) => {
    if (String(url).includes('api.resend.com')) {
      enviados.push(JSON.parse(opciones.body));
      return { ok: true, status: 200, json: async () => ({ id: 'enviado' }) };
    }
    return fetchOriginal(url, opciones);
  };
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
  delete process.env.RESEND_API_KEY;
  delete process.env.REMITENTE_AVISOS;
});

describe('el plazo para aceptar la ubicación', () => {
  it('avisa sólo por quien no aceptó y ya está fuera de plazo, con su nombre y los días', async () => {
    assert.deepEqual(await avisarLosPlazosDeUbicacionVencidos(PRESTADORA, AHORA), { avisados: 1 });
    assert.deepEqual(anotados.map((a) => a.asistente_id), [SIN_ACEPTAR]);
    assert.equal(anotados[0].control_en_el_turno_desde, CAMBIO);
    assert.equal(enviados.length, 1);
    assert.equal(enviados[0].subject, 'Rita Solano no aceptó el registro de su ubicación');
    assert.match(enviados[0].text, /plazo de 30 días/);
  });

  it('no avisa dos veces por el mismo cambio', async () => {
    await avisarLosPlazosDeUbicacionVencidos(PRESTADORA, AHORA);
    assert.deepEqual(await avisarLosPlazosDeUbicacionVencidos(PRESTADORA, AHORA), { avisados: 0 });
    assert.equal(enviados.length, 1);
  });

  it('dentro del plazo no avisa', async () => {
    assert.deepEqual(await avisarLosPlazosDeUbicacionVencidos(PRESTADORA, new Date('2026-09-20T00:00:00Z')), { avisados: 0 });
    assert.equal(enviados.length, 0);
  });

  it('con un plazo de un día, lo dice en singular', async () => {
    prestadora.dias_para_aceptar_la_ubicacion = 1;
    await avisarLosPlazosDeUbicacionVencidos(PRESTADORA, AHORA);
    assert.ok(enviados.length >= 1);
    assert.match(enviados[0].text, /plazo de 1 día y/);
  });

  it('en «Sólo viaje» no hay plazo', async () => {
    prestadora.control_de_ubicacion_en_el_turno = false;
    assert.deepEqual(await avisarLosPlazosDeUbicacionVencidos(PRESTADORA, AHORA), { avisados: 0 });
    assert.equal(anotados.length, 0);
  });

  it('cuenta como aceptado sólo el texto vigente de «Viaje y turno»', async () => {
    await avisarLosPlazosDeUbicacionVencidos(PRESTADORA, AHORA);
    const consulta = llamadas.find((l) => l.clave === 'GET /rest/v1/consentimientos_asistente').url.searchParams;
    assert.equal(consulta.get('decision'), 'eq.otorgado');
    assert.equal(consulta.get('retirado_at'), 'is.null');
    assert.equal(consulta.get('textos_consentimiento.control_de_ubicacion_en_el_turno'), 'eq.true');
    assert.equal(consulta.get('textos_consentimiento.es_borrador'), 'eq.false');
    assert.equal(consulta.get('textos_consentimiento.vigente_hasta'), 'is.null');
    assert.match(consulta.get('select'), /textos_consentimiento!inner/);
  });

  it('va con el trabajo de la Prestadora', async () => {
    await avisarLosPlazosDeUbicacionVencidos(PRESTADORA, AHORA);
    const propias = llamadas.filter((l) => /prestadoras|asistentes|consentimientos_asistente|plazos_de_ubicacion_avisados/.test(l.clave));
    assert.ok(propias.length >= 4);
    for (const llamada of propias) {
      assert.equal(llamada.credencial?.role, 'trabajo_sin_persona');
      assert.equal(llamada.credencial.prestadora_id, PRESTADORA);
    }
  });
});
