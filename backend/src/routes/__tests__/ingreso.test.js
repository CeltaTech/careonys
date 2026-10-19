/**
 * Entrar con el nombre de usuario.
 *
 *   node --test src/routes/__tests__/ingreso.test.js
 *
 * QUÉ SE PRUEBA. La pantalla de ingreso manda el nombre de usuario y recibe la dirección con la que
 * el servicio de acceso conoce a esa cuenta (`direccionDeAcceso`). El nombre se
 * busca entero y en minúsculas, sin preguntar de qué Prestadora es. Y la respuesta tiene la misma
 * forma exista la cuenta o no: si cambiara, esta puerta serviría para averiguar quién tiene cuenta.
 *
 * Se levanta el router de verdad contra una base de mentira. Datos inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';
import { DOMINIO_DE_ACCESO } from '../../config/direccionDeAcceso.js';

const PRESTADORA = '11111111-1111-4111-8111-111111111111';
const CUENTA = '33333333-3333-4333-8333-333333333333';
const USUARIO = 'marta.g';

let rolDeLaCuenta = 'asistente';
let llamadas = [];

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
    let filas = [];
    if (clave === 'POST /rest/v1/rpc/cuenta_del_usuario') {
      filas = JSON.parse(crudo).p_usuario === USUARIO ? [{ id: CUENTA, prestadora_id: PRESTADORA }] : [];
    }
    if (clave === 'GET /rest/v1/usuarios' && credencial?.prestadora_id === PRESTADORA) {
      filas = [{ id: CUENTA, nombre: 'Nombre inventado', rol: rolDeLaCuenta, email: 'inventado@ejemplo.test', prestadora_id: PRESTADORA }];
    }
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(Array.isArray(filas) && unoSolo ? (filas[0] ?? null) : filas));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

const { default: express } = await import('express');
const { ingresoRouter } = await import('../ingreso.js');

const app = express();
app.use(express.json());
app.use('/api/ingreso', ingresoRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const RAIZ = `http://127.0.0.1:${backend.address().port}/api/ingreso`;

after(() => {
  backend.close();
  baseFalsa.close();
});

beforeEach(() => {
  llamadas = [];
  rolDeLaCuenta = 'asistente';
});

async function pedirDireccion(usuario) {
  const respuesta = await fetch(`${RAIZ}/correo-de-acceso`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario }),
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const FORMA_DE_ACCESO = new RegExp(`^${UUID}@${DOMINIO_DE_ACCESO.split('.').join('\\.')}$`);

describe('entrar con el nombre de usuario', () => {
  for (const rol of ['asistente', 'cliente', 'coordinador']) {
    it(`a la cuenta de rol ${rol} le da su dirección de acceso`, async () => {
      rolDeLaCuenta = rol;
      const { estado, cuerpo } = await pedirDireccion(USUARIO);
      assert.equal(estado, 200);
      assert.equal(cuerpo.correo, `${CUENTA}@acceso.careonys.invalid`);
    });
  }

  it('busca el nombre entero, en minúsculas y sin espacios, sin preguntar la Prestadora', async () => {
    const { cuerpo } = await pedirDireccion(`  ${USUARIO.toUpperCase()} `);
    assert.equal(cuerpo.correo, `${CUENTA}@acceso.careonys.invalid`);
    const pregunta = llamadas.find((l) => l.clave === 'POST /rest/v1/rpc/cuenta_del_usuario');
    assert.deepEqual(JSON.parse(pregunta.cuerpo), { p_usuario: USUARIO });
    assert.equal(pregunta.credencial?.role, 'trabajo_sin_persona');
    assert.equal(pregunta.credencial.prestadora_id, undefined, 'la pregunta fue adentro de una Prestadora');
    // La cuenta se lee después adentro de su Prestadora, y de ninguna otra.
    const lectura = llamadas.find((l) => l.clave === 'GET /rest/v1/usuarios');
    assert.equal(lectura.credencial?.prestadora_id, PRESTADORA);
  });

  it('un nombre sin cuenta recibe una dirección con la misma forma, que no es de nadie', async () => {
    const { estado, cuerpo } = await pedirDireccion('nadie');
    assert.equal(estado, 200);
    assert.match(cuerpo.correo, FORMA_DE_ACCESO);
    assert.notEqual(cuerpo.correo, `${CUENTA}@acceso.careonys.invalid`);
    // Y siempre la misma para el mismo nombre: una que cambiara en cada pedido delataría que no existe.
    assert.equal((await pedirDireccion('nadie')).cuerpo.correo, cuerpo.correo);
    assert.notEqual((await pedirDireccion('otro.nadie')).cuerpo.correo, cuerpo.correo);
  });

  for (const rol of ['admin_prestadora', 'superadmin']) {
    it(`la cuenta de rol ${rol} no entra por nombre de usuario`, async () => {
      rolDeLaCuenta = rol;
      const { estado, cuerpo } = await pedirDireccion(USUARIO);
      assert.equal(estado, 200);
      assert.match(cuerpo.correo, FORMA_DE_ACCESO);
      assert.notEqual(cuerpo.correo, `${CUENTA}@acceso.careonys.invalid`);
    });
  }

  it('sin nombre contesta que faltan datos y no le pregunta nada a la base', async () => {
    const { estado, cuerpo } = await pedirDireccion('   ');
    assert.equal(estado, 400);
    assert.equal(cuerpo.error, 'faltan_datos');
    assert.equal(llamadas.length, 0);
  });
});
