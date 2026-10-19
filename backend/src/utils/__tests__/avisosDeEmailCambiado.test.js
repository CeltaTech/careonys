/**
 * El aviso al email anterior cuando cambia el email de una cuenta.
 *
 *   node --test src/utils/__tests__/avisosDeEmailCambiado.test.js
 *
 * QUÉ SE PRUEBA. La base anota el email anterior al hacer el cambio, y la tarea le manda el aviso a
 * ese email —no al nuevo, que es justamente el que pudo haber puesto otro— y borra el renglón, para
 * que el email anterior no quede guardado y el aviso no salga dos veces. Todo con el trabajo de la
 * Prestadora de la cuenta: la de otra no ve esos renglones.
 *
 * La base es de mentira y contesta por HTTP como la de verdad; el despachante de correo también.
 * Datos inventados.
 */
import { strict as assert } from 'node:assert';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTRA_PRESTADORA = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CUENTA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const EMAIL_ANTERIOR = 'anterior@ejemplo.test';

let avisos = [];
let llamadas = [];
let enviados = [];

function leerCredencial(autorizacion) {
  try {
    return JSON.parse(Buffer.from(autorizacion.replace('Bearer ', '').split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

const baseFalsa = createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    const url = new URL(req.url, 'http://interno');
    const clave = `${req.method} ${url.pathname}`;
    const credencial = leerCredencial(req.headers.authorization ?? '');
    llamadas.push({ clave, url, credencial });
    // La base sólo le muestra los avisos al trabajo de su Prestadora.
    const visibles = avisos.filter((a) => credencial?.role === 'trabajo_sin_persona' && a.prestadora_id === credencial.prestadora_id);

    let filas = [];
    if (clave === 'GET /rest/v1/avisos_de_email_cambiado') filas = visibles;
    if (clave === 'DELETE /rest/v1/avisos_de_email_cambiado') {
      const id = url.searchParams.get('id')?.replace(/^eq\./, '');
      filas = visibles.filter((a) => a.id === id);
      avisos = avisos.filter((a) => !filas.includes(a));
    }
    if (clave === 'GET /rest/v1/usuarios') filas = [{ id: CUENTA, nombre: 'Marta' }];

    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo ? (filas[0] ?? null) : filas));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

const { avisarLosCambiosDeEmail } = await import('../avisosDeEmailCambiado.js');
const { sembrarMensajesDelSistema } = await import('../../i18n/mensajesDelSistema.js');
const { filasSembradas } = await import('../../i18n/__tests__/mensajesSembrados.js');

sembrarMensajesDelSistema(filasSembradas());

const fetchOriginal = globalThis.fetch;

after(() => baseFalsa.close());

beforeEach(() => {
  process.env.RESEND_API_KEY = 'clave-del-despachante';
  process.env.REMITENTE_AVISOS = 'avisos@ejemplo.local';
  llamadas = [];
  enviados = [];
  avisos = [{ id: 'aviso-1', prestadora_id: PRESTADORA, usuario_id: CUENTA, email_anterior: EMAIL_ANTERIOR, creado_en: '2026-10-19T10:00:00Z' }];
  // El correo sale por el despachante y se anota acá; lo demás va a la base de mentira.
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

describe('el aviso del email cambiado', () => {
  it('sale al email anterior, con su asunto, y el renglón se borra', async () => {
    assert.deepEqual(await avisarLosCambiosDeEmail(PRESTADORA), { avisados: 1 });
    assert.equal(enviados.length, 1);
    assert.deepEqual([].concat(enviados[0].to), [EMAIL_ANTERIOR]);
    assert.equal(enviados[0].subject, 'Cambió el email de su cuenta');
    assert.equal(avisos.length, 0, 'el email anterior quedó guardado');
  });

  it('no sale dos veces', async () => {
    await avisarLosCambiosDeEmail(PRESTADORA);
    assert.deepEqual(await avisarLosCambiosDeEmail(PRESTADORA), { avisados: 0 });
    assert.equal(enviados.length, 1);
  });

  it('va con el trabajo de la Prestadora de la cuenta', async () => {
    await avisarLosCambiosDeEmail(PRESTADORA);
    const deLosAvisos = llamadas.filter((l) => l.clave.endsWith('/rest/v1/avisos_de_email_cambiado'));
    assert.ok(deLosAvisos.length >= 2);
    for (const llamada of deLosAvisos) {
      assert.equal(llamada.credencial?.role, 'trabajo_sin_persona');
      assert.equal(llamada.credencial.prestadora_id, PRESTADORA);
    }
  });

  it('la tarea de otra Prestadora no ve el aviso ni lo manda', async () => {
    assert.deepEqual(await avisarLosCambiosDeEmail(OTRA_PRESTADORA), { avisados: 0 });
    assert.equal(enviados.length, 0);
    assert.equal(avisos.length, 1);
  });
});
