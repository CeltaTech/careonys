/**
 * Qué logo lleva un documento.
 *
 *   npm test --prefix backend
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { logoParaDocumentos } from '../logoParaImpresion.js';

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

describe('logoParaDocumentos', () => {
  it('usa el de impresión si está cargado, con enlace temporal', async () => {
    const db = baseCon({ logo_url: 'https://pub/logo.webp', logo_impresion_ruta: 'p1/logo.png' });
    assert.deepEqual(await logoParaDocumentos(db), { url: 'https://firmado/logo', tipo: 'image/png' });
    assert.deepEqual(db.pedidos, [{ deposito: 'logos-para-impresion', ruta: 'p1/logo.png' }]);
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
