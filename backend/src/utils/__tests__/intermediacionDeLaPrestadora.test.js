/**
 * Las modalidades y las funciones de riesgo de una Prestadora se preguntan con el trabajo de esa
 * Prestadora, nunca con la llave maestra ni con la de otra.
 *
 *   node --test src/utils/__tests__/intermediacionDeLaPrestadora.test.js
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
    llamadas.push({ ruta, credencial: leerCredencial(req.headers.authorization ?? '') });
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
const { ofreceIntermediacion, funcionDeRiesgoEncendida } = await import('../intermediacionDeLaPrestadora.js');

after(() => {
  baseFalsa.close();
});

beforeEach(() => {
  respuestas.clear();
  llamadas = [];
});

/** Que cada pedido haya salido con el trabajo de esa Prestadora. */
function todasConElTrabajoDe(prestadoraId) {
  assert.ok(llamadas.length > 0, 'llegó a preguntarle a la base');
  for (const llamada of llamadas) {
    assert.equal(llamada.credencial?.role, 'trabajo_sin_persona', llamada.ruta);
    assert.equal(llamada.credencial?.prestadora_id, prestadoraId, llamada.ruta);
  }
}

describe('si la Prestadora ofrece Match', () => {
  it('lo pregunta el trabajo de esa Prestadora, y no la llave maestra', async () => {
    respuestas.set('/rest/v1/prestadora_modalidades', [{ modalidad: 'intermediacion' }]);
    assert.equal(await ofreceIntermediacion(PRESTADORA), true);
    todasConElTrabajoDe(PRESTADORA);
  });

  it('sin la fila no la ofrece', async () => {
    respuestas.set('/rest/v1/prestadora_modalidades', []);
    assert.equal(await ofreceIntermediacion(PRESTADORA), false);
  });

  it('sin Prestadora no la ofrece, y ni siquiera le pregunta a la base', async () => {
    assert.equal(await ofreceIntermediacion(null), false);
    assert.equal(llamadas.length, 0);
  });
});

describe('si una función de riesgo está encendida', () => {
  it('lo pregunta el trabajo de esa Prestadora, y no la llave maestra', async () => {
    respuestas.set('/rest/v1/configuracion_funciones_intermediacion', [{ activa: true }]);
    assert.equal(await funcionDeRiesgoEncendida(PRESTADORA, 'una_funcion'), true);
    todasConElTrabajoDe(PRESTADORA);
  });

  it('si la base falla la da por apagada', async () => {
    respuestas.set('/rest/v1/configuracion_funciones_intermediacion', { __estado: 500 });
    assert.equal(await funcionDeRiesgoEncendida(PRESTADORA, 'una_funcion'), false);
  });

  it('sin Prestadora la da por apagada, y ni siquiera le pregunta a la base', async () => {
    assert.equal(await funcionDeRiesgoEncendida(null, 'una_funcion'), false);
    assert.equal(llamadas.length, 0);
  });
});
