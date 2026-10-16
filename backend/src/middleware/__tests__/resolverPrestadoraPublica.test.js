/**
 * La puerta pública pregunta de qué Prestadora es la dirección sin Prestadora, y lee su
 * configuración con el trabajo de esa Prestadora y de ninguna otra.
 *
 *   node --test src/middleware/__tests__/resolverPrestadoraPublica.test.js
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

let llamadas = [];
/** De qué Prestadora es la dirección, según la base. */
let prestadoraDeLaDireccion = PRESTADORA;
/** La configuración que contesta la base. */
let configuracion = { prestadora_id: PRESTADORA, dominio: 'ejemplo' };

const baseFalsa = createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    const url = new URL(req.url, 'http://interno');
    llamadas.push({ ruta: url.pathname, consulta: url.searchParams, credencial: leerCredencial(req.headers.authorization ?? '') });
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/rest/v1/rpc/prestadora_de_la_direccion') {
      res.end(JSON.stringify(prestadoraDeLaDireccion));
      return;
    }
    res.end(JSON.stringify(configuracion ? [configuracion] : []));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

// El import va después de las variables de entorno: la conexión se arma al importar.
const { resolverPrestadoraPublica } = await import('../resolverPrestadoraPublica.js');

after(() => {
  baseFalsa.close();
});

beforeEach(() => {
  llamadas = [];
  prestadoraDeLaDireccion = PRESTADORA;
  configuracion = { prestadora_id: PRESTADORA, dominio: 'ejemplo' };
});

async function correr(direccion = 'Ejemplo') {
  const req = { params: { prestadora: direccion } };
  let estado = null;
  let paso = false;
  const res = {
    status(codigo) {
      estado = codigo;
      return this;
    },
    json() {
      return this;
    },
  };
  await resolverPrestadoraPublica(req, res, () => {
    paso = true;
  });
  return { req, paso, estado };
}

describe('la puerta pública', () => {
  it('lee la configuración con el trabajo de la Prestadora de la dirección, y no con la llave maestra', async () => {
    const { req, paso } = await correr();
    assert.equal(paso, true);
    assert.deepEqual(req.prestadoraPublica, configuracion);

    const [pregunta, lectura] = llamadas;
    assert.equal(llamadas.length, 2);
    assert.equal(pregunta.ruta, '/rest/v1/rpc/prestadora_de_la_direccion');
    assert.equal(pregunta.credencial?.role, 'trabajo_sin_persona');
    assert.ok(!pregunta.credencial?.prestadora_id, 'la pregunta sale sin Prestadora');

    assert.equal(lectura.ruta, '/rest/v1/configuracion_prestadora');
    assert.equal(lectura.credencial?.role, 'trabajo_sin_persona');
    assert.equal(lectura.credencial?.prestadora_id, PRESTADORA);
    assert.equal(lectura.consulta.get('prestadora_id'), `eq.${PRESTADORA}`);
  });

  it('una dirección que no es de ninguna Prestadora no lee nada más', async () => {
    prestadoraDeLaDireccion = null;
    const { paso, estado } = await correr();
    assert.equal(paso, false);
    assert.equal(estado, 404);
    assert.equal(llamadas.length, 1);
  });

  it('sin configuración no deja pasar', async () => {
    configuracion = null;
    const { paso, estado } = await correr();
    assert.equal(paso, false);
    assert.equal(estado, 404);
  });
});
