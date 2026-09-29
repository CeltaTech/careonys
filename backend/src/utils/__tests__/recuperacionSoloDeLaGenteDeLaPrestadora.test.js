/**
 * El producto recupera la clave de la gente de la Prestadora, y de nadie más.
 *
 *   npm test --prefix backend
 *
 * QUÉ SE PRUEBA. La cuenta del Administrador y la del equipo técnico son de CeltaTech, y su clave
 * también: el producto no la recupera. La cuenta se busca sólo entre coordinación, Asistentes y
 * Familias, y si el correo es de otra cuenta no se emite ningún enlace.
 *
 * La base es de mentira y contesta como la de verdad: la fila de `usuarios` sólo vuelve si el
 * pedido la deja pasar por su rol.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const LOS_ROLES_DE_LA_PRESTADORA = 'in.(coordinador,asistente,familia)';

let rolDeLaCuenta = 'admin_prestadora';
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    const url = new URL(req.url, 'http://interno');
    llamadas.push({ metodo: req.method, ruta: url.pathname, filtros: url.searchParams });

    let valor = [];
    if (req.method === 'GET' && url.pathname === '/rest/v1/usuarios') {
      const filtroDeRol = url.searchParams.get('rol');
      const pasa = !filtroDeRol
        || filtroDeRol.replace(/^in\.\(|\)$/g, '').split(',').includes(rolDeLaCuenta);
      valor = pasa ? [{ id: '33333333-3333-3333-3333-333333333333', nombre: 'Persona De Prueba', rol: rolDeLaCuenta, prestadora_id: PRESTADORA }] : [];
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
process.env.PANEL_URL = 'http://panel.invalido';
process.env.PWA_ASISTENTES_URL = 'http://asistentes.invalido';
process.env.PWA_FAMILIAS_URL = 'http://familias.invalido';

const { pedirRecuperacionDeClave } = await import('../recuperacionDeClave.js');

after(() => {
  baseFalsa.close();
});

beforeEach(() => {
  llamadas = [];
});

// Lo primero que se hace con una cuenta encontrada es anular sus enlaces anteriores. El enlace
// nuevo necesita además la dirección de la Prestadora, que esta base de mentira no tiene.
function seEmpezoAEmitirUnEnlace() {
  return llamadas.some((l) => l.ruta === '/rest/v1/tokens_recuperacion_clave');
}

describe('recuperar la clave', () => {
  it('a la gente de la Prestadora le emite el enlace', async () => {
    rolDeLaCuenta = 'familia';
    await pedirRecuperacionDeClave('persona@ejemplo.invalido', PRESTADORA);
    assert.equal(seEmpezoAEmitirUnEnlace(), true);
  });

  it('busca la cuenta sólo entre la gente de la Prestadora', async () => {
    rolDeLaCuenta = 'coordinador';
    await pedirRecuperacionDeClave('persona@ejemplo.invalido', PRESTADORA);

    const busqueda = llamadas.find((l) => l.metodo === 'GET' && l.ruta === '/rest/v1/usuarios');
    assert.ok(busqueda, 'no se buscó la cuenta');
    assert.equal(busqueda.filtros.get('rol'), LOS_ROLES_DE_LA_PRESTADORA);
  });

  for (const rol of ['admin_prestadora', 'superadmin']) {
    it(`no emite ningún enlace para la cuenta de rol ${rol}`, async () => {
      rolDeLaCuenta = rol;
      await pedirRecuperacionDeClave('persona@ejemplo.invalido', PRESTADORA);
      assert.ok(llamadas.some((l) => l.metodo === 'GET' && l.ruta === '/rest/v1/usuarios'), 'no se buscó la cuenta');
      assert.equal(seEmpezoAEmitirUnEnlace(), false);
    });
  }
});
