/**
 * La advertencia legal se resuelve y se registra con el trabajo de esa Prestadora, nunca con la
 * llave maestra ni con la de otra.
 *
 *   node --test src/utils/__tests__/advertenciaLegal.test.js
 *
 * La base es de mentira y anota con qué credencial le llegó cada consulta. Qué filas le deja ver la
 * base al trabajo lo deciden sus políticas, y eso no se prueba sin base.
 *
 * Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USUARIO = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

/** Lo que lleva adentro la credencial con la que llegó un pedido: quién es y de qué Prestadora. */
function leerCredencial(autorizacion) {
  try {
    return JSON.parse(Buffer.from(autorizacion.replace('Bearer ', '').split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

/** Qué contesta la base a cada ruta. Cada prueba prepara lo suyo. */
const respuestas = new Map();
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    llamadas.push({ metodo: req.method, ruta, credencial: leerCredencial(req.headers.authorization ?? '') });
    const valor = respuestas.get(ruta);
    if (valor === undefined || valor?.__estado) {
      res.writeHead(valor?.__estado ?? 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `sin respuesta para ${ruta}` }));
      return;
    }
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? (valor[0] ?? null) : valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

// El import va después de las variables de entorno: la conexión se arma al importar.
const { advertenciaVigente, registrarAdvertencia } = await import('../advertenciaLegal.js');

after(() => {
  baseFalsa.close();
});

beforeEach(() => {
  respuestas.clear();
  llamadas = [];
  respuestas.set('/rest/v1/prestadoras', [{ pais: 'AR' }]);
  respuestas.set('/rest/v1/advertencias_legales', [{ funcion_clave: 'una_funcion', texto_advertencia: 'Texto de ejemplo.' }]);
  respuestas.set('/rest/v1/auditoria_advertencias_legales', []);
});

/** Que cada pedido haya salido con el trabajo de esa Prestadora. */
function todasConElTrabajoDe(prestadoraId) {
  assert.ok(llamadas.length > 0, 'llegó a preguntarle a la base');
  for (const llamada of llamadas) {
    assert.equal(llamada.credencial?.role, 'trabajo_sin_persona', llamada.ruta);
    assert.equal(llamada.credencial?.prestadora_id, prestadoraId, llamada.ruta);
  }
}

describe('la advertencia legal', () => {
  it('se resuelve con el trabajo de esa Prestadora, y no con la llave maestra', async () => {
    assert.deepEqual(await advertenciaVigente(PRESTADORA, 'una_funcion'), { jurisdiccion: 'AR', texto: 'Texto de ejemplo.' });
    todasConElTrabajoDe(PRESTADORA);
  });

  it('se registra con el trabajo de esa Prestadora, y no con la llave maestra', async () => {
    const advertencia = { jurisdiccion: 'AR', texto: 'Texto de ejemplo.' };
    await registrarAdvertencia({ prestadoraId: PRESTADORA, usuarioId: USUARIO, funcionClave: 'una_funcion', advertencia });
    assert.deepEqual(llamadas.map((l) => `${l.metodo} ${l.ruta}`), ['POST /rest/v1/auditoria_advertencias_legales']);
    todasConElTrabajoDe(PRESTADORA);
  });

  it('sin documento del país no hay advertencia', async () => {
    respuestas.set('/rest/v1/advertencias_legales', []);
    assert.equal(await advertenciaVigente(PRESTADORA, 'una_funcion'), null);
  });

  it('si la base falla no hay advertencia, y quien llama sigue', async () => {
    respuestas.set('/rest/v1/advertencias_legales', { __estado: 500 });
    assert.equal(await advertenciaVigente(PRESTADORA, 'una_funcion'), null);
  });

  it('sin Prestadora no le pregunta a la base ni registra nada', async () => {
    assert.equal(await advertenciaVigente(null, 'una_funcion'), null);
    const advertencia = { jurisdiccion: 'AR', texto: 'Texto de ejemplo.' };
    assert.equal(await registrarAdvertencia({ prestadoraId: null, usuarioId: USUARIO, funcionClave: 'una_funcion', advertencia }), advertencia);
    assert.equal(llamadas.length, 0);
  });
});
