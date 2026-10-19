/**
 * El consentimiento de quien paga cuando otra persona ya lo cerró o lo anuló.
 *
 *   npm test --prefix backend
 *   node --test backend/src/utils/__tests__/consentimientoPagadorYaCerrado.test.js
 *
 * Dos personas con la misma página abierta: una registra la firma o lo anula, y la otra, que
 * todavía lo ve pendiente, intenta lo mismo. No hay nada que hacer y no es un error: no se toca
 * nada, se contesta bien, y la pantalla vuelve a leer y muestra cómo quedó.
 *
 * La base es de mentira y contesta por HTTP igual que la de verdad, y aplica los filtros de cada
 * pedido —también los de una modificación—: si no los aplicara, «ya estaba cerrado» no se podría
 * distinguir de «se cerró ahora», y la prueba no podría fallar.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const PRESTADORA_AJENA = '22222222-2222-2222-2222-222222222222';
const CONSENTIMIENTO = '33333333-3333-3333-3333-333333333333';

let consentimientos = [];
let modificaciones = [];

const cumple = (fila, url) =>
  [...url.searchParams].every(([columna, condicion]) => {
    if (!(columna in fila)) return true;
    const texto = String(condicion);
    if (texto.startsWith('eq.')) return String(fila[columna]) === texto.slice(3);
    return true;
  });

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const url = new URL(req.url, 'http://interno');
    const cuerpo = crudo ? JSON.parse(crudo) : null;
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    const responder = (filas) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(unoSolo ? (filas[0] ?? null) : filas));
    };

    if (url.pathname !== '/rest/v1/consentimientos_pagador') return responder([]);

    if (req.method === 'PATCH') {
      modificaciones.push(cuerpo);
      const tocadas = [];
      consentimientos = consentimientos.map((fila) => {
        if (!cumple(fila, url)) return fila;
        const nueva = { ...fila, ...cuerpo };
        tocadas.push(nueva);
        return nueva;
      });
      return responder(tocadas);
    }
    return responder(consentimientos.filter((fila) => cumple(fila, url)));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-mentira';
prepararCredencialDePrueba();

// El import va después de las variables de entorno: la conexión se arma al importarse.
const { anularPendiente, cerrarConPapelFirmado } = await import('../consentimientoPagador.js');

after(() => baseFalsa.close());

const unConsentimiento = (estado) => ({
  id: CONSENTIMIENTO,
  prestadora_id: PRESTADORA,
  estado,
  archivo_firmado_url: estado === 'cerrado' ? 'otra/ruta.pdf' : null,
});

beforeEach(() => {
  consentimientos = [];
  modificaciones = [];
});

const pedido = { consentimientoId: CONSENTIMIENTO, prestadoraId: PRESTADORA };

describe('Registrar la firma de un consentimiento', () => {
  it('pendiente: lo cierra con el archivo', async () => {
    consentimientos = [unConsentimiento('pendiente_firma')];
    const cerrado = await cerrarConPapelFirmado({ ...pedido, archivoUrl: 'ruta/nueva.pdf' });
    assert.equal(cerrado, true);
    assert.equal(consentimientos[0].estado, 'cerrado');
    assert.equal(consentimientos[0].archivo_firmado_url, 'ruta/nueva.pdf');
  });

  for (const estado of ['cerrado', 'anulado']) {
    it(`ya ${estado}: contesta sin error y no toca nada`, async () => {
      consentimientos = [unConsentimiento(estado)];
      const antes = structuredClone(consentimientos);
      const cerrado = await cerrarConPapelFirmado({ ...pedido, archivoUrl: 'ruta/nueva.pdf' });
      assert.equal(cerrado, false);
      assert.deepEqual(consentimientos, antes);
      assert.equal(modificaciones.length, 0, 'no se le pidió ninguna modificación a la base');
    });
  }

  it('de otra Prestadora: no lo encuentra', async () => {
    consentimientos = [{ ...unConsentimiento('pendiente_firma'), prestadora_id: PRESTADORA_AJENA }];
    await assert.rejects(
      cerrarConPapelFirmado({ ...pedido, archivoUrl: 'ruta/nueva.pdf' }),
      (err) => err.motivo === 'no_encontrado',
    );
    assert.equal(consentimientos[0].estado, 'pendiente_firma');
  });
});

describe('Anular un consentimiento', () => {
  it('pendiente: lo anula', async () => {
    consentimientos = [unConsentimiento('pendiente_firma')];
    assert.equal(await anularPendiente(pedido), true);
    assert.equal(consentimientos[0].estado, 'anulado');
  });

  for (const estado of ['cerrado', 'anulado']) {
    it(`ya ${estado}: contesta sin error y no toca nada`, async () => {
      consentimientos = [unConsentimiento(estado)];
      const antes = structuredClone(consentimientos);
      assert.equal(await anularPendiente(pedido), false);
      assert.deepEqual(consentimientos, antes);
    });
  }

  it('de otra Prestadora: no lo toca', async () => {
    consentimientos = [{ ...unConsentimiento('pendiente_firma'), prestadora_id: PRESTADORA_AJENA }];
    await anularPendiente(pedido);
    assert.equal(consentimientos[0].estado, 'pendiente_firma');
  });
});
