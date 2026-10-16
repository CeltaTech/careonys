/**
 * La dirección de una Prestadora —la que va en el enlace de los correos con código— se lee con el
 * trabajo de esa Prestadora, nunca con la llave maestra ni con la de otra.
 *
 *   node --test src/utils/__tests__/direccionDeLaPrestadora.test.js
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

let filas = [];
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    const url = new URL(req.url, 'http://interno');
    llamadas.push({ ruta: url.pathname, consulta: url.searchParams, credencial: leerCredencial(req.headers.authorization ?? '') });
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo ? (filas[0] ?? null) : filas));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

// El import va después de las variables de entorno: la conexión se arma al importar.
const { rotuloDeLaPrestadora, enlaceConCodigo } = await import('../direccionDeLaPrestadora.js');

after(() => {
  baseFalsa.close();
});

beforeEach(() => {
  llamadas = [];
  filas = [{ dominio: 'cuidardelsur' }];
});

describe('la dirección de la Prestadora', () => {
  it('se lee con el trabajo de esa Prestadora, y no con la llave maestra', async () => {
    assert.equal(await rotuloDeLaPrestadora(PRESTADORA), 'cuidardelsur');
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].ruta, '/rest/v1/configuracion_prestadora');
    assert.equal(llamadas[0].credencial?.role, 'trabajo_sin_persona');
    assert.equal(llamadas[0].credencial?.prestadora_id, PRESTADORA);
    assert.equal(llamadas[0].consulta.get('prestadora_id'), `eq.${PRESTADORA}`);
  });

  it('va en el enlace del correo con el código', async () => {
    const enlace = await enlaceConCodigo({ appUrl: 'https://app.invalid', pantalla: 'activar-cuenta', prestadoraId: PRESTADORA, codigo: 'abc' });
    assert.equal(enlace, 'https://app.invalid/activar-cuenta?prestadora=cuidardelsur&token=abc');
  });

  it('sin dirección guardada no hay enlace', async () => {
    filas = [];
    assert.equal(await enlaceConCodigo({ appUrl: 'https://app.invalid', pantalla: 'activar-cuenta', prestadoraId: PRESTADORA, codigo: 'abc' }), null);
  });

  it('sin Prestadora no hay dirección, y ni siquiera le pregunta a la base', async () => {
    assert.equal(await rotuloDeLaPrestadora(null), null);
    assert.equal(llamadas.length, 0);
  });
});
