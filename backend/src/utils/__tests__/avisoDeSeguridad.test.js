/**
 * El mensaje de seguridad pregunta el idioma con el trabajo de la Prestadora de la cuenta.
 *
 *   node --test "src/**\/__tests__/*.test.js"   (desde backend/)
 *
 * Lo que se prueba es con qué credencial sale la consulta del idioma: la de esa Prestadora, nunca
 * la llave maestra ni la de otra. Una cuenta sin Prestadora no pregunta nada y el mensaje sale en
 * el idioma de por defecto. Sin medio de envío configurado el correo no sale, y eso acá alcanza:
 * lo que se mira es la consulta, no el envío.
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

/** Todo lo que el backend le pidió a la base. */
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    const url = new URL(req.url, 'http://interno');
    llamadas.push({
      clave: `${req.method} ${url.pathname}`,
      select: url.searchParams.get('select'),
      credencial: leerCredencial(req.headers.authorization ?? ''),
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(url.searchParams.get('select') === 'pais' ? { pais: 'AR' } : null));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

// El import va después de las variables de entorno: la conexión se arma al importar.
const { avisarDeSeguridad, MENSAJE_TELEFONO_CAMBIADO } = await import('../avisoDeSeguridad.js');

after(() => {
  baseFalsa.close();
});

beforeEach(() => {
  llamadas = [];
});

/** La consulta que contesta en qué idioma escribe la Prestadora. */
const delIdioma = () => llamadas.filter((l) => l.clave === 'GET /rest/v1/prestadoras' && l.select === 'pais');

describe('el mensaje de seguridad', () => {
  it('pregunta el idioma con el trabajo de la Prestadora de la cuenta, y no con la llave maestra', async () => {
    await avisarDeSeguridad(MENSAJE_TELEFONO_CAMBIADO, { email: 'persona@ejemplo.test', nombre: 'Ana', prestadora_id: PRESTADORA });

    assert.equal(delIdioma().length, 1, 'llegó a preguntar el idioma');
    assert.equal(delIdioma()[0].credencial?.role, 'trabajo_sin_persona');
    assert.equal(delIdioma()[0].credencial?.prestadora_id, PRESTADORA);
  });

  it('una cuenta sin Prestadora no pregunta el idioma', async () => {
    await avisarDeSeguridad(MENSAJE_TELEFONO_CAMBIADO, { email: 'persona@ejemplo.test', nombre: 'Ana', prestadora_id: null });
    assert.equal(delIdioma().length, 0);
  });
});
