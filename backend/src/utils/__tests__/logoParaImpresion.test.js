/**
 * Qué logo lleva un documento, y qué SVG se acepta como logo para impresión.
 *
 *   npm test --prefix backend
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { esUnSvgSinProgramas, logoParaDocumentos } from '../logoParaImpresion.js';

/** Una base de mentira: contesta la fila de `prestadoras` y firma enlaces temporales. */
function baseCon(prestadora, { enlace = 'https://firmado/logo' } = {}) {
  const pedidos = [];
  return {
    pedidos,
    from: () => ({ select: () => ({ maybeSingle: async () => ({ data: prestadora, error: null }) }) }),
    storage: {
      from: (deposito) => ({
        createSignedUrl: async (ruta) => {
          pedidos.push({ deposito, ruta });
          return { data: enlace ? { signedUrl: enlace } : null, error: null };
        },
      }),
    },
  };
}

describe('esUnSvgSinProgramas', () => {
  it('acepta un dibujo', () => {
    assert.equal(esUnSvgSinProgramas(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>')), true);
  });
  for (const [motivo, texto] of [
    ['un programa', '<svg><script>alert(1)</script></svg>'],
    ['un manejador de eventos', '<svg onload="alert(1)"></svg>'],
    ['un enlace a un programa', '<svg><a href="javascript:alert(1)">x</a></svg>'],
    ['contenido de otra clase', '<svg><foreignObject><p>x</p></foreignObject></svg>'],
    ['una entidad', '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>'],
    ['algo que no es un dibujo', '<html><body>hola</body></html>'],
  ]) {
    it(`rechaza ${motivo}`, () => assert.equal(esUnSvgSinProgramas(Buffer.from(texto)), false));
  }
});

describe('logoParaDocumentos', () => {
  it('usa el de impresión si está cargado, con enlace temporal', async () => {
    const db = baseCon({ logo_url: 'https://pub/logo.webp', logo_impresion_ruta: 'p1/logo.svg' });
    assert.deepEqual(await logoParaDocumentos(db), { url: 'https://firmado/logo', tipo: 'image/svg+xml' });
    assert.deepEqual(db.pedidos, [{ deposito: 'logos-para-impresion', ruta: 'p1/logo.svg' }]);
  });

  it('sin el de impresión, usa el de internet si es PNG', async () => {
    const db = baseCon({ logo_url: 'https://pub/logo.png?v=3', logo_impresion_ruta: null });
    assert.deepEqual(await logoParaDocumentos(db), { url: 'https://pub/logo.png?v=3', tipo: 'image/png' });
  });

  it('sin el de impresión, usa el de internet si es JPG', async () => {
    const db = baseCon({ logo_url: 'https://pub/logo.jpg', logo_impresion_ruta: null });
    assert.deepEqual(await logoParaDocumentos(db), { url: 'https://pub/logo.jpg', tipo: 'image/jpeg' });
  });

  it('si el de internet es WEBP, el documento va sin logo', async () => {
    const db = baseCon({ logo_url: 'https://pub/logo.webp', logo_impresion_ruta: null });
    assert.equal(await logoParaDocumentos(db), null);
  });

  it('sin ningún logo, el documento va sin logo', async () => {
    assert.equal(await logoParaDocumentos(baseCon({ logo_url: null, logo_impresion_ruta: null })), null);
  });

  it('sin Prestadora visible, el documento va sin logo', async () => {
    assert.equal(await logoParaDocumentos(baseCon(null)), null);
  });
});
