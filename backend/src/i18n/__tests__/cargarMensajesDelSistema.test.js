/**
 * La carga de los mensajes del sistema, sin llave maestra.
 *
 *   npm test --prefix backend
 *
 * QUÉ SE PRUEBA. Al arrancar, el backend lee los textos de cada Prestadora adentro de ella, con la
 * credencial del trabajo sin persona de esa Prestadora, y el texto del producto una sola vez. Ningún
 * pedido lleva la llave maestra, y ninguno lee lo de una Prestadora con la credencial de otra.
 *
 * La base es de mentira y se mira qué le llegó y con qué credencial.
 */
import { strict as assert } from 'node:assert';
import { after, describe, it } from 'node:test';
import { createServer } from 'node:http';
import crypto from 'node:crypto';

const PRESTADORA_A = '11111111-1111-1111-1111-111111111111';
const PRESTADORA_B = '22222222-2222-2222-2222-222222222222';
const LLAVE_MAESTRA = 'clave-maestra-de-mentira';

const RENGLONES = {
  producto: [{ clave: 'prueba.saludo', i18n: { 'es-AR': 'Hola' }, prestadora_id: null, activo: true }],
  [PRESTADORA_A]: [{ clave: 'prueba.saludo', i18n: { 'es-AR': 'Hola desde A' }, prestadora_id: PRESTADORA_A, activo: true }],
  [PRESTADORA_B]: [],
};

let llamadas = [];

function contenidoDe(credencial) {
  try {
    return JSON.parse(Buffer.from(credencial.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

const baseFalsa = createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    const url = new URL(req.url, 'http://interno');
    const credencial = String(req.headers.authorization || '').replace(/^Bearer /, '');
    llamadas.push({
      ruta: url.pathname,
      filtro: url.searchParams.get('prestadora_id'),
      credencial,
      llave: req.headers.apikey,
      contenido: contenidoDe(credencial),
    });

    let valor = [];
    if (url.pathname === '/rest/v1/rpc/prestadoras_a_recorrer') valor = [PRESTADORA_A, PRESTADORA_B];
    if (url.pathname === '/rest/v1/mensajes_del_sistema') {
      const filtro = url.searchParams.get('prestadora_id');
      valor = filtro === 'is.null' ? RENGLONES.producto : RENGLONES[filtro?.replace(/^eq\./, '')] ?? [];
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = LLAVE_MAESTRA;
process.env.SUPABASE_ANON_KEY = 'clave-publica-de-mentira';
const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
process.env.CLAVE_DEL_TRABAJO_SIN_PERSONA = JSON.stringify({ ...privateKey.export({ format: 'jwk' }), kid: 'prueba' });

const { cargarMensajesDelSistema } = await import('../cargarMensajesDelSistema.js');

after(() => {
  baseFalsa.close();
});

describe('cargar los mensajes del sistema', async () => {
  const resultado = await cargarMensajesDelSistema();
  const lecturas = llamadas.filter((l) => l.ruta === '/rest/v1/mensajes_del_sistema');

  it('carga sin error', () => {
    assert.equal(resultado.error, null);
    assert.ok(resultado.cargadas > 0);
  });

  it('ningún pedido lleva la llave maestra', () => {
    assert.equal(llamadas.some((l) => l.credencial === LLAVE_MAESTRA || l.llave === LLAVE_MAESTRA), false);
  });

  it('lo de cada Prestadora se lee con la credencial de esa Prestadora', () => {
    for (const prestadora of [PRESTADORA_A, PRESTADORA_B]) {
      const propias = lecturas.filter((l) => l.filtro === `eq.${prestadora}`);
      assert.equal(propias.length, 1, `no se leyó lo de ${prestadora}`);
      assert.equal(propias[0].contenido.role, 'trabajo_sin_persona');
      assert.equal(propias[0].contenido.prestadora_id, prestadora);
    }
  });

  it('el texto del producto se lee una sola vez, adentro de una Prestadora', () => {
    const delProducto = lecturas.filter((l) => l.filtro === 'is.null');
    assert.equal(delProducto.length, 1);
    assert.equal(delProducto[0].contenido.role, 'trabajo_sin_persona');
    assert.ok(delProducto[0].contenido.prestadora_id);
  });

  it('ninguna lectura queda sin Prestadora en el filtro', () => {
    assert.equal(lecturas.some((l) => !l.filtro), false);
  });
});
