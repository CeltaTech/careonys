/**
 * Las escrituras sobre la propia cuenta del Panel: marcar el número verificado y cambiarlo.
 *
 *   npm test --prefix backend
 *   node --test backend/src/routes/__tests__/panelCuentaSegura.test.js
 *
 * POR QUÉ EXISTE ESTA PRUEBA. La base no le da a nadie con sesión permiso de modificar su fila de
 * `usuarios`, así que las dos escrituras de `../panelCuentaSegura.js` pasan por
 * `escribirMiCuenta`, que va con la credencial del trabajo de la Prestadora de la cuenta, y la base
 * la acota a esa Prestadora. Lo que hay que sostener acá es que vaya con esa credencial y con
 * ninguna otra, filtrada por la cuenta y por su Prestadora, y que sin Prestadora no escriba nada.
 *
 * Se prueba la función y no la ruta entera porque lo demás que hace la ruta —el código al teléfono,
 * los prefijos de celular, el aviso— todavía va con la llave maestra, y una prueba nueva no puede
 * nombrarla (`scripts/verificar_llave_maestra.mjs`).
 *
 * La base es de mentira y contesta por HTTP como la de verdad: con la credencial del trabajo deja
 * escribir sólo las filas de la Prestadora que lleva adentro, y con cualquier otra, ninguna.
 *
 * Con el sistema roto —la escritura con otra credencial, con la de otra Prestadora, o sin los
 * filtros— las pruebas dan al revés.
 *
 * Datos inventados, como manda CLAUDE.md §6.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const USUARIO = '22222222-2222-2222-2222-222222222222';

const CUENTA = { id: USUARIO, prestadora_id: PRESTADORA };

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
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const url = new URL(req.url, 'http://interno');
    llamadas.push({ clave: `${req.method} ${url.pathname}`, url, cuerpo: crudo, credencial: req.headers.authorization });

    const credencial = leerCredencial(req.headers.authorization ?? '');
    const puede = credencial?.role === 'trabajo_sin_persona' && credencial.prestadora_id === PRESTADORA;
    res.writeHead(puede ? 200 : 403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(puede ? [] : { message: 'permiso denegado' }));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

// El import va después de dejar puestas las variables de entorno: la conexión a la base se arma
// en el momento en que se importa, y con la dirección que haya en ese instante.
const { escribirMiCuenta } = await import('../panelCuentaSegura.js');

after(() => {
  baseFalsa.close();
});

/** La escritura sobre la cuenta: la única que modifica `usuarios`. */
function escrituraDeLaCuenta() {
  const escrituras = llamadas.filter((l) => l.clave === 'PATCH /rest/v1/usuarios');
  assert.equal(escrituras.length, 1, 'tenía que haber una sola escritura sobre la cuenta');
  return escrituras[0];
}

beforeEach(() => {
  llamadas = [];
});

describe('la seguridad de la propia cuenta', () => {
  it('escribe con la credencial del trabajo de la Prestadora de la cuenta, filtrando por la cuenta y la Prestadora', async () => {
    const { error } = await escribirMiCuenta(CUENTA, { telefono: '+5400000002', telefono_verificado_en: null });

    assert.equal(error, null);
    const escritura = escrituraDeLaCuenta();
    const credencial = leerCredencial(escritura.credencial ?? '');
    assert.equal(credencial?.role, 'trabajo_sin_persona', 'la escritura fue con otra credencial');
    assert.equal(credencial.prestadora_id, PRESTADORA, 'la escritura fue fuera de la Prestadora de la cuenta');
    assert.equal(escritura.url.searchParams.get('id'), `eq.${USUARIO}`);
    assert.equal(escritura.url.searchParams.get('prestadora_id'), `eq.${PRESTADORA}`);
    assert.deepEqual(JSON.parse(escritura.cuerpo), { telefono: '+5400000002', telefono_verificado_en: null });
  });

  it('una cuenta sin Prestadora no escribe nada', async () => {
    await assert.rejects(async () => escribirMiCuenta({ id: USUARIO, prestadora_id: null }, { telefono_verificado_en: null }));
    assert.equal(llamadas.length, 0);
  });
});
