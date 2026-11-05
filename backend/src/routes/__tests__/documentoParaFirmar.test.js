/**
 * El documento que se firma con un enlace, sin cuenta.
 *
 *   node --test src/routes/__tests__/documentoParaFirmar.test.js
 *
 * Se levanta el router de verdad contra una base de mentira que contesta por HTTP y que, como la de
 * verdad, sólo le muestra a cada Prestadora lo suyo: además del resultado se mira con qué credencial
 * se pidió cada cosa. Con el sistema roto —otra credencial u otra Prestadora— las pruebas dan al revés.
 *
 * Datos inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';
import { verificadorDelEnlace } from '../../utils/verificadorDelEnlace.js';

const PRESTADORA = '11111111-1111-4111-8111-111111111111';
const OTRA_PRESTADORA = '22222222-2222-4222-8222-222222222222';
const CONSENTIMIENTO = '33333333-3333-4333-8333-333333333333';
const ENLACE = 'enlace-inventado';
const TEXTO = 'Título inventado\n\nCuerpo inventado del documento.';
const EN_UNA_HORA = () => new Date(Date.now() + 3600000).toISOString();
const HACE_UNA_HORA = () => new Date(Date.now() - 3600000).toISOString();

let llamadas = [];
let consentimiento;
let expiraEn;

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
    llamadas.push({ clave, url, cuerpo: crudo, credencial });
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    const delTrabajo = credencial?.role === 'trabajo_sin_persona' && credencial.prestadora_id === PRESTADORA;
    let filas = [];

    if (clave === 'POST /rest/v1/rpc/prestadora_de_la_direccion') {
      filas = JSON.parse(crudo || '{}').p_direccion === 'otra' ? OTRA_PRESTADORA : PRESTADORA;
    }
    if (clave === 'GET /rest/v1/configuracion_prestadora' && credencial?.prestadora_id) {
      filas = [{ prestadora_id: credencial.prestadora_id }];
    }
    if (clave === 'GET /rest/v1/enlaces_consentimiento_pagador' && delTrabajo
      && url.searchParams.get('verificador') === `eq.${verificadorDelEnlace(ENLACE)}`) {
      filas = [{ consentimiento_id: CONSENTIMIENTO, expira_en: expiraEn }];
    }
    if (clave === 'GET /rest/v1/consentimientos_pagador' && delTrabajo) filas = [consentimiento];
    if (clave === 'PATCH /rest/v1/consentimientos_pagador' && delTrabajo) {
      Object.assign(consentimiento, JSON.parse(crudo));
      filas = [consentimiento];
    }
    if (url.pathname.startsWith('/storage/v1/object/sign/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ signedURL: '/object/sign/inventado?token=inventado' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(Array.isArray(filas) && unoSolo ? (filas[0] ?? null) : filas));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
process.env.PWA_CLIENTES_URL = 'https://clientes.ejemplo.test';
prepararCredencialDePrueba();

const { default: express } = await import('express');
await import('express-async-errors');
const { documentoParaFirmarRouter } = await import('../documentoParaFirmar.js');

const app = express();
app.use(express.json());
app.use('/api/documento-para-firmar', documentoParaFirmarRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const RAIZ = `http://127.0.0.1:${backend.address().port}/api/documento-para-firmar`;

after(() => {
  backend.close();
  baseFalsa.close();
});

beforeEach(() => {
  llamadas = [];
  expiraEn = EN_UNA_HORA();
  consentimiento = {
    id: CONSENTIMIENTO,
    estado: 'pendiente_firma',
    documento_texto: TEXTO,
    archivo_firmado_url: null,
  };
});

async function pedir(ruta, cuerpo) {
  const respuesta = await fetch(`${RAIZ}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

describe('leer el documento', () => {
  it('con el enlace se lee el texto, y la base se consulta con el trabajo de esa Prestadora', async () => {
    const { estado, cuerpo } = await pedir('/inventada', { token: ENLACE, idioma: 'es-AR' });
    assert.equal(estado, 200, JSON.stringify(cuerpo));
    assert.equal(cuerpo.texto, TEXTO);
    assert.equal(cuerpo.firmado, false);
    assert.equal(cuerpo.tieneArchivo, false);

    const busqueda = llamadas.find((l) => l.clave === 'GET /rest/v1/enlaces_consentimiento_pagador');
    assert.equal(busqueda.credencial?.role, 'trabajo_sin_persona');
    assert.equal(busqueda.credencial.prestadora_id, PRESTADORA);
  });

  it('el enlace viaja a la base como identificador de verificación, nunca entero', async () => {
    await pedir('/inventada', { token: ENLACE });
    for (const llamada of llamadas) {
      assert.ok(!llamada.url.search.includes(ENLACE), 'el enlace llegó entero a la base');
    }
  });

  it('un enlace de otra Prestadora no abre nada', async () => {
    const { estado, cuerpo } = await pedir('/otra', { token: ENLACE });
    assert.equal(estado, 400, JSON.stringify(cuerpo));
    assert.equal(cuerpo.motivo, 'token_invalido');
    assert.equal(cuerpo.texto, undefined);
    assert.ok(!llamadas.some((l) => l.clave === 'GET /rest/v1/consentimientos_pagador'), 'llegó a leer el documento');
  });

  it('sin enlace, con uno desconocido y con uno de un documento anulado se contesta lo mismo', async () => {
    const sinEnlace = await pedir('/inventada', {});
    const desconocido = await pedir('/inventada', { token: 'otro-inventado' });
    consentimiento.estado = 'anulado';
    const anulado = await pedir('/inventada', { token: ENLACE });
    for (const respuesta of [sinEnlace, desconocido, anulado]) {
      assert.equal(respuesta.cuerpo.motivo, 'token_invalido');
      assert.equal(respuesta.cuerpo.texto, undefined);
    }
  });

  it('un enlace vencido no abre nada', async () => {
    expiraEn = HACE_UNA_HORA();
    const { cuerpo } = await pedir('/inventada', { token: ENLACE });
    assert.equal(cuerpo.motivo, 'token_vencido');
    assert.equal(cuerpo.texto, undefined);
  });
});

describe('firmar', () => {
  it('deja el documento cerrado como firmado con el enlace, y devuelve lo firmado', async () => {
    const { estado, cuerpo } = await pedir('/inventada/firmar', { token: ENLACE });
    assert.equal(estado, 200, JSON.stringify(cuerpo));
    assert.equal(cuerpo.firmado, true);
    assert.equal(cuerpo.texto, TEXTO);
    assert.equal(consentimiento.estado, 'cerrado');
    assert.equal(consentimiento.cerrado_como, 'firmado_con_el_enlace');
    assert.ok(consentimiento.cerrado_en);

    const cierre = llamadas.find((l) => l.clave === 'PATCH /rest/v1/consentimientos_pagador');
    assert.equal(cierre.credencial.prestadora_id, PRESTADORA);
    assert.equal(cierre.url.searchParams.get('estado'), 'eq.pendiente_firma');
  });

  it('firmar dos veces no vuelve a escribir, y muestra lo firmado', async () => {
    consentimiento.estado = 'cerrado';
    const { estado, cuerpo } = await pedir('/inventada/firmar', { token: ENLACE });
    assert.equal(estado, 200);
    assert.equal(cuerpo.firmado, true);
    assert.ok(!llamadas.some((l) => l.clave === 'PATCH /rest/v1/consentimientos_pagador'));
  });

  it('con un enlace de otra Prestadora o vencido no se firma', async () => {
    await pedir('/otra/firmar', { token: ENLACE });
    expiraEn = HACE_UNA_HORA();
    await pedir('/inventada/firmar', { token: ENLACE });
    assert.equal(consentimiento.estado, 'pendiente_firma');
    assert.ok(!llamadas.some((l) => l.clave === 'PATCH /rest/v1/consentimientos_pagador'));
  });
});

describe('descargar', () => {
  it('entrega un enlace temporal del archivo firmado', async () => {
    consentimiento.estado = 'cerrado';
    consentimiento.archivo_firmado_url = `${PRESTADORA}/inventado.pdf`;
    const { estado, cuerpo } = await pedir('/inventada/descargar', { token: ENLACE });
    assert.equal(estado, 200, JSON.stringify(cuerpo));
    assert.ok(cuerpo.url.includes('/object/sign/'));

    const firma = llamadas.find((l) => l.url.pathname.startsWith('/storage/v1/object/sign/'));
    assert.equal(firma.credencial.prestadora_id, PRESTADORA);
  });

  it('sin firmar no hay nada que bajar', async () => {
    consentimiento.archivo_firmado_url = `${PRESTADORA}/inventado.pdf`;
    const { cuerpo } = await pedir('/inventada/descargar', { token: ENLACE });
    assert.equal(cuerpo.motivo, 'no_encontrado');
    assert.equal(cuerpo.url, undefined);
  });
});
