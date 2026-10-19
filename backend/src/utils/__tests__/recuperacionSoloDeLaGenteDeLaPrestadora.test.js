/**
 * El producto recupera la clave de la gente de la Prestadora, y de nadie más.
 *
 *   npm test --prefix backend
 *
 * QUÉ SE PRUEBA. La persona pide con su nombre de usuario, y el enlace va al email declarado de esa
 * cuenta. La cuenta del Administrador y la del equipo técnico son de CeltaTech, y su clave también:
 * el producto no la recupera, aunque el nombre exista. Y una cuenta sin email declarado no recibe
 * nada, porque no hay a dónde mandarlo.
 *
 * La base es de mentira y contesta como la de verdad: el nombre se resuelve a una cuenta y una
 * Prestadora, y la cuenta se lee después adentro de esa Prestadora.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const CUENTA = '33333333-3333-3333-3333-333333333333';
const USUARIO = 'persona.prueba';

let rolDeLaCuenta = 'admin_prestadora';
let emailDeLaCuenta = 'persona@ejemplo.invalido';
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const url = new URL(req.url, 'http://interno');
    llamadas.push({ metodo: req.method, ruta: url.pathname, filtros: url.searchParams, cuerpo: crudo });

    let valor = [];
    if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/cuenta_del_usuario') {
      valor = JSON.parse(crudo).p_usuario === USUARIO ? [{ id: CUENTA, prestadora_id: PRESTADORA }] : [];
    }
    if (req.method === 'GET' && url.pathname === '/rest/v1/usuarios') {
      valor = [{ id: CUENTA, nombre: 'Persona De Prueba', rol: rolDeLaCuenta, email: emailDeLaCuenta, prestadora_id: PRESTADORA }];
    }
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    if (unoSolo && valor.length === 0) {
      res.writeHead(406, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 'PGRST116', message: 'sin filas' }));
      return;
    }
    // El tope de pedidos cuenta con este encabezado, que es donde la base contesta cuántos hubo.
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Range': '*/0' });
    res.end(JSON.stringify(unoSolo ? valor[0] : valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-mentira';
prepararCredencialDePrueba();
process.env.PANEL_URL = 'http://panel.invalido';
process.env.PWA_ASISTENTES_URL = 'http://asistentes.invalido';
process.env.PWA_CLIENTES_URL = 'http://clientes.invalido';

const { pedirRecuperacionPorNombreDeUsuario } = await import('../recuperacionDeClave.js');

after(() => {
  baseFalsa.close();
});

beforeEach(() => {
  llamadas = [];
  emailDeLaCuenta = 'persona@ejemplo.invalido';
});

// Lo primero que se hace con una cuenta encontrada es anular sus enlaces anteriores. El enlace
// nuevo necesita además la dirección de la Prestadora, que esta base de mentira no tiene.
function seEmpezoAEmitirUnEnlace() {
  return llamadas.some((l) => l.ruta === '/rest/v1/tokens_recuperacion_clave');
}

describe('recuperar la clave', () => {
  it('a la gente de la Prestadora le emite el enlace', async () => {
    rolDeLaCuenta = 'cliente';
    await pedirRecuperacionPorNombreDeUsuario(USUARIO);
    assert.equal(seEmpezoAEmitirUnEnlace(), true);
  });

  it('busca la cuenta por el nombre entero, escrito en minúsculas', async () => {
    rolDeLaCuenta = 'asistente';
    await pedirRecuperacionPorNombreDeUsuario(`  ${USUARIO.toUpperCase()} `);
    const pregunta = llamadas.find((l) => l.ruta === '/rest/v1/rpc/cuenta_del_usuario');
    assert.ok(pregunta, 'no se preguntó de quién es el nombre');
    assert.deepEqual(JSON.parse(pregunta.cuerpo), { p_usuario: USUARIO });
    assert.equal(seEmpezoAEmitirUnEnlace(), true);
  });

  it('un nombre sin cuenta no emite nada y no lee ninguna cuenta', async () => {
    rolDeLaCuenta = 'cliente';
    await pedirRecuperacionPorNombreDeUsuario('nadie');
    assert.equal(llamadas.some((l) => l.ruta === '/rest/v1/usuarios'), false);
    assert.equal(seEmpezoAEmitirUnEnlace(), false);
  });

  it('una cuenta sin email declarado no recibe nada', async () => {
    rolDeLaCuenta = 'coordinador';
    emailDeLaCuenta = null;
    await pedirRecuperacionPorNombreDeUsuario(USUARIO);
    assert.ok(llamadas.some((l) => l.metodo === 'GET' && l.ruta === '/rest/v1/usuarios'), 'no se leyó la cuenta');
    assert.equal(seEmpezoAEmitirUnEnlace(), false);
  });

  for (const rol of ['admin_prestadora', 'superadmin']) {
    it(`no emite ningún enlace para la cuenta de rol ${rol}`, async () => {
      rolDeLaCuenta = rol;
      await pedirRecuperacionPorNombreDeUsuario(USUARIO);
      assert.ok(llamadas.some((l) => l.metodo === 'GET' && l.ruta === '/rest/v1/usuarios'), 'no se leyó la cuenta');
      assert.equal(seEmpezoAEmitirUnEnlace(), false);
    });
  }
});
