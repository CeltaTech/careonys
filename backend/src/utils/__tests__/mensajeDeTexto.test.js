/**
 * El proveedor de mensajes de texto de una Prestadora, leído sólo adentro de ella.
 *
 *   npm test --prefix backend
 *   node --test backend/src/utils/__tests__/mensajeDeTexto.test.js
 *
 * POR QUÉ EXISTE ESTA PRUEBA. `../mensajeDeTexto.js` lee con qué proveedor manda mensajes de texto
 * cada Prestadora con la credencial del trabajo de esa Prestadora, que la base acota a ella. Lo que
 * hay que sostener acá es que la lectura vaya con esa credencial y con ninguna otra, filtrada por la
 * Prestadora; que sin Prestadora no se lea nada; y que un proveedor apagado no cuente.
 *
 * La base es de mentira y contesta por HTTP como la de verdad: con la credencial del trabajo
 * contesta la fila de la Prestadora que lleva adentro, y con cualquier otra, ninguna.
 *
 * Con el sistema roto —la lectura con otra credencial, con la de otra Prestadora, o sin el filtro
 * de la Prestadora— las pruebas dan al revés.
 *
 * Datos inventados, como manda CLAUDE.md §6.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';

/** La fila de configuración que hay en la base para la Prestadora. */
let configuracion = null;

/** Todo lo que el backend le pidió a la base, con la dirección entera: los filtros van ahí. */
let llamadas = [];

/** Lo que dice adentro una credencial, o `null` si no se puede leer. */
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
    llamadas.push({ ruta: url.pathname, url, credencial: req.headers.authorization });

    const credencial = leerCredencial(req.headers.authorization ?? '');
    const puede = credencial?.role === 'trabajo_sin_persona' && credencial.prestadora_id === PRESTADORA;
    const filas = puede && configuracion ? [configuracion] : [];
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo ? (filas[0] ?? null) : filas));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

// El import va después de dejar puestas las variables de entorno: la conexión a la base se arma
// en el momento en que se importa, y con la dirección que haya en ese instante.
const { proveedorDeMensajeDeTexto } = await import('../mensajeDeTexto.js');

after(() => {
  baseFalsa.close();
});

beforeEach(() => {
  llamadas = [];
  configuracion = { proveedor: 'proveedor-de-prueba', remitente: 'Prueba', token_secret_id: null, activo: true };
});

describe('el proveedor de mensajes de texto', () => {
  it('se lee con la credencial del trabajo de la Prestadora, filtrando por ella', async () => {
    const proveedor = await proveedorDeMensajeDeTexto(PRESTADORA);

    assert.equal(proveedor?.proveedor, 'proveedor-de-prueba');
    assert.equal(llamadas.length, 1);
    const credencial = leerCredencial(llamadas[0].credencial ?? '');
    assert.equal(credencial?.role, 'trabajo_sin_persona', 'la lectura fue con otra credencial');
    assert.equal(credencial.prestadora_id, PRESTADORA, 'la lectura fue fuera de la Prestadora');
    assert.equal(llamadas[0].url.searchParams.get('prestadora_id'), `eq.${PRESTADORA}`);
  });

  it('un proveedor apagado no cuenta', async () => {
    configuracion = { ...configuracion, activo: false };

    assert.equal(await proveedorDeMensajeDeTexto(PRESTADORA), null);
  });

  it('sin Prestadora no lee nada', async () => {
    assert.equal(await proveedorDeMensajeDeTexto(null), null);
    assert.equal(llamadas.length, 0);
  });
});
