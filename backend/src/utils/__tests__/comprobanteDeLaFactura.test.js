/**
 * El comprobante de la factura se guarda, se ofrece para bajar y se consulta con el trabajo de la
 * Prestadora de la factura, nunca con la llave maestra ni con la de otra.
 *
 *   node --test src/utils/__tests__/comprobanteDeLaFactura.test.js
 *
 * La base y el depósito son de mentira y anotan con qué credencial les llegó cada pedido. Qué deja
 * hacer la base al trabajo lo deciden sus políticas, y eso no se prueba sin base.
 *
 * Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLIENTE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FACTURA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PDF = Buffer.from('%PDF-1.4 de mentira');

/** Lo que lleva adentro la credencial con la que llegó un pedido: quién es y de qué Prestadora. */
function leerCredencial(autorizacion) {
  try {
    return JSON.parse(Buffer.from(autorizacion.replace('Bearer ', '').split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

let llamadas = [];
let regla = null;

const baseFalsa = createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    const url = new URL(req.url, 'http://interno');
    llamadas.push({ metodo: req.method, ruta: url.pathname, credencial: leerCredencial(req.headers.authorization ?? '') });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (url.pathname.startsWith('/storage/v1/object/sign/')) {
      res.end(JSON.stringify({ signedURL: '/object/sign/x?token=y' }));
      return;
    }
    if (url.pathname.startsWith('/storage/v1/object/')) {
      res.end(JSON.stringify({ Key: 'x', Id: 'x' }));
      return;
    }
    if (url.pathname === '/rest/v1/configuracion_facturacion_clientes') {
      res.end(JSON.stringify(regla ? { regla } : null));
      return;
    }
    res.end(JSON.stringify([]));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

// El import va después de las variables de entorno: la conexión se arma al importar.
const { guardarComprobante, direccionParaBajarElComprobante, laPrestadoraEntregaLaFactura } = await import(
  '../comprobanteDeLaFactura.js'
);

after(() => {
  baseFalsa.close();
});

beforeEach(() => {
  llamadas = [];
  regla = null;
});

/** Que cada pedido haya salido con el trabajo de esa Prestadora. */
function todasConElTrabajoDe(prestadoraId) {
  assert.ok(llamadas.length > 0, 'llegó a preguntarle a la base');
  for (const llamada of llamadas) {
    assert.equal(llamada.credencial?.role, 'trabajo_sin_persona', llamada.ruta);
    assert.equal(llamada.credencial?.prestadora_id, prestadoraId, llamada.ruta);
  }
}

describe('el comprobante de la factura', () => {
  it('se sube y se anota con el trabajo de esa Prestadora, y no con la llave maestra', async () => {
    const { error, ruta } = await guardarComprobante({ prestadoraId: PRESTADORA, facturaId: FACTURA, clienteId: CLIENTE, bytes: PDF });
    assert.equal(error, null);
    assert.ok(ruta.startsWith(`${PRESTADORA}/${CLIENTE}/`), ruta);
    assert.deepEqual(llamadas.map((l) => l.metodo + ' ' + l.ruta.split('/').slice(0, 5).join('/')), [
      'POST /storage/v1/object/comprobantes-cliente',
      'PATCH /rest/v1/facturas_cliente',
    ]);
    todasConElTrabajoDe(PRESTADORA);
  });

  it('el enlace para bajarlo se pide con el trabajo de esa Prestadora', async () => {
    const direccion = await direccionParaBajarElComprobante(PRESTADORA, `${PRESTADORA}/${CLIENTE}/a.pdf`);
    assert.ok(direccion);
    assert.ok(llamadas[0].ruta.startsWith('/storage/v1/object/sign/comprobantes-cliente/'));
    todasConElTrabajoDe(PRESTADORA);
  });

  it('si entrega la factura lo pregunta el trabajo de esa Prestadora', async () => {
    regla = { entrega_la_factura: false };
    assert.equal(await laPrestadoraEntregaLaFactura(PRESTADORA), false);
    todasConElTrabajoDe(PRESTADORA);
  });

  it('sin Prestadora no hace nada, y ni siquiera le pregunta a la base', async () => {
    const { error } = await guardarComprobante({ prestadoraId: null, facturaId: FACTURA, clienteId: CLIENTE, bytes: PDF });
    assert.ok(error);
    assert.equal(await direccionParaBajarElComprobante(null, 'x/y.pdf'), null);
    await assert.rejects(laPrestadoraEntregaLaFactura(null));
    assert.equal(llamadas.length, 0);
  });
});
