/**
 * El correo que avisa que vence el plazo para responder lo que una persona pidió sobre sus datos:
 * qué avisar lo dice la base, el correo sale al email de contacto de la Prestadora, y recién
 * después se deja la constancia.
 *
 *   npm test --prefix backend
 *
 * Con el sistema roto —anotar antes de mandar, o anotar aunque el correo no salga— la primera y
 * la tercera prueba dan al revés. Datos inventados, como manda CLAUDE.md §6.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';
import { sembrarMensajesDelSistema } from '../../i18n/mensajesDelSistema.js';
import { filasSembradas } from '../../i18n/__tests__/mensajesSembrados.js';

const PRESTADORA_A = '11111111-1111-1111-1111-111111111111';
const PRESTADORA_B = '22222222-2222-2222-2222-222222222222';
const SOLICITUD_1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const SOLICITUD_2 = 'aaaaaaaa-0000-4000-8000-000000000002';

const POR_VENCER = {
  [PRESTADORA_A]: [
    { solicitud_id: SOLICITUD_1, tipo: 'acceso', recibida_el: '2027-03-02', vence_el: '2027-03-16' },
    { solicitud_id: SOLICITUD_2, tipo: 'rectificacion', recibida_el: '2027-03-03', vence_el: '2027-03-17' },
  ],
  [PRESTADORA_B]: [],
};

const RPC_POR_VENCER = 'POST /rest/v1/rpc/derechos_por_vencer';
const RPC_ANOTAR = 'POST /rest/v1/rpc/anotar_aviso_de_derecho_por_vencer';

let llamadas = [];
let orden = [];
let sinContacto = false;

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => { crudo += parte; });
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    const cuerpo64 = (req.headers.authorization ?? '').replace('Bearer ', '').split('.')[1];
    const credencial = JSON.parse(Buffer.from(cuerpo64, 'base64url').toString());
    llamadas.push({ clave, credencial, cuerpo: crudo ? JSON.parse(crudo) : null });
    orden.push(clave);

    let valor = [];
    if (clave === RPC_POR_VENCER) valor = POR_VENCER[credencial.prestadora_id] ?? [];
    if (clave === RPC_ANOTAR) valor = true;
    if (clave === 'GET /rest/v1/configuracion_prestadora') valor = sinContacto ? [] : [{ email: 'contacto@ejemplo.test' }];
    if (clave === 'GET /rest/v1/prestadoras') valor = [{ pais: 'AR' }];

    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? valor[0] ?? null : valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

// Las frases, de la siembra de verdad.
const { readFileSync } = await import('node:fs');
const migracion = readFileSync(new URL(
  '../../../../supabase/migrations/20270409000200_los_derechos_de_la_persona_y_sus_plazos.sql',
  import.meta.url,
), 'utf8');
const propias = [...migracion.matchAll(/\('([^']+)',\s*'(\{.*?\})'::jsonb(?:,\s*(true|false),\s*(true|false))?\)/g)]
  .map(([, clave, i18n]) => ({ clave, prestadora_id: null, activo: true, admite_texto_propio: true, i18n: JSON.parse(i18n) }));
sembrarMensajesDelSistema([...filasSembradas(), ...propias]);

// El despachante de correo, de mentira.
process.env.RESEND_API_KEY = 'clave-de-prueba';
process.env.REMITENTE_AVISOS = 'avisos@ejemplo.test';
let correos = [];
let rechaza = false;
const fetchDeVerdad = globalThis.fetch;
globalThis.fetch = (url, opciones) => {
  if (String(url).startsWith('https://api.resend.com/')) {
    orden.push('correo');
    correos.push(JSON.parse(opciones.body));
    return Promise.resolve(rechaza
      ? new Response(JSON.stringify({ name: 'daily_quota_exceeded' }), { status: 429 })
      : new Response(JSON.stringify({ id: 'x' }), { status: 200 }));
  }
  return fetchDeVerdad(url, opciones);
};

const { avisarLosDerechosPorVencer } = await import('../avisoDeVencimientoDeDerechos.js');

const errorDeVerdad = console.error;
console.error = () => {};

after(() => {
  console.error = errorDeVerdad;
  globalThis.fetch = fetchDeVerdad;
  baseFalsa.close();
});

beforeEach(() => {
  llamadas = [];
  orden = [];
  correos = [];
  rechaza = false;
  sinContacto = false;
});

const anotaciones = () => llamadas.filter((l) => l.clave === RPC_ANOTAR);

describe('avisarLosDerechosPorVencer', () => {
  it('manda un correo por solicitud al contacto de la Prestadora, y cada constancia después de su correo', async () => {
    assert.equal(await avisarLosDerechosPorVencer(PRESTADORA_A), 2);
    assert.equal(correos.length, 2);
    assert.deepEqual(correos[0].to, ['contacto@ejemplo.test']);
    assert.match(correos[0].subject, /16\/3\/2027/);
    const posiciones = orden.map((c, i) => [c, i]).filter(([c]) => c === 'correo' || c === RPC_ANOTAR).map(([c]) => c);
    assert.deepEqual(posiciones, ['correo', RPC_ANOTAR, 'correo', RPC_ANOTAR]);
    assert.deepEqual(anotaciones().map((a) => a.cuerpo), [{ p_solicitud: SOLICITUD_1 }, { p_solicitud: SOLICITUD_2 }]);
    for (const l of llamadas) {
      assert.equal(l.credencial.role, 'trabajo_sin_persona');
      assert.equal(l.credencial.prestadora_id, PRESTADORA_A);
    }
  });

  it('sin solicitudes por vencer no manda nada ni anota nada', async () => {
    assert.equal(await avisarLosDerechosPorVencer(PRESTADORA_B), 0);
    assert.equal(correos.length, 0);
    assert.equal(anotaciones().length, 0);
  });

  it('si el correo no sale, no queda constancia: se intenta al día siguiente', async () => {
    rechaza = true;
    assert.equal(await avisarLosDerechosPorVencer(PRESTADORA_A), 0);
    assert.equal(correos.length, 1);
    assert.equal(anotaciones().length, 0);
  });

  it('sin email de contacto no hay a quién avisar, y no se anota', async () => {
    sinContacto = true;
    assert.equal(await avisarLosDerechosPorVencer(PRESTADORA_A), 0);
    assert.equal(correos.length, 0);
    assert.equal(anotaciones().length, 0);
  });

  it('el correo no lleva datos de la persona: sólo el derecho y las fechas', async () => {
    await avisarLosDerechosPorVencer(PRESTADORA_A);
    for (const correo of correos) {
      assert.doesNotMatch(JSON.stringify(correo), /aaaaaaaa-0000/);
    }
  });

  it('sin Prestadora no llama a nadie', async () => {
    assert.equal(await avisarLosDerechosPorVencer(null), 0);
    assert.equal(llamadas.length, 0);
  });
});
