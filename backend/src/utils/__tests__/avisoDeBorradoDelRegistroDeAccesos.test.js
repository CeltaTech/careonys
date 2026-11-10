/**
 * Los dos correos que avisan el borrado del registro de accesos: qué aviso toca lo dice la base, el
 * correo sale al email de contacto de la Prestadora, y recién después se deja la constancia.
 *
 *   npm test --prefix backend
 *
 * Con el sistema roto —anotar antes de mandar, o anotar aunque el correo no salga— la tercera
 * prueba da al revés. Datos inventados, como manda CLAUDE.md §6.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA_A = '11111111-1111-1111-1111-111111111111';
const PRESTADORA_B = '22222222-2222-2222-2222-222222222222';

const PENDIENTE = {
  [PRESTADORA_A]: [{ anio: 2023, se_borra_el: '2027-01-01', aviso: 'notificacion', dias: 30 }],
  [PRESTADORA_B]: [],
};

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
    if (clave === 'POST /rest/v1/rpc/aviso_de_borrado_de_consultas_a_hce_pendiente') valor = PENDIENTE[credencial.prestadora_id] ?? [];
    if (clave === 'POST /rest/v1/rpc/anotar_aviso_de_borrado_de_consultas_a_hce') valor = true;
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

const { avisarElBorradoDelRegistroDeAccesos } = await import('../avisoDeBorradoDelRegistroDeAccesos.js');

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

const anotaciones = () => llamadas.filter((l) => l.clave === 'POST /rest/v1/rpc/anotar_aviso_de_borrado_de_consultas_a_hce');

describe('avisarElBorradoDelRegistroDeAccesos', () => {
  it('manda el aviso que toca al contacto de la Prestadora y después deja la constancia', async () => {
    assert.equal(await avisarElBorradoDelRegistroDeAccesos(PRESTADORA_A), 'notificacion');
    assert.equal(correos.length, 1);
    assert.deepEqual(correos[0].to, ['contacto@ejemplo.test']);
    assert.ok(orden.indexOf('correo') < orden.indexOf('POST /rest/v1/rpc/anotar_aviso_de_borrado_de_consultas_a_hce'));
    assert.deepEqual(anotaciones()[0].cuerpo, { p_anio: 2023, p_aviso: 'notificacion' });
    for (const l of llamadas) {
      assert.equal(l.credencial.role, 'trabajo_sin_persona');
      assert.equal(l.credencial.prestadora_id, PRESTADORA_A);
    }
  });

  it('sin aviso pendiente no manda nada ni anota nada', async () => {
    assert.equal(await avisarElBorradoDelRegistroDeAccesos(PRESTADORA_B), null);
    assert.equal(correos.length, 0);
    assert.equal(anotaciones().length, 0);
  });

  it('si el correo no sale, no queda constancia: se intenta al día siguiente', async () => {
    rechaza = true;
    assert.equal(await avisarElBorradoDelRegistroDeAccesos(PRESTADORA_A), null);
    assert.equal(correos.length, 1);
    assert.equal(anotaciones().length, 0);
  });

  it('sin email de contacto no hay a quién avisar, y no se anota', async () => {
    sinContacto = true;
    assert.equal(await avisarElBorradoDelRegistroDeAccesos(PRESTADORA_A), null);
    assert.equal(correos.length, 0);
    assert.equal(anotaciones().length, 0);
  });

  it('sin Prestadora no llama a nadie', async () => {
    assert.equal(await avisarElBorradoDelRegistroDeAccesos(null), null);
    assert.equal(llamadas.length, 0);
  });
});
